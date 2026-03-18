import "../../lib/break_infinity.min.js";
import "../utils/utils_constants.js";
import superjson from "superjson";
import {
  runHeatStepFromTyped,
  INLET_STRIDE, INLET_OFFSET_INDEX, INLET_OFFSET_RATE, INLET_OFFSET_N_COUNT, INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE, VALVE_OFFSET_INDEX, VALVE_OFFSET_TYPE, VALVE_OFFSET_ORIENTATION, VALVE_OFFSET_RATE, VALVE_OFFSET_INPUT_IDX, VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE, EXCHANGER_OFFSET_INDEX, EXCHANGER_OFFSET_RATE, EXCHANGER_OFFSET_CONTAINMENT, EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES, EXCHANGER_OFFSET_NEIGHBOR_CAPS, EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE, OUTLET_OFFSET_INDEX, OUTLET_OFFSET_RATE, OUTLET_OFFSET_ACTIVATED, OUTLET_OFFSET_IS_OUTLET6, OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES, OUTLET_OFFSET_NEIGHBOR_CAPS,
  MAX_NEIGHBORS,
} from "../core/heat_system.js";
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
  isInBounds,
  getNeighborKeys,
  applyPowerOverflowCalcDecimal,
  clampHeatDecimal,
} from "../utils/utils_constants.js";
import { toDecimal } from "../utils/utils_constants.js";

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

function buildHeatPayloadFromLayout(layoutContext) {
  const { partLayout, partTable, rows, cols, heat, containment } = layoutContext;
  const stride = layoutContext.maxCols ?? cols;
  const { partAt, gidx } = buildPayloadCellLookup(partLayout, stride);
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

function buildContainmentArray(partLayout, partTable, stride, gridLen) {
  const containment = new Float32Array(gridLen);
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (part?.containment) containment[getIndex(t.r, t.c, stride)] = part.containment;
  }
  return containment;
}

function buildCellLookup(partLayout) {
  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    cellByKey.set(`${t.r},${t.c}`, { ...t, layoutIndex: i });
  }
  return (r, c) => cellByKey.get(`${r},${c}`);
}

function processCells(partLayout, partTable, heat, rows, cols, stride, multiplier, partAt, gidx) {
  let power_add = 0;
  let heat_add = 0;
  const depletionIndices = [];
  const tileUpdates = [];
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || part.category !== "cell" || t.ticks <= 0) continue;

    const layoutPower = (typeof t.power === "number" && !isNaN(t.power) && isFinite(t.power))
      ? t.power
      : ((typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power)) ? part.power : (part.base_power ?? 0));
    power_add += layoutPower * multiplier;
    const layoutHeat = (typeof t.heat === "number" && !isNaN(t.heat) && isFinite(t.heat))
      ? t.heat
      : (part.heat ?? 0);
    const generatedHeat = layoutHeat * multiplier;
    const neighbors = getNeighborKeys(t.r, t.c).filter(([nr, nc]) => isInBounds(nr, nc, rows, cols) && partAt(nr, nc));

    let validCount = 0;
    for (let k = 0; k < neighbors.length; k++) {
      const nPart = partTable[partAt(neighbors[k][0], neighbors[k][1]).partIndex];
      if (nPart?.containment > 0) validCount++;
    }

    if (validCount > 0) {
      const perN = generatedHeat / validCount;
      for (let k = 0; k < neighbors.length; k++) {
        const [nr, nc] = neighbors[k];
        const nPart = partTable[partAt(nr, nc).partIndex];
        if (nPart?.containment > 0) {
          const idx = gidx(nr, nc);
          heat[idx] = (heat[idx] || 0) + perN;
        }
      }
    } else {
      heat_add += generatedHeat;
    }

    t.ticks = (t.ticks ?? 0) - multiplier;
    tileUpdates.push({ r: t.r, c: t.c, ticks: t.ticks });
    if (t.ticks <= 0) depletionIndices.push(gidx(t.r, t.c));
  }

  if (power_add > 0 || depletionIndices.length > 0) {
    const cellCount = partLayout.filter((t) => partTable[t.partIndex]?.category === "cell" && (t.ticks ?? 0) > 0).length;
    console.debug("[GameLoopWorker] processCells:", { power_add, heat_add, cellCount, depletionCount: depletionIndices.length });
  }
  return { power_add, heat_add, depletionIndices, tileUpdates };
}

function findExplosionIndices(partLayout, partTable, heat, gidx) {
  const explosionIndices = [];
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part?.containment) continue;
    const idx = gidx(t.r, t.c);
    if (heat[idx] > part.containment) explosionIndices.push(idx);
  }
  return explosionIndices;
}

function processVents(partLayout, partTable, heat, reactorState, multiplier, gidx) {
  let power_add = 0;
  const ventEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "vent");
  const stirling = Number(reactorState.stirling_multiplier ?? 0) || 0;

  for (let i = 0; i < ventEntries.length; i++) {
    const t = ventEntries[i];
    const ventRate = (t.ventRate ?? 0) * multiplier;
    if (ventRate <= 0) continue;

    const idx = gidx(t.r, t.c);
    const h = heat[idx] || 0;
    const ventReduce = Math.min(ventRate, h);
    heat[idx] = h - ventReduce;

    if (stirling > 0 && ventReduce > 0) power_add += ventReduce * stirling;
  }

  return power_add;
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
  const autoSellMult = reactorState.auto_sell_multiplier ?? 0;
  if (autoSell && autoSellMult > 0) {
    const sellCap = effectiveMaxPower.mul(autoSellMult).mul(multiplier);
    const sellAmount = Decimal.min(reactorPower, sellCap);
    if (sellAmount.gt(0)) {
      reactorPower = reactorPower.sub(sellAmount);
      moneyEarned = sellAmount.mul(Number(reactorState.sell_price_multiplier ?? DEFAULT_SELL_PRICE_MULTIPLIER) || DEFAULT_SELL_PRICE_MULTIPLIER);
    }
  }

  if (reactorPower.gt(effectiveMaxPower)) reactorPower = effectiveMaxPower;

  return { reactorPower, reactorHeat, moneyEarned };
}

function applyReactorHeatUpdates(reactorHeat, reactorState, maxHeat, multiplier) {
  const heatReduction = Number(reactorState.heat_controlled)
    ? (maxHeat.gt(0) ? maxHeat.div(REACTOR_HEAT_STANDARD_DIVISOR).mul(1 + (Number(reactorState.vent_multiplier_eff ?? 0) / VENT_BONUS_PERCENT_DIVISOR)).mul(multiplier) : reactorHeat.constructor(0))
    : 0;
  if (heatReduction > 0) reactorHeat = reactorHeat.sub(heatReduction).max(0);
  return clampHeatDecimal(reactorHeat, maxHeat);
}

function processHeatPhase(heat, containment, payload, reactorHeat, multiplier) {
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

function createGridContext(data) {
  const { partLayout, partTable, rows, cols, maxCols, multiplier, reactorState, autoSell } = data;
  const stride = maxCols ?? cols;
  return {
    partLayout,
    partTable,
    rows,
    cols,
    stride,
    multiplier,
    reactorState,
    autoSell,
    effectiveMaxPower: toDecimal(reactorState.max_power ?? 0),
    partAt: buildCellLookup(partLayout),
    gidx: (r, c) => getIndex(r, c, stride),
  };
}

function processOneTickIteration(ctx, heat, gridLen, reactorHeat, reactorPower) {
  const { partLayout, partTable, rows, cols, stride, multiplier, reactorState, autoSell, effectiveMaxPower, partAt, gidx } = ctx;

  const containment = buildContainmentArray(partLayout, partTable, stride, gridLen);
  const payload = buildHeatPayloadFromLayout({ partLayout, partTable, rows, cols, heat, containment, maxCols: stride });
  const heatPhaseResult = processHeatPhase(heat, containment, payload, reactorHeat, multiplier);
  reactorHeat = heatPhaseResult.reactorHeat.add(heatPhaseResult.heatFromInlets);

  const cellResult = processCells(partLayout, partTable, heat, rows, cols, stride, multiplier, partAt, gidx);
  reactorHeat = reactorHeat.add(cellResult.heat_add);

  const explosionIndices = findExplosionIndices(partLayout, partTable, heat, gidx);
  const ventPower = processVents(partLayout, partTable, heat, reactorState, multiplier, gidx);

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
    explosionIndices,
    depletionIndices: cellResult.depletionIndices,
    tileUpdates: cellResult.tileUpdates,
  };
}

function runOneTick(data) {
  const heat = new Float32Array(data.heatBuffer);
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
  const n = Math.max(1, data.tickCount || 1);

  for (let tick = 0; tick < n; tick++) {
    const result = processOneTickIteration(ctx, heat, gridLen, reactorHeat, reactorPower);
    reactorHeat = result.reactorHeat;
    reactorPower = result.reactorPower;
    totalMoneyEarned = totalMoneyEarned.add(result.moneyEarned);
    for (let e = 0; e < result.explosionIndices.length; e++) allExplosionIndices.push(result.explosionIndices[e]);
    for (let d = 0; d < result.depletionIndices.length; d++) allDepletionIndices.push(result.depletionIndices[d]);
    for (let u = 0; u < result.tileUpdates.length; u++) {
      const tu = result.tileUpdates[u];
      tileUpdatesMap.set(`${tu.r},${tu.c}`, tu);
    }
  }

  const powerDelta = reactorPower.sub(powerBeforeTick).toNumber();
  const reactorPowerNum = reactorPower.toNumber();
  console.debug("[GameLoopWorker] runOneTick result:", {
    tickCount: n,
    powerBefore: powerBeforeTick?.toNumber?.() ?? powerBeforeTick,
    powerAfter: reactorPowerNum,
    powerDelta,
    reactorHeat: reactorHeat.toNumber()
  });

  return {
    reactorHeat: reactorHeat.toNumber(),
    reactorPower: reactorPowerNum,
    explosionIndices: allExplosionIndices,
    depletionIndices: allDepletionIndices,
    tileUpdates: Array.from(tileUpdatesMap.values()),
    moneyEarned: totalMoneyEarned.toNumber(),
    epGained: 0,
    powerDelta,
    heatDelta: reactorHeat.sub(heatBeforeTick).toNumber(),
    transfers: [],
    tickCount: n
  };
}

let pending = null;
let busy = false;

function runStep() {
  const d = pending;
  pending = null;
  const isSuperjson = d?.json != null && d?.meta != null;
  const isTick = d?.type === "tick" || isSuperjson;
  if (!d || !isTick) {
    busy = false;
    if (d) self.postMessage({ type: "tickResult", tickId: d.tickId, error: true });
    return;
  }
  busy = true;
  try {
    const data = isSuperjson ? { ...superjson.deserialize({ json: d.json, meta: d.meta }), heatBuffer: d.heatBuffer } : d;
    const result = runOneTick(data);
    result.type = "tickResult";
    result.tickId = data.tickId ?? d.tickId;
    result.useSAB = !!data.heatBuffer && typeof SharedArrayBuffer !== "undefined" && data.heatBuffer instanceof SharedArrayBuffer;
    console.debug("[GameLoopWorker] postMessage tickResult:", { tickId: result.tickId, reactorPower: result.reactorPower, powerDelta: result.powerDelta });
    self.postMessage(result);
  } catch (err) {
    console.error("[GameLoopWorker] runStep error:", err);
    self.postMessage({ type: "tickResult", tickId: d?.tickId ?? 0, error: true, message: String(err?.message || err) });
  }
  busy = false;
  if (pending) runStep();
}

self.onmessage = function (e) {
  const d = e.data;
  const isTick = d?.type === "tick" || (d?.json != null && d?.meta != null);
  if (isTick) {
    if (busy) {
      pending = d;
      return;
    }
    pending = d;
    runStep();
  }
};
