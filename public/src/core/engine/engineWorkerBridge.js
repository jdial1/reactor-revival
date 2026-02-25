import { toDecimal } from "../../utils/decimal.js";
import { logger } from "../../utils/logger.js";
import { HEAT_EPSILON } from "../heatCalculations.js";
import { applyGameLoopTickResult } from "../gameLoopWorkerBridge.js";

function onGameLoopWorkerMessage(engine, e) {
  const data = e.data;
  if (data?.type !== "tickResult") return;
  engine._gameLoopWorkerPending = false;
  const ctx = engine._gameLoopTickContext;
  engine._gameLoopTickContext = null;
  if (data.error) return;
  if (!ctx || data.tickId !== ctx.tickId) return;
  applyGameLoopTickResult(engine, data);
}

function validateWorkerResponse(engine, data) {
  const useSAB = data?.useSAB === true;
  if (!useSAB && !data?.heatBuffer) {
    engine._workerPending = false;
    return null;
  }
  if (!engine.game?.tileset) {
    engine._workerPending = false;
    return null;
  }
  if (!engine._workerPending) return null;
  const ctx = engine._workerTickContext;
  engine._workerPending = false;
  engine._workerTickContext = null;
  if (!ctx || data.tickId !== ctx.tickId) return null;
  return { ctx, useSAB };
}

function applyTransferredBuffers(engine, data) {
  engine._heatTransferHeat = new Float32Array(data.heatBuffer);
  if (data.containmentBuffer) engine._heatTransferContainment = new Float32Array(data.containmentBuffer);
  engine.game.tileset.heatMap = engine._heatTransferHeat;
  if (data.inletsData) engine._heatPayload_inlets = new Float32Array(data.inletsData);
  if (data.valvesData) engine._heatPayload_valves = new Float32Array(data.valvesData);
  if (data.valveNeighborData) engine._heatPayload_valveNeighbors = new Float32Array(data.valveNeighborData);
  if (data.exchangersData) engine._heatPayload_exchangers = new Float32Array(data.exchangersData);
  if (data.outletsData) engine._heatPayload_outlets = new Float32Array(data.outletsData);
}

function recordHeatFlowVectors(engine, transfers) {
  engine.heatFlowVisualizer.clear();
  const cols = engine.game.cols;
  for (const t of transfers || []) {
    engine.heatFlowVisualizer.addTransfer(t.fromIdx, t.toIdx, t.amount, cols);
  }
}

function handlePhysicsWorkerMessage(engine, data) {
  const result = validateWorkerResponse(engine, data);
  if (!result) return;
  const { ctx, useSAB } = result;
  if (!useSAB) applyTransferredBuffers(engine, data);
  const rawHeat = data.reactorHeat ?? engine.game.reactor.current_heat.toNumber();
  engine.game.reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  recordHeatFlowVectors(engine, data.transfers);
  const heat_add = ctx.heat_add + (data.heatFromInlets ?? 0);
  engine._continueTickAfterHeat(ctx.multiplier, ctx.power_add, heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick, data.explosionIndices);
}

export function ensureGameLoopWorker(engine) {
  if (engine._gameLoopWorker) return engine._gameLoopWorker;
  try {
    const url = new URL("../../worker/gameLoop.worker.js", import.meta.url).href;
    engine._gameLoopWorker = new Worker(url, { type: "module" });
    engine._gameLoopWorker.onmessage = (e) => onGameLoopWorkerMessage(engine, e);
  } catch (err) {
    engine._gameLoopWorkerFailed = true;
    logger.log('warn', 'engine', '[GameLoopWorker] Failed to create worker', err);
  }
  return engine._gameLoopWorker;
}

export function ensurePhysicsWorker(engine) {
  if (engine._worker) return engine._worker;
  try {
    const url = new URL("../../worker/physics.worker.js", import.meta.url).href;
    engine._worker = new Worker(url, { type: "module" });
    engine._worker.onmessage = (e) => {
      if (engine._workerHeartbeatId) {
        clearTimeout(engine._workerHeartbeatId);
        engine._workerHeartbeatId = null;
      }
      handlePhysicsWorkerMessage(engine, e.data);
    };
  } catch (err) {
    engine._workerFailed = true;
    logger.log('warn', 'engine', '[Worker] Failed to create physics worker', err);
  }
  return engine._worker;
}
