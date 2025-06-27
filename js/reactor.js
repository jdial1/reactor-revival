export class Reactor {
  constructor(game) {
    "use strict";
    this.game = game;
    this.base_max_heat = 1000;
    this.base_max_power = 100;
    this.setDefaults();
  }

  setDefaults() {
    this.current_heat = 0;
    this.current_power = 0;
    this.max_heat = this.base_max_heat;
    this.altered_max_heat = this.base_max_heat;
    this.max_power = this.base_max_power;
    this.altered_max_power = this.base_max_power;

    this.auto_sell_multiplier = 0;
    this.heat_power_multiplier = 0;
    this.heat_controlled = false;
    this.heat_outlet_controlled = false;
    this.vent_capacitor_multiplier = 0;
    this.vent_plating_multiplier = 0;
    this.transfer_capacitor_multiplier = 0;
    this.transfer_plating_multiplier = 0;

    this.has_melted_down = false;
    this.game.sold_power = false;
    this.game.sold_heat = false;
  }

  updateStats() {
    this._resetStats();
    let current_max_power = this.altered_max_power || this.base_max_power;
    let current_max_heat = this.altered_max_heat || this.base_max_heat;
    let temp_transfer_multiplier = 0;
    let temp_vent_multiplier = 0;

    if (!this.game.tileset) return;

    // First pass: Initialize all tile stats
    this.game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.activated && tile.part) {
        this._resetTileStats(tile);
        this._gatherNeighbors(tile); // Still needed for cell power/heat initialization
      }
    });

    // Second pass: Calculate power and heat
    this.game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.activated && tile.part) {
        if (tile.part.category === "cell" && tile.ticks > 0) {
          this._applyReflectorEffects(tile);
          this.stats_power += tile.power || 0;
          this.stats_heat_generation += tile.heat || 0;
        }

        if (tile.part.reactor_power) {
          current_max_power += tile.part.reactor_power;
        }
        if (tile.part.reactor_heat) {
          current_max_heat += tile.part.reactor_heat;
        }
        if (tile.part.id === "reactor_plating6") {
          current_max_power += tile.part.reactor_heat;
        }

        if (tile.part.category === "capacitor") {
          temp_transfer_multiplier +=
            (tile.part.part.level || 1) * this.transfer_capacitor_multiplier;
          temp_vent_multiplier +=
            (tile.part.part.level || 1) * this.vent_capacitor_multiplier;
        } else if (tile.part.category === "reactor_plating") {
          temp_transfer_multiplier +=
            (tile.part.part.level || 1) * this.transfer_plating_multiplier;
          temp_vent_multiplier +=
            (tile.part.part.level || 1) * this.vent_plating_multiplier;
        }
      }
    });

    this.vent_multiplier_eff = temp_vent_multiplier;
    this.transfer_multiplier_eff = temp_transfer_multiplier;

    // Third pass: Calculate vent and transfer values
    this.game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.activated && tile.part) {
        if (tile.part.vent) {
          this.stats_vent += tile.getEffectiveVentValue();
        }
        if (tile.part.category === "heat_inlet") {
          this.stats_inlet +=
            tile.getEffectiveTransferValue() *
            tile.containmentNeighborTiles.length;
        }
        if (tile.part.category === "heat_outlet") {
          this.stats_outlet +=
            tile.getEffectiveTransferValue() *
            tile.containmentNeighborTiles.length;
        }
        tile.display_power = tile.power || 0;
        tile.display_heat = tile.heat || 0;
      }
    });

    // Ensure all values are numbers
    this.max_power = Number(current_max_power || this.base_max_power);
    this.max_heat = Number(current_max_heat || this.base_max_heat);
    this.stats_power = Number(this.stats_power || 0);
    this.stats_heat_generation = Number(this.stats_heat_generation || 0);
    this.stats_cash = this.max_power * this.auto_sell_multiplier;

    // Update UI state
    this.game.ui.stateManager.setVar("max_power", this.max_power);
    this.game.ui.stateManager.setVar("max_heat", this.max_heat);
    this.game.ui.stateManager.setVar("stats_power", this.stats_power);
    this.game.ui.stateManager.setVar("total_heat", this.stats_heat_generation);
    this.game.ui.stateManager.setVar("stats_vent", this.stats_vent);
    this.game.ui.stateManager.setVar("stats_inlet", this.stats_inlet);
    this.game.ui.stateManager.setVar("stats_outlet", this.stats_outlet);
    this.game.ui.stateManager.setVar("stats_cash", this.stats_cash);
    this.game.ui.stateManager.setVar("current_power", this.current_power);
    this.game.ui.stateManager.setVar("current_heat", this.current_heat);
  }

  _resetStats() {
    this.stats_power = 0;
    this.stats_heat_generation = 0;
    this.stats_vent = 0;
    this.stats_inlet = 0;
    this.stats_outlet = 0;
  }

  _resetTileStats(tile) {
    tile.powerOutput = 0;
    tile.heatOutput = 0;
    tile.display_power = 0;
    tile.display_heat = 0;
    // Neighbor arrays are now handled by getters, don't reset them
  }

  _gatherNeighbors(tile) {
    // This method is now simplified - neighbor gathering is handled by tile getters
    const p = tile.part;
    if (p.category === "cell" && tile.ticks > 0) {
      tile.power = p.power;
      tile.heat = p.heat;
    }
  }

  _applyReflectorEffects(tile) {
    let reflector_power_bonus = 0;
    let reflector_heat_bonus = 0;
    tile.reflectorNeighborTiles.forEach((r_tile) => {
      if (r_tile.ticks > 0) {
        reflector_power_bonus += r_tile.part.power_increase || 0;
        reflector_heat_bonus += r_tile.part.heat_increase || 0;
      }
    });
    tile.power *= 1 + reflector_power_bonus / 100;
    tile.heat *= 1 + reflector_heat_bonus / 100;
  }

  manualReduceHeat() {
    if (this.current_heat > 0) {
      this.current_heat -=
        this.manual_heat_reduce || this.game.base_manual_heat_reduce || 1;
      if (this.current_heat < 0) this.current_heat = 0;
      if (this.current_heat === 0) this.game.sold_heat = true;
      this.game.ui.stateManager.setVar("current_heat", this.current_heat);
    }
  }

  sellPower() {
    if (this.current_power > 0) {
      this.game.addMoney(this.current_power);
      this.current_power = 0;
      this.game.ui.stateManager.setVar("current_power", this.current_power);
      this.game.sold_power = true;
    }
  }

  checkMeltdown() {
    if (this.current_heat > 2 * this.max_heat) {
      this.has_melted_down = true;

      // Hide any active tooltips before clearing parts
      if (this.game.tooltip_manager) {
        this.game.tooltip_manager.hide();
      }

      this.game.tileset.active_tiles_list.forEach((tile) => {
        if (tile.part) {
          if (tile.$el) tile.$el.classList.add("exploding");
          tile.clearPart(false);
        }
      });
      this.current_heat = this.max_heat * 2 + 1;
      this.game.ui.stateManager.setVar("melting_down", true, true);

      // Update UI to show meltdown state
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.add("reactor-meltdown");
      }

      // Use the router instance from the game object
      if (this.game.router) {
        this.game.router.loadPage("experimental_upgrades_section", true);
      }

      return true;
    }
    return false;
  }

  clearMeltdownState() {
    this.has_melted_down = false;
    this.game.ui.stateManager.setVar("melting_down", false, true);
    document.body.classList.remove("reactor-meltdown");
  }
}
