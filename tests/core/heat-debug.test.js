import { describe, it, expect, beforeEach, setupGame, toNum } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

describe("Heat Transfer Debug", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.rows = 12;
        game.cols = 12;
        game.base_rows = 12;
        game.base_cols = 12;
        game.tileset.updateActiveTiles();
    });

    it("should debug heat outlet transfer", async () => {
        const centerTile = await placePart(game, 5, 5, "heat_outlet1");
        const neighborTile = await placePart(game, 5, 6, "vent1");
        const outletPart = centerTile.part;

        // Invalidate caches
        centerTile.invalidateNeighborCaches();
        neighborTile.invalidateNeighborCaches();

        // Force recalculation of neighbor caches
        centerTile._neighborCache = null;
        neighborTile._neighborCache = null;

        // Set reactor heat
        game.reactor.current_heat = 100;

        // Run one tick
        game.engine.tick();

        // Check values through assertions
        expect(outletPart.category).toBe("heat_outlet");
        expect(outletPart.transfer).toBeGreaterThan(0);
        expect(centerTile.getEffectiveTransferValue()).toBeGreaterThan(0);
        expect(neighborTile.part.containment).toBeGreaterThan(0);
        expect(centerTile.containmentNeighborTiles.length).toBe(1);
        expect(toNum(game.reactor.current_heat)).toBeLessThan(100);
        expect(neighborTile.heat_contained).toBeGreaterThan(0);

        // Log the actual values
        console.log("Base transfer:", outletPart.base_transfer);
        console.log("Transfer multiplier from part:", outletPart.part.transfer_multiplier);
        console.log("Calculated transfer:", outletPart.transfer);
        console.log("Effective transfer value:", centerTile.getEffectiveTransferValue());
        console.log("Heat transferred:", 100 - toNum(game.reactor.current_heat));
        console.log("Neighbor heat:", neighborTile.heat_contained);
    });
}); 