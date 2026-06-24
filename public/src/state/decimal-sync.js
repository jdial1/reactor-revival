import { ref } from "valtio/vanilla";
import { toDecimal, toNumber } from "../simUtils.js";

export function updateDecimal(state, key, fn) {
  const current = state[key];
  const decimal = (current != null && typeof current.gte === "function") ? current : toDecimal(current ?? 0);
  state[key] = ref(fn(decimal));
}

export function setDecimal(state, key, value) {
  if (state?._simulationLocked && (key === "current_money" || key === "current_exotic_particles")) {
    return;
  }
  state[key] = ref(toDecimal(value));
}

// Centralized state synchronization from reactor to UI state
// This reduces parallel state mirroring by providing a single function to sync reactor values
export function syncReactorToUIState(game) {
  if (!game?.state || !game.reactor) return;
  
  const reactor = game.reactor;
  // Sync heat and power values
  setDecimal(game.state, "current_heat", reactor.current_heat);
  setDecimal(game.state, "current_power", reactor.current_power);
  
  // Sync max values if they exist
  if (reactor.max_heat != null) game.state.max_heat = toNumber(reactor.max_heat);
  if (reactor.max_power != null) game.state.max_power = toNumber(reactor.max_power);
  
  // Sync computed stats
  if (reactor.stats_power != null) game.state.stats_power = reactor.stats_power;
  if (reactor.stats_heat_generation != null) game.state.stats_heat_generation = reactor.stats_heat_generation;
  if (reactor.stats_total_part_heat != null) game.state.stats_total_part_heat = reactor.stats_total_part_heat;
  if (reactor.stats_vent != null) game.state.stats_vent = reactor.stats_vent;
  if (reactor.stats_inlet != null) game.state.stats_inlet = reactor.stats_inlet;
  if (reactor.stats_outlet != null) game.state.stats_outlet = reactor.stats_outlet;
  if (reactor.stats_cash != null) game.state.stats_cash = reactor.stats_cash;
  if (reactor.stats_net_heat != null) game.state.stats_net_heat = reactor.stats_net_heat;
}
