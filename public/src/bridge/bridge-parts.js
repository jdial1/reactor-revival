export function bumpGridPartsRevision(tileset) {
  if (!tileset) return;
  tileset._partsRevision = (tileset._partsRevision ?? 0) + 1;
  const engine = tileset.game?.engine;
  if (engine) engine._workerPartSnapshotCache = null;
}
