import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Reflector Heat Bonus Bug", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should not allow negative heat multipliers from reflectors", async () => {
    // Set up a cell tile
    const cellTile = game.tileset.getTile(0, 0);
    const cell = game.partset.getPartById("uranium1");
    await cellTile.setPart(cell);
    cellTile.activated = true;
    cellTile.ticks = 10;

    // Create a mock reflector with negative heat_increase
    // We'll manually set this to simulate the bug
    const reflectorTile = game.tileset.getTile(0, 1);
    const mockPart = {
      id: "mock_reflector",
      category: "reflector",
      power_increase: 5,
      heat_increase: -200,  // This should cause a problem
      range: 1,
      ticks: 100,
      getImagePath: () => "",
    };
    reflectorTile.part = mockPart;
    reflectorTile.activated = true;
    reflectorTile.ticks = 10;

    // Force neighbor cache recalculation
    cellTile.invalidateNeighborCaches();

    // Run updateStats which calls _applyReflectorEffects
    game.reactor.updateStats();

    // The heat should not be negative
    console.log("Cell tile heat after reflector effects:", cellTile.heat);
    console.log("Cell tile power after reflector effects:", cellTile.power);

    // With heat_increase of -200, the multiplier would be 1 + (-200 / 100) = -1
    // This would make cellTile.heat = base_heat * -1, which is negative!
    // The bug is that line 195 doesn't use Math.max(0, ...) like line 192 does

    // Power should be >= 0 (line 192 has Math.max protection)
    expect(cellTile.power).toBeGreaterThanOrEqual(0);

    // Heat should also be >= 0, but it might not be due to the bug!
    expect(cellTile.heat).toBeGreaterThanOrEqual(0);
  });
});
