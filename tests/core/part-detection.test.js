import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

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
        // Place a heat outlet
        const centerTile = game.tileset.getTile(5, 5);
        const outletPart = game.partset.getPartById("heat_outlet1");
        await centerTile.setPart(outletPart);

        // Place a vent
        const neighborTile = game.tileset.getTile(5, 6);
        const ventPart = game.partset.getPartById("vent1");
        await neighborTile.setPart(ventPart);

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