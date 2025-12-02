import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, vi } from "../helpers/setup.js";

describe("UI Info Bar updates for max power/heat", () => {
    let game, document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
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

        // Base max power is 100; capacitor1 adds +100 -> 200
        expect(mobileDenom.textContent).toBe("/200");
        expect(desktopDenom.textContent).toBe("/200");
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

        flushUI();

        const mobileDenom = document.getElementById("info_heat_denom");
        const desktopDenom = document.getElementById("info_heat_denom_desktop");
        expect(mobileDenom).toBeTruthy();
        expect(desktopDenom).toBeTruthy();

        // Base max heat is 1000; 4 x reactor_plating1 add +1000 -> 2000 => formatted as 2K
        expect(mobileDenom.textContent).toBe("/2K");
        expect(desktopDenom.textContent).toBe("/2K");
    });
});


