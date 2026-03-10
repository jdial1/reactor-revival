import { proxy, ref, snapshot, subscribe } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { derive } from "derive-valtio";
import { toDecimal, toNumber } from "../utils/decimal.js";

const initDec = (val, fallback = 0) =>
  ref(val != null ? (typeof val?.gte === "function" ? val : toDecimal(val)) : toDecimal(fallback));

export function createGameState(initial = {}) {
  const baseState = proxy({
    current_money: initDec(initial.current_money),
    current_power: initDec(initial.current_power),
    current_heat: initDec(initial.current_heat),
    current_exotic_particles: initDec(initial.current_exotic_particles),
    total_exotic_particles: initDec(initial.total_exotic_particles),
    reality_flux: initDec(initial.reality_flux),
    max_power: initial.max_power ?? 0,
    max_heat: initial.max_heat ?? 0,
    stats_power: initial.stats_power ?? 0,
    stats_heat_generation: initial.stats_heat_generation ?? 0,
    stats_vent: initial.stats_vent ?? 0,
    stats_inlet: initial.stats_inlet ?? 0,
    stats_outlet: initial.stats_outlet ?? 0,
    stats_net_heat: initial.stats_net_heat ?? 0,
    stats_total_part_heat: initial.stats_total_part_heat ?? 0,
    stats_cash: initial.stats_cash ?? 0,
    engine_status: initial.engine_status ?? "stopped",
    power_delta_per_tick: initial.power_delta_per_tick ?? 0,
    heat_delta_per_tick: initial.heat_delta_per_tick ?? 0,
    auto_sell: initial.auto_sell ?? false,
    auto_buy: initial.auto_buy ?? true,
    heat_control: initial.heat_control ?? false,
    time_flux: initial.time_flux ?? true,
    pause: initial.pause ?? false,
    melting_down: initial.melting_down ?? false,
    manual_override_mult: initial.manual_override_mult ?? 0,
    override_end_time: initial.override_end_time ?? 0,
    power_to_heat_ratio: initial.power_to_heat_ratio ?? 0,
    flux_accumulator_level: initial.flux_accumulator_level ?? 0,
    active_objective: initial.active_objective ?? {
      title: "",
      index: 0,
      isComplete: false,
      isChapterCompletion: false,
      progressPercent: 0,
      hasProgressBar: false,
      checkId: null,
    },
    active_buffs: initial.active_buffs ?? [],
    parts_panel_version: initial.parts_panel_version ?? 0,
    upgrade_display: initial.upgrade_display ?? {},
    power_overflow_to_heat_ratio: initial.power_overflow_to_heat_ratio ?? 0.5,
    manual_heat_reduce: initial.manual_heat_reduce ?? initial.base_manual_heat_reduce ?? 1,
    auto_sell_multiplier: initial.auto_sell_multiplier ?? 0,
    heat_controlled: initial.heat_controlled ?? false,
    vent_multiplier_eff: initial.vent_multiplier_eff ?? 0,
  });

  derive({
    power_net_change: (get) => {
      const state = get(baseState);
      const statsPower = toNumber(state.stats_power ?? 0);
      const autoSellEnabled = !!state.auto_sell;
      const autoSellMultiplier = toNumber(state.auto_sell_multiplier ?? 0);
      return (autoSellEnabled && autoSellMultiplier > 0)
        ? statsPower - statsPower * autoSellMultiplier
        : statsPower;
    },
    heat_net_change: (get) => {
      const state = get(baseState);
      let baseNetHeat = state.stats_net_heat;
      if (typeof baseNetHeat !== "number" || isNaN(baseNetHeat)) {
        const totalHeat = toNumber(state.stats_heat_generation ?? 0);
        const statsVent = toNumber(state.stats_vent ?? 0);
        const statsOutlet = toNumber(state.stats_outlet ?? 0);
        baseNetHeat = totalHeat - statsVent - statsOutlet;
      }
      const currentPower = toNumber(state.current_power ?? 0);
      const statsPower = toNumber(state.stats_power ?? 0);
      const maxPower = toNumber(state.max_power ?? 0);
      const potentialPower = currentPower + statsPower;
      const excessPower = Math.max(0, potentialPower - maxPower);
      const overflowToHeat = Number(state.power_overflow_to_heat_ratio ?? 0.5) || 0.5;
      const overflowHeat = excessPower * overflowToHeat;
      const manualReduce = toNumber(state.manual_heat_reduce ?? 1);
      return baseNetHeat + overflowHeat - manualReduce;
    },
  }, { proxy: baseState });

  return baseState;
}

export function updateDecimal(state, key, fn) {
  const current = state[key];
  const decimal = (current != null && typeof current.gte === "function") ? current : toDecimal(current ?? 0);
  state[key] = ref(fn(decimal));
}

export function setDecimal(state, key, value) {
  state[key] = ref(toDecimal(value));
}

export { snapshot, subscribe, subscribeKey };
