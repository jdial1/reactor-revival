export function classifyTile(tile) {
  if (!tile?.part) {
    return { cells: false, inlets: false, exchangers: false, valves: false, outlets: false, vents: false, capacitors: false, vessels: false };
  }
  return tile.part.getCacheKinds(tile);
}

function buildValveNeighborCache(activeValves) {
  const valveNeighborCache = new Set();
  for (let i = 0; i < activeValves.length; i++) {
    const tile = activeValves[i];
    const neighbors = tile.containmentNeighborTiles;
    for (let j = 0; j < neighbors.length; j++) {
      const neighbor = neighbors[j];
      if (neighbor.part) {
        const nk = classifyTile(neighbor);
        if (!nk.valves) valveNeighborCache.add(neighbor);
      }
    }
  }
  return valveNeighborCache;
}

export function deriveActivePartsFromGrid(tileset) {
  const active_cells = [];
  const active_vessels = [];
  const active_inlets = [];
  const active_exchangers = [];
  const active_outlets = [];
  const active_valves = [];
  const active_vents = [];
  const active_capacitors = [];

  const tiles = tileset.active_tiles_list;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile?.part) continue;
    tile.recalculateEffectiveValues();
    const k = classifyTile(tile);
    if (k.cells) active_cells.push(tile);
    if (k.inlets) active_inlets.push(tile);
    if (k.exchangers) active_exchangers.push(tile);
    if (k.valves) active_valves.push(tile);
    if (k.outlets) active_outlets.push(tile);
    if (k.vents) active_vents.push(tile);
    if (k.capacitors) active_capacitors.push(tile);
    if (k.vessels) active_vessels.push(tile);
  }

  return {
    active_cells,
    active_vessels,
    active_inlets,
    active_exchangers,
    active_outlets,
    active_valves,
    active_vents,
    active_capacitors,
    valveNeighborCache: buildValveNeighborCache(active_valves),
  };
}

export function bumpGridPartsRevision(tileset) {
  if (!tileset) return;
  tileset._partsRevision = (tileset._partsRevision ?? 0) + 1;
}

export function invalidateTickParts(engine) {
  if (engine) engine._tickParts = null;
}

export function ensureTickParts(engine) {
  const tileset = engine.game?.tileset;
  const revision = tileset?._partsRevision ?? 0;
  const tickId = engine.tick_count;
  const cached = engine._tickParts;
  if (cached && cached.tickId === tickId && cached.revision === revision) return cached;

  engine._valveOrientationCache?.clear?.();
  const derived = deriveActivePartsFromGrid(tileset);
  engine._tickParts = { tickId, revision, ...derived };
  return engine._tickParts;
}

export function getTickPartList(engine, key) {
  return ensureTickParts(engine)[key] ?? [];
}

export function getValveNeighborCache(engine) {
  return ensureTickParts(engine).valveNeighborCache ?? new Set();
}

export function syncActivePartsAtTickBoundary(engine) {
  invalidateTickParts(engine);
  engine._valveOrientationCache?.clear?.();
  return ensureTickParts(engine);
}
