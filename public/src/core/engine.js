import { fromError } from "zod-validation-error";
import { toDecimal } from "../utils/decimal.js";
import { performance, isTestEnv } from "../utils/util.js";
import { HeatSystem } from "./heatSystem.js";
import { runHeatStepFromTyped } from "./heatCalculations.js";
import { logger } from "../utils/logger.js";
import { buildHeatPayload } from "./heatPayloadBuilder.js";
import { getValveOrientation as getValveOrientationFromModule, getInputOutputNeighbors as getInputOutputNeighborsFromModule } from "./valveOrientation.js";
import { createVisualEventBuffer } from "./visualEventBuffer.js";
import { TimeManager } from "./TimeManager.js";
import { runInstantCatchup as runInstantCatchupFromModule } from "./timeFluxProcessor.js";
import { runLoopIteration } from "./engineLoopScheduler.js";
import { ensureArraysValid, updatePartCaches, updateValveNeighborCache } from "./partCacheManager.js";
import { serializeStateForGameLoopWorker, applyGameLoopTickResult } from "./gameLoopWorkerBridge.js";
import { handleComponentExplosion as handleComponentExplosionFromModule } from "./engine/componentExplosionHandler.js";
import { ensureGameLoopWorker, ensurePhysicsWorker } from "./engine/engineWorkerBridge.js";
import { runPostHeatPhase } from "./engine/tickPostHeatPhase.js";
import { processComponentPhase } from "./engine/phaseRegistry.js";
import { initAllEngineState } from "./engine/engineHeatState.js";
import { HeatFlowVisualizer } from "./engine/HeatFlowVisualizer.js";

import {
  GRID_SIZE_NO_SAB_THRESHOLD,
  WORKER_HEARTBEAT_MS,
  PAUSED_POLL_MS,
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
} from "./constants.js";
import { PhysicsTickInputSchema } from "./schemas.js";

export const VISUAL_EVENT_POWER = 1;
export const VISUAL_EVENT_HEAT = 2;
export const VISUAL_EVENT_EXPLOSION = 3;

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
    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];
    this.active_valves = [];
    this.active_vents = [];
    this.active_capacitors = [];
    this._partCacheDirty = true;
    this._valveNeighborCache = new Set();
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache = new Map();

    this.MAX_EVENTS = MAX_VISUAL_EVENTS;
    this._visualEventBuffer = createVisualEventBuffer(this.MAX_EVENTS);

    initAllEngineState(this);
    ensureArraysValid(this);

    this.timeManager = new TimeManager(this);
    this.heatManager = new HeatSystem(this);
    this.heatFlowVisualizer = new HeatFlowVisualizer();
    this._workerHeartbeatMs = WORKER_HEARTBEAT_MS;
  }

  get time_accumulator() { return this.timeManager.time_accumulator; }
  set time_accumulator(v) { this.timeManager.time_accumulator = v; }
  get _frameTimeAccumulator() { return this.timeManager._frameTimeAccumulator; }
  set _frameTimeAccumulator(v) { this.timeManager._frameTimeAccumulator = v; }
  get _timeFluxCatchupTotalTicks() { return this.timeManager._timeFluxCatchupTotalTicks; }
  set _timeFluxCatchupTotalTicks(v) { this.timeManager._timeFluxCatchupTotalTicks = v; }
  get _timeFluxCatchupRemainingTicks() { return this.timeManager._timeFluxCatchupRemainingTicks; }
  set _timeFluxCatchupRemainingTicks(v) { this.timeManager._timeFluxCatchupRemainingTicks = v; }
  get _timeFluxFastForward() { return this.timeManager._timeFluxFastForward; }
  set _timeFluxFastForward(v) { this.timeManager._timeFluxFastForward = v; }
  get _welcomeBackFastForward() { return this.timeManager._welcomeBackFastForward; }
  set _welcomeBackFastForward(v) { this.timeManager._welcomeBackFastForward = v; }

  setForceNoSAB(override) {
    this._heatUseSABOverride = !!override;
    this._heatUseSAB = this._heatUseSABNative && !this._heatUseSABOverride;
  }

  _useGameLoopWorker() {
    if (typeof Worker === "undefined" || this._gameLoopWorkerFailed) return false;
    return this._heatUseSAB === true;
  }

  _useWorker() {
    if (typeof Worker === "undefined" || this._workerFailed) return false;
    if (!this._heatUseSAB && this.game.rows * this.game.cols >= GRID_SIZE_NO_SAB_THRESHOLD) return false;
    return true;
  }

  _serializeStateForGameLoopWorker() {
    return serializeStateForGameLoopWorker(this);
  }

  _applyGameLoopTickResult(data) {
    applyGameLoopTickResult(this, data);
  }

  _getGameLoopWorker() {
    return ensureGameLoopWorker(this);
  }

  _buildHeatPayload(multiplier) {
    return buildHeatPayload(this, multiplier);
  }

  _runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick) {
    const build = this._buildHeatPayload(multiplier);
    if (!build?.payloadForSync) return;
    const { heat, containment, ...rest } = build.payloadForSync;
    const recordTransfers = [];
    const result = runHeatStepFromTyped(heat, containment, { ...rest, recordTransfers });
    this.game.tileset.heatMap = heat;
    this.game.reactor.current_heat = toDecimal(result.reactorHeat);
    this.heatFlowVisualizer.clear();
    const cols = this.game.cols;
    for (const t of recordTransfers) {
      this.heatFlowVisualizer.addTransfer(t.fromIdx, t.toIdx, t.amount, cols);
    }
    this._continueTickAfterHeat(multiplier, power_add, heat_add + result.heatFromInlets, powerBeforeTick, heatBeforeTick, null);
  }

  _getWorker() {
    return ensurePhysicsWorker(this);
  }

  getLastHeatFlowVectors() {
    return this.heatFlowVisualizer.getVectors();
  }

  enqueueVisualEvent(typeId, row, col, value) {
    if (this._timeFluxFastForward) return;
    this._visualEventBuffer.enqueue(typeId, row, col, value);
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

  _hasHeatActivity() {
    return this.active_cells.length > 0 ||
      this.active_exchangers.length > 0 ||
      this.active_inlets.length > 0 ||
      this.active_outlets.length > 0 ||
      this.active_valves.length > 0 ||
      this.active_vents.length > 0;
  }

  _ensureArraysValid() {
    ensureArraysValid(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._testFrameCount = 0;
    this.last_timestamp = performance.now();
    this.last_session_update = Date.now();
    this.loop(this.last_timestamp);

    if (this.game.state) this.game.state.engine_status = "running";
  }

  stop() {
    if (!this.running) return;
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
    if (this.game.state) this.game.state.engine_status = "stopped";
  }

  isRunning() {
    return this.running;
  }

  addTimeTicks(tickCount) {
    this.timeManager.addTimeTicks(tickCount);
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache.clear();
    ensureArraysValid(this);
    if (typeof this.game.emit === "function") {
      this.game.emit("grid_changed");
    }
  }

  _updatePartCaches() {
    updatePartCaches(this);
  }

  _updateValveNeighborCache() {
    updateValveNeighborCache(this);
  }

  loop(timestamp) {
    const inTestEnv = isTestEnv();
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame : globalThis.requestAnimationFrame;

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
      if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();
      if (!inTestEnv) {
        this.last_timestamp = timestamp;
        this._pausedTimeoutId = setTimeout(() => {
          this._pausedTimeoutId = null;
          if (this.running && this.game.paused) this.loop(performance.now());
        }, PAUSED_POLL_MS);
      }
      return;
    }

    if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("engine_loop");
    }

    runLoopIteration(this, timestamp);

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
    return this._processTick(1.0, false);
  }

  manualTick() {
    return this._processTick(1.0, true);
  }

  _processTick(multiplier = 1.0, manual = false) {
    const tickStart = performance.now();
    const currentTickNumber = this.tick_count;
    
    logger.log('debug', 'engine', `[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Running: ${this.running}, Multiplier: ${multiplier.toFixed(4)}`);

    if (this.game.paused && !manual) {
      logger.log('debug', 'engine', '[TICK ABORTED] Game is paused.');
      return;
    }

    logger.groupCollapsed(`Processing Tick #${currentTickNumber} (Manual: ${manual}, x${multiplier.toFixed(2)})`);
    try {
      if (this.game.reactor.has_melted_down) {
        logger.log('debug', 'engine', '[TICK ABORTED] Reactor already in meltdown state.');
        logger.groupEnd();
        return;
      }
      if (this.game.reactor.checkMeltdown()) {
        logger.log('warn', 'engine', '[TICK ABORTED] Meltdown triggered at start of tick.');
        logger.groupEnd();
        return;
      }
      
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_total");
    }

    const reactor = this.game.reactor;

    if (this.game.state) this.game.state.engine_status = "tick";
    this.game.emit("tickRecorded");

    const powerBeforeTick = reactor.current_power;
    const heatBeforeTick = reactor.current_heat;

    this._updatePartCaches();
    this._updateValveNeighborCache();

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_cells");
    }

    const cellResult = processComponentPhase(this, "cells", multiplier);
    let { power_add, heat_add } = cellResult;

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_cells");
    }

    reactor.current_heat = reactor.current_heat.add(heat_add);

    const canSendWorker = this._useWorker() && (this._heatUseSAB || !this._workerPending);
    if (canSendWorker) {
      const payload = this._buildHeatPayload(multiplier);
      if (payload) {
        this._workerTickId++;
        this._workerTickContext = { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, tickId: this._workerTickId };
        payload.msg.tickId = this._workerTickId;
        this._workerPending = true;
        const w = this._getWorker();
        if (!w) {
          this._workerPending = false;
          this._workerTickContext = null;
          this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
          return;
        }
        const result = PhysicsTickInputSchema.safeParse(payload.msg);
        if (!result.success) {
          logger.log("warn", "engine", "[PhysicsWorker] Input validation failed:", fromError(result.error).toString());
          this._workerPending = false;
          this._workerTickContext = null;
          this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
          return;
        }
        w.postMessage(result.data, payload.transferList);
        if (!this._heatUseSAB) {
          this._heatTransferHeat = null;
          this._heatTransferContainment = null;
        }
        if (this._workerHeartbeatId) clearTimeout(this._workerHeartbeatId);
        this._workerHeartbeatId = setTimeout(() => {
          if (!this._workerPending) return;
          this._workerHeartbeatId = null;
          this._workerPending = false;
          const ctx = this._workerTickContext;
          this._workerTickContext = null;
          logger.log('warn', 'engine', '[Worker] Heat step timeout, falling back to main thread');
          if (ctx) this._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
        }, this._workerHeartbeatMs);
        return;
      }
    }
    const heatResult = this.heatManager.processTick(multiplier);
    heat_add += heatResult.heatFromInlets;
    this.heatFlowVisualizer.clear();
    const cols = this.game.cols;
    for (const t of heatResult.transfers || []) {
      this.heatFlowVisualizer.addTransfer(t.fromIdx, t.toIdx, t.amount, cols);
    }
    this._continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
    } catch (error) {
      logger.log('error', 'engine', 'Error in _processTick:', error);
      if (this.game.state) this.game.state.engine_status = "stopped";
      throw error;
    } finally {
      logger.groupEnd();
    }
    const tickDuration = performance.now() - tickStart;
    this.game.debugHistory.add('engine', 'tick', { number: currentTickNumber, duration: tickDuration });
  }

  _continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, explosionIndices = null) {
    runPostHeatPhase(this, { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick }, explosionIndices);
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  runInstantCatchup() {
    runInstantCatchupFromModule(this);
  }

  handleComponentExplosion(tile) {
    handleComponentExplosionFromModule(this, tile);
  }

  _getValveOrientation(valveId) {
    return getValveOrientationFromModule(valveId, this._valveOrientationCache);
  }

  _getInputOutputNeighbors(valve, neighbors, orientation) {
    return getInputOutputNeighborsFromModule(valve, neighbors, orientation);
  }
}
