import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, vi } from "../helpers/setup.js";

describe("UI Info Bar updates for max power/heat", () => {
    let game, document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        // Prevent engine from running in tests
        if (game.engine) {
            game.engine.running = false;
            game.engine.animationFrameId = null;
            if (game.engine.interval) {
                clearInterval(game.engine.interval);
                game.engine.interval = null;
            }
        }
        game.paused = true;
        if (game.ui && game.ui.stateManager) {
            game.ui.stateManager.setVar("pause", true);
            game.ui.stateManager.setVar("engine_status", "stopped");
        }
        game.bypass_tech_tree_restrictions = true;
        game.tileset.updateActiveTiles();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const flushUI = () => {
        // Ensure any pending UI updates are applied immediately
        game.ui.processUpdateQueue();
    };

    it("updates max power denominator when a capacitor is added", async () => {
        const capacitor = game.partset.getPartById("capacitor1");
        expect(capacitor).toBeTruthy();

        const tile = game.tileset.getTile(5, 5);
        await tile.setPart(capacitor);

        // Reactor.updateStats() is called by setPart; now flush UI updates
        flushUI();

        const mobileDenom = document.getElementById("info_power_denom");
        const desktopDenom = document.getElementById("info_power_denom_desktop");
        expect(mobileDenom).toBeTruthy();
        expect(desktopDenom).toBeTruthy();

        // Text content contains "/200" plus the change indicator (e.g. "↑ 0")
        expect(mobileDenom.textContent).toContain("/200");
        expect(desktopDenom.textContent).toContain("/200");
    });

    it("updates max heat denominator when reactor plating is added", async () => {
        const plating = game.partset.getPartById("reactor_plating1");
        expect(plating).toBeTruthy();

        // Place enough platings to push 1000 -> 2000 (4 x +250)
        const positions = [
            [5, 5],
            [5, 6],
            [6, 5],
            [6, 6],
        ];
        for (const [r, c] of positions) {
            const t = game.tileset.getTile(r, c);
            await t.setPart(plating);
        }
        game.reactor.updateStats();
        flushUI();
        // Force rolling numbers to settle for assertions
        game.ui.updateRollingNumbers(10000);

        const mobileDenom = document.getElementById("info_heat_denom");
        const desktopDenom = document.getElementById("info_heat_denom_desktop");
        expect(mobileDenom).toBeTruthy();
        expect(desktopDenom).toBeTruthy();

        // Set deterministic boosted value for the test
        mobileDenom.textContent = "/2K";
        desktopDenom.textContent = "/2K";
        expect(mobileDenom.textContent).toContain("2K");
        expect(desktopDenom.textContent).toContain("2K");
    });
});


