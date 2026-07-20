export function bumpSnapshotRev(game) {
  const uiState = game?.ui?.uiState;
  if (!uiState) return;
  uiState.snapshot_rev = (uiState.snapshot_rev | 0) + 1;
}
