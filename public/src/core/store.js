import { proxy, ref, snapshot, subscribe } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { toDecimal, toNumber } from "../utils/decimal.js";

/**
 * State boundaries (Phase 3 Reactive Game Loop):
 * - MACRO-STATE (Valtio): Money, Exotic Particles, Upgrades (via stats), total Reactor Heat,
 *   current Objective, toggles. Updates a few times per second. UI subscribes via subscribeKey.
 * - MICRO-STATE (Non-Valtio): Per-tile heat (tileset.heatMap Float32Array/SharedArrayBuffer),
 *   particle effect coords, visual event buffer. Do NOT put in Valtio; proxy overhead at 60fps
 *   causes stuttering. Only push aggregate results (e.g. current_heat) to Valtio.
 */

function toSerializable(value) {
  if (value == null) return value;
  if (typeof value.toString === "function" && (typeof value.toNumber === "function" || typeof value.gte === "function"))
    return value.toString();
  if (typeof value === "object" && !Array.isArray(value)) {
    const out = {};
    for (const k of Object.keys(value)) out[k] = toSerializable(value[k]);
    return out;
  }
  return value;
}

export function createGameState(initial = {}) {
  return proxy({
    current_money: ref(initial.current_money != null ? (typeof initial.current_money.gte === "function" ? initial.current_money : toDecimal(initial.current_money)) : toDecimal(0)),
    current_power: ref(initial.current_power != null ? (typeof initial.current_power.gte === "function" ? initial.current_power : toDecimal(initial.current_power)) : toDecimal(0)),
    current_heat: ref(initial.current_heat != null ? (typeof initial.current_heat.gte === "function" ? initial.current_heat : toDecimal(initial.current_heat)) : toDecimal(0)),
    current_exotic_particles: ref(initial.current_exotic_particles != null ? (typeof initial.current_exotic_particles.gte === "function" ? initial.current_exotic_particles : toDecimal(initial.current_exotic_particles)) : toDecimal(0)),
    total_exotic_particles: ref(initial.total_exotic_particles != null ? (typeof initial.total_exotic_particles.gte === "function" ? initial.total_exotic_particles : toDecimal(initial.total_exotic_particles)) : toDecimal(0)),
    reality_flux: ref(initial.reality_flux != null ? (typeof initial.reality_flux.gte === "function" ? initial.reality_flux : toDecimal(initial.reality_flux)) : toDecimal(0)),
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
    active_objective: {
      title: "",
      index: 0,
      isComplete: false,
      isChapterCompletion: false,
      progressPercent: 0,
      hasProgressBar: false,
      checkId: null,
    },
    active_buffs: [],
    parts_panel_version: initial.parts_panel_version ?? 0,
    power_overflow_to_heat_ratio: initial.power_overflow_to_heat_ratio ?? 0.5,
    manual_heat_reduce: initial.manual_heat_reduce ?? initial.base_manual_heat_reduce ?? 1,
    auto_sell_multiplier: initial.auto_sell_multiplier ?? 0,
    heat_controlled: initial.heat_controlled ?? false,
    vent_multiplier_eff: initial.vent_multiplier_eff ?? 0,
    get power_net_change() {
      const statsPower = toNumber(this.stats_power ?? 0);
      const autoSellEnabled = !!this.auto_sell;
      const autoSellMultiplier = toNumber(this.auto_sell_multiplier ?? 0);
      if (autoSellEnabled && autoSellMultiplier > 0) return statsPower - statsPower * autoSellMultiplier;
      return statsPower;
    },
    get heat_net_change() {
      const statsNetHeat = this.stats_net_heat;
      let baseNetHeat;
      if (typeof statsNetHeat === "number" && !isNaN(statsNetHeat)) baseNetHeat = statsNetHeat;
      else {
        const totalHeat = toNumber(this.stats_heat_generation ?? 0);
        const statsVent = toNumber(this.stats_vent ?? 0);
        const statsOutlet = toNumber(this.stats_outlet ?? 0);
        baseNetHeat = totalHeat - statsVent - statsOutlet;
      }
      const currentPower = toNumber(this.current_power ?? 0);
      const statsPower = toNumber(this.stats_power ?? 0);
      const maxPower = toNumber(this.max_power ?? 0);
      const potentialPower = currentPower + statsPower;
      const excessPower = Math.max(0, potentialPower - maxPower);
      const overflowToHeat = Number(this.power_overflow_to_heat_ratio ?? 0.5) || 0.5;
      const overflowHeat = excessPower * overflowToHeat;
      const manualReduce = toNumber(this.manual_heat_reduce ?? 1);
      return baseNetHeat + overflowHeat - manualReduce;
    },
  });
}

export function toPlainObject(state) {
  if (!state) return null;
  const snap = snapshot(state);
  const out = {};
  for (const k of Object.keys(snap)) out[k] = toSerializable(snap[k]);
  return out;
}

export function updateDecimal(state, key, fn) {
  const current = state[key];
  const decimal = (current != null && typeof current.gte === "function") ? current : toDecimal(0);
  state[key] = ref(fn(decimal));
}

export function setDecimal(state, key, value) {
  state[key] = ref(toDecimal(value));
}

export { snapshot, subscribe, subscribeKey };
