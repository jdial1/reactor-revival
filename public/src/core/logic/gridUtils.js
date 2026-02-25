export { getIndex, isInBounds } from "./gridMath.js";

export function getNeighborKeys(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}

export function areAdjacent(tile1, tile2) {
  if (!tile1 || !tile2) return false;
  const dx = Math.abs(tile1.col - tile2.col);
  const dy = Math.abs(tile1.row - tile2.row);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

export function applyPowerOverflowCalc(reactorPower, effectiveMaxPower, overflowRatio) {
  if (reactorPower <= effectiveMaxPower) return { reactorPower, overflowHeat: 0 };
  const overflow = reactorPower - effectiveMaxPower;
  return { reactorPower: effectiveMaxPower, overflowHeat: overflow * overflowRatio };
}

export function clampHeat(heat, maxHeat) {
  if (heat > maxHeat && maxHeat > 0) return maxHeat;
  if (heat < 0) return 0;
  return heat;
}
