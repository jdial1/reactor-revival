import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Heat Outlet Debug", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.rows = 12;
        game.cols = 12;
        game.base_rows = 12;
        game.base_cols = 12;
        game.tileset.updateActiveTiles();
    });

    it("should debug heat outlet neighbor detection", async () => {
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

        // Force recalculation of neighbor caches
        centerTile.invalidateNeighborCaches();
        neighborTile.invalidateNeighborCaches();

        // Also invalidate all tiles in range
        for (const tile of game.tileset.getTilesInRange(centerTile, 2)) {
            tile._neighborCache = null;
        }
        for (const tile of game.tileset.getTilesInRange(neighborTile, 2)) {
            tile._neighborCache = null;
        }

        // Check basic properties
        expect(centerTile.part).toBeTruthy();
        expect(neighborTile.part).toBeTruthy();
        expect(centerTile.activated).toBe(true);
        expect(neighborTile.activated).toBe(true);

        // Check that the neighbor has containment
        expect(neighborTile.part.containment).toBeGreaterThan(0);

        // Check that the heat outlet has transfer value
        expect(centerTile.getEffectiveTransferValue()).toBeGreaterThan(0);

        // Check that the tiles are actually neighbors in the grid
        const allNeighbors = Array.from(game.tileset.getTilesInRange(centerTile, 1));
        const foundNeighborInRange = allNeighbors.find(n => n === neighborTile);
        expect(foundNeighborInRange).toBe(neighborTile);

        // Check neighbor detection from the neighbor's perspective
        const neighborNeighbors = neighborTile.containmentNeighborTiles;
        expect(neighborNeighbors.length).toBeGreaterThan(0);

        // Check if the heat outlet is found as a neighbor
        const foundOutlet = neighborNeighbors.find(n => n === centerTile);
        expect(foundOutlet).toBe(centerTile);

        // Check neighbor detection from the heat outlet's perspective
        const outletNeighbors = centerTile.containmentNeighborTiles;
        expect(outletNeighbors.length).toBeGreaterThan(0);

        // Check if the vent is found as a neighbor
        const foundVent = outletNeighbors.find(n => n === neighborTile);
        expect(foundVent).toBe(neighborTile);
    });
}); 