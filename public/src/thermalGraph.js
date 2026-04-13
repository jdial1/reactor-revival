import { isInBounds, getIndex } from "./utils.js";

export function buildThermalPressureEdges(partLayout, partTable, partAt, rows, cols, stride) {
  const edges = [];
  const seen = new Set();
  const pushEdge = (a, b, rate) => {
    if (a === b) return;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: a, to: b, rate });
  };
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const p = partTable[t.partIndex];
    if (!p?.containment) continue;
    const idx = getIndex(t.r, t.c, stride);
    const rate = Math.max(0, t.transferRate ?? p.transfer ?? 0);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let d = 0; d < dirs.length; d++) {
      const nr = t.r + dirs[d][0];
      const nc = t.c + dirs[d][1];
      if (!isInBounds(nr, nc, rows, cols)) continue;
      const nb = partAt(nr, nc);
      if (!nb) continue;
      const np = partTable[nb.partIndex];
      if (!np?.containment) continue;
      const nidx = getIndex(nr, nc, stride);
      const r = rate > 0 ? rate : Math.max(0, np.transfer ?? 0);
      if (r > 0) pushEdge(idx, nidx, r);
    }
  }
  return edges;
}

export function solveThermalGraphSinglePass(heat, containment, edges, multiplier) {
  const n = heat.length;
  const pressure = new Float32Array(n);
  const cap = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    cap[i] = containment[i] || 0;
    pressure[i] = cap[i] > 0 ? heat[i] / cap[i] : 0;
  }
  const delta = new Float32Array(n);
  for (let e = 0; e < edges.length; e++) {
    const { from, to, rate } = edges[e];
    const dP = pressure[from] - pressure[to];
    if (dP <= 0) continue;
    const hFrom = heat[from] || 0;
    const flow = Math.min(rate * multiplier, dP * hFrom);
    if (flow <= 0 || !isFinite(flow)) continue;
    delta[from] -= flow;
    delta[to] += flow;
  }
  for (let i = 0; i < n; i++) {
    heat[i] = Math.max(0, (heat[i] || 0) + delta[i]);
  }
}
