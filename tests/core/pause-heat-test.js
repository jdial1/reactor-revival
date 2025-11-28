import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";

describe("Pause Heat Processing", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("should not process heat when game is paused", async () => {
        // Set up a component with heat
        const ventPart = game.partset.getPartById("vent1");
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(ventPart);
        tile.activated = true;
        tile.heat_contained = 100;

        const initialHeat = tile.heat_contained;
        game.pause();
        expect(game.paused).toBe(true);
        game.engine.tick(); // Call the main engine tick to test its pause logic
        expect(tile.heat_contained).toBe(initialHeat);
        game.resume();
        expect(game.paused).toBe(false);
        game.engine.tick(); // Now heat processing should occur
        expect(tile.heat_contained).toBeLessThan(initialHeat);
    });

    it("should not call updateSegments when game is paused", () => {
        // Pause the game
        game.pause();
        expect(game.paused).toBe(true);

        // Mock the updateSegments method to track if it's called
        const originalUpdateSegments = game.engine.heatManager.updateSegments;
        let updateSegmentsCalled = false;
        game.engine.heatManager.updateSegments = () => {
            updateSegmentsCalled = true;
        };

        // Process the heat manager while paused
        game.engine.heatManager.processTick();

        // updateSegments should not be called when game is paused
        expect(updateSegmentsCalled).toBe(false);

        // Restore original method
        game.engine.heatManager.updateSegments = originalUpdateSegments;
    });
}); 