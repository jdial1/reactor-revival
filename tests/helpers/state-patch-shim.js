export * from "../../public/src/state.js";
import { patchGameState as patchHostState } from "../../public/src/state/patch-game-state.js";
import { loadEconomyFromHost } from "./bridge-test-harness.js";

const ECONOMY_KEYS = new Set([
  "current_money",
  "current_exotic_particles",
  "total_exotic_particles",
  "exotic_particles",
  "session_power_produced",
  "session_power_sold",
  "session_heat_dissipated",
]);

export function patchGameState(game, patch) {
  patchHostState(game, patch);
  if (!patch || typeof patch !== "object") return;
  for (const key of Object.keys(patch)) {
    if (!ECONOMY_KEYS.has(key)) continue;
    loadEconomyFromHost(game);
    return;
  }
}
