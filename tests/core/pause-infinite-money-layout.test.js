import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";
import { infiniteMoneyLayout, buildLayoutGridFromCompact } from "../fixtures/layouts.js";

describe("Paused reactor should not generate money for provided layout", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("does not increase money while paused (even with auto-sell enabled)", async () => {
        const layoutGrid = buildLayoutGridFromCompact(infiniteMoneyLayout);

        // Apply layout to the reactor (deducts cost as well)
        game.ui.pasteReactorLayout(layoutGrid);
        game.reactor.updateStats();

        const moneyBefore = game.current_money;

        // Pause and enable auto-sell; engine should not process ticks while paused
        game.pause();
        expect(game.paused).toBe(true);

        game.ui.stateManager.setVar("auto_sell", true);

        // Advance time via tick() only; when paused, tick() no-ops so money stays unchanged
        for (let i = 0; i < 50; i++) {
            game.engine.tick();
        }

        expect(game.current_money).toBe(moneyBefore);

        // Now unpause and verify the engine processes (layout may meltdown instead of selling power)
        game.resume();
        expect(game.paused).toBe(false);

        // Run a few ticks to allow power generation and auto-sell
        for (let i = 0; i < 5; i++) {
            game.engine.manualTick();
        }

        // The layout can instantly melt down due to extreme heat, in which case money won't increase.
        // Consider the engine "processed" if any of these changed: power > 0, heat > 0, or meltdown happened.
        const processed = game.reactor.current_power > 0 || game.reactor.current_heat > 0 || game.reactor.has_melted_down;
        expect(processed).toBe(true);
    });
});


