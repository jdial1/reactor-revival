import { runHeatStep } from "../core/heatCalculations.js";

self.onmessage = function (e) {
  const d = e.data;
  if (!d || !d.heatBuffer) {
    self.postMessage({ heatBuffer: null, reactorHeat: 0, heatFromInlets: 0 });
    return;
  }
  const heat = new Float32Array(d.heatBuffer);
  const containment = d.containmentBuffer ? new Float32Array(d.containmentBuffer) : new Float32Array(heat.length);
  const recordTransfers = [];
  const payload = {
    reactorHeat: d.reactorHeat || 0,
    multiplier: d.multiplier ?? 1,
    inlets: d.inlets || [],
    valves: d.valves || [],
    valveNeighborIndices: d.valveNeighborIndices || [],
    exchangers: d.exchangers || [],
    outlets: d.outlets || [],
    recordTransfers
  };
  const result = runHeatStep(heat, containment, payload);
  self.postMessage(
    { heatBuffer: heat.buffer, reactorHeat: result.reactorHeat, heatFromInlets: result.heatFromInlets, transfers: recordTransfers },
    [heat.buffer]
  );
};
