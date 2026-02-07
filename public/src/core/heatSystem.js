import { runHeatStep } from "./heatCalculations.js";

export class HeatSystem {
  constructor(engine) {
    this.engine = engine;
    this.segments = new Map();
    this.tileSegmentMap = new Map();
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
    const result = runHeatStep(heat, containment, { ...rest, recordTransfers });
    engine.game.tileset.heatMap = heat;
    engine.game.reactor.current_heat = result.reactorHeat;
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_heat_transfer");
    }
    game.logger?.debug(`[TICK STAGE] After heat transfer: Reactor Heat = ${result.reactorHeat.toFixed(2)}`);
    return { heatFromInlets: result.heatFromInlets, transfers: recordTransfers };
  }

  updateSegments() {}

  markSegmentsAsDirty() {}

  getSegmentForTile() {
    return null;
  }
}
