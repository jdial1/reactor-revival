import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

describe("Part Detection Test", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.rows = 12;
        game.cols = 12;
        game.base_rows = 12;
        game.base_cols = 12;
        game.tileset.updateActiveTiles();
    });

    it("should detect parts correctly", async () => {
        const centerTile = await placePart(game, 5, 5, "heat_outlet1");
        const neighborTile = await placePart(game, 5, 6, "vent1");

        // Check that parts are detected
        expect(centerTile.part).toBeTruthy();
        expect(neighborTile.part).toBeTruthy();
        expect(centerTile.activated).toBe(true);
        expect(neighborTile.activated).toBe(true);

        // Check that parts are in the active tiles list
        const activeTiles = game.tileset.active_tiles_list;
        expect(activeTiles.includes(centerTile)).toBe(true);
        expect(activeTiles.includes(neighborTile)).toBe(true);

        // Check that parts are categorized correctly
        const activeOutlets = [];
        const activeVessels = [];

        for (const tile of activeTiles) {
            if (!tile.activated || !tile.part) continue;
            const part = tile.part;
            const category = part.category;

            if (category === "heat_outlet") {
                activeOutlets.push(tile);
            }

            if (part.vent > 0 || category === "particle_accelerator" || part.containment > 0) {
                activeVessels.push(tile);
            }
        }

        expect(activeOutlets.length).toBeGreaterThan(0);
        expect(activeVessels.length).toBeGreaterThan(0);

        // Check that our specific parts are included
        const foundOutlet = activeOutlets.find(tile => tile === centerTile);
        const foundVent = activeVessels.find(tile => tile === neighborTile);

        expect(foundOutlet).toBe(centerTile);
        expect(foundVent).toBe(neighborTile);
    });
}); 