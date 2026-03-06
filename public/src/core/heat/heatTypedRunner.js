import {
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6,
  OUTLET_OFFSET_N_COUNT, OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS
} from "../heatPayloadSchema.js";
import { BALANCE } from "../balanceConfig.js";
import { VALVE_TOPUP } from "./heatTransferFormulas.js";
import { transferHeatBetweenNeighbors } from "./heatTransferFormulas.js";
import { HEAT_EPSILON, HEAT_TRANSFER_DIFF_DIVISOR, EXCHANGER_MIN_HEADROOM, HEAT_TRANSFER_MAX_ITERATIONS } from "../constants.js";

function cloneHeatState(heat) {
  return ArrayBuffer.isView(heat) ? new Float32Array(heat) : heat.slice();
}

function applyHeatState(targetHeat, sourceHeat) {
  const len = sourceHeat.length;
  for (let i = 0; i < len; i++) targetHeat[i] = sourceHeat[i];
}

function getHeatAt(idx, valveSet, startHeat, heat) {
  return valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) ?? (heat[idx] || 0));
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

function calculateValveTransfer(valvesData, base, snap, containment, heatLen, multiplier) {
  const inputIdx = valvesData[base + VALVE_OFFSET_INPUT_IDX] | 0;
  const outputIdx = valvesData[base + VALVE_OFFSET_OUTPUT_IDX] | 0;
  const valIndex = valvesData[base + VALVE_OFFSET_INDEX] | 0;
  if (inputIdx < 0 || outputIdx < 0 || inputIdx >= heatLen || outputIdx >= heatLen || valIndex >= heatLen) {
    return null;
  }
  const inputHeat = snap[inputIdx] || 0;
  const outputCap = containment[outputIdx] || 1;
  const outputSpace = Math.max(0, outputCap - (snap[outputIdx] || 0));
  let maxTransfer = valvesData[base + VALVE_OFFSET_RATE] * multiplier;
  if ((valvesData[base + VALVE_OFFSET_TYPE] | 0) === VALVE_TOPUP) {
    maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
  }
  const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
  return transfer > 0 ? { inputIdx, outputIdx, transfer } : null;
}

function processPlannedValveTransfers(planned, heat, recordTransfers) {
  for (let p = 0; p < planned.length; p++) {
    const { inputIdx, outputIdx, transfer } = planned[p];
    heat[inputIdx] = (heat[inputIdx] || 0) - transfer;
    heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
    if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
  }
}

function resetValveHeatValues(valvesData, nValves, heat, heatLen) {
  for (let v = 0; v < nValves; v++) {
    const valIndex = valvesData[v * VALVE_STRIDE + VALVE_OFFSET_INDEX] | 0;
    if (valIndex >= 0 && valIndex < heatLen) heat[valIndex] = 0;
  }
}

function runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers) {
  const heatLen = heat.length;
  const snap = new Float32Array(heatLen);
  for (let i = 0; i < heatLen; i++) snap[i] = heat[i] || 0;
  const planned = [];
  for (let v = 0; v < nValves; v++) {
    const transferPlan = calculateValveTransfer(valvesData, v * VALVE_STRIDE, snap, containment, heatLen, multiplier);
    if (transferPlan) {
      planned.push(transferPlan);
      snap[transferPlan.inputIdx] -= transferPlan.transfer;
      snap[transferPlan.outputIdx] = (snap[transferPlan.outputIdx] || 0) + transferPlan.transfer;
    }
  }
  processPlannedValveTransfers(planned, heat, recordTransfers);
  resetValveHeatValues(valvesData, nValves, heat, heatLen);
}

function buildValveSet(valveNeighborData, nValveNeighbors) {
  const valveSet = new Set();
  for (let i = 0; i < nValveNeighbors; i++) valveSet.add(valveNeighborData[i] | 0);
  return valveSet;
}

function buildExchangerStartHeatTyped(exchangersData, nExchangers, heat) {
  const startHeat = new Map();
  for (let e = 0; e < nExchangers; e++) {
    const idx = exchangersData[e * EXCHANGER_STRIDE + EXCHANGER_OFFSET_INDEX] | 0;
    startHeat.set(idx, heat[idx] || 0);
  }
  return startHeat;
}

function collectExchangerPushTyped(planned, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier) {
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + EXCHANGER_OFFSET_INDEX] | 0;
    const heatStart = getHeatAt(idx, valveSet, startHeat, heat);
    const transferVal = exchangersData[base + EXCHANGER_OFFSET_RATE] * multiplier;
    const nCount = (exchangersData[base + EXCHANGER_OFFSET_N_COUNT] | 0) || 0;
    let totalHeadroom = 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const cap = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + n] || 0;
      const nStart = getHeatAt(nidx, valveSet, startHeat, heat);
      totalHeadroom += Math.max(cap - nStart, 0);
    }
    if (totalHeadroom === 0) totalHeadroom = EXCHANGER_MIN_HEADROOM;
    let remainingPush = heatStart;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const nStart = getHeatAt(nidx, valveSet, startHeat, heat);
      const cap = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + n] || 0;
      const cat = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + n] | 0;
      if (remainingPush <= 0) break;
      const amt = transferHeatBetweenNeighbors(heatStart, nStart, cap, cat, transferVal, totalHeadroom, remainingPush);
      if (amt > 0) {
        planned.push({ from: idx, to: nidx, amount: amt });
        remainingPush -= amt;
      }
    }
  }
}

function collectExchangerPullTyped(opts) {
  const { planned, plannedOutByNeighbor, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier } = opts;
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + EXCHANGER_OFFSET_INDEX] | 0;
    const heatStart = getHeatAt(idx, valveSet, startHeat, heat);
    const transferVal = exchangersData[base + EXCHANGER_OFFSET_RATE] * multiplier;
    const nCount = (exchangersData[base + EXCHANGER_OFFSET_N_COUNT] | 0) || 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + n] | 0;
      const nStart = getHeatAt(nidx, valveSet, startHeat, heat);
      const alreadyOut = plannedOutByNeighbor.get(nidx) || 0;
      const nAvailable = Math.max(0, nStart - alreadyOut);
      if (nAvailable <= 0 || nStart <= heatStart) continue;
      const diff = nStart - heatStart;
      const amt = Math.min(transferVal, Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR), nAvailable);
      if (amt > 0) {
        planned.push({ from: nidx, to: idx, amount: amt });
        plannedOutByNeighbor.set(nidx, alreadyOut + amt);
      }
    }
  }
}

function applyPlannedTransfers(heat, planned, recordTransfers) {
  for (let p = 0; p < planned.length; p++) {
    const t = planned[p];
    heat[t.from] = (heat[t.from] || 0) - t.amount;
    heat[t.to] = (heat[t.to] || 0) + t.amount;
    if (recordTransfers) recordTransfers.push({ fromIdx: t.from, toIdx: t.to, amount: t.amount });
  }
}

function runExchangersFromTyped(opts) {
  const { heat, containment, exchangersData, nExchangers, valveNeighborData, nValveNeighbors, multiplier, recordTransfers } = opts;
  const valveSet = buildValveSet(valveNeighborData, nValveNeighbors);
  const startHeat = buildExchangerStartHeatTyped(exchangersData, nExchangers, heat);
  const planned = [];
  collectExchangerPushTyped(planned, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier);
  const plannedOutByNeighbor = new Map();
  collectExchangerPullTyped({ planned, plannedOutByNeighbor, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier });
  applyPlannedTransfers(heat, planned, recordTransfers);
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

function buildOutletConfig(outletsData, o, multiplier) {
  const base = o * OUTLET_STRIDE;
  const nCount = (outletsData[base + OUTLET_OFFSET_N_COUNT] | 0) || 0;
  const neighborIndices = [];
  const neighborCaps = [];
  for (let n = 0; n < nCount; n++) {
    neighborIndices.push(outletsData[base + OUTLET_OFFSET_NEIGHBOR_INDICES + n]);
    neighborCaps.push(outletsData[base + OUTLET_OFFSET_NEIGHBOR_CAPS + n] || 0);
  }
  return {
    activated: outletsData[base + OUTLET_OFFSET_ACTIVATED],
    nCount,
    transferCap: outletsData[base + OUTLET_OFFSET_RATE] * multiplier,
    outIndex: outletsData[base + OUTLET_OFFSET_INDEX] | 0,
    isOutlet6: outletsData[base + OUTLET_OFFSET_IS_OUTLET6],
    neighborIndices,
    neighborCaps,
  };
}

function runOutletsFromTyped(heat, outletsData, nOutlets, reactorHeat, multiplier) {
  for (let o = 0; o < nOutlets; o++) {
    if (reactorHeat <= 0) break;
    const outlet = buildOutletConfig(outletsData, o, multiplier);
    reactorHeat = processSingleOutlet(heat, outlet, reactorHeat);
  }
  return reactorHeat;
}

function runHeatTransferCore(heat, containment, componentSet, options) {
  const nextHeat = cloneHeatState(heat);
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
  const r1 = runInletsFromTyped(nextHeat, reactorHeat, inletsData, nInlets, multiplier);
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
  applyHeatState(heat, nextHeat);
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
  const componentSet = {
    inletsData: payload.inletsData,
    nInlets: (payload.nInlets | 0) || 0,
    valvesData: payload.valvesData,
    nValves: (payload.nValves | 0) || 0,
    valveNeighborData: payload.valveNeighborData,
    nValveNeighbors: (payload.nValveNeighbors | 0) || 0,
    exchangersData: payload.exchangersData,
    nExchangers: (payload.nExchangers | 0) || 0,
    outletsData: payload.outletsData,
    nOutlets: (payload.nOutlets | 0) || 0,
  };
  return runHeatTransferCore(heat, containment, componentSet, {
    reactorHeat: payload.reactorHeat ?? 0,
    multiplier: payload.multiplier ?? 1,
    recordTransfers: recordTransfers ?? null,
  });
}
