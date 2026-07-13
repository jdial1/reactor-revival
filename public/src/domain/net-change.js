import { toNumber, resolveEffectiveMaxPower } from "../simUtils.js";

export function computePowerNetChange(state, reactor = null) {
  const statsPower = toNumber(state?.stats_power ?? 0);
  const autoSellEnabled = !!state?.auto_sell;
  const autoSellMultiplier = toNumber(
    state?.auto_sell_multiplier ?? reactor?.auto_sell_multiplier ?? 0
  );
  if (autoSellEnabled && autoSellMultiplier > 0) {
    return statsPower - statsPower * autoSellMultiplier;
  }
  return statsPower;
}

export function computeHeatNetChange(state, reactor = null) {
  let baseNetHeat = state?.stats_net_heat;
  if (typeof baseNetHeat !== "number" || isNaN(baseNetHeat)) {
    const totalHeat = toNumber(state?.stats_heat_generation ?? 0);
    const statsVent = toNumber(state?.stats_vent ?? 0);
    const statsOutlet = toNumber(state?.stats_outlet ?? 0);
    baseNetHeat = totalHeat - statsVent - statsOutlet;
  }
  const currentPower = toNumber(state?.current_power ?? 0);
  const statsPower = toNumber(state?.stats_power ?? 0);
  const maxPower = toNumber(resolveEffectiveMaxPower({
    max_power: state?.max_power,
    base_max_power: reactor?.base_max_power ?? state?.base_max_power,
    altered_max_power: reactor?.altered_max_power ?? state?.altered_max_power,
    effective_max_power: state?.effective_max_power,
  }));
  const potentialPower = currentPower + statsPower;
  const excessPower = Math.max(0, potentialPower - maxPower);
  const overflowToHeat = Number(
    state?.power_overflow_to_heat_ratio ?? reactor?.power_overflow_to_heat_ratio ?? 1
  ) || 1;
  const overflowHeat = excessPower * overflowToHeat;
  const manualReduce = toNumber(
    state?.manual_heat_reduce ?? reactor?.manual_heat_reduce ?? reactor?.base_manual_heat_reduce ?? 1
  );
  return baseNetHeat + overflowHeat - manualReduce;
}

export function getPowerNetChange(ui) {
  const state = ui?.game?.state;
  if (!state) return 0;
  const fromState = state.power_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  return computePowerNetChange(state, ui?.game?.reactor);
}

export function getHeatNetChange(ui) {
  const state = ui?.game?.state;
  if (!state) return 0;
  const fromState = state.heat_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  return computeHeatNetChange(state, ui?.game?.reactor);
}
