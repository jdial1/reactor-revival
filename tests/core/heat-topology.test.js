import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

function refreshHeatSegments(game) {
  game.engine.markPartCacheAsDirty();
  game.engine._updatePartCaches();
  game.engine.heatManager.markSegmentsAsDirty();
}

const toNum = (v) => (v != null && typeof v.toNumber === "function" ? v.toNumber() : Number(v));

describe("Heat Network Topology", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.gridManager.setRows(14);
    game.gridManager.setCols(8);
    game.base_rows = 14;
    game.base_cols = 8;
    game.tileset.updateActiveTiles();
  });

  it("dimension consistency on non-square grid", async () => {
    await placePart(game, 9, 4, "uranium1");
    await placePart(game, 10, 4, "vent1");

    expect(game.rows).toBe(14);
    expect(game.cols).toBe(8);
    expect(game.tileset.getTile(9, 4)).toBeTruthy();
    expect(game.tileset.active_tiles_list.length).toBe(112);
  });

  it("containmentNeighborTiles with single vent", async () => {
    const cellTile = await placePart(game, 9, 4, "uranium1");
    await placePart(game, 10, 4, "vent1");

    cellTile._neighborCache = null;
    const neighbors = cellTile.containmentNeighborTiles;

    expect(neighbors.length).toBe(1);
    expect(neighbors[0].row).toBe(10);
    expect(neighbors[0].col).toBe(4);
    expect(neighbors[0].part?.category).toBe("vent");
  });

  it("ticks decrement after tick with vent neighbor", async () => {
    const cellTile = await placePart(game, 9, 4, "uranium1");
    await placePart(game, 10, 4, "vent1");

    cellTile.ticks = 120;
    const part = game.partset.getPartById("uranium1");
    if (part?.base_ticks) cellTile.ticks = part.base_ticks;

    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();
    game.engine.manualTick();

    expect(cellTile.ticks).toBeLessThan(120);
  });

  it("reactor stats valid after tile placement", async () => {
    await placePart(game, 9, 4, "uranium1");
    await placePart(game, 10, 4, "vent1");

    game.reactor.updateStats();

    expect(game.reactor.max_heat.gt(0)).toBe(true);
    expect(game.reactor.max_power.gt(0)).toBe(true);
  });

  it("active_cells includes cell after dimension change", async () => {
    const cellTile = await placePart(game, 9, 4, "uranium1");

    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();

    expect(game.engine.active_cells).toContain(cellTile);
  });

  it("heat flows to vent when cell has one neighbor", async () => {
    const cellTile = await placePart(game, 9, 4, "uranium1");
    await placePart(game, 10, 4, "vent1");

    const ticksBefore = cellTile.ticks;
    game.engine.manualTick();

    expect(cellTile.ticks).toBe(ticksBefore - 1);
    expect(game.reactor.has_melted_down).toBe(false);
  });

  it("getTile returns null for out-of-bounds", () => {
    expect(game.tileset.getTile(9, 4)).toBeTruthy();
    expect(game.tileset.getTile(14, 0)).toBeNull();
    expect(game.tileset.getTile(0, 8)).toBeNull();
  });

  it("gridIndex consistent across tileset and worker stride", () => {
    expect(game.tileset.gridIndex(9, 4)).toBe(9 * 50 + 4);
    expect(game.tileset.gridIndex(9, 4)).toBe(454);
  });

  it("union-find merges two vent segments when a conducting tile bridges them", async () => {
    const leftVent = await placePart(game, 9, 4, "vent1");
    const rightVent = await placePart(game, 11, 4, "vent1");
    refreshHeatSegments(game);
    const hm = game.engine.heatManager;
    expect(hm.getSegmentForTile(leftVent)).not.toBe(hm.getSegmentForTile(rightVent));
    await placePart(game, 10, 4, "heat_exchanger1");
    refreshHeatSegments(game);
    expect(hm.getSegmentForTile(leftVent)).toBe(hm.getSegmentForTile(rightVent));
  });

  it("union-find splits one segment when the keystone bridge tile is sold", async () => {
    await placePart(game, 9, 4, "vent1");
    const mid = await placePart(game, 10, 4, "heat_exchanger1");
    const rightVent = await placePart(game, 11, 4, "vent1");
    refreshHeatSegments(game);
    const hm = game.engine.heatManager;
    expect(hm.getSegmentForTile(mid)).toBe(hm.getSegmentForTile(rightVent));
    game.sellPart(mid);
    refreshHeatSegments(game);
    const left = game.tileset.getTile(9, 4);
    const right = game.tileset.getTile(11, 4);
    expect(hm.getSegmentForTile(left)).not.toBe(hm.getSegmentForTile(right));
  });

  it("segment fullnessRatio aggregates heat across merged components", async () => {
    const v1 = await placePart(game, 5, 2, "vent1");
    const v2 = await placePart(game, 5, 4, "vent1");
    await placePart(game, 5, 3, "heat_exchanger1");
    v1.heat_contained = 100;
    v2.heat_contained = 100;
    refreshHeatSegments(game);
    const seg = game.engine.heatManager.getSegmentForTile(v1);
    expect(seg.components.length).toBe(3);
    expect(seg.totalHeat).toBe(200);
    expect(seg.fullnessRatio).toBeGreaterThan(0);
  });
});
