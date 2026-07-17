import { EngineStatus } from "../schema/stateSchemas.js";
import { toNumber, isTestEnv, FOUNDATIONAL_TICK_MS } from "../simUtils.js";
import { logger } from "../core/logger.js";
import {
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
  MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME,
  MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  MAX_LIVE_TICKS,
  OFFLINE_REPLAY_CHUNK_TICKS,
  SIMULATION_ERROR_MESSAGE,
  PAUSED_POLL_MS,
} from "../constants/balance.js";
import { performance } from "../dom/lit.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { recordSimEvent } from "./sim-events.js";
import { numFormat as fmt } from "../format/numbers.js";

const DEBUG_PERFORMANCE =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof window !== "undefined" && window.location?.hostname === "localhost") ||
  false;

export class Performance {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.counters = {};
    this.averages = {};
    this.maxSamples = 100;
  }

  enable() {
    if (!DEBUG_PERFORMANCE) return;
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  shouldMeasure() {
    return this.enabled && DEBUG_PERFORMANCE;
  }

  markStart(name) {
    if (!this.enabled || typeof performance.mark !== "function") return;
    performance.mark(`${name}_start`);
    this.marks[name] = performance.now();
  }

  markEnd(name) {
    if (!this.enabled || !this.marks[name] || typeof performance.mark !== "function") return;
    performance.mark(`${name}_end`);
    if (typeof performance.measure === "function") {
      performance.measure(name, `${name}_start`, `${name}_end`);
    }
    const duration = performance.now() - this.marks[name];
    this.measures[name] = duration;
    if (!this.averages[name]) this.averages[name] = { sum: 0, count: 0, samples: [] };
    const avg = this.averages[name];
    avg.sum += duration;
    avg.count++;
    avg.samples.push(duration);
    if (avg.samples.length > this.maxSamples) {
      avg.sum -= avg.samples.shift();
    }
    this.counters[name] = (this.counters[name] || 0) + 1;
  }
}

const createVisualEventBuffer = (maxEvents) => {
  const buffer = new Uint32Array(maxEvents * 2);
  let head = 0;
  let tail = 0;
  return {
    enqueue(typeId, row, col, value) {
      const idx = head * 2;
      buffer[idx] = ((typeId & 0xF) << 12) | ((row & 0x3F) << 6) | (col & 0x3F);
      buffer[idx + 1] = value;
      head = (head + 1) % maxEvents;
      if (head === tail) tail = (tail + 1) % maxEvents;
    },
    getEventBuffer() {
      return { buffer, head, tail, max: maxEvents };
    },
    ack(newTail) {
      tail = newTail;
    },
  };
};

const handleComponentExplosion = (engine, tile) => {
  tile.exploded = true;
  if (engine.game) {
    recordSimEvent(engine.game, {
      type: "COMPONENT_EXPLODED",
      row: tile.row,
      col: tile.col,
    });
    drainGameEffects(engine.game, () => engine.game?.ui);
    engine.game.emit?.("component_explosion", {
      row: tile.row,
      col: tile.col,
      partId: tile.part?.id,
    });
  }
  if (tile && tile.heat_contained > 0) {
    engine.game.reactor.current_heat = engine.game.reactor.current_heat.add(tile.heat_contained);
  }
  tile.exploding = true;
  engine.noteExplosionVisualPending();
  setTimeout(() => {
    engine.handleComponentDepletion(tile);
    tile.exploding = false;
  }, 600);
};

const failSimulationHardwareIncompatible = (engine, detail) => {
  engine._simulationHardwareError = true;
  if (engine.game?.state) {
    engine.game.state.engine_status = EngineStatus.SIMULATION_ERROR;
    engine.game.state.simulation_error_message = SIMULATION_ERROR_MESSAGE;
  }
  engine.stop();
  engine.game?.emit?.("simulationHardwareError", {
    message: SIMULATION_ERROR_MESSAGE,
    detail: detail != null ? String(detail) : "",
  });
};

export const startOfflineFastForward = (engine) => {
  const game = engine.game;
  const offlineMs = game._offlineCatchupMs || 0;
  game._offlineCatchupMs = 0;
  const ticks = Math.min(
    Math.floor(offlineMs / FOUNDATIONAL_TICK_MS),
    MAX_ACCUMULATOR_MULTIPLIER
  );
  if (ticks <= 0 || !engine.game?.coreBridge?.hasTickActivity?.()) return 0;
  engine._offlineFastForwardTicks = ticks;
  engine._isCatchingUp = true;
  return ticks;
};

const yieldToNextFrame = (yieldMs = 0) => {
  if (yieldMs > 0) return new Promise((resolve) => setTimeout(resolve, yieldMs));
  const rafFn =
    (typeof window !== "undefined" && window.requestAnimationFrame) ||
    globalThis.requestAnimationFrame;
  if (typeof rafFn === "function") return new Promise((resolve) => rafFn(() => resolve()));
  return new Promise((resolve) => setTimeout(resolve, 16));
};

const runChunkedOfflineReplay = async (engine, opts = {}) => {
  const chunkTicks = opts.chunkTicks ?? OFFLINE_REPLAY_CHUNK_TICKS;
  const yieldMs = opts.yieldMs ?? 0;
  let remaining = opts.totalTicks ?? engine._offlineFastForwardTicks ?? 0;
  if (remaining <= 0 || !engine.game?.coreBridge?.hasTickActivity?.()) return;

  const bridge = engine.game?.coreBridge;
  if (!bridge?.isActive || !bridge.session?.catchupGenerator) return;

  engine._offlineReplayActive = true;
  engine._isCatchingUp = true;
  engine._offlineFastForwardTicks = 0;

  const startMoney = toNumber(engine.game.state.current_money);
  const startEp = toNumber(engine.game.state.current_exotic_particles);

  try {
    for await (const _chunk of bridge.session.catchupGenerator(remaining, chunkTicks)) {
      if (!engine.running || engine.game.paused) break;
      bridge.syncGridToGame?.();
      bridge.routeEvents?.();
      bridge.projectToGame?.(bridge.session.engine.getLastResult());
      await yieldToNextFrame(yieldMs);
    }
  } finally {
    engine._offlineReplayActive = false;
    engine._isCatchingUp = false;
    engine._offlineFastForwardTicks = 0;
    bridge.syncGridToGame?.();
    bridge.routeEvents?.();
    bridge.projectToGame?.(bridge.session.engine.getLastResult());
    engine.game.achievement_manager?.onCatchUpEnded?.();

    const earnedMoney = toNumber(engine.game.state.current_money) - startMoney;
    const earnedEp = toNumber(engine.game.state.current_exotic_particles) - startEp;
    if (earnedMoney > 0 || earnedEp > 0) {
      let body = `Earned $${fmt(earnedMoney)}`;
      if (earnedEp > 0) body += ` and ${fmt(earnedEp)} EP`;
      recordSimEvent(engine.game, {
        type: "CATCH_UP_COMPLETE",
        tag: "CATCH-UP COMPLETE",
        body,
        durationMs: 6000,
      });
      drainGameEffects(engine.game, () => engine.game?.ui);
    }
  }
};

export const processOfflineTime = (engine, deltaTime) => {
  if (deltaTime <= OFFLINE_TIME_THRESHOLD_MS) return false;
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(deltaTime, capMs);
  engine.game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  if (tickEquivalent > 0 && engine.game?.coreBridge?.hasTickActivity?.()) {
    engine.game.emit?.("welcomeBackOffline", { deltaTime: span, offlineMs: span, tickEquivalent });
  }
  return true;
};

export const postGameLoopProjectionQuery = (_engine, game) => {
  const bridge = game.coreBridge;
  if (!bridge?.isActive) return Promise.resolve(null);
  bridge.syncForStatsRead();
  const snap = bridge.session?.getSnapshot?.();
  if (!snap) return Promise.resolve(null);
  return Promise.resolve({
    stats: snap.stats,
    reactorPower: snap.grid?.currentPower ?? 0,
    reactorHeat: snap.grid?.currentHeat ?? 0,
    meltdown: snap.meltdown ?? false,
  });
};

const logEngineStartSnapshot = (engine) => {
  const game = engine.game;
  logger.log("info", "engine", "[EngineStart] tick processing", {
    coreBridge: !!game.coreBridge?.isActive,
    loopWaitMs: game.loop_wait,
    simulationTickMs: FOUNDATIONAL_TICK_MS,
    tickCount: engine.tick_count,
  });
};

export class Engine {
  constructor(game) {
    this.game = game;
    this._testFrameCount = 0;
    this._maxTestFrames = MAX_TEST_FRAMES;
    this.animationFrameId = null;
    this._pausedTimeoutId = null;
    this.last_timestamp = 0;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = SESSION_UPDATE_INTERVAL_MS;
    this.tick_count = 0;
    this._isCatchingUp = false;
    this._offlineFastForwardTicks = 0;
    this._simAccumulatorMs = 0;
    this._rAfPrevTs = 0;
    this._tickParts = null;

    this.MAX_EVENTS = MAX_VISUAL_EVENTS;
    this._visualEventBuffer = createVisualEventBuffer(this.MAX_EVENTS);
    this._reflectorPairBuf = new Uint32Array(MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME * 2);
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;

    this.heatManager = {
      getSegmentForTile: (tile) => this.game.coreBridge?.getHeatSegmentForTile?.(tile) ?? null,
    };
    this._visibilityListenerBound = false;
    this._visibilityHiddenAt = 0;
    this._offlineReplayActive = false;
  }

  getLastHeatFlowVectors() {
    return this.game?.coreBridge?.session?.getHeatFlowVectors?.() ?? [];
  }

  enqueueVisualEvent(typeId, row, col, value) {
    this._visualEventBuffer.enqueue(typeId, row, col, value);
  }

  enqueueReflectorVisualPulse(reflectorRow, reflectorCol, cellRow, cellCol) {
    const n = this._reflectorPairCount | 0;
    if (n >= MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME) return;
    const b = this._reflectorPairBuf;
    b[n * 2] = ((reflectorRow & 0xffff) << 16) | (reflectorCol & 0xffff);
    b[n * 2 + 1] = ((cellRow & 0xffff) << 16) | (cellCol & 0xffff);
    this._reflectorPairCount = n + 1;
  }

  noteExplosionVisualPending(count = 1) {
    this._explosionFlashPending = Math.min(
      MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME,
      (this._explosionFlashPending | 0) + count
    );
  }

  getEventBuffer() {
    return this._visualEventBuffer.getEventBuffer();
  }

  ackEvents(newTail) {
    this._visualEventBuffer.ack(newTail);
  }

  get _eventRingBuffer() {
    return this.getEventBuffer().buffer;
  }
  get _eventHead() {
    return this.getEventBuffer().head;
  }
  get _eventTail() {
    return this.getEventBuffer().tail;
  }

  _bindVisibilityForOffline() {
    if (typeof document === "undefined" || this._visibilityListenerBound) return;
    this._visibilityListenerBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this._visibilityHiddenAt = performance.now();
      } else if (this._visibilityHiddenAt > 0) {
        const gap = performance.now() - this._visibilityHiddenAt;
        this._visibilityHiddenAt = 0;
        if (this.running && !this.game.paused && gap > OFFLINE_TIME_THRESHOLD_MS) {
          processOfflineTime(this, gap);
        }
      }
    });
  }

  start() {
    logger.log("info", "engine", "Engine starting...");
    logEngineStartSnapshot(this);
    const stalled = typeof document !== "undefined" && !document.hidden &&
      this.running && !this.game.paused &&
      (performance.now() - (this.last_timestamp || 0)) > 1500;
    if (this.running && !stalled) return;
    if (stalled) this.running = false;
    this.running = true;
    this._testFrameCount = 0;
    this.last_timestamp = performance.now();
    this.last_session_update = Date.now();
    this._simAccumulatorMs = 0;
    this._rAfPrevTs = 0;
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;
    this._bindVisibilityForOffline();
    this.loop(this.last_timestamp);
    if (this.game.state) this.game.state.engine_status = EngineStatus.RUNNING;
  }

  stop() {
    if (!this.running) return;
    logger.log("info", "engine", "Engine stopping.");
    this.running = false;
    this._testFrameCount = 0;
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = null;
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
    }
    this.game.updateSessionTime();
    if (this.game.state) this.game.state.engine_status = EngineStatus.STOPPED;
  }

  isRunning() {
    return this.running;
  }

  loop(timestamp) {
    const inTestEnv = isTestEnv();
    const raf = (typeof window !== "undefined" && window.requestAnimationFrame)
      ? window.requestAnimationFrame
      : globalThis.requestAnimationFrame;

    if (!inTestEnv) {
      this._testFrameCount = 0;
    } else {
      this._testFrameCount = (this._testFrameCount || 0) + 1;
      const maxFrames = this._maxTestFrames || 200;
      if (this._testFrameCount > maxFrames) {
        this.running = false;
        this.animationFrameId = null;
        return;
      }
    }

    if (!this.running) {
      this.animationFrameId = null;
      return;
    }

    if (this.game.paused) {
      if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) {
        this.game.tutorialManager.tick();
      }
      if (!inTestEnv) {
        this.last_timestamp = timestamp;
        this._pausedTimeoutId = setTimeout(() => {
          this._pausedTimeoutId = null;
          if (this.running && this.game.paused) this.loop(performance.now());
        }, PAUSED_POLL_MS);
      }
      return;
    }

    if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) {
      this.game.tutorialManager.tick();
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("engine_loop");
    }

    this.last_timestamp = timestamp;

    const tickMs = Math.max(1, Number(this.game.loop_wait) || FOUNDATIONAL_TICK_MS);
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * tickMs;
    if (!this._rAfPrevTs) this._rAfPrevTs = timestamp;
    else {
      const dFrame = Math.max(0, timestamp - this._rAfPrevTs);
      this._simAccumulatorMs = Math.min(this._simAccumulatorMs + dFrame, capMs);
    }
    this._rAfPrevTs = timestamp;
    let n = 0;
    while (this._simAccumulatorMs >= tickMs && n < MAX_LIVE_TICKS) {
      this._simAccumulatorMs -= tickMs;
      this.tick();
      n++;
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("engine_loop");
    }

    if (inTestEnv && (this._testFrameCount || 0) >= (this._maxTestFrames || 200)) {
      this.running = false;
      this.animationFrameId = null;
      return;
    }
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
    }
    this.animationFrameId = raf(this.loop.bind(this));
  }

  tick() {
    this._processTick(1.0, false);
  }

  manualTick() {
    return this._processTick(1.0, true);
  }

  _processTick(multiplier = 1.0, manual = false) {
    const bridge = this.game?.coreBridge;
    if (!bridge?.isActive) {
      failSimulationHardwareIncompatible(this, "coreBridgeUnavailable");
      return;
    }
    if (this.game.paused && !manual) return;
    bridge.processTick(multiplier);
    this.tick_count = bridge.session.engine.tickCount;
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  beginFastForwardCatchup() {
    const ticks = startOfflineFastForward(this);
    if (ticks > 0) void runChunkedOfflineReplay(this, { totalTicks: ticks });
  }

  handleComponentExplosion(tile) {
    handleComponentExplosion(this, tile);
  }
}
