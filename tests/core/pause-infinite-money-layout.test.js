import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";

// Helper to convert compact layout JSON to the 2D array expected by ui.pasteReactorLayout
function buildLayoutGridFromCompact(compact) {
    const rows = compact.size.rows;
    const cols = compact.size.cols;
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
    for (const p of compact.parts) {
        if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) {
            grid[p.r][p.c] = { t: p.t, id: p.id, lvl: p.lvl || 1 };
        }
    }
    return grid;
}

describe("Paused reactor should not generate money for provided layout", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("does not increase money while paused (even with auto-sell enabled)", async () => {
        const layoutCompact = {
            size: { rows: 12, cols: 12 },
            parts: [
                { r: 0, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 0, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 0, c: 2, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 3, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 4, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 5, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 6, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 7, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 8, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 9, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 10, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 0, c: 11, t: "seaborgium", id: "seaborgium2", lvl: 2 },
                { r: 1, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 1, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 1, c: 2, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 3, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 4, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 5, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 6, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 7, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 8, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 9, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 10, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 1, c: 11, t: "seaborgium", id: "seaborgium3", lvl: 3 },
                { r: 2, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 2, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 2, c: 2, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 3, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 4, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 5, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 6, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 7, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 8, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 9, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 10, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 2, c: 11, t: "uranium", id: "uranium1", lvl: 1 },
                { r: 3, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 3, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 3, c: 2, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 3, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 4, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 5, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 6, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 7, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 8, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 9, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 10, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 3, c: 11, t: "uranium", id: "uranium2", lvl: 2 },
                { r: 4, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 4, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 4, c: 2, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 3, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 4, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 5, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 6, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 7, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 8, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 9, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 10, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 4, c: 11, t: "uranium", id: "uranium3", lvl: 3 },
                { r: 5, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 5, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 5, c: 2, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 3, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 4, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 5, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 6, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 7, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 8, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 9, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 10, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 5, c: 11, t: "plutonium", id: "plutonium1", lvl: 1 },
                { r: 6, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 6, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 6, c: 2, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 3, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 4, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 5, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 6, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 7, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 8, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 9, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 10, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 6, c: 11, t: "plutonium", id: "plutonium2", lvl: 2 },
                { r: 7, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 7, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 7, c: 2, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 3, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 4, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 5, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 6, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 7, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 8, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 9, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 10, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 7, c: 11, t: "plutonium", id: "plutonium3", lvl: 3 },
                { r: 8, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 8, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 8, c: 2, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 3, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 4, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 5, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 6, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 7, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 8, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 9, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 10, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 8, c: 11, t: "thorium", id: "thorium1", lvl: 1 },
                { r: 9, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 9, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 9, c: 2, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 3, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 4, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 5, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 6, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 7, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 8, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 9, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 10, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 9, c: 11, t: "thorium", id: "thorium2", lvl: 2 },
                { r: 10, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 10, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 10, c: 2, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 3, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 4, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 5, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 6, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 7, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 8, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 9, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 10, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 10, c: 11, t: "thorium", id: "thorium3", lvl: 3 },
                { r: 11, c: 0, t: "dolorium", id: "dolorium1", lvl: 1 },
                { r: 11, c: 1, t: "dolorium", id: "dolorium2", lvl: 2 },
                { r: 11, c: 2, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 3, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 4, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 5, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 6, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 7, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 8, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 9, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 10, t: "seaborgium", id: "seaborgium1", lvl: 1 },
                { r: 11, c: 11, t: "seaborgium", id: "seaborgium1", lvl: 1 }
            ]
        };

        const layoutGrid = buildLayoutGridFromCompact(layoutCompact);

        // Apply layout to the reactor (deducts cost as well)
        game.ui.pasteReactorLayout(layoutGrid);
        game.reactor.updateStats();

        const moneyBefore = game.current_money;

        // Pause and enable auto-sell; engine should not process ticks while paused
        game.pause();
        expect(game.paused).toBe(true);

        game.ui.stateManager.setVar("auto_sell", true);

        // Try advancing many ticks; money must remain unchanged while paused
        for (let i = 0; i < 50; i++) {
            game.engine.manualTick();
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


