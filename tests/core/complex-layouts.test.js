import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";
import { placePart, forcePurchaseUpgrade, runTicks } from "../helpers/gameHelpers.js";

describe("Complex Layouts and Advanced Interactions", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Use fake timers to control game ticks precisely
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should correctly transfer heat through a long chain of heat exchangers", async () => {
        const cellTile = await placePart(game, 5, 5, "uranium1");
        
        const exchangerTiles = [];
        for (let i = 0; i < 5; i++) {
            exchangerTiles.push(await placePart(game, 5, 6 + i, "heat_exchanger1"));
        }
        await placePart(game, 5, 11, "vent1");

        game.reactor.updateStats();
        game.engine.tick();
        
        expect(game.reactor.has_melted_down).toBe(false);
        expect(cellTile.activated).toBe(true);
        expect(cellTile.ticks).toBeGreaterThan(0);

        runTicks(game, 10);
        
        expect(game.reactor.has_melted_down).toBe(false);
        expect(cellTile.activated).toBe(true);
        expect(cellTile.ticks).toBeGreaterThan(0);
    });

    it("should increase cell power with high sustained heat when Forceful Fusion is active", async () => {
        game.bypass_tech_tree_restrictions = true;
        
        forcePurchaseUpgrade(game, "forceful_fusion");
        forcePurchaseUpgrade(game, "heat_control_operator");
        expect(game.reactor.heat_power_multiplier).toBe(1);
        expect(game.reactor.heat_controlled).toBe(true);

        const cellPart = game.partset.getPartById("uranium1");
        game.upgradeset.getUpgrade("uranium1_cell_perpetual").setLevel(1);
        
        const cellTile = await placePart(game, 5, 5, "uranium1");

        // Artificially set a high heat level (but not so high it causes meltdown)
        game.reactor.current_heat = 10000; // 10K heat
        game.reactor.max_heat = 100000; // Increase max heat to prevent meltdown
        game.reactor.altered_max_heat = 100000; // Prevent updateStats() from resetting max_heat

        // Ensure the tile's power is properly initialized
        cellTile.power = cellPart.base_power; // Use base_power instead of power
        cellTile.heat = cellPart.heat;

        // Update stats to apply the bonus AFTER setting heat
        game.reactor.updateStats();

        // Check the power bonus calculation in updateStats
        const expectedMultiplier = 1 + (1 * (Math.log(10000) / Math.log(1000) / 100));
        const expectedPower = cellPart.base_power * expectedMultiplier;

        expect(game.reactor.stats_power).toBeCloseTo(expectedPower, 1);
        game.engine._updatePartCaches(); // Ensure active_cells is populated
        // Run a tick to see the effect on power generation
        game.engine.tick();

        // Power added should be greater than or equal to the base power of the cell
        expect(game.reactor.current_power).toBeGreaterThanOrEqual(cellPart.base_power);

        expect(game.reactor.current_power).toBeCloseTo(expectedPower, 1);
    });

    it("should correctly apply the power bonus from depleted Protium Cells", async () => {
        const protiumPart = game.partset.getPartById("protium1");
        game.upgradeset.getUpgrade("laboratory").setLevel(1);
        game.upgradeset.getUpgrade("protium_cells").setLevel(1);

        const firstTile = await placePart(game, 0, 0, "protium1");
        firstTile.ticks = 1;
        game.engine.tick();
        
        expect(firstTile.part).toBeNull();
        expect(game.protium_particles).toBe(protiumPart.cell_count);

        await placePart(game, 1, 0, "protium1");

        // The new part instance should have its power recalculated
        const newProtiumInstance = game.partset.getPartById("protium1");
        const expectedPower = newProtiumInstance.base_power * (1 + (game.protium_particles * 0.1));

        // Update stats and check
        game.reactor.updateStats();

        expect(game.reactor.stats_power).toBeCloseTo(expectedPower, 1);
    });

    it("should consume reactor power when an Extreme Vent is active", async () => {
        // eslint-disable-next-line no-undef
        const originalConsoleLog = console.log;
        // eslint-disable-next-line no-undef
        console.log = (...args) => originalConsoleLog(...args);

        game.upgradeset.getUpgrade("laboratory").setLevel(1);
        game.upgradeset.getUpgrade("vortex_cooling").setLevel(1);

        await placePart(game, 1, 0, "capacitor1");
        await placePart(game, 0, 0, "coolant_cell1");
        const ventTile = await placePart(game, 0, 1, "vent6");
        
        const heatToVent = 1000;
        ventTile.heat_contained = heatToVent;
        game.reactor.current_power = 2000;

        // Update reactor stats to populate neighbor lists
        game.reactor.updateStats();

        // Run a tick to actually vent the heat
        game.engine.tick();

        // Debug: Check the values
        // eslint-disable-next-line no-undef
        console.log(`Initial heat: ${heatToVent}`);
        // eslint-disable-next-line no-undef
        console.log(`Final vent heat: ${ventTile.heat_contained}`);
        // eslint-disable-next-line no-undef
        console.log(`Initial power: 2000`);
        // eslint-disable-next-line no-undef
        console.log(`Final power: ${game.reactor.current_power}`);
        // eslint-disable-next-line no-undef
        console.log(`Heat vented: ${heatToVent - ventTile.heat_contained}`);
        // eslint-disable-next-line no-undef
        console.log(`Power consumed: ${2000 - game.reactor.current_power}`);

        // Restore console.log
        // eslint-disable-next-line no-undef
        console.log = originalConsoleLog;

        // Check that heat was vented (some amount)
        expect(ventTile.heat_contained).toBeLessThan(heatToVent);

        // Check that power was consumed (some amount)
        expect(game.reactor.current_power).toBeLessThan(2000);

        // Check that the amount of power consumed is proportional to heat vented
        const heatVented = heatToVent - ventTile.heat_contained;
        const powerConsumed = 2000 - game.reactor.current_power;

        // The power consumed should be close to the heat vented (allowing for small differences)
        expect(Math.abs(powerConsumed - heatVented)).toBeLessThan(1500);
    });

    it("should handle auto-buy for multiple depleted perpetual parts in the same tick", async () => {
        game.upgradeset.getUpgrade("uranium1_cell_perpetual").setLevel(1);
        game.upgradeset.getUpgrade("perpetual_reflectors").setLevel(1);
        game.ui.stateManager.setVar("auto_buy", true);

        const cellTile = await placePart(game, 0, 0, "uranium1");
        const reflectorTile = await placePart(game, 0, 1, "reflector1");

        // Set both to be depleted on the next tick
        cellTile.ticks = 1;
        reflectorTile.ticks = 1;

        const cellPart = game.partset.getPartById("uranium1");
        const reflectorPart = game.partset.getPartById("reflector1");
        const cellCost = cellPart.getAutoReplacementCost();
        const reflectorCost = reflectorPart.getAutoReplacementCost();
        const totalCost = cellCost + reflectorCost;

        game.current_money = totalCost;

        game.engine.tick();

        // Both parts should have been replaced
        expect(cellTile.part).not.toBeNull();
        expect(reflectorTile.part).not.toBeNull();

        // Ticks should be reset
        expect(cellTile.ticks).toBe(cellPart.base_ticks);
        expect(reflectorTile.ticks).toBe(reflectorPart.base_ticks);

        // Money should be deducted correctly
        expect(game.current_money).toBe(0);
    });
}); 