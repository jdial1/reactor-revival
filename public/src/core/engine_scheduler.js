import { fromError } from "zod-validation-error";
import superjson from "superjson";
import Decimal, { toDecimal } from "../utils/utils_constants.js";
import { logger } from "../utils/utils_constants.js";
import { GameLoopTickInputSchema, VALVE_OVERFLOW_THRESHOLD } from "../utils/utils_constants.js";
import {
  MAX_TICKS_PER_FRAME_NO_SAB,
  SLOW_MODE_TICKS_PER_FRAME,
  GAME_LOOP_WORKER_MIN_TICKS,
  TIME_FLUX_CHUNK_TICKS,
  SAMPLE_TICKS,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  HEAT_SAFETY_STOP_THRESHOLD,
  ACCUMULATOR_EPSILON,
  MAX_LIVE_TICKS,
  WELCOME_BACK_FF_MAX_TICKS,
  MAX_CATCHUP_TICKS,
} from "../utils/utils_constants.js";


const TIME_FLUX_CHUNK_TICKS = 100;
const ANALYTICAL_CATCHUP_THRESHOLD = 5000;
const STABLE_HEAT_RATIO = VALVE_OVERFLOW_THRESHOLD;
const SAMPLE_TICKS = 5;

function applyReactorStateProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick) {
  const reactor = engine.game.reactor;
  const newHeat = reactor.current_heat.add(avgHeatPerTick * N);
  reactor.current_heat = Decimal.max(toDecimal(0), Decimal.min(reactor.max_heat, newHeat));
  const effectiveMaxPower = (reactor.altered_max_power && toDecimal(reactor.altered_max_power).neq(reactor.base_max_power))
    ? toDecimal(reactor.altered_max_power) : reactor.max_power;
  const newPower = reactor.current_power.add(avgPowerPerTick * N);
  reactor.current_power = Decimal.max(toDecimal(0), Decimal.min(effectiveMaxPower, newPower));
  if (Number.isFinite(avgMoneyPerTick) && avgMoneyPerTick !== 0) {
    engine.game.addMoney(avgMoneyPerTick * N);
  }
}

function advanceTicksAndHandleDepletions(engine, cells, reflectorSet, N) {
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (tile.ticks != null) tile.ticks -= N;
  }
  for (const r of reflectorSet) {
    if (r.ticks != null) r.ticks -= N;
  }
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (tile.ticks <= 0 && tile.part) {
      if (tile.part.type === "protium") {
        engine.game.protium_particles += tile.part.cell_count;
        engine.game.update_cell_power();
      }
      engine.handleComponentDepletion(tile);
    }
  }
  for (const r of reflectorSet) {
    if (r.ticks <= 0 && r.part) engine.handleComponentDepletion(r);
  }
}

export function applyTimeFluxProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  applyReactorStateProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick);
  const cells = engine.active_cells.slice();
  const reflectorSet = new Set();
  for (let i = 0; i < cells.length; i++) {
    const refs = cells[i].reflectorNeighborTiles;
    for (let j = 0; j < refs.length; j++) reflectorSet.add(refs[j]);
  }
  advanceTicksAndHandleDepletions(engine, cells, reflectorSet, N);
  engine.tick_count += N;
  engine.markPartCacheAsDirty();
  game.emit?.("reactorTick", { current_heat: reactor.current_heat, current_power: reactor.current_power });
  if (reactor.updateStats) reactor.updateStats();
}

function canProjectChunk(reactor, chunk) {
  if (chunk <= SAMPLE_TICKS) return false;
  if (reactor.max_heat.lte(0)) return true;
  return reactor.current_heat.div(reactor.max_heat).toNumber() < VALVE_OVERFLOW_THRESHOLD;
}

function sampleTickAverages(engine, reactor) {
  const heat0 = reactor.current_heat;
  const power0 = reactor.current_power;
  const money0 = engine.game.state.current_money;
  for (let i = 0; i < SAMPLE_TICKS; i++) engine._processTick(1.0);
  const heat1 = reactor.current_heat;
  const power1 = reactor.current_power;
  const money1 = engine.game.state.current_money;
  return {
    avgHeat: heat1.sub(heat0).div(SAMPLE_TICKS).toNumber(),
    avgPower: power1.sub(power0).div(SAMPLE_TICKS).toNumber(),
    avgMoney: (money1 && money1.sub ? money1.sub(money0).div(SAMPLE_TICKS).toNumber() : 0),
    heatRatio: reactor.max_heat.gt(0) ? heat1.div(reactor.max_heat).toNumber() : 0,
  };
}

function isProjectionStable(avgs, reactor) {
  return avgs.heatRatio < STABLE_HEAT_RATIO &&
    !reactor.has_melted_down &&
    Number.isFinite(avgs.avgHeat) &&
    Number.isFinite(avgs.avgPower);
}

function processProjectedChunk(engine, reactor, chunk) {
  const maxProjection = Math.max(0, TIME_FLUX_CHUNK_TICKS - SAMPLE_TICKS);
  const avgs = sampleTickAverages(engine, reactor);
  const N = isProjectionStable(avgs, reactor)
    ? Math.min(chunk - SAMPLE_TICKS, maxProjection)
    : 0;
  if (N > 0) {
    applyTimeFluxProjection(engine, N, avgs.avgHeat, avgs.avgPower, avgs.avgMoney);
    return SAMPLE_TICKS + N;
  }
  for (let i = 0; i < chunk - SAMPLE_TICKS; i++) engine._processTick(1.0);
  return chunk;
}

function runTickBatch(engine, count) {
  for (let i = 0; i < count; i++) engine._processTick(1.0);
}

export function runInstantCatchup(engine) {
  const queuedTicks = Math.floor(engine.time_accumulator / engine.game.loop_wait);
  engine.time_accumulator = 0;
  if (queuedTicks <= 0) return;
  if (queuedTicks > ANALYTICAL_CATCHUP_THRESHOLD) {
    runAnalyticalCatchup(engine, queuedTicks);
    return;
  }
  const reactor = engine.game.reactor;
  let remaining = queuedTicks;
  engine._timeFluxFastForward = true;
  while (remaining > 0 && !reactor.has_melted_down) {
    const chunk = Math.min(TIME_FLUX_CHUNK_TICKS, remaining);
    if (canProjectChunk(reactor, chunk)) {
      remaining -= processProjectedChunk(engine, reactor, chunk);
    } else {
      runTickBatch(engine, chunk);
      remaining -= chunk;
    }
  }
  engine._timeFluxFastForward = false;
}

function clampProjectionToMeltdown(reactor, avgs, projectTicksTotal) {
  if (!Number.isFinite(avgs.avgHeat) || avgs.avgHeat <= 0 || !reactor.max_heat.gt(0)) {
    return { projectTicks: projectTicksTotal, wouldMeltdown: false };
  }
  const meltdownHeat = reactor.max_heat.mul(2).toNumber();
  const heatToMeltdown = meltdownHeat - reactor.current_heat.toNumber();
  if (heatToMeltdown <= 0) return { projectTicks: projectTicksTotal, wouldMeltdown: false };
  const ticksToMeltdown = Math.floor(heatToMeltdown / avgs.avgHeat);
  if (ticksToMeltdown < projectTicksTotal) {
    return { projectTicks: ticksToMeltdown, wouldMeltdown: true };
  }
  return { projectTicks: projectTicksTotal, wouldMeltdown: false };
}

export function runAnalyticalCatchup(engine, queuedTicks) {
  const reactor = engine.game.reactor;
  const avgs = sampleTickAverages(engine, reactor);
  const projectTicksTotal = queuedTicks - SAMPLE_TICKS;
  const { projectTicks, wouldMeltdown } = clampProjectionToMeltdown(reactor, avgs, projectTicksTotal);
  if (projectTicks > 0 && Number.isFinite(avgs.avgHeat) && Number.isFinite(avgs.avgPower)) {
    applyTimeFluxProjection(engine, projectTicks, avgs.avgHeat, avgs.avgPower, avgs.avgMoney);
  }
  if (wouldMeltdown) {
    reactor.current_heat = reactor.max_heat.mul(2).add(1);
    reactor.checkMeltdown();
  }
  engine._timeFluxFastForward = false;
}

const DEBUG_PERFORMANCE =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof window !== "undefined" &&
    window.location?.hostname === "localhost") ||
  false;

export class Performance {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.counters = {};
    this.averages = {};
    this.lastDisplayTime = 0;
    this.displayInterval = 120000; // Show stats every 2 minutes instead of 30 seconds
    this.sampleCount = 0;
    this.maxSamples = 100; // Keep last 100 samples for averages
    this.quietMode = true; // Enable quiet mode by default to reduce console spam
    this.lastQuietMessage = 0; // Track when we last showed a quiet message
    this.quietMessageInterval = 300000; // Show quiet message every 5 minutes
  }

  enable() {
    if (!DEBUG_PERFORMANCE) return;
    this.enabled = true;
    this.startPeriodicDisplay();
  }

  disable() {
    this.enabled = false;
    this.stopPeriodicDisplay();
  }

  // New method to enable quiet mode (less console spam)
  enableQuietMode() {
    this.quietMode = true;
  }

  // New method to disable quiet mode
  disableQuietMode() {
    this.quietMode = false;
  }

  // New method to get current performance monitoring status
  getStatus() {
    return {
      enabled: this.enabled,
      quietMode: this.quietMode,
      displayInterval: this.displayInterval,
      quietMessageInterval: this.quietMessageInterval,
      maxSamples: this.maxSamples
    };
  }

  // Convenience method to check if performance monitoring should be used
  shouldMeasure() {
    return this.enabled && DEBUG_PERFORMANCE;
  }

  markStart(name) {
    if (!this.enabled) return;
    performance.mark(`${name}_start`);
    this.marks[name] = performance.now();
  }

  markEnd(name) {
    if (!this.enabled || !this.marks[name]) return;
    performance.mark(`${name}_end`);
    performance.measure(name, `${name}_start`, `${name}_end`);
    const duration = performance.now() - this.marks[name];
    this.measures[name] = duration;

    // Track averages
    if (!this.averages[name]) {
      this.averages[name] = { sum: 0, count: 0, samples: [] };
    }
    this.averages[name].sum += duration;
    this.averages[name].count++;
    this.averages[name].samples.push(duration);

    // Keep only recent samples
    if (this.averages[name].samples.length > this.maxSamples) {
      const removed = this.averages[name].samples.shift();
      this.averages[name].sum -= removed;
    }

    // Track counters
    this.counters[name] = (this.counters[name] || 0) + 1;
  }

  getMeasure(name) {
    return this.measures[name];
  }

  getAverage(name) {
    const avg = this.averages[name];
    return avg ? avg.sum / avg.count : 0;
  }

  getMax(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.max(...avg.samples) : 0;
  }

  getMin(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.min(...avg.samples) : 0;
  }

  getCount(name) {
    return this.counters[name] || 0;
  }

  getAllMeasures() {
    return this.measures;
  }

  getAllAverages() {
    const result = {};
    for (const [name, avg] of Object.entries(this.averages)) {
      result[name] = {
        average: avg.sum / avg.count,
        max: Math.max(...avg.samples),
        min: Math.min(...avg.samples),
        count: avg.count,
        samples: avg.samples.length,
      };
    }
    return result;
  }

  clearMarks() {
    this.marks = {};
    performance.clearMarks();
  }

  clearMeasures() {
    this.measures = {};
    this.averages = {};
    this.counters = {};
    performance.clearMeasures();
  }

  saveData() {
    return {
      marks: this.marks,
      measures: this.measures,
      averages: this.averages,
      counters: this.counters,
    };
  }

  loadData(data) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Invalid data format for performance loading");
    }
    this.marks = data.marks || {};
    this.measures = data.measures || {};
    this.averages = data.averages || {};
    this.counters = data.counters || {};
  }

  reset() {
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.averages = {};
    this.counters = {};
    this.sampleCount = 0;
  }

  startPeriodicDisplay() {
    if (this.displayInterval) {
      this.displayTimer = setInterval(() => {
        this.displayPerformanceStats();
      }, this.displayInterval);
    }
  }

  stopPeriodicDisplay() {
    if (this.displayTimer) {
      clearInterval(this.displayTimer);
      this.displayTimer = null;
    }
  }

  displayPerformanceStats() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;

    const now = performance.now();
    if (now - this.lastDisplayTime < this.displayInterval) return;
    this.lastDisplayTime = now;

    const stats = this.getAllAverages();
    const significantStats = {};

    // Filter for significant operations (>2ms average or >15ms max or >50 count)
    // Increased thresholds to reduce noise
    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 2 || data.max > 15 || data.count > 50) {
        significantStats[name] = data;
      }
    }

    if (Object.keys(significantStats).length === 0) {
      if (!this.quietMode || (now - this.lastQuietMessage) > this.quietMessageInterval) {
        this.lastQuietMessage = now;
      }
      return;
    }
    const sortedStats = Object.entries(significantStats).sort(
      ([, a], [, b]) => b.average - a.average
    );
    for (const [, data] of sortedStats) {
      this.getPerformanceEmoji(data.average, data.max);
    }
    this.detectPerformanceIssues(significantStats);
  }

  getPerformanceEmoji(average, max) {
    if (average > 50 || max > 100) return "🔴";
    if (average > 20 || max > 50) return "🟡";
    if (average > 5 || max > 20) return "🟠";
    return "🟢";
  }

  detectPerformanceIssues(stats) {
    const issues = [];

    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 50) {
        issues.push(
          `${name}: Very slow average (${data.average.toFixed(2)}ms)`
        );
      }
      if (data.max > 100) {
        issues.push(`${name}: Very slow peak (${data.max.toFixed(2)}ms)`);
      }
      if (data.count > 1000) {
        issues.push(`${name}: Very frequent (${data.count} calls)`);
      }
    }

    return issues;
  }

  // Quick performance check for specific operations
  quickCheck(name, threshold = 15) { // Increased default threshold
    const avg = this.getAverage(name);
    const max = this.getMax(name);
    const count = this.getCount(name);

    if (avg > threshold || max > threshold * 2) {
      logger.log('warn', 'game', `Performance issue detected in ${name}: avg=${avg.toFixed(2)}ms, max=${max.toFixed(2)}ms, count=${count}`);
      return false;
    }
    return true;
  }

  // New method to get a summary of current performance
  getPerformanceSummary() {
    if (!this.enabled) return null;

    const stats = this.getAllAverages();
    const summary = {
      totalOperations: Object.keys(stats).length,
      slowOperations: 0,
      verySlowOperations: 0,
      totalCalls: 0
    };

    for (const [, data] of Object.entries(stats)) {
      summary.totalCalls += data.count;
      if (data.average > 5) summary.slowOperations++;
      if (data.average > 20) summary.verySlowOperations++;
    }

    return summary;
  }

  // New method to log performance summary to console
  logPerformanceSummary() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;
    this.getPerformanceSummary();
  }
}

export function processOfflineTime(engine, deltaTime) {
  if (deltaTime <= OFFLINE_TIME_THRESHOLD_MS) return false;

  const previousAccumulator = engine.time_accumulator || 0;
  engine.time_accumulator = previousAccumulator + deltaTime;
  const targetTickDuration = engine.game.loop_wait;
  const maxAccumulator = MAX_ACCUMULATOR_MULTIPLIER * targetTickDuration;

  if (engine.time_accumulator > maxAccumulator) {
    logger.log('warn', 'engine', 'Lag spike detected, clamping accumulator');
    engine.time_accumulator = maxAccumulator;
  }

  logger.log('debug', 'engine', `[TIME FLUX] Offline time detected (${deltaTime.toFixed(0)}ms), accumulator: ${previousAccumulator.toFixed(0)}ms -> ${engine.time_accumulator.toFixed(0)}ms`);

  const queuedTicks = Math.floor(engine.time_accumulator / targetTickDuration);
  if (queuedTicks > 0 && engine._hasHeatActivity() && engine.game.time_flux) {
    engine.game.emit?.("welcomeBackOffline", { deltaTime, queuedTicks });
  }

  return true;
}

function updateTimeFluxCatchupState(engine, queuedTicksBefore, targetTickDuration) {
  if (engine.game.time_flux && queuedTicksBefore > 0) {
    if (!engine._timeFluxCatchupTotalTicks) {
      engine._timeFluxCatchupTotalTicks = queuedTicksBefore;
      engine._timeFluxCatchupRemainingTicks = queuedTicksBefore;
    } else if (queuedTicksBefore > engine._timeFluxCatchupRemainingTicks) {
      const addedTicks = queuedTicksBefore - engine._timeFluxCatchupRemainingTicks;
      engine._timeFluxCatchupRemainingTicks += addedTicks;
      engine._timeFluxCatchupTotalTicks += addedTicks;
    }
  } else {
    engine._timeFluxCatchupTotalTicks = 0;
    engine._timeFluxCatchupRemainingTicks = 0;
  }
}

function checkHeatSafetyStop(engine, initialAccumulator) {
  if (!engine.game.time_flux || engine.time_accumulator <= 0) return null;

  const heatRatio = engine.game.reactor.max_heat.gt(0)
    ? engine.game.reactor.current_heat.div(engine.game.reactor.max_heat).toNumber()
    : 0;

  if (heatRatio < HEAT_SAFETY_STOP_THRESHOLD) return null;

  logger.log('warn', 'engine', '[TIME FLUX] Safety stop: Heat > 90%. Pausing game and disabling Time Flux.');
  engine.game.onToggleStateChange?.("time_flux", false);
  engine.game.pause();

  return { liveTicks: 0, fluxTicks: 0, totalTicks: 0, initialAccumulator };
}

function computeLiveTicks(engine, targetTickDuration, maxLiveTicks) {
  const rawLiveTicks = engine._frameTimeAccumulator / targetTickDuration;

  if (rawLiveTicks > maxLiveTicks) {
    const excessTime = (rawLiveTicks - maxLiveTicks) * targetTickDuration;
    engine.time_accumulator = (engine.time_accumulator || 0) + excessTime;
    engine._frameTimeAccumulator = maxLiveTicks * targetTickDuration;
    logger.log('debug', 'engine', `[TIME FLUX] Live time clamped, excess ${excessTime.toFixed(0)}ms added to accumulator`);
    return maxLiveTicks;
  }

  const liveTicks = Math.floor(rawLiveTicks);
  engine._frameTimeAccumulator -= liveTicks * targetTickDuration;
  return liveTicks;
}

function computeFluxTicks(engine, targetTickDuration, maxCatchupTicks, liveTicks, initialAccumulator) {
  let fluxTicks = 0;
  if (engine.game.time_flux && engine.time_accumulator > 0) {
    const availableFluxTicks = Math.floor(engine.time_accumulator / targetTickDuration);
    const maxFluxTicks = Math.max(0, maxCatchupTicks - liveTicks);
    fluxTicks = Math.min(availableFluxTicks, maxFluxTicks);

    engine.time_accumulator -= fluxTicks * targetTickDuration;
    if (engine.time_accumulator < ACCUMULATOR_EPSILON) engine.time_accumulator = 0;

    if (fluxTicks > 0 && engine._timeFluxCatchupRemainingTicks > 0) {
      engine._timeFluxCatchupRemainingTicks = Math.max(0, engine._timeFluxCatchupRemainingTicks - fluxTicks);
    }
    
    logger.log('debug', 'engine', `[TIME FLUX] Consuming banked time: ${fluxTicks} flux ticks, accumulator: ${initialAccumulator.toFixed(0)}ms -> ${engine.time_accumulator.toFixed(0)}ms`);
  }
  return fluxTicks;
}

function clampTotalTicks(engine, liveTicks, fluxTicks, targetTickDuration) {
  let totalTicks = liveTicks + fluxTicks;
  let l = liveTicks;
  let f = fluxTicks;

  if (!engine._heatUseSAB && totalTicks > MAX_TICKS_PER_FRAME_NO_SAB) {
    const excess = totalTicks - MAX_TICKS_PER_FRAME_NO_SAB;
    totalTicks = MAX_TICKS_PER_FRAME_NO_SAB;
    engine.time_accumulator += excess * targetTickDuration;
    f = Math.max(0, fluxTicks - excess);
    l = totalTicks - f;
  }

  if (engine._gameLoopWorkerPending && totalTicks > SLOW_MODE_TICKS_PER_FRAME) {
    const excess = totalTicks - SLOW_MODE_TICKS_PER_FRAME;
    engine.time_accumulator += excess * targetTickDuration;
    totalTicks = SLOW_MODE_TICKS_PER_FRAME;
    f = Math.min(fluxTicks, totalTicks);
    l = totalTicks - f;
    logger.log('debug', 'engine', `[SLOW MODE] Main thread behind worker queue, capping to ${totalTicks} ticks this frame`);
  }

  return { liveTicks: l, fluxTicks: f, totalTicks };
}

export function computeTickBudget(engine, deltaTime) {
  if (!engine._hasHeatActivity()) return { liveTicks: 0, fluxTicks: 0, totalTicks: 0, initialAccumulator: 0 };

  const targetTickDuration = engine.game.loop_wait;
  const maxLiveTicks = MAX_LIVE_TICKS;
  const maxCatchupTicks = engine._welcomeBackFastForward ? WELCOME_BACK_FF_MAX_TICKS : MAX_CATCHUP_TICKS;

  engine._frameTimeAccumulator = (engine._frameTimeAccumulator || 0) + deltaTime;
  const initialAccumulator = engine.time_accumulator || 0;
  
  const queuedTicksBefore = Math.floor(engine.time_accumulator / targetTickDuration);
  updateTimeFluxCatchupState(engine, queuedTicksBefore, targetTickDuration);

  const safetyResult = checkHeatSafetyStop(engine, initialAccumulator);
  if (safetyResult) return safetyResult;

  if (engine.game.paused) return { liveTicks: 0, fluxTicks: 0, totalTicks: 0, initialAccumulator };

  const liveTicks = computeLiveTicks(engine, targetTickDuration, maxLiveTicks);
  const fluxTicks = computeFluxTicks(engine, targetTickDuration, maxCatchupTicks, liveTicks, initialAccumulator);
  const { liveTicks: l, fluxTicks: f, totalTicks } = clampTotalTicks(engine, liveTicks, fluxTicks, targetTickDuration);

  const queuedTicksAfter = Math.floor(engine.time_accumulator / targetTickDuration);
  if (queuedTicksAfter === 0 && engine._timeFluxCatchupTotalTicks) {
    engine._timeFluxCatchupTotalTicks = 0;
    engine._timeFluxCatchupRemainingTicks = 0;
  }
  if (queuedTicksAfter === 0) engine._welcomeBackFastForward = false;

  return { liveTicks: l, fluxTicks: f, totalTicks, initialAccumulator };
}

export function syncCatchupStateFromQueuedTicks(engine) {
  const targetTickDuration = engine.game.loop_wait;
  const queuedTicks = Math.floor(engine.time_accumulator / targetTickDuration);

  if (!engine.game.time_flux || queuedTicks === 0) {
    engine._timeFluxCatchupTotalTicks = 0;
    engine._timeFluxCatchupRemainingTicks = 0;
    engine._welcomeBackFastForward = false;
  } else if (!engine._timeFluxCatchupTotalTicks) {
    engine._timeFluxCatchupTotalTicks = queuedTicks;
    engine._timeFluxCatchupRemainingTicks = queuedTicks;
  }
}

export function updateTimeFluxUI(engine) {
  const targetTickDuration = engine.game.loop_wait;
  const queuedTicks = Math.floor(engine.time_accumulator / targetTickDuration);

  let progress = 100;
  let isCatchingUp = false;
  if (engine.game.time_flux && !engine.game.paused && queuedTicks > 0 && engine._timeFluxCatchupTotalTicks > 0) {
    const total     = engine._timeFluxCatchupTotalTicks;
    const remaining = engine._timeFluxCatchupRemainingTicks;
    progress = Math.min(100, Math.max(0, ((total - remaining) / total) * 100));
    isCatchingUp = true;
  }
  engine.game.emit?.("timeFluxSimulationUpdate", { progress, isCatchingUp });
  engine.game.emit?.("timeFluxButtonUpdate", { queuedTicks });
}

function shouldProject(reactor, chunk) {
  return chunk > SAMPLE_TICKS &&
    (reactor.max_heat.lte(0) || reactor.current_heat.div(reactor.max_heat).toNumber() < VALVE_OVERFLOW_THRESHOLD);
}

function processSampleTicks(engine, sampleCount) {
  const reactor = engine.game.reactor;
  const state0 = {
    heat: reactor.current_heat,
    power: reactor.current_power,
    money: engine.game.state.current_money
  };
  
  for (let i = 0; i < sampleCount; i++) engine._processTick(1.0);
  
  const state1 = {
    heat: reactor.current_heat,
    power: reactor.current_power,
    money: engine.game.state.current_money
  };
  
  const avgHeatPerTick = state1.heat.sub(state0.heat).div(sampleCount).toNumber();
  const avgPowerPerTick = state1.power.sub(state0.power).div(sampleCount).toNumber();
  const avgMoneyPerTick = (state1.money && state1.money.sub ? state1.money.sub(state0.money).div(sampleCount).toNumber() : 0);
  
  return { avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick };
}

function isProjectionStableForChunk(engine, reactor, avgHeatPerTick, avgPowerPerTick) {
  const stableHeatRatio = VALVE_OVERFLOW_THRESHOLD;
  const heatRatioAfter = reactor.max_heat.gt(0) ? reactor.current_heat.div(reactor.max_heat).toNumber() : 0;
  
  return heatRatioAfter < stableHeatRatio && !reactor.has_melted_down &&
         Number.isFinite(avgHeatPerTick) && Number.isFinite(avgPowerPerTick);
}

function runProjectionChunk(engine, chunk) {
  const reactor = engine.game.reactor;
  const { avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick } = processSampleTicks(engine, SAMPLE_TICKS);
  
  const maxProjectionPerChunk = Math.max(0, TIME_FLUX_CHUNK_TICKS - SAMPLE_TICKS);
  const stable = isProjectionStableForChunk(engine, reactor, avgHeatPerTick, avgPowerPerTick);
  const N = stable ? Math.min(chunk - SAMPLE_TICKS, maxProjectionPerChunk) : 0;
  
  if (N > 0) {
    applyTimeFluxProjection(engine, N, avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick);
    return SAMPLE_TICKS + N;
  } else {
    const manualTicks = chunk - SAMPLE_TICKS;
    for (let i = 0; i < manualTicks; i++) engine._processTick(1.0);
    return chunk;
  }
}

export function runLoopIteration(engine, timestamp) {
  const deltaTime = timestamp - engine.last_timestamp;
  engine.last_timestamp = timestamp;

  if (engine._partCacheDirty) {
    engine._updatePartCaches?.();
  }

  if (processOfflineTime(engine, deltaTime)) {
    syncCatchupStateFromQueuedTicks(engine);
    updateTimeFluxUI(engine);
    return;
  }

  const budget = computeTickBudget(engine, deltaTime);
  const { liveTicks, fluxTicks, totalTicks, initialAccumulator } = budget;
  if (totalTicks > 0) {
    if (engine._useGameLoopWorker?.() && !engine._gameLoopWorkerPending && totalTicks >= GAME_LOOP_WORKER_MIN_TICKS) {
      const state = engine._serializeStateForGameLoopWorker?.();
      if (state) {
        engine._gameLoopWorkerTickId = (engine._gameLoopWorkerTickId || 0) + 1;
        engine._gameLoopTickContext = { tickId: engine._gameLoopWorkerTickId };
        state.tickId = engine._gameLoopWorkerTickId;
        state.tickCount = totalTicks;
        state.multiplier = 1;
        if (fluxTicks > 0) engine._timeFluxFastForward = true;
        engine._gameLoopWorkerPending = true;
        const w = engine._getGameLoopWorker?.();
        if (w) {
          const msg = { type: "tick", ...state };
          const result = GameLoopTickInputSchema.safeParse(msg);
          if (!result.success) {
            logger.log("warn", "engine", "[GameLoopWorker] Input validation failed:", fromError(result.error).toString());
            engine._gameLoopWorkerPending = false;
            engine._gameLoopTickContext = null;
            for (let i = 0; i < totalTicks; i++) engine._processTick(1.0);
            if (fluxTicks > 0) engine._timeFluxFastForward = false;
            syncCatchupStateFromQueuedTicks(engine);
            updateTimeFluxUI(engine);
            return;
          }
          const { heatBuffer, ...rest } = result.data;
          const serialized = superjson.serialize(rest);
          w.postMessage({ ...serialized, heatBuffer });
        } else {
          engine._gameLoopWorkerPending = false;
          engine._gameLoopTickContext = null;
          for (let i = 0; i < totalTicks; i++) engine._processTick(1.0);
        }
        if (fluxTicks > 0) engine._timeFluxFastForward = false;
      } else {
        for (let i = 0; i < liveTicks; i++) engine._processTick(1.0);
        if (fluxTicks > 0) {
          engine._timeFluxFastForward = true;
          runFluxTicksWithProjection(engine, fluxTicks);
          engine._timeFluxFastForward = false;
        }
      }
    } else {
      for (let i = 0; i < liveTicks; i++) engine._processTick(1.0);
      if (fluxTicks > 0) {
        engine._timeFluxFastForward = true;
        runFluxTicksWithProjection(engine, fluxTicks);
        engine._timeFluxFastForward = false;
      }
    }
    if (fluxTicks === 0 && initialAccumulator > 0) {
      logger.log('debug', 'engine', `[TIME FLUX] Processing live time only (${liveTicks} ticks), accumulator preserved at ${initialAccumulator.toFixed(0)}ms`);
    }
  }
  syncCatchupStateFromQueuedTicks(engine);
  updateTimeFluxUI(engine);
}

export function runFluxTicksWithProjection(engine, fluxTicks) {
  if (fluxTicks <= 0) return;
  const reactor = engine.game.reactor;
  let remaining = fluxTicks;
  
  while (remaining > 0 && !reactor.has_melted_down) {
    const chunk = Math.min(TIME_FLUX_CHUNK_TICKS, remaining);
    
    if (shouldProject(reactor, chunk)) {
      const processed = runProjectionChunk(engine, chunk);
      remaining -= processed;
    } else {
      for (let i = 0; i < chunk; i++) engine._processTick(1.0);
      remaining -= chunk;
    }
  }
}
