import {
  REFLECTOR_COOLING_MIN_MULTIPLIER,
  HEAT_POWER_LOG_CAP,
  HEAT_POWER_LOG_BASE,
  PERCENT_DIVISOR,
} from "../constants.js";

export function applyReflectorEffects(tile, reactor, onReflectorPulse) {
  let reflector_power_bonus = 0;
  let reflector_heat_bonus = 0;
  let reflector_count = 0;
  tile.reflectorNeighborTiles.forEach((r_tile) => {
    if (r_tile.ticks > 0) {
      reflector_count++;
      reflector_power_bonus += r_tile.part.power_increase || 0;
      reflector_heat_bonus += r_tile.part.heat_increase || 0;
      if (onReflectorPulse) {
        try {
          onReflectorPulse(r_tile, tile);
        } catch (_) {}
      }
    }
  });
  if (typeof tile.power === "number" && !isNaN(tile.power)) {
    tile.power *= Math.max(0, 1 + reflector_power_bonus / PERCENT_DIVISOR);
  }
  if (typeof tile.heat === "number" && !isNaN(tile.heat)) {
    let heatMult = Math.max(0, 1 + reflector_heat_bonus / PERCENT_DIVISOR);
    if (reactor.reflector_cooling_factor > 0 && reflector_count > 0) {
      const coolingReduction = reflector_count * reactor.reflector_cooling_factor;
      heatMult *= Math.max(REFLECTOR_COOLING_MIN_MULTIPLIER, 1 - coolingReduction);
    }
    tile.heat *= heatMult;
  }
}

export function applyCellMultipliers(tile, reactor) {
  if (reactor.heat_power_multiplier > 0 && reactor.current_heat.gt(HEAT_POWER_LOG_BASE)) {
    const heatForLog = Math.min(reactor.current_heat.toNumber(), HEAT_POWER_LOG_CAP);
    tile.power *= 1 + (reactor.heat_power_multiplier * (Math.log(heatForLog) / Math.log(HEAT_POWER_LOG_BASE) / PERCENT_DIVISOR));
    if (!Number.isFinite(tile.power)) {
      tile.power = (tile.part && Number.isFinite(tile.part.base_power)) ? tile.part.base_power : 0;
    }
  }
  if (reactor.manual_override_mult > 0 && Date.now() < reactor.override_end_time) {
    tile.power *= (1 + reactor.manual_override_mult);
  }
  if (reactor.thermal_feedback_rate > 0) {
    let feedbackBonus = 0;
    tile.containmentNeighborTiles.forEach((neighbor) => {
      if (neighbor.part && neighbor.part.category === "coolant_cell") {
        const ratio = neighbor.heat_contained / neighbor.part.containment;
        if (ratio > 0) feedbackBonus += (ratio * PERCENT_DIVISOR) * reactor.thermal_feedback_rate;
      }
    });
    if (feedbackBonus > 0) tile.power *= (1 + (feedbackBonus / PERCENT_DIVISOR));
  }
  if (reactor.volatile_tuning_max > 0) {
    const maxTicks = tile.part.ticks;
    if (maxTicks > 0 && tile.ticks >= 0) {
      const degradation = 1 - (tile.ticks / maxTicks);
      const bonus = reactor.volatile_tuning_max * degradation;
      if (bonus > 0 && typeof tile.power === "number" && !isNaN(tile.power)) tile.power *= (1 + bonus);
    }
  }
}

export function computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum) {
  if (tile.part.category === "cell" && tile.ticks > 0) {
    accum.stats_power += tile.power || 0;
    accum.stats_heat_generation += tile.heat || 0;
  }
  if (tile.heat_contained > 0) accum.stats_total_part_heat += tile.heat_contained;
  if (!maxPowerSetExternally) {
    if (tile.part.reactor_power) accum.current_max_power = accum.current_max_power.add(tile.part.reactor_power);
    if (tile.part.id === "reactor_plating6") accum.current_max_power = accum.current_max_power.add(tile.part.reactor_heat);
  }
  if (!maxHeatSetExternally && tile.part.reactor_heat) {
    accum.current_max_heat = accum.current_max_heat.add(tile.part.reactor_heat);
  }
  if (tile.part.category === "capacitor") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_capacitor_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_capacitor_multiplier;
  } else if (tile.part.category === "reactor_plating") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_plating_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_plating_multiplier;
  }
}
