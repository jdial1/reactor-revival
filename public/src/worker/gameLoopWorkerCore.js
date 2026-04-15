import "../../lib/break_infinity.min.js";
{
  const Dec =
    (typeof globalThis !== "undefined" && globalThis.Decimal) ||
    (typeof self !== "undefined" && self.Decimal);
  if (typeof Dec === "function") {
    if (typeof globalThis !== "undefined") globalThis.Decimal = Dec;
    if (typeof self !== "undefined") self.Decimal = Dec;
  }
}
import {
  runHeatStepFromTyped,
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_ORIENTATION, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6, OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS,
  MAX_NEIGHBORS,
  computeWorkerNeighborPulseN,
  calculateCellPulsePower,
  calculateCellPulseHeat,
} from "../logic.js";
import {
  REACTOR_HEAT_STANDARD_DIVISOR,
  DEFAULT_OVERFLOW_RATIO,
  DEFAULT_POWER_MULTIPLIER,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  VENT_BONUS_PERCENT_DIVISOR,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
  getIndex,
  applyPowerOverflowCalcDecimal,
  HULL_REPEL_FRACTION,
  FOUNDATIONAL_TICK_MS,
  MELTDOWN_HEAT_MULTIPLIER,
} from "../utils.js";
import { hasTrait, TraitBitmask } from "../traits.js";
import { toDecimal } from "../utils.js";
import { buildContainmentSoa, buildOrthoAdjacencySoa, heatSoaView } from "./soaTickLayout.js";

const MAX_INLETS = HEAT_PAYLOAD_MAX_INLETS;
const MAX_VALVES = HEAT_PAYLOAD_MAX_VALVES;
const MAX_VALVE_NEIGHBORS = HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS;
const MAX_EXCHANGERS = HEAT_PAYLOAD_MAX_EXCHANGERS;
const MAX_OUTLETS = HEAT_PAYLOAD_MAX_OUTLETS;
const OVERFLOW_VALVE_RATIO_MIN = VALVE_OVERFLOW_THRESHOLD;
const TOPUP_VALVE_RATIO_MAX = VALVE_TOPUP_THRESHOLD;

function getValveOrientation(part) {
  const v = Number(part?.level);
  return Number.isFinite(v) && v > 0 ? v | 0 : 1;
}

function buildGridPartIndices(partLayout, gridLen, stride) {
  const arr = new Int32Array(gridLen);
  arr.fill(-1);
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    arr[getIndex(t.r, t.c, stride)] = t.partIndex;
  }
  return arr;
}

function orthoNeighborNidxList(gidx, ctx) {
  const { orthoOff, orthoIdx, gridPartIdx } = ctx;
  const out = [];
  if (!orthoOff || !orthoIdx || !gridPartIdx) return out;
  const a = orthoOff[gidx];
  const b = orthoOff[gidx + 1];
  for (let i = a; i < b; i++) {
    const nidx = orthoIdx[i];
    if (gridPartIdx[nidx] >= 0) out.push(nidx);
  }
  return out;
}

function buildPayloadCellLookup(partLayout, stride) {
  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    cellByKey.set(`${t.r},${t.c}`, { ...t, layoutIndex: i });
  }
  const partAt = (r, c) => cellByKey.get(`${r},${c}`);
  const gidx = (r, c) => getIndex(r, c, stride);
  return { partAt, gidx };
}

function partHasTrait(part, trait) {
  if (!part) return false;
  return hasTrait(part.trait_mask, trait);
}

function isValveLikePart(p) {
  return !!(p && partHasTrait(p, "VALVE_UNIT"));
}

function getValveTypeId(part) {
  if (partHasTrait(part, "VALVE_OVERFLOW")) return 1;
  if (partHasTrait(part, "VALVE_TOPUP")) return 2;
  return 3;
}

function getExchangerNeighborCategory(nPart) {
  if (partHasTrait(nPart, "VENT") || partHasTrait(nPart, "COOLANT_CELL")) return 2;
  if (partHasTrait(nPart, "HEAT_EXCHANGER")) return 0;
  return 1;
}

function fillInletsBuffer(ctx) {
  const { partLayout, partTable, gidx } = ctx;
  const buf = new Float32Array(MAX_INLETS * INLET_STRIDE);
  let nInlets = 0;
  for (let i = 0; i < partLayout.length && nInlets < MAX_INLETS; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || !partHasTrait(part, "HEAT_INLET")) continue;
    const neighbors = orthoNeighborNidxList(gidx(t.r, t.c), ctx);
    let nCount = 0;
    for (let k = 0; k < neighbors.length && nCount < MAX_NEIGHBORS; k++) {
      const nidx = neighbors[k];
      buf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = nidx;
      nCount++;
    }
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = gidx(t.r, t.c);
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = t.transferRate ?? 0;
    buf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
    nInlets++;
  }
  return { buf, nInlets };
}

function collectValveNeighborIndices(valveEntries, ctx) {
  const { partTable, gidx, gridPartIdx } = ctx;
  const valveNeighborSet = new Set();
  for (let v = 0; v < valveEntries.length; v++) {
    const t = valveEntries[v];
    const neighbors = orthoNeighborNidxList(gidx(t.r, t.c), ctx);
    for (let k = 0; k < neighbors.length; k++) {
      const nidx = neighbors[k];
      const pi = gridPartIdx[nidx];
      if (pi < 0) continue;
      const p = partTable[pi];
      if (p && !isValveLikePart(p)) valveNeighborSet.add(nidx);
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
  if (partHasTrait(part, "VALVE_OVERFLOW")) {
    const inputRatio = inputNeighbor.cap > 0 ? (inputNeighbor.heat / inputNeighbor.cap) : 0;
    return inputRatio < OVERFLOW_VALVE_RATIO_MIN;
  }
  if (partHasTrait(part, "VALVE_TOPUP")) {
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
  const { partTable, heat, gridPartIdx, stride, gidx } = ctx;
  return orthoNeighborNidxList(gidx(t.r, t.c), ctx).map((nidx) => {
    const nr = (nidx / stride) | 0;
    const nc = nidx % stride;
    const pi = gridPartIdx[nidx];
    return {
      r: nr,
      c: nc,
      idx: nidx,
      heat: heat[nidx] || 0,
      cap: pi >= 0 ? partTable[pi]?.containment || 0 : 0,
    };
  });
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
    const orientation = getValveOrientation(part);
    const { inputNeighbor, outputNeighbor } = getInputOutputNeighbors(neighbors, orientation);
    if (shouldSkipValve(part, inputNeighbor, outputNeighbor)) continue;
    const base = nValves * VALVE_STRIDE;
    writeValveEntry(buf, base, gidx, t, part, orientation, inputNeighbor, outputNeighbor);
    nValves++;
  }
  return { buf, nValves };
}

function isExchangerPart(p) {
  return (
    p &&
    (partHasTrait(p, "HEAT_EXCHANGER") ||
      isValveLikePart(p) ||
      (partHasTrait(p, "REACTOR_PLATING") && (p.transfer || 0) > 0))
  );
}

function fillExchangersBuffer(exchangerEntries, ctx) {
  const { partTable, gidx, gridPartIdx } = ctx;
  const buf = new Float32Array(MAX_EXCHANGERS * EXCHANGER_STRIDE);
  let nExchangers = 0;
  for (let i = 0; i < exchangerEntries.length && nExchangers < MAX_EXCHANGERS; i++) {
    const t = exchangerEntries[i];
    const part = partTable[t.partIndex];
    if (!part || isValveLikePart(part)) continue;
    const neighbors = orthoNeighborNidxList(gidx(t.r, t.c), ctx);
    let nCount = 0;
    for (let n = 0; n < neighbors.length && nCount < MAX_NEIGHBORS; n++) {
      const nidx = neighbors[n];
      const nPart = partTable[gridPartIdx[nidx]];
      if (!nPart) continue;
      const base = nExchangers * EXCHANGER_STRIDE;
      buf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = nidx;
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
  const { partTable, gidx, gridPartIdx } = ctx;
  return orthoNeighborNidxList(gidx(t.r, t.c), ctx).filter((nidx) => {
    const pi = gridPartIdx[nidx];
    if (pi < 0) return false;
    return !isValveLikePart(partTable[pi]);
  });
}

function writeOutletEntry(buf, base, ctx, t, part, neighbors) {
  const { gidx, gridPartIdx, partTable } = ctx;
  buf[base + OUTLET_OFFSET_INDEX] = gidx(t.r, t.c);
  buf[base + OUTLET_OFFSET_RATE] = t.transferRate ?? 0;
  buf[base + OUTLET_OFFSET_ACTIVATED] = t.activated ? 1 : 0;
  buf[base + OUTLET_OFFSET_IS_OUTLET6] = part.outlet_respect_neighbor_cap ? 1 : 0;
  buf[base + OUTLET_OFFSET_N_COUNT] = neighbors.length;
  for (let j = 0; j < neighbors.length && j < MAX_NEIGHBORS; j++) {
    const nidx = neighbors[j];
    const nPart = partTable[gridPartIdx[nidx]];
    buf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = nidx;
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

function buildHeatPayloadFromLayout(layoutContext) {
  const { partLayout, partTable, rows, cols, heat, containment, orthoOff, orthoIdx } = layoutContext;
  const stride = layoutContext.maxCols ?? cols;
  const gridLen = heat.length;
  const gridPartIdx = buildGridPartIndices(partLayout, gridLen, stride);
  const { partAt, gidx } = buildPayloadCellLookup(partLayout, stride);
  const ctx = {
    partLayout,
    partTable,
    rows,
    cols,
    heat,
    containment,
    partAt,
    gidx,
    orthoOff,
    orthoIdx,
    stride,
    gridPartIdx,
  };

  const { buf: inletsBuf, nInlets } = fillInletsBuffer(ctx);

  const valveEntries = partLayout.filter((t) => isValveLikePart(partTable[t.partIndex]));
  const { valveNbrBuf, nValveNeighbors } = collectValveNeighborIndices(valveEntries, ctx);
  const { buf: valvesBuf, nValves } = fillValvesBuffer(valveEntries, ctx);

  const exchangerEntries = partLayout.filter((t) => isExchangerPart(partTable[t.partIndex]));
  const { buf: exchBuf, nExchangers } = fillExchangersBuffer(exchangerEntries, ctx);

  const outletEntries = partLayout.filter((t) => {
    const p = partTable[t.partIndex];
    return p && partHasTrait(p, "HEAT_OUTLET");
  });
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

function buildCellLookup(partLayout) {
  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    cellByKey.set(`${t.r},${t.c}`, { ...t, layoutIndex: i });
  }
  return (r, c) => cellByKey.get(`${r},${c}`);
}

function processCells(partLayout, partTable, heat, rows, cols, stride, multiplier, partAt, gidx, moneyRef, ctx, reactorHeat) {
  let power_add = 0;
  let heat_add = 0;
  const depletionIndices = [];
  const tileUpdates = [];
  const autoOn = ctx?.auto_buy && ctx?.auto_buy_unlocked && moneyRef;
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || !partHasTrait(part, "FUEL_CELL") || t.ticks <= 0) continue;

    const M = part.cell_pack_M ?? 1;
    const C = Math.max(1, part.cell_count_C ?? part.cell_count ?? 1);
    const N = computeWorkerNeighborPulseN(t.r, t.c, partTable, partAt, rows, cols);
    const LP = typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power) ? part.power : part.base_power ?? 0;
    const H_eff = typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat) ? part.heat : part.base_heat ?? 0;
    
    // Apply dynamic multiplier for global heat
    const hpm = ctx.reactorState.heat_power_multiplier || 0;
    let powerMult = 1;
    if (hpm > 0 && reactorHeat.gt(0)) {
      const heatNum = Math.min(reactorHeat.toNumber(), 1e100);
      powerMult = 1 + hpm * (Math.log(heatNum) / Math.log(1000) / 100);
    }
    const finalLP = LP * powerMult;

    // Apply dynamic reflector cooling
    const rcf = ctx.reactorState.reflector_cooling_factor || 0;
    let heatMult = 1;
    if (rcf > 0) {
      let reflector_count = 0;
      const neighbors = orthoNeighborNidxList(gidx(t.r, t.c), ctx);
      for (let k = 0; k < neighbors.length; k++) {
        const nPart = partTable[ctx.gridPartIdx[neighbors[k]]];
        if (nPart && partHasTrait(nPart, "REFLECTOR")) reflector_count++;
      }
      if (reflector_count > 0) {
        heatMult = Math.max(0.1, 1 - (reflector_count * rcf));
      }
    }
    const finalHeff = H_eff * heatMult;

    const layoutPower = calculateCellPulsePower(finalLP, M, N);
    power_add += layoutPower * multiplier;
    const layoutHeat = calculateCellPulseHeat(finalHeff, M, N, C);
    const generatedHeat = layoutHeat * multiplier;
    const { gridPartIdx } = ctx;
    const neighbors = orthoNeighborNidxList(gidx(t.r, t.c), ctx);

    let validCount = 0;
    for (let k = 0; k < neighbors.length; k++) {
      const nPart = partTable[gridPartIdx[neighbors[k]]];
      if (nPart?.containment > 0) validCount++;
    }

    if (validCount > 0) {
      const perN = generatedHeat / validCount;
      for (let k = 0; k < neighbors.length; k++) {
        const nidx = neighbors[k];
        const nPart = partTable[gridPartIdx[nidx]];
        if (nPart?.containment > 0) {
          heat[nidx] = (heat[nidx] || 0) + perN;
        }
      }
    } else {
      heat_add += generatedHeat;
    }

    t.ticks = (t.ticks ?? 0) - multiplier;
    if (t.ticks <= 0) {
      const costNum = Number(t.autoBuyReplaceCost ?? 0);
      const eligible = !!t.autoBuyEligible && costNum > 0;
      if (autoOn && eligible && moneyRef.value.gte(costNum)) {
        moneyRef.value = moneyRef.value.sub(costNum);
        moneyRef.spentAutoBuy = moneyRef.spentAutoBuy.add(costNum);
        const resetTicks = t.maxTicks ?? partTable[t.partIndex]?.ticks ?? 0;
        t.ticks = resetTicks;
      } else {
        depletionIndices.push(gidx(t.r, t.c));
      }
    }
    tileUpdates.push({ r: t.r, c: t.c, ticks: t.ticks });
  }

  if (power_add > 0 || depletionIndices.length > 0) {
    const cellCount = partLayout.filter(
      (t) => partHasTrait(partTable[t.partIndex], "FUEL_CELL") && (t.ticks ?? 0) > 0
    ).length;
    console.debug("[GameLoopWorker] processCells:", { power_add, heat_add, cellCount, depletionCount: depletionIndices.length });
  }
  return { power_add, heat_add, depletionIndices, tileUpdates };
}

function findExplosionIndices(partLayout, partTable, integrity, gidx) {
  const explosionIndices = [];
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part?.containment) continue;
    const idx = gidx(t.r, t.c);
    if (integrity[idx] <= 0) {
      const capSort = partHasTrait(part, "CAPACITOR") ? 0 : 1;
      explosionIndices.push({ idx, capSort });
    }
  }
  explosionIndices.sort((a, b) => a.capSort - b.capSort);
  return explosionIndices.map((e) => e.idx);
}

function applyHullRepulsionWorker(reactorHeat, maxHeat, heat, partLayout, partTable, gidx) {
  if (!reactorHeat.gt(maxHeat)) return reactorHeat;
  const excess = reactorHeat.sub(maxHeat);
  const totalRepel = excess.mul(HULL_REPEL_FRACTION);
  let n = 0;
  for (let i = 0; i < partLayout.length; i++) {
    if (partTable[partLayout[i].partIndex]) n++;
  }
  if (n === 0) return reactorHeat.sub(totalRepel);
  const per = totalRepel.div(n).toNumber();
  for (let j = 0; j < partLayout.length; j++) {
    const t = partLayout[j];
    if (!partTable[t.partIndex]) continue;
    const gi = gidx(t.r, t.c);
    heat[gi] = (heat[gi] || 0) + per;
  }
  return reactorHeat.sub(totalRepel);
}

function processVents(partLayout, partTable, heat, reactorState, multiplier, gidx, reactorPower) {
  let power_add = 0;
  let ventHeatDissipated = 0;
  let rp = reactorPower;
  const ventEntries = partLayout.filter((t) => {
    const p = partTable[t.partIndex];
    return p && partHasTrait(p, "VENT");
  });
  const stirling = Number(reactorState.stirling_multiplier ?? 0) || 0;

  for (let i = 0; i < ventEntries.length; i++) {
    const t = ventEntries[i];
    const part = partTable[t.partIndex];
    const ventRate = (t.ventRate ?? 0) * multiplier;
    if (ventRate <= 0) continue;

    const idx = gidx(t.r, t.c);
    const h = heat[idx] || 0;
    let ventReduce = Math.min(ventRate, h);
    if (part?.vent_consumes_power && ventReduce > 0 && rp) {
      const avail = rp.toNumber();
      const cap = avail < ventReduce ? avail : ventReduce;
      ventReduce = cap;
      rp = rp.sub(cap);
    }
    heat[idx] = h - ventReduce;
    ventHeatDissipated += ventReduce;

    if (stirling > 0 && ventReduce > 0) power_add += ventReduce * stirling;
  }

  return { power_add, ventHeatDissipated, reactorPower: rp };
}

const applyPowerOverflow = applyPowerOverflowCalcDecimal;

function applyReactorPowerUpdates(reactorPower, power_add, reactorState, effectiveMaxPower, multiplier, autoSell) {
  const overflowRatio = Number(reactorState.power_overflow_to_heat_ratio ?? DEFAULT_OVERFLOW_RATIO) || DEFAULT_OVERFLOW_RATIO;
  const Decimal = reactorPower.constructor;

  reactorPower = reactorPower.add(power_add);
  let result = applyPowerOverflow(reactorPower, effectiveMaxPower, overflowRatio);
  reactorPower = result.reactorPower;
  let reactorHeat = result.overflowHeat;

  const powerMult = Number(reactorState.power_multiplier ?? DEFAULT_POWER_MULTIPLIER) || DEFAULT_POWER_MULTIPLIER;
  if (powerMult !== 1) {
    reactorPower = reactorPower.add(power_add * (powerMult - 1));
    result = applyPowerOverflow(reactorPower, effectiveMaxPower, overflowRatio);
    reactorPower = result.reactorPower;
    reactorHeat = reactorHeat.add(result.overflowHeat);
  }

  let moneyEarned = new Decimal(0);
  let powerSold = new Decimal(0);
  const autoSellMult = reactorState.auto_sell_multiplier ?? 0;
  if (autoSell && autoSellMult > 0) {
    const sellCap = effectiveMaxPower.mul(autoSellMult).mul(multiplier);
    const sellAmount = Decimal.min(reactorPower, sellCap);
    if (sellAmount.gt(0)) {
      reactorPower = reactorPower.sub(sellAmount);
      powerSold = sellAmount;
      moneyEarned = sellAmount.mul(Number(reactorState.sell_price_multiplier ?? DEFAULT_SELL_PRICE_MULTIPLIER) || DEFAULT_SELL_PRICE_MULTIPLIER);
    }
  }

  if (reactorPower.gt(effectiveMaxPower)) reactorPower = effectiveMaxPower;

  return { reactorPower, reactorHeat, moneyEarned, powerSold };
}

function applyReactorHeatUpdates(reactorHeat, reactorState, maxHeat, multiplier) {
  const heatReduction = Number(reactorState.heat_controlled)
    ? (maxHeat.gt(0) ? maxHeat.div(REACTOR_HEAT_STANDARD_DIVISOR).mul(1 + (Number(reactorState.vent_multiplier_eff ?? 0) / VENT_BONUS_PERCENT_DIVISOR)).mul(multiplier) : reactorHeat.constructor(0))
    : 0;
  if (heatReduction > 0) reactorHeat = reactorHeat.sub(heatReduction).max(0);
  if (reactorHeat.lt(0)) return reactorHeat.constructor(0);
  return reactorHeat;
}

function processHeatPhase(heat, containment, payload, reactorHeat, multiplier, ctx) {
  const recordTransfers = [];
  const heatResult = runHeatStepFromTyped(heat, containment, {
    reactorHeat: reactorHeat.toNumber(),
    multiplier,
    inletsData: payload.inletsData,
    nInlets: payload.nInlets,
    valvesData: payload.valvesData,
    nValves: payload.nValves,
    valveNeighborData: payload.valveNeighborData,
    nValveNeighbors: payload.nValveNeighbors,
    exchangersData: payload.exchangersData,
    nExchangers: payload.nExchangers,
    outletsData: payload.outletsData,
    nOutlets: payload.nOutlets,
    recordTransfers
  });
  return { reactorHeat: new (reactorHeat.constructor)(heatResult.reactorHeat), heatFromInlets: heatResult.heatFromInlets ?? 0 };
}

export const SENSORY_BITMASK = {
  EXPLOSION: 1 << 0,
  MELTDOWN: 1 << 1,
  DEPLETION: 1 << 2,
  SELL_POWER: 1 << 3,
  WARNING: 1 << 4
};

function createGridContext(data) {
  const { partLayout, partTable, rows, cols, maxCols, multiplier, reactorState, autoSell, auto_buy, auto_buy_unlocked } = data;
  const stride = maxCols ?? cols;
  const { orthoOff, orthoIdx } = buildOrthoAdjacencySoa(data);
  return {
    partLayout,
    partTable,
    rows,
    cols,
    stride,
    multiplier,
    reactorState,
    autoSell,
    auto_buy: !!auto_buy,
    auto_buy_unlocked: !!auto_buy_unlocked,
    effectiveMaxPower: toDecimal(reactorState.max_power ?? 0),
    partAt: buildCellLookup(partLayout),
    gidx: (r, c) => getIndex(r, c, stride),
    orthoOff,
    orthoIdx,
  };
}

function processOneTickIteration(ctx, heat, integrity, gridLen, reactorHeat, reactorPower, moneyRef) {
  const { partLayout, partTable, rows, cols, stride, multiplier, reactorState, autoSell, effectiveMaxPower, partAt, gidx, orthoOff, orthoIdx } = ctx;
  ctx.gridPartIdx = buildGridPartIndices(partLayout, gridLen, stride);

  const containment = buildContainmentSoa(partLayout, partTable, stride, gridLen);
  const payload = buildHeatPayloadFromLayout({
    partLayout,
    partTable,
    rows,
    cols,
    heat,
    containment,
    maxCols: stride,
    orthoOff,
    orthoIdx,
  });
  const heatPhaseResult = processHeatPhase(heat, containment, payload, reactorHeat, multiplier, ctx);
  reactorHeat = heatPhaseResult.reactorHeat.add(heatPhaseResult.heatFromInlets);

  // Apply Thermal Stress
  for (let i = 0; i < gridLen; i++) {
    const cap = containment[i];
    if (cap > 0) {
      const pressure = (heat[i] || 0) / cap;
      if (pressure > 1.0) {
         integrity[i] -= (pressure - 1.0) * multiplier; // decay
         if (integrity[i] < 0) integrity[i] = 0;
         const leakage = (heat[i] - cap) * (1 - (integrity[i] / 100)) * multiplier;
         if (leakage > 0) {
            heat[i] -= leakage;
            reactorHeat = reactorHeat.add(leakage);
         }
      }
    }
  }

  const cellResult = processCells(partLayout, partTable, heat, rows, cols, stride, multiplier, partAt, gidx, moneyRef, ctx, reactorHeat);
  reactorHeat = reactorHeat.add(cellResult.heat_add);
  reactorHeat = applyHullRepulsionWorker(
    reactorHeat,
    new (reactorHeat.constructor)(reactorState.max_heat ?? 0),
    heat,
    partLayout,
    partTable,
    gidx
  );

  let hull_integrity = reactorState.hull_integrity ?? 100;
  let failure_state = "nominal";
  const maxH = new (reactorHeat.constructor)(reactorState.max_heat ?? 0);

  const explosionIndices = findExplosionIndices(partLayout, partTable, integrity, gidx);
  if (reactorHeat.gte(maxH) && maxH.gt(0)) {
    failure_state = "saturation";

    if (reactorHeat.gte(maxH.mul(1.1))) {
      failure_state = "repulsion";
      const overpressure = reactorHeat.sub(maxH.mul(1.1)).div(maxH).toNumber();
      hull_integrity = Math.max(0, hull_integrity - overpressure * 5);
    }

    if (hull_integrity <= 0 && reactorHeat.lt(maxH.mul(MELTDOWN_HEAT_MULTIPLIER))) {
      failure_state = "fragmentation";
      const validIndices = partLayout.map((t) => gidx(t.r, t.c));
      if (validIndices.length > 0 && Math.random() < 0.1) {
        explosionIndices.push(validIndices[Math.floor(Math.random() * validIndices.length)]);
      }
    }

    if (reactorHeat.gt(maxH.mul(MELTDOWN_HEAT_MULTIPLIER))) {
      failure_state = "criticality";
    }
  }

  const ventOut = processVents(partLayout, partTable, heat, reactorState, multiplier, gidx, reactorPower);
  reactorPower = ventOut.reactorPower;
  const ventPower = ventOut.power_add;

  const totalPowerAdd = cellResult.power_add + ventPower;
  if (totalPowerAdd > 0) {
    console.debug("[GameLoopWorker] power sources:", { cellPower: cellResult.power_add, ventPower, totalPowerAdd });
  }

  const powerResult = applyReactorPowerUpdates(
    reactorPower,
    cellResult.power_add + ventPower,
    reactorState,
    effectiveMaxPower,
    multiplier,
    autoSell
  );
  reactorHeat = reactorHeat.add(powerResult.reactorHeat);
  reactorHeat = applyReactorHeatUpdates(reactorHeat, reactorState, new (reactorHeat.constructor)(reactorState.max_heat ?? 0), multiplier);

  return {
    reactorHeat,
    reactorPower: powerResult.reactorPower,
    moneyEarned: powerResult.moneyEarned,
    powerSold: powerResult.powerSold?.toNumber?.() ?? Number(powerResult.powerSold ?? 0),
    ventHeatDissipated: ventOut.ventHeatDissipated,
    cellPowerAdd: cellResult.power_add,
    cellHeatAdd: cellResult.heat_add,
    explosionIndices: Array.from(new Set(explosionIndices)),
    depletionIndices: cellResult.depletionIndices,
    tileUpdates: cellResult.tileUpdates,
    hull_integrity,
    failure_state,
  };
}

function runOneTick(data) {
  const { partLayout, partTable } = data;
  const traitTallies = {};
  const partTallies = {};
  const categoryTallies = {};
  for (const t of Object.keys(TraitBitmask)) traitTallies[t] = 0;
  for (let i = 0; i < partLayout.length; i++) {
    const tile = partLayout[i];
    const part = partTable[tile.partIndex];
    if (!part) continue;
    partTallies[part.id] = (partTallies[part.id] || 0) + 1;
    categoryTallies[part.category] = (categoryTallies[part.category] || 0) + 1;
    for (const [trait, bit] of Object.entries(TraitBitmask)) {
      if ((part.trait_mask & bit) !== 0) traitTallies[trait]++;
    }
  }

  const heat = heatSoaView(data.heatBuffer);
  const integrity = data.integrityBuffer ? new Float32Array(data.integrityBuffer) : new Float32Array(heat.length).fill(100);
  const gridLen = heat.length;
  const ctx = createGridContext(data);
  const Decimal = ctx.effectiveMaxPower.constructor;
  let reactorHeat = data.reactorState.current_heat;
  let reactorPower = data.reactorState.current_power;
  if (typeof reactorHeat?.toNumber !== "function") reactorHeat = new Decimal(reactorHeat ?? 0);
  if (typeof reactorPower?.toNumber !== "function") reactorPower = new Decimal(reactorPower ?? 0);
  const powerBeforeTick = reactorPower;
  const heatBeforeTick = reactorHeat;
  const allExplosionIndices = [];
  const allDepletionIndices = [];
  const tileUpdatesMap = new Map();
  let totalMoneyEarned = new Decimal(0);
  let totalPowerSold = 0;
  let totalVentHeat = 0;
  let finalHullIntegrity = data.reactorState.hull_integrity ?? 100;
  let finalFailureState = data.reactorState.failure_state ?? "nominal";
  const isProjection = data.mode === "projection";
  const n = isProjection ? 1 : Math.max(1, data.tickCount || 1);
  const tick0 = typeof performance !== "undefined" ? performance.now() : 0;
  const rawMoney = data.current_money;
  const moneyRef = {
    value: new Decimal(rawMoney != null ? (typeof rawMoney === "number" ? rawMoney : String(rawMoney)) : 0),
    spentAutoBuy: new Decimal(0),
  };
  const prestigeMult = new Decimal(Number(data.prestigeMoneyMultiplier ?? 1) || 1);
  const initialMoneyNum = moneyRef.value.toNumber();
  let projectionPlannerSample = null;

  const intents = data.intents || [];
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    if (intent.action === "SELL_POWER") {
      if (reactorPower.gt(0)) {
        totalMoneyEarned = totalMoneyEarned.add(reactorPower.mul(data.reactorState.sell_price_multiplier || 1));
        totalPowerSold += reactorPower.toNumber();
        reactorPower = new Decimal(0);
      }
    } else if (intent.action === "VENT_HEAT") {
      if (reactorHeat.gt(0)) {
        let reduction = Number(data.reactorState.manual_heat_reduce ?? 1);
        if (data.reactorState.manual_vent_percent > 0) {
          reduction += (data.reactorState.max_heat || 1000) * data.reactorState.manual_vent_percent;
        }
        reactorHeat = reactorHeat.sub(reduction);
        if (reactorHeat.lt(0)) reactorHeat = new Decimal(0);
      }
    }
  }

  for (let tick = 0; tick < n; tick++) {
    if (tick > 0 && tick % 50 === 0 && typeof console !== "undefined" && console.info) {
      console.info("[GameLoopWorker] runOneTick progress", { tick, total: n, tickId: data.tickId });
    }
    const result = processOneTickIteration(ctx, heat, integrity, gridLen, reactorHeat, reactorPower, moneyRef);
    reactorHeat = result.reactorHeat;
    reactorPower = result.reactorPower;
    if (isProjection && tick === 0) {
      projectionPlannerSample = {
        stats_power: result.cellPowerAdd ?? 0,
        stats_net_heat: (result.cellHeatAdd ?? 0) - (result.ventHeatDissipated ?? 0),
      };
    }
    totalMoneyEarned = totalMoneyEarned.add(result.moneyEarned);
    totalPowerSold += result.powerSold || 0;
    totalVentHeat += result.ventHeatDissipated || 0;
    finalHullIntegrity = result.hull_integrity;
    finalFailureState = result.failure_state;
    if (ctx.reactorState) {
      ctx.reactorState.hull_integrity = result.hull_integrity;
      ctx.reactorState.failure_state = result.failure_state;
      
      if (result.reactorPower >= 1000) {
        ctx.reactorState.sustainedPower1kCount = (ctx.reactorState.sustainedPower1kCount || 0) + 1;
      } else {
        ctx.reactorState.sustainedPower1kCount = 0;
      }

      if (result.reactorHeat > 1e7 && result.hull_integrity > 0 && result.failure_state !== "meltdown" && result.failure_state !== "fragmentation") {
        ctx.reactorState.masterHighHeatCount = (ctx.reactorState.masterHighHeatCount || 0) + 1;
      } else {
        ctx.reactorState.masterHighHeatCount = 0;
      }
    }
    for (let e = 0; e < result.explosionIndices.length; e++) allExplosionIndices.push(result.explosionIndices[e]);
    for (let d = 0; d < result.depletionIndices.length; d++) allDepletionIndices.push(result.depletionIndices[d]);
    for (let u = 0; u < result.tileUpdates.length; u++) {
      const tu = result.tileUpdates[u];
      tileUpdatesMap.set(`${tu.r},${tu.c}`, tu);
    }
  }

  const powerDelta = reactorPower.sub(powerBeforeTick).toNumber();
  const reactorPowerNum = reactorPower.toNumber();
  const batchMs = tick0 > 0 && typeof performance !== "undefined" ? performance.now() - tick0 : 0;
  console.debug("[GameLoopWorker] runOneTick result:", {
    tickCount: n,
    powerBefore: powerBeforeTick?.toNumber?.() ?? powerBeforeTick,
    powerAfter: reactorPowerNum,
    powerDelta,
    reactorHeat: reactorHeat.toNumber()
  });
  if (typeof console !== "undefined" && console.info) {
    console.info("[GameLoopWorker] runOneTick finished", { tickId: data.tickId, innerTicks: n, batchMs: Math.round(batchMs) });
  }

  const useSAB = !!data.heatBuffer && typeof SharedArrayBuffer !== "undefined" && data.heatBuffer instanceof SharedArrayBuffer;
  let heatBufferOut = null;
  let integrityBufferOut = null;
  if (!useSAB && heat.buffer) {
    heatBufferOut = heat.buffer.slice(heat.byteOffset, heat.byteOffset + heat.byteLength);
    integrityBufferOut = integrity.buffer.slice(integrity.byteOffset, integrity.byteOffset + integrity.byteLength);
  }

  let sensoryMask = 0;
  if (allExplosionIndices.length > 0) sensoryMask |= SENSORY_BITMASK.EXPLOSION;
  if (allDepletionIndices.length > 0) sensoryMask |= SENSORY_BITMASK.DEPLETION;
  if (finalFailureState === "meltdown") sensoryMask |= SENSORY_BITMASK.MELTDOWN;
  else if (finalFailureState !== "nominal") sensoryMask |= SENSORY_BITMASK.WARNING;
  if (totalPowerSold > 0) sensoryMask |= SENSORY_BITMASK.SELL_POWER;

  const authoritativeCurrentMoney = isProjection
    ? initialMoneyNum
    : moneyRef.value.add(totalMoneyEarned.mul(prestigeMult)).toNumber();

  return {
    reactorHeat: reactorHeat.toNumber(),
    reactorPower: reactorPowerNum,
    explosionIndices: allExplosionIndices,
    depletionIndices: allDepletionIndices,
    tileUpdates: Array.from(tileUpdatesMap.values()),
    moneyEarned: isProjection ? 0 : totalMoneyEarned.toNumber(),
    authoritativeCurrentMoney,
    moneySpentAutoBuy: moneyRef.spentAutoBuy.toNumber(),
    powerSold: totalPowerSold,
    ventHeatDissipated: totalVentHeat,
    epGained: 0,
    powerDelta,
    heatDelta: reactorHeat.sub(heatBeforeTick).toNumber(),
    transfers: [],
    tickCount: n,
    heatBuffer: heatBufferOut,
    integrityBuffer: integrityBufferOut,
    useSAB,
    hull_integrity: finalHullIntegrity,
    failure_state: finalFailureState,
    sustainedPower1kCount: ctx.reactorState?.sustainedPower1kCount || 0,
    masterHighHeatCount: ctx.reactorState?.masterHighHeatCount || 0,
    sensoryMask,
    traitTallies,
    partTallies,
    categoryTallies,
    projection: isProjection ? true : undefined,
    projectionPlannerSample: isProjection ? projectionPlannerSample : undefined,
  };
}

export function attachGameLoopWorkerPort(workerGlobal) {
  let timerId = null;
  let pending = null;
  let busy = false;
  let carriedBalance = null;
  let carriedEp = null;
  const deferredEcon = [];

  function handleEconomyCommand(d) {
    const Dec = globalThis.Decimal;
    if (!Dec || d?.type !== "economyCommand") return;
    if (d.cmd === "REQUEST_TRANSACTION") {
      const Dec = globalThis.Decimal;
      const mDelta = new Dec(d.moneyDelta ?? 0);
      const eDelta = new Dec(d.epDelta ?? 0);
      const b0 = carriedBalance != null ? new Dec(carriedBalance) : new Dec(Number(d.balanceHint ?? 0));
      const ep0 = carriedEp != null ? new Dec(carriedEp) : new Dec(Number(d.epHint ?? 0));
      
      const mOk = mDelta.gte(0) || b0.gte(mDelta.abs());
      const eOk = eDelta.gte(0) || ep0.gte(eDelta.abs());
      
      const ok = mOk && eOk;
      if (ok) {
        carriedBalance = b0.add(mDelta).toNumber();
        carriedEp = ep0.add(eDelta).toNumber();
      }
      
      workerGlobal.postMessage({
        type: "economyCommandResult",
        id: d.id,
        ok,
        balanceAfter: carriedBalance,
        epAfter: carriedEp
      });
      return;
    }
    if (d.cmd === "TRY_DEDUCT") {
      const amt = new Dec(d.amount ?? 0);
      const b0 = carriedBalance != null ? new Dec(carriedBalance) : new Dec(Number(d.balanceHint ?? 0));
      const ok = amt.gt(0) && b0.gte(amt);
      const b = ok ? b0.sub(amt) : b0;
      carriedBalance = b.toNumber();
      workerGlobal.postMessage({ type: "economyCommandResult", id: d.id, ok, balanceAfter: carriedBalance });
      return;
    }
    if (d.cmd === "CREDIT") {
      const amt = new Dec(d.amount ?? 0);
      const b0 = carriedBalance != null ? new Dec(carriedBalance) : new Dec(Number(d.balanceHint ?? 0));
      const b = amt.gt(0) ? b0.add(amt) : b0;
      carriedBalance = b.toNumber();
      workerGlobal.postMessage({ type: "economyCommandResult", id: d.id, ok: true, balanceAfter: carriedBalance });
    }
  }

  function clearSimulationTimer() {
    if (timerId != null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function startSimulationTimer() {
    if (timerId != null) return;
    workerGlobal.postMessage({ type: "timerPulse" });
    timerId = setInterval(() => {
      workerGlobal.postMessage({ type: "timerPulse" });
    }, FOUNDATIONAL_TICK_MS);
  }

  function runStep() {
    const d = pending;
    pending = null;
    const isTick = d?.type === "tick";
    if (!d || !isTick) {
      busy = false;
      if (d) workerGlobal.postMessage({ type: "tickResult", tickId: d.tickId, error: true });
      return;
    }
    busy = true;
    const step0 = typeof performance !== "undefined" ? performance.now() : 0;
    if (typeof console !== "undefined" && console.info) {
      console.info("[GameLoopWorker] runStep start", { tickId: d?.tickId });
    }
    try {
      const data = d;
      const result = runOneTick(data);
      if (data.mode !== "projection") {
        carriedBalance = result.authoritativeCurrentMoney;
      }
      while (deferredEcon.length) {
        handleEconomyCommand(deferredEcon.shift());
      }
      result.type = "tickResult";
      result.tickId = data.tickId ?? d.tickId;
      const transfer = [];
      if (result.heatBuffer && !result.useSAB) transfer.push(result.heatBuffer);
      workerGlobal.postMessage(result, transfer);
      if (step0 > 0 && typeof performance !== "undefined" && typeof console !== "undefined" && console.info) {
        console.info("[GameLoopWorker] runStep posted", { tickId: result.tickId, stepMs: Math.round(performance.now() - step0) });
      }
    } catch (err) {
      deferredEcon.length = 0;
      console.error("[GameLoopWorker] runStep error:", err);
      workerGlobal.postMessage({ type: "tickResult", tickId: d?.tickId ?? 0, error: true, message: String(err?.message || err) });
    }
    busy = false;
    if (pending) runStep();
  }

  return function gameLoopPortOnMessage(e) {
    const d = e.data;
    if (d?.type === "timerControl") {
      if (d.action === "start") startSimulationTimer();
      else clearSimulationTimer();
      return;
    }
    if (d?.type === "economyCommand") {
      if (busy) {
        deferredEcon.push(d);
        return;
      }
      handleEconomyCommand(d);
      return;
    }
    const isTick = d?.type === "tick";
    if (isTick) {
      if (busy) {
        pending = d;
        if (typeof console !== "undefined" && console.info) {
          console.info("[GameLoopWorker] tick queued (worker busy)", { tickId: d?.tickId });
        }
        return;
      }
      pending = d;
      runStep();
    }
  };
}

