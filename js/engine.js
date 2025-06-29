import { performance } from "./util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.loop_timeout = null;
    this.last_tick_time = null;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = 60000;
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

    if (reactor.has_melted_down) {
      return;
    }

    this.game.performance.markStart("tick_categorize_parts");
    const active_cells = [];
    const active_inlets = [];
    const active_exchangers = [];
    const active_outlets = [];
    const active_vessels = [];

    for (const tile of tileset.active_tiles_list) {
      if (!tile.activated || !tile.part) continue;
      const part = tile.part;
      const category = part.category;

      if (category === "cell" && tile.ticks > 0) {
        active_cells.push(tile);
      }

      if (category === "heat_inlet") {
        active_inlets.push(tile);
      } else if (category === "heat_exchanger") {
        active_exchangers.push(tile);
      } else if (category === "heat_outlet") {
        active_outlets.push(tile);
      }

      if (
        part.vent > 0 ||
        category === "particle_accelerator" ||
        part.containment > 0
      ) {
        active_vessels.push(tile);
      }
    }
    this.game.performance.markEnd("tick_categorize_parts");

    let power_add = 0;
    let heat_add = 0;

    this.game.performance.markStart("tick_cells");
    for (const tile of active_cells) {
      const part = tile.part;
      tile.power = part.power;
      tile.heat = part.heat;
      power_add += tile.power;
      heat_add += tile.heat;
      tile.ticks--;

      for (const neighbor of tile.containmentNeighborTiles) {
        const old_neighbor_heat = neighbor.heat_contained;
        const heat_per_neighbor =
          tile.heat / Math.max(tile.containmentNeighborTiles.length, 1);
        neighbor.heat_contained += heat_per_neighbor;
        if (old_neighbor_heat !== neighbor.heat_contained) {
          neighbor.updateVisualState();
        }
      }

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

    reactor.current_heat += heat_add;

    this.game.performance.markStart("tick_heat_transfer");

    for (const tile of active_inlets) {
      for (const neighbor of tile.containmentNeighborTiles) {
        const transfer_heat = Math.min(
          tile.getEffectiveTransferValue(),
          neighbor.heat_contained
        );
        const old_neighbor_heat = neighbor.heat_contained;
        neighbor.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
        if (old_neighbor_heat !== neighbor.heat_contained) {
          neighbor.updateVisualState();
        }
      }
    }

    for (const tile of active_exchangers) {
      tile.containmentNeighborTiles.forEach((neighbor) => {
        const diff = tile.heat_contained - neighbor.heat_contained;
        const heat_to_move = Math.min(
          tile.getEffectiveTransferValue(),
          Math.abs(diff) / 2
        );
        const old_tile_heat = tile.heat_contained;
        const old_neighbor_heat = neighbor.heat_contained;

        if (diff > 0) {
          tile.heat_contained -= heat_to_move;
          neighbor.heat_contained += heat_to_move;
        } else {
          tile.heat_contained += heat_to_move;
          neighbor.heat_contained -= heat_to_move;
        }
        if (old_tile_heat !== tile.heat_contained) {
          tile.updateVisualState();
        }
        if (old_neighbor_heat !== neighbor.heat_contained) {
          neighbor.updateVisualState();
        }
      });
    }

    for (const tile of active_outlets) {
      const neighbors = tile.containmentNeighborTiles;
      if (neighbors.length === 0) continue;

      const outlet_capacity =
        tile.getEffectiveTransferValue() * neighbors.length;
      let total_dispense = Math.min(outlet_capacity, reactor.current_heat);
      let i = 0;
      const neighbor_heat_changes = new Map();
      while (total_dispense > 0) {
        const neighbor = neighbors[i % neighbors.length];
        const neighbor_space =
          neighbor.part.containment - neighbor.heat_contained;
        let heat_per_neighbor = Math.min(
          total_dispense / neighbors.length,
          neighbor_space,
          tile.getEffectiveTransferValue()
        );

        if (reactor.heat_outlet_controlled && neighbor.part.vent) {
          heat_per_neighbor = Math.min(
            heat_per_neighbor,
            neighbor.part.vent - neighbor.heat_contained
          );
        }

        if (heat_per_neighbor > 0) {
          const old_heat = neighbor.heat_contained;
          neighbor.heat_contained += heat_per_neighbor;
          reactor.current_heat -= heat_per_neighbor;
          total_dispense -= heat_per_neighbor;
          if (!neighbor_heat_changes.has(neighbor)) {
            neighbor_heat_changes.set(neighbor, old_heat);
          }
        }
        i++;
        if (i > neighbors.length * 2 && total_dispense > 0) break;
      }
      for (const [neighbor, old_heat] of neighbor_heat_changes) {
        if (old_heat !== neighbor.heat_contained) {
          neighbor.updateVisualState();
        }
      }
    }
    this.game.performance.markEnd("tick_heat_transfer");

    this.game.performance.markStart("tick_vents");
    let ep_chance_add = 0;
    for (const tile of active_vessels) {
      const part = tile.part;

      if (part.vent > 0) {
        const vent_value = tile.getEffectiveVentValue();
        const old_heat = tile.heat_contained;
        if (tile.heat_contained > 0) {
          if (tile.heat_contained <= vent_value) {
            tile.heat_contained = 0;
          } else {
            tile.heat_contained -= vent_value;
          }
        }
        if (part.id === "vent6") reactor.current_power -= vent_value;
        if (old_heat !== tile.heat_contained) {
          tile.updateVisualState();
        }
      }

      if (part.category === "particle_accelerator" && tile.heat_contained > 0) {
        const lower_heat = Math.min(tile.heat_contained, part.ep_heat);
        ep_chance_add +=
          (Math.log(lower_heat) / Math.log(10)) * (lower_heat / part.ep_heat);
      }

      if (part.containment > 0 && tile.heat_contained > part.containment) {
        if (part.category === "particle_accelerator") {
          reactor.checkMeltdown();
          return;
        }
        this.handleComponentExplosion(tile);
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
    if (reactor.heat_power_multiplier > 0 && reactor.current_heat > 1000) {
      power_add *=
        1 +
        reactor.heat_power_multiplier *
          (Math.log(reactor.current_heat) / Math.log(1000) / 100);
    }

    // Apply global power multiplier
    power_add *= reactor.power_multiplier || 1;

    reactor.current_power += power_add;

    if (ui.stateManager.getVar("auto_sell")) {
      const sell_amount = Math.min(
        reactor.current_power,
        Math.floor(reactor.max_power * reactor.auto_sell_multiplier)
      );
      if (sell_amount > 0) {
        reactor.current_power -= sell_amount;
        this.game.current_money += sell_amount;
        ui.stateManager.setVar("current_money", this.game.current_money);
      }
    }

    if (reactor.current_power > reactor.max_power)
      reactor.current_power = reactor.max_power;

    if (reactor.current_heat > 0 && !reactor.heat_controlled) {
      const ventMultiplier = reactor.vent_multiplier || 1;
      reactor.current_heat -= (reactor.max_heat / 10000) * ventMultiplier;
    }
    if (reactor.current_heat < 0) reactor.current_heat = 0;

    ui.stateManager.setVar("current_power", reactor.current_power);
    ui.stateManager.setVar("current_heat", reactor.current_heat);
    this.game.performance.markEnd("tick_stats");

    const now = Date.now();
    if (now - this.last_session_update >= this.session_update_interval) {
      this.game.updateSessionTime();
      this.last_session_update = now;
    }

    if (reactor.checkMeltdown()) this.stop();

    this.game.performance.markEnd("tick_total");
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  handleComponentExplosion(tile) {
    if (tile.$el) {
      tile.$el.classList.add("exploding");
      setTimeout(() => {
        if (tile.$el) {
          tile.$el.classList.remove("exploding");
        }
      }, 600);
    }

    setTimeout(() => {
      this.handleComponentDepletion(tile);
    }, 100);
  }
}
