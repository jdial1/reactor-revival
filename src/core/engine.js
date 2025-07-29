import { performance } from "../utils/util.js";
import { HeatManager } from "./heatManager.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.heatManager = new HeatManager(game);
    this.loop_timeout = null;
    this.last_tick_time = null;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = 60000;
    this.tick_count = 0; // Added for heat distribution rotation
    this.active_cells = [];
    this.active_vessels = [];
    this._partCacheDirty = true;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.loop_timeout) {
      this.last_tick_time = performance.now();
      this.last_session_update = Date.now();

      this.loop();
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.loop_timeout);
    this.loop_timeout = null;
    this.last_tick_time = null;

    this.game.updateSessionTime();
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
  }

  _updatePartCaches() {
    if (!this._partCacheDirty) return;

    this.active_cells = [];
    this.active_vessels = [];

    for (const tile of this.game.tileset.active_tiles_list) {
      if (!tile.activated || !tile.part) continue;
      const part = tile.part;
      const category = part.category;

      if (category === "cell" && tile.ticks > 0) {
        this.active_cells.push(tile);
      }
      if (part.vent > 0 || category === "particle_accelerator" || part.containment > 0) {
        this.active_vessels.push(tile);
      }
    }
    this._partCacheDirty = false;
  }

  loop() {
    if (!this.running || this.game.paused) {
      this.stop();
      return;
    }

    this.game.performance.markStart("engine_loop");

    const chronometerUpgrade = this.game.upgradeset.getUpgrade("chronometer");
    const tick_duration =
      this.game.loop_wait / (chronometerUpgrade?.level + 1 || 1);

    const now = performance.now();
    if (this.last_tick_time) {
      this.dtime += now - this.last_tick_time;
    }

    this.last_tick_time = now;

    let ticks_to_process = Math.floor(this.dtime / tick_duration);

    if (ticks_to_process > 0) {
      const time_flux_enabled = this.game.ui.stateManager.getVar("time_flux");
      if (time_flux_enabled && ticks_to_process > 1) {
        const max_catch_up_ticks = 1000;
        if (ticks_to_process > max_catch_up_ticks) {
          ticks_to_process = max_catch_up_ticks;
        }

        this.game.performance.markStart("batch_ticks");
        for (let i = 0; i < ticks_to_process; i++) {
          this.tick();
        }
        this.game.performance.markEnd("batch_ticks");
      } else {
        this.tick();
      }
      this.dtime -= ticks_to_process * tick_duration;
    }

    this.game.performance.markEnd("engine_loop");

    this.loop_timeout = setTimeout(() => this.loop(), tick_duration);
  }

  tick() {
    this.game.performance.markStart("tick_total");
    const reactor = this.game.reactor;
    const tileset = this.game.tileset;
    const ui = this.game.ui;

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      console.log(`[DEBUG] Engine tick started: paused=${this.game.paused}, running=${this.running}, has_melted_down=${reactor.has_melted_down}`);
    }

    // Don't process ticks if the game is paused or engine is not running
    if (this.game.paused || !this.running) {
      this.game.performance.markEnd("tick_total");
      return;
    }

    if (reactor.has_melted_down) {
      return;
    }

    this._updatePartCaches(); // Add this call at the beginning of the tick

    this.game.performance.markStart("tick_categorize_parts");
    // The loop below is now handled by _updatePartCaches()
    // so we can remove it to avoid redundant work.
    const active_cells = this.active_cells;
    const active_vessels = this.active_vessels;
    this.game.performance.markEnd("tick_categorize_parts");

    let power_add = 0;
    let heat_add = 0; // Re-introduced for globally added heat

    this.game.performance.markStart("tick_cells");
    for (const tile of active_cells) {
      const part = tile.part;
      tile.power = tile.power || part.power;
      tile.heat = tile.heat || part.heat;
      power_add += tile.power;

      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Cell ${part.id} at (${tile.row}, ${tile.col}): power=${tile.power}, heat=${tile.heat}, ticks=${tile.ticks}, activated=${tile.activated}`);
      }

      // Debug logging for heat generation
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Cell ${part.id} at (${tile.row}, ${tile.col}): power=${tile.power}, heat=${tile.heat}, ticks=${tile.ticks}`);
      }

      // Find adjacent heat-handling neighbors
      const heatNeighbors = [];
      for (const neighbor of tileset.getTilesInRange(tile, 1)) {
        if (neighbor && neighbor.part && neighbor.activated) {
          const p = neighbor.part;
          // Check if the neighbor is a valid heat-handling component
          // Include heat exchangers, heat inlets, and components with containment
          if (p.category === 'heat_inlet' ||
            p.category === 'heat_exchanger' ||
            (p.containment && p.containment > 0)) {
            heatNeighbors.push(neighbor);
          }
        }
      }

      // Distribute heat to neighbors if any exist, otherwise add to reactor
      if (heatNeighbors.length > 0) {
        // Distribute the cell's heat evenly among its neighbors
        const heatPerNeighbor = tile.heat / heatNeighbors.length;
        for (const neighbor of heatNeighbors) {
          neighbor.heat_contained = (neighbor.heat_contained || 0) + heatPerNeighbor;
        }
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[DEBUG] Distributed ${tile.heat} heat to ${heatNeighbors.length} neighbors`);
        }
      } else {
        // Only add heat to the reactor if there are no neighbors to take it
        heat_add += tile.heat;
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[DEBUG] Added ${tile.heat} heat to reactor (no neighbors)`);
        }
      }

      tile.ticks--;

      // OLD HEAT DISTRIBUTION SYSTEM - DISABLED
      // Heat distribution is now handled by the segment-based HeatManager
      // for (const neighbor of tile.containmentNeighborTiles) {
      //   const old_neighbor_heat = neighbor.heat_contained;
      //   const heat_per_neighbor =
      //     tile.heat / Math.max(tile.containmentNeighborTiles.length, 1);
      //   neighbor.heat_contained += heat_per_neighbor;
      //   if (old_neighbor_heat !== neighbor.heat_contained) {
      //     neighbor.updateVisualState();
      //   }
      // }

      for (const r_tile of tile.reflectorNeighborTiles) {
        if (r_tile.ticks > 0) {
          r_tile.ticks--;
          if (r_tile.ticks === 0) this.handleComponentDepletion(r_tile);
        }
      }

      if (tile.ticks === 0) {
        if (part.type === "protium") {
          this.game.protium_particles += part.cell_count;
          this.game.update_cell_power();
        }
        this.handleComponentDepletion(tile);
      }
    }
    this.game.performance.markEnd("tick_cells");

    // Add only the globally-directed heat to the reactor.
    reactor.current_heat += heat_add;
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' && heat_add > 0) {
      console.log(`[DEBUG] Total heat added to reactor: ${heat_add}, new total: ${reactor.current_heat}`);
    }

    this.game.performance.markStart("tick_heat_transfer");
    // NEW: Use segment-based heat transfer instead of complex neighbor-to-neighbor logic
    this.heatManager.processTick();
    this.game.performance.markEnd("tick_heat_transfer");

    this.game.performance.markStart("tick_vents");
    let ep_chance_add = 0;
    for (const tile of active_vessels) {
      const part = tile.part;

      // EP generation from particle accelerators (still handled per-tile)
      if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
        const lower_heat = Math.min(tile.heat_contained, part.ep_heat);
        ep_chance_add +=
          (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
      }
    }
    this.game.performance.markEnd("tick_vents");

    if (ep_chance_add > 0) {
      let ep_gain =
        Math.floor(ep_chance_add) + (Math.random() < ep_chance_add % 1 ? 1 : 0);
      if (ep_gain > 0) {
        this.game.exotic_particles += ep_gain;
        ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
      }
    }

    this.game.performance.markStart("tick_stats");
    // Forceful Fusion is now handled in reactor.updateStats()

    // Update reactor stats to ensure max_power and other values are current
    reactor.updateStats();

    // Apply global power multiplier
    power_add *= reactor.power_multiplier || 1;

    reactor.current_power += power_add;

    // Auto-sell logic - move this after power is added but before max power check
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      console.log(`[DEBUG] Auto-sell check: auto_sell=${ui.stateManager.getVar("auto_sell")}, current_power=${reactor.current_power}`);
    }
    if (ui.stateManager.getVar("auto_sell")) {
      const sell_amount = Math.min(
        reactor.current_power,
        Math.floor(reactor.max_power * reactor.auto_sell_multiplier)
      );
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Auto-sell calculation: current_power=${reactor.current_power}, max_power=${reactor.max_power}, multiplier=${reactor.auto_sell_multiplier}, sell_amount=${sell_amount}`);
      }
      if (sell_amount > 0) {
        const powerBeforeSell = reactor.current_power;
        reactor.current_power -= sell_amount;
        this.game.current_money += sell_amount;
        ui.stateManager.setVar("current_money", this.game.current_money);
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[DEBUG] Auto-sell executed: power_before=${powerBeforeSell}, sell_amount=${sell_amount}, power_after=${reactor.current_power}`);
        }
      }
    }

    if (reactor.current_power > reactor.max_power)
      reactor.current_power = reactor.max_power;

    if (reactor.current_heat > 0 && !reactor.heat_controlled) {
      // Check if there are any heat outlets - if so, disable automatic venting
      // since the heat transfer system should handle heat distribution
      const hasHeatOutlets = this.game.tileset.active_tiles_list.some(tile =>
        tile.activated && tile.part && tile.part.category === 'heat_outlet'
      );

      if (!hasHeatOutlets) {
        const ventMultiplier = reactor.vent_multiplier || 1;
        reactor.current_heat -= (reactor.max_heat / 10000) * ventMultiplier;
      }
    }
    if (reactor.current_heat < 0) reactor.current_heat = 0;

    ui.stateManager.setVar("current_power", reactor.current_power);
    ui.stateManager.setVar("current_heat", reactor.current_heat);

    // Update heat visuals for immediate visual feedback
    if (ui.updateHeatVisuals) {
      ui.updateHeatVisuals();
    }

    this.game.performance.markEnd("tick_stats");

    const now = Date.now();
    if (now - this.last_session_update >= this.session_update_interval) {
      this.game.updateSessionTime();
      this.last_session_update = now;
    }

    if (reactor.checkMeltdown()) this.stop();

    this.game.performance.markEnd("tick_total");
    this.tick_count = (this.tick_count || 0) + 1; // Increment tick_count at the end of each tick
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  handleComponentExplosion(tile) {
    // Add the component's heat to the reactor before it's cleared
    if (tile && tile.heat_contained > 0) {
      this.game.reactor.current_heat += tile.heat_contained;
    }

    if (tile.$el) {
      // Add the class to trigger the CSS animation
      tile.$el.classList.add("exploding");

      // Set a timeout to clean up after the animation finishes
      // The duration (600ms) should match the animation duration in your CSS
      setTimeout(() => {
        this.handleComponentDepletion(tile);
        // It's good practice to remove the class after the animation
        if (tile.$el) {
          tile.$el.classList.remove("exploding");
        }
      }, 600);
    } else {
      // If there's no element, just deplete it immediately
      this.handleComponentDepletion(tile);
    }
  }
}
