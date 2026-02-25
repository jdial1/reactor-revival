import { toDecimal } from "../../utils/decimal.js";
import {
  applyReflectorEffects,
  applyCellMultipliers,
  computeTileContributions,
} from "./reactorStatsFormulas.js";

function resetTileStats(tile) {
  tile.powerOutput = 0;
  tile.heatOutput = 0;
  tile.display_power = 0;
  tile.display_heat = 0;
}

function initCellFromPart(tile) {
  const p = tile.part;
  if (p.category === "cell" && tile.ticks > 0) {
    tile.power = (typeof p.power === "number" && !isNaN(p.power) && isFinite(p.power)) ? p.power : p.base_power || 0;
    tile.heat = (typeof p.heat === "number" && !isNaN(p.heat) && isFinite(p.heat)) ? p.heat : p.base_heat || 0;
  }
}

export function calculateStats(reactor, tileset, ui) {
  const maxPowerSetExternally =
    reactor.max_power.neq(reactor._last_calculated_max_power) &&
    reactor.max_power.neq(reactor.base_max_power);
  const maxHeatSetExternally =
    reactor.max_heat.neq(reactor._last_calculated_max_heat) &&
    reactor.max_heat.neq(reactor.base_max_heat);
  const alteredMaxPowerSet = toDecimal(reactor.altered_max_power).neq(reactor.base_max_power);
  const alteredMaxHeatSet = toDecimal(reactor.altered_max_heat).neq(reactor.base_max_heat);

  const accum = {
    stats_power: 0,
    stats_heat_generation: 0,
    stats_total_part_heat: 0,
    stats_vent: 0,
    stats_inlet: 0,
    stats_outlet: 0,
    current_max_power: maxPowerSetExternally
      ? reactor.max_power
      : (alteredMaxPowerSet ? toDecimal(reactor.altered_max_power) : toDecimal(reactor.base_max_power)),
    current_max_heat: maxHeatSetExternally
      ? reactor.max_heat
      : (alteredMaxHeatSet ? toDecimal(reactor.altered_max_heat) : toDecimal(reactor.base_max_heat)),
    temp_transfer_multiplier: 0,
    temp_vent_multiplier: 0,
  };

  const onReflectorPulse = (r_tile, tile) => {
    reactor.game?.emit?.("reflectorPulse", { r_tile, tile });
  };

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      resetTileStats(tile);
      initCellFromPart(tile);
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      if (tile.part.category === "cell" && tile.ticks > 0) {
        applyReflectorEffects(tile, reactor, onReflectorPulse);
        applyCellMultipliers(tile, reactor);
      }
      computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum);
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (!tile.part) return;
    accum.stats_vent += tile.getEffectiveVentValue();
    if (tile.part.category === "heat_inlet") accum.stats_inlet += tile.getEffectiveTransferValue();
    if (tile.part.category === "heat_outlet") accum.stats_outlet += tile.getEffectiveTransferValue();
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.display_power = tile.power || 0;
      tile.display_heat = tile.heat || 0;
    }
  });

  accum.stats_power = Number(accum.stats_power || 0);
  accum.stats_heat_generation = Number(accum.stats_heat_generation || 0);
  accum.stats_total_part_heat = Number(accum.stats_total_part_heat || 0);
  if (!isFinite(accum.stats_power) || isNaN(accum.stats_power)) accum.stats_power = 0;
  accum.stats_net_heat = accum.stats_heat_generation - accum.stats_vent - accum.stats_outlet;
  accum.stats_cash = accum.current_max_power.mul(reactor.auto_sell_multiplier);

  return accum;
}

export function applyStatsToReactor(reactor, stats) {
  reactor.stats_power = stats.stats_power;
  reactor.stats_heat_generation = stats.stats_heat_generation;
  reactor.stats_total_part_heat = stats.stats_total_part_heat;
  reactor.stats_vent = stats.stats_vent;
  reactor.stats_inlet = stats.stats_inlet;
  reactor.stats_outlet = stats.stats_outlet;
  reactor.stats_net_heat = stats.stats_net_heat;
  reactor.stats_cash = stats.stats_cash;
  reactor.vent_multiplier_eff = stats.temp_vent_multiplier;
  reactor.transfer_multiplier_eff = stats.temp_transfer_multiplier;
  reactor.max_power = stats.current_max_power;
  reactor.max_heat = stats.current_max_heat;
  reactor._last_calculated_max_power = reactor.max_power;
  reactor._last_calculated_max_heat = reactor.max_heat;
}

export function syncStatsToUI(reactor, stateManager) {
  const state = reactor.game?.state;
  if (state) {
    state.max_power = reactor.max_power;
    state.max_heat = reactor.max_heat;
    state.stats_power = reactor.stats_power;
    state.stats_heat_generation = reactor.stats_heat_generation;
    state.stats_vent = reactor.stats_vent;
    state.stats_inlet = reactor.stats_inlet;
    state.stats_outlet = reactor.stats_outlet;
    state.stats_net_heat = reactor.stats_net_heat;
    state.stats_cash = reactor.stats_cash;
    state.stats_total_part_heat = reactor.stats_total_part_heat;
  }
  if (stateManager) {
    stateManager.setVar("max_power", reactor.max_power);
    stateManager.setVar("max_heat", reactor.max_heat);
    stateManager.setVar("total_heat", reactor.stats_heat_generation);
    stateManager.setVar("current_power", reactor.current_power);
    stateManager.setVar("current_heat", reactor.current_heat);
    stateManager.setVar("auto_sell_multiplier", reactor.auto_sell_multiplier);
    stateManager.setVar("vent_multiplier_eff", reactor.vent_multiplier_eff);
    stateManager.setVar("heat_controlled", reactor.heat_controlled);
    stateManager.setVar("manual_override_mult", reactor.manual_override_mult);
    stateManager.setVar("override_end_time", reactor.override_end_time);
    stateManager.setVar("power_to_heat_ratio", reactor.power_to_heat_ratio);
    stateManager.setVar("flux_accumulator_level", reactor.flux_accumulator_level);
  }
}
