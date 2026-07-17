export function getNeighborKeys(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}

export function areAdjacent(tile1, tile2) {
  if (!tile1 || !tile2) return false;
  const dx = Math.abs(tile1.col - tile2.col);
  const dy = Math.abs(tile1.row - tile2.row);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}
