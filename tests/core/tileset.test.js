import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Tileset Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should initialize a grid of tiles", () => {
    expect(game.tileset.tiles.length).toBe(game.tileset.max_rows);
    expect(game.tileset.tiles[0].length).toBe(game.tileset.max_cols);
    expect(game.tileset.tiles_list.length).toBe(
      game.tileset.max_rows * game.tileset.max_cols
    );
  });

  it("should get a specific tile by its coordinates", () => {
    const tile = game.tileset.getTile(5, 8);
    expect(tile).toBeDefined();
    expect(tile.row).toBe(5);
    expect(tile.col).toBe(8);
  });

  it("should return null for out-of-bounds coordinates", () => {
    const tile = game.tileset.getTile(game.rows, game.cols);
    expect(tile).toBeNull();
  });

  it("should correctly identify active tiles based on game dimensions", () => {
    game.rows = 2;
    game.cols = 2;
    game.tileset.updateActiveTiles();
    expect(game.tileset.active_tiles_list.length).toBe(4);
    expect(game.tileset.getTile(0, 0).enabled).toBe(true);
    expect(game.tileset.getTile(1, 1).enabled).toBe(true);
    expect(game.tileset.tiles[2][2].enabled).toBe(false); // Check a tile that is now inactive
  });

  it("should get all neighboring tiles in a given range (von Neumann)", () => {
    const centerTile = game.tileset.getTile(5, 5);
    const neighbors = Array.from(game.tileset.getTilesInRange(centerTile, 1));
    expect(neighbors.length).toBe(4);
    const neighborCoords = neighbors.map((t) => [t.row, t.col]);
    expect(neighborCoords).toContainEqual([4, 5]);
    expect(neighborCoords).toContainEqual([6, 5]);
    expect(neighborCoords).toContainEqual([5, 4]);
    expect(neighborCoords).toContainEqual([5, 6]);
  });

  it("should clear all parts from all tiles", async () => {
    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(1, 1);
    await tile1.setPart(game.partset.getPartById("uranium1"));
    await tile2.setPart(game.partset.getPartById("vent1"));

    game.tileset.clearAllTiles();

    expect(tile1.part).toBeNull();
    expect(tile2.part).toBeNull();
  });
});
