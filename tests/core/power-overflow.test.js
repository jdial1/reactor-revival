import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";

describe("Power Overflow Mechanics", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Disable auto-cooling to ensure heat math is exact
        game.reactor.heat_controlled = false;
        game.ui.stateManager.setVar("heat_control", false);
        // Ensure reactor has specific limits for math
        game.reactor.base_max_power = 100;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
    });

    afterEach(() => {
        cleanupGame();
    });

    it("should convert excess base power to heat when cap is reached", async () => {
        const tile = game.tileset.getTile(0, 0);
        const part = game.partset.getPartById("uranium1"); // Assuming base power is small
        await tile.setPart(part);
        
        // Update stats to populate active_cells, then override values for precise testing
        game.reactor.updateStats();
        
        // Manipulate tile stats for precise testing
        // Note: engine.js reads 'tile.power' and 'tile.heat' which are set by reactor.updateStats()
        // We override them here to isolate the logic
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 20;
        tile.heat = 0; // Zero native heat generation

        // Set reactor to near full
        game.reactor.current_power = 90;
        game.reactor.max_power = 100;

        // Run tick
        // Expected: 90 + 20 = 110. Cap is 100. Excess is 10.
        game.engine.tick();

        expect(game.reactor.current_power).toBe(100);
        expect(game.reactor.current_heat).toBe(10);
    });

    it("should convert 100% of generated power to heat if starting at max power", async () => {
        const tile = game.tileset.getTile(0, 0);
        const part = game.partset.getPartById("uranium1");
        await tile.setPart(part);
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 50;
        tile.heat = 5; // 5 native heat

        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        // Run tick
        // Expected Power: 100 + 50 = 150 -> Capped at 100. Excess 50.
        // Expected Heat: 0 + 5 (native) + 50 (overflow) = 55.
        game.engine.tick();

        expect(game.reactor.current_power).toBe(100);
        expect(game.reactor.current_heat).toBe(55);
    });

    it("should handle power multipliers correctly with overflow", async () => {
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(game.partset.getPartById("uranium1"));
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 10;
        tile.heat = 0;

        // Set a global power multiplier (simulating upgrades)
        game.reactor.power_multiplier = 2.0; // 10 base becomes 20 total
        
        game.reactor.current_power = 95;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        // Logic trace:
        // 1. Base Power Add: 10. 
        //    Potential = 95 + 10 = 105. 
        //    Excess = 5. 
        //    Current Power = 100.
        //    Heat += 5.
        // 2. Multiplier Add: (10 * 2) - 10 = 10 additional power.
        //    Potential = 100 (current) + 10 = 110.
        //    Excess = 10.
        //    Current Power = 100.
        //    Heat += 10.
        // Total Heat = 5 + 10 = 15.

        game.engine.tick();

        expect(game.reactor.current_power).toBe(100);
        expect(game.reactor.current_heat).toBe(15);
    });

    it("should NOT add extra heat if power is within capacity", async () => {
        const tile = game.tileset.getTile(0, 0);
        await tile.setPart(game.partset.getPartById("uranium1"));
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 10;
        tile.heat = 5;

        game.reactor.current_power = 50;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(game.reactor.current_power).toBe(60);
        expect(game.reactor.current_heat).toBe(5); // Only native heat
    });
});

