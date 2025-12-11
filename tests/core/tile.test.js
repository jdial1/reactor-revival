import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../helpers/gameHelpers.js";

describe("Tile Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should set and clear parts correctly, handling money", async () => {
    const tile = await placePart(game, 0, 0, "uranium1");
    const part = tile.part;

    const moneyBeforeSell = game.current_money;
    tile.clearPart(true); // refund = true

    expect(tile.part).toBeNull();
    expect(game.current_money).toBe(moneyBeforeSell + part.cost);
  });

  it("should clear a part without a refund", async () => {
    const tile = await placePart(game, 0, 0, "uranium1");
    const moneyBeforeClear = game.current_money;
    game.handleComponentDepletion(tile);

    expect(tile.part).toBeNull();
    expect(game.current_money).toBe(moneyBeforeClear);
  });

  it("should calculate partial refund for damaged parts", async () => {
    const tile = await placePart(game, 0, 0, "uranium1");
    const part = tile.part;
    tile.ticks = part.ticks / 2;
    const moneyBeforeSell = game.current_money;
    const expectedRefund = Math.ceil(part.cost * (tile.ticks / part.ticks));

    tile.clearPart(true);

    expect(game.current_money).toBe(moneyBeforeSell + expectedRefund);
  });

  it("should not allow overwriting existing parts", async () => {
    const tile = await placePart(game, 0, 0, "uranium1");
    const firstPart = tile.part;
    const secondPart = game.partset.getPartById("vent1");

    await tile.setPart(secondPart);

    // The first part should still be there, not overwritten
    expect(tile.part).toBe(firstPart);
    expect(tile.part.id).toBe("uranium1");
    expect(tile.part.id).not.toBe("vent1");
  });

  it("should return false when trying to place part on occupied tile", async () => {
    const tile = game.tileset.getTile(0, 0);
    const firstPart = game.partset.getPartById("uranium1");
    const secondPart = game.partset.getPartById("vent1");

    // Place the first part
    const firstResult = await tile.setPart(firstPart);
    expect(firstResult).toBe(true);
    expect(tile.part).toBe(firstPart);

    // Try to place a second part - should return false
    const secondResult = await tile.setPart(secondPart);
    expect(secondResult).toBe(false);
    expect(tile.part).toBe(firstPart); // First part should still be there
  });

  it("should calculate effective vent value with upgrades", async () => {
    const ventTile = await placePart(game, 0, 0, "vent1");
    const initialVentValue = ventTile.getEffectiveVentValue();
    expect(initialVentValue).toBe(ventTile.part.vent);

    forcePurchaseUpgrade(game, "improved_heat_vents");

    const ventUpgrade = game.upgradeset.getUpgrade("improved_heat_vents");
    const expectedValue = ventTile.part.base_vent * (1 + ventUpgrade.level);
    expect(ventTile.getEffectiveVentValue()).toBe(expectedValue);
  });

  it("should be enabled or disabled based on game dimensions", () => {
    const tileInside = game.tileset.getTile(0, 0);
    const tileOutside = game.tileset.tiles[game.base_rows][game.base_cols]; // Get a tile outside the initial grid

    expect(tileInside.enabled).toBe(true);
    expect(tileOutside.enabled).toBe(false);

    game.rows = game.base_rows + 1;
    game.cols = game.base_cols + 1;
    game.tileset.updateActiveTiles();

    expect(tileOutside.enabled).toBe(true);
  });
});
