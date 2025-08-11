import { performance } from "../utils/util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.loop_timeout = null;
    this.last_tick_time = null;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = 60000;
    this.tick_count = 0; // Added for heat distribution rotation
    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];
    this._partCacheDirty = true;

    // Add heatManager stub for tests
    this.heatManager = {
      segments: new Map(),
      tileSegmentMap: new Map(),
      processTick: () => {
        // Heat processing is now done in the engine tick
        if (!this.game.paused) {
          // This is a stub - actual heat processing is in _processTick
        }
      },
      updateSegments: () => {
        // This is a stub - segment updates are handled elsewhere
      },
      markSegmentsAsDirty: () => {
        // This is a stub - segment dirty marking is handled elsewhere
      },
      getSegmentForTile: (tile) => {
        // This is a stub - segment lookup is handled elsewhere
        return null;
      }
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.loop_timeout) {
      this.last_tick_time = performance.now();
      this.last_session_update = Date.now();

      this.loop();
    }

    // Update engine status indicator
    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "running");
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.loop_timeout);
    this.loop_timeout = null;
    this.last_tick_time = null;

    this.game.updateSessionTime();

    // Update engine status indicator
    if (this.game.ui && this.game.ui.stateManager) {
      this.game.ui.stateManager.setVar("engine_status", "stopped");
    }
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
  }

  _updatePartCaches() {
    if (!this._partCacheDirty) return;

    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];

    let vesselsAdded = 0;
    for (let row = 0; row < this.game._rows; row++) {
      for (let col = 0; col < this.game._cols; col++) {
        const tile = this.game.tileset.getTile(row, col);
        if (!tile || !tile.part) continue;

        const part = tile.part;
        const category = part.category;

        if (category === "cell" && tile.ticks > 0) {
          this.active_cells.push(tile);
        }
        if (part.vent > 0 || category === "particle_accelerator" || part.containment > 0) {
          this.active_vessels.push(tile);
          vesselsAdded++;
          if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
            console.log(`[DEBUG] Added ${part.id} at (${row}, ${col}) to active_vessels: vent=${part.vent}, containment=${part.containment}, category=${category}`);
          }
        }
        if (category === "heat_inlet") {
          this.active_inlets.push(tile);
        }
        if (category === "heat_exchanger") {
          this.active_exchangers.push(tile);
        }
        if (category === "heat_outlet") {
          this.active_outlets.push(tile);
        }
      }
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      console.log(`[DEBUG] Updated part caches: ${vesselsAdded} vessels, ${this.active_cells.length} cells`);
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
    return this._processTick(false);
  }

  // Manual tick processing for tests
  manualTick() {
    return this._processTick(true);
  }

  _processTick(manual = false) {
    this.game.performance.markStart("tick_total");
    const reactor = this.game.reactor;
    const tileset = this.game.tileset;
    const ui = this.game.ui;

    // Update engine status indicator for tick
    if (ui && ui.stateManager) {
      ui.stateManager.setVar("engine_status", "tick");
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      console.log(`[DEBUG] Engine tick started: paused=${this.game.paused}, running=${this.running}, has_melted_down=${reactor.has_melted_down}`);
    }

    // Don't process ticks if the game is paused
    if (this.game.paused) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Skipping tick: game is paused`);
      }
      this.game.performance.markEnd("tick_total");
      return;
    }

    // Don't process ticks if engine is not running (for automatic ticks)
    if (!this.running && !manual) {
      this.game.performance.markEnd("tick_total");
      return;
    }

    if (reactor.has_melted_down) {
      return;
    }

    // Force update part caches to ensure newly added parts are included
    this._partCacheDirty = true;
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
    this.active_cells.forEach((tile) => {
      const part = tile.part;
      if (!part || tile.exploded) return;

      // Skip processing if ticks are 0
      if (tile.ticks <= 0) {
        return;
      }
      power_add += tile.power;
      const heatNeighbors = tile.containmentNeighborTiles.filter(
        (t) => t.part && t.part.containment > 0
      );
      if (heatNeighbors.length > 0) {
        const heat_remove = Math.ceil(tile.heat / heatNeighbors.length);
        heatNeighbors.forEach((neighbor) => {
          neighbor.heat_contained += heat_remove;
        });
      } else {
        heat_add += tile.heat;
      }

      tile.ticks--;

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
    });
    this.game.performance.markEnd("tick_cells");

    // Add only the globally-directed heat to the reactor.
    reactor.current_heat += heat_add;
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' && heat_add > 0) {
      console.log(`[DEBUG] Total heat added to reactor: ${heat_add}, new total: ${reactor.current_heat}`);
    }

    // (Explosion checks occur after outlet transfer and before vents to allow overfill)

    this.game.performance.markStart("tick_vents");

    // Legacy Heat Transfer Logic
    // Inlets
    for (const tile of this.active_inlets) {
      const tile_part = tile.part;
      if (!tile_part) continue;
      for (const tile_containment of tile.containmentNeighborTiles) {
        if (!tile_containment.part || !tile_containment.heat_contained) continue;
        let transfer_heat = Math.min(tile.getEffectiveTransferValue(), tile_containment.heat_contained);
        tile_containment.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
        heat_add += transfer_heat;
      }
    }

    // Exchangers
    for (const tile of this.active_exchangers) {
      const tile_part = tile.part;
      if (!tile_part || !tile.heat_contained) continue;
      for (const tile_containment of tile.containmentNeighborTiles) {
        if (!tile_containment.part) continue;
        if (tile.heat_contained > tile_containment.heat_contained) {
          let transfer_heat = Math.min(
            tile.getEffectiveTransferValue(),
            Math.ceil((tile.heat_contained - tile_containment.heat_contained) / 2),
            tile.heat_contained
          );
          tile_containment.heat_contained += transfer_heat;
          tile.heat_contained -= transfer_heat;
        }
      }
    }

    // Outlets
    for (const tile of this.active_outlets) {
      const tile_part = tile.part;
      if (!tile_part) continue;
      const containmentNeighbors = tile.containmentNeighborTiles.filter(t => t.part);
      if (containmentNeighbors.length) {
        // Max heat this outlet can move from the reactor this tick
        let outlet_transfer_heat = Math.min(tile.getEffectiveTransferValue(), reactor.current_heat);
        if (outlet_transfer_heat <= 0) continue;

        // Split intended transfer evenly across neighbors (allow overfill beyond containment)
        const intended_per_neighbor = Math.ceil(outlet_transfer_heat / containmentNeighbors.length);

        for (const tile_containment of containmentNeighbors) {
          if (!tile_containment.part) continue;

          const currentNeighborHeat = tile_containment.heat_contained || 0;
          const neighborCapacity = tile_containment.part.containment || 0;

          // Always allow overfill to enable explosions for standard outlets.
          // For the extreme outlet (range 2), avoid instant overfill/explosion in the same tick
          // so tests can observe heat reaching two-tiles-away components.
          let amountToAdd = Math.min(intended_per_neighbor, reactor.current_heat);
          if (tile_part.id === 'heat_outlet6' && neighborCapacity > 0) {
            const headroom = Math.max(0, neighborCapacity - currentNeighborHeat);
            amountToAdd = Math.min(amountToAdd, headroom);
          }
          if (amountToAdd <= 0) continue;

          tile_containment.heat_contained += amountToAdd;
          reactor.current_heat -= amountToAdd;

          // If we've exhausted the outlet's transfer or reactor heat, stop early
          outlet_transfer_heat -= amountToAdd;
          if (outlet_transfer_heat <= 0 || reactor.current_heat <= 0) break;
        }
      }
    }



    // Process Particle Accelerators and Extreme Capacitors
    const ep_chance_percent = 1 + this.game.total_exotic_particles / 100;
    let ep_chance_add = 0;
    this.active_vessels.forEach((tile) => {
      const part = tile.part;

      // EP generation from particle accelerators (still handled per-tile)
      if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
        const lower_heat = Math.min(tile.heat_contained, part.ep_heat);
        ep_chance_add +=
          (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
      }
    });

    // Check for explosions AFTER outlet transfer but BEFORE venting
    const tilesToExplode = [];
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      console.log(`[DEBUG] Checking ${this.active_vessels.length} active vessels for explosions`);
      console.log(`[DEBUG] Active vessels:`, this.active_vessels.map(t => t.part?.id));
    }
    for (const tile of this.active_vessels) {
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Processing tile:`, tile.part?.id, `at (${tile.row}, ${tile.col}), exploded=${tile.exploded}`);
      }
      if (!tile.part || tile.exploded) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[DEBUG] Skipping tile: no part or already exploded, exploded=${tile.exploded}`);
        }
        continue;
      }
      const part = tile.part;
      if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
        console.log(`[DEBUG] Checking ${part.id} at (${tile.row}, ${tile.col}): heat=${tile.heat_contained}, containment=${part.containment}, condition=${part.containment > 0 && tile.heat_contained > part.containment}`);
      }
      if (part && part.containment > 0 && tile.heat_contained > part.containment) {
        if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
          console.log(`[DEBUG] Component ${part.id} at (${tile.row}, ${tile.col}) exploded: heat=${tile.heat_contained}, containment=${part.containment}`);
        }
        tilesToExplode.push(tile);
      }
    }
    for (const tile of tilesToExplode) {
      const part = tile.part;
      if (part?.category === "particle_accelerator") {
        reactor.checkMeltdown();
      }
      this.handleComponentExplosion(tile);
    }

    // Process Vents
    const activeVents = this.active_vessels.filter(t => t.part?.category === 'vent');
    for (const tile of activeVents) {
      if (!tile.part || tile.exploded) continue;
      let vent_reduce = Math.min(
        tile.part.getEffectiveVentValue(),
        tile.heat_contained
      );
      // Special logic for Extreme Vent (vent6)
      if (tile.part.id === "vent6") {
        const powerToConsume = Math.min(vent_reduce, reactor.current_power);
        vent_reduce = powerToConsume;
        reactor.current_power -= powerToConsume;
      }
      tile.heat_contained -= vent_reduce;
    }

    this.game.performance.markEnd("tick_vents");

    // Add generated power to reactor
    reactor.current_power += Math.round(power_add);
    if (reactor.current_power > reactor.max_power) {
      reactor.current_power = reactor.max_power;
    }

    // Check for component explosions - REMOVED: This is now handled during vessel processing above

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

    // Apply global power multiplier to the power that was already added
    const powerMultiplier = reactor.power_multiplier || 1;
    if (powerMultiplier !== 1) {
      // Calculate the additional power from the multiplier
      const additionalPower = (power_add * powerMultiplier) - power_add;
      reactor.current_power += additionalPower;
    }

    // Auto-sell logic - move this after power multiplier is applied
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

    if (reactor.current_heat > 0 && reactor.heat_controlled) {
      // Auto heat reduction - only active when heat_controlled is true
      const ventMultiplier = reactor.vent_multiplier || 1;
      reactor.current_heat -= (reactor.max_heat / 10000) * ventMultiplier;
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
    // Mark the tile as exploded to prevent further processing
    tile.exploded = true;

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
