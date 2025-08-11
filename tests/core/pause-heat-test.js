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

        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
        expect(game.paused).toBe(true);

        // Process the heat manager while paused
        game.engine.heatManager.processTick();

        // Heat should not change when game is paused
        expect(tile.heat_contained).toBe(initialHeat);

        // Unpause the game
        game.ui.stateManager.setVar("pause", false);
        game.onToggleStateChange("pause", false);
        expect(game.paused).toBe(false);

        // Process the heat manager again while unpaused
        game.engine.heatManager.processTick();

        // Heat should now change when game is unpaused
        expect(tile.heat_contained).not.toBe(initialHeat);
    });

    it("should not call updateSegments when game is paused", () => {
        // Pause the game
        game.ui.stateManager.setVar("pause", true);
        game.onToggleStateChange("pause", true);
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