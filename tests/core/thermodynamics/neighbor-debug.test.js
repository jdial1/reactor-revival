import { describe, it, expect, beforeEach, setupGame } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import { topologyNeighborCoords } from "reactor-core";

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

        centerTile._neighborCache = null;
        neighborTile._neighborCache = null;

        expect(centerTile.part).toBeTruthy();
        expect(neighborTile.part).toBeTruthy();
        expect(centerTile.activated).toBe(true);
        expect(neighborTile.activated).toBe(true);

        expect(centerTile.part.containment).toBeGreaterThan(0);
        expect(neighborTile.part.containment).toBeGreaterThan(0);

        const neighborCoords = topologyNeighborCoords("Manhattan", centerTile.row, centerTile.col, 1, game.rows, game.cols);
        const allNeighbors = neighborCoords.map(([r, c]) => game.tileset.getTile(r, c)).filter(Boolean);
        expect(allNeighbors.length).toBeGreaterThan(0);

        const foundInAll = allNeighbors.find(n => n === neighborTile);
        expect(foundInAll).toBe(neighborTile);

        const neighbors = centerTile.containmentNeighborTiles;
        expect(neighbors.length).toBeGreaterThan(0);

        const foundNeighbor = neighbors.find(n => n === neighborTile);
        expect(foundNeighbor).toBe(neighborTile);
    });
});
