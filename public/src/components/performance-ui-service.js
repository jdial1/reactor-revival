import { subscribeKey } from "valtio/vanilla/utils";

export function createPerformanceUIService(getGame) {
  let fpsHistory = [];
  let tpsHistory = [];
  let lastFrameTime = performance.now();
  let lastTickTime = performance.now();
  let frameCount = 0;
  let tickCount = 0;
  let rafId = null;
  let tickUnsub = null;

  const recordFrame = () => {
    frameCount += 1;
    const now = performance.now();
    if (now - lastFrameTime < 1000) return;
    fpsHistory.push(frameCount);
    if (fpsHistory.length > 10) fpsHistory.shift();
    frameCount = 0;
    lastFrameTime = now;
  };

  const recordTick = () => {
    tickCount += 1;
    const now = performance.now();
    if (now - lastTickTime < 1000) return;
    tpsHistory.push(tickCount);
    if (tpsHistory.length > 10) tpsHistory.shift();
    tickCount = 0;
    lastTickTime = now;
  };

  const frameLoop = () => {
    recordFrame();
    rafId = requestAnimationFrame(frameLoop);
  };

  const start = () => {
    stop();
    rafId = requestAnimationFrame(frameLoop);
    const game = getGame?.();
    if (game?.state) {
      tickUnsub = subscribeKey(game.state, "engine_tick_count", recordTick);
    }
  };

  const stop = () => {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (tickUnsub) {
      try { tickUnsub(); } catch (_) {}
      tickUnsub = null;
    }
  };

  return { start, stop, recordFrame, recordTick };
}
