import {
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6,
  OUTLET_OFFSET_N_COUNT, OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS
} from "./heatPayloadSchema.js";

export const HEAT_EPSILON = 0.001;

export const VALVE_OVERFLOW = 1;
export const VALVE_TOPUP = 2;
export const VALVE_CHECK = 3;
export const CATEGORY_EXCHANGER = 0;
export const CATEGORY_OTHER = 1;
export const CATEGORY_VENT_COOLANT = 2;

export function runInlets(heat, reactorHeat, inlets, multiplier) {
  let heatFromInlets = 0;
  for (let i = 0; i < inlets.length; i++) {
    const inv = inlets[i];
    const effectiveTransfer = inv.transferRate * multiplier;
    const neighbors = inv.neighborIndices;
    for (let j = 0; j < neighbors.length; j++) {
      const idx = neighbors[j];
      const h = heat[idx] || 0;
      if (h <= 0) continue;
      const transfer = Math.min(effectiveTransfer, h);
      heat[idx] -= transfer;
      reactorHeat += transfer;
      heatFromInlets += transfer;
    }
  }
  return { reactorHeat, heatFromInlets };
}

export function runValves(heat, containment, valves, multiplier, recordTransfers) {
  for (let v = 0; v < valves.length; v++) {
    const val = valves[v];
    const inputIdx = val.inputIdx;
    const outputIdx = val.outputIdx;
    if (inputIdx < 0 || outputIdx < 0) continue;
    const inputHeat = heat[inputIdx] || 0;
    const outputCap = containment[outputIdx] || 1;
    const outputHeat = heat[outputIdx] || 0;
    const outputSpace = Math.max(0, outputCap - outputHeat);
    let maxTransfer = val.transferRate * multiplier;
    if (val.type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * 0.2);
    const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
    if (transfer > 0) {
      heat[inputIdx] -= transfer;
      heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
      if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
    }
    heat[val.index] = 0;
  }
}

export function runExchangers(heat, containment, exchangers, valveNeighborIndices, multiplier, recordTransfers) {
  const startHeat = new Map();
  const valveSet = new Set(valveNeighborIndices);
  for (let e = 0; e < exchangers.length; e++) {
    const idx = exchangers[e].index;
    startHeat.set(idx, heat[idx] || 0);
  }
  const planned = [];
  for (let e = 0; e < exchangers.length; e++) {
    const ex = exchangers[e];
    const idx = ex.index;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) || 0);
    const transferVal = ex.transferRate * multiplier;
    const neighbors = ex.neighborIndices;
    const caps = ex.neighborContainments;
    const cats = ex.neighborCategories;
    let totalHeadroom = 0;
    for (let n = 0; n < neighbors.length; n++) {
      const nidx = neighbors[n];
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      totalHeadroom += Math.max((caps[n] || 0) - nStart, 0);
    }
    if (totalHeadroom === 0) totalHeadroom = 1;
    let remainingPush = heatStart;
    for (let n = 0; n < neighbors.length; n++) {
      const nidx = neighbors[n];
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const cap = caps[n] || 0;
      if (remainingPush <= 0) break;
      const diff = Math.max(0, heatStart - nStart) || 1;
      const headroom = Math.max(cap - nStart, 0);
      const bias = Math.max(headroom / totalHeadroom, 0);
      let amt = Math.min(Math.max(1, Math.floor(transferVal * bias)), Math.ceil(diff / 2), remainingPush);
      if (amt > 0 && (heatStart > nStart || (cats[n] === CATEGORY_VENT_COOLANT && heatStart === nStart && heatStart > 0))) {
        planned.push({ from: idx, to: nidx, amount: amt });
        remainingPush -= amt;
      }
    }
  }
  const plannedOutByNeighbor = new Map();
  for (let e = 0; e < exchangers.length; e++) {
    const ex = exchangers[e];
    const idx = ex.index;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) || 0);
    const transferVal = ex.transferRate * multiplier;
    const neighbors = ex.neighborIndices;
    for (let n = 0; n < neighbors.length; n++) {
      const nidx = neighbors[n];
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const alreadyOut = plannedOutByNeighbor.get(nidx) || 0;
      const nAvailable = Math.max(0, nStart - alreadyOut);
      if (nAvailable <= 0 || nStart <= heatStart) continue;
      const diff = nStart - heatStart;
      const amt = Math.min(transferVal, Math.ceil(diff / 2), nAvailable);
      if (amt > 0) {
        planned.push({ from: nidx, to: idx, amount: amt });
        plannedOutByNeighbor.set(nidx, alreadyOut + amt);
      }
    }
  }
  for (let p = 0; p < planned.length; p++) {
    const t = planned[p];
    heat[t.from] = (heat[t.from] || 0) - t.amount;
    heat[t.to] = (heat[t.to] || 0) + t.amount;
    if (recordTransfers) recordTransfers.push({ fromIdx: t.from, toIdx: t.to, amount: t.amount });
  }
}

export function runOutlets(heat, containment, outlets, reactorHeat, multiplier) {
  for (let o = 0; o < outlets.length; o++) {
    const out = outlets[o];
    if (!out.activated || reactorHeat <= 0) continue;
    const neighbors = out.neighborIndices;
    const caps = out.neighborContainments;
    const transferCap = out.transferRate * multiplier;
    let toTransfer = Math.min(transferCap, reactorHeat);
    if (toTransfer <= 0) continue;
    if (neighbors.length > 0) {
      const perNeighbor = toTransfer / neighbors.length;
      for (let n = 0; n < neighbors.length; n++) {
        const nidx = neighbors[n];
        const cap = caps[n] || 0;
        const current = heat[nidx] || 0;
        let add = perNeighbor;
        if (out.isOutlet6 && cap > 0) add = Math.min(add, Math.max(0, cap - current));
        add = Math.min(add, reactorHeat);
        if (add > 0) {
          heat[nidx] = current + add;
          reactorHeat -= add;
        }
      }
    } else {
      heat[out.index] = (heat[out.index] || 0) + toTransfer;
      reactorHeat -= toTransfer;
    }
  }
  return reactorHeat;
}

export function runHeatStep(heat, containment, payload) {
  let reactorHeat = payload.reactorHeat || 0;
  const multiplier = payload.multiplier ?? 1;
  const inlets = payload.inlets || [];
  const valves = payload.valves || [];
  const exchangers = payload.exchangers || [];
  const outlets = payload.outlets || [];
  const valveNeighborIndices = payload.valveNeighborIndices || [];
  const recordTransfers = payload.recordTransfers || null;
  const { reactorHeat: r1, heatFromInlets } = runInlets(heat, reactorHeat, inlets, multiplier);
  reactorHeat = r1;
  runValves(heat, containment, valves, multiplier, recordTransfers);
  runExchangers(heat, containment, exchangers, valveNeighborIndices, multiplier, recordTransfers);
  reactorHeat = runOutlets(heat, containment, outlets, reactorHeat, multiplier);
  return { reactorHeat, heatFromInlets };
}

function runInletsFromTyped(heat, reactorHeat, inletsData, nInlets, multiplier) {
  let heatFromInlets = 0;
  for (let i = 0; i < nInlets; i++) {
    const base = i * INLET_STRIDE;
    const effectiveTransfer = inletsData[base + INLET_OFFSET_RATE] * multiplier;
    const nCount = (inletsData[base + INLET_OFFSET_N_COUNT] | 0) || 0;
    for (let j = 0; j < nCount; j++) {
      const idx = inletsData[base + INLET_OFFSET_NEIGHBORS + j] | 0;
      const h = heat[idx] || 0;
      if (h <= 0) continue;
      const transfer = Math.min(effectiveTransfer, h);
      heat[idx] -= transfer;
      reactorHeat += transfer;
      heatFromInlets += transfer;
    }
  }
  return { reactorHeat, heatFromInlets };
}

function runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers) {
  const heatLen = heat.length;
  const snap = new Float32Array(heatLen);
  for (let i = 0; i < heatLen; i++) snap[i] = heat[i] || 0;
  const planned = [];
  for (let v = 0; v < nValves; v++) {
    const base = v * VALVE_STRIDE;
    const inputIdx = valvesData[base + VALVE_OFFSET_INPUT_IDX] | 0;
    const outputIdx = valvesData[base + VALVE_OFFSET_OUTPUT_IDX] | 0;
    const valIndex = valvesData[base + VALVE_OFFSET_INDEX] | 0;
    if (inputIdx < 0 || outputIdx < 0 || inputIdx >= heatLen || outputIdx >= heatLen || valIndex >= heatLen) continue;
    const inputHeat = snap[inputIdx] || 0;
    const outputCap = containment[outputIdx] || 1;
    const outputHeat = snap[outputIdx] || 0;
    const outputSpace = Math.max(0, outputCap - outputHeat);
    let maxTransfer = valvesData[base + VALVE_OFFSET_RATE] * multiplier;
    const type = valvesData[base + VALVE_OFFSET_TYPE] | 0;
    if (type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * 0.2);
    const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
    if (transfer > 0) {
      planned.push({ inputIdx, outputIdx, transfer });
      snap[inputIdx] -= transfer;
      snap[outputIdx] = (snap[outputIdx] || 0) + transfer;
    }
  }
  for (let p = 0; p < planned.length; p++) {
    const { inputIdx, outputIdx, transfer } = planned[p];
    heat[inputIdx] = (heat[inputIdx] || 0) - transfer;
    heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
    if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
  }
  for (let v = 0; v < nValves; v++) {
    const valIndex = valvesData[v * VALVE_STRIDE + VALVE_OFFSET_INDEX] | 0;
    if (valIndex >= 0 && valIndex < heatLen) heat[valIndex] = 0;
  }
}

function runExchangersFromTyped(heat, containment, exchangersData, nExchangers, valveNeighborData, nValveNeighbors, multiplier, recordTransfers) {
  const valveSet = new Set();
  for (let i = 0; i < nValveNeighbors; i++) valveSet.add(valveNeighborData[i] | 0);
  const startHeat = new Map();
  for (let e = 0; e < nExchangers; e++) {
    const idx = exchangersData[e * EXCHANGER_STRIDE + EXCHANGER_OFFSET_INDEX] | 0;
    startHeat.set(idx, heat[idx] || 0);
  }
  const planned = [];
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + EXCHANGER_OFFSET_INDEX] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) || 0);
    const transferVal = exchangersData[base + EXCHANGER_OFFSET_RATE] * multiplier;
    const nCount = (exchangersData[base + EXCHANGER_OFFSET_N_COUNT] | 0) || 0;
    let totalHeadroom = 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const cap = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + n] || 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      totalHeadroom += Math.max(cap - nStart, 0);
    }
    if (totalHeadroom === 0) totalHeadroom = 1;
    let remainingPush = heatStart;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const cap = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + n] || 0;
      const cat = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + n] | 0;
      if (remainingPush <= 0) break;
      const diff = Math.max(0, heatStart - nStart) || 1;
      const headroom = Math.max(cap - nStart, 0);
      const bias = Math.max(headroom / totalHeadroom, 0);
      let amt = Math.min(Math.max(1, Math.floor(transferVal * bias)), Math.ceil(diff / 2), remainingPush);
      if (amt > 0 && (heatStart > nStart || (cat === CATEGORY_VENT_COOLANT && heatStart === nStart && heatStart > 0))) {
        planned.push({ from: idx, to: nidx, amount: amt });
        remainingPush -= amt;
      }
    }
  }
  const plannedOutByNeighbor = new Map();
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + EXCHANGER_OFFSET_INDEX] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) || 0);
    const transferVal = exchangersData[base + EXCHANGER_OFFSET_RATE] * multiplier;
    const nCount = (exchangersData[base + EXCHANGER_OFFSET_N_COUNT] | 0) || 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const alreadyOut = plannedOutByNeighbor.get(nidx) || 0;
      const nAvailable = Math.max(0, nStart - alreadyOut);
      if (nAvailable <= 0 || nStart <= heatStart) continue;
      const diff = nStart - heatStart;
      const amt = Math.min(transferVal, Math.ceil(diff / 2), nAvailable);
      if (amt > 0) {
        planned.push({ from: nidx, to: idx, amount: amt });
        plannedOutByNeighbor.set(nidx, alreadyOut + amt);
      }
    }
  }
  for (let p = 0; p < planned.length; p++) {
    const t = planned[p];
    heat[t.from] = (heat[t.from] || 0) - t.amount;
    heat[t.to] = (heat[t.to] || 0) + t.amount;
    if (recordTransfers) recordTransfers.push({ fromIdx: t.from, toIdx: t.to, amount: t.amount });
  }
}

function runOutletsFromTyped(heat, outletsData, nOutlets, reactorHeat, multiplier) {
  for (let o = 0; o < nOutlets; o++) {
    if (reactorHeat <= 0) break;
    const base = o * OUTLET_STRIDE;
    const activated = outletsData[base + OUTLET_OFFSET_ACTIVATED];
    if (!activated) continue;
    const nCount = (outletsData[base + OUTLET_OFFSET_N_COUNT] | 0) || 0;
    const transferCap = outletsData[base + OUTLET_OFFSET_RATE] * multiplier;
    let toTransfer = Math.min(transferCap, reactorHeat);
    if (toTransfer <= 0) continue;
    const outIndex = outletsData[base + OUTLET_OFFSET_INDEX] | 0;
    const isOutlet6 = outletsData[base + OUTLET_OFFSET_IS_OUTLET6];
    if (nCount > 0) {
      const perNeighbor = toTransfer / nCount;
      for (let n = 0; n < nCount; n++) {
        const nidx = outletsData[base + OUTLET_OFFSET_NEIGHBOR_INDICES + n] | 0;
        const cap = outletsData[base + OUTLET_OFFSET_NEIGHBOR_CAPS + n] || 0;
        const current = heat[nidx] || 0;
        let add = perNeighbor;
        if (isOutlet6 && cap > 0) add = Math.min(add, Math.max(0, cap - current));
        add = Math.min(add, reactorHeat);
        if (add > 0) {
          heat[nidx] = current + add;
          reactorHeat -= add;
        }
      }
    } else {
      heat[outIndex] = (heat[outIndex] || 0) + toTransfer;
      reactorHeat -= toTransfer;
    }
  }
  return reactorHeat;
}

export function runHeatStepFromTyped(heat, containment, payload, recordTransfers) {
  let reactorHeat = payload.reactorHeat || 0;
  const multiplier = payload.multiplier ?? 1;
  const inletsData = payload.inletsData;
  const nInlets = (payload.nInlets | 0) || 0;
  const valvesData = payload.valvesData;
  const nValves = (payload.nValves | 0) || 0;
  const valveNeighborData = payload.valveNeighborData;
  const nValveNeighbors = (payload.nValveNeighbors | 0) || 0;
  const exchangersData = payload.exchangersData;
  const nExchangers = (payload.nExchangers | 0) || 0;
  const outletsData = payload.outletsData;
  const nOutlets = (payload.nOutlets | 0) || 0;
  const r1 = runInletsFromTyped(heat, reactorHeat, inletsData, nInlets, multiplier);
  reactorHeat = r1.reactorHeat;
  runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers);
  runExchangersFromTyped(heat, containment, exchangersData, nExchangers, valveNeighborData, nValveNeighbors, multiplier, recordTransfers);
  reactorHeat = runOutletsFromTyped(heat, outletsData, nOutlets, reactorHeat, multiplier);
  for (let i = 0; i < heat.length; i++) {
    if (heat[i] < HEAT_EPSILON) heat[i] = 0;
  }
  if (reactorHeat < HEAT_EPSILON) reactorHeat = 0;
  return { reactorHeat, heatFromInlets: r1.heatFromInlets };
}
