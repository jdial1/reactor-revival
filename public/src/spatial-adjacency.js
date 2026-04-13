import { getIndex } from "./utils.js";

export function buildOrthogonalAdjacencyCSR(rows, cols, stride, gridLen) {
  const neighborOffsets = new Int32Array(gridLen + 1);
  const temp = [];
  for (let gidx = 0; gidx < gridLen; gidx++) {
    neighborOffsets[gidx] = temp.length;
    const r = (gidx / stride) | 0;
    const c = gidx % stride;
    if (r >= rows || c >= cols) continue;
    if (r > 0) temp.push(gidx - stride);
    if (r + 1 < rows) temp.push(gidx + stride);
    if (c > 0) temp.push(gidx - 1);
    if (c + 1 < cols) temp.push(gidx + 1);
  }
  neighborOffsets[gridLen] = temp.length;
  const neighborIndices = new Int32Array(temp.length);
  for (let i = 0; i < temp.length; i++) neighborIndices[i] = temp[i];
  return { neighborOffsets, neighborIndices };
}

export function adjacencyKey(rows, cols, stride, gridLen) {
  return `${rows}|${cols}|${stride}|${gridLen}`;
}

export function decodeGridIndex(nidx, stride) {
  return { r: (nidx / stride) | 0, c: nidx % stride };
}
