import {
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_ORIENTATION, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6, OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS,
  MAX_NEIGHBORS
} from "../core/heatPayloadSchema.js";

const MAX_INLETS = 32;
const MAX_VALVES = 32;
const MAX_VALVE_NEIGHBORS = 256;
const MAX_EXCHANGERS = 64;
const MAX_OUTLETS = 32;

function gridIndex(r, c, maxCols) {
  return r * maxCols + c;
}

function getValveOrientation(id) {
  const match = String(id).match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 1;
}

function getNeighborKeys(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}

export function buildHeatPayloadFromLayout(partLayout, partTable, rows, cols, heat, containment, maxCols) {
  const stride = maxCols ?? cols;
  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const key = `${t.r},${t.c}`;
    cellByKey.set(key, { ...t, layoutIndex: i });
  }
  const partAt = (r, c) => cellByKey.get(`${r},${c}`);
  const gidx = (r, c) => gridIndex(r, c, stride);

  const inletsBuf = new Float32Array(MAX_INLETS * INLET_STRIDE);
  const valvesBuf = new Float32Array(MAX_VALVES * VALVE_STRIDE);
  const valveNbrBuf = new Float32Array(MAX_VALVE_NEIGHBORS);
  const exchBuf = new Float32Array(MAX_EXCHANGERS * EXCHANGER_STRIDE);
  const outBuf = new Float32Array(MAX_OUTLETS * OUTLET_STRIDE);

  let nInlets = 0;
  for (let i = 0; i < partLayout.length && nInlets < MAX_INLETS; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || part.category !== "heat_inlet") continue;
    const neighbors = getNeighborKeys(t.r, t.c);
    let nCount = 0;
    for (let k = 0; k < neighbors.length && nCount < MAX_NEIGHBORS; k++) {
      const [nr, nc] = neighbors[k];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && partAt(nr, nc)) {
        inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = gidx(nr, nc);
        nCount++;
      }
    }
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = gidx(t.r, t.c);
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = t.transferRate ?? 0;
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
    nInlets++;
  }

  const valveNeighborSet = new Set();
  const valveEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "valve");
  for (let v = 0; v < valveEntries.length; v++) {
    const t = valveEntries[v];
    const neighbors = getNeighborKeys(t.r, t.c);
    for (let k = 0; k < neighbors.length; k++) {
      const [nr, nc] = neighbors[k];
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && partAt(nr, nc)) {
        const p = partTable[partAt(nr, nc).partIndex];
        if (p && p.category !== "valve") valveNeighborSet.add(gidx(nr, nc));
      }
    }
  }
  let nValveNeighbors = 0;
  valveNeighborSet.forEach((idx) => {
    if (nValveNeighbors < MAX_VALVE_NEIGHBORS) valveNbrBuf[nValveNeighbors++] = idx;
  });

  let nValves = 0;
  for (let v = 0; v < valveEntries.length && nValves < MAX_VALVES; v++) {
    const t = valveEntries[v];
    const part = partTable[t.partIndex];
    if (!part) continue;
    const neighbors = getNeighborKeys(t.r, t.c)
      .filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && partAt(nr, nc))
      .map(([nr, nc]) => ({ r: nr, c: nc, idx: gidx(nr, nc), heat: heat[gidx(nr, nc)] || 0, cap: partTable[partAt(nr, nc).partIndex]?.containment || 0 }));
    if (neighbors.length < 2) continue;
    const orientation = getValveOrientation(part.id);
    const sorted = [...neighbors].sort((a, b) => (orientation === 1 || orientation === 3) ? a.c - b.c : a.r - b.r);
    const inputNeighbor = orientation === 3 || orientation === 4 ? sorted[sorted.length - 1] : sorted[0];
    const outputNeighbor = orientation === 3 || orientation === 4 ? sorted[0] : sorted[sorted.length - 1];
    if (part.type === "overflow_valve") {
      const inputRatio = inputNeighbor.cap > 0 ? (inputNeighbor.heat / inputNeighbor.cap) : 0;
      if (inputRatio < 0.8) continue;
    } else if (part.type === "topup_valve") {
      const outputRatio = outputNeighbor.cap > 0 ? (outputNeighbor.heat / outputNeighbor.cap) : 0;
      if (outputRatio > 0.2) continue;
    }
    const typeId = part.type === "overflow_valve" ? 1 : part.type === "topup_valve" ? 2 : 3;
    const base = nValves * VALVE_STRIDE;
    valvesBuf[base + VALVE_OFFSET_INDEX] = gidx(t.r, t.c);
    valvesBuf[base + VALVE_OFFSET_TYPE] = typeId;
    valvesBuf[base + VALVE_OFFSET_ORIENTATION] = orientation;
    valvesBuf[base + VALVE_OFFSET_RATE] = t.transferRate ?? 0;
    valvesBuf[base + VALVE_OFFSET_INPUT_IDX] = inputNeighbor.idx;
    valvesBuf[base + VALVE_OFFSET_OUTPUT_IDX] = outputNeighbor.idx;
    nValves++;
  }

  const exchangerEntries = partLayout.filter((t) => {
    const p = partTable[t.partIndex];
    return p && (p.category === "heat_exchanger" || p.category === "valve" || (p.category === "reactor_plating" && (p.transfer || 0) > 0));
  });
  let nExchangers = 0;
  for (let i = 0; i < exchangerEntries.length && nExchangers < MAX_EXCHANGERS; i++) {
    const t = exchangerEntries[i];
    const part = partTable[t.partIndex];
    if (!part || part.category === "valve") continue;
    const neighbors = getNeighborKeys(t.r, t.c).filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && partAt(nr, nc));
    let nCount = 0;
    for (let n = 0; n < neighbors.length && nCount < MAX_NEIGHBORS; n++) {
      const [nr, nc] = neighbors[n];
      const nPart = partTable[partAt(nr, nc).partIndex];
      if (!nPart) continue;
      const base = nExchangers * EXCHANGER_STRIDE;
      exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = gidx(nr, nc);
      exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + nCount] = nPart.containment || 0;
      exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + nCount] = (nPart.category === "vent" || nPart.category === "coolant_cell") ? 2 : (nPart.category === "heat_exchanger" ? 0 : 1);
      nCount++;
    }
    const base = nExchangers * EXCHANGER_STRIDE;
    exchBuf[base + EXCHANGER_OFFSET_INDEX] = gidx(t.r, t.c);
    exchBuf[base + EXCHANGER_OFFSET_RATE] = t.transferRate ?? 0;
    exchBuf[base + EXCHANGER_OFFSET_CONTAINMENT] = part.containment || 1;
    exchBuf[base + EXCHANGER_OFFSET_N_COUNT] = nCount;
    nExchangers++;
  }

  const outletEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "heat_outlet");
  let nOutlets = 0;
  for (let i = 0; i < outletEntries.length && nOutlets < MAX_OUTLETS; i++) {
    const t = outletEntries[i];
    const part = partTable[t.partIndex];
    if (!part) continue;
    const neighbors = getNeighborKeys(t.r, t.c).filter(([nr, nc]) => {
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return false;
      const np = partAt(nr, nc);
      return np && partTable[np.partIndex]?.category !== "valve";
    });
    const base = nOutlets * OUTLET_STRIDE;
    outBuf[base + OUTLET_OFFSET_INDEX] = gidx(t.r, t.c);
    outBuf[base + OUTLET_OFFSET_RATE] = t.transferRate ?? 0;
    outBuf[base + OUTLET_OFFSET_ACTIVATED] = t.activated ? 1 : 0;
    outBuf[base + OUTLET_OFFSET_IS_OUTLET6] = part.id === "heat_outlet6" ? 1 : 0;
    outBuf[base + OUTLET_OFFSET_N_COUNT] = neighbors.length;
    for (let j = 0; j < neighbors.length && j < MAX_NEIGHBORS; j++) {
      const [nr, nc] = neighbors[j];
      const nPart = partTable[partAt(nr, nc).partIndex];
      outBuf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = gidx(nr, nc);
      outBuf[base + OUTLET_OFFSET_NEIGHBOR_CAPS + j] = nPart?.containment || 0;
    }
    nOutlets++;
  }

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
