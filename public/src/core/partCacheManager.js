export function ensureArraysValid(engine) {
  if (!Array.isArray(engine.active_cells)) engine.active_cells = [];
  if (!Array.isArray(engine.active_vessels)) engine.active_vessels = [];
  if (!Array.isArray(engine.active_inlets)) engine.active_inlets = [];
  if (!Array.isArray(engine.active_exchangers)) engine.active_exchangers = [];
  if (!Array.isArray(engine.active_outlets)) engine.active_outlets = [];
}

export function updatePartCaches(engine) {
  if (!engine._partCacheDirty) return;
  ensureArraysValid(engine);

  engine.active_cells.length = 0;
  engine.active_vessels.length = 0;
  engine.active_inlets.length = 0;
  engine.active_exchangers.length = 0;
  engine.active_outlets.length = 0;
  engine.active_valves.length = 0;
  engine.active_vents.length = 0;
  engine.active_capacitors.length = 0;

  for (let row = 0; row < engine.game._rows; row++) {
    for (let col = 0; col < engine.game._cols; col++) {
      const tile = engine.game.tileset.getTile(row, col);
      if (!tile?.part) continue;

      const part = tile.part;
      const k = part.getCacheKinds(tile);
      if (k.cells) engine.active_cells.push(tile);
      if (k.inlets) engine.active_inlets.push(tile);
      if (k.exchangers) engine.active_exchangers.push(tile);
      if (k.valves) engine.active_valves.push(tile);
      if (k.outlets) engine.active_outlets.push(tile);
      if (k.vents) engine.active_vents.push(tile);
      if (k.capacitors) engine.active_capacitors.push(tile);
      if (k.vessels) engine.active_vessels.push(tile);
    }
  }

  engine._partCacheDirty = false;
}

export function updateValveNeighborCache(engine) {
  if (!engine._valveNeighborCacheDirty) return;

  engine._valveNeighborCache.clear();

  if (engine._partCacheDirty) {
    updatePartCaches(engine);
  }

  if (!Array.isArray(engine.active_exchangers)) {
    engine.active_exchangers = [];
  }

  for (let i = 0; i < engine.active_valves.length; i++) {
    const tile = engine.active_valves[i];
    const neighbors = tile.containmentNeighborTiles;
    for (let j = 0; j < neighbors.length; j++) {
      const neighbor = neighbors[j];
      if (neighbor.part) {
        const nk = neighbor.part.getCacheKinds(neighbor);
        if (!nk.valves) engine._valveNeighborCache.add(neighbor);
      }
    }
  }

  engine._valveNeighborCacheDirty = false;
}
