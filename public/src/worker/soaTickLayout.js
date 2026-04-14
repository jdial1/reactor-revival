import { getIndex } from "../utils.js";

export function buildContainmentSoa(partLayout, partTable, stride, gridLen) {
  const containment = new Float32Array(gridLen);
  for (let i = 0; i < partLayout.length; i++) {
    const t = partLayout[i];
    const part = partTable[t.partIndex];
    if (part?.containment) containment[getIndex(t.r, t.c, stride)] = part.containment;
  }
  return containment;
}

export function buildOrthoAdjacencySoa(data) {
  if (!data.orthoNeighborOffsets || !data.orthoNeighborIndices) {
    return { orthoOff: null, orthoIdx: null };
  }
  return {
    orthoOff: new Int32Array(data.orthoNeighborOffsets),
    orthoIdx: new Int32Array(data.orthoNeighborIndices),
  };
}

export function heatSoaView(heatBuffer) {
  return new Float32Array(heatBuffer);
}
