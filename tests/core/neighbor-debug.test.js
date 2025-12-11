import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

describe("Neighbor Detection Debug", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.rows = 12;
        game.cols = 12;
        game.base_rows = 12;
        game.base_cols = 12;
        game.tileset.updateActiveTiles();
    });

    it("should debug neighbor detection", async () => {
        const centerTile = await placePart(game, 5, 5, "heat_exchanger1");
        const neighborTile = await placePart(game, 5, 6, "vent1");

        // Force recalculation of neighbor caches
        centerTile._neighborCache = null;
        neighborTile._neighborCache = null;

        // Check basic properties
        expect(centerTile.part).toBeTruthy();
        expect(neighborTile.part).toBeTruthy();
        expect(centerTile.activated).toBe(true);
        expect(neighborTile.activated).toBe(true);

        // Check containment values
        expect(centerTile.part.base_containment).toBeGreaterThan(0);
        expect(neighborTile.part.base_containment).toBeGreaterThan(0);
        expect(centerTile.part.part.containment_multi).toBeGreaterThan(0);
        expect(neighborTile.part.part.containment_multi).toBeGreaterThan(0);
        expect(centerTile.part.containment).toBeGreaterThan(0);
        expect(neighborTile.part.containment).toBeGreaterThan(0);

        // Check neighbor detection
        const allNeighbors = Array.from(game.tileset.getTilesInRange(centerTile, 1));
        expect(allNeighbors.length).toBeGreaterThan(0);

        // Check if the specific neighbor is found in all neighbors
        const foundInAll = allNeighbors.find(n => n === neighborTile);
        expect(foundInAll).toBe(neighborTile);

        // Check containment neighbors
        const neighbors = centerTile.containmentNeighborTiles;
        expect(neighbors.length).toBeGreaterThan(0);

        // Check if the specific neighbor is found
        const foundNeighbor = neighbors.find(n => n === neighborTile);
        expect(foundNeighbor).toBe(neighborTile);
    });
}); 