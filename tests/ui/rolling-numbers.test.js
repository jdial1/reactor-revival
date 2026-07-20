import { describe, it, expect, beforeEach, setupGameWithDOM, toNum } from "../helpers/setup.js";
import { setDecimal } from "@app/store.js";
import { loadEconomyFromHost } from "../helpers/bridge-test-harness.js";

describe("Info bar snapshot HUD", () => {
    let game;
    let ui;
    let window;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        window = setup.window;
        document = setup.document;
        await game.router.loadPage("reactor_section");
        game.ui.startRenderLoop(0);
    });

    it("bumps chrome snapshot_rev on projectLiveState", () => {
        const before = ui.uiState.snapshot_rev | 0;
        game.coreBridge?.projectLiveState?.();
        expect(ui.uiState.snapshot_rev).toBeGreaterThan(before);
    });

    it("formats large heat numbers from session snapshot", async () => {
        Object.defineProperty(window, "innerWidth", { value: 1024, writable: true });

        game.coreBridge?.setReactorHeat?.(1500);
        await new Promise((r) => setTimeout(r, 50));

        const heatEl = document.getElementById("info_heat_desktop");
        expect(heatEl, "info_heat_desktop element should exist after info bar render").not.toBeNull();
        expect(heatEl.textContent).toBe("1.5K");
    });

    it("exposes money on session snapshot after host economy hydrate", () => {
        setDecimal(game.state, "current_money", 5000);
        loadEconomyFromHost(game);
        game.coreBridge?.projectLiveState?.();
        const snap = game.coreBridge?.getSnapshot?.();
        expect(toNum(snap?.economy?.money)).toBe(5000);
        expect(ui.uiState.snapshot_rev).toBeGreaterThan(0);
    });
});
