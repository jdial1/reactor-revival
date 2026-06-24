import { buildFacts } from "../kernel/buildFacts.js";
import { getValveNeighborCache } from "./part-classification.js";
import { heatSfxLastTick } from "./reactor-stats.js";
import {
  runHeatTransferStep,
  canPushToNeighbor,
  transferHeatBetweenNeighbors,
  applyValveRule,
} from "../logic-heat-transfer.js";
import {
  MAX_NEIGHBORS,
  INLET_STRIDE,
  INLET_OFFSET_INDEX,
  INLET_OFFSET_RATE,
  INLET_OFFSET_N_COUNT,
  INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE,
  VALVE_OFFSET_INDEX,
  VALVE_OFFSET_TYPE,
  VALVE_OFFSET_ORIENTATION,
  VALVE_OFFSET_RATE,
  VALVE_OFFSET_INPUT_IDX,
  VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE,
  EXCHANGER_OFFSET_INDEX,
  EXCHANGER_OFFSET_RATE,
  EXCHANGER_OFFSET_CONTAINMENT,
  EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES,
  EXCHANGER_OFFSET_NEIGHBOR_CAPS,
  EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE,
  OUTLET_OFFSET_INDEX,
  OUTLET_OFFSET_RATE,
  OUTLET_OFFSET_ACTIVATED,
  OUTLET_OFFSET_IS_OUTLET6,
  OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES,
  OUTLET_OFFSET_NEIGHBOR_CAPS,
  VALVE_OVERFLOW,
  VALVE_TOPUP,
  VALVE_CHECK,
  CATEGORY_EXCHANGER,
  CATEGORY_OTHER,
  CATEGORY_VENT_COOLANT,
} from "../constants/heat-transfer.js";
import { toDecimal } from "../simUtils.js";
import { logger } from "../core/logger.js";
import {
  CRITICAL_HEAT_RATIO,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
} from "../constants/sim.js";
import { recordSimEvent } from "./sim-events.js";

const HEAT_SFX_THROTTLE = 30;

function heatWarningPredicate(facts) {
  return facts.heatRatio >= CRITICAL_HEAT_RATIO && !facts.netHeatBalanced && !facts.hasMeltedDown && !facts.isPaused;
}

function pipeIntegrityWarningPredicate(facts) {
  return (
    facts.heatRatio >= CRITICAL_HEAT_RATIO &&
    !facts.netHeatBalanced &&
    !facts.hasUpgrade("fractal_piping") &&
    !facts.hasMeltedDown &&
    !facts.isPaused
  );
}

function firstHighHeatPredicate(facts) {
  return facts.heatRatio >= 0.5 && !facts.hasMeltedDown && !facts.isPaused && !facts._firstHighHeatSeen;
}

export function syncHeatThresholdEffects(facts, game) {
  if (!game?.state) return;
  if (facts.isPaused) {
    game.state.ui_heat_critical = false;
    game.state.ui_pipe_integrity_warning = false;
    return;
  }
  game.state.ui_heat_critical = heatWarningPredicate(facts);
  game.state.ui_pipe_integrity_warning = pipeIntegrityWarningPredicate(facts);
  const tc = facts.tickCount;
  if (firstHighHeatPredicate(facts) && !game.state._firstHighHeatSeen) {
    game.state._firstHighHeatSeen = true;
  }
  if (heatWarningPredicate(facts)) {
    const last = heatSfxLastTick.get("heatWarning") ?? -Infinity;
    if (tc - last >= HEAT_SFX_THROTTLE) {
      recordSimEvent(game, { type: "HEAT_WARNING", intensity: facts.heatRatio ?? 0.85 });
      heatSfxLastTick.set("heatWarning", tc);
    }
  }
  if (pipeIntegrityWarningPredicate(facts)) {
    const last = heatSfxLastTick.get("pipeIntegrityWarning") ?? -Infinity;
    if (tc - last >= HEAT_SFX_THROTTLE) {
      recordSimEvent(game, { type: "HEAT_WARNING", intensity: facts.heatRatio ?? 0.85 });
      heatSfxLastTick.set("pipeIntegrityWarning", tc);
    }
  }
}

export function applyHeatThresholdSignals(game, engine, tickData) {
  syncHeatThresholdEffects(buildFacts(game, engine, tickData), game);
}



function fillContainmentFromTiles(ts, rows, cols, containmentOut) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = ts.getTile(r, c);
      if (tile?.part) containmentOut[ts.gridIndex(r, c)] = tile.part.containment || 0;
    }
  }
}

function isFloat32ViewUsable(view) {
  if (!view || typeof view.length !== "number" || view.length <= 0) return false;
  try {
    return view.buffer.byteLength > 0;
  } catch {
    return false;
  }
}

function ensureFloat32Capacity(existing, len) {
  if (isFloat32ViewUsable(existing) && existing.length === len) return existing;
  return new Float32Array(len);
}

export function copyFloat32View(dest, src, len) {
  if (!dest || dest.length !== len) return;
  if (src && isFloat32ViewUsable(src) && src.length === len) {
    try {
      dest.set(src);
      return;
    } catch (_) {}
  }
  for (let i = 0; i < len; i++) {
    dest[i] = src && i < src.length ? (+src[i] || 0) : 0;
  }
}

function ensureTilesetHeatMap(ts, gridLen) {
  ts.heatMap = ensureFloat32Capacity(ts.heatMap, gridLen);
  return ts.heatMap;
}

export function applyHeatViewToTileset(ts, source) {
  if (!ts || !source) return;
  const len = ts.heatMap?.length ?? source.length;
  if (!len) return;
  const dest = ensureTilesetHeatMap(ts, len);
  copyFloat32View(dest, source, len);
}

function prepareHeatContainment(engine, ts, rows, cols, gridLen) {
  engine._heatTransferHeat = ensureFloat32Capacity(engine._heatTransferHeat, gridLen);
  engine._heatTransferContainment = ensureFloat32Capacity(engine._heatTransferContainment, gridLen);
  const heatCopy = engine._heatTransferHeat;
  copyFloat32View(heatCopy, ts.heatMap, gridLen);
  const containment = engine._heatTransferContainment;
  fillContainmentFromTiles(ts, rows, cols, containment);
  return { heatCopy, containment };
}

function fillInletsBuffer(engine, ts) {
  let nInlets = 0;
  const inletsBuf = engine._heatPayload_inlets;
  for (let i = 0; i < engine.active_inlets.length && nInlets < HEAT_PAYLOAD_MAX_INLETS; i++) {
    const tile = engine.active_inlets[i];
    if (!tile.part) continue;
    const neighbors = tile.containmentNeighborTiles;
    let nCount = 0;
    for (let j = 0; j < neighbors.length && nCount < MAX_NEIGHBORS; j++) {
      const t = neighbors[j];
      if (t.part) {
        inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = ts.gridIndex(t.row, t.col);
        nCount++;
      }
    }
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
    nInlets++;
  }
  return nInlets;
}

function fillValveNeighborsBuffer(engine, ts) {
  let nValveNeighbors = 0;
  const valveNbrBuf = engine._heatPayload_valveNeighbors;
  engine._valveNeighborCache.forEach((t) => {
    if (nValveNeighbors < HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS) valveNbrBuf[nValveNeighbors++] = ts.gridIndex(t.row, t.col);
  });
  return nValveNeighbors;
}

function collectPartNeighbors(tiles, out, excludeTile = null) {
  out.length = 0;
  tiles.forEach((t) => {
    if (t.part && t !== excludeTile) out.push(t);
  });
}

function inputValveMustPointToUs(engine, inputNeighbor, valve) {
  if (inputNeighbor.part?.category !== 'valve') return true;
  const inputValveOrientation = engine._getValveOrientation(inputNeighbor.part.id);
  const inputValveNeighbors = engine._valve_inputValveNeighbors;
  collectPartNeighbors(inputNeighbor.containmentNeighborTiles, inputValveNeighbors, valve);
  const { outputNeighbor: inputValveOutput } = engine._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);
  return inputValveOutput === valve;
}

function shouldSkipValveByRatio(valvePart, inputNeighbor, outputNeighbor) {
  if (valvePart.type === 'overflow_valve') {
    const inputRatio = (inputNeighbor.heat_contained || 0) / (inputNeighbor.part.containment || 1);
    return inputRatio < VALVE_OVERFLOW_THRESHOLD;
  }
  if (valvePart.type === 'topup_valve') {
    const outputRatio = (outputNeighbor.heat_contained || 0) / (outputNeighbor.part.containment || 1);
    return outputRatio > VALVE_TOPUP_THRESHOLD;
  }
  return false;
}

function getValveTypeId(valvePart) {
  if (valvePart.type === 'overflow_valve') return VALVE_OVERFLOW;
  if (valvePart.type === 'topup_valve') return VALVE_TOPUP;
  return VALVE_CHECK;
}

function canEmitValve(engine, valve, neighbors, inputNeighbor, outputNeighbor) {
  if (!inputNeighbor || !outputNeighbor) return false;
  if (!inputValveMustPointToUs(engine, inputNeighbor, valve)) return false;
  if (shouldSkipValveByRatio(valve.part, inputNeighbor, outputNeighbor)) return false;
  return true;
}

function writeValveEntry(valvesBuf, base, ts, valve, typeId, orientation, inputNeighbor, outputNeighbor) {
  valvesBuf[base + VALVE_OFFSET_INDEX] = ts.gridIndex(valve.row, valve.col);
  valvesBuf[base + VALVE_OFFSET_TYPE] = typeId;
  valvesBuf[base + VALVE_OFFSET_ORIENTATION] = orientation;
  valvesBuf[base + VALVE_OFFSET_RATE] = valve.getEffectiveTransferValue();
  valvesBuf[base + VALVE_OFFSET_INPUT_IDX] = ts.gridIndex(inputNeighbor.row, inputNeighbor.col);
  valvesBuf[base + VALVE_OFFSET_OUTPUT_IDX] = ts.gridIndex(outputNeighbor.row, outputNeighbor.col);
}

function fillValvesBuffer(engine, ts) {
  let nValves = 0;
  const valvesBuf = engine._heatPayload_valves;
  const neighbors = engine._valveProcessing_neighbors;
  const activeValves = engine.active_valves;
  for (let vIdx = 0; vIdx < activeValves.length && nValves < HEAT_PAYLOAD_MAX_VALVES; vIdx++) {
    const valve = activeValves[vIdx];
    const valvePart = valve.part;
    if (!valvePart) continue;
    collectPartNeighbors(valve.containmentNeighborTiles, neighbors);
    if (neighbors.length < 2) continue;
    const orientation = engine._getValveOrientation(valvePart.id);
    const { inputNeighbor, outputNeighbor } = engine._getInputOutputNeighbors(valve, neighbors, orientation);
    if (!canEmitValve(engine, valve, neighbors, inputNeighbor, outputNeighbor)) continue;
    const typeId = getValveTypeId(valvePart);
    const base = nValves * VALVE_STRIDE;
    writeValveEntry(valvesBuf, base, ts, valve, typeId, orientation, inputNeighbor, outputNeighbor);
    nValves++;
  }
  return nValves;
}

const EXCHANGER_NEIGHBOR_CAT_VENT = 2;
const EXCHANGER_NEIGHBOR_CAT_EXCHANGER = 0;
const EXCHANGER_NEIGHBOR_CAT_OTHER = 1;

function getExchangerNeighborCategory(part) {
  if (part.category === 'vent' || part.category === 'coolant_cell') return EXCHANGER_NEIGHBOR_CAT_VENT;
  if (part.category === 'heat_exchanger') return EXCHANGER_NEIGHBOR_CAT_EXCHANGER;
  return EXCHANGER_NEIGHBOR_CAT_OTHER;
}

function fillExchangerNeighborSlots(exchBuf, base, ts, neighborsAll) {
  let nCount = 0;
  for (let n = 0; n < neighborsAll.length && nCount < MAX_NEIGHBORS; n++) {
    const t = neighborsAll[n];
    if (!t.part) continue;
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = ts.gridIndex(t.row, t.col);
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + nCount] = t.part.containment || 0;
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + nCount] = getExchangerNeighborCategory(t.part);
    nCount++;
  }
  return nCount;
}

function fillExchangersBuffer(engine, ts) {
  let nExchangers = 0;
  const exchBuf = engine._heatPayload_exchangers;
  for (let i = 0; i < engine.active_exchangers.length && nExchangers < HEAT_PAYLOAD_MAX_EXCHANGERS; i++) {
    const tile = engine.active_exchangers[i];
    const part = tile.part;
    if (!part || part.category === 'valve') continue;
    const base = nExchangers * EXCHANGER_STRIDE;
    const nCount = fillExchangerNeighborSlots(exchBuf, base, ts, tile.containmentNeighborTiles);
    exchBuf[base + EXCHANGER_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
    exchBuf[base + EXCHANGER_OFFSET_RATE] = tile.getEffectiveTransferValue();
    exchBuf[base + EXCHANGER_OFFSET_CONTAINMENT] = part.containment || 1;
    exchBuf[base + EXCHANGER_OFFSET_N_COUNT] = nCount;
    nExchangers++;
  }
  return nExchangers;
}

function collectOutletNeighbors(tile, outNeighbors) {
  outNeighbors.length = 0;
  const contNeighbors = tile.containmentNeighborTiles;
  for (let j = 0; j < contNeighbors.length; j++) {
    const t = contNeighbors[j];
    if (t.part && t.part.category !== 'valve') outNeighbors.push(t);
  }
}

function writeOutletEntry(outBuf, base, ts, tile, part, outNeighbors) {
  outBuf[base + OUTLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
  outBuf[base + OUTLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
  outBuf[base + OUTLET_OFFSET_ACTIVATED] = tile.activated ? 1 : 0;
  outBuf[base + OUTLET_OFFSET_IS_OUTLET6] = part.outlet_respect_neighbor_cap ? 1 : 0;
  outBuf[base + OUTLET_OFFSET_N_COUNT] = outNeighbors.length;
  for (let j = 0; j < outNeighbors.length && j < MAX_NEIGHBORS; j++) {
    const t = outNeighbors[j];
    outBuf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = ts.gridIndex(t.row, t.col);
    outBuf[base + OUTLET_OFFSET_NEIGHBOR_CAPS + j] = t.part?.containment || 0;
  }
}

function fillOutletsBuffer(engine, ts) {
  let nOutlets = 0;
  const outBuf = engine._heatPayload_outlets;
  const outNeighbors = engine._outletProcessing_neighbors;
  for (let i = 0; i < engine.active_outlets.length && nOutlets < HEAT_PAYLOAD_MAX_OUTLETS; i++) {
    const tile = engine.active_outlets[i];
    const part = tile.part;
    if (!part) continue;
    collectOutletNeighbors(tile, outNeighbors);
    const base = nOutlets * OUTLET_STRIDE;
    writeOutletEntry(outBuf, base, ts, tile, part, outNeighbors);
    nOutlets++;
  }
  return nOutlets;
}

function buildPayload(engine, ctx) {
  const { heatCopy, containment, reactorHeatNum, multiplier, rows, cols, nInlets, nValves, nValveNeighbors, nExchangers, nOutlets } = ctx;
  const inletsBuf = engine._heatPayload_inlets;
  const valvesBuf = engine._heatPayload_valves;
  const valveNbrBuf = engine._heatPayload_valveNeighbors;
  const exchBuf = engine._heatPayload_exchangers;
  const outBuf = engine._heatPayload_outlets;
  const inletsCopy = new Float32Array(nInlets * INLET_STRIDE);
  inletsCopy.set(inletsBuf.subarray(0, nInlets * INLET_STRIDE));
  const valvesCopy = new Float32Array(nValves * VALVE_STRIDE);
  valvesCopy.set(valvesBuf.subarray(0, nValves * VALVE_STRIDE));
  const valveNeighborsCopy = new Float32Array(nValveNeighbors);
  valveNeighborsCopy.set(valveNbrBuf.subarray(0, nValveNeighbors));
  const exchangersCopy = new Float32Array(nExchangers * EXCHANGER_STRIDE);
  exchangersCopy.set(exchBuf.subarray(0, nExchangers * EXCHANGER_STRIDE));
  const outletsCopy = new Float32Array(nOutlets * OUTLET_STRIDE);
  outletsCopy.set(outBuf.subarray(0, nOutlets * OUTLET_STRIDE));
  const transferList = [
    heatCopy.buffer,
    containment.buffer,
    inletsCopy.buffer,
    valvesCopy.buffer,
    valveNeighborsCopy.buffer,
    exchangersCopy.buffer,
    outletsCopy.buffer
  ];
  const msg = {
    heatBuffer: heatCopy.buffer,
    containmentBuffer: containment.buffer,
    reactorHeat: reactorHeatNum,
    multiplier,
    rows,
    cols,
    inletsData: inletsCopy.buffer,
    nInlets,
    valvesData: valvesCopy.buffer,
    nValves,
    valveNeighborData: valveNeighborsCopy.buffer,
    nValveNeighbors,
    exchangersData: exchangersCopy.buffer,
    nExchangers,
    outletsData: outletsCopy.buffer,
    nOutlets
  };
  const typedPayload = {
    heat: ctx.heatCopy,
    containment: ctx.containment,
    reactorHeat: ctx.reactorHeatNum,
    multiplier: ctx.multiplier,
    inletsData: inletsBuf,
    nInlets: ctx.nInlets,
    valvesData: valvesBuf,
    nValves: ctx.nValves,
    valveNeighborData: valveNbrBuf,
    nValveNeighbors: ctx.nValveNeighbors,
    exchangersData: exchBuf,
    nExchangers: ctx.nExchangers,
    outletsData: outBuf,
    nOutlets: ctx.nOutlets
  };
  return { msg, transferList, typedPayload };
}

export function buildHeatPayload(engine, multiplier) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  const rows = game.rows;
  const cols = game.cols;
  const gridLen = ts.heatMap.length;
  const { heatCopy, containment } = prepareHeatContainment(engine, ts, rows, cols, gridLen);
  const nInlets = fillInletsBuffer(engine, ts);
  const nValveNeighbors = fillValveNeighborsBuffer(engine, ts);
  const nValves = fillValvesBuffer(engine, ts);
  const nExchangers = fillExchangersBuffer(engine, ts);
  const nOutlets = fillOutletsBuffer(engine, ts);
  const reactorHeatNum = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
  const ctx = { heatCopy, containment, reactorHeatNum, multiplier, rows, cols, nInlets, nValves, nValveNeighbors, nExchangers, nOutlets };
  const { msg, transferList, typedPayload } = buildPayload(engine, ctx);
  return { msg, transferList, payloadForSync: typedPayload };
}

const HEAT_CONDUCTING_CATEGORIES = ['heat_exchanger', 'heat_outlet', 'heat_inlet'];

function isHeatConducting(tile) {
  if (!tile?.part || !tile.activated) return false;
  const p = tile.part;
  return (p.containment ?? 0) > 0 || HEAT_CONDUCTING_CATEGORIES.includes(p.category);
}

export class HeatSystem {
  constructor(engine) {
    this.engine = engine;
    this.segments = new Map();
    this.tileSegmentMap = new Map();
    this._segmentsDirty = true;
    this._parent = new Map();
  }

  processTick(multiplier = 1.0) {
    const engine = this.engine;
    const build = engine._buildHeatPayload(multiplier);
    if (!build?.payloadForSync) return { heatFromInlets: 0, transfers: [] };
    const game = engine.game;
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_heat_transfer");
    }
    const { heat, containment, reactorHeat, multiplier: payloadMultiplier, ...componentSet } = build.payloadForSync;
    const recordTransfers = [];
    const result = runHeatTransferStep(componentSet, { heat, containment }, {
      reactorHeat,
      multiplier: payloadMultiplier ?? multiplier,
      recordTransfers,
    });
    applyHeatViewToTileset(engine.game.tileset, heat);
    engine.game.reactor.current_heat = toDecimal(result.reactorHeat);
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_heat_transfer");
    }
    return { heatFromInlets: result.heatFromInlets, transfers: recordTransfers };
  }

  markSegmentsAsDirty() {
    this._segmentsDirty = true;
  }

  _find(tile) {
    let p = this._parent.get(tile);
    if (p === undefined) return tile;
    if (p === tile) return tile;
    const root = this._find(p);
    this._parent.set(tile, root);
    return root;
  }

  _union(a, b) {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra !== rb) this._parent.set(ra, rb);
  }

  updateSegments() {
    if (!this._segmentsDirty) return;
    this._segmentsDirty = false;
    this.segments.clear();
    this.tileSegmentMap.clear();
    this._parent.clear();

    const game = this.engine.game;
    const tiles = game.tileset?.active_tiles_list ?? [];
    const heatTiles = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (isHeatConducting(t)) heatTiles.push(t);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      this._parent.set(tile, tile);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const neighbors = tile.containmentNeighborTiles ?? [];
      for (let j = 0; j < neighbors.length; j++) {
        const n = neighbors[j];
        if (isHeatConducting(n)) this._union(tile, n);
      }
    }

    const rootToTiles = new Map();
    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const root = this._find(tile);
      let arr = rootToTiles.get(root);
      if (!arr) {
        arr = [];
        rootToTiles.set(root, arr);
      }
      arr.push(tile);
    }

    for (const [, components] of rootToTiles) {
      let totalHeat = 0;
      let totalContainment = 0;
      const vents = [];
      const outlets = [];
      const inlets = [];
      for (let i = 0; i < components.length; i++) {
        const t = components[i];
        const part = t.part;
        const cap = part?.containment ?? 0;
        const heat = t.heat_contained ?? 0;
        totalHeat += heat;
        totalContainment += cap;
        if (part?.category === 'vent') vents.push(t);
        else if (part?.category === 'heat_outlet') outlets.push(t);
        else if (part?.category === 'heat_inlet') inlets.push(t);
      }
      const fullnessRatio = totalContainment > 0 ? totalHeat / totalContainment : 0;
      const segment = {
        components,
        vents,
        outlets,
        inlets,
        fullnessRatio,
        totalHeat,
        totalContainment
      };
      this.segments.set(this.segments.size, segment);
      for (let i = 0; i < components.length; i++) {
        this.tileSegmentMap.set(components[i], segment);
      }
    }
  }

  getSegmentForTile(tile) {
    if (!tile) return null;
    if (this._segmentsDirty) this.updateSegments();
    return this.tileSegmentMap.get(tile) ?? null;
  }
}