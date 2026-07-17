export function getCompactLayout(game) {
  if (!game.tileset || !game.tileset.tiles_list) return null;
  const rows = game.rows;
  const cols = game.cols;
  const parts = [];
  game.tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) {
      parts.push({
        r: tile.row,
        c: tile.col,
        t: tile.part.type,
        id: tile.part.id,
        lvl: tile.part.level || 1,
      });
    }
  });
  return { size: { rows, cols }, parts };
}

export function countPlacedParts(game, type, level) {
  if (!game.tileset || !game.tileset.tiles_list) return 0;
  let count = 0;
  for (const tile of game.tileset.tiles_list) {
    const tilePart = tile.part;
    if (tilePart && tilePart.type === type && tilePart.level === level) {
      count++;
    }
  }
  return count;
}

export function serializeReactor(game) {
  const layout = getCompactLayout(game);
  if (!layout) return "";
  return JSON.stringify(layout, null, 2);
}
