import "../../lib/break_infinity.min.js";
import "../config/superjsonSetup.js";
import superjson from "superjson";
import { runHeatStepFromTyped } from "../core/heatCalculations.js";
import { buildHeatPayloadFromLayout } from "./buildHeatPayloadFromLayout.js";
import {
  REACTOR_HEAT_STANDARD_DIVISOR,
  DEFAULT_OVERFLOW_RATIO,
  DEFAULT_POWER_MULTIPLIER,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  VENT_BONUS_PERCENT_DIVISOR,
} from "../core/constants.js";
import { getIndex, isInBounds } from "../core/logic/gridUtils.js";
import { getNeighborKeys, applyPowerOverflowCalcDecimal, clampHeatDecimal } from "../core/logic/gridUtils.js";

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

    power_add += (part.power ?? 0) * multiplier;
    const generatedHeat = (part.heat ?? 0) * multiplier;
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
    effectiveMaxPower: Number(reactorState.max_power ?? 0),
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

  return {
    reactorHeat: reactorHeat.toNumber(),
    reactorPower: reactorPower.toNumber(),
    explosionIndices: allExplosionIndices,
    depletionIndices: allDepletionIndices,
    tileUpdates: Array.from(tileUpdatesMap.values()),
    moneyEarned: totalMoneyEarned.toNumber(),
    epGained: 0,
    powerDelta: reactorPower.sub(powerBeforeTick).toNumber(),
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
    self.postMessage(result);
  } catch (err) {
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
