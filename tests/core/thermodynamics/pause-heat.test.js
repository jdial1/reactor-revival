import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../../helpers/setup.js";

describe("Pause Heat Processing", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("should not process heat when game is paused", async () => {
        const ventPart = game.partset.getPartById("vent1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(ventPart);
        tile.activated = true;
        tile.heat_contained = 100;

        const initialHeat = tile.heat_contained;
        game.pause();
        expect(game.paused).toBe(true);
        game.engine.tick();
        expect(tile.heat_contained).toBe(initialHeat);
        game.resume();
        expect(game.paused).toBe(false);
        game.engine.tick();
        expect(tile.heat_contained).toBeLessThan(initialHeat);
    });

});
