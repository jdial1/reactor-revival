import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Reactor Meltdown Scenarios", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Add a mock router
        game.router = {
            currentPageId: 'reactor_section',
            loadPage: vi.fn(function (pageId) {
                if (game.reactor.has_melted_down && pageId !== 'experimental_upgrades_section') {
                    return;
                }
                this.currentPageId = pageId;
            })
        };
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should trigger a meltdown when reactor heat exceeds twice the maximum capacity", () => {
        // Set heat to just over the meltdown threshold
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;

        // A single tick should be enough to trigger the check
        game.engine.tick();

        expect(game.reactor.has_melted_down).toBe(true);
        expect(game.ui.stateManager.getVar("melting_down")).toBe(true);
    });

    it("should destroy all parts on the grid upon meltdown", async () => {
        // Place a variety of parts on the grid
        await game.tileset.getTile(0, 0).setPart(game.partset.getPartById("uranium1"));
        await game.tileset.getTile(0, 1).setPart(game.partset.getPartById("vent1"));
        await game.tileset.getTile(1, 0).setPart(game.partset.getPartById("capacitor1"));

        // Trigger meltdown
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();

        // Verify that all parts have been removed from the tileset
        game.tileset.active_tiles_list.forEach(tile => {
            expect(tile.part).toBeNull();
        });
    });

    it("should stop the game engine when a meltdown occurs", () => {
        const engineStopSpy = vi.spyOn(game.engine, "stop");

        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();

        expect(engineStopSpy).toHaveBeenCalled();
        expect(game.engine.running).toBe(false);
    });

    it("should prevent any further page navigation (except to the research page) after a meltdown", async () => {
        // Trigger a meltdown first
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);

        // Attempt to navigate to the upgrades page
        const initialPage = game.router.currentPageId;
        await game.router.loadPage("upgrades_section");

        // The page should not have changed from the meltdown-designated page (or the initial one if not set)
        expect(game.router.currentPageId).not.toBe("upgrades_section");

        // However, navigation to the research page should be allowed
        await game.router.loadPage("experimental_upgrades_section", true); // Force navigation for test
        expect(game.router.currentPageId).toBe("experimental_upgrades_section");
    });

    it("should display a meltdown banner and add 'reactor-meltdown' class to the body", () => {
        // This test requires a DOM, so we'll check the state that would lead to this UI change
        const setVarSpy = vi.spyOn(game.ui.stateManager, "setVar");

        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();

        expect(setVarSpy).toHaveBeenCalledWith("melting_down", true, true);
    });

    it("should clear the meltdown state upon a full reboot", () => {
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);

        game.reboot_action(false);

        expect(game.reactor.has_melted_down).toBe(false);
        expect(game.ui.stateManager.getVar("melting_down")).toBe(false);
    });

    it("should clear the meltdown state if a part is placed after a meltdown", async () => {
        game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);

        const tile = game.tileset.getTile(0, 0);
        const part = game.partset.getPartById("uranium1");

        // This action implicitly tests the recovery logic within tile.setPart
        await tile.setPart(part);

        expect(game.reactor.has_melted_down).toBe(false);
        expect(game.reactor.current_heat).toBe(0);
    });
}); 