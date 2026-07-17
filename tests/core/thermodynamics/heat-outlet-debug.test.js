import { describe, it, expect, beforeEach, setupGame } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import { topologyNeighborCoords } from "reactor-core";

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
        const centerTile = await placePart(game, 5, 5, "heat_outlet1");
        const neighborTile = await placePart(game, 5, 6, "vent1");

        centerTile.invalidateNeighborCaches();
        neighborTile.invalidateNeighborCaches();

        const invalidateAround = (tile, range) => {
            const coords = topologyNeighborCoords("Manhattan", tile.row, tile.col, range, game.rows, game.cols);
            for (const [r, c] of coords) {
                const t = game.tileset.getTile(r, c);
                if (t) t._neighborCache = null;
            }
        };
        invalidateAround(centerTile, 2);
        invalidateAround(neighborTile, 2);

        expect(centerTile.part).toBeTruthy();
        expect(neighborTile.part).toBeTruthy();
        expect(centerTile.activated).toBe(true);
        expect(neighborTile.activated).toBe(true);

        expect(neighborTile.part.containment).toBeGreaterThan(0);

        expect(centerTile.getEffectiveTransferValue()).toBeGreaterThan(0);

        const neighborCoords = topologyNeighborCoords("Manhattan", centerTile.row, centerTile.col, 1, game.rows, game.cols);
        const allNeighbors = neighborCoords.map(([r, c]) => game.tileset.getTile(r, c)).filter(Boolean);
        const foundNeighborInRange = allNeighbors.find(n => n === neighborTile);
        expect(foundNeighborInRange).toBe(neighborTile);

        const neighborNeighbors = neighborTile.containmentNeighborTiles;
        expect(neighborNeighbors.length).toBeGreaterThan(0);

        const foundOutlet = neighborNeighbors.find(n => n === centerTile);
        expect(foundOutlet).toBe(centerTile);

        const outletNeighbors = centerTile.containmentNeighborTiles;
        expect(outletNeighbors.length).toBeGreaterThan(0);

        const foundVent = outletNeighbors.find(n => n === neighborTile);
        expect(foundVent).toBe(neighborTile);
    });
});
