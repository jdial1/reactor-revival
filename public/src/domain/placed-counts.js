export function recalculatePlacedCountsFromGrid(game) {
  if (!game) return {};
  const counts = {};
  const tiles = game.tileset?.tiles_list;
  if (!Array.isArray(tiles)) {
    game.placedCounts = counts;
    return counts;
  }
  for (let i = 0; i < tiles.length; i++) {
    const part = tiles[i]?.part;
    if (!part) continue;
    const key = `${part.type}:${part.level}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  game.placedCounts = counts;
  return counts;
}
