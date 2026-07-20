import { setDecimal } from "./decimal-sync.js";
import { withHostEconomyHydrate } from "./economy-hydrate.js";

const PATCH_TOGGLE_KEYS = new Set(["pause", "auto_sell", "auto_buy", "heat_control"]);
const PATCH_DECIMAL_KEYS = new Set([
  "current_heat",
  "current_power",
  "current_money",
  "current_exotic_particles",
  "total_exotic_particles",
  "session_power_produced",
  "session_power_sold",
  "session_heat_dissipated",
]);

export function patchGameState(game, patch) {
  if (!game?.state || !patch || typeof patch !== "object") return;
  const st = game.state;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "exotic_particles") {
      if (game.exoticParticleManager) {
        withHostEconomyHydrate(game, () => {
          game.exoticParticleManager.exotic_particles = value;
        });
      }
      continue;
    }
    if (key === "total_heat") {
      st.stats_heat_generation = value;
      continue;
    }
    let v = value;
    if (PATCH_TOGGLE_KEYS.has(key)) v = Boolean(v);
    const oldValue = st[key];
    const isDecimalKey = PATCH_DECIMAL_KEYS.has(key);
    if (!isDecimalKey && oldValue === v) continue;
    if (isDecimalKey || (v != null && typeof v?.gte === "function")) {
      setDecimal(st, key, v);
    } else {
      st[key] = v;
    }
  }
}
