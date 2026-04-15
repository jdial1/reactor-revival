export function decodeGridIndex(nidx, stride) {
  return { r: (nidx / stride) | 0, c: nidx % stride };
}

export class SpatialRegistry {
  constructor() {
    this.rows = 0;
    this.cols = 0;
    this.stride = 0;
    this.gridLen = 0;
    this.neighborOffsets = null;
    this.neighborIndices = null;
    this.offsetsBuffer = null;
    this.indicesBuffer = null;
  }

  resize(newRows, newCols, newStride, newGridLen) {
    if (this.rows === newRows && this.cols === newCols && this.stride === newStride && this.gridLen === newGridLen) {
      return false; // No change
    }

    const offsetsSize = newGridLen + 1;
    // Maximum possible edges for orthogonal is 4 * newRows * newCols
    const maxEdges = 4 * newRows * newCols;

    const useSAB = typeof SharedArrayBuffer !== "undefined";
    const newOffsetsBuffer = useSAB ? new SharedArrayBuffer(offsetsSize * 4) : new ArrayBuffer(offsetsSize * 4);
    const newIndicesBuffer = useSAB ? new SharedArrayBuffer(maxEdges * 4) : new ArrayBuffer(maxEdges * 4);

    const newNeighborOffsets = new Int32Array(newOffsetsBuffer);
    const newNeighborIndices = new Int32Array(newIndicesBuffer);
    
    let edgeCount = 0;

    for (let gidx = 0; gidx < newGridLen; gidx++) {
      newNeighborOffsets[gidx] = edgeCount;
      const r = (gidx / newStride) | 0;
      const c = gidx % newStride;
      if (r >= newRows || c >= newCols) continue;
      
      if (r > 0) newNeighborIndices[edgeCount++] = gidx - newStride;
      if (r + 1 < newRows) newNeighborIndices[edgeCount++] = gidx + newStride;
      if (c > 0) newNeighborIndices[edgeCount++] = gidx - 1;
      if (c + 1 < newCols) newNeighborIndices[edgeCount++] = gidx + 1;
    }
    
    newNeighborOffsets[newGridLen] = edgeCount;

    this.rows = newRows;
    this.cols = newCols;
    this.stride = newStride;
    this.gridLen = newGridLen;
    
    this.offsetsBuffer = newOffsetsBuffer;
    this.indicesBuffer = newIndicesBuffer;
    this.neighborOffsets = newNeighborOffsets;
    // Truncate view to actual edges used
    this.neighborIndices = new Int32Array(newIndicesBuffer, 0, edgeCount);
    
    return true;
  }
}
