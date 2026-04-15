import { tickSubstrate, tickVentLayer } from "../core/physics.js";

let grid = null;
let topology = null;
const modifiers = { powerMult: 1, ventRate: null, transferRate: null, type4Bidirectional: null };

self.onmessage = (e) => {
  const { type, payload } = e.data;
  if (type === "INIT") {
    grid = payload.grid;
    topology = payload.topology;
    const n = grid.type.length;
    modifiers.ventRate = new Float64Array(n);
    modifiers.transferRate = new Float64Array(n);
    modifiers.type4Bidirectional = new Uint8Array(n);
    return;
  }
  if (type === "TICK_SYNC") {
    let totalPower = 0;
    let totalVented = 0;
    const steps = payload.steps ?? 0;
    processIntents(payload.intents);
    for (let i = 0; i < steps; i++) {
      const { tickPower } = tickSubstrate(grid, topology, modifiers);
      const { tickVented } = tickVentLayer(grid, topology, modifiers);
      totalPower += tickPower;
      totalVented += tickVented;
    }
    self.postMessage({ type: "TICK_RESULT", payload: { power: totalPower, heatVented: totalVented } });
  }
};

function processIntents(intents) {
  if (!intents || !grid) return;
  for (const intent of intents) {
    if (intent.action !== "PLACE_PART") continue;
    const p = intent.payload || {};
    const part = p.part;
    const i = p.idx;
    if (part == null || i == null || i < 0 || i >= grid.type.length) continue;
    grid.type[i] = part.id;
    grid.pBase[i] = part.pBase;
    grid.hBase[i] = part.hBase;
    grid.packM[i] = part.packM;
    grid.countC[i] = part.countC;
    modifiers.ventRate[i] = part.vent ?? 0;
    modifiers.transferRate[i] = part.transfer ?? 0;
    const cat = part.category;
    let dir = 0;
    if (cat === "heat_inlet") dir = 1;
    if (cat === "heat_outlet") dir = 2;
    modifiers.type4Bidirectional[i] = dir;
  }
}
