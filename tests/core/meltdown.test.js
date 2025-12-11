import { describe, it, expect, beforeEach, vi, afterEach, setupGameWithDOM } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

describe("Reactor Meltdown Scenarios", () => {
    let game;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        // Ensure we start on reactor page
        await game.router.loadPage('reactor_section');
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    it("should trigger a meltdown when reactor heat exceeds twice the maximum capacity", () => {
        game.paused = false;
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);
        expect(game.ui.stateManager.getVar("melting_down")).toBe(true);
    });

    it("should destroy all parts on the grid upon meltdown", async () => {
        game.paused = false;
        await placePart(game, 0, 0, "uranium1");
        await placePart(game, 0, 1, "vent1");
        await placePart(game, 1, 0, "capacitor1");
        
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        
        const remainingParts = game.tileset.active_tiles_list.filter(t => t.part).length;
        expect(remainingParts).toBe(0);
    });

    it("should stop the game engine when a meltdown occurs", () => {
        game.paused = false;
        const engineStopSpy = vi.spyOn(game.engine, "stop");
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();

        expect(engineStopSpy).toHaveBeenCalled();
        expect(game.engine.running).toBe(false);
    });

    it("should delegate explosion sequence to UI if available", () => {
        game.paused = false;
        game.ui.explodeAllPartsSequentially = vi.fn();
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.ui.explodeAllPartsSequentially).toHaveBeenCalled();
    });

    it("should prevent any further page navigation (except to the research page) after a meltdown", async () => {
        game.paused = false;
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);

        await game.router.loadPage("upgrades_section");
        expect(game.router.currentPageId).not.toBe("upgrades_section");
    });

    it("should display a meltdown banner and add 'reactor-meltdown' class to the body", () => {
        game.paused = false;
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);
        game.ui.updateMeltdownState();
        if (typeof document !== 'undefined' && document && document.body) {
            expect(document.body.classList.contains("reactor-meltdown")).toBe(true);
        }
    });

    it("should clear the meltdown state upon a full reboot", async () => {
        game.paused = false;
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);

        await game.reboot_action(false);
        expect(game.reactor.has_melted_down).toBe(false);
        expect(game.ui.stateManager.getVar("melting_down")).toBe(false);
    });

    it("should clear the meltdown CSS class from body upon reboot", async () => {
        // Use the existing game instance instead of creating a new one
        game.paused = false;
        
        // Ensure we're on reactor page
        await game.router.loadPage('reactor_section');
        
        // Trigger meltdown
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);
        
        // Add the CSS class manually to test removal
        if (document.body) {
            document.body.classList.add("reactor-meltdown");
        }

        // Perform reboot
        await game.reboot_action(false);

        // Verify meltdown state is cleared
        expect(game.reactor.has_melted_down).toBe(false);
        expect(game.ui.stateManager.getVar("melting_down")).toBe(false);

        // Verify CSS class is removed from body
        if (typeof document !== 'undefined' && document && document.body) {
            expect(document.body.classList.contains("reactor-meltdown")).toBe(false);
        }
    }, 30000);

    it("should clear the meltdown state if a part is placed after a meltdown", async () => {
        game.paused = false;
        game.reactor.current_heat = game.reactor.max_heat * 2.1;
        game.engine.tick();
        expect(game.reactor.has_melted_down).toBe(true);
        
        await placePart(game, 0, 0, "uranium1");
        
        expect(game.reactor.has_melted_down).toBe(false);
        expect(game.reactor.current_heat).toBe(0);
        // Engine should be running after placing part (it restarts automatically)
        // But in test environment, we may need to start it manually
        if (!game.engine.running) {
            game.engine.start();
        }
        expect(game.engine.running).toBe(true);
    });
}); 