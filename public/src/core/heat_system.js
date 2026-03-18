import { fromError } from "zod-validation-error";
import { BalanceConfigSchema } from "../utils/utils_constants.js";
import {
  HEAT_EPSILON,
  HEAT_TRANSFER_DIFF_DIVISOR,
  EXCHANGER_MIN_TRANSFER_UNIT,
  EXCHANGER_MIN_HEADROOM,
  HEAT_TRANSFER_MAX_ITERATIONS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
} from "../utils/utils_constants.js";
import { GameLoopTickResultSchema } from "../utils/utils_constants.js";
import { toDecimal, toNumber, logger } from "../utils/utils_constants.js";
import { setDecimal, snapshot } from "./store.js";
import { buildFacts } from "./game/GameModule.js";

const rawBalance = {
  valveTopupCapRatio: 0.2,
  autoSellMultiplierPerLevel: 0.01,
  stirlingMultiplierPerLevel: 0.01,
  defaultCostMultiplier: 1.5,
  reflectorSellMultiplier: 1.5,
  cellSellMultiplier: 1.5,
  powerThreshold10k: 10000,
  marketLobbyingMultPerLevel: 0.1,
  emergencyCoolantMultPerLevel: 0.005,
  reflectorCoolingFactorPerLevel: 0.02,
  insurancePercentPerLevel: 0.10,
  manualOverrideMultPerLevel: 0.10,
  convectiveBoostPerLevel: 0.10,
  electroThermalBaseRatio: 2,
  electroThermalStep: 0.5,
  catalystReductionPerLevel: 0.05,
  thermalFeedbackRatePerLevel: 0.1,
  volatileTuningMaxPerLevel: 0.05,
  platingTransferRatePerLevel: 0.05,
  phlembotinumPowerBase: 100,
  phlembotinumHeatBase: 1000,
  phlembotinumMultiplier: 4,
};
const balanceResult = BalanceConfigSchema.safeParse(rawBalance);
export const BALANCE = balanceResult.success ? balanceResult.data : rawBalance;

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
  if (val.type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
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

function runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers) {
  const heatLen = heat.length;
  const snap = new Float32Array(heatLen);
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
    if ((valvesData[base + 1] | 0) === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
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

function buildValveSet(valveNeighborData, nValveNeighbors) {
  const valveSet = new Set();
  for (let i = 0; i < nValveNeighbors; i++) valveSet.add(valveNeighborData[i] | 0);
  return valveSet;
}

function buildExchangerStartHeatTyped(exchangersData, nExchangers, heat) {
  const startHeat = new Map();
  for (let e = 0; e < nExchangers; e++) {
    const idx = exchangersData[e * EXCHANGER_STRIDE] | 0;
    startHeat.set(idx, heat[idx] || 0);
  }
  return startHeat;
}

function collectExchangerPushTyped(planned, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier) {
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + 0] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) ?? (heat[idx] || 0));
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    let totalHeadroom = 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const cap = exchangersData[base + 4 + MAX_NEIGHBORS + n] || 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      totalHeadroom += Math.max(cap - nStart, 0);
    }
    if (totalHeadroom === 0) totalHeadroom = EXCHANGER_MIN_HEADROOM;
    let remainingPush = heatStart;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const cap = exchangersData[base + 4 + MAX_NEIGHBORS + n] || 0;
      const cat = exchangersData[base + 4 + MAX_NEIGHBORS * 2 + n] | 0;
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
    const idx = exchangersData[base + 0] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) ?? (heat[idx] || 0));
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
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
  for (const { from, to, amount } of planned) {
    heat[from] = (heat[from] || 0) - amount;
    heat[to] = (heat[to] || 0) + amount;
    if (recordTransfers) recordTransfers.push({ fromIdx: from, toIdx: to, amount });
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
  const nextHeat = ArrayBuffer.isView(heat) ? new Float32Array(heat) : heat.slice();
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

function fillContainmentFromTiles(ts, rows, cols, containmentOut) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = ts.getTile(r, c);
      if (tile?.part) containmentOut[ts.gridIndex(r, c)] = tile.part.containment || 0;
    }
  }
}

function prepareHeatContainment(engine, ts, rows, cols, gridLen) {
  if (engine._heatUseSAB) {
    const needBoth = !engine._heatSABView || engine._heatSABView.length !== gridLen ||
      !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
    if (needBoth) {
      engine._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
      engine._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
    }
    engine._heatSABView.set(ts.heatMap);
    fillContainmentFromTiles(ts, rows, cols, engine._containmentSABView);
    if (ts.heatMap !== engine._heatSABView) ts.heatMap = engine._heatSABView;
    return { heatCopy: engine._heatSABView, containment: engine._containmentSABView };
  }
  let needNew = !engine._heatTransferHeat || engine._heatTransferHeat.length !== gridLen;
  if (!needNew) {
    try {
      needNew = engine._heatTransferHeat.buffer.byteLength === 0;
    } catch {
      needNew = true;
    }
  }
  if (needNew) {
    engine._heatTransferHeat = new Float32Array(gridLen);
    engine._heatTransferContainment = new Float32Array(gridLen);
  }
  const heatCopy = engine._heatTransferHeat;
  heatCopy.set(ts.heatMap);
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
  outBuf[base + OUTLET_OFFSET_IS_OUTLET6] = part.id === 'heat_outlet6' ? 1 : 0;
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
  const transferList = engine._heatUseSAB
    ? [inletsCopy.buffer, valvesCopy.buffer, valveNeighborsCopy.buffer, exchangersCopy.buffer, outletsCopy.buffer]
    : [heatCopy.buffer, containment.buffer, inletsCopy.buffer, valvesCopy.buffer, valveNeighborsCopy.buffer, exchangersCopy.buffer, outletsCopy.buffer];
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
  if (engine._heatUseSAB) msg.useSAB = true;
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
    engine.game.tileset.heatMap = heat;
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

const SAB_BYTES_PER_FLOAT = 4;

function ensureHeatSAB(engine, ts, gridLen) {
  const needNew = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  if (needNew) {
    engine._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    engine._heatSABView.set(ts.heatMap);
    ts.heatMap = engine._heatSABView;
  } else {
    engine._heatSABView.set(ts.heatMap);
  }
}

function ensureContainmentSAB(engine, game, gridLen) {
  const ts = game.tileset;
  const needNew = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needNew) {
    engine._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    const rows = game.gridManager.rows;
    const cols = game.gridManager.cols;
    const coords = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ r, c }))
    ).flat();
    coords.forEach(({ r, c }) => {
      const tile = ts.getTile(r, c);
      if (tile?.part) engine._containmentSABView[ts.gridIndex(r, c)] = tile.part.containment || 0;
    });
  }
}

function ensureSABsReady(engine, game, gridLen) {
  const ts = game.tileset;
  const needHeat = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  const needContainment = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needHeat) ensureHeatSAB(engine, ts, gridLen);
  else engine._heatSABView.set(ts.heatMap);
  if (needContainment) ensureContainmentSAB(engine, game, gridLen);
}

function partToRow(part) {
  const power = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power))
    ? part.power
    : (part.base_power ?? 0);
  const heat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat))
    ? part.heat
    : (part.base_heat ?? 0);
  return {
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
  };
}

function buildPartTable(ts) {
  const partIdToIndex = {};
  const partTable = [];
  const list = (ts.active_tiles_list || []).filter((tile) => tile?.enabled && tile.part);
  for (const tile of list) {
    const part = tile.part;
    if (partIdToIndex[part.id] !== undefined) continue;
    partIdToIndex[part.id] = partTable.length;
    partTable.push(partToRow(part));
  }
  return { partIdToIndex, partTable };
}

function buildPartLayout(ts, partIdToIndex) {
  const list = (ts.active_tiles_list || []).filter((tile) => tile?.enabled && tile.part);
  return list.map((tile) => {
    const part = tile.part;
    const transferRate = typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
    const ventRate = typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
    const partPower = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power)) ? part.power : (part.base_power ?? 0);
    const partHeat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat)) ? part.heat : (part.base_heat ?? 0);
    const rawPower = (typeof tile.power === "number" && !isNaN(tile.power) && isFinite(tile.power)) ? tile.power : partPower;
    const rawHeat = (typeof tile.heat === "number" && !isNaN(tile.heat) && isFinite(tile.heat)) ? tile.heat : partHeat;
    const tilePower = (part.category === "cell" && (tile.ticks ?? 0) > 0 && rawPower === 0) ? partPower : rawPower;
    const tileHeat = (part.category === "cell" && (tile.ticks ?? 0) > 0 && rawHeat === 0) ? partHeat : rawHeat;
    return {
      r: tile.row,
      c: tile.col,
      partIndex: partIdToIndex[part.id],
      ticks: tile.ticks ?? 0,
      activated: !!tile.activated,
      transferRate,
      ventRate,
      power: tilePower,
      heat: tileHeat,
    };
  });
}

function buildPartSnapshot(ts) {
  const { partIdToIndex, partTable } = buildPartTable(ts);
  const partLayout = buildPartLayout(ts, partIdToIndex);
  return { partTable, partLayout };
}

function buildReactorStatePayload(reactor) {
  return {
    current_heat: reactor.current_heat,
    current_power: reactor.current_power,
    max_heat: toNumber(reactor.max_heat ?? 0),
    max_power: toNumber(reactor.max_power ?? 0),
    auto_sell_multiplier: reactor.auto_sell_multiplier ?? 0,
    sell_price_multiplier: reactor.sell_price_multiplier ?? 1,
    power_overflow_to_heat_ratio: reactor.power_overflow_to_heat_ratio ?? 0.5,
    power_multiplier: reactor.power_multiplier ?? 1,
    heat_controlled: reactor.heat_controlled ? 1 : 0,
    vent_multiplier_eff: reactor.vent_multiplier_eff ?? 0,
    stirling_multiplier: reactor.stirling_multiplier ?? 0,
  };
}

export function serializeStateForGameLoopWorker(engine) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  if (!ts?.heatMap) return null;
  const gridLen = ts.heatMap.length;
  if (!engine._heatUseSAB) return null;
  ensureSABsReady(engine, game, gridLen);
  const stateSnapshot = game.state ? snapshot(game.state) : null;

  const { partTable, partLayout } = buildPartSnapshot(ts);
  const autoSellFromStore = stateSnapshot?.auto_sell !== undefined;

  const rawMoney = stateSnapshot?.current_money;
  const currentMoney = rawMoney != null ? (typeof rawMoney === "number" || typeof rawMoney === "string" ? rawMoney : toNumber(rawMoney)) : undefined;
  return {
    current_money: currentMoney,
    heatBuffer: engine._heatSABView.buffer,
    partLayout,
    partTable,
    reactorState: buildReactorStatePayload(reactor),
    rows: game.gridManager.rows,
    cols: game.gridManager.cols,
    maxCols: ts.max_cols ?? game.gridManager.cols,
    autoSell: autoSellFromStore ? !!stateSnapshot?.auto_sell : !!game.ui?.stateManager?.getVar?.("auto_sell"),
    multiplier: 1,
    tickCount: 1,
  };
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
      game.update_cell_power();
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
  game?.emit?.("tickRecorded");
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

export function applyGameLoopTickResult(engine, data) {
  if (!data || data.error) return;
  const result = GameLoopTickResultSchema.safeParse(data);
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
  logger.log("debug", "engine", "[GameLoopWorker] applyGameLoopTickResult received:", {
    reactorPower: rawPower,
    reactorHeat: rawHeat,
    powerDelta: data.powerDelta,
    tickCount: data.tickCount,
    tickId: data.tickId
  });
  reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  reactor.current_power = toDecimal(rawPower);
  logger.log("debug", "engine", "[GameLoopWorker] reactor state after apply:", {
    current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
    game_state_current_power: game.state?.current_power?.toNumber?.() ?? game.state?.current_power
  });
  applyExplosionIndices(engine, ts, data.explosionIndices, maxCols);
  applyDepletionIndices(engine, ts, data.depletionIndices, maxCols);
  applyTileUpdates(ts, data.tileUpdates);
  if (Number(data.moneyEarned) > 0) game.addMoney(data.moneyEarned);
  reactor.checkMeltdown();
  const facts = buildFacts(game, engine, data);
  if (!facts.isSandbox && typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  syncUIAfterTick(engine, data, reactor);
  syncSessionAfterTick(engine, data);
}
