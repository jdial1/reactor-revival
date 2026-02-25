export function countTilesByCategory(game, category) {
  return game.tileset.getAllTiles?.()
    ? game.tileset.getAllTiles().filter((t) => t.part?.category === category).length
    : game.tileset.tiles_list.filter((t) => t.part?.category === category).length;
}

export function countActiveCellsByCategory(game, category) {
  return game.tileset.tiles_list.filter((t) => t.part?.category === category && t.ticks > 0).length;
}

export function countTilesByType(game, type) {
  return game.tileset.getAllTiles?.()
    ? game.tileset.getAllTiles().filter((t) => t.part?.type === type).length
    : game.tileset.tiles_list.filter((t) => t.part?.type === type).length;
}
