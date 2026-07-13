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
import {
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
} from "../constants/sim.js";
import {
  INLET_STRIDE,
  VALVE_STRIDE,
  EXCHANGER_STRIDE,
  OUTLET_STRIDE,
} from "../constants/heat-transfer.js";
import { performance } from "../dom/lit.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { recordSimEvent } from "./sim-events.js";
import { syncActivePartsAtTickBoundary, getTickPartList, getValveNeighborCache } from "./part-classification.js";
import { numFormat as fmt } from "../format/numbers.js";
import { HeatSystem, buildHeatPayload } from "./heat.js";
import { drainGridIntentsAsync } from "./engine-intents.js";
import { purchaseUpgradeCore } from "./upgrade.js";
import { grantReward } from "./rewards.js";
export { Performance } from "./engine-performance.js";

function createVisualEventBuffer(maxEvents) {
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
}

class TimeManager {
  constructor(engine) {
    this._engine = engine;
  }
  get game() {
    return this._engine.game;
  }
}

class HeatFlowVisualizer {
  constructor() {
    this._debug = [];
    this._pool = [];
  }
  clear() {
    for (let i = 0; i < this._debug.length; i++) this._pool.push(this._debug[i]);
    this._debug.length = 0;
  }
  addTransfer(fromIdx, toIdx, amount, cols) {
    const v = this._pool.pop() || { fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, amount: 0 };
    v.fromRow = (fromIdx / cols) | 0;
    v.fromCol = fromIdx % cols;
    v.toRow = (toIdx / cols) | 0;
    v.toCol = toIdx % cols;
    v.amount = amount;
    this._debug.push(v);
  }
  getVectors() {
    return this._debug;
  }
}

function handleComponentExplosion(engine, tile) {
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
}

export function failSimulationHardwareIncompatible(engine, detail) {
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
}

function getValveOrientation(valveId, cache) {
  let orientation = cache.get(valveId);
  if (orientation !== undefined) return orientation;
  const match = valveId.match(/(\d+)$/);
  orientation = match ? parseInt(match[1], 10) : 1;
  cache.set(valveId, orientation);
  return orientation;
}

function getTwoNeighborOrientation(neighbors, orientation) {
  const a = neighbors[0];
  const b = neighbors[1];
  const isAFirst = (orientation === 1 || orientation === 3) ? (a.col < b.col) : (a.row < b.row);
  const first = isAFirst ? a : b;
  const last = isAFirst ? b : a;
  const invert = orientation === 3 || orientation === 4;
  return { inputNeighbor: invert ? last : first, outputNeighbor: invert ? first : last };
}

function getSortedNeighborOrientation(neighbors, orientation) {
  const sorted = [...neighbors].sort((a, b) =>
    (orientation === 1 || orientation === 3) ? (a.col - b.col) : (a.row - b.row)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const invert = orientation === 3 || orientation === 4;
  return { inputNeighbor: invert ? last : first, outputNeighbor: invert ? first : last };
}

function getInputOutputNeighbors(valve, neighbors, orientation) {
  if (neighbors.length < 2) {
    return { inputNeighbor: null, outputNeighbor: null };
  }
  const routing = neighbors.length === 2
    ? getTwoNeighborOrientation(neighbors, orientation)
    : getSortedNeighborOrientation(neighbors, orientation);
  return { inputNeighbor: routing.inputNeighbor, outputNeighbor: routing.outputNeighbor };
}

function initHeatPayloadBuffers(engine) {
  engine._heatPayload_inlets = new Float32Array(HEAT_PAYLOAD_MAX_INLETS * INLET_STRIDE);
  engine._heatPayload_valves = new Float32Array(HEAT_PAYLOAD_MAX_VALVES * VALVE_STRIDE);
  engine._heatPayload_valveNeighbors = new Float32Array(HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS);
  engine._heatPayload_exchangers = new Float32Array(HEAT_PAYLOAD_MAX_EXCHANGERS * EXCHANGER_STRIDE);
  engine._heatPayload_outlets = new Float32Array(HEAT_PAYLOAD_MAX_OUTLETS * OUTLET_STRIDE);
}

export function startOfflineFastForward(engine) {
  const game = engine.game;
  const offlineMs = game._offlineCatchupMs || 0;
  game._offlineCatchupMs = 0;
  const ticks = Math.min(
    Math.floor(offlineMs / FOUNDATIONAL_TICK_MS),
    MAX_ACCUMULATOR_MULTIPLIER
  );
  if (ticks <= 0 || !engine._hasSimulationActivity()) return 0;
  engine._offlineFastForwardTicks = ticks;
  engine._isCatchingUp = true;
  return ticks;
}

function yieldToNextFrame(yieldMs = 0) {
  if (yieldMs > 0) return new Promise((resolve) => setTimeout(resolve, yieldMs));
  const rafFn =
    (typeof window !== "undefined" && window.requestAnimationFrame) ||
    globalThis.requestAnimationFrame;
  if (typeof rafFn === "function") return new Promise((resolve) => rafFn(() => resolve()));
  return new Promise((resolve) => setTimeout(resolve, 16));
}

async function runChunkedOfflineReplay(engine, opts = {}) {
  const chunkTicks = opts.chunkTicks ?? OFFLINE_REPLAY_CHUNK_TICKS;
  const yieldMs = opts.yieldMs ?? 0;
  let remaining = opts.totalTicks ?? engine._offlineFastForwardTicks ?? 0;
  if (remaining <= 0 || !engine._hasSimulationActivity()) return;

  const bridge = engine.game?.coreBridge;
  if (!bridge?.isActive) return;

  engine._offlineReplayActive = true;
  engine._isCatchingUp = true;
  engine._offlineFastForwardTicks = 0;

  const startMoney = toNumber(engine.game.state.current_money);
  const startEp = toNumber(engine.game.state.current_exotic_particles);

  try {
    while (remaining > 0) {
      if (!engine.running || engine.game.paused) break;
      const batch = Math.min(chunkTicks, remaining);
      bridge.processBatchTicks(batch);
      remaining -= batch;
      if (remaining > 0) await yieldToNextFrame(yieldMs);
    }
  } finally {
    engine._offlineReplayActive = false;
    engine._isCatchingUp = false;
    engine._offlineFastForwardTicks = 0;
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
}

export function processOfflineTime(engine, deltaTime) {
  if (deltaTime <= OFFLINE_TIME_THRESHOLD_MS) return false;
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(deltaTime, capMs);
  engine.game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  if (tickEquivalent > 0 && engine._hasSimulationActivity()) {
    engine.game.emit?.("welcomeBackOffline", { deltaTime: span, offlineMs: span, tickEquivalent });
  }
  return true;
}

export function postGameLoopProjectionQuery(engine, game, options = {}) {
  const bridge = game.coreBridge;
  if (!bridge?.isActive) return Promise.resolve(null);
  bridge.syncGridFromGame?.();
  bridge.syncMetaFromGame?.();
  if (options.layout) bridge.syncGridFromGame?.();
  const snap = bridge.session?.getSnapshot?.();
  if (!snap) return Promise.resolve(null);
  return Promise.resolve({
    stats: snap.stats,
    reactorPower: snap.grid?.currentPower ?? 0,
    reactorHeat: snap.grid?.currentHeat ?? 0,
    meltdown: snap.meltdown ?? false,
  });
}

function logEngineStartSnapshot(engine) {
  const game = engine.game;
  logger.log("info", "engine", "[EngineStart] tick processing", {
    coreBridge: !!game.coreBridge?.isActive,
    loopWaitMs: game.loop_wait,
    simulationTickMs: FOUNDATIONAL_TICK_MS,
    tickCount: engine.tick_count,
  });
}

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
    this._valveOrientationCache = new Map();
    this._forceGameLoopWorkerOff = false;

    this.MAX_EVENTS = MAX_VISUAL_EVENTS;
    this._visualEventBuffer = createVisualEventBuffer(this.MAX_EVENTS);
    this._reflectorPairBuf = new Uint32Array(MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME * 2);
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;

    this.timeManager = new TimeManager(this);
    this.heatManager = new HeatSystem(this);
    this.heatFlowVisualizer = new HeatFlowVisualizer();
    this._visibilityListenerBound = false;
    this._visibilityHiddenAt = 0;
    this._offlineReplayActive = false;
    initHeatPayloadBuffers(this);
  }

  setForceNoSAB(_override) {}

  _useCoreAuthoritativeTicks() {
    const bridge = this.game?.coreBridge;
    return !!(bridge?.isActive && bridge.authoritativeTicks !== false);
  }

  _useGameLoopWorker() {
    return false;
  }

  _useWorker() {
    return false;
  }

  _processIntentQueue() {
    const game = this.game;
    const q = game.state?.intent_queue;
    if (!q?.length) return;
    const bridge = game.coreBridge;
    const keep = [];
    for (let i = 0; i < q.length; i++) {
      const intent = q[i];
      if (intent.action === "PURCHASE_UPGRADE") {
        const id = intent.payload?.upgradeId;
        if (id) {
          purchaseUpgradeCore(game.upgradeset, id);
          bridge?.syncUpgradesFromGame?.();
        }
      } else if (intent.action === "GRANT_REWARD") {
        grantReward(game, intent.payload);
      } else {
        keep.push(intent);
      }
    }
    q.length = 0;
    for (let j = 0; j < keep.length; j++) q.push(keep[j]);
  }

  _buildHeatPayload(multiplier = 1) {
    return buildHeatPayload(this, multiplier);
  }

  _updateValveNeighborCache() {}

  _getValveOrientation(valveId) {
    return getValveOrientation(valveId, this._valveOrientationCache);
  }

  _getInputOutputNeighbors(valve, neighbors, orientation) {
    return getInputOutputNeighbors(valve, neighbors, orientation);
  }

  async consumeIntentQueueAsync() {
    const game = this.game;
    const queue = game.state?.intent_queue;
    if (!queue || queue.length === 0) return { placed: [], sold: [] };
    const batch = queue.splice(0, queue.length);
    return drainGridIntentsAsync(game, this, batch);
  }

  getLastHeatFlowVectors() {
    return this.heatFlowVisualizer.getVectors();
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

  _hasSimulationActivity() {
    syncActivePartsAtTickBoundary(this);
    const hasParts = this.active_cells.length > 0 ||
      this.active_vents.length > 0 ||
      this.active_exchangers.length > 0 ||
      this.active_valves.length > 0;
    const currentPower = toNumber(this.game.reactor.current_power);
    const autoSell = !!this.game.state?.auto_sell;
    const hasPowerToSell = currentPower > 0 && autoSell;
    const q = this.game.state?.intent_queue;
    if (q?.length) {
      for (let i = 0; i < q.length; i++) {
        const action = q[i]?.action;
        if (action === "SELL_POWER" || action === "VENT_HEAT") return true;
      }
    }
    return hasParts || hasPowerToSell;
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

const TICK_PART_KEYS = [
  "active_cells",
  "active_vessels",
  "active_inlets",
  "active_exchangers",
  "active_outlets",
  "active_valves",
  "active_vents",
  "active_capacitors",
];

for (let i = 0; i < TICK_PART_KEYS.length; i++) {
  const key = TICK_PART_KEYS[i];
  Object.defineProperty(Engine.prototype, key, {
    get() {
      return getTickPartList(this, key);
    },
    configurable: true,
  });
}

Object.defineProperty(Engine.prototype, "_valveNeighborCache", {
  get() {
    return getValveNeighborCache(this);
  },
  configurable: true,
});
