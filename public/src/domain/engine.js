import { HEAT_EPSILON, MELTDOWN_HEAT_MULTIPLIER, REACTOR_HEAT_STANDARD_DIVISOR } from "../constants/sim.js";
import {
  FRAGMENTATION_EXPLOSION_CHANCE,
  FRAGMENTATION_SALT_HULL_REPEL,
  FRAGMENTATION_SALT_STRUCTURAL,
  deterministicChance,
  deterministicPickIndex,
} from "../kernel/deterministic-tick-rng.js";
import { EngineStatus } from "../schema/stateSchemas.js";
import { fromError } from "zod-validation-error";
import { StatDispatcher } from "../statDispatcher.js";
import {
  toDecimal,
  toNumber,
  isTestEnv,
  getDecimal,
  FOUNDATIONAL_TICK_MS,
} from "../simUtils.js";
import { logger } from "../core/logger.js";
import { numFormat as fmt } from "../format/numbers.js";
import {
  HEAT_CALC_POOL_SIZE,
  GRID_SIZE_PHYSICS_WORKER_MAX_CELLS,
  WORKER_HEARTBEAT_MS,
  WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK,
  PAUSED_POLL_MS,
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
  MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME,
  MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME,
  AUTONOMIC_REPAIR_POWER_COST,
  AUTONOMIC_REPAIR_POWER_MIN,
  HEAT_REMOVAL_TARGET_RATIO,
  MULTIPLIER_FLOOR,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  MAX_LIVE_TICKS,
  MAX_CATCHUP_TICKS,
  OFFLINE_REPLAY_CHUNK_TICKS,
  SIMULATION_ERROR_MESSAGE,
  VISUAL_PARTICLE_HIGH_THRESHOLD,
  VISUAL_PARTICLE_MED_THRESHOLD,
  VISUAL_PARTICLE_HIGH_COUNT,
  VISUAL_PARTICLE_MED_COUNT,
} from "../constants/balance.js";
import {
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  VALVE_OVERFLOW_THRESHOLD,
  HULL_REPEL_FRACTION,
} from "../constants/sim.js";
import { performance } from "../dom/lit.js";
import {
  INLET_STRIDE,
  VALVE_STRIDE,
  EXCHANGER_STRIDE,
  OUTLET_STRIDE,
} from "../constants/heat-transfer.js";
import { SpatialRegistry } from "../spatial-adjacency.js";
import { snapshot, setDecimal, runSellPart } from "../state.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { recordSimEvent } from "./sim-events.js";
import { applyBlueprintLayoutDiff, layoutFromPlannerSlots, clipToGrid } from "./blueprint.js";
import {
  PhysicsTickResultSchema,
} from "../schema/index.js";
import { validateGameLoopTickInput, validatePhysicsTickInput, validateGameLoopTickResult, freezeWorkerTickSnapshot, lockSimulationForWorker, unlockSimulationAfterCommit, waitForSimulationUnlock } from "../worker/workerBoundary.js";
import {
  buildHeatPayload,
  HeatSystem,
  applyHeatThresholdSignals,
  applyHeatViewToTileset,
  copyFloat32View,
} from "./heat.js";
import { syncActivePartsAtTickBoundary, getTickPartList, getValveNeighborCache, bumpGridPartsRevision, invalidateTickParts } from "./part-classification.js";
import { applyTickVisualFx } from "./tick-visual-fx.js";
import { grantReward } from "./rewards.js";
import { purchaseUpgradeCore } from "./upgrade.js";
import {
  debitMoney,
  creditMoney,
  debitExoticParticles,
  tryDebitMoney,
  applyTransactionDeltas,
  creditMoneyWithPrestige,
  recordSessionPowerSold,
  recordSessionHeatDissipated,
  recordSessionPowerProduced,
} from "./economy-intents.js";
import {
  computeTileVentPowerDemand,
  shouldScramForInsufficientVentPower,
} from "../logic-heat-transfer.js";
import { applyToggleStateChange } from "../state.js";

const engineWorkers = new WeakMap();
const GRID_INTENT_ACTIONS = new Set(["PLACE_PART", "SELL_PART", "APPLY_BLUEPRINT", "COMMIT_BLUEPRINT_PLANNER"]);

import { TICK_PHASE_ORDER as CORE_TICK_PHASES } from "./tick-phases.js";

export const TICK_PHASE_ORDER = Object.freeze([...CORE_TICK_PHASES]);

export class TickOrchestrator {
  constructor(engine) {
    this.engine = engine;
    this._handlers = new Map();
  }

  register(phase, handler) {
    if (TICK_PHASE_ORDER.includes(phase)) this._handlers.set(phase, handler);
  }

  async runPhase(phase, ctx) {
    const handler = this._handlers.get(phase);
    if (handler) return handler(ctx);
  }

  runPhaseSync(phase, ctx) {
    const handler = this._handlers.get(phase);
    if (handler) return handler(ctx);
  }

  async runPhases(phases, ctx) {
    for (let i = 0; i < phases.length; i++) {
      await this.runPhase(phases[i], ctx);
    }
  }

  async runMainThreadTick(ctx) {
    await this.runPhases(TICK_PHASE_ORDER, ctx);
  }
}

export function getEngineWorker(engine) {
  return engineWorkers.get(engine) ?? null;
}

export function registerEngineWorker(engine, worker) {
  engineWorkers.set(engine, worker);
}

function terminateEngineWorker(engine) {
  const worker = getEngineWorker(engine);
  if (worker) {
    try {
      worker.terminate();
    } catch (_) {}
  }
  engineWorkers.delete(engine);
  if (engine) {
    engine._engineWorker = null;
    engine._gameLoopWorker = null;
    engine._worker = null;
  }
}

function drainStaleGameLoopWorkerPending(engine) {
  if (!engine._gameLoopWorkerPending) return false;
  const since = engine._gameLoopWorkerPendingSince || 0;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const overdueMs = since > 0 && now > 0 ? now - since : 0;
  if (overdueMs <= 5000) return false;
  logger.log("warn", "engine", "[ReactorTick] discarding stale game-loop worker pending", {
    overdueMs: Math.round(overdueMs),
    tickId: engine._gameLoopTickContext?.tickId,
  });
  cancelPendingGameLoopWorkerTick(engine);
  terminateEngineWorker(engine);
  return true;
}

export function postWorkerMessage(engine, message, transfer = []) {
  if (!engine || typeof Worker === "undefined") return false;
  const worker = engineWorkers.get(engine);
  if (!worker) return false;
  try {
    Worker.prototype.postMessage.call(worker, message, transfer);
    return true;
  } catch (err) {
    logger.log("warn", "engine", "[EngineWorker] postMessage failed", err);
    return false;
  }
}

function partToRow(part) {
  const power = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power))
    ? part.power
    : (part.base_power ?? 0);
  const heat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat))
    ? part.heat
    : (part.base_heat ?? 0);
  const row = {
    id: part.id,
    containment: part.containment ?? 0,
    vent: part.vent ?? 0,
    power,
    heat,
    base_power: part.base_power ?? 0,
    base_heat: part.base_heat ?? 0,
    category: part.category ?? "",
    ticks: part.ticks ?? 0,
    type: part.type ?? "",
    ep_heat: part.ep_heat ?? 0,
    level: part.level ?? 1,
    transfer: part.transfer ?? 0,
    cell_pack_M: part.cell_pack_M ?? 1,
    cell_count_C: part.cell_count_C ?? part.cell_count ?? 1,
    cell_count: part.cell_count ?? 1,
  };
  if (part.category === "reflector") {
    const v = part.neighbor_pulse_value;
    row.neighbor_pulse_value = typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
  }
  row.range = part.range ?? 1;
  row.topologyType = part.topologyType || "Manhattan";
  row.vent_consumes_power = !!part.vent_consumes_power;
  row.outlet_respect_neighbor_cap = !!part.outlet_respect_neighbor_cap;
  row.traits = part.traits || [];
  row.trait_mask = part.trait_mask || 0;
  return row;
}

function buildPartTable(ts) {
  const game = ts.game;
  const rows = game.rows;
  const cols = game.cols;
  const partIdToIndex = {};
  const partTable = [];
  
  if (game.statDispatcher) {
    if (game.statDispatcher.derivedTable.length === 0) {
      game.statDispatcher.derive();
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = ts.getTile(row, col);
      if (!tile?.part) continue;
      const part = tile.part;
      if (partIdToIndex[part.id] !== undefined) continue;
      partIdToIndex[part.id] = partTable.length;
      
      let rowData = game.statDispatcher ? game.statDispatcher.getPartRow(part.id) : null;
      if (!rowData) rowData = partToRow(part);
      partTable.push(rowData);
    }
  }
  return { partIdToIndex, partTable };
}

function buildPartLayout(ts, partIdToIndex) {
  const game = ts.game;
  const rows = game.rows;
  const cols = game.cols;
  const layout = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = ts.getTile(row, col);
      if (!tile?.part) continue;
      const part = tile.part;
      const idx = partIdToIndex[part.id];
      if (idx === undefined) continue;
      const transferRate = typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
      const ventRate = typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
      const game = ts.game;
      const hasProtiumLoader = game?.upgradeset?.getUpgrade("experimental_protium_loader")?.level > 0;
      const isProtium = part.type === "protium";
      const autoBuyEligible = !!(part.perpetual || (isProtium && hasProtiumLoader));
      let autoBuyReplaceCost = 0;
      if (autoBuyEligible && typeof part.getAutoReplacementCost === "function") {
        const c = part.getAutoReplacementCost();
        autoBuyReplaceCost = typeof c?.toNumber === "function" ? c.toNumber() : Number(c) || 0;
      }
      const maxTicks = part.ticks ?? 0;
      layout.push({
        r: tile.row,
        c: tile.col,
        partIndex: idx,
        ticks: tile.ticks ?? 0,
        activated: !!tile.activated,
        transferRate,
        ventRate,
        autoBuyEligible,
        autoBuyReplaceCost,
        maxTicks,
      });
    }
  }
  return layout;
}

function buildPartSnapshot(ts) {
  const { partIdToIndex, partTable } = buildPartTable(ts);
  const partLayout = buildPartLayout(ts, partIdToIndex);
  return { partTable, partLayout };
}

function cloneHeatBufferForWorkerPost(buf) {
  if (!buf) return new ArrayBuffer(0);
  if (buf instanceof ArrayBuffer) return buf.slice(0);
  return new Float32Array(new Float32Array(buf)).buffer;
}

function clonePartTableForWorker(partTable) {
  return partTable.map((row) => {
    const copy = { ...row };
    if (Array.isArray(row.traits)) copy.traits = row.traits.slice();
    return copy;
  });
}

function clonePartLayoutForWorker(partLayout) {
  return partLayout.map((entry) => ({ ...entry }));
}

function buildWorkerLayoutEntry(game, payload, partIdToIndex, layoutMap, r, c, part) {
  let idx = partIdToIndex[part.id];
  if (idx === undefined) {
    idx = payload.partTable.length;
    partIdToIndex[part.id] = idx;
    payload.partTable.push(partToRow(part));
  }
  const tile = game.tileset.getTile(r, c);
  const transferRate = tile?.enabled && typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
  const ventRate = tile?.enabled && typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
  const partPower = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power)) ? part.power : (part.base_power ?? 0);
  const partHeat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat)) ? part.heat : (part.base_heat ?? 0);
  const ticks = part.category === "cell"
    ? Math.max(1, Number(part.ticks ?? part.base_ticks) || 1)
    : (tile?.ticks ?? 0);
  const activated = tile?.activated !== false;
  const isProtium = part.type === "protium";
  const hasProtiumLoader = game?.upgradeset?.getUpgrade("experimental_protium_loader")?.level > 0;
  const autoBuyEligible = !!(part.perpetual || (isProtium && hasProtiumLoader));
  let autoBuyReplaceCost = 0;
  if (autoBuyEligible && typeof part.getAutoReplacementCost === "function") {
    const c0 = part.getAutoReplacementCost();
    autoBuyReplaceCost = typeof c0?.toNumber === "function" ? c0.toNumber() : Number(c0) || 0;
  }
  const maxTicks = part.ticks ?? 0;
  const tilePower = part.category === "cell" && ticks > 0 ? partPower : (typeof tile?.power === "number" ? tile.power : partPower);
  const tileHeat = part.category === "cell" && ticks > 0 ? partHeat : (typeof tile?.heat === "number" ? tile.heat : partHeat);
  layoutMap.set(`${r},${c}`, {
    r,
    c,
    partIndex: idx,
    ticks,
    activated,
    transferRate,
    ventRate,
    power: tilePower,
    heat: tileHeat,
    autoBuyEligible,
    autoBuyReplaceCost,
    maxTicks,
  });
}

function mergeLayoutGridIntoWorkerPayload(payload, game, layout) {
  if (!layout || !game?.partset) return payload;
  const clipped = clipToGrid(layout, game.rows, game.cols);
  const partIdToIndex = {};
  for (let i = 0; i < payload.partTable.length; i++) {
    partIdToIndex[payload.partTable[i].id] = i;
  }
  const layoutMap = new Map();
  for (let r = 0; r < clipped.length; r++) {
    const row = clipped[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (!cell?.id) continue;
      const part = game.partset.getPartById(cell.id);
      if (!part) continue;
      buildWorkerLayoutEntry(game, payload, partIdToIndex, layoutMap, r, c, part);
    }
  }
  payload.partLayout = Array.from(layoutMap.values());
  return payload;
}

function mergeBlueprintPlannerIntoWorkerPayload(payload, game) {
  const slots = game.blueprintPlanner?.slots;
  if (!slots || typeof slots !== "object") return payload;
  const partIdToIndex = {};
  for (let i = 0; i < payload.partTable.length; i++) {
    partIdToIndex[payload.partTable[i].id] = i;
  }
  const layoutMap = new Map();
  for (let j = 0; j < payload.partLayout.length; j++) {
    const e = payload.partLayout[j];
    layoutMap.set(`${e.r},${e.c}`, { ...e });
  }
  for (const key of Object.keys(slots)) {
    const partId = slots[key];
    if (!partId) continue;
    const part = game.partset.getPartById(partId);
    if (!part) continue;
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    if (!Number.isFinite(r) || !Number.isFinite(c)) continue;
    buildWorkerLayoutEntry(game, payload, partIdToIndex, layoutMap, r, c, part);
  }
  payload.partLayout = Array.from(layoutMap.values());
  return payload;
}

export const BLUEPRINT_PROJECTION_WARMUP_TICKS = 500;
export const BLUEPRINT_PROJECTION_SAMPLE_TICKS = 100;

function buildProjectionTickPayload(engine, game, base, options = {}) {
  const warmup = Math.max(0, Number(options.warmupTicks ?? BLUEPRINT_PROJECTION_WARMUP_TICKS) | 0);
  const sample = Math.max(1, Number(options.sampleTicks ?? BLUEPRINT_PROJECTION_SAMPLE_TICKS) | 0);
  const payload = {
    ...base,
    heatBuffer: cloneHeatBufferForWorkerPost(base.heatBuffer),
    partTable: clonePartTableForWorker(base.partTable),
    partLayout: clonePartLayoutForWorker(base.partLayout),
    tickCount: warmup + sample,
    multiplier: 1,
    mode: "projection",
    auto_buy: false,
    autoSell: false,
    projectionWarmupTicks: warmup,
    projectionSampleTicks: sample,
    projectionRecordTicks: options.recordTicks === true,
  };
  if (options.layout) mergeLayoutGridIntoWorkerPayload(payload, game, options.layout);
  else mergeBlueprintPlannerIntoWorkerPayload(payload, game);
  return payload;
}

export function postGameLoopProjectionQuery(engine, game, options = {}) {
  return new Promise((resolve) => {
    if (!engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) {
      resolve(null);
      return;
    }
    const done = (data) => {
      if (!data || data.error) resolve(null);
      else resolve(data);
    };
    const trySend = () => {
      if (engine._gameLoopWorkerPending) {
        queueMicrotask(trySend);
        return;
      }
      const w = engine._getGameLoopWorker();
      if (!w) {
        resolve(null);
        return;
      }
      const base = serializeStateForGameLoopWorker(engine, { drainIntents: false });
      if (!base) {
        resolve(null);
        return;
      }
      const payload = buildProjectionTickPayload(engine, game, base, options);
      engine._projectionQueryTickId = (engine._projectionQueryTickId || 0) + 1;
      const tickId = 1_000_000_000 + engine._projectionQueryTickId;
      payload.tickId = tickId;
      payload.type = "tick";
      engine._projectionResolvers.set(tickId, done);
      const result = validateGameLoopTickInput(payload, "GameLoopWorker send (projection)");
      if (!result.success) {
        engine._projectionResolvers.delete(tickId);
        resolve(null);
        return;
      }
      const { heatBuffer, integrityBuffer, orthoNeighborOffsets, orthoNeighborIndices, ...rest } = result.data;
      const transfer = [];
      if (heatBuffer) transfer.push(heatBuffer);
      if (integrityBuffer) transfer.push(integrityBuffer);
      if (orthoNeighborOffsets) transfer.push(orthoNeighborOffsets);
      if (orthoNeighborIndices) transfer.push(orthoNeighborIndices);
      postWorkerMessage(engine, { ...rest, type: "tick", heatBuffer, integrityBuffer, orthoNeighborOffsets, orthoNeighborIndices }, transfer);
    };
    trySend();
  });
}

function buildReactorStatePayload(reactor) {
  const game = reactor.game;
  return {
    current_heat: toNumber(reactor.current_heat ?? 0),
    current_power: toNumber(reactor.current_power ?? 0),
    max_heat: toNumber(reactor.max_heat ?? 0),
    max_power: toNumber(reactor.max_power ?? 0),
    auto_sell_multiplier: reactor.auto_sell_multiplier ?? 0,
    sell_price_multiplier: reactor.sell_price_multiplier ?? 1,
    power_overflow_to_heat_ratio: reactor.power_overflow_to_heat_ratio ?? 1,
    power_multiplier: reactor.power_multiplier ?? 1,
    heat_controlled: (reactor.heat_controlled || game.state?.heat_control) ? 1 : 0,
    vent_multiplier_eff: reactor.vent_multiplier_eff ?? 0,
    stirling_multiplier: reactor.stirling_multiplier ?? 0,
    manual_heat_reduce: toNumber(reactor.manual_heat_reduce ?? game?.base_manual_heat_reduce ?? 1),
    manual_vent_percent: toNumber(reactor.manual_vent_percent ?? 0),
    hull_integrity: game.state?.hull_integrity ?? 100,
    failure_state: game.state?.failure_state ?? "nominal",
  };
}

function ensureOrthoAdjacencyForEngine(engine) {
  const game = engine.game;
  const ts = game.tileset;
  if (!ts?.heatMap) return;
  const rows = game.gridManager.rows;
  const cols = game.gridManager.cols;
  const stride = ts.max_cols ?? game.gridManager.cols;
  const gridLen = ts.heatMap.length;
  
  if (!engine.spatialRegistry) {
    engine.spatialRegistry = new SpatialRegistry();
  }
  const changed = engine.spatialRegistry.resize(rows, cols, stride, gridLen);
  
  if (changed) {
    engine._orthoNeighborOffsets = engine.spatialRegistry.neighborOffsets;
    engine._orthoNeighborIndices = engine.spatialRegistry.neighborIndices;
  }
}

export function drainIntentQueueAtTickStart(engine, tickCtx = null) {
  const game = engine.game;
  const q = game.state?.intent_queue;
  const gridIntents = [];
  const workerEconomyIntents = [];
  if (!q?.length) return { gridIntents, workerEconomyIntents };
  const keep = [];
  for (let i = 0; i < q.length; i++) {
    const intent = q[i];
    if (intent.action === "PAUSE_TOGGLE") game.togglePause?.();
    else if (intent.action === "SET_TOGGLE") {
      const { toggleName, value } = intent.payload || {};
      if (toggleName) applyToggleStateChange(game, toggleName, !!value);
    }
    else if (intent.action === "SELL_POWER" || intent.action === "VENT_HEAT") {
      workerEconomyIntents.push(intent);
      queueEconomyIntent(engine, intent, tickCtx);
    }
    else if (intent.action === "GRANT_REWARD") applyGrantRewardIntent(game, intent.payload);
    else if (intent.action === "PURCHASE_UPGRADE") applyPurchaseUpgradeIntent(game, intent.payload);
    else if (intent.action === "DEBIT_MONEY") debitMoney(game, intent.payload?.amount);
    else if (intent.action === "CREDIT_MONEY") creditMoney(game, intent.payload?.amount);
    else if (intent.action === "DEBIT_LAYOUT_COST") {
      const { money = 0, ep = 0 } = intent.payload || {};
      if (money > 0) debitMoney(game, money);
      if (ep > 0) debitExoticParticles(game, ep);
    }
    else if (GRID_INTENT_ACTIONS.has(intent.action)) gridIntents.push(intent);
    else keep.push(intent);
  }
  q.length = 0;
  for (let j = 0; j < keep.length; j++) q.push(keep[j]);
  if (gridIntents.length) drainGridIntentsSync(game, engine, gridIntents);
  return { gridIntents, workerEconomyIntents };
}

function queueEconomyIntent(engine, intent, tickCtx) {
  if (intent.action === "SELL_POWER") {
    if (tickCtx) tickCtx.pendingManualSell = true;
    else engine._pendingManualSell = true;
  } else if (intent.action === "VENT_HEAT") {
    if (tickCtx) tickCtx.pendingManualVent = true;
    else engine._pendingManualVent = true;
  }
}

export function processPendingEconomyActions(engine, tickCtx = null) {
  const game = engine.game;
  const ctx = tickCtx || engine._currentTickCtx || {};
  if (ctx.pendingManualSell || engine._pendingManualSell) {
    game.sell_action();
    ctx.pendingManualSell = false;
    engine._pendingManualSell = false;
  }
  if (ctx.pendingManualVent || engine._pendingManualVent) {
    game.manual_reduce_heat_action();
    ctx.pendingManualVent = false;
    engine._pendingManualVent = false;
  }
}

export function serializeStateForGameLoopWorker(engine, opts = {}) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  if (!ts?.heatMap) return null;
  ensureOrthoAdjacencyForEngine(engine);
  const stateSnapshot = game.state ? snapshot(game.state) : null;
  const { partTable, partLayout } = buildPartSnapshot(ts);
  const autoSellFromStore = stateSnapshot?.auto_sell !== undefined;
  const rawMoney = stateSnapshot?.current_money;
  const currentMoney = rawMoney != null ? (typeof rawMoney === "number" || typeof rawMoney === "string" ? rawMoney : toNumber(rawMoney)) : undefined;
  const heatBuffer = new Float32Array(ts.heatMap).buffer.slice(0);
  const integrityBuffer = new Float32Array(ts.integrityMap).buffer.slice(0);
  const oo = engine._orthoNeighborOffsets;
  const oi = engine._orthoNeighborIndices;
  const orthoNeighborOffsets = oo.buffer.slice(oo.byteOffset, oo.byteOffset + oo.byteLength);
  const orthoNeighborIndices = oi.buffer.slice(oi.byteOffset, oi.byteOffset + oi.byteLength);
  const autoBuyOn = autoSellFromStore
    ? !!stateSnapshot?.auto_buy
    : !!(game.reactor?.auto_buy_enabled ?? game.state?.auto_buy);
  const autoBuyUnlocked = (game.upgradeset?.getUpgrade("auto_buy_operator")?.level ?? 0) > 0;
  const prestigeMoneyMultiplier =
    typeof game.getPrestigeMultiplier === "function" ? game.getPrestigeMultiplier() : 1;
  const drainIntents = opts.drainIntents !== false;
  let intents = [];
  if (drainIntents) {
    const drained = drainIntentQueueAtTickStart(engine);
    intents = drained.workerEconomyIntents ?? [];
  }
  const workerSnapshot = {
    current_money: currentMoney,
    heatBuffer,
    integrityBuffer,
    orthoNeighborOffsets,
    orthoNeighborIndices,
    partLayout: clonePartLayoutForWorker(partLayout),
    partTable: clonePartTableForWorker(partTable),
    reactorState: buildReactorStatePayload(reactor),
    rows: game.gridManager.rows,
    cols: game.gridManager.cols,
    maxCols: ts.max_cols ?? game.gridManager.cols,
    autoSell: autoSellFromStore ? !!stateSnapshot?.auto_sell : !!game.state?.auto_sell,
    auto_buy: autoBuyOn,
    auto_buy_unlocked: autoBuyUnlocked,
    prestigeMoneyMultiplier,
    multiplier: 1,
    tickCount: 1,
    engine_tick_count: engine.tick_count,
    intents,
  };
  return workerSnapshot;
}

function applyExplosionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (tile?.part) engine.handleComponentExplosion(tile);
  });
}

function applyDepletionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  const game = engine.game;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (!tile?.part) return;
    const part = tile.part;
    if (part.type === "protium") {
      game.protium_particles += part.cell_count ?? 0;
    }
    engine.handleComponentDepletion(tile);
  });
}

function applyTileUpdates(ts, tileUpdates) {
  if (!Array.isArray(tileUpdates)) return;
  tileUpdates.forEach((u) => {
    const tile = ts.getTile(u.r, u.c);
    if (!tile) return;
    if (typeof u.ticks === "number") tile.ticks = u.ticks;
  });
}

function applyGrantRewardIntent(game, payload) {
  grantReward(game, payload);
}

function applyPurchaseUpgradeIntent(game, payload) {
  const upgradeId = payload?.upgradeId;
  if (!upgradeId || !game.upgradeset) return;
  purchaseUpgradeCore(game.upgradeset, upgradeId);
}

function recordEngineTickCount(engine) {
  if (engine.game?.state) {
    engine.game.state.engine_tick_count = engine.tick_count;
  }
}

function syncUIAfterTick(engine, data, reactor) {
  const norm = Math.max(0.001, data.tickCount || 1);
  const game = engine.game;
  if (game?.state) {
    game.state.power_delta_per_tick = (data.powerDelta ?? 0) / norm;
    game.state.heat_delta_per_tick = (data.heatDelta ?? 0) / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
    logger.log("debug", "engine", "[GameLoopWorker] syncUIAfterTick state updated:", {
      current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
      power_delta_per_tick: game.state.power_delta_per_tick,
      tickCount: data.tickCount
    });
  }
  recordEngineTickCount(engine);
  reactor.updateStats();
}

function syncSessionAfterTick(engine, data) {
  engine.tick_count += data.tickCount || 1;
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
}

export function tryDeductMoneyGameLoop(game, amount) {
  const engine = game?.engine;
  const n = Number(amount);
  if (!engine || !(n > 0)) {
    return Promise.resolve({ ok: true, balanceAfter: toNumber(game?.state?.current_money) });
  }
  const syncDeduct = () => tryDebitMoney(game, n);
  if (!engine._gameLoopWorkerTickSeen || !engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) {
    return Promise.resolve(syncDeduct());
  }
  return new Promise((resolve) => {
    const id = ++engine._economyCmdSeq;
    engine._economyResolvers.set(id, resolve);
    const w = engine._getGameLoopWorker();
    if (!w) {
      engine._economyResolvers.delete(id);
      resolve(syncDeduct());
      return;
    }
    postWorkerMessage(engine, {
      type: "economyCommand",
      cmd: "TRY_DEDUCT",
      id,
      amount: n,
      balanceHint: toNumber(game.state.current_money),
    });
  });
}

export function requestTransactionGameLoop(game, { moneyDelta = 0, epDelta = 0 }) {
  const engine = game?.engine;
  const mDelta = Number(moneyDelta);
  const eDelta = Number(epDelta);
  if (!engine || (mDelta === 0 && eDelta === 0)) {
    return Promise.resolve({ ok: true, balanceAfter: toNumber(game?.state?.current_money), epAfter: toNumber(game?.state?.total_exotic_particles) });
  }
  const syncTx = () => applyTransactionDeltas(game, mDelta, eDelta);
  if (!engine._gameLoopWorkerTickSeen || !engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) {
    return Promise.resolve(syncTx());
  }
  return new Promise((resolve) => {
    const id = ++engine._economyCmdSeq;
    engine._economyResolvers.set(id, resolve);
    const w = engine._getGameLoopWorker();
    if (!w) {
      engine._economyResolvers.delete(id);
      resolve(syncTx());
      return;
    }
    postWorkerMessage(engine, {
      type: "economyCommand",
      cmd: "REQUEST_TRANSACTION",
      id,
      moneyDelta: mDelta,
      epDelta: eDelta,
      balanceHint: toNumber(game.state.current_money),
      epHint: toNumber(game.state.total_exotic_particles),
    });
  });
}

export function tryCreditMoneyGameLoop(game, amount) {
  const engine = game?.engine;
  const n = Number(amount);
  if (!engine || !(n > 0)) {
    return Promise.resolve({ ok: true, balanceAfter: toNumber(game?.state?.current_money) });
  }
  const syncCredit = () => {
    creditMoney(game, n);
    return { ok: true, balanceAfter: toNumber(game.state.current_money) };
  };
  if (!engine._gameLoopWorkerTickSeen || !engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) {
    return Promise.resolve(syncCredit());
  }
  return new Promise((resolve) => {
    const id = ++engine._economyCmdSeq;
    engine._economyResolvers.set(id, resolve);
    const w = engine._getGameLoopWorker();
    if (!w) {
      engine._economyResolvers.delete(id);
      resolve(syncCredit());
      return;
    }
    postWorkerMessage(engine, {
      type: "economyCommand",
      cmd: "CREDIT",
      id,
      amount: n,
      balanceHint: toNumber(game.state.current_money),
    });
  });
}

export function applyGameLoopTickResult(engine, data) {
  if (!data || data.error) return;
  const result = validateGameLoopTickResult(data, "GameLoopWorker receive");
  if (!result.success) {
    logger.log("warn", "engine", "[GameLoopWorker] Result validation failed:", fromError(result.error).toString());
    return;
  }
  data = result.data;
  const game = engine.game;
  const reactor = game.reactor;
  const ts = game.tileset;
  const maxCols = ts?.max_cols ?? game.gridManager.cols;
  const rawHeat = data.reactorHeat ?? 0;
  const rawPower = data.reactorPower ?? 0;
  logger.log("debug", "engine", `[Worker-In] Received Tick #${data.tickId}`, {
    pwr: rawPower,
    ht: rawHeat,
    earned: data.moneyEarned,
    deltas: { p: data.powerDelta, h: data.heatDelta },
    burst: data.tickCount
  });
  reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  reactor.current_power = toDecimal(rawPower);
  logger.log("debug", "engine", "[GameLoopWorker] reactor state after apply:", {
    current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
    game_state_current_power: game.state?.current_power?.toNumber?.() ?? game.state?.current_power
  });
  if (data.heatBuffer && ts?.heatMap) {
    applyHeatViewToTileset(ts, new Float32Array(data.heatBuffer));
  }
  if (data.integrityBuffer && ts?.integrityMap) {
    const incoming = new Float32Array(data.integrityBuffer);
    if (incoming.length === ts.integrityMap.length) {
      try {
        ts.integrityMap.set(incoming);
      } catch {
        copyFloat32View(ts.integrityMap, incoming, ts.integrityMap.length);
      }
    }
  }
  applyExplosionIndices(engine, ts, data.explosionIndices, maxCols);
  applyTileUpdates(ts, data.tileUpdates);
  applyDepletionIndices(engine, ts, data.depletionIndices, maxCols);
  if (game.state && data.hull_integrity !== undefined) {
    game.state.hull_integrity = data.hull_integrity;
    game.state.failure_state = data.failure_state;
  }
  if (game.state && data.authoritativeCurrentMoney != null) {
    setDecimal(game.state, "current_money", toDecimal(data.authoritativeCurrentMoney));
  }
  if (data.traitTallies) {
    reactor.traitTallies = data.traitTallies;
  }
  if (data.partTallies) {
    reactor.partTallies = data.partTallies;
  }
  if (data.categoryTallies) {
    reactor.categoryTallies = data.categoryTallies;
  }
  if (data.sustainedPower1kCount !== undefined) {
    reactor.sustainedPower1kCount = data.sustainedPower1kCount;
  }
  if (data.masterHighHeatCount !== undefined) {
    reactor.masterHighHeatCount = data.masterHighHeatCount;
  }
  if (data.sensoryMask) {
    recordSimEvent(game, {
      type: "SENSORY_MASK",
      mask: data.sensoryMask,
      currentHeat: reactor.current_heat,
      maxHeat: reactor.max_heat,
    });
  }
  engine._gameLoopWorkerTickSeen = true;
  reactor.checkMeltdown();
  applyHeatThresholdSignals(game, engine, data);
  if (game.state) {
    const ps = Number(data.powerSold ?? 0);
    const vh = Number(data.ventHeatDissipated ?? 0);
    if (ps > 0) recordSessionPowerSold(game, ps);
    if (vh > 0) recordSessionHeatDissipated(game, vh);
  }
  syncSessionAfterTick(engine, data);
  if (data.autoBuyEvents?.length) {
    for (let abi = 0; abi < data.autoBuyEvents.length; abi++) {
      const ev = data.autoBuyEvents[abi];
      recordSimEvent(game, {
        type: "AUTO_BUY_DEBIT",
        row: ev.r,
        col: ev.c,
        text: `-$${fmt(Number(ev.cost) || 0)}`,
      });
    }
  }
  drainGameEffects(game, () => game?.ui);
  queueMicrotask(() => {
    syncUIAfterTick(engine, data, reactor);
    game.ui?.snapUiDisplayValuesFromState?.();
  });
}

export function applyWorkerTickResult(engine, data) {
  if (!engine) return;
  try {
    applyGameLoopTickResult(engine, data);
  } finally {
    unlockSimulationAfterCommit(engine);
    const batchResolver = engine._gameLoopBatchResolver;
    if (batchResolver) {
      engine._gameLoopBatchResolver = null;
      if (data?.error) batchResolver.reject(new Error(data.message || "tickResultError"));
      else batchResolver.resolve(data);
    }
    drainQueuedWorkerTickBatches(engine);
  }
}

function usesWorkerEconomy(engine) {
  return (
    engine._gameLoopWorkerTickSeen &&
    typeof engine._useGameLoopWorker === "function" &&
    engine._useGameLoopWorker() &&
    !engine._gameLoopWorkerFailed
  );
}

async function applyPlacePartIntent(game, engine, payload) {
  const partId = payload?.partId;
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const part = game.partset?.getPartById?.(partId);
  const tile = game.tileset?.getTile(row, col);
  if (!part || !tile) return null;
  const costNum = Number(part.cost) || 0;
  if (usesWorkerEconomy(engine)) {
    const r = await tryDeductMoneyGameLoop(game, costNum);
    if (!r.ok) {
      recordSimEvent(game, { type: "INSUFFICIENT_FUNDS", row, col });
      drainGameEffects(game, () => game?.ui);
      return null;
    }
    setDecimal(game.state, "current_money", toDecimal(r.balanceAfter));
  } else {
    const money = game.state.current_money;
    const canAfford = money != null && typeof money.gte === "function"
      ? money.gte(part.cost)
      : Number(money) >= Number(part.cost);
    if (!canAfford) {
      recordSimEvent(game, { type: "INSUFFICIENT_FUNDS", row, col });
      drainGameEffects(game, () => game?.ui);
      return null;
    }
    debitMoney(game, costNum);
  }
  const partPlaced = await tile.setPart(part);
  if (partPlaced) return { row, col, part };
  if (usesWorkerEconomy(engine)) {
    const c = await tryCreditMoneyGameLoop(game, costNum);
    setDecimal(game.state, "current_money", toDecimal(c.balanceAfter));
  } else {
    creditMoney(game, costNum);
  }
  recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor", col });
  drainGameEffects(game, () => game?.ui);
  return null;
}

function applySellPartIntent(game, payload) {
  const row = payload?.row | 0;
  const col = payload?.col | 0;
  const tile = game.tileset?.getTile(row, col);
  if (!tile?.part || tile.part.isSpecialTile) return null;
  runSellPart(game, tile);
  return { row, col };
}

function applyBlueprintIntent(game, payload) {
  const layout = payload?.layout;
  if (!layout) return { ok: false };
  if (payload?.sellExisting) {
    game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) runSellPart(game, tile);
    });
  }
  const sellCredit = payload?.sellExisting ? 0 : 0;
  const result = applyBlueprintLayoutDiff(game, layout, {
    skipCostDeduction: payload?.skipCostDeduction === true,
    partial: payload?.partial === true,
    sellCredit,
  });
  if (!result.ok && result.reason === "deficit") {
    game.emit?.("blueprintApplyDeficit", result);
    recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
    drainGameEffects(game, () => game?.ui);
  }
  return result;
}

function applyBlueprintPlannerIntent(game, payload = {}) {
  const layout = layoutFromPlannerSlots(game);
  if (!layout) return { ok: false, reason: "empty" };
  const entries = Object.entries(game.blueprintPlanner?.slots || {}).filter(([, partId]) => partId);
  for (let i = 0; i < entries.length; i++) {
    const [key, partId] = entries[i];
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    const part = game.partset.getPartById(partId);
    const tile = game.tileset.getTile(r, c);
    if (!part || !tile?.enabled || !game.unlockManager.isPartUnlocked(part)) return { ok: false, reason: "unlock" };
    if (part.erequires) {
      const u = game.upgradeset.getUpgrade(part.erequires);
      if (!u || u.level <= 0) return { ok: false, reason: "unlock" };
    }
  }
  const result = applyBlueprintLayoutDiff(game, layout, { partial: payload.partial === true });
  if (!result.ok) {
    if (result.reason === "deficit") game.emit?.("blueprintApplyDeficit", result);
    recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
    drainGameEffects(game, () => game?.ui);
    return result;
  }
  game.blueprintPlanner.slots = {};
  game.blueprintPlanner.active = false;
  game.reactor.updateStats();
  game.partset.check_affordability(game);
  game.emit?.("grid_changed", {});
  return result;
}

export async function drainGridIntentsAsync(game, engine, intents) {
  const placed = [];
  const sold = [];
  let gridMutated = false;
  let hadEconomyIntent = false;
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (intent.action === "SELL_POWER" || intent.action === "VENT_HEAT") {
      queueEconomyIntent(engine, intent, null);
      hadEconomyIntent = true;
      continue;
    }
    if (intent.action === "PAUSE_TOGGLE") {
      game.togglePause();
      continue;
    }
    if (intent.action === "SET_TOGGLE") {
      const { toggleName, value } = intent.payload || {};
      if (toggleName) applyToggleStateChange(game, toggleName, !!value);
      continue;
    }
    if (intent.action === "REBOOT") {
      const keepEp = intent.payload?.keepEp === true;
      if (keepEp) await game.rebootActionKeepExoticParticles();
      else await game.rebootActionDiscardExoticParticles();
      continue;
    }
    if (intent.action === "PLACE_PART") {
      const p = await applyPlacePartIntent(game, engine, intent.payload);
      if (p) {
        placed.push(p);
        gridMutated = true;
        game.unlockManager?.incrementPlacedCount?.(p.part.type, p.part.level);
      }
      continue;
    }
    if (intent.action === "SELL_PART") {
      const s = applySellPartIntent(game, intent.payload);
      if (s) {
        sold.push(s);
        gridMutated = true;
      }
      continue;
    }
    if (intent.action === "APPLY_BLUEPRINT") {
      const res = applyBlueprintIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    } else if (intent.action === "COMMIT_BLUEPRINT_PLANNER") {
      const res = applyBlueprintPlannerIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    }
  }
  if (gridMutated) {
    game.reactor?.updateStats?.();
    bumpGridPartsRevision(game.tileset);
    invalidateTickParts(engine);
  }
  if (hadEconomyIntent) processPendingEconomyActions(engine);
  drainGameEffects(game, () => game?.ui);
  return { placed, sold };
}

function drainGridIntentsSync(game, engine, intents) {
  let gridMutated = false;
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (intent.action === "SELL_PART") {
      if (applySellPartIntent(game, intent.payload)) gridMutated = true;
    } else if (intent.action === "APPLY_BLUEPRINT") {
      const res = applyBlueprintIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    } else if (intent.action === "COMMIT_BLUEPRINT_PLANNER") {
      const res = applyBlueprintPlannerIntent(game, intent.payload);
      if (res?.ok) gridMutated = true;
    }
  }
  if (gridMutated) {
    game.reactor?.updateStats?.();
    bumpGridPartsRevision(game.tileset);
    invalidateTickParts(engine);
  }
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

function postGameLoopWorkerTick(engine, tickCount, opts = {}) {
  if (!engine._useGameLoopWorker()) {
    return false;
  }
  syncActivePartsAtTickBoundary(engine);
  if (!engine._hasSimulationActivity()) return false;
  if (engine._gameLoopWorkerPending) return false;

  const base = engine._serializeStateForGameLoopWorker(opts);
  if (!base) {
    failGameLoopWorker(engine, "serializeStateForGameLoopWorker");
    return false;
  }

  engine._gameLoopWorkerTickId = (engine._gameLoopWorkerTickId || 0) + 1;
  engine._gameLoopTickContext = { tickId: engine._gameLoopWorkerTickId };
  const state = freezeWorkerTickSnapshot({
    ...base,
    tickId: engine._gameLoopWorkerTickId,
    tickCount,
    multiplier: 1,
  });
  engine._gameLoopWorkerPending = true;
  engine._gameLoopWorkerPendingSince = typeof performance !== "undefined" ? performance.now() : 0;
  lockSimulationForWorker(engine);

  const w = engine._getGameLoopWorker();
  if (!w || engine._gameLoopWorkerFailed) {
    engine._gameLoopWorkerPending = false;
    engine._gameLoopWorkerPendingSince = 0;
    engine._gameLoopTickContext = null;
    unlockSimulationAfterCommit(engine);
    failGameLoopWorker(engine, "gameLoopWorkerCreateFailed");
    return false;
  }

  const msg = { type: "tick", ...state };
  const result = validateGameLoopTickInput(msg, "GameLoopWorker send");
  if (!result.success) {
    engine._gameLoopWorkerPending = false;
    engine._gameLoopWorkerPendingSince = 0;
    engine._gameLoopTickContext = null;
    unlockSimulationAfterCommit(engine);
    failGameLoopWorker(engine, "gameLoopWorkerInputValidation");
    return false;
  }
  const { heatBuffer, integrityBuffer, orthoNeighborOffsets, orthoNeighborIndices, ...rest } = result.data;
  const transfer = [];
  if (heatBuffer) transfer.push(heatBuffer);
  if (integrityBuffer) transfer.push(integrityBuffer);
  if (orthoNeighborOffsets) transfer.push(orthoNeighborOffsets);
  if (orthoNeighborIndices) transfer.push(orthoNeighborIndices);
  logger.log("info", "engine", "[ReactorTick] worker tick sent", { tickId: state.tickId, tickCount });
  if (!postWorkerMessage(engine, { ...rest, type: "tick", heatBuffer, integrityBuffer, orthoNeighborOffsets, orthoNeighborIndices }, transfer)) {
    engine._gameLoopWorkerPending = false;
    engine._gameLoopWorkerPendingSince = 0;
    engine._gameLoopTickContext = null;
    unlockSimulationAfterCommit(engine);
    failGameLoopWorker(engine, "postMessage");
    return false;
  }
  return true;
}

export function runWorkerTickBatch(engine, tickCount, opts = {}) {
  return new Promise((resolve, reject) => {
    if (engine._gameLoopWorkerPending) {
      engine._gameLoopBatchQueue = engine._gameLoopBatchQueue || [];
      engine._gameLoopBatchQueue.push({ tickCount, opts, resolve, reject });
      return;
    }
    engine._gameLoopBatchResolver = { resolve, reject };
    if (!postGameLoopWorkerTick(engine, tickCount, opts)) {
      engine._gameLoopBatchResolver = null;
      reject(new Error("gameLoopWorkerTickFailed"));
    }
  });
}

function drainQueuedWorkerTickBatches(engine) {
  const queue = engine._gameLoopBatchQueue;
  if (!queue?.length || engine._gameLoopWorkerPending) return;
  const next = queue.shift();
  engine._gameLoopBatchResolver = { resolve: next.resolve, reject: next.reject };
  if (!postGameLoopWorkerTick(engine, next.tickCount, next.opts)) {
    engine._gameLoopBatchResolver = null;
    next.reject(new Error("gameLoopWorkerTickFailed"));
    drainQueuedWorkerTickBatches(engine);
  }
}

export async function runChunkedOfflineReplay(engine, opts = {}) {
  const chunkTicks = opts.chunkTicks ?? OFFLINE_REPLAY_CHUNK_TICKS;
  const yieldMs = opts.yieldMs ?? 0;
  let remaining = opts.totalTicks ?? engine._offlineFastForwardTicks ?? 0;
  if (remaining <= 0 || !engine._hasSimulationActivity()) return;

  engine._offlineReplayActive = true;
  engine._isCatchingUp = true;
  engine._offlineFastForwardTicks = 0;

  const startMoney = toNumber(engine.game.state.current_money);
  const startEp = toNumber(engine.game.state.current_exotic_particles);

  try {
    while (remaining > 0) {
      if (!engine.running || engine.game.paused) break;
      const batch = Math.min(chunkTicks, remaining);
      await runWorkerTickBatch(engine, batch, { drainIntents: false });
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


export { FRAGMENTATION_EXPLOSION_CHANCE } from "../kernel/deterministic-tick-rng.js";
export const VISUAL_EVENT_POWER = 1;
export const VISUAL_EVENT_HEAT = 2;
export const VISUAL_EVENT_EXPLOSION = 3;

function cancelPendingGameLoopWorkerTick(engine) {
  const wasPending = engine._gameLoopWorkerPending;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  engine._gameLoopTickContext = null;
  if (wasPending) unlockSimulationAfterCommit(engine);
  const batchResolver = engine._gameLoopBatchResolver;
  if (batchResolver) {
    engine._gameLoopBatchResolver = null;
    batchResolver.reject(new Error("gameLoopWorkerTickCancelled"));
  }
  const queue = engine._gameLoopBatchQueue;
  if (queue?.length) {
    engine._gameLoopBatchQueue = [];
    for (let i = 0; i < queue.length; i++) {
      queue[i].reject(new Error("gameLoopWorkerTickCancelled"));
    }
  }
}

function failGameLoopWorker(engine, detail) {
  const alreadyFailed = engine._gameLoopWorkerFailed;
  cancelPendingGameLoopWorkerTick(engine);
  cancelPendingPhysicsWorkerHeat(engine);
  terminateEngineWorker(engine);
  engine._gameLoopWorkerFailed = true;
  engine._workerFailed = true;
  engine._gameLoopWorkerTickSeen = false;
  if (engine.running) {
    engine._simAccumulatorMs = 0;
    engine._rAfPrevTs = 0;
  }
  if (alreadyFailed) return;
  logger.log("error", "engine", `Game loop worker fatal: ${detail}`);
  engine.game.emit?.("gameLoopWorkerFatal", { detail: String(detail ?? "") });
}

function queueGameLoopWorkerKick(engine) {
  if (!engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) return;
  queueMicrotask(() => {
    if (!engine.running || engine.game.paused) return;
    pushGameLoopWorkerTickFromPulse(engine);
  });
}

export function pushGameLoopWorkerTickFromPulse(engine) {
  if (!engine.running || engine.game.paused) {
    logger.log("debug", "engine", "[ReactorTick] pulse skipped (not running or paused)", { running: engine.running, paused: engine.game.paused });
    return;
  }
  if (engine._gameLoopWorkerFailed) return;
  if (engine._offlineReplayActive) return;

  if (engine._gameLoopWorkerPending) {
    const since = engine._gameLoopWorkerPendingSince || 0;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const overdueMs = since > 0 && now > 0 ? now - since : 0;
    if (overdueMs > 5000) {
      logger.log("warn", "engine", "[ReactorTick] GameLoopWorker timeout; main-thread fallback.", {
        overdueMs: Math.round(overdueMs),
        tickId: engine._gameLoopTickContext?.tickId,
      });
      failGameLoopWorker(engine, "workerTimeout");
      return;
    }
    const lastWarn = engine._gameLoopWorkerLastStallWarnAt || 0;
    if (overdueMs > 2500 && (now - lastWarn > 2000 || !lastWarn)) {
      engine._gameLoopWorkerLastStallWarnAt = now;
      logger.log("warn", "engine", "[ReactorTick] worker result overdue", {
        overdueMs: Math.round(overdueMs),
        tickId: engine._gameLoopTickContext?.tickId,
        missedPulses: engine._gameLoopWorkerMissedPulses ?? 0,
      });
    }
    logger.log("debug", "engine", "[ReactorTick] pulse while worker pending (catch-up queued)", {
      overdueMs: Math.round(overdueMs),
      tickId: engine._gameLoopTickContext?.tickId,
    });
    engine._gameLoopWorkerMissedPulses = (engine._gameLoopWorkerMissedPulses || 0) + 1;
    return;
  }
  const nowPulse = typeof performance !== "undefined" ? performance.now() : 0;
  if (!engine._workerPulsePrevTs) engine._workerPulsePrevTs = nowPulse;
  const dPulse =
    nowPulse > 0 && engine._workerPulsePrevTs > 0 ? Math.max(0, nowPulse - engine._workerPulsePrevTs) : 0;
  engine._workerPulsePrevTs = nowPulse;
  const tickMs = Math.max(1, Number(engine.game.loop_wait) || FOUNDATIONAL_TICK_MS);
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * tickMs;
  if (!engine._isCatchingUp) {
    engine._workerSimAccumMs = Math.min((engine._workerSimAccumMs || 0) + dPulse, capMs);
  }
  const extra = engine._gameLoopWorkerMissedPulses || 0;
  engine._gameLoopWorkerMissedPulses = 0;
  let tickCount = Math.floor(engine._workerSimAccumMs / tickMs);
  if (tickCount < 1) tickCount = 1;
  tickCount = Math.min(MAX_CATCHUP_TICKS, Math.max(tickCount, 1 + extra));
  engine._workerSimAccumMs -= tickCount * tickMs;
  if (engine._workerSimAccumMs < 0) engine._workerSimAccumMs = 0;

  logger.log("debug", "engine", `[Worker-Out] Sending Tick #${engine._gameLoopWorkerTickId}`, {
    ticks: tickCount,
    cells: engine.active_cells.length,
  });

  postGameLoopWorkerTick(engine, tickCount);
}

function ensureArraysValid(engine) {
  if (!engine._valveOrientationCache) engine._valveOrientationCache = new Map();
}

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
    }
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

function getValveOrientation(valveId, cache) {
  let orientation = cache.get(valveId);
  if (orientation !== undefined) return orientation;
  const match = valveId.match(/(\d+)$/);
  orientation = match ? parseInt(match[1]) : 1;
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

function initHeatCalcState(engine) {
  engine._heatCalc_startHeat = new Map();
  engine._heatCalc_planned = [];
  engine._heatCalc_plannedPool = [];
  for (let i = 0; i < HEAT_CALC_POOL_SIZE; i++) {
    engine._heatCalc_plannedPool.push({ from: null, to: null, amount: 0 });
  }
  engine._heatCalc_plannedCount = 0;
  engine._heatCalc_plannedOutByNeighbor = new Map();
  engine._heatCalc_plannedInByNeighbor = new Map();
  engine._heatCalc_plannedInByExchanger = new Map();
  engine._heatCalc_validNeighbors = [];
  engine._outletProcessing_neighbors = [];
  engine._explosion_tilesToExplode = [];
}

function initValveState(engine) {
  engine._valveProcessing_valves = [];
  engine._valveProcessing_neighbors = [];
  engine._valveProcessing_inputNeighbors = [];
  engine._valveProcessing_outputNeighbors = [];
  engine._valve_inputValveNeighbors = [];
  engine._valveNeighborExchangers = new Set();
  engine._ventProcessing_activeVents = [];
}

function initHeatPayloadBuffers(engine) {
  engine._heatPayload_inlets = new Float32Array(HEAT_PAYLOAD_MAX_INLETS * INLET_STRIDE);
  engine._heatPayload_valves = new Float32Array(HEAT_PAYLOAD_MAX_VALVES * VALVE_STRIDE);
  engine._heatPayload_valveNeighbors = new Float32Array(HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS);
  engine._heatPayload_exchangers = new Float32Array(HEAT_PAYLOAD_MAX_EXCHANGERS * EXCHANGER_STRIDE);
  engine._heatPayload_outlets = new Float32Array(HEAT_PAYLOAD_MAX_OUTLETS * OUTLET_STRIDE);
}

function initHeatTransferState(engine) {
  engine._forceGameLoopWorkerOff = false;
  engine._heatTransferHeat = null;
  engine._heatTransferContainment = null;
}

function initWorkerState(engine) {
  engine._engineWorker = null;
  engine._worker = null;
  engine._workerPending = false;
  engine._workerHeartbeatId = null;
  engine._workerFailed = false;
  engine._workerTickId = 0;
  engine._lastHeatTimeoutWarn = 0;
  engine._heatWorkerConsecutiveTimeouts = 0;
  engine._gameLoopWorker = null;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  engine._gameLoopWorkerLastStallWarnAt = 0;
  engine._gameLoopTickContext = null;
  engine._gameLoopWorkerFailed = false;
  engine._gameLoopWorkerTickId = 0;
  engine._gameLoopWorkerMissedPulses = 0;
  engine._workerSimAccumMs = 0;
  engine._workerPulsePrevTs = 0;
  engine._economyCmdSeq = 0;
  engine._economyResolvers = new Map();
  engine._projectionResolvers = new Map();
  engine._projectionQueryTickId = 0;
  engine._orthoAdjacencyKey = null;
  engine._gameLoopWorkerTickSeen = false;
  engine._updateValveNeighborCache = () => {};
}

function initAllEngineState(engine) {
  initHeatCalcState(engine);
  initValveState(engine);
  initHeatPayloadBuffers(engine);
  initHeatTransferState(engine);
  initWorkerState(engine);
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

function processAutoSell(engine, multiplier) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  let autoSellEnabled = reactor.auto_sell_enabled;
  if (autoSellEnabled === undefined) autoSellEnabled = game.state?.auto_sell;
  if (autoSellEnabled === undefined) autoSellEnabled = false;
  if (!autoSellEnabled) return;

  const layoutMax = toDecimal(reactor.max_power ?? 0);
  const altered = toDecimal(reactor.altered_max_power ?? reactor.base_max_power ?? 0);
  const Decimal = getDecimal();
  const sellBasis = Decimal.max(layoutMax, altered);
  const sellCap = sellBasis.mul(reactor.auto_sell_multiplier).mul(multiplier);
  const sellAmount = Decimal.min(reactor.current_power, sellCap);
  logger.log('debug', 'engine', `[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
  if (sellAmount.gt(0)) {
    reactor.current_power = reactor.current_power.sub(sellAmount);
    if (game.state) recordSessionPowerSold(game, sellAmount);
    const value = sellAmount.mul(reactor.sell_price_multiplier || 1);
    creditMoneyWithPrestige(game, value);
    let autosellHeatRatio = 0;
    for (let capIdx = 0; capIdx < engine.active_capacitors.length; capIdx++) {
      const capTile = engine.active_capacitors[capIdx];
      const ratio = capTile?.part?.capacitor_autosell_heat_ratio ?? 0;
      if (ratio <= 0) continue;
      const cap = capTile.part.containment || 1;
      if (cap > 0 && (capTile.heat_contained || 0) / cap > 0.95) {
        autosellHeatRatio = Math.max(autosellHeatRatio, ratio);
      }
    }
    if (autosellHeatRatio > 0) reactor.current_heat = reactor.current_heat.add(sellAmount.mul(autosellHeatRatio));
  }
}

function countEmptyNeighbors(tileset, r, c) {
  let count = 0;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  offsets.forEach(([dr, dc]) => {
    const n = tileset.getTile(r + dr, c + dc);
    if (n && n.enabled && !n.part) count++;
  });
  return count;
}

function applyConvectiveBoost(ventRate, reactor, tileset, r, c) {
  if (reactor.convective_boost <= 0) return ventRate;
  const emptyNeighbors = countEmptyNeighbors(tileset, r, c);
  if (emptyNeighbors <= 0) return ventRate;
  return ventRate * (1 + emptyNeighbors * reactor.convective_boost);
}

function applyVent6PowerCost(reactor, ventReduce) {
  const powerAvail = reactor.current_power.toNumber();
  const capped = powerAvail < ventReduce ? powerAvail : ventReduce;
  reactor.current_power = reactor.current_power.sub(capped);
  return capped;
}

function processVents(engine, multiplier) {
  const reactor = engine.game.reactor;
  const activeVents = engine.active_vents;
  let stirlingPowerAdd = 0;
  let ventHeatDissipated = 0;
  const tileset = engine.game.tileset;

  activeVents.forEach((tile) => {
    if (!tile.part) return;
    let ventRate = tile.getEffectiveVentValue() * multiplier;
    if (ventRate <= 0) return;
    ventRate = applyConvectiveBoost(ventRate, reactor, tileset, tile.row, tile.col);
    const heat = tile.heat_contained;
    let vent_reduce = Math.min(ventRate, heat);
    if (tile.part.vent_consumes_power) vent_reduce = applyVent6PowerCost(reactor, vent_reduce);
    tile.heat_contained -= vent_reduce;
    ventHeatDissipated += vent_reduce;
    if (reactor.stirling_multiplier > 0 && vent_reduce > 0)
      stirlingPowerAdd += vent_reduce * reactor.stirling_multiplier;
    if (vent_reduce > 0) pushTickVisualEvent(engine, VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
  });
  if (ventHeatDissipated > 0 && engine.game.state) {
    recordSessionHeatDissipated(engine.game, ventHeatDissipated);
  }
  return stirlingPowerAdd;
}

function pushTickVisualEvent(engine, typeId, row, col, value) {
  const events = engine._currentTickCtx?.visualEvents;
  if (events) {
    events.push({ typeId, row, col, value });
    return;
  }
  engine._visualEventBuffer.enqueue(typeId, row, col, value);
}

function flushTickVisualEvents(engine) {
  const events = engine._currentTickCtx?.visualEvents;
  if (!events?.length) return;
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    engine._visualEventBuffer.enqueue(ev.typeId, ev.row, ev.col, ev.value);
  }
  events.length = 0;
}

function getVisualParticleCount(value) {
  if (value >= VISUAL_PARTICLE_HIGH_THRESHOLD) return VISUAL_PARTICLE_HIGH_COUNT;
  if (value >= VISUAL_PARTICLE_MED_THRESHOLD) return VISUAL_PARTICLE_MED_COUNT;
  return 1;
}

function emitCellVisualEvents(engine, tile, multiplier) {
  if (tile.power > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.power);
    for (let k = 0; k < count; k++) {
      pushTickVisualEvent(engine, VISUAL_EVENT_POWER, tile.row, tile.col, 0);
    }
  }
  if (tile.heat > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.heat);
    for (let k = 0; k < count; k++) {
      pushTickVisualEvent(engine, VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
    }
  }
}

function countValidContainmentNeighbors(neighbors) {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n.part && n.part.containment > 0 && !n.exploded) count++;
  }
  return count;
}

function distributeHeatToNeighbors(neighbors, generatedHeat, validCount) {
  const heatPerNeighbor = generatedHeat / validCount;
  for (let j = 0; j < neighbors.length; j++) {
    const t = neighbors[j];
    if (t.part && t.part.containment > 0 && !t.exploded) {
      t.heat_contained += heatPerNeighbor;
    }
  }
}

function processReflectorNeighbors(engine, tile, multiplier) {
  const reflectorNeighbors = tile.reflectorNeighborTiles;
  for (let j = 0; j < reflectorNeighbors.length; j++) {
    const r_tile = reflectorNeighbors[j];
    if (r_tile.ticks > 0) {
      r_tile.ticks -= multiplier;
      if (r_tile.ticks <= 0) engine.handleComponentDepletion(r_tile);
    }
  }
}

function handleCellDepletion(engine, tile) {
  const part = tile.part;
  if (part.type === "protium") {
    engine.game.protium_particles += part.cell_count;
  }
  engine.handleComponentDepletion(tile);
}

function processCells(engine, multiplier) {
  let power_add = 0;
  let heat_add = 0;

  for (let i = 0; i < engine.active_cells.length; i++) {
    const tile = engine.active_cells[i];
    if (!tile.part || tile.exploded || tile.ticks <= 0) continue;
    if (typeof tile.part.base_ticks === "undefined" && tile.part.category === "cell") {
      logger.log("debug", "engine", `Cell at (${tile.row},${tile.col}) missing base_ticks; part.ticks=${tile.part.ticks}`);
    }

    const p = tile.part;
    const tilePower = (typeof tile.power === "number" && !isNaN(tile.power) && isFinite(tile.power))
      ? tile.power
      : (typeof p?.power === "number" && !isNaN(p.power) && isFinite(p.power) ? p.power : p?.base_power ?? 0);
    power_add += tilePower * multiplier;

    emitCellVisualEvents(engine, tile, multiplier);

    const tileHeat = (typeof tile.heat === "number" && !isNaN(tile.heat) && isFinite(tile.heat))
      ? tile.heat
      : (typeof p?.heat === "number" && !isNaN(p.heat) && isFinite(p.heat) ? p.heat : p?.base_heat ?? 0);
    const generatedHeat = tileHeat * multiplier;
    const neighbors = tile.containmentNeighborTiles;
    const validCount = countValidContainmentNeighbors(neighbors);

    if (validCount > 0) {
      distributeHeatToNeighbors(neighbors, generatedHeat, validCount);
    } else {
      heat_add += generatedHeat;
    }

    tile.ticks -= multiplier;
    processReflectorNeighbors(engine, tile, multiplier);

    if (tile.ticks <= 0) handleCellDepletion(engine, tile);
  }

  return { power_add, heat_add };
}

function handlerAcceleratorHeat(engine, multiplier, options) {
  const reactor = engine.game.reactor;
  let power_add = options?.power_add ?? 0;
  const vessels = engine.active_vessels || [];
  for (let i = 0; i < vessels.length; i++) {
    const tile = vessels[i];
    if (tile.part?.id !== "particle_accelerator6") continue;
    const cap = tile.part.containment || 0;
    const current = tile.heat_contained || 0;
    const space = Math.max(0, cap - current);
    if (space <= 0 || reactor.current_heat.lte(0)) continue;
    const rate = tile.getEffectiveTransferValue ? tile.getEffectiveTransferValue() : 0;
    const maxPull = rate * multiplier;
    const pull = Math.min(maxPull, reactor.current_heat.toNumber(), space);
    if (pull > 0) {
      reactor.current_heat = reactor.current_heat.sub(pull);
      tile.heat_contained += pull;
      power_add += pull;
    }
  }
  return power_add;
}

function handlerAutoSell(engine, multiplier) {
  processAutoSell(engine, multiplier);
}

const PHASE_REGISTRY = new Map([
  ["cells", { getTiles: (e) => e.active_cells || [], handler: (engine, multiplier) => processCells(engine, multiplier) }],
  ["acceleratorHeat", { getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.id === "particle_accelerator6"), handler: (engine, multiplier, options) => handlerAcceleratorHeat(engine, multiplier, options) }],
  ["vents", { getTiles: (e) => e.active_vents || [], handler: (engine, multiplier) => processVents(engine, multiplier) }],
  ["economy", { getTiles: (e) => e.active_capacitors || [], handler: (engine, multiplier, options) => handlerAutoSell(engine, multiplier, options) }],
  ["autoSell", { getTiles: (e) => e.active_capacitors || [], handler: (engine, multiplier, options) => handlerAutoSell(engine, multiplier, options) }],
]);

function processComponentPhase(engine, phaseName, multiplier, options = {}) {
  const entry = PHASE_REGISTRY.get(phaseName);
  if (!entry) return undefined;
  const result = entry.handler(engine, multiplier, options);
  if (phaseName === "vents" && options.power_add !== undefined) {
    return (options.power_add ?? 0) + (result ?? 0);
  }
  return result;
}

function explodeTile(engine, tile) {
  const reactor = engine.game.reactor;
  if (tile.part?.category === "particle_accelerator") reactor.checkMeltdown();
  engine.handleComponentExplosion(tile);
}

function explodeTilesFromIndices(engine, explosionIndices) {
  const ts = engine.game.tileset;
  const stride = ts.max_cols;
  const ordered = [];
  for (let i = 0; i < explosionIndices.length; i++) {
    const idx = explosionIndices[i] | 0;
    const tile = ts.getTile((idx / stride) | 0, idx % stride);
    if (!tile?.part || tile.exploded) continue;
    ordered.push({ tile, cap: tile.part?.category === "capacitor" ? 0 : 1 });
  }
  ordered.sort((a, b) => a.cap - b.cap);
  for (let j = 0; j < ordered.length; j++) explodeTile(engine, ordered[j].tile);
}

function collectTilesOverContainment(engine) {
  const tilesToExplode = engine._explosion_tilesToExplode;
  tilesToExplode.length = 0;
  for (let i = 0; i < engine.active_vessels.length; i++) {
    const tile = engine.active_vessels[i];
    if (!tile.part || tile.exploded) continue;
    const part = tile.part;
    if (part && part.containment > 0 && tile.heat_contained > part.containment) {
      tilesToExplode.push(tile);
    }
  }
  tilesToExplode.sort((a, b) => {
    const ac = a.part?.category === "capacitor" ? 0 : 1;
    const bc = b.part?.category === "capacitor" ? 0 : 1;
    return ac - bc;
  });
}

function explodeTilesFromActiveVessels(engine) {
  collectTilesOverContainment(engine);
  const tilesToExplode = engine._explosion_tilesToExplode;
  for (let i = 0; i < tilesToExplode.length; i++) {
    explodeTile(engine, tilesToExplode[i]);
  }
}

function tryDeterministicFragmentationExplosion(engine, salt) {
  if (!deterministicChance(engine.tick_count, salt, FRAGMENTATION_EXPLOSION_CHANCE)) return;
  const activeTiles = engine.game.tileset.active_tiles_list.filter((t) => t.part && !t.exploded);
  const pick = deterministicPickIndex(engine.tick_count, salt + 1, activeTiles.length);
  if (pick < 0) return;
  engine.handleComponentExplosion(activeTiles[pick]);
}

function tickFragmentationStructuralDecay(engine) {
  const state = engine.game.state;
  if (!state || state.failure_state !== "fragmentation") return;
  if ((state.hull_integrity ?? 100) > 0) return;
  if (engine.game.reactor.current_heat.gt(engine.game.reactor.max_heat.mul(MELTDOWN_HEAT_MULTIPLIER))) return;
  tryDeterministicFragmentationExplosion(engine, FRAGMENTATION_SALT_STRUCTURAL);
}

function applyHullRepulsionFromOverflow(engine) {
  const reactor = engine.game.reactor;
  const maxH = reactor.max_heat;
  if (!maxH.gt(0) || !reactor.current_heat.gt(maxH)) return;

  const state = engine.game.state;
  if (state && state.failure_state === "fragmentation") {
    tryDeterministicFragmentationExplosion(engine, FRAGMENTATION_SALT_HULL_REPEL);
  }

  const excess = reactor.current_heat.sub(maxH);
  const totalRepel = excess.mul(HULL_REPEL_FRACTION);
  const tiles = engine.game.tileset.active_tiles_list.filter(
    (t) => t.enabled && t.part && typeof t.heat_contained === "number"
  );
  if (tiles.length === 0) return;
  const perNum = totalRepel.div(tiles.length).toNumber();
  if (!Number.isFinite(perNum) || perNum <= 0) return;
  reactor.current_heat = reactor.current_heat.sub(totalRepel);
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].heat_contained = (tiles[i].heat_contained || 0) + perNum;
  }
}

function processExplosionsPhase(engine, explosionIndices) {
  const hasIndices = Array.isArray(explosionIndices) && explosionIndices.length > 0;
  if (hasIndices) {
    explodeTilesFromIndices(engine, explosionIndices);
  } else {
    explodeTilesFromActiveVessels(engine);
  }
}

function withPerf(engine, name, fn) {
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markStart(name);
  }
  fn();
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd(name);
  }
}

function getEffectiveMaxPower(reactor) {
  const layout = toDecimal(reactor.max_power ?? 0);
  const altered = toDecimal(reactor.altered_max_power ?? reactor.base_max_power ?? 0);
  if (altered.gt(0)) return altered;
  return layout;
}

function applyPowerOverflow(reactor, power_add) {
  const effectiveMaxPower = getEffectiveMaxPower(reactor);
  const potentialPower = reactor.current_power.add(power_add);
  if (potentialPower.gt(effectiveMaxPower)) {
    const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 1;
    reactor.current_power = effectiveMaxPower;
    reactor.current_heat = reactor.current_heat.add(potentialPower.sub(effectiveMaxPower).mul(overflowToHeat));
  } else {
    reactor.current_power = potentialPower;
  }
  return effectiveMaxPower;
}

function updateReactorStats(reactor, opts = {}) {
  reactor.updateStats();
  if (opts.record === false) return;
  if (typeof reactor.recordClassificationStats === "function") reactor.recordClassificationStats();
}

function applyPowerMultiplier(reactor, power_add) {
  const cap = getEffectiveMaxPower(reactor);
  const powerMult = reactor.power_multiplier || 1;
  if (powerMult !== 1) {
    const extra = power_add * (powerMult - 1);
    reactor.current_power = reactor.current_power.add(extra);
    if (reactor.current_power.gt(cap)) {
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_heat = reactor.current_heat.add(reactor.current_power.sub(cap).mul(overflowToHeat));
      reactor.current_power = cap;
    }
  }
  if (reactor.current_power.gt(cap)) reactor.current_power = cap;
}


function applyHeatReductions(reactor, multiplier) {
  if (reactor.power_to_heat_ratio > 0 && reactor.current_heat.gt(0)) {
    const heatPercent = reactor.current_heat.div(reactor.max_heat).toNumber();
    if (heatPercent > VALVE_OVERFLOW_THRESHOLD && reactor.current_power.gt(0)) {
      const heatToRemoveTarget = reactor.current_heat.mul(HEAT_REMOVAL_TARGET_RATIO).toNumber();
      const powerNeeded = heatToRemoveTarget / reactor.power_to_heat_ratio;
      const powerUsed = Math.min(reactor.current_power.toNumber(), powerNeeded);
      const heatRemoved = powerUsed * reactor.power_to_heat_ratio;
      reactor.current_power = reactor.current_power.sub(powerUsed);
      reactor.current_heat = reactor.current_heat.sub(heatRemoved);
    }
  }
  if (reactor.current_heat.gt(0) && !!(reactor.heat_controlled || reactor.game?.state?.heat_control)) {
    const ventBonus = reactor.vent_multiplier_eff || 0;
    const baseRed = reactor.max_heat.toNumber() / REACTOR_HEAT_STANDARD_DIVISOR;
    const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
    reactor.current_heat = reactor.current_heat.sub(reduction);
  }
  if (reactor.current_heat.lt(0)) reactor.current_heat = toDecimal(0);
}

function syncStateVars(reactor, game, ctx) {
  const rawPowerDelta = reactor.current_power.sub(ctx.powerBeforeTick).toNumber();
  const rawHeatDelta = reactor.current_heat.sub(ctx.heatBeforeTick).toNumber();
  const norm = Math.max(MULTIPLIER_FLOOR, ctx.multiplier);
  if (game.state) {
    game.state.power_delta_per_tick = rawPowerDelta / norm;
    game.state.heat_delta_per_tick = rawHeatDelta / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
    logger.log("debug", "engine", "[Tick] syncStateVars UI state updated:", {
      current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
      power_delta: rawPowerDelta,
      power_delta_per_tick: game.state.power_delta_per_tick
    });
  }
}

function syncPostTickAmbienceCounts(engine) {
  const state = engine.game.state;
  if (!state) return;
  state.active_vent_count = engine.active_vents.length;
  state.active_exchanger_count = engine.active_exchangers.length;
}

function syncStateThenVisuals(engine, reactor, ctx) {
  syncStateVars(reactor, engine.game, ctx);
  syncPostTickAmbienceCounts(engine);
}

function finalizeTick(engine) {
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
  applyTickVisualFx(engine);
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_total");
  }
  const game = engine.game;
  applyHeatThresholdSignals(game, engine);
  engine.tick_count++;
  recordEngineTickCount(engine);
}

function runPostHeatPhase(engine, ctx, explosionIndices = null) {
  const reactor = engine.game.reactor;
  const { multiplier } = ctx;
  let { power_add } = ctx;

  const ventPowerDemand = computeTileVentPowerDemand(
    engine.active_vents || [],
    multiplier,
    (tile) => tile.getEffectiveVentValue(),
    (tile) => tile.heat_contained || 0
  );
  const powerForVents = reactor.current_power.toNumber() + (power_add || 0);
  if (shouldScramForInsufficientVentPower(powerForVents, ventPowerDemand)) {
    if (ctx.heat_add) reactor.current_heat = reactor.current_heat.sub(ctx.heat_add);
    power_add = 0;
    ctx.powerVentScram = true;
  }

  const cellPowerAdd = typeof power_add === "number" && Number.isFinite(power_add) ? power_add : 0;
  if (cellPowerAdd > 0 && engine.game.state) {
    recordSessionPowerProduced(engine.game, cellPowerAdd);
  }

  power_add = processComponentPhase(engine, "acceleratorHeat", multiplier, { power_add });
  applyHullRepulsionFromOverflow(engine);
  tickFragmentationStructuralDecay(engine);
  withPerf(engine, "tick_explosions", () => processExplosionsPhase(engine, explosionIndices));
  engine.tickOrchestrator.runPhaseSync("vents", ctx);
  power_add = ctx.power_add;
  if (toDecimal(reactor.max_power ?? 0).lte(0)) updateReactorStats(reactor, { record: false });
  applyPowerOverflow(reactor, power_add);
  updateReactorStats(reactor);
  applyPowerMultiplier(reactor, power_add);
  engine.tickOrchestrator.runPhaseSync("economy", ctx);
  applyHeatReductions(reactor, multiplier);
  syncStateThenVisuals(engine, reactor, ctx);
  flushTickVisualEvents(engine);
  engine.tickOrchestrator.runPhaseSync("objectives", ctx);
  drainGameEffects(engine.game, () => engine.game?.ui);
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_stats");
  }
  finalizeTick(engine);
}

function onGameLoopWorkerMessage(engine, e) {
  const data = e.data;
  if (data?.type === "economyCommandResult") {
    const fn = engine._economyResolvers?.get(data.id);
    if (engine._economyResolvers) engine._economyResolvers.delete(data.id);
    if (fn) {
      fn({
        ok: !!data.ok,
        balanceAfter: data.balanceAfter != null ? data.balanceAfter : toNumber(engine.game.state?.current_money),
      });
    }
    return;
  }
  if (data?.type === "timerPulse") {
    logger.log("debug", "engine", "[ReactorTick] timerPulse", {
      pending: engine._gameLoopWorkerPending,
      tickId: engine._gameLoopTickContext?.tickId,
      missed: engine._gameLoopWorkerMissedPulses ?? 0,
    });
    pushGameLoopWorkerTickFromPulse(engine);
    return;
  }
  if (data?.type !== "tickResult") return;
  if (data.tickId >= 1_000_000_000) {
    const fn = engine._projectionResolvers?.get(data.tickId);
    if (engine._projectionResolvers) engine._projectionResolvers.delete(data.tickId);
    if (fn) fn(data.error ? null : data);
    return;
  }
  const pendingSince = engine._gameLoopWorkerPendingSince || 0;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const waitMs = pendingSince > 0 && now > 0 ? now - pendingSince : 0;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  const ctx = engine._gameLoopTickContext;
  engine._gameLoopTickContext = null;
  if (data.error) {
    logger.log("warn", "engine", "[GameLoopWorker] received error result:", data.message, { waitMs: Math.round(waitMs), tickId: data.tickId });
    failGameLoopWorker(engine, data.message || "tickResultError");
    return;
  }
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("warn", "engine", "[ReactorTick] tickResult ignored (stale or no context)", { received: data.tickId, expected: ctx?.tickId, waitMs: Math.round(waitMs) });
    unlockSimulationAfterCommit(engine);
    const batchResolver = engine._gameLoopBatchResolver;
    if (batchResolver) {
      engine._gameLoopBatchResolver = null;
      batchResolver.reject(new Error("staleTickResult"));
    }
    drainQueuedWorkerTickBatches(engine);
    return;
  }
  logger.log("info", "engine", "[ReactorTick] worker tick applied", { tickId: data.tickId, waitMs: Math.round(waitMs), reactorPower: data.reactorPower });
  logger.log("debug", "engine", "[GameLoopWorker] applying tickResult:", { tickId: data.tickId, reactorPower: data.reactorPower });
  applyWorkerTickResult(engine, data);
  if ((engine._gameLoopWorkerMissedPulses || 0) > 0) {
    queueMicrotask(() => pushGameLoopWorkerTickFromPulse(engine));
  }
}

function clearPhysicsWorkerHeartbeat(engine) {
  if (engine._workerHeartbeatId) {
    clearTimeout(engine._workerHeartbeatId);
    engine._workerHeartbeatId = null;
  }
}

function takePhysicsWorkerTickContext(engine) {
  const ctx = engine._workerTickContext;
  engine._workerPending = false;
  engine._workerTickContext = null;
  return ctx;
}

function recordPhysicsWorkerFailure(engine) {
  engine._heatWorkerConsecutiveTimeouts = (engine._heatWorkerConsecutiveTimeouts || 0) + 1;
  if (engine._heatWorkerConsecutiveTimeouts >= WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK) {
    engine._workerFailed = true;
  }
}

function runPhysicsWorkerSyncFallback(engine, ctx, reason) {
  if (!ctx || !engine.running) return;
  recordPhysicsWorkerFailure(engine);
  if (reason === "timeout") {
    logger.log("warn", "engine", "[PhysicsWorker] heat step timeout");
  } else {
    logger.log("warn", "engine", "[PhysicsWorker] heat step fallback", { reason });
  }
  engine._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
}

function onPhysicsWorkerHeatTimeout(engine) {
  if (!engine._workerPending) return;
  clearPhysicsWorkerHeartbeat(engine);
  const ctx = takePhysicsWorkerTickContext(engine);
  if (!ctx) return;
  recordPhysicsWorkerFailure(engine);
  if (!engine.running) return;
  logger.log("warn", "engine", "[PhysicsWorker] heat step timeout");
  engine._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
}

function cancelPendingPhysicsWorkerHeat(engine, { syncFallback = false, reason = "" } = {}) {
  clearPhysicsWorkerHeartbeat(engine);
  if (!engine._workerPending) return;
  const ctx = takePhysicsWorkerTickContext(engine);
  if (syncFallback) runPhysicsWorkerSyncFallback(engine, ctx, reason);
}

function validateWorkerResponse(engine, data) {
  if (!engine._workerPending) return null;
  const ctx = engine._workerTickContext;
  if (!data?.heatBuffer) {
    takePhysicsWorkerTickContext(engine);
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no heatBuffer");
    if (ctx && engine.running) runPhysicsWorkerSyncFallback(engine, ctx, "no heatBuffer");
    return null;
  }
  if (!engine.game?.tileset) {
    takePhysicsWorkerTickContext(engine);
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no tileset");
    if (ctx && engine.running) runPhysicsWorkerSyncFallback(engine, ctx, "no tileset");
    return null;
  }
  takePhysicsWorkerTickContext(engine);
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: tickId mismatch", { received: data.tickId, expected: ctx?.tickId });
    if (ctx && engine.running) runPhysicsWorkerSyncFallback(engine, ctx, "tickId mismatch");
    return null;
  }
  return { ctx };
}

function applyTransferredBuffers(engine, data) {
  const ts = engine.game?.tileset;
  if (data.heatBuffer && ts) {
    applyHeatViewToTileset(ts, new Float32Array(data.heatBuffer));
  }
  engine._heatTransferHeat = null;
  engine._heatTransferContainment = null;
  if (data.containmentBuffer) engine._heatTransferContainment = new Float32Array(data.containmentBuffer);
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
  engine._heatWorkerConsecutiveTimeouts = 0;
  const parseResult = PhysicsTickResultSchema.safeParse(data);
  if (!parseResult.success) {
    logger.log("warn", "engine", "[PhysicsWorker] Result validation failed:", fromError(parseResult.error).toString());
    failSimulationHardwareIncompatible(engine, "physicsWorkerResult");
    return;
  }
  data = parseResult.data;
  const { ctx } = result;
  logger.log("debug", "engine", "[PhysicsWorker] received valid response, applying power:", { power_add: ctx.power_add, tickId: data.tickId });
  applyTransferredBuffers(engine, data);
  const rawHeat = data.reactorHeat ?? engine.game.reactor.current_heat.toNumber();
  engine.game.reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  recordHeatFlowVectors(engine, data.transfers);
  const heat_add = ctx.heat_add + (data.heatFromInlets ?? 0);
  engine._continueTickAfterHeat(ctx.multiplier, ctx.power_add, heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick, data.explosionIndices);
}

function logEngineStartSnapshot(engine) {
  const game = engine.game;
  const ts = game?.tileset;
  ensureArraysValid(engine);
  syncActivePartsAtTickBoundary(engine);
  const byId = new Map();
  let placedParts = 0;
  if (Array.isArray(ts?.tiles_list)) {
    for (let i = 0; i < ts.tiles_list.length; i++) {
      const tile = ts.tiles_list[i];
      const id = tile?.part?.id;
      if (!id) continue;
      placedParts++;
      byId.set(id, (byId.get(id) || 0) + 1);
    }
  }
  const partsById = Object.fromEntries(
    [...byId.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
  );
  const activeBuckets = {
    cells: engine.active_cells.length,
    vessels: engine.active_vessels.length,
    inlets: engine.active_inlets.length,
    exchangers: engine.active_exchangers.length,
    outlets: engine.active_outlets.length,
    valves: engine.active_valves.length,
    vents: engine.active_vents.length,
    capacitors: engine.active_capacitors.length,
  };
  const reactor = game?.reactor;
  logger.log("info", "engine", "[EngineStart] reactor parts", {
    grid: `${game.rows}x${game.cols}`,
    placedParts,
    partsById,
    activeBuckets,
    power: reactor?.current_power?.toNumber?.() ?? null,
    heat: reactor?.current_heat?.toNumber?.() ?? null,
    paused: !!game.paused,
  });
  logger.log("info", "engine", "[EngineStart] tick processing", {
    gameLoopWorker: engine._useGameLoopWorker() && !engine._gameLoopWorkerFailed,
    physicsWorkerHeat: engine._useWorker(),
    loopWaitMs: game.loop_wait,
    simulationTickMs: FOUNDATIONAL_TICK_MS,
    tickCount: engine.tick_count,
  });
}

function onEngineWorkerMessage(engine, e) {
  const data = e.data;
  if (data?.type === "tickResult" || data?.type === "economyCommandResult" || data?.type === "timerPulse") {
    onGameLoopWorkerMessage(engine, e);
    return;
  }
  clearPhysicsWorkerHeartbeat(engine);
  handlePhysicsWorkerMessage(engine, data);
}

function ensureEngineWorker(engine) {
  const cached = getEngineWorker(engine);
  if (cached) return cached;
  try {
    let urlStr = "../worker/engine.worker.js";
    try {
      if (typeof import.meta !== "undefined" && import.meta.url) {
        urlStr = new URL("../worker/engine.worker.js", import.meta.url).href;
      }
    } catch (_e) {}
    const worker = new Worker(urlStr, { type: "module" });
    worker.onmessage = (ev) => onEngineWorkerMessage(engine, ev);
    worker.onerror = (ev) => {
      logger.log("warn", "engine", "[EngineWorker] worker error", ev?.message ?? ev);
      engine._workerFailed = true;
      cancelPendingPhysicsWorkerHeat(engine, { syncFallback: true, reason: "workerError" });
      failGameLoopWorker(engine, "workerError");
    };
    registerEngineWorker(engine, worker);
    engine._engineWorker = worker;
    engine._gameLoopWorker = worker;
    engine._worker = worker;
  } catch (err) {
    engine._gameLoopWorkerFailed = true;
    engine._workerFailed = true;
    logger.log("warn", "engine", "[EngineWorker] Failed to create worker", err);
  }
  return getEngineWorker(engine);
}

function ensureGameLoopWorker(engine) {
  return ensureEngineWorker(engine);
}

function ensurePhysicsWorker(engine) {
  return ensureEngineWorker(engine);
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
    if (this.displayInterval && typeof window !== "undefined") {
      this.displayTimer = setInterval(() => {
        this.displayPerformanceStats();
      }, this.displayInterval);
    }
  }

  stopPeriodicDisplay() {
    if (this.displayTimer && typeof window !== "undefined") {
      clearInterval(this.displayTimer);
      this.displayTimer = null;
    }
  }

  displayPerformanceStats() {
    if (!this.enabled || !DEBUG_PERFORMANCE || typeof performance === "undefined" || typeof performance.now !== "function") return;

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
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(deltaTime, capMs);
  engine.game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  if (tickEquivalent > 0 && engine._hasSimulationActivity()) {
    engine.game.emit?.("welcomeBackOffline", { deltaTime: span, offlineMs: span, tickEquivalent });
  }
  return true;
}

export class HeatFlowVisualizer {
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

    this.MAX_EVENTS = MAX_VISUAL_EVENTS;
    this._visualEventBuffer = createVisualEventBuffer(this.MAX_EVENTS);
    this._reflectorPairBuf = new Uint32Array(MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME * 2);
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;

    initAllEngineState(this);
    ensureArraysValid(this);

    this.timeManager = new TimeManager(this);
    this.heatManager = new HeatSystem(this);
    this.heatFlowVisualizer = new HeatFlowVisualizer();
    this._workerHeartbeatMs = WORKER_HEARTBEAT_MS;
    this._visibilityListenerBound = false;
    this._visibilityHiddenAt = 0;
    this._simulationLocked = false;
    this._offlineReplayActive = false;
    this.tickOrchestrator = new TickOrchestrator(this);
    this._bindTickOrchestrator();
  }

  _bindTickOrchestrator() {
    const orch = this.tickOrchestrator;
    orch.register("intents", (ctx) => {
      drainIntentQueueAtTickStart(this, ctx);
    });
    orch.register("cells", (ctx) => {
      const cellResult = processComponentPhase(this, "cells", ctx.multiplier);
      ctx.power_add = cellResult.power_add;
      ctx.heat_add = cellResult.heat_add;
    });
    orch.register("vents", (ctx) => {
      ctx.power_add = processComponentPhase(this, "vents", ctx.multiplier, { power_add: ctx.power_add });
    });
    orch.register("economy", (ctx) => {
      processComponentPhase(this, "autoSell", ctx.multiplier);
      processPendingEconomyActions(this, ctx);
    });
    orch.register("objectives", (_ctx) => {
      this.game.objectives_manager?.check_current_objective?.();
    });
  }

  setForceNoSAB(override) {
    this._forceGameLoopWorkerOff = !!override;
  }

  _useGameLoopWorker() {
    if (typeof Worker === "undefined" || this._gameLoopWorkerFailed || this._forceGameLoopWorkerOff) return false;
    return true;
  }

  _useWorker() {
    if (typeof Worker === "undefined" || this._workerFailed) return false;
    return true;
  }

  _tickPresenter() {
    return this.game?.ui?.tickPresenter;
  }

  _serializeStateForGameLoopWorker(opts) {
    return serializeStateForGameLoopWorker(this, opts);
  }

  _applyGameLoopTickResult(data) {
    applyWorkerTickResult(this, data);
  }

  _getGameLoopWorker() {
    return ensureGameLoopWorker(this);
  }

  _buildHeatPayload(multiplier) {
    return buildHeatPayload(this, multiplier);
  }

  _collectOverpressureExplosionIndices() {
    const ts = this.game.tileset;
    const rows = this.game.rows;
    const cols = this.game.cols;
    const heatMap = ts.heatMap;
    if (!heatMap) return [];
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = ts.gridIndex(r, c);
        const tile = ts.getTile(r, c);
        const cap = tile?.part?.containment ?? 0;
        const h = heatMap[idx] ?? 0;
        if (cap > 0 && h > cap) out.push(idx);
      }
    }
    return out;
  }

  _runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick) {
    const heatPhase = this.heatManager.processTick(multiplier);
    const explosionIndices = this._collectOverpressureExplosionIndices();
    const heat_add_total = heat_add + (heatPhase.heatFromInlets ?? 0);
    recordHeatFlowVectors(this, heatPhase.transfers);
    this._continueTickAfterHeat(
      multiplier,
      power_add,
      heat_add_total,
      powerBeforeTick,
      heatBeforeTick,
      explosionIndices.length ? explosionIndices : null
    );
  }

  _getWorker() {
    return ensurePhysicsWorker(this);
  }

  _processIntentQueue() {
    drainIntentQueueAtTickStart(this);
  }

  async consumeIntentQueueAsync() {
    await waitForSimulationUnlock(this);
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

  _ensureArraysValid() {
    ensureArraysValid(this);
  }

  _syncGameLoopWorkerTimerControl(start) {
    if (!this._useGameLoopWorker()) return;
    if (getEngineWorker(this) && !this._gameLoopWorkerFailed) {
      postWorkerMessage(this, { type: "timerControl", action: start ? "start" : "stop" });
    }
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
    if (this.running && !stalled) {
      if (!this.game.paused) {
        this._syncGameLoopWorkerTimerControl(true);
        queueGameLoopWorkerKick(this);
      }
      return;
    }
    if (stalled) this.running = false;
    const hadStalePending = drainStaleGameLoopWorkerPending(this);
    if (hadStalePending || this._gameLoopWorkerFailed || this._workerFailed) {
      terminateEngineWorker(this);
    }
    const inTestEnv = typeof process !== "undefined" && (process.env?.NODE_ENV === "test" || process.env?.VITEST);
    if (!inTestEnv && !this._forceGameLoopWorkerOff) {
      this._gameLoopWorkerFailed = false;
      this._workerFailed = false;
    }
    this._heatWorkerConsecutiveTimeouts = 0;
    this.running = true;
    this._testFrameCount = 0;
    this.last_timestamp = performance.now();
    this.last_session_update = Date.now();
    this._lastSyncTickTime = performance.now();
    this._simAccumulatorMs = 0;
    this._rAfPrevTs = 0;
    this._workerSimAccumMs = 0;
    this._workerPulsePrevTs = 0;
    this._reflectorPairCount = 0;
    this._explosionFlashPending = 0;
    this._gameLoopWorkerTickSeen = false;

    this._bindVisibilityForOffline();
    this.loop(this.last_timestamp);
    if (!this.game.paused) {
      this._syncGameLoopWorkerTimerControl(true);
      queueGameLoopWorkerKick(this);
    }

    if (this.game.state) this.game.state.engine_status = EngineStatus.RUNNING;
  }

  stop() {
    if (!this.running) return;
    logger.log("info", "engine", "Engine stopping.");
    cancelPendingPhysicsWorkerHeat(this);
    cancelPendingGameLoopWorkerTick(this);
    this._syncGameLoopWorkerTimerControl(false);
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

  _updateValveNeighborCache() {
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

    this.last_timestamp = timestamp;

    if (!this._useGameLoopWorker()) {
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
        this._lastSyncTickTime = timestamp;
        this.tick();
        n++;
      }
      if (n > 0) {
        logger.log("debug", "engine", "[Main-Thread] Synchronous tick batch", { ticks: n });
      }
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
    const currentTickNumber = this.tick_count;
    
    logger.log('debug', 'engine', `[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Running: ${this.running}, Multiplier: ${multiplier.toFixed(4)}`);

    if (this.game.paused && !manual) {
      logger.log('debug', 'engine', '[TICK ABORTED] Game is paused.');
      return;
    }

    logger.groupCollapsed(`Processing Tick #${currentTickNumber} (Manual: ${manual}, x${multiplier.toFixed(2)})`);
    try {
      const tickCtx = { multiplier, manual, power_add: 0, heat_add: 0, visualEvents: [] };
      this._currentTickCtx = tickCtx;
      this.tickOrchestrator.runPhaseSync("intents", tickCtx);

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

      if (this._workerPending) {
        logger.log("debug", "engine", "[TICK ABORTED] Physics worker heat step still pending.");
        return;
      }
      
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_total");
    }

    const reactor = this.game.reactor;

    if (this.game.state) this.game.state.engine_status = EngineStatus.TICK;

    const powerBeforeTick = reactor.current_power;
    const heatBeforeTick = reactor.current_heat;

    syncActivePartsAtTickBoundary(this);

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_cells");
    }

    this.tickOrchestrator.runPhaseSync("cells", tickCtx);
    let { power_add, heat_add } = tickCtx;

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_cells");
    }

    logger.log("debug", "engine", "[PhysicsWorker path] cell power_add:", { power_add, heat_add, tickId: this.tick_count });

    reactor.current_heat = reactor.current_heat.add(heat_add);

    const usePhysicsWorker = this._useWorker();
    if (!usePhysicsWorker) {
      this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
      return;
    }

    const payload = this._buildHeatPayload(multiplier);
    if (!payload) {
      failSimulationHardwareIncompatible(this, "heatPayload");
      return;
    }
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
    const result = validatePhysicsTickInput(payload.msg, "PhysicsWorker send");
    if (!result.success) {
      this._workerPending = false;
      this._workerTickContext = null;
      this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
      return;
    }
    logger.log("debug", "engine", "[PhysicsWorker] posting heat step, awaiting response:", { power_add, tickId: this._workerTickId });
    if (!postWorkerMessage(this, result.data, payload.transferList)) {
      cancelPendingPhysicsWorkerHeat(this, { syncFallback: true, reason: "postMessage" });
      return;
    }
    this._heatTransferHeat = null;
    this._heatTransferContainment = null;
    clearPhysicsWorkerHeartbeat(this);
    this._workerHeartbeatId = setTimeout(() => onPhysicsWorkerHeatTimeout(this), this._workerHeartbeatMs);
    return;
    } catch (error) {
      logger.log('error', 'engine', 'Error in _processTick:', error);
      if (this.game.state) this.game.state.engine_status = EngineStatus.STOPPED;
      throw error;
    } finally {
      this._currentTickCtx = null;
      logger.groupEnd();
    }
  }

  _continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, explosionIndices = null) {
    runPostHeatPhase(this, { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick }, explosionIndices);
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  beginFastForwardCatchup() {
    const ticks = startOfflineFastForward(this);
    if (ticks > 0) void runChunkedOfflineReplay(this, { totalTicks: ticks });
    else queueGameLoopWorkerKick(this);
  }

  handleComponentExplosion(tile) {
    handleComponentExplosion(this, tile);
  }

  _getValveOrientation(valveId) {
    return getValveOrientation(valveId, this._valveOrientationCache);
  }

  _getInputOutputNeighbors(valve, neighbors, orientation) {
    return getInputOutputNeighbors(valve, neighbors, orientation);
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
