import { isInBounds } from "./simUtils.js";

export function computeWorkerNeighborPulseN(r, c, partTable, partAt, rows, cols) {
  const self = partAt(r, c);
  if (!self) return 0;
  const cp = partTable[self.partIndex];
  if (!cp || cp.category !== "cell") return 0;
  const range = cp.range ?? 1;
  const topo = cp.topologyType || "Manhattan";
  const coords = topologyNeighborCoords(topo, r, c, range, rows, cols);
  let N = 0;
  for (let i = 0; i < coords.length; i++) {
    const [nr, nc] = coords[i];
    const nb = partAt(nr, nc);
    if (!nb) continue;
    const np = partTable[nb.partIndex];
    if (!np) continue;
    if (np.category === "cell" && (nb.ticks ?? 0) > 0) N += np.cell_count || 1;
    if (np.category === "reflector" && (nb.ticks ?? 0) > 0) {
      const v = np.neighbor_pulse_value;
      N += typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
    }
  }
  return N;
}

export const TOPOLOGY_TYPES = ["Manhattan", "Orthogonal", "Cross", "Radial", "Global"];

export function topologyNeighborCoords(topologyType, row, col, range, rows, cols) {
  const t = topologyType || "Manhattan";
  const rng = Math.ceil(Math.max(1, Number(range) || 1));
  const out = [];
  if (t === "Global") {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r !== row || c !== col) out.push([r, c]);
      }
    }
    return out;
  }
  if (t === "Cross") {
    for (let c = 0; c < cols; c++) {
      if (c !== col) out.push([row, c]);
    }
    for (let r = 0; r < rows; r++) {
      if (r !== row) out.push([r, col]);
    }
    return out;
  }
  for (let dr = -rng; dr <= rng; dr++) {
    for (let dc = -rng; dc <= rng; dc++) {
      if (dr === 0 && dc === 0) continue;
      let valid = false;
      if (t === "Manhattan") valid = Math.abs(dr) + Math.abs(dc) <= rng;
      else if (t === "Radial") valid = Math.hypot(dr, dc) <= rng + 1e-9;
      else if (t === "Orthogonal") valid = Math.abs(dr) + Math.abs(dc) === 1;
      else valid = Math.abs(dr) + Math.abs(dc) <= rng; // default to Manhattan

      if (valid && isInBounds(row + dr, col + dc, rows, cols)) {
        out.push([row + dr, col + dc]);
      }
    }
  }
  return out;
}

export const Topology = {
  Manhattan: (row, col, range, rows, cols) => topologyNeighborCoords("Manhattan", row, col, range, rows, cols),
  Orthogonal: (row, col, _range, rows, cols) => topologyNeighborCoords("Orthogonal", row, col, 1, rows, cols),
  Cross: (row, col, _range, rows, cols) => topologyNeighborCoords("Cross", row, col, 1, rows, cols),
  Radial: (row, col, range, rows, cols) => topologyNeighborCoords("Radial", row, col, range, rows, cols),
  Global: (row, col, _range, rows, cols) => topologyNeighborCoords("Global", row, col, 1, rows, cols),
};

