import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

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
});
