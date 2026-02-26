import { toNumber } from "../../utils/decimal.js";

export function getPowerNetChange(ui) {
  const fromState = ui.game?.state?.power_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const statsPower = toNumber(ui.stateManager.getVar("stats_power") || 0);
  const autoSellEnabled = ui.stateManager.getVar("auto_sell") || false;
  const autoSellMultiplier = toNumber(ui.game?.reactor?.auto_sell_multiplier || 0);
  if (autoSellEnabled && autoSellMultiplier > 0) {
    return statsPower - statsPower * autoSellMultiplier;
  }
  return statsPower;
}

export function getHeatNetChange(ui) {
  const fromState = ui.game?.state?.heat_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const statsNetHeat = ui.stateManager.getVar("stats_net_heat");
  let baseNetHeat;
  if (typeof statsNetHeat === "number" && !isNaN(statsNetHeat)) {
    baseNetHeat = statsNetHeat;
  } else {
    const totalHeat = toNumber(ui.stateManager.getVar("total_heat") || 0);
    const statsVent = toNumber(ui.stateManager.getVar("stats_vent") || 0);
    const statsOutlet = toNumber(ui.stateManager.getVar("stats_outlet") || 0);
    baseNetHeat = totalHeat - statsVent - statsOutlet;
  }
  const currentPower = toNumber(ui.stateManager.getVar("current_power") || 0);
  const statsPower = toNumber(ui.stateManager.getVar("stats_power") || 0);
  const maxPower = toNumber(ui.stateManager.getVar("max_power") || 0);
  const potentialPower = currentPower + statsPower;
  const excessPower = Math.max(0, potentialPower - maxPower);
  const overflowToHeat = ui.game?.reactor?.power_overflow_to_heat_ratio ?? 0.5;
  const overflowHeat = excessPower * overflowToHeat;
  const manualReduce = toNumber(ui.game?.reactor?.manual_heat_reduce || ui.game?.base_manual_heat_reduce || 1);
  return baseNetHeat + overflowHeat - manualReduce;
}
