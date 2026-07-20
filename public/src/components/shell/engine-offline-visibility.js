import { processOfflineTime } from "../../domain/engine.js";
import { OFFLINE_TIME_THRESHOLD_MS } from "../../constants/balance.js";

export function bindEngineOfflineVisibility(engine) {
  if (typeof document === "undefined" || !engine || engine._visibilityListenerBound) return;
  engine._visibilityListenerBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      engine._visibilityHiddenAt = performance.now();
      return;
    }
    if (!(engine._visibilityHiddenAt > 0)) return;
    const gap = performance.now() - engine._visibilityHiddenAt;
    engine._visibilityHiddenAt = 0;
    if (engine.running && !engine.game.paused && gap > OFFLINE_TIME_THRESHOLD_MS) {
      processOfflineTime(engine, gap);
    }
  });
}
