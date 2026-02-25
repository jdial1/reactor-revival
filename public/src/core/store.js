import { proxy, ref, snapshot } from "valtio/vanilla";
import { toDecimal } from "../utils/decimal.js";

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
