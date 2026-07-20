export function resetHeatThresholdSignalState(game) {
  if (!game?.state || typeof game.state !== "object") return;
  game.state._firstHighHeatSeen = false;
  if (game.ui?.uiState) {
    game.ui.uiState.heat_critical = false;
    game.ui.uiState.pipe_integrity_warning = false;
  }
}

export function isHeatNetBalanced(netHeat, heatGeneration) {
  const net = Number(netHeat);
  const gen = Number(heatGeneration);
  return Number.isFinite(net) && net <= 0 && Number.isFinite(gen) && gen > 0;
}

export function clearTileExplodingFlags(game) {
  const tiles = game?.tileset?.active_tiles_list;
  if (!tiles) return;
  for (let i = 0; i < tiles.length; i++) tiles[i].exploding = false;
}

export function clearHeatVisualStates(game) {
  clearTileExplodingFlags(game);
  game?.emit?.("heatWarningCleared");
}
