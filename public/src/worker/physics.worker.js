import { runHeatStepFromTyped } from "../core/heatCalculations.js";

let pending = null;
let busy = false;

function runOneTick(d, heat, containment, recordTransfers, initialReactorHeat) {
  const inletsData = d.inletsData ? new Float32Array(d.inletsData) : new Float32Array(0);
  const valvesData = d.valvesData ? new Float32Array(d.valvesData) : new Float32Array(0);
  const valveNeighborData = d.valveNeighborData ? new Float32Array(d.valveNeighborData) : new Float32Array(0);
  const exchangersData = d.exchangersData ? new Float32Array(d.exchangersData) : new Float32Array(0);
  const outletsData = d.outletsData ? new Float32Array(d.outletsData) : new Float32Array(0);
  const payload = {
    reactorHeat: initialReactorHeat,
    multiplier: d.multiplier ?? 1,
    inletsData,
    nInlets: d.nInlets | 0,
    valvesData,
    nValves: d.nValves | 0,
    valveNeighborData,
    nValveNeighbors: d.nValveNeighbors | 0,
    exchangersData,
    nExchangers: d.nExchangers | 0,
    outletsData,
    nOutlets: d.nOutlets | 0
  };
  return runHeatStepFromTyped(heat, containment, payload, recordTransfers);
}

function finishAndPost(heat, containment, result, recordTransfers, tickId, useSAB, lastMessage) {
  const explosionIndices = [];
  for (let i = 0; i < heat.length; i++) {
    const cap = containment[i] || 0;
    if (cap > 0 && heat[i] > cap) explosionIndices.push(i);
  }
  const response = {
    reactorHeat: result.reactorHeat,
    heatFromInlets: result.heatFromInlets,
    transfers: recordTransfers,
    explosionIndices,
    tickId
  };
  if (useSAB) {
    response.useSAB = true;
    self.postMessage(response);
  } else {
    response.heatBuffer = heat.buffer;
    response.containmentBuffer = containment.buffer;
    response.inletsData = lastMessage.inletsData;
    response.valvesData = lastMessage.valvesData;
    response.valveNeighborData = lastMessage.valveNeighborData;
    response.exchangersData = lastMessage.exchangersData;
    response.outletsData = lastMessage.outletsData;
    const transferList = [
      heat.buffer,
      containment.buffer,
      lastMessage.inletsData,
      lastMessage.valvesData,
      lastMessage.valveNeighborData,
      lastMessage.exchangersData,
      lastMessage.outletsData
    ].filter(Boolean);
    self.postMessage(response, transferList);
  }
}

function processOne(d, heat, containment, recordTransfers, initialReactorHeat) {
  const result = runOneTick(d, heat, containment, recordTransfers, initialReactorHeat);
  return { result, lastMessage: d };
}

function runStep() {
  const d = pending;
  pending = null;
  if (!d || !d.heatBuffer) {
    busy = false;
    self.postMessage({ heatBuffer: null, reactorHeat: 0, heatFromInlets: 0, tickId: d?.tickId });
    return;
  }
  const heat = new Float32Array(d.heatBuffer);
  const containment = d.containmentBuffer ? new Float32Array(d.containmentBuffer) : new Float32Array(heat.length);
  const recordTransfers = [];
  let out = processOne(d, heat, containment, recordTransfers, d.reactorHeat || 0);
  function continueOrPost() {
    if (pending !== null) {
      const next = pending;
      pending = null;
      out = processOne(next, heat, containment, recordTransfers, out.result.reactorHeat);
      setTimeout(continueOrPost, 0);
      return;
    }
    finishAndPost(heat, containment, out.result, recordTransfers, out.lastMessage.tickId, d.useSAB === true, out.lastMessage);
    busy = false;
  }
  setTimeout(continueOrPost, 0);
}

self.onmessage = function (e) {
  const d = e.data;
  if (busy) {
    pending = d;
    return;
  }
  busy = true;
  pending = d;
  runStep();
};
