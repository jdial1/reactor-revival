import { syncGridCheap } from "./bridge-grid-sync.js";

export function classifyTile(tile) {
  if (!tile?.part) {
    return { cells: false, inlets: false, exchangers: false, valves: false, outlets: false, vents: false, capacitors: false, vessels: false };
  }
  return tile.part.getCacheKinds(tile);
}

function tilesFromActiveEntries(tileset, entries) {
  const out = [];
  if (!tileset || !Array.isArray(entries)) return out;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const tile = tileset.getTile(e.row, e.col);
    if (tile) out.push(tile);
  }
  return out;
}

export function bumpGridPartsRevision(tileset) {
  if (!tileset) return;
  tileset._partsRevision = (tileset._partsRevision ?? 0) + 1;
  const engine = tileset.game?.engine;
  if (engine) {
    engine._workerPartSnapshotCache = null;
    engine._tickNeighborViews = null;
    invalidateTickParts(engine);
  }
}

export function invalidateTickParts(engine) {
  if (!engine) return;
  engine._tickParts = null;
  engine._tickNeighborViews = null;
}

export function getTickPartList(engine, key) {
  const game = engine?.game;
  const bridge = game?.coreBridge;
  const tileset = game?.tileset;
  if (bridge?.isActive && bridge.session?.getActivePartList && tileset) {
    syncGridCheap(bridge);
    return tilesFromActiveEntries(tileset, bridge.session.getActivePartList(key));
  }
  return [];
}

export function getValveNeighborCache(engine) {
  const game = engine?.game;
  const bridge = game?.coreBridge;
  const tileset = game?.tileset;
  if (bridge?.isActive && bridge.session?.getActiveParts && tileset) {
    syncGridCheap(bridge);
    const derived = bridge.session.getActiveParts();
    const set = new Set();
    const keys = derived?.valveNeighborKeys;
    if (keys) {
      for (const key of keys) {
        const [r, c] = String(key).split(",").map(Number);
        const tile = tileset.getTile(r, c);
        if (tile) set.add(tile);
      }
    }
    return set;
  }
  return new Set();
}

export function syncActivePartsAtTickBoundary(engine) {
  invalidateTickParts(engine);
  engine._valveOrientationCache?.clear?.();
  getTickPartList(engine, "active_cells");
  return engine._tickParts;
}

export function ensureTickParts(engine) {
  return {
    active_cells: getTickPartList(engine, "active_cells"),
    active_vessels: getTickPartList(engine, "active_vessels"),
    active_inlets: getTickPartList(engine, "active_inlets"),
    active_exchangers: getTickPartList(engine, "active_exchangers"),
    active_outlets: getTickPartList(engine, "active_outlets"),
    active_valves: getTickPartList(engine, "active_valves"),
    active_vents: getTickPartList(engine, "active_vents"),
    active_capacitors: getTickPartList(engine, "active_capacitors"),
    valveNeighborCache: getValveNeighborCache(engine),
  };
}
