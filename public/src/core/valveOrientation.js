export function getValveOrientation(valveId, cache) {
  let orientation = cache.get(valveId);
  if (orientation !== undefined) return orientation;
  const match = valveId.match(/(\d+)$/);
  orientation = match ? parseInt(match[1]) : 1;
  cache.set(valveId, orientation);
  return orientation;
}

function getTwoNeighborOrientation(neighbors, orientation) {
  const a = neighbors[0];
  const b = neighbors[1];
  const isAFirst = (orientation === 1 || orientation === 3) ? (a.col < b.col) : (a.row < b.row);
  const first = isAFirst ? a : b;
  const last = isAFirst ? b : a;
  const invert = orientation === 3 || orientation === 4;
  return {
    inputNeighbor: invert ? last : first,
    outputNeighbor: invert ? first : last,
  };
}

function getSortedNeighborOrientation(neighbors, orientation) {
  const sorted = [...neighbors].sort((a, b) =>
    (orientation === 1 || orientation === 3) ? (a.col - b.col) : (a.row - b.row)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const invert = orientation === 3 || orientation === 4;
  return {
    inputNeighbor: invert ? last : first,
    outputNeighbor: invert ? first : last,
  };
}

export function getInputOutputNeighbors(valve, neighbors, orientation) {
  if (neighbors.length < 2) {
    return { inputNeighbor: null, outputNeighbor: null };
  }
  const routing = neighbors.length === 2
    ? getTwoNeighborOrientation(neighbors, orientation)
    : getSortedNeighborOrientation(neighbors, orientation);
  return { inputNeighbor: routing.inputNeighbor, outputNeighbor: routing.outputNeighbor };
}
