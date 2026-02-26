import { toDecimal, toNumber } from "../../utils/decimal.js";
import { FLUX_ACCUMULATOR_POWER_RATIO_MIN } from "../constants.js";
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

function computeActiveBuffs(state) {
  const buffs = [];
  const manualOverride = (state.manual_override_mult || 0) > 0 && Date.now() < (state.override_end_time || 0);
  if (manualOverride) {
    buffs.push({ id: "manual_override", icon: "img/ui/nav/nav_play.png", title: "Manual Override" });
  }
  if ((state.power_to_heat_ratio || 0) > 0) {
    const maxHeat = toNumber(state.max_heat ?? 0);
    const currentHeat = toNumber(state.current_heat ?? 0);
    const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
    if (heatPercent > 0.8 && (toNumber(state.current_power ?? 0) || 0) > 0) {
      buffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitors/capacitor_4.png", title: "Electro-Thermal Conversion" });
    }
  }
  const maxPower = toNumber(state.max_power ?? 0);
  if ((state.flux_accumulator_level || 0) > 0 && maxPower > 0) {
    const powerRatio = toNumber(state.current_power ?? 0) / maxPower;
    if (powerRatio >= FLUX_ACCUMULATOR_POWER_RATIO_MIN) {
      buffs.push({ id: "flux_accumulators", icon: "img/parts/capacitors/capacitor_6.png", title: "Flux Accumulators" });
    }
  }
  return buffs;
}

export function syncStatsToUI(reactor, _stateManager) {
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
    state.manual_override_mult = reactor.manual_override_mult;
    state.override_end_time = reactor.override_end_time;
    state.power_to_heat_ratio = reactor.power_to_heat_ratio;
    state.flux_accumulator_level = reactor.flux_accumulator_level;
    state.auto_sell_multiplier = reactor.auto_sell_multiplier;
    state.heat_controlled = reactor.heat_controlled;
    state.vent_multiplier_eff = reactor.vent_multiplier_eff;
    state.power_overflow_to_heat_ratio = reactor.power_overflow_to_heat_ratio ?? 0.5;
    state.manual_heat_reduce = toNumber(reactor.manual_heat_reduce ?? reactor.game?.base_manual_heat_reduce ?? 1);
    state.active_buffs.length = 0;
    state.active_buffs.push(...computeActiveBuffs(state));
  }
}
