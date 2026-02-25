import {
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_ORIENTATION, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6, OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS,
  MAX_NEIGHBORS
} from "../core/heatPayloadSchema.js";
import {
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
} from "../core/constants.js";
import { getIndex, isInBounds } from "../core/logic/gridUtils.js";
import { getNeighborKeys } from "../core/logic/gridUtils.js";
const MAX_INLETS = HEAT_PAYLOAD_MAX_INLETS;
const MAX_VALVES = HEAT_PAYLOAD_MAX_VALVES;
const MAX_VALVE_NEIGHBORS = HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS;
const MAX_EXCHANGERS = HEAT_PAYLOAD_MAX_EXCHANGERS;
const MAX_OUTLETS = HEAT_PAYLOAD_MAX_OUTLETS;
const OVERFLOW_VALVE_RATIO_MIN = VALVE_OVERFLOW_THRESHOLD;
const TOPUP_VALVE_RATIO_MAX = VALVE_TOPUP_THRESHOLD;

function getValveOrientation(id) {
  const match = String(id).match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function buildCellLookup(partLayout, stride) {
  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    cellByKey.set(`${t.r},${t.c}`, { ...t, layoutIndex: i });
  }
  const partAt = (r, c) => cellByKey.get(`${r},${c}`);
  const gidx = (r, c) => getIndex(r, c, stride);
  return { partAt, gidx };
}

function getValveTypeId(part) {
  if (part.type === "overflow_valve") return 1;
  if (part.type === "topup_valve") return 2;
  return 3;
}

function getExchangerNeighborCategory(nPart) {
  if (nPart.category === "vent" || nPart.category === "coolant_cell") return 2;
  if (nPart.category === "heat_exchanger") return 0;
  return 1;
}

function fillInletsBuffer(ctx) {
  const { partLayout, partTable, rows, cols, partAt, gidx } = ctx;
  const buf = new Float32Array(MAX_INLETS * INLET_STRIDE);
  let nInlets = 0;
  for (let i = 0; i < partLayout.length && nInlets < MAX_INLETS; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || part.category !== "heat_inlet") continue;
    const neighbors = getNeighborKeys(t.r, t.c);
    let nCount = 0;
    for (let k = 0; k < neighbors.length && nCount < MAX_NEIGHBORS; k++) {
      const [nr, nc] = neighbors[k];
      if (isInBounds(nr, nc, rows, cols) && partAt(nr, nc)) {
        buf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = gidx(nr, nc);
        nCount++;
      }
    }
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = gidx(t.r, t.c);
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = t.transferRate ?? 0;
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
    nInlets++;
  }
  return { buf, nInlets };
}

function collectValveNeighborIndices(valveEntries, ctx) {
  const { partTable, rows, cols, partAt, gidx } = ctx;
  const valveNeighborSet = new Set();
  for (let v = 0; v < valveEntries.length; v++) {
    const t = valveEntries[v];
    const neighbors = getNeighborKeys(t.r, t.c);
    for (let k = 0; k < neighbors.length; k++) {
      const [nr, nc] = neighbors[k];
      if (!isInBounds(nr, nc, rows, cols) || !partAt(nr, nc)) continue;
      const p = partTable[partAt(nr, nc).partIndex];
      if (p && p.category !== "valve") valveNeighborSet.add(gidx(nr, nc));
    }
  }
  const valveNbrBuf = new Float32Array(MAX_VALVE_NEIGHBORS);
  let nValveNeighbors = 0;
  valveNeighborSet.forEach((idx) => {
    if (nValveNeighbors < MAX_VALVE_NEIGHBORS) valveNbrBuf[nValveNeighbors++] = idx;
  });
  return { valveNbrBuf, nValveNeighbors };
}

function shouldSkipValve(part, inputNeighbor, outputNeighbor) {
  if (part.type === "overflow_valve") {
    const inputRatio = inputNeighbor.cap > 0 ? (inputNeighbor.heat / inputNeighbor.cap) : 0;
    return inputRatio < OVERFLOW_VALVE_RATIO_MIN;
  }
  if (part.type === "topup_valve") {
    const outputRatio = outputNeighbor.cap > 0 ? (outputNeighbor.heat / outputNeighbor.cap) : 0;
    return outputRatio > TOPUP_VALVE_RATIO_MAX;
  }
  return false;
}

function getInputOutputNeighbors(neighbors, orientation) {
  const sorted = [...neighbors].sort((a, b) => (orientation === 1 || orientation === 3) ? a.c - b.c : a.r - b.r);
  const inputNeighbor = orientation === 3 || orientation === 4 ? sorted[sorted.length - 1] : sorted[0];
  const outputNeighbor = orientation === 3 || orientation === 4 ? sorted[0] : sorted[sorted.length - 1];
  return { inputNeighbor, outputNeighbor };
}

function buildValveNeighbors(t, ctx) {
  const { partTable, rows, cols, heat, partAt, gidx } = ctx;
  return getNeighborKeys(t.r, t.c)
    .filter(([nr, nc]) => isInBounds(nr, nc, rows, cols) && partAt(nr, nc))
    .map(([nr, nc]) => ({ r: nr, c: nc, idx: gidx(nr, nc), heat: heat[gidx(nr, nc)] || 0, cap: partTable[partAt(nr, nc).partIndex]?.containment || 0 }));
}

function writeValveEntry(buf, base, gidx, t, part, orientation, inputNeighbor, outputNeighbor) {
  buf[base + VALVE_OFFSET_INDEX] = gidx(t.r, t.c);
  buf[base + VALVE_OFFSET_TYPE] = getValveTypeId(part);
  buf[base + VALVE_OFFSET_ORIENTATION] = orientation;
  buf[base + VALVE_OFFSET_RATE] = t.transferRate ?? 0;
  buf[base + VALVE_OFFSET_INPUT_IDX] = inputNeighbor.idx;
  buf[base + VALVE_OFFSET_OUTPUT_IDX] = outputNeighbor.idx;
}

function fillValvesBuffer(valveEntries, ctx) {
  const { partTable, partAt, gidx } = ctx;
  const buf = new Float32Array(MAX_VALVES * VALVE_STRIDE);
  let nValves = 0;
  for (let v = 0; v < valveEntries.length && nValves < MAX_VALVES; v++) {
    const t = valveEntries[v];
    const part = partTable[t.partIndex];
    if (!part) continue;
    const neighbors = buildValveNeighbors(t, ctx);
    if (neighbors.length < 2) continue;
    const orientation = getValveOrientation(part.id);
    const { inputNeighbor, outputNeighbor } = getInputOutputNeighbors(neighbors, orientation);
    if (shouldSkipValve(part, inputNeighbor, outputNeighbor)) continue;
    const base = nValves * VALVE_STRIDE;
    writeValveEntry(buf, base, gidx, t, part, orientation, inputNeighbor, outputNeighbor);
    nValves++;
  }
  return { buf, nValves };
}

function isExchangerPart(p) {
  return p && (p.category === "heat_exchanger" || p.category === "valve" || (p.category === "reactor_plating" && (p.transfer || 0) > 0));
}

function fillExchangersBuffer(exchangerEntries, ctx) {
  const { partTable, rows, cols, partAt, gidx } = ctx;
  const buf = new Float32Array(MAX_EXCHANGERS * EXCHANGER_STRIDE);
  let nExchangers = 0;
  for (let i = 0; i < exchangerEntries.length && nExchangers < MAX_EXCHANGERS; i++) {
    const t = exchangerEntries[i];
    const part = partTable[t.partIndex];
    if (!part || part.category === "valve") continue;
    const neighbors = getNeighborKeys(t.r, t.c).filter(([nr, nc]) => isInBounds(nr, nc, rows, cols) && partAt(nr, nc));
    let nCount = 0;
    for (let n = 0; n < neighbors.length && nCount < MAX_NEIGHBORS; n++) {
      const [nr, nc] = neighbors[n];
      const nPart = partTable[partAt(nr, nc).partIndex];
      if (!nPart) continue;
      const base = nExchangers * EXCHANGER_STRIDE;
      buf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = gidx(nr, nc);
      buf[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + nCount] = nPart.containment || 0;
      buf[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + nCount] = getExchangerNeighborCategory(nPart);
      nCount++;
    }
    const base = nExchangers * EXCHANGER_STRIDE;
    buf[base + EXCHANGER_OFFSET_INDEX] = gidx(t.r, t.c);
    buf[base + EXCHANGER_OFFSET_RATE] = t.transferRate ?? 0;
    buf[base + EXCHANGER_OFFSET_CONTAINMENT] = part.containment || 1;
    buf[base + EXCHANGER_OFFSET_N_COUNT] = nCount;
    nExchangers++;
  }
  return { buf, nExchangers };
}

function collectOutletNeighbors(t, ctx) {
  const { partTable, rows, cols, partAt } = ctx;
  return getNeighborKeys(t.r, t.c).filter(([nr, nc]) => {
    if (!isInBounds(nr, nc, rows, cols)) return false;
    const np = partAt(nr, nc);
    return np && partTable[np.partIndex]?.category !== "valve";
  });
}

function writeOutletEntry(buf, base, ctx, t, part, neighbors) {
  const { partAt, gidx } = ctx;
  buf[base + OUTLET_OFFSET_INDEX] = gidx(t.r, t.c);
  buf[base + OUTLET_OFFSET_RATE] = t.transferRate ?? 0;
  buf[base + OUTLET_OFFSET_ACTIVATED] = t.activated ? 1 : 0;
  buf[base + OUTLET_OFFSET_IS_OUTLET6] = part.id === "heat_outlet6" ? 1 : 0;
  buf[base + OUTLET_OFFSET_N_COUNT] = neighbors.length;
  for (let j = 0; j < neighbors.length && j < MAX_NEIGHBORS; j++) {
    const [nr, nc] = neighbors[j];
    const nPart = ctx.partTable[partAt(nr, nc).partIndex];
    buf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = gidx(nr, nc);
    buf[base + OUTLET_OFFSET_NEIGHBOR_CAPS + j] = nPart?.containment || 0;
  }
}

function fillOutletsBuffer(outletEntries, ctx) {
  const { partTable, gidx } = ctx;
  const buf = new Float32Array(MAX_OUTLETS * OUTLET_STRIDE);
  let nOutlets = 0;
  for (let i = 0; i < outletEntries.length && nOutlets < MAX_OUTLETS; i++) {
    const t = outletEntries[i];
    const part = partTable[t.partIndex];
    if (!part) continue;
    const neighbors = collectOutletNeighbors(t, ctx);
    const base = nOutlets * OUTLET_STRIDE;
    writeOutletEntry(buf, base, ctx, t, part, neighbors);
    nOutlets++;
  }
  return { buf, nOutlets };
}

export function buildHeatPayloadFromLayout(layoutContext) {
  const { partLayout, partTable, rows, cols, heat, containment } = layoutContext;
  const stride = layoutContext.maxCols ?? cols;
  const { partAt, gidx } = buildCellLookup(partLayout, stride);
  const ctx = { partLayout, partTable, rows, cols, heat, containment, partAt, gidx };

  const { buf: inletsBuf, nInlets } = fillInletsBuffer(ctx);

  const valveEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "valve");
  const { valveNbrBuf, nValveNeighbors } = collectValveNeighborIndices(valveEntries, ctx);
  const { buf: valvesBuf, nValves } = fillValvesBuffer(valveEntries, ctx);

  const exchangerEntries = partLayout.filter((t) => isExchangerPart(partTable[t.partIndex]));
  const { buf: exchBuf, nExchangers } = fillExchangersBuffer(exchangerEntries, ctx);

  const outletEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "heat_outlet");
  const { buf: outBuf, nOutlets } = fillOutletsBuffer(outletEntries, ctx);

  return {
    inletsData: inletsBuf,
    nInlets,
    valvesData: valvesBuf,
    nValves,
    valveNeighborData: valveNbrBuf,
    nValveNeighbors,
    exchangersData: exchBuf,
    nExchangers,
    outletsData: outBuf,
    nOutlets
  };
}
