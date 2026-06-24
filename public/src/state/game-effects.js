import { drainGameEffects } from "../effect-orchestrator.js";

export function enqueueGameEffect(game, effect) {
  const st = game?.state;
  if (!st || !Array.isArray(st.effect_queue)) return;
  st.effect_queue.push(effect);
  drainGameEffects(game, () => game?.ui);
}

export function flushSimEvents(game) {
  drainGameEffects(game, () => game?.ui);
}

export function enqueueClearAnimations(game) {
  enqueueGameEffect(game, { kind: "clear_animations" });
}

export function enqueueClearImageCache(game) {
  enqueueGameEffect(game, { kind: "clear_image_cache" });
}

export function enqueueWarningLoop(game, intensity = 0.5) {
  enqueueGameEffect(game, { kind: "warning_loop", intensity });
}

export function enqueueWarningStop(game) {
  enqueueGameEffect(game, { kind: "warning_stop" });
}