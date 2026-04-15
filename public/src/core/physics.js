import { HEAT_TRANSFER_DIFF_DIVISOR } from "../utils.js";

export function compileAdjacency(rows, cols) {
  const len = rows * cols;
  const offsets = new Int32Array(len + 1);
  const indices = [];
  for (let i = 0; i < len; i++) {
    offsets[i] = indices.length;
    const r = (i / cols) | 0;
    const c = i % cols;
    if (r > 0) indices.push(i - cols);
    if (r + 1 < rows) indices.push(i + cols);
    if (c > 0) indices.push(i - 1);
    if (c + 1 < cols) indices.push(i + 1);
  }
  offsets[len] = indices.length;
  return { offsets, indices: new Int32Array(indices) };
}

export function tickSubstrate(grid, topology, modifiers) {
  const { type, heat, containment, pBase, hBase, packM, countC } = grid;
  const { offsets, indices } = topology;
  const len = type.length;

  let tickPower = 0;
  let tickVented = 0;

  for (let i = 0; i < len; i++) {
    if (type[i] !== 1) continue;

    let N = 0;
    const start = offsets[i];
    const end = offsets[i + 1];
    for (let j = start; j < end; j++) {
      const nIdx = indices[j];
      if (type[nIdx] === 1) N += countC[nIdx];
      if (type[nIdx] === 2) N += modifiers.reflectorBonus[nIdx] || 1;
    }

    const pulse = Math.max(1, packM[i] + N);
    const pGen = modifiers.powerMult * pBase[i] * pulse;
    tickPower += pGen;

    const c = Math.max(1, countC[i]);
    const hGen = (modifiers.powerMult * hBase[i] * (pulse * pulse)) / c;
    heat[i] += hGen;
  }

  for (let i = 0; i < len; i++) {
    const t = type[i];
    if (t === 4) { // Thermal Bus (Exchanger/Inlet/Outlet)
      const start = offsets[i];
      const end = offsets[i + 1];
      const maxTransfer = modifiers.transferRate[i] * modifiers.powerMult;
      const direction = modifiers.type4Bidirectional[i]; // 0: both, 1: pull, 2: push
      for (let j = start; j < end; j++) {
        const nIdx = indices[j];
        const diff = heat[nIdx] - heat[i];
        if (diff > 1e-7 && direction !== 2) { // Pull from neighbor
          const flow = Math.min(diff / HEAT_TRANSFER_DIFF_DIVISOR, maxTransfer);
          heat[nIdx] -= flow; heat[i] += flow;
        } else if (diff < -1e-7 && direction !== 1) { // Push to neighbor
          const flow = Math.min(-diff / HEAT_TRANSFER_DIFF_DIVISOR, maxTransfer);
          heat[i] -= flow; heat[nIdx] += flow;
        }
      }
    } else if (t === 5) {
      const start = offsets[i];
      const end = offsets[i + 1];
      const maxFlow = modifiers.transferRate[i] * modifiers.powerMult;
      for (let j = start; j < end; j++) {
        const nIdx = indices[j];
        const diff = heat[nIdx] - heat[i];
        if (diff > 1e-7) {
          const pull = Math.min(diff * 0.5, maxFlow);
          heat[nIdx] -= pull; heat[i] += pull;
        } else if (diff < 0) {
          const push = Math.min(-diff * 0.5, maxFlow);
          heat[i] -= push; heat[nIdx] += push;
        }
      }
    }
  }

  return { tickPower, tickVented };
}

export function tickVentLayer(grid, topology, modifiers) {
  const { type, heat } = grid;
  const { offsets, indices } = topology;
  const len = type.length;
  let tickVented = 0;
  for (let i = 0; i < len; i++) {
    if (type[i] !== 3) continue;
    const cooling = Math.min(heat[i], modifiers.ventRate[i] * modifiers.powerMult);
    heat[i] -= cooling;
    tickVented += cooling;
  }
  return { tickVented };
}
