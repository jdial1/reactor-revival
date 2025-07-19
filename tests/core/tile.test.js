import { describe, it, expect, beforeEach } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Tile Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should set and clear parts correctly, handling money", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");

    await tile.setPart(part);
    expect(tile.part).toBe(part);
    expect(tile.activated).toBe(true);
    expect(tile.ticks).toBe(part.ticks);

    const moneyBeforeSell = game.current_money;
    tile.clearPart(true); // refund = true

    expect(tile.part).toBeNull();
    expect(game.current_money).toBe(moneyBeforeSell + part.cost);
  });

  it("should clear a part without a refund", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);

    const moneyBeforeClear = game.current_money;
    tile.clearPart(false); // refund = false

    expect(tile.part).toBeNull();
    expect(game.current_money).toBe(moneyBeforeClear);
  });

  it("should calculate partial refund for damaged parts", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);

    tile.ticks = part.ticks / 2;
    const moneyBeforeSell = game.current_money;
    const expectedRefund = Math.ceil(part.cost * (tile.ticks / part.ticks));

    tile.clearPart(true);

    expect(game.current_money).toBe(moneyBeforeSell + expectedRefund);
  });

  it("should not allow overwriting existing parts", async () => {
    const tile = game.tileset.getTile(0, 0);
    const firstPart = game.partset.getPartById("uranium1");
    const secondPart = game.partset.getPartById("vent1");

    // Place the first part
    await tile.setPart(firstPart);
    expect(tile.part).toBe(firstPart);
    expect(tile.part.id).toBe("uranium1");

    // Attempt to place a second part - this should not overwrite the first
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
    const ventTile = game.tileset.getTile(0, 0);
    const ventPart = game.partset.getPartById("vent1");
    await ventTile.setPart(ventPart);

    const initialVentValue = ventTile.getEffectiveVentValue();
    expect(initialVentValue).toBe(ventPart.vent);

    const ventUpgrade = game.upgradeset.getUpgrade("improved_heat_vents");
    game.upgradeset.purchaseUpgrade(ventUpgrade.id);

    const expectedValue = ventPart.vent * Math.pow(2, ventUpgrade.level);
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
