import { runHeatStepFromTyped } from "../core/heatCalculations.js";
import { buildHeatPayloadFromLayout } from "./buildHeatPayloadFromLayout.js";

const REFLECTOR_RANGE = 1;

function gridIndex(r, c, maxCols) {
  return r * maxCols + c;
}

function getNeighborKeys(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}

function runOneTick(data) {
  const { heatBuffer, partLayout, partTable, reactorState, multiplier, rows, cols, maxCols, autoSell, tickCount: numTicks } = data;
  const heat = new Float32Array(heatBuffer);
  const gridLen = heat.length;
  const stride = maxCols ?? cols;
  let reactorHeat = Number(reactorState.current_heat ?? 0);
  let reactorPower = Number(reactorState.current_power ?? 0);
  const powerBeforeTick = reactorPower;
  const heatBeforeTick = reactorHeat;
  const allExplosionIndices = [];
  const allDepletionIndices = [];
  const tileUpdatesMap = new Map();
  let totalMoneyEarned = 0;
  const n = Math.max(1, numTicks || 1);

  for (let tick = 0; tick < n; tick++) {
    const containment = new Float32Array(gridLen);
    for (let i = 0; i < partLayout.length; i++) {
      const t = partLayout[i];
      const part = partTable[t.partIndex];
      if (part?.containment) containment[gridIndex(t.r, t.c, stride)] = part.containment;
    }
    const payload = buildHeatPayloadFromLayout(partLayout, partTable, rows, cols, heat, containment, stride);
    const recordTransfers = [];
    const heatResult = runHeatStepFromTyped(heat, containment, {
      reactorHeat,
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
    reactorHeat = heatResult.reactorHeat;
    let heatFromInlets = heatResult.heatFromInlets ?? 0;

  const cellByKey = new Map();
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    cellByKey.set(`${t.r},${t.c}`, { ...t, layoutIndex: i });
  }
  const partAt = (r, c) => cellByKey.get(`${r},${c}`);
  const gidx = (r, c) => gridIndex(r, c, stride);

  let power_add = 0;
  let heat_add = heatFromInlets;
  const depletionIndices = [];
  const tileUpdates = [];

  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (!part || part.category !== "cell" || t.ticks <= 0) continue;
    power_add += (part.power ?? 0) * multiplier;
    const generatedHeat = (part.heat ?? 0) * multiplier;
    const neighbors = getNeighborKeys(t.r, t.c).filter(([nr, nc]) => nr >= 0 && nr < rows && nc >= 0 && nc < cols && partAt(nr, nc));
    let validCount = 0;
    for (let k = 0; k < neighbors.length; k++) {
      const [nr, nc] = neighbors[k];
      const nPart = partTable[partAt(nr, nc).partIndex];
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

    reactorHeat += heat_add;

    const explosionIndices = [];
    for (let i = 0; i < partLayout.length; i++) {
      const t = partLayout[i];
      const part = partTable[t.partIndex];
      if (!part?.containment) continue;
      const idx = gidx(t.r, t.c);
      if (heat[idx] > part.containment) explosionIndices.push(idx);
    }
    for (let e = 0; e < explosionIndices.length; e++) allExplosionIndices.push(explosionIndices[e]);
    for (let d = 0; d < depletionIndices.length; d++) allDepletionIndices.push(depletionIndices[d]);
    for (let u = 0; u < tileUpdates.length; u++) tileUpdatesMap.set(`${tileUpdates[u].r},${tileUpdates[u].c}`, tileUpdates[u]);

    const ventEntries = partLayout.filter((t) => partTable[t.partIndex]?.category === "vent");
    for (let i = 0; i < ventEntries.length; i++) {
      const t = ventEntries[i];
      const ventRate = (t.ventRate ?? 0) * multiplier;
      if (ventRate <= 0) continue;
      const idx = gidx(t.r, t.c);
      const h = heat[idx] || 0;
      const ventReduce = Math.min(ventRate, h);
      heat[idx] = h - ventReduce;
      const stirling = Number(reactorState.stirling_multiplier ?? 0) || 0;
      if (stirling > 0 && ventReduce > 0) power_add += ventReduce * stirling;
    }

    const effectiveMaxPower = Number(reactorState.max_power ?? 0);
    reactorPower += power_add;
    if (reactorPower > effectiveMaxPower) {
      const overflow = reactorPower - effectiveMaxPower;
      const toHeat = (Number(reactorState.power_overflow_to_heat_ratio ?? 0.5) || 0.5) * overflow;
      reactorHeat += toHeat;
      reactorPower = effectiveMaxPower;
    }
    const powerMult = Number(reactorState.power_multiplier ?? 1) || 1;
    if (powerMult !== 1) {
      reactorPower += power_add * (powerMult - 1);
      if (reactorPower > effectiveMaxPower) {
        const overflow = reactorPower - effectiveMaxPower;
        reactorHeat += overflow * (Number(reactorState.power_overflow_to_heat_ratio ?? 0.5) || 0.5);
        reactorPower = effectiveMaxPower;
      }
    }

    let moneyEarned = 0;
    if (autoSell && (reactorState.auto_sell_multiplier ?? 0) > 0) {
      const sellCap = effectiveMaxPower * (reactorState.auto_sell_multiplier ?? 0) * multiplier;
      const sellAmount = Math.min(reactorPower, sellCap);
      if (sellAmount > 0) {
        reactorPower -= sellAmount;
        moneyEarned = sellAmount * (Number(reactorState.sell_price_multiplier ?? 1) || 1);
      }
    }
    totalMoneyEarned += moneyEarned;
    if (reactorPower > effectiveMaxPower) reactorPower = effectiveMaxPower;

    const heatReduction = Number(reactorState.heat_controlled) ? (effectiveMaxPower ? (effectiveMaxPower / 10000) * (1 + (Number(reactorState.vent_multiplier_eff ?? 0) / 100)) * multiplier : 0) : 0;
    if (heatReduction > 0) reactorHeat = Math.max(0, reactorHeat - heatReduction);
    const maxHeat = Number(reactorState.max_heat ?? 0);
    if (reactorHeat > maxHeat && maxHeat > 0) reactorHeat = maxHeat;
    if (reactorHeat < 0) reactorHeat = 0;
  }

  const tileUpdates = Array.from(tileUpdatesMap.values());
  const powerDelta = reactorPower - powerBeforeTick;
  const heatDelta = reactorHeat - heatBeforeTick;

  return {
    reactorHeat,
    reactorPower,
    explosionIndices: allExplosionIndices,
    depletionIndices: allDepletionIndices,
    tileUpdates,
    moneyEarned: totalMoneyEarned,
    epGained: 0,
    powerDelta,
    heatDelta,
    transfers: [],
    tickCount: n
  };
}

let pending = null;
let busy = false;

function runStep() {
  const d = pending;
  pending = null;
  if (!d || d.type !== "tick") {
    busy = false;
    if (d) self.postMessage({ type: "tickResult", tickId: d.tickId, error: true });
    return;
  }
  busy = true;
  try {
    const result = runOneTick(d);
    result.type = "tickResult";
    result.tickId = d.tickId;
    result.useSAB = !!d.heatBuffer && typeof SharedArrayBuffer !== "undefined" && d.heatBuffer instanceof SharedArrayBuffer;
    self.postMessage(result);
  } catch (err) {
    self.postMessage({ type: "tickResult", tickId: d.tickId, error: true, message: String(err?.message || err) });
  }
  busy = false;
  if (pending) runStep();
}

self.onmessage = function (e) {
  const d = e.data;
  if (d?.type === "tick") {
    if (busy) {
      pending = d;
      return;
    }
    pending = d;
    runStep();
  }
};
