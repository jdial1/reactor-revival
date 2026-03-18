import { fromError } from "zod-validation-error";
import { toDecimal, performance, isTestEnv } from "../utils/utils_constants.js";
import { HeatSystem, buildHeatPayload, runHeatStepFromTyped } from "./heat_system.js";
import { logger } from "../utils/utils_constants.js";
import { runInstantCatchup as runInstantCatchupFromModule } from "./engine_scheduler.js";
import { runLoopIteration, updateTimeFluxUI } from "./engine_scheduler.js";
import { serializeStateForGameLoopWorker, applyGameLoopTickResult } from "./heat_system.js";
import {
  GRID_SIZE_NO_SAB_THRESHOLD,
  WORKER_HEARTBEAT_MS,
  WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK,
  PAUSED_POLL_MS,
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
} from "../utils/utils_constants.js";
import { PhysicsTickInputSchema, PhysicsTickResultSchema } from "../utils/utils_constants.js";
import {
  AUTONOMIC_REPAIR_POWER_COST,
  AUTONOMIC_REPAIR_POWER_MIN,
  EP_HEAT_SAFE_CAP,
  EP_CHANCE_LOG_BASE,
  VALVE_OVERFLOW_THRESHOLD,
  REACTOR_HEAT_STANDARD_DIVISOR,
  HEAT_REMOVAL_TARGET_RATIO,
  MULTIPLIER_FLOOR,
  MAX_EP_EMIT_PER_TICK,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  HEAT_CALC_POOL_SIZE,
  FLUX_ACCUMULATOR_POWER_RATIO_MIN,
  FLUX_ACCUMULATOR_EP_RATE,
  REALITY_FLUX_RATE_PROTIUM,
  REALITY_FLUX_RATE_NEFASTIUM,
  REALITY_FLUX_RATE_BLACK_HOLE,
} from "../utils/utils_constants.js";
import {
  VISUAL_PARTICLE_HIGH_THRESHOLD,
  VISUAL_PARTICLE_MED_THRESHOLD,
  VISUAL_PARTICLE_HIGH_COUNT,
  VISUAL_PARTICLE_MED_COUNT,
} from "../utils/utils_constants.js";
import Decimal, { toDecimal as toDecimalUtil } from "../utils/utils_constants.js";
import { updateDecimal, setDecimal } from "./store.js";
import { buildFacts } from "./game/GameModule.js";
import { HEAT_EPSILON } from "../utils/utils_constants.js";
import {
  INLET_STRIDE, VALVE_STRIDE, EXCHANGER_STRIDE, OUTLET_STRIDE,
} from "./heat_system.js";

function ensureArraysValid(engine) {
  if (!Array.isArray(engine.active_cells)) engine.active_cells = [];
  if (!Array.isArray(engine.active_vessels)) engine.active_vessels = [];
  if (!Array.isArray(engine.active_inlets)) engine.active_inlets = [];
  if (!Array.isArray(engine.active_exchangers)) engine.active_exchangers = [];
  if (!Array.isArray(engine.active_outlets)) engine.active_outlets = [];
}

function updatePartCaches(engine) {
  if (!engine._partCacheDirty) return;
  ensureArraysValid(engine);

  engine.active_cells.length = 0;
  engine.active_vessels.length = 0;
  engine.active_inlets.length = 0;
  engine.active_exchangers.length = 0;
  engine.active_outlets.length = 0;
  engine.active_valves.length = 0;
  engine.active_vents.length = 0;
  engine.active_capacitors.length = 0;

  for (let row = 0; row < engine.game._rows; row++) {
    for (let col = 0; col < engine.game._cols; col++) {
      const tile = engine.game.tileset.getTile(row, col);
      if (!tile?.part) continue;

      const part = tile.part;
      const k = part.getCacheKinds(tile);
      if (k.cells) engine.active_cells.push(tile);
      if (k.inlets) engine.active_inlets.push(tile);
      if (k.exchangers) engine.active_exchangers.push(tile);
      if (k.valves) engine.active_valves.push(tile);
      if (k.outlets) engine.active_outlets.push(tile);
      if (k.vents) engine.active_vents.push(tile);
      if (k.capacitors) engine.active_capacitors.push(tile);
      if (k.vessels) engine.active_vessels.push(tile);
    }
  }

  engine._partCacheDirty = false;
}

function updateValveNeighborCache(engine) {
  if (!engine._valveNeighborCacheDirty) return;

  engine._valveNeighborCache.clear();

  if (engine._partCacheDirty) {
    updatePartCaches(engine);
  }

  if (!Array.isArray(engine.active_exchangers)) {
    engine.active_exchangers = [];
  }

  for (let i = 0; i < engine.active_valves.length; i++) {
    const tile = engine.active_valves[i];
    const neighbors = tile.containmentNeighborTiles;
    for (let j = 0; j < neighbors.length; j++) {
      const neighbor = neighbors[j];
      if (neighbor.part) {
        const nk = neighbor.part.getCacheKinds(neighbor);
        if (!nk.valves) engine._valveNeighborCache.add(neighbor);
      }
    }
  }

  engine._valveNeighborCacheDirty = false;
}

function createVisualEventBuffer(maxEvents) {
  const buffer = new Uint32Array(maxEvents * 4);
  let head = 0;
  let tail = 0;
  return {
    enqueue(typeId, row, col, value) {
      const idx = head * 4;
      buffer[idx] = typeId;
      buffer[idx + 1] = row;
      buffer[idx + 2] = col;
      buffer[idx + 3] = value;
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
    this.time_accumulator = 0;
    this._frameTimeAccumulator = 0;
    this._timeFluxCatchupTotalTicks = 0;
    this._timeFluxCatchupRemainingTicks = 0;
    this._timeFluxFastForward = false;
    this._welcomeBackFastForward = false;
  }
  get game() {
    return this._engine.game;
  }
  addTimeTicks(tickCount) {
    const targetTickDuration = this.game.loop_wait;
    this.time_accumulator += tickCount * targetTickDuration;
    const queuedTicks = Math.floor(this.time_accumulator / targetTickDuration);
    this.game.emit?.("timeFluxButtonUpdate", { queuedTicks });
  }
  getQueuedTicks() {
    return Math.floor(this.time_accumulator / this.game.loop_wait);
  }
  get isFastForwarding() {
    return this._timeFluxFastForward;
  }
  set isFastForwarding(val) {
    this._timeFluxFastForward = val;
  }
  resetCatchupState() {
    this._timeFluxCatchupTotalTicks = 0;
    this._timeFluxCatchupRemainingTicks = 0;
    this._welcomeBackFastForward = false;
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

export const VISUAL_EVENT_POWER = 1;
export const VISUAL_EVENT_HEAT = 2;
export const VISUAL_EVENT_EXPLOSION = 3;

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

function initSABState(engine) {
  engine._heatUseSABNative = typeof SharedArrayBuffer !== "undefined" &&
    typeof globalThis.crossOriginIsolated !== "undefined" &&
    globalThis.crossOriginIsolated === true;
  engine._heatUseSABOverride = false;
  engine._heatUseSAB = engine._heatUseSABNative;
  engine._heatSABView = null;
  engine._containmentSABView = null;
  engine._heatTransferHeat = null;
  engine._heatTransferContainment = null;
}

function initWorkerState(engine) {
  engine._worker = null;
  engine._workerPending = false;
  engine._workerHeartbeatId = null;
  engine._workerFailed = false;
  engine._workerTickId = 0;
  engine._lastHeatTimeoutWarn = 0;
  engine._heatWorkerConsecutiveTimeouts = 0;
  engine._gameLoopWorker = null;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopTickContext = null;
  engine._gameLoopWorkerFailed = false;
  engine._gameLoopWorkerTickId = 0;
}

function initAllEngineState(engine) {
  initHeatCalcState(engine);
  initValveState(engine);
  initHeatPayloadBuffers(engine);
  initSABState(engine);
  initWorkerState(engine);
}

function handleComponentExplosion(engine, tile) {
  tile.exploded = true;
  if (engine.game.audio) {
    const pan = engine.game.calculatePan ? engine.game.calculatePan(tile.col) : 0;
    engine.game.audio.play('explosion', null, pan);
  }

  if (tile && tile.heat_contained > 0) {
    if (engine.game.reactor.decompression_enabled) {
      const heatToRemove = tile.heat_contained;
      const after = engine.game.reactor.current_heat.sub(heatToRemove);
      engine.game.reactor.current_heat = after.lt(0) ? toDecimalUtil(0) : after;
      logger.log('debug', 'engine', `[DECOMPRESSION] Vented ${heatToRemove} heat from explosion.`);
    } else {
      engine.game.reactor.current_heat = engine.game.reactor.current_heat.add(tile.heat_contained);
    }
  }
  if (engine.game.reactor.insurance_percentage > 0 && tile.part) {
    const costNum = tile.part.cost && typeof tile.part.cost.toNumber === 'function' ? tile.part.cost.toNumber() : Number(tile.part.cost || 0);
    const refund = Math.floor(costNum * engine.game.reactor.insurance_percentage);
    if (refund > 0) {
      engine.game.addMoney(refund);
      logger.log('debug', 'engine', `[INSURANCE] Refunded $${refund} for exploded ${tile.part.id}`);
    }
  }

  tile.exploding = true;
  if (typeof engine.game.emit === "function") {
    engine.game.emit("component_explosion", { row: tile.row, col: tile.col, partId: tile.part?.id });
  }
  setTimeout(() => {
    engine.handleComponentDepletion(tile);
    tile.exploding = false;
  }, 600);
}

function processAutoSell(engine, multiplier, effectiveMaxPower) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  const autoSellEnabled = reactor.auto_sell_enabled ?? game.state?.auto_sell ?? false;

  if (!autoSellEnabled) return;

  const sellCap = effectiveMaxPower.mul(reactor.auto_sell_multiplier).mul(multiplier);
  const sellAmount = Decimal.min(reactor.current_power, sellCap);
  logger.log('debug', 'engine', `[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
  if (sellAmount.gt(0)) {
    reactor.current_power = reactor.current_power.sub(sellAmount);
    const value = sellAmount.mul(reactor.sell_price_multiplier || 1);
    engine.game.addMoney(value);
    let capacitor6Overcharged = false;
    for (let capIdx = 0; capIdx < engine.active_capacitors.length; capIdx++) {
      const capTile = engine.active_capacitors[capIdx];
      if (capTile?.part?.level === 6 || capTile?.part?.id === "capacitor6") {
        const cap = capTile.part.containment || 1;
        if (cap > 0 && (capTile.heat_contained || 0) / cap > 0.95) {
          capacitor6Overcharged = true;
          break;
        }
      }
    }
    if (capacitor6Overcharged) reactor.current_heat = reactor.current_heat.add(sellAmount.mul(0.5));
  }
}

const VENT6_ID = "vent6";

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
  const tileset = engine.game.tileset;

  activeVents.forEach((tile) => {
    if (!tile.part) return;
    let ventRate = tile.getEffectiveVentValue() * multiplier;
    if (ventRate <= 0) return;
    ventRate = applyConvectiveBoost(ventRate, reactor, tileset, tile.row, tile.col);
    const heat = tile.heat_contained;
    let vent_reduce = Math.min(ventRate, heat);
    if (tile.part.id === VENT6_ID) vent_reduce = applyVent6PowerCost(reactor, vent_reduce);
    tile.heat_contained -= vent_reduce;
    if (reactor.stirling_multiplier > 0 && vent_reduce > 0)
      stirlingPowerAdd += vent_reduce * reactor.stirling_multiplier;
    if (vent_reduce > 0) engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
  });
  return stirlingPowerAdd;
}

function processFluxAccumulators(engine, multiplier) {
  const reactor = engine.game.reactor;
  const game = engine.game;

  let fluxLevel = reactor.flux_accumulator_level;
  if (!fluxLevel && engine.game.upgradeset) {
    const upg = engine.game.upgradeset.getUpgrade("flux_accumulators");
    if (upg) fluxLevel = upg.level;
  }
  if (fluxLevel <= 0 || !reactor.max_power.gt(0)) return;

  const powerRatio = reactor.current_power.div(reactor.max_power).toNumber();
  if (powerRatio < FLUX_ACCUMULATOR_POWER_RATIO_MIN) return;

  let activeCaps = 0;
  for (let j = 0; j < engine.active_vessels.length; j++) {
    const t = engine.active_vessels[j];
    if (t.part?.category === 'capacitor') {
      const capLevel = t.part.level || 1;
      activeCaps += capLevel;
    }
  }

  const epGain = FLUX_ACCUMULATOR_EP_RATE * fluxLevel * activeCaps * multiplier;
  if (epGain > 0) {
    game.exoticParticleManager.exotic_particles = game.exoticParticleManager.exotic_particles.add(epGain);
    updateDecimal(game.state, "total_exotic_particles", (d) => d.add(epGain));
    updateDecimal(game.state, "current_exotic_particles", (d) => d.add(epGain));
  }
}

function processRealityFlux(engine, multiplier) {
  const game = engine.game;
  const activeTiles = game.tileset?.active_tiles_list;
  if (!activeTiles?.length) return;

  let realityFluxGain = 0;
  for (let i = 0; i < activeTiles.length; i++) {
    const part = activeTiles[i].part;
    if (!part) continue;
    if (part.type === "protium") realityFluxGain += REALITY_FLUX_RATE_PROTIUM;
    else if (part.type === "nefastium") realityFluxGain += REALITY_FLUX_RATE_NEFASTIUM;
    else if (part.id === "particle_accelerator6") realityFluxGain += REALITY_FLUX_RATE_BLACK_HOLE;
  }
  realityFluxGain *= multiplier;
  if (realityFluxGain > 0) {
    const add = toDecimalUtil(realityFluxGain);
    updateDecimal(game.state, "reality_flux", (d) => d.add(add));
  }
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
      engine.enqueueVisualEvent(VISUAL_EVENT_POWER, tile.row, tile.col, 0);
    }
  }
  if (tile.heat > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.heat);
    for (let k = 0; k < count; k++) {
      engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
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
    engine.game.update_cell_power();
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

function handlerAcceleratorEP(engine, multiplier) {
  let ep_chance_add = 0;
  const vessels = engine.active_vessels || [];
  for (let i = 0; i < vessels.length; i++) {
    const tile = vessels[i];
    const part = tile.part;
    if (part && part.category === "particle_accelerator" && tile.heat_contained > 0) {
      const lower_heat = Math.min(tile.heat_contained, part.ep_heat, EP_HEAT_SAFE_CAP);
      if (lower_heat <= 0 || !Number.isFinite(part.ep_heat) || part.ep_heat <= 0) continue;
      const chance = (Math.log(lower_heat) / Math.log(EP_CHANCE_LOG_BASE)) * (lower_heat / part.ep_heat);
      ep_chance_add += Number.isFinite(chance) ? chance * multiplier : 0;
    }
  }
  return ep_chance_add;
}

function handlerAutonomicRepair(engine, multiplier) {
  const reactor = engine.game.reactor;
  if (reactor.auto_repair_rate <= 0 || !reactor.current_power.gte(AUTONOMIC_REPAIR_POWER_MIN)) return;
  let repairsRemaining = Math.floor(reactor.auto_repair_rate * multiplier);
  const cells = engine.active_cells || [];
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (repairsRemaining <= 0 || reactor.current_power.lt(AUTONOMIC_REPAIR_POWER_COST)) return;
    if (tile.part && tile.part.ticks > 0) {
      tile.ticks += 1;
      reactor.current_power = reactor.current_power.sub(AUTONOMIC_REPAIR_POWER_COST);
      repairsRemaining--;
    }
  }
}

function handlerAutoSell(engine, multiplier, options) {
  const effectiveMaxPower = options?.effectiveMaxPower;
  if (!effectiveMaxPower) return;
  processAutoSell(engine, multiplier, effectiveMaxPower);
}

const PHASE_REGISTRY = new Map([
  ["cells", { getTiles: (e) => e.active_cells || [], handler: (engine, multiplier) => processCells(engine, multiplier) }],
  ["acceleratorHeat", { getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.id === "particle_accelerator6"), handler: (engine, multiplier, options) => handlerAcceleratorHeat(engine, multiplier, options) }],
  ["acceleratorEP", { getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.category === "particle_accelerator"), handler: (engine, multiplier) => handlerAcceleratorEP(engine, multiplier) }],
  ["vents", { getTiles: (e) => e.active_vents || [], handler: (engine, multiplier) => processVents(engine, multiplier) }],
  ["fluxAccumulators", { getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.category === "capacitor"), handler: (engine, multiplier) => processFluxAccumulators(engine, multiplier) }],
  ["realityFlux", { getTiles: (e) => e.game?.tileset?.active_tiles_list || [], handler: (engine, multiplier) => processRealityFlux(engine, multiplier) }],
  ["autonomicRepair", { getTiles: (e) => e.active_cells || [], handler: (engine, multiplier) => handlerAutonomicRepair(engine, multiplier) }],
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
  const cols = engine.game.gridManager.cols;
  for (let i = 0; i < explosionIndices.length; i++) {
    const idx = explosionIndices[i] | 0;
    const tile = ts.getTile((idx / cols) | 0, idx % cols);
    if (!tile?.part || tile.exploded) continue;
    explodeTile(engine, tile);
  }
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
}

function explodeTilesFromActiveVessels(engine) {
  collectTilesOverContainment(engine);
  const tilesToExplode = engine._explosion_tilesToExplode;
  for (let i = 0; i < tilesToExplode.length; i++) {
    explodeTile(engine, tilesToExplode[i]);
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
  return reactor.altered_max_power && toDecimalUtil(reactor.altered_max_power).neq(reactor.base_max_power)
    ? toDecimalUtil(reactor.altered_max_power)
    : reactor.max_power;
}

function applyPowerOverflow(reactor, power_add) {
  const effectiveMaxPower = getEffectiveMaxPower(reactor);
  const potentialPower = reactor.current_power.add(power_add);
  if (potentialPower.gt(effectiveMaxPower)) {
    const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
    reactor.current_power = effectiveMaxPower;
    reactor.current_heat = reactor.current_heat.add(potentialPower.sub(effectiveMaxPower).mul(overflowToHeat));
  } else {
    reactor.current_power = potentialPower;
  }
  return effectiveMaxPower;
}

function computeEpGain(ep_chance_add) {
  if (ep_chance_add <= 0) return 0;
  let ep_gain = Math.floor(ep_chance_add);
  if (Math.random() < (ep_chance_add % 1)) ep_gain++;
  return ep_gain <= 0 ? 0 : ep_gain;
}

function applyEpToGame(engine, ep_gain) {
  const game = engine.game;
  game.exoticParticleManager.exotic_particles = game.exoticParticleManager.exotic_particles.add(ep_gain);
  updateDecimal(game.state, "total_exotic_particles", (d) => d.add(ep_gain));
  updateDecimal(game.state, "current_exotic_particles", (d) => d.add(ep_gain));
}

function emitParticleVisuals(engine) {
  try {
    if (typeof engine.game.emit !== "function") return;
    let emitted = 0;
    for (let j = 0; j < engine.active_vessels.length; j++) {
      const t = engine.active_vessels[j];
      if (t.part?.category === "particle_accelerator" && t.heat_contained > 0) {
        engine.game.emit("exoticParticleEmitted", { tile: t });
        emitted++;
        if (emitted >= MAX_EP_EMIT_PER_TICK) break;
      }
    }
  } catch (_) {}
}

function applyExoticParticleGain(engine, ep_chance_add) {
  const ep_gain = computeEpGain(ep_chance_add);
  if (ep_gain <= 0) return;
  applyEpToGame(engine, ep_gain);
  emitParticleVisuals(engine);
}

function updateReactorStats(reactor) {
  reactor.updateStats();
  if (typeof reactor.recordClassificationStats === "function") reactor.recordClassificationStats();
}

function applyPowerMultiplier(reactor, power_add) {
  const powerMult = reactor.power_multiplier || 1;
  if (powerMult !== 1) {
    const extra = power_add * (powerMult - 1);
    reactor.current_power = reactor.current_power.add(extra);
    if (reactor.current_power.gt(reactor.max_power)) {
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_heat = reactor.current_heat.add(reactor.current_power.sub(reactor.max_power).mul(overflowToHeat));
      reactor.current_power = reactor.max_power;
    }
  }
  if (reactor.current_power.gt(reactor.max_power)) reactor.current_power = reactor.max_power;
}

function applyStatsThenPowerMult(reactor, power_add) {
  updateReactorStats(reactor);
  applyPowerMultiplier(reactor, power_add);
}

function applyStatsPowerMultThenAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier) {
  applyStatsThenPowerMult(reactor, power_add);
  processComponentPhase(engine, "autoSell", multiplier, { effectiveMaxPower });
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
  if (reactor.current_heat.gt(0) && reactor.heat_controlled) {
    const ventBonus = reactor.vent_multiplier_eff || 0;
    const baseRed = reactor.max_heat.toNumber() / REACTOR_HEAT_STANDARD_DIVISOR;
    const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
    reactor.current_heat = reactor.current_heat.sub(reduction);
  }
  if (reactor.current_heat.lt(0)) reactor.current_heat = toDecimalUtil(0);
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

function updatePostTickAudio(engine, reactor) {
  if (engine.game.audio?.ambienceManager) {
    engine.game.audio.ambienceManager.updateAmbienceHeat(reactor.current_heat.toNumber(), reactor.max_heat.toNumber());
  }
  if (engine.game.audio?.industrialManager) {
    engine.game.audio.industrialManager.scheduleIndustrialAmbience(engine.active_vents.length, engine.active_exchangers.length);
  }
}

function syncStateThenVisuals(engine, reactor, ctx) {
  syncStateVars(reactor, engine.game, ctx);
  updatePostTickAudio(engine, reactor);
}

function emitTickCompleteEvent(engine, reactor) {
  if (typeof engine.game.emit !== "function") return;
  engine.game.emit("tick_complete", {
    tick: engine.tick_count,
    power: reactor.current_power,
    heat: reactor.current_heat,
    activeCells: engine.active_cells.length,
    activeVents: engine.active_vents.length,
  });
}

function finalizeTick(engine) {
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
  if (engine._eventHead !== engine._eventTail) {
    engine.game.emit?.("visualEventsReady", engine.getEventBuffer());
  }
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_total");
  }
  emitTickCompleteEvent(engine, engine.game.reactor);
  const game = engine.game;
  const facts = buildFacts(game, engine);
  if (!facts.isSandbox && typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  engine.tick_count++;
}

function runPostHeatPhase(engine, ctx, explosionIndices = null) {
  const reactor = engine.game.reactor;
  const ui = engine.game.ui;
  const { multiplier } = ctx;
  let { power_add } = ctx;

  power_add = processComponentPhase(engine, "acceleratorHeat", multiplier, { power_add });
  const ep_chance_add = processComponentPhase(engine, "acceleratorEP", multiplier);
  withPerf(engine, "tick_explosions", () => processExplosionsPhase(engine, explosionIndices));
  power_add = processComponentPhase(engine, "vents", multiplier, { power_add });
  const effectiveMaxPower = applyPowerOverflow(reactor, power_add);
  applyExoticParticleGain(engine, ep_chance_add);
  applyStatsPowerMultThenAutoSell(engine, reactor, power_add, effectiveMaxPower, multiplier);
  applyHeatReductions(reactor, multiplier);
  processComponentPhase(engine, "fluxAccumulators", multiplier);
  processComponentPhase(engine, "realityFlux", multiplier);
  processComponentPhase(engine, "autonomicRepair", multiplier);
  syncStateThenVisuals(engine, reactor, ctx);
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_stats");
  }
  finalizeTick(engine);
}

function onGameLoopWorkerMessage(engine, e) {
  const data = e.data;
  if (data?.type !== "tickResult") return;
  engine._gameLoopWorkerPending = false;
  const ctx = engine._gameLoopTickContext;
  engine._gameLoopTickContext = null;
  if (data.error) {
    logger.log("warn", "engine", "[GameLoopWorker] received error result:", data.message);
    return;
  }
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("debug", "engine", "[GameLoopWorker] tickId mismatch or no context, skipping:", { received: data.tickId, expected: ctx?.tickId });
    return;
  }
  logger.log("debug", "engine", "[GameLoopWorker] applying tickResult:", { tickId: data.tickId, reactorPower: data.reactorPower });
  applyGameLoopTickResult(engine, data);
}

function validateWorkerResponse(engine, data) {
  const useSAB = data?.useSAB === true;
  if (!useSAB && !data?.heatBuffer) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no useSAB and no heatBuffer");
    engine._workerPending = false;
    return null;
  }
  if (!engine.game?.tileset) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no tileset");
    engine._workerPending = false;
    return null;
  }
  if (!engine._workerPending) return null;
  const ctx = engine._workerTickContext;
  engine._workerPending = false;
  engine._workerTickContext = null;
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: tickId mismatch", { received: data.tickId, expected: ctx?.tickId });
    return null;
  }
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
  engine._heatWorkerConsecutiveTimeouts = 0;
  const parseResult = PhysicsTickResultSchema.safeParse(data);
  if (!parseResult.success) {
    logger.log("warn", "engine", "[PhysicsWorker] Result validation failed:", fromError(parseResult.error).toString());
    return;
  }
  data = parseResult.data;
  const { ctx, useSAB } = result;
  logger.log("debug", "engine", "[PhysicsWorker] received valid response, applying power:", { power_add: ctx.power_add, tickId: data.tickId });
  if (!useSAB) applyTransferredBuffers(engine, data);
  const rawHeat = data.reactorHeat ?? engine.game.reactor.current_heat.toNumber();
  engine.game.reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  recordHeatFlowVectors(engine, data.transfers);
  const heat_add = ctx.heat_add + (data.heatFromInlets ?? 0);
  engine._continueTickAfterHeat(ctx.multiplier, ctx.power_add, heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick, data.explosionIndices);
}

function ensureGameLoopWorker(engine) {
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

function ensurePhysicsWorker(engine) {
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
    const stalled = typeof document !== "undefined" && !document.hidden &&
      this.running && !this.game.paused &&
      (performance.now() - (this.last_timestamp || 0)) > 1500;
    if (this.running && !stalled) return;
    if (stalled) this.running = false;
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
      updateTimeFluxUI(this);
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

    logger.log("debug", "engine", "[PhysicsWorker path] cell power_add:", { power_add, heat_add, tickId: this.tick_count });

    reactor.current_heat = reactor.current_heat.add(heat_add);

    const canSendWorker = this._useWorker() && this._heatUseSAB && !this._workerPending;
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
        logger.log("debug", "engine", "[PhysicsWorker] posting heat step, awaiting response:", { power_add, tickId: this._workerTickId, heatUseSAB: this._heatUseSAB });
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
          this._heatWorkerConsecutiveTimeouts = (this._heatWorkerConsecutiveTimeouts || 0) + 1;
          if (this._heatWorkerConsecutiveTimeouts >= WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK) {
            this._workerFailed = true;
            this._heatWorkerConsecutiveTimeouts = 0;
            logger.log('warn', 'engine', `[Worker] Heat step timeout (${WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK}x), disabling worker for this session`);
          } else {
            const now = performance.now();
            const throttleMs = 5000;
            if (now - (this._lastHeatTimeoutWarn || 0) >= throttleMs) {
              this._lastHeatTimeoutWarn = now;
              logger.log('warn', 'engine', '[Worker] Heat step timeout, falling back to main thread');
            }
          }
          if (ctx) {
            logger.log("debug", "engine", "[PhysicsWorker] timeout fallback applying power:", { power_add: ctx.power_add, tickId: ctx.tickId });
            this._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
          }
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
    logger.log("debug", "engine", "[PhysicsWorker] sync path (no worker), applying power:", { power_add });
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
    handleComponentExplosion(this, tile);
  }

  _getValveOrientation(valveId) {
    return getValveOrientation(valveId, this._valveOrientationCache);
  }

  _getInputOutputNeighbors(valve, neighbors, orientation) {
    return getInputOutputNeighbors(valve, neighbors, orientation);
  }
}
