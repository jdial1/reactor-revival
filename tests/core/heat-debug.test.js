import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

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
        // Place a heat outlet in the center
        const centerTile = game.tileset.getTile(5, 5);
        const outletPart = game.partset.getPartById("heat_outlet1");
        await centerTile.setPart(outletPart);
        centerTile.activated = true;

        // Place one neighbor
        const neighborTile = game.tileset.getTile(5, 6);
        const ventPart = game.partset.getPartById("vent1");
        await neighborTile.setPart(ventPart);
        neighborTile.activated = true;

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
        expect(game.reactor.current_heat).toBeLessThan(100); // Heat should be transferred
        expect(neighborTile.heat_contained).toBeGreaterThan(0);

        // Log the actual values
        console.log("Base transfer:", outletPart.base_transfer);
        console.log("Transfer multiplier from part:", outletPart.part.transfer_multiplier);
        console.log("Calculated transfer:", outletPart.transfer);
        console.log("Effective transfer value:", centerTile.getEffectiveTransferValue());
        console.log("Heat transferred:", 100 - game.reactor.current_heat);
        console.log("Neighbor heat:", neighborTile.heat_contained);
    });
}); 