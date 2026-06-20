import {
  HEAT_EPSILON,
  HEAT_TRANSFER_DIFF_DIVISOR,
  EXCHANGER_MIN_TRANSFER_UNIT,
  HEAT_TRANSFER_MAX_ITERATIONS,
} from "./utils.js";

export const VALVE_TOPUP_CAP_RATIO = 0.2;

export const MAX_NEIGHBORS = 8;
export const INLET_STRIDE = 3 + MAX_NEIGHBORS;
export const VALVE_STRIDE = 6;
export const EXCHANGER_STRIDE = 4 + MAX_NEIGHBORS * 3;
export const OUTLET_STRIDE = 5 + MAX_NEIGHBORS * 2;
export const INLET_OFFSET_INDEX = 0;
export const INLET_OFFSET_RATE = 1;
export const INLET_OFFSET_N_COUNT = 2;
export const INLET_OFFSET_NEIGHBORS = 3;
export const VALVE_OFFSET_INDEX = 0;
export const VALVE_OFFSET_TYPE = 1;
export const VALVE_OFFSET_ORIENTATION = 2;
export const VALVE_OFFSET_RATE = 3;
export const VALVE_OFFSET_INPUT_IDX = 4;
export const VALVE_OFFSET_OUTPUT_IDX = 5;
export const EXCHANGER_OFFSET_INDEX = 0;
export const EXCHANGER_OFFSET_RATE = 1;
export const EXCHANGER_OFFSET_CONTAINMENT = 2;
export const EXCHANGER_OFFSET_N_COUNT = 3;
export const EXCHANGER_OFFSET_NEIGHBOR_INDICES = 4;
export const EXCHANGER_OFFSET_NEIGHBOR_CAPS = 4 + MAX_NEIGHBORS;
export const EXCHANGER_OFFSET_NEIGHBOR_CATS = 4 + MAX_NEIGHBORS * 2;
export const OUTLET_OFFSET_INDEX = 0;
export const OUTLET_OFFSET_RATE = 1;
export const OUTLET_OFFSET_ACTIVATED = 2;
export const OUTLET_OFFSET_IS_OUTLET6 = 3;
export const OUTLET_OFFSET_N_COUNT = 4;
export const OUTLET_OFFSET_NEIGHBOR_INDICES = 5;
export const OUTLET_OFFSET_NEIGHBOR_CAPS = 5 + MAX_NEIGHBORS;

export const VALVE_OVERFLOW = 1;
export const VALVE_TOPUP = 2;
export const VALVE_CHECK = 3;
export const CATEGORY_EXCHANGER = 0;
export const CATEGORY_OTHER = 1;
export const CATEGORY_VENT_COOLANT = 2;

export function canPushToNeighbor(heatStart, nStart, cat) {
  return heatStart > nStart || (cat === CATEGORY_VENT_COOLANT && heatStart === nStart && heatStart > 0);
}

export function transferHeatBetweenNeighbors(heatStart, nStart, cap, cat, transferVal, totalHeadroom, remainingPush) {
  if (remainingPush <= 0 || !canPushToNeighbor(heatStart, nStart, cat)) return 0;
  const diff = Math.max(0, heatStart - nStart) || EXCHANGER_MIN_TRANSFER_UNIT;
  const headroom = Math.max(cap - nStart, 0);
  const bias = Math.max(headroom / totalHeadroom, 0);
  return Math.min(
    Math.max(EXCHANGER_MIN_TRANSFER_UNIT, Math.floor(transferVal * bias)),
    Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR),
    remainingPush
  );
}

export function applyValveRule(heat, containment, val, multiplier, recordTransfers) {
  const inputIdx = val.inputIdx;
  const outputIdx = val.outputIdx;
  if (inputIdx < 0 || outputIdx < 0) return;
  const inputHeat = heat[inputIdx] || 0;
  if (inputHeat <= 0) {
    heat[val.index] = 0;
    return;
  }
  const outputCap = containment[outputIdx] || 1;
  const outputHeat = heat[outputIdx] || 0;
  const outputSpace = Math.max(0, outputCap - outputHeat);
  if (outputSpace <= 0) {
    heat[val.index] = 0;
    return;
  }
  let maxTransfer = val.transferRate * multiplier;
  if (val.type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * VALVE_TOPUP_CAP_RATIO);
  const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
  if (transfer > 0) {
    heat[inputIdx] -= transfer;
    heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
    if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
  }
  heat[val.index] = 0;
}

function runInlets(heat, reactorHeat, inletsData, nInlets, multiplier) {
  let heatFromInlets = 0;
  for (let i = 0; i < nInlets; i++) {
    const base = i * INLET_STRIDE;
    const rate = inletsData[base + 1] * multiplier;
    for (let j = 0; j < (inletsData[base + 2] | 0); j++) {
      const idx = inletsData[base + 3 + j] | 0;
      const h = heat[idx] || 0;
      const transfer = Math.min(rate, h);
      heat[idx] -= transfer;
      reactorHeat += transfer;
      heatFromInlets += transfer;
    }
  }
  return { reactorHeat, heatFromInlets };
}

function resetValveHeatValues(valvesData, nValves, heat, heatLen) {
  for (let v = 0; v < nValves; v++) {
    const valIndex = valvesData[v * VALVE_STRIDE] | 0;
    if (valIndex >= 0 && valIndex < heatLen) heat[valIndex] = 0;
  }
}

let _valveSnapPool = null;
function getValveSnapBuffer(len) {
  if (!_valveSnapPool || _valveSnapPool.length !== len) {
    _valveSnapPool = new Float32Array(len);
  }
  return _valveSnapPool;
}

function runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers) {
  const heatLen = heat.length;
  const snap = getValveSnapBuffer(heatLen);
  for (let i = 0; i < heatLen; i++) snap[i] = heat[i] || 0;
  for (let v = 0; v < nValves; v++) {
    const base = v * VALVE_STRIDE;
    const inputIdx = valvesData[base + 4] | 0;
    const outputIdx = valvesData[base + 5] | 0;
    const valIndex = valvesData[base + 0] | 0;
    if (inputIdx < 0 || outputIdx < 0 || inputIdx >= heatLen || outputIdx >= heatLen || valIndex >= heatLen) continue;
    const inputHeat = snap[inputIdx] || 0;
    const outputCap = containment[outputIdx] || 1;
    const outputSpace = Math.max(0, outputCap - (snap[outputIdx] || 0));
    let maxTransfer = valvesData[base + 3] * multiplier;
    if ((valvesData[base + 1] | 0) === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * VALVE_TOPUP_CAP_RATIO);
    const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
    if (transfer > 0) {
      heat[inputIdx] = (heat[inputIdx] || 0) - transfer;
      heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
      if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
      snap[inputIdx] -= transfer;
      snap[outputIdx] = (snap[outputIdx] || 0) + transfer;
    }
  }
  resetValveHeatValues(valvesData, nValves, heat, heatLen);
}

let _valveFlagPool = null;
function getValveFlagBuffer(len) {
  if (!_valveFlagPool || _valveFlagPool.length !== len) {
    _valveFlagPool = new Uint8Array(len);
  }
  return _valveFlagPool;
}

function buildValveFlags(valveNeighborData, nValveNeighbors, heatLen) {
  const flags = getValveFlagBuffer(heatLen);
  flags.fill(0);
  for (let i = 0; i < nValveNeighbors; i++) {
    const idx = valveNeighborData[i] | 0;
    if (idx >= 0 && idx < heatLen) flags[idx] = 1;
  }
  return flags;
}

let _startHeatMapPool = null;
function getStartHeatMapBuffer(len) {
  if (!_startHeatMapPool || _startHeatMapPool.length !== len) {
    _startHeatMapPool = new Float32Array(len);
  }
  return _startHeatMapPool;
}

function buildExchangerStartHeatTyped(exchangersData, nExchangers, heat) {
  const startHeat = getStartHeatMapBuffer(heat.length);
  startHeat.fill(-1); 
  for (let e = 0; e < nExchangers; e++) {
    const idx = exchangersData[e * EXCHANGER_STRIDE] | 0;
    if (idx >= 0 && idx < startHeat.length) {
      startHeat[idx] = heat[idx] || 0;
    }
  }
  return startHeat;
}

function getExchangerStartHeat(idx, heat, valveFlags, startHeatMap) {
  if (valveFlags[idx]) return heat[idx] || 0;
  const sh = startHeatMap[idx];
  return sh >= 0 ? sh : (heat[idx] || 0);
}

function collectExchangerPushTyped(heat, exchangersData, nExchangers, valveFlags, startHeatMap, multiplier, recordTransfers) {
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + 0] | 0;
    const heatStart = getExchangerStartHeat(idx, heat, valveFlags, startHeatMap);
    const capStart = exchangersData[base + 2] || 1;
    const pressureStart = heatStart / capStart;
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    let remainingPush = heatStart;
    for (let n = 0; n < nCount; n++) {
      if (remainingPush <= 0) break;
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = getExchangerStartHeat(nidx, heat, valveFlags, startHeatMap);
      const cap = exchangersData[base + 4 + MAX_NEIGHBORS + n] || 0;
      const pressureNeighbor = nStart / (cap || 1);
      if (pressureStart <= pressureNeighbor) continue;
      const diff = heatStart - nStart;
      const amt = Math.min(transferVal, diff / HEAT_TRANSFER_DIFF_DIVISOR, remainingPush);
      if (amt > 0) {
        heat[idx] -= amt;
        heat[nidx] += amt;
        if (recordTransfers) recordTransfers.push({ fromIdx: idx, toIdx: nidx, amount: amt });
        remainingPush -= amt;
      }
    }
  }
}

let _plannedOutPool = null;
function getPlannedOutBuffer(len) {
  if (!_plannedOutPool || _plannedOutPool.length !== len) {
    _plannedOutPool = new Float32Array(len);
  }
  return _plannedOutPool;
}

function collectExchangerPullTyped(opts) {
  const { heat, exchangersData, nExchangers, valveFlags, startHeatMap, multiplier, recordTransfers } = opts;
  const plannedOutByNeighbor = getPlannedOutBuffer(heat.length);
  plannedOutByNeighbor.fill(0);
  
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + 0] | 0;
    const heatStart = getExchangerStartHeat(idx, heat, valveFlags, startHeatMap);
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = getExchangerStartHeat(nidx, heat, valveFlags, startHeatMap);
      const alreadyOut = plannedOutByNeighbor[nidx] || 0;
      const nAvailable = Math.max(0, nStart - alreadyOut);
      if (nAvailable <= 0 || nStart <= heatStart) continue;
      const diff = nStart - heatStart;
      const amt = Math.min(transferVal, Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR), nAvailable);
      if (amt > 0) {
        heat[nidx] -= amt;
        heat[idx] += amt;
        if (recordTransfers) recordTransfers.push({ fromIdx: nidx, toIdx: idx, amount: amt });
        plannedOutByNeighbor[nidx] = alreadyOut + amt;
      }
    }
  }
}

function runExchangersFromTyped(opts) {
  const { heat, containment, exchangersData, nExchangers, valveNeighborData, nValveNeighbors, multiplier, recordTransfers } = opts;
  const heatLen = heat.length;
  const valveFlags = buildValveFlags(valveNeighborData, nValveNeighbors, heatLen);
  const startHeatMap = buildExchangerStartHeatTyped(exchangersData, nExchangers, heat);
  collectExchangerPushTyped(heat, exchangersData, nExchangers, valveFlags, startHeatMap, multiplier, recordTransfers);
  collectExchangerPullTyped({ heat, exchangersData, nExchangers, valveFlags, startHeatMap, multiplier, recordTransfers });
}

function processSingleOutlet(heat, outlet, reactorHeat) {
  const { activated, nCount, transferCap, outIndex, isOutlet6, neighborIndices, neighborCaps } = outlet;
  if (!activated || reactorHeat <= 0) return reactorHeat;
  let toTransfer = Math.min(transferCap, reactorHeat);
  if (toTransfer <= 0) return reactorHeat;
  if (nCount > 0) {
    const perNeighbor = toTransfer / nCount;
    for (let n = 0; n < nCount; n++) {
      const nidx = neighborIndices[n] | 0;
      const cap = neighborCaps[n] || 0;
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
  return reactorHeat;
}

let _outletNeighborIndicesPool = new Int32Array(MAX_NEIGHBORS);
let _outletNeighborCapsPool = new Float32Array(MAX_NEIGHBORS);

function runOutletsFromTyped(heat, outletsData, nOutlets, reactorHeat, multiplier) {
  for (let o = 0; o < nOutlets; o++) {
    if (reactorHeat <= 0) break;
    const base = o * OUTLET_STRIDE;
    const activated = outletsData[base + OUTLET_OFFSET_ACTIVATED];
    if (!activated) continue;
    
    const nCount = (outletsData[base + OUTLET_OFFSET_N_COUNT] | 0) || 0;
    const transferCap = outletsData[base + OUTLET_OFFSET_RATE] * multiplier;
    const outIndex = outletsData[base + OUTLET_OFFSET_INDEX] | 0;
    const isOutlet6 = outletsData[base + OUTLET_OFFSET_IS_OUTLET6];
    
    for (let n = 0; n < nCount; n++) {
      _outletNeighborIndicesPool[n] = outletsData[base + OUTLET_OFFSET_NEIGHBOR_INDICES + n] | 0;
      _outletNeighborCapsPool[n] = outletsData[base + OUTLET_OFFSET_NEIGHBOR_CAPS + n] || 0;
    }
    
    const outletConfig = {
      activated,
      nCount,
      transferCap,
      outIndex,
      isOutlet6,
      neighborIndices: _outletNeighborIndicesPool,
      neighborCaps: _outletNeighborCapsPool,
    };
    reactorHeat = processSingleOutlet(heat, outletConfig, reactorHeat);
  }
  return reactorHeat;
}

let _heatTransferStagingPool = null;
function getHeatTransferStagingBuffer(len) {
  if (!_heatTransferStagingPool || _heatTransferStagingPool.length !== len) {
    _heatTransferStagingPool = new Float32Array(len);
  }
  return _heatTransferStagingPool;
}

function runHeatTransferCore(heat, containment, componentSet, options) {
  const heatLen = heat.length;
  const nextHeat = getHeatTransferStagingBuffer(heatLen);
  for (let i = 0; i < heatLen; i++) nextHeat[i] = heat[i] || 0;
  
  let reactorHeat = options.reactorHeat ?? 0;
  const multiplier = options.multiplier ?? 1;
  const recordTransfers = options.recordTransfers ?? null;
  const {
    inletsData,
    nInlets = 0,
    valvesData,
    nValves = 0,
    valveNeighborData,
    nValveNeighbors = 0,
    exchangersData,
    nExchangers = 0,
    outletsData,
    nOutlets = 0,
  } = componentSet;
  const totalComponents = nInlets + nValves + nExchangers + nOutlets;
  if (totalComponents > HEAT_TRANSFER_MAX_ITERATIONS) {
    throw new Error(`Heat transfer payload too large: ${totalComponents} components`);
  }
  const r1 = runInlets(nextHeat, reactorHeat, inletsData, nInlets, multiplier);
  reactorHeat = r1.reactorHeat;
  runValvesFromTyped(nextHeat, containment, valvesData, nValves, multiplier, recordTransfers);
  runExchangersFromTyped({
    heat: nextHeat,
    containment,
    exchangersData,
    nExchangers,
    valveNeighborData,
    nValveNeighbors,
    multiplier,
    recordTransfers,
  });
  reactorHeat = runOutletsFromTyped(nextHeat, outletsData, nOutlets, reactorHeat, multiplier);
  for (let i = 0; i < nextHeat.length; i++) {
    if (nextHeat[i] < HEAT_EPSILON) nextHeat[i] = 0;
  }
  if (reactorHeat < HEAT_EPSILON) reactorHeat = 0;
  for (let i = 0; i < nextHeat.length; i++) heat[i] = nextHeat[i];
  return { reactorHeat, heatFromInlets: r1.heatFromInlets };
}

export function runHeatTransferStep(componentSet, heatState, options = {}) {
  const { heat, containment } = heatState;
  return runHeatTransferCore(heat, containment, componentSet, {
    reactorHeat: options.reactorHeat ?? 0,
    multiplier: options.multiplier ?? 1,
    recordTransfers: options.recordTransfers ?? null,
  });
}

export function runHeatStepFromTyped(heat, containment, payload, recordTransfers) {
  return runHeatTransferCore(heat, containment, payload, {
    reactorHeat: payload.reactorHeat ?? 0,
    multiplier: payload.multiplier ?? 1,
    recordTransfers: recordTransfers ?? null,
  });
}

