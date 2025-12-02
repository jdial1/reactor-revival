import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, vi } from "../helpers/setup.js";

describe("Time Flux Safety Mechanisms", () => {
    let game;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        game.loop_wait = 1000;
        game.engine.time_accumulator = 0;
        game.ui.stateManager.setVar("time_flux", true);
        game.reactor.max_heat = 1000;
        game.reactor.current_heat = 0;
        
        // Add a part to ensure engine has work to do
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(game.partset.getPartById("uranium1"));
        game.engine.markPartCacheAsDirty();

        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    });

    afterEach(() => {
        if (game.engine) game.engine.stop();
        vi.restoreAllMocks();
    });

    it("should process accumulated time normally when heat is low", () => {
        game.engine.time_accumulator = 5000;
        game.reactor.current_heat = 100; // 10% heat
        game.engine.active_cells = [{ id: 'dummy' }]; // Hack to bypass empty check if needed

        const tickSpy = vi.spyOn(game.engine, "_processTick");
        
        game.engine.running = true;
        game.engine.last_timestamp = 1000;
        // Simulate 16ms frame
        game.engine.loop(1016);

        expect(tickSpy).toHaveBeenCalled();
        expect(game.paused).toBe(false);
        expect(game.time_flux).toBe(true);
        expect(game.engine.time_accumulator).toBeLessThan(5000);
    });

    it("should pause game and disable time flux when heat > 90% while using accumulated time", () => {
        game.engine.time_accumulator = 5000;
        game.reactor.current_heat = 950; // 95% heat
        game.reactor.max_heat = 1000;
        game.engine.active_cells = [{ id: 'dummy' }];

        const tickSpy = vi.spyOn(game.engine, "_processTick");
        
        game.engine.running = true;
        game.engine.last_timestamp = 1000;
        game.engine.loop(1016);

        expect(game.paused).toBe(true);
        expect(game.time_flux).toBe(false);
        expect(game.ui.stateManager.getVar("time_flux")).toBe(false);
        expect(tickSpy).not.toHaveBeenCalled(); // Should not tick if unsafe
        expect(game.engine.time_accumulator).toBeCloseTo(5000, -1); // Should not consume time
    });

    it("should NOT pause game when heat > 90% if NOT using accumulated time", () => {
        game.engine.time_accumulator = 0;
        game.reactor.current_heat = 950;
        game.reactor.max_heat = 1000;
        game.engine.active_cells = [{ id: 'dummy' }];

        const tickSpy = vi.spyOn(game.engine, "_processTick");
        
        game.engine.running = true;
        game.engine.last_timestamp = 1000;
        game.engine.loop(1016);

        expect(game.paused).toBe(false);
        expect(game.time_flux).toBe(true); // Toggle remains on
        expect(tickSpy).toHaveBeenCalled(); // Normal ticking continues
    });
});

