import { EngineStatus } from "../schema/stateSchemas.js";
import { toNumber, isTestEnv, BASE_LOOP_WAIT_MS } from "../simUtils.js";
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
  WELCOME_BACK_FF_MAX_TICKS,
  SIMULATION_ERROR_MESSAGE,
  PAUSED_POLL_MS,
} from "../constants/balance.js";
import { recordSimEvent } from "./sim-events.js";
import { numFormat as fmt } from "../core/numbers.js";
import { getActiveBridge } from "../bridge/active.js";
import { syncGridToGame } from "../bridge/bridge-grid-sync.js";
import { runSubsystemHook } from "../core/subsystem-registry.js";

const DEBUG_PERFORMANCE =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof globalThis !== "undefined" && globalThis.location?.hostname === "localhost") ||
  false;

const perfNow = () =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

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
    if (!this.enabled || typeof performance?.mark !== "function") return;
    performance.mark(`${name}_start`);
    this.marks[name] = perfNow();
  }

  markEnd(name) {
    if (!this.enabled || !this.marks[name] || typeof performance?.mark !== "function") return;
    performance.mark(`${name}_end`);
    if (typeof performance.measure === "function") {
      performance.measure(name, `${name}_start`, `${name}_end`);
    }
    const duration = perfNow() - this.marks[name];
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
    runSubsystemHook(engine.game, "postTick");
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
    Math.floor(offlineMs / BASE_LOOP_WAIT_MS),
    MAX_ACCUMULATOR_MULTIPLIER
  );
  if (ticks <= 0 || !getActiveBridge(engine.game)?.hasTickActivity?.()) return 0;
  engine._offlineFastForwardTicks = ticks;
  engine._isCatchingUp = true;
  return ticks;
};

const yieldToNextFrame = (yieldMs = 0) => {
  if (yieldMs > 0) return new Promise((resolve) => setTimeout(resolve, yieldMs));
  const rafFn = globalThis.requestAnimationFrame;
  if (typeof rafFn === "function") return new Promise((resolve) => rafFn(() => resolve()));
  return new Promise((resolve) => setTimeout(resolve, 16));
};

const runChunkedOfflineReplay = async (engine, opts = {}) => {
  const chunkTicks = opts.chunkTicks ?? WELCOME_BACK_FF_MAX_TICKS;
  const yieldMs = opts.yieldMs ?? 0;
  const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : null;
  let remaining = opts.totalTicks ?? engine._offlineFastForwardTicks ?? 0;
  const total = remaining;
  const bridge = getActiveBridge(engine.game);
  if (remaining <= 0 || !bridge?.hasTickActivity?.() || !bridge.session?.catchupGenerator) return;

  engine._offlineReplayActive = true;
  engine._isCatchingUp = true;
  engine._offlineFastForwardTicks = 0;

  const startMoney = toNumber(engine.game.state.current_money);
  const startEp = toNumber(engine.game.state.current_exotic_particles);

  try {
    for await (const chunk of bridge.session.catchupGenerator(remaining, chunkTicks)) {
      if (!engine._offlineReplayActive) break;
      syncGridToGame(bridge);
      bridge.routeEvents?.();
      bridge.projectToGame?.(bridge.session.engine.getLastResult());
      onProgress?.({
        processed: chunk.processed ?? total - (chunk.remaining ?? 0),
        remaining: chunk.remaining ?? 0,
        total,
      });
      await yieldToNextFrame(yieldMs);
    }
  } finally {
    engine._offlineReplayActive = false;
    engine._isCatchingUp = false;
    engine._offlineFastForwardTicks = 0;
    syncGridToGame(bridge);
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
      runSubsystemHook(engine.game, "postTick");
    }
    onProgress?.({ processed: total, remaining: 0, total, done: true });
  }
};

export function prepareOfflineCatchup(game, deltaTime) {
  if (deltaTime <= OFFLINE_TIME_THRESHOLD_MS) return null;
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * BASE_LOOP_WAIT_MS;
  const span = Math.min(deltaTime, capMs);
  game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / BASE_LOOP_WAIT_MS);
  return { deltaTime: span, offlineMs: span, tickEquivalent };
}

export const processOfflineTime = (engine, deltaTime) => {
  const prepared = prepareOfflineCatchup(engine.game, deltaTime);
  if (!prepared) return false;
  if (prepared.tickEquivalent > 0 && getActiveBridge(engine.game)?.hasTickActivity?.()) {
    engine.game.emit?.("welcomeBackOffline", prepared);
  }
  return true;
};

export const postGameLoopProjectionQuery = async (_engine, game, options = {}) => {
  const bridge = getActiveBridge(game);
  if (!bridge) return null;
  bridge.session?.grid?.recalculateCaps?.();

  const layout = options.layout
    ?? (game.blueprintPlanner?.active ? game.buildGridProjectionSnapshot?.() : null);
  const sample = await bridge.sampleLayoutProjection?.({
    layout,
    recordTicks: options.recordTicks,
  });

  const snap = bridge.session?.getSnapshot?.();
  if (!snap && !sample) return null;
  return {
    stats: sample?.stats ?? snap?.stats,
    reactorPower: snap?.grid?.currentPower ?? 0,
    reactorHeat: snap?.grid?.currentHeat ?? 0,
    meltdown: snap?.meltdown ?? snap?.hasMeltedDown ?? false,
    heatRatio: snap?.heatRatio ?? 0,
    projectionPlannerSample: sample,
  };
};

const logEngineStartSnapshot = (engine) => {
  const game = engine.game;
  logger.log("info", "engine", "[EngineStart] tick processing", {
    coreBridge: !!getActiveBridge(game),
    loopWaitMs: game.loop_wait,
    simulationTickMs: BASE_LOOP_WAIT_MS,
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

    this._visibilityListenerBound = false;
    this._visibilityHiddenAt = 0;
    this._offlineReplayActive = false;
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

  start() {
    logger.log("info", "engine", "Engine starting...");
    logEngineStartSnapshot(this);
    const stalled = this.running && !this.game.paused &&
      (perfNow() - (this.last_timestamp || 0)) > 1500;
    if (this.running && !stalled) return;
    if (stalled) this.running = false;
    this.running = true;
    this._testFrameCount = 0;
    this.last_timestamp = perfNow();
    this.last_session_update = Date.now();
    this._simAccumulatorMs = 0;
    this._rAfPrevTs = 0;
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;
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
    const raf = globalThis.requestAnimationFrame;

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
          if (this.running && this.game.paused) this.loop(perfNow());
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

    const tickMs = Math.max(1, Number(this.game.loop_wait) || BASE_LOOP_WAIT_MS);
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
    const bridge = getActiveBridge(this.game);
    if (!bridge) {
      failSimulationHardwareIncompatible(this, "coreBridgeUnavailable");
      return;
    }
    if (this.game.paused && !manual) return;
    const payload = { game: this.game, multiplier, manual };
    runSubsystemHook(this.game, "onTick", payload);
    bridge.processTick(multiplier);
    this.tick_count = bridge.session.engine.tickCount;
    this.game.achievement_manager?.onTickRecorded?.();
    runSubsystemHook(this.game, "postTick", payload);
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  beginFastForwardCatchup(opts = {}) {
    const ticks = startOfflineFastForward(this);
    if (ticks > 0) return runChunkedOfflineReplay(this, { totalTicks: ticks, ...opts });
    return Promise.resolve();
  }

  handleComponentExplosion(tile) {
    handleComponentExplosion(this, tile);
  }
}
