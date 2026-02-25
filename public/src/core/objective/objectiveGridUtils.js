export function checkVentNextToCell(game) {
  return game.tileset.active_tiles_list.some((tile) => {
    if (tile?.part?.category === "cell" && tile.ticks > 0) {
      for (const neighbor of game.tileset.getTilesInRange(tile, 1)) {
        if (neighbor?.part?.category === "vent") return true;
      }
    }
    return false;
  });
}
