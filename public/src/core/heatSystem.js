import { runHeatStepFromTyped } from "./heatCalculations.js";

const HEAT_CONDUCTING_CATEGORIES = ['heat_exchanger', 'heat_outlet', 'heat_inlet'];

function isHeatConducting(tile) {
  if (!tile?.part || !tile.activated) return false;
  const p = tile.part;
  return (p.containment ?? 0) > 0 || HEAT_CONDUCTING_CATEGORIES.includes(p.category);
}

export class HeatSystem {
  constructor(engine) {
    this.engine = engine;
    this.segments = new Map();
    this.tileSegmentMap = new Map();
    this._segmentsDirty = true;
    this._parent = new Map();
  }

  processTick(multiplier = 1.0) {
    const engine = this.engine;
    const build = engine._buildHeatPayload(multiplier);
    if (!build?.payloadForSync) return { heatFromInlets: 0, transfers: [] };
    const game = engine.game;
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_heat_transfer");
    }
    const { heat, containment, ...rest } = build.payloadForSync;
    const recordTransfers = [];
    const result = runHeatStepFromTyped(heat, containment, rest, recordTransfers);
    engine.game.tileset.heatMap = heat;
    engine.game.reactor.current_heat = result.reactorHeat;
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_heat_transfer");
    }
    game.logger?.debug(`[TICK STAGE] After heat transfer: Reactor Heat = ${result.reactorHeat.toFixed(2)}`);
    return { heatFromInlets: result.heatFromInlets, transfers: recordTransfers };
  }

  markSegmentsAsDirty() {
    this._segmentsDirty = true;
  }

  _find(tile) {
    let p = this._parent.get(tile);
    if (p === undefined) return tile;
    if (p === tile) return tile;
    const root = this._find(p);
    this._parent.set(tile, root);
    return root;
  }

  _union(a, b) {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra !== rb) this._parent.set(ra, rb);
  }

  updateSegments() {
    if (!this._segmentsDirty) return;
    this._segmentsDirty = false;
    this.segments.clear();
    this.tileSegmentMap.clear();
    this._parent.clear();

    const game = this.engine.game;
    const tiles = game.tileset?.active_tiles_list ?? [];
    const heatTiles = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (isHeatConducting(t)) heatTiles.push(t);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      this._parent.set(tile, tile);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const neighbors = tile.containmentNeighborTiles ?? [];
      for (let j = 0; j < neighbors.length; j++) {
        const n = neighbors[j];
        if (isHeatConducting(n)) this._union(tile, n);
      }
    }

    const rootToTiles = new Map();
    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const root = this._find(tile);
      let arr = rootToTiles.get(root);
      if (!arr) {
        arr = [];
        rootToTiles.set(root, arr);
      }
      arr.push(tile);
    }

    for (const [, components] of rootToTiles) {
      let totalHeat = 0;
      let totalContainment = 0;
      const vents = [];
      const outlets = [];
      const inlets = [];
      for (let i = 0; i < components.length; i++) {
        const t = components[i];
        const part = t.part;
        const cap = part?.containment ?? 0;
        const heat = t.heat_contained ?? 0;
        totalHeat += heat;
        totalContainment += cap;
        if (part?.category === 'vent') vents.push(t);
        else if (part?.category === 'heat_outlet') outlets.push(t);
        else if (part?.category === 'heat_inlet') inlets.push(t);
      }
      const fullnessRatio = totalContainment > 0 ? totalHeat / totalContainment : 0;
      const segment = {
        components,
        vents,
        outlets,
        inlets,
        fullnessRatio,
        totalHeat,
        totalContainment
      };
      this.segments.set(this.segments.size, segment);
      for (let i = 0; i < components.length; i++) {
        this.tileSegmentMap.set(components[i], segment);
      }
    }
  }

  getSegmentForTile(tile) {
    if (!tile) return null;
    if (this._segmentsDirty) this.updateSegments();
    return this.tileSegmentMap.get(tile) ?? null;
  }
}
