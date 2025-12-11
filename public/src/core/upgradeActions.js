function updateAllPartStats(game, partType) {
  "use strict";
  // First, update the templates in the partset
  // Update base part (without number)
  const basePart = game.partset.getPartById(partType);
  if (basePart) {
    basePart.recalculate_stats();
  }
  // Update numbered parts
  for (let i = 1; i <= 6; i++) {
    const part = game.partset.getPartById(`${partType}${i}`);
    if (part) {
      part.recalculate_stats();
    }
  }
  // Then, update the instances on the grid
  game.tileset.tiles_list.forEach(tile => {
    if (tile.part && tile.part.category === partType) {
      game.logger?.debug(`Updating part ${tile.part.id} (category: ${tile.part.category}) on tile (${tile.row}, ${tile.col})`);
      tile.part.recalculate_stats();
    }
  });
}

const actions = {
  // Core Game Mechanics
  chronometer: (upgrade, game) => {
    // The description implies halving the time
    game.loop_wait = game.base_loop_wait / (1 + upgrade.level);
    game.ui.stateManager.setVar("loop_wait", game.loop_wait);
  },
  forceful_fusion: (upgrade, game) => {
    game.reactor.heat_power_multiplier = upgrade.level;
    game.reactor.updateStats();
  },
  heat_control_operator: (upgrade, game) => {
    const isEnabled = upgrade.level > 0;
    game.reactor.heat_controlled = isEnabled;
    game.ui.stateManager.setVar("heat_control", isEnabled);
  },
  heat_outlet_control_operator: (upgrade, game) => {
    game.reactor.heat_outlet_controlled = upgrade.level > 0;
  },
  expand_reactor_rows: (upgrade, game) => {
    game.rows = game.base_rows + upgrade.level;
    if (
      game.ui &&
      typeof window !== "undefined" &&
      window.innerWidth &&
      window.innerWidth <= 900
    ) {
      setTimeout(() => {
        game.ui.resizeReactor();
      }, 50);
    }
  },
  expand_reactor_cols: (upgrade, game) => {
    game.cols = game.base_cols + upgrade.level;
    if (
      game.ui &&
      typeof window !== "undefined" &&
      window.innerWidth &&
      window.innerWidth <= 900
    ) {
      setTimeout(() => {
        game.ui.resizeReactor();
      }, 50);
    }
  },
  improved_piping: (upgrade, game) => {
    game.reactor.manual_heat_reduce =
      game.base_manual_heat_reduce * Math.pow(10, upgrade.level);
    game.ui.stateManager.setVar(
      "manual_heat_reduce",
      game.reactor.manual_heat_reduce,
      true
    );
  },
  improved_alloys: (upgrade, game) => {
    updateAllPartStats(game, "reactor_plating");
  },
  improved_power_lines: (upgrade, game) => {
    game.reactor.auto_sell_multiplier = 0.01 * upgrade.level;
    game.reactor.updateStats();
  },
  improved_wiring: (upgrade, game) => {
    updateAllPartStats(game, "capacitor");
  },
  improved_coolant_cells: (upgrade, game) => {
    updateAllPartStats(game, "coolant_cell");
  },
  improved_reflector_density: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_neutron_reflection: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_heat_exchangers: (upgrade, game) => {
    ["heat_inlet", "heat_outlet", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  improved_heat_vents: (upgrade, game) => {
    game.logger?.debug(`improved_heat_vents upgrade action called with level ${upgrade.level}`);
    updateAllPartStats(game, "vent");
  },

  perpetual_capacitors: (upgrade, game) => {
    game.reactor.perpetual_capacitors = upgrade.level > 0;
  },
  perpetual_reflectors: (upgrade, game) => {
    game.reactor.perpetual_reflectors = upgrade.level > 0;
    for (let i = 1; i <= 6; i++) {
      const part = game.partset.getPartById(`reflector${i}`);
      if (part) {
        part.perpetual = !!upgrade.level;
        part.recalculate_stats();
      }
    }
  },
  reinforced_heat_exchangers: (upgrade, game) => {
    game.reactor.transfer_plating_multiplier = upgrade.level;
  },
  active_exchangers: (upgrade, game) => {
    game.reactor.transfer_capacitor_multiplier = upgrade.level;
  },
  improved_heatsinks: (upgrade, game) => {
    game.reactor.vent_plating_multiplier = upgrade.level;
  },
  active_venting: (upgrade, game) => {
    game.reactor.updateStats();
  },

  stirling_generators: (upgrade, game) => {
    game.reactor.stirling_multiplier = upgrade.level * 0.01;
  },

  market_lobbying: (upgrade, game) => {
    game.reactor.sell_price_multiplier = 1 + (upgrade.level * 0.1);
  },

  emergency_coolant: (upgrade, game) => {
    game.reactor.manual_vent_percent = upgrade.level * 0.005;
  },

  component_reinforcement: (upgrade, game) => {
    game.partset.partsArray.forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part) tile.part.recalculate_stats();
    });
  },

  isotope_stabilization: (upgrade, game) => {
    game.partset.getPartsByCategory("cell").forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "cell") {
        tile.part.recalculate_stats();
      }
    });
  },

  reflector_cooling: (upgrade, game) => {
    game.reactor.reflector_cooling_factor = upgrade.level * 0.02;
    game.reactor.updateStats();
  },

  quantum_tunneling: (upgrade, game) => {
    ["heat_inlet", "heat_outlet"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
    game.tileset.tiles_list.forEach(tile => tile.invalidateNeighborCaches());
  },

  reactor_insurance: (upgrade, game) => {
    game.reactor.insurance_percentage = upgrade.level * 0.10;
  },

  manual_override: (upgrade, game) => {
    game.reactor.manual_override_mult = upgrade.level * 0.10;
  },

  convective_airflow: (upgrade, game) => {
    game.reactor.convective_boost = upgrade.level * 0.10;
  },

  electro_thermal_conversion: (upgrade, game) => {
    game.reactor.power_to_heat_ratio = 2 + ((upgrade.level - 1) * 0.5);
  },

  sub_atomic_catalysts: (upgrade, game) => {
    game.reactor.catalyst_reduction = upgrade.level * 0.05;
    updateAllPartStats(game, "particle_accelerator");
  },

  flux_accumulators: (upgrade, game) => {
    game.reactor.flux_accumulator_level = upgrade.level;
  },

  thermal_feedback: (upgrade, game) => {
    game.reactor.thermal_feedback_rate = upgrade.level * 0.1;
  },

  autonomic_repair: (upgrade, game) => {
    game.reactor.auto_repair_rate = upgrade.level;
  },

  volatile_tuning: (upgrade, game) => {
    game.reactor.volatile_tuning_max = upgrade.level * 0.05;
  },

  ceramic_composite: (upgrade, game) => {
    game.reactor.plating_transfer_rate = upgrade.level * 0.05;
    updateAllPartStats(game, "reactor_plating");
    game.tileset.tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "reactor_plating") {
        tile.part.recalculate_stats();
      }
    });
    if (game.engine) {
      game.engine.markPartCacheAsDirty();
    }
  },

  explosive_decompression: (upgrade, game) => {
    game.reactor.decompression_enabled = upgrade.level > 0;
  },

  // Experimental Upgrades
  laboratory: (upgrade, game) => {
  },
  infused_cells: (upgrade, game) => {
    game.update_cell_power();
  },
  unleashed_cells: (upgrade, game) => {
    game.update_cell_power();
  },
  protium_cells: (upgrade, game) => {
  },
  unstable_protium: (upgrade, game) => {
    game.update_cell_power();
  },
  quantum_buffering: (upgrade, game) => {
    updateAllPartStats(game, "capacitor");
    updateAllPartStats(game, "reactor_plating");
  },
  full_spectrum_reflectors: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  fluid_hyperdynamics: (upgrade, game) => {
    ["heat_inlet", "heat_outlet", "heat_exchanger", "vent"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  fractal_piping: (upgrade, game) => {
    ["vent", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  vortex_cooling: (upgrade, game) => {
    ["vent", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  ultracryonics: (upgrade, game) => {
    updateAllPartStats(game, "coolant_cell");
  },
  phlembotinum_core: (upgrade, game) => {
    game.reactor.base_max_power =
      100 * Math.pow(4, upgrade.level);
    game.reactor.base_max_heat =
      1000 * Math.pow(4, upgrade.level);
    // Ensure altered stats track the new base so updateStats applies the boost
    game.reactor.altered_max_power = game.reactor.base_max_power;
    game.reactor.altered_max_heat = game.reactor.base_max_heat;
    game.reactor.updateStats();
  },

  // Cell-specific Upgrades
  cell_power: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    game.update_cell_power();
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_tick: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_perpetual: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.perpetual = !!upgrade.level;
      part.recalculate_stats();
    }
  },


  improved_particle_accelerators: (upgrade, game) => {
    const partLevel = upgrade.upgrade.part_level;
    const partToUpdate = game.partset.getPartById(
      "particle_accelerator" + partLevel
    );
    if (partToUpdate) {
      partToUpdate.recalculate_stats();
    }
  },

  uranium1_cell_power: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.power = part.base_power * Math.pow(2, upgrade.level);
    game.reactor.updateStats();
  },
  uranium1_cell_tick: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.ticks = part.base_ticks * Math.pow(2, upgrade.level);
    game.reactor.updateStats();
  },
  uranium1_cell_perpetual: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.perpetual = true;
    game.reactor.updateStats();
  },
};

export function executeUpgradeAction(actionId, upgrade, game) {
  "use strict";
  if (actions[actionId]) {
    actions[actionId](upgrade, game);
  }
}

export default actions;
