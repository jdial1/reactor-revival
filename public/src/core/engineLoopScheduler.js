import { fromError } from "zod-validation-error";
import { logger } from "../utils/logger.js";
import { GameLoopTickInputSchema } from "./schemas.js";

import {
  VALVE_OVERFLOW_THRESHOLD,
  MAX_TICKS_PER_FRAME_NO_SAB,
  SLOW_MODE_TICKS_PER_FRAME,
  TIME_FLUX_CHUNK_TICKS,
  SAMPLE_TICKS,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  HEAT_SAFETY_STOP_THRESHOLD,
  ACCUMULATOR_EPSILON,
  MAX_LIVE_TICKS,
  WELCOME_BACK_FF_MAX_TICKS,
  MAX_CATCHUP_TICKS,
} from "./constants.js";
import { applyTimeFluxProjection } from "./timeFluxProcessor.js";

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
  if (engine.game.time_flux && queuedTicks > 0 && engine._timeFluxCatchupTotalTicks > 0) {
    const total = engine._timeFluxCatchupTotalTicks;
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

function isProjectionStable(engine, reactor, avgHeatPerTick, avgPowerPerTick) {
  const stableHeatRatio = VALVE_OVERFLOW_THRESHOLD;
  const heatRatioAfter = reactor.max_heat.gt(0) ? reactor.current_heat.div(reactor.max_heat).toNumber() : 0;
  
  return heatRatioAfter < stableHeatRatio && !reactor.has_melted_down &&
         Number.isFinite(avgHeatPerTick) && Number.isFinite(avgPowerPerTick);
}

function runProjectionChunk(engine, chunk) {
  const reactor = engine.game.reactor;
  const { avgHeatPerTick, avgPowerPerTick, avgMoneyPerTick } = processSampleTicks(engine, SAMPLE_TICKS);
  
  const maxProjectionPerChunk = Math.max(0, TIME_FLUX_CHUNK_TICKS - SAMPLE_TICKS);
  const stable = isProjectionStable(engine, reactor, avgHeatPerTick, avgPowerPerTick);
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
    if (engine._useGameLoopWorker?.() && !engine._gameLoopWorkerPending) {
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
          w.postMessage(result.data);
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
