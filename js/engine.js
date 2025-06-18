import { performance } from "./util.js";

export class Engine {
  constructor(game) {
    this.game = game;
    this.loop_timeout = null;
    this.last_tick_time = null;
    this.dtime = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    if (!this.loop_timeout) {
      this.last_tick_time = performance.now();
      this.loop();
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    clearTimeout(this.loop_timeout);
    this.loop_timeout = null;
    this.last_tick_time = null;
  }

  loop() {
    if (!this.running || this.game.paused) {
      this.stop();
      return;
    }

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
          console.warn(
            `Capping offline ticks from ${ticks_to_process} to ${max_catch_up_ticks} to prevent freezing.`
          );
          ticks_to_process = max_catch_up_ticks;
        }

        for (let i = 0; i < ticks_to_process; i++) {
          this.tick();
        }
      } else {
        this.tick();
      }
      this.dtime -= ticks_to_process * tick_duration;
    }

    this.loop_timeout = setTimeout(() => this.loop(), tick_duration);
  }

  tick() {
    const reactor = this.game.reactor;
    const tileset = this.game.tileset;
    const ui = this.game.ui;

    if (reactor.has_melted_down) {
      return;
    }

    let power_add = 0;
    let heat_add = 0;

    // 1. Process cells and basic components
    for (const tile of tileset.active_tiles_list) {
      if (!tile.activated || !tile.part) continue;

      const part = tile.part;
      if (part.category === "cell" && tile.ticks > 0) {
        // Always update tile.power and tile.heat from part
        tile.power = part.power;
        tile.heat = part.heat;
        power_add += tile.power;
        heat_add += tile.heat;
        tile.ticks--;

        // Process reflector decay
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
      } else if (part.containment > 0) {
        tile.heat_contained += tile.heat; // Heat from adjacent pulsing cells
      }
    }

    reactor.current_heat += heat_add;

    // 2. Process heat transfer components
    const active_inlets = tileset.active_tiles_list.filter(
      (t) => t.activated && t.part?.category === "heat_inlet"
    );
    const active_exchangers = tileset.active_tiles_list.filter(
      (t) => t.activated && t.part?.category === "heat_exchanger"
    );
    const active_outlets = tileset.active_tiles_list.filter(
      (t) => t.activated && t.part?.category === "heat_outlet"
    );

    // Inlets
    for (const tile of active_inlets) {
      for (const neighbor of tile.containmentNeighborTiles) {
        const transfer_heat = Math.min(
          tile.getEffectiveTransferValue(),
          neighbor.heat_contained
        );
        neighbor.heat_contained -= transfer_heat;
        reactor.current_heat += transfer_heat;
      }
    }
    // Exchangers
    for (const tile of active_exchangers) {
      // Simplified balancing logic
      tile.containmentNeighborTiles.forEach((neighbor) => {
        const diff = tile.heat_contained - neighbor.heat_contained;
        const heat_to_move = Math.min(
          tile.getEffectiveTransferValue(),
          Math.abs(diff) / 2
        );
        if (diff > 0) {
          // tile is hotter
          tile.heat_contained -= heat_to_move;
          neighbor.heat_contained += heat_to_move;
        } else {
          // neighbor is hotter
          tile.heat_contained += heat_to_move;
          neighbor.heat_contained -= heat_to_move;
        }
      });
    }

    // Outlets
    for (const tile of active_outlets) {
      const neighbors = tile.containmentNeighborTiles;
      if (neighbors.length === 0) continue;
      let total_dispense = Math.min(
        tile.getEffectiveTransferValue() * neighbors.length,
        reactor.current_heat
      );
      let i = 0;
      while (total_dispense > 0) {
        const neighbor = neighbors[i % neighbors.length];
        let heat_per_neighbor = 1;
        if (reactor.heat_outlet_controlled && neighbor.part.vent) {
          heat_per_neighbor = Math.min(
            1,
            neighbor.part.vent - neighbor.heat_contained
          );
        }
        if (heat_per_neighbor > 0) {
          neighbor.heat_contained += heat_per_neighbor;
          reactor.current_heat -= heat_per_neighbor;
          total_dispense -= heat_per_neighbor;
        }
        i++;
        // Prevent infinite loop if all neighbors are full
        if (i > neighbors.length * 2 && total_dispense > 0) break;
      }
    }

    // 3. Process vents, EPs, and component failure
    let ep_chance_add = 0;
    for (const tile of tileset.active_tiles_list) {
      if (!tile.activated || !tile.part) continue;
      // Vents
      if (tile.part.vent > 0) {
        const vent_value = tile.getEffectiveVentValue();
        if (tile.heat_contained > 0) {
          if (tile.heat_contained <= vent_value) {
            tile.heat_contained = 0;
          } else {
            tile.heat_contained -= vent_value;
          }
        }
        if (tile.part.id === "vent6") reactor.current_power -= vent_value;
      }
      // Particle Accelerators
      if (
        tile.part.category === "particle_accelerator" &&
        tile.heat_contained > 0
      ) {
        const lower_heat = Math.min(tile.heat_contained, tile.part.ep_heat);
        ep_chance_add +=
          (Math.log(lower_heat) / Math.log(10)) *
          (lower_heat / tile.part.ep_heat);
      }
      // Check for containment failure
      if (
        tile.part.containment > 0 &&
        tile.heat_contained > tile.part.containment
      ) {
        if (tile.part.category === "particle_accelerator") {
          reactor.checkMeltdown();
          return;
        }
        this.handleComponentDepletion(tile);
      }
    }

    if (ep_chance_add > 0) {
      let ep_gain =
        Math.floor(ep_chance_add) + (Math.random() < ep_chance_add % 1 ? 1 : 0);
      if (ep_gain > 0) {
        this.game.exotic_particles += ep_gain;
        ui.stateManager.setVar("exotic_particles", this.game.exotic_particles);
      }
    }

    // 4. Update reactor-level stats
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

    if (reactor.checkMeltdown()) this.stop();
  }

  handleComponentDepletion(tile) {
    // Delegate the logic to the main game class
    this.game.handleComponentDepletion(tile);
  }
}
