import { describe, it, expect, beforeEach, afterEach, setupGame } from "./helpers/setup.js";

describe("Simple Objective Test", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        // Cleanup if needed
    });

    it("should have a working game instance", () => {
        expect(game).toBeDefined();
        expect(game.partset).toBeDefined();
        expect(game.upgradeset).toBeDefined();
    });
}); 