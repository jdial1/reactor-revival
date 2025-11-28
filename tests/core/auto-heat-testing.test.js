import { describe, it, expect, beforeEach, vi, setupGameWithDOM } from "../helpers/setup.js";

describe("Auto Heat Testing", () => {
    let game;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
    });

    it("should auto-reduce heat when 'Heat Control Operator' upgrade is purchased", async () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        game.reactor.current_heat = 150;
        const initialHeat = game.reactor.current_heat;

        // Purchase the upgrade that enables heat control
        game.upgradeset.purchaseUpgrade('heat_control_operator');
        expect(game.reactor.heat_controlled).toBe(true);

        // Run a tick
        game.engine.tick();

        // Heat should be reduced
        expect(game.reactor.current_heat).toBeLessThan(initialHeat);
    });

    it("should NOT auto-reduce heat when heat_controlled is false", () => {
        // Set initial heat
        game.reactor.current_heat = 1000;
        const initialHeat = game.reactor.current_heat;

        // Disable heat control (which disables auto heat reduction)
        game.reactor.heat_controlled = false;

        // Run a tick
        game.engine.tick();

        // Heat should remain exactly the same (no auto heat reduction)
        expect(game.reactor.current_heat).toBe(initialHeat);
    });

    it("should toggle auto heat reduction when heat_control state changes", () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Set initial heat
        game.reactor.current_heat = 1000;

        // Test with heat_controlled = false
        game.reactor.heat_controlled = false;
        game.ui.stateManager.setVar("heat_control", false);
        const heatBeforeTick1 = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick1 = game.reactor.current_heat;
        expect(heatAfterTick1).toBe(heatBeforeTick1);

        // Test with heat_controlled = true
        game.reactor.heat_controlled = true;
        game.ui.stateManager.setVar("heat_control", true);
        const heatBeforeTick2 = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick2 = game.reactor.current_heat;
        // Should be reduced (auto heat reduction enabled)
        expect(heatAfterTick2).toBeLessThan(heatBeforeTick2);
    });

    it("should handle heat_control toggle through UI state manager", () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Set initial heat
        game.reactor.current_heat = 1000;

        // Test turning heat control ON
        game.onToggleStateChange("heat_control", true);
        expect(game.reactor.heat_controlled).toBe(true);

        const heatBeforeTick = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick = game.reactor.current_heat;
        // Should be reduced (auto heat reduction enabled)
        expect(heatAfterTick).toBeLessThan(heatBeforeTick);

        // Test turning heat control OFF
        game.onToggleStateChange("heat_control", false);
        expect(game.reactor.heat_controlled).toBe(false);

        const heatBeforeTick2 = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick2 = game.reactor.current_heat;
        expect(heatAfterTick2).toBe(heatBeforeTick2);
    });

    it("should not auto-reduce heat when heat is 0", () => {
        // Set heat to 0
        game.reactor.current_heat = 0;
        game.reactor.heat_controlled = true;

        // Run a tick
        game.engine.tick();

        // Heat should remain 0
        expect(game.reactor.current_heat).toBe(0);
    });

    it("should apply vent multiplier from Plating/Capacitor parts when auto-reducing heat", async () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Purchase upgrade that enables vent_plating_multiplier
        game.upgradeset.purchaseUpgrade('improved_heatsinks');
        expect(game.reactor.vent_plating_multiplier).toBe(1);

        // Place a Reactor Plating part to trigger multiplier calculation
        await game.tileset.getTile(0, 0).setPart(game.partset.getPartById('reactor_plating1'));
        game.reactor.updateStats();

        // Set initial heat
        game.reactor.current_heat = 1000;
        game.reactor.heat_controlled = true;

        const heatBeforeTick = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick = game.reactor.current_heat;

        // Heat should be reduced by more than base reduction due to multiplier
        const baseReduction = (game.reactor.max_heat / 10000);
        expect(heatBeforeTick - heatAfterTick).toBeGreaterThan(baseReduction);
    });

    it("should NOT disable auto venting when heat outlets are present", async () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Set initial heat
        game.reactor.current_heat = 1000;
        game.reactor.heat_controlled = true;
        game.ui.stateManager.setVar("heat_control", true);

        // Add a heat outlet with a containment neighbor
        const outletPart = game.partset.getPartById("vent1");
        const outletTile = game.tileset.getTile(0, 0);
        await outletTile.setPart(outletPart);
        outletTile.activated = true;

        // Add a containment tile next to the outlet
        const containmentPart = game.partset.getPartById("capacitor1");
        const containmentTile = game.tileset.getTile(0, 1);
        await containmentTile.setPart(containmentPart);
        containmentTile.activated = true;
        game.reactor.updateStats();

        const heatBeforeTick = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick = game.reactor.current_heat;

        // Heat should be reduced by auto heat reduction + outlet transfer
        // The outlet will transfer some heat to the containment tile, but auto heat reduction should still work
        const autoHeatReduction = game.reactor.max_heat / 10000;
        expect(heatAfterTick).toBeLessThanOrEqual(heatBeforeTick - autoHeatReduction);
    });

    it("should maintain auto venting regardless of heat outlets", async () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Set initial heat
        game.reactor.current_heat = 1000;
        game.reactor.heat_controlled = true;
        game.ui.stateManager.setVar("heat_control", true);

        // Add a heat outlet with a containment neighbor
        const outletPart = game.partset.getPartById("vent1");
        const outletTile = game.tileset.getTile(0, 0);
        await outletTile.setPart(outletPart);
        outletTile.activated = true;

        // Add a containment tile next to the outlet
        const containmentPart = game.partset.getPartById("capacitor1");
        const containmentTile = game.tileset.getTile(0, 1);
        await containmentTile.setPart(containmentPart);
        containmentTile.activated = true;
        game.reactor.updateStats();

        // Verify auto venting works with outlets present
        const heatBeforeTick1 = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick1 = game.reactor.current_heat;
        const autoHeatReduction = game.reactor.max_heat / 10000;
        expect(heatAfterTick1).toBeLessThanOrEqual(heatBeforeTick1 - autoHeatReduction);

        // Remove the outlet
        if (outletTile.$el) {
            outletTile.clearPart();
        }

        // Verify auto venting still works the same way
        const heatBeforeTick2 = game.reactor.current_heat;
        game.engine.tick();
        const heatAfterTick2 = game.reactor.current_heat;
        expect(heatAfterTick2).toBeLessThan(heatBeforeTick2);
    });

    it("should handle multiple ticks correctly with heat_controlled = true", () => {
        // Ensure engine is running
        if (!game.engine.running) {
            game.engine.start();
        }

        // Set initial heat
        game.reactor.current_heat = 1000;
        game.reactor.heat_controlled = true;
        game.ui.stateManager.setVar("heat_control", true);

        const initialHeat = game.reactor.current_heat;

        // Run multiple ticks
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }

        // Heat should be reduced after multiple ticks
        expect(game.reactor.current_heat).toBeLessThan(initialHeat);
    });

    it("should handle multiple ticks correctly with heat_controlled = false", () => {
        // Set initial heat
        game.reactor.current_heat = 1000;
        game.reactor.heat_controlled = false;

        const initialHeat = game.reactor.current_heat;

        // Run multiple ticks
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }

        // Heat should remain exactly the same after multiple ticks (no auto heat reduction)
        expect(game.reactor.current_heat).toBe(initialHeat);
    });

    it("should correctly save and load the heat_control state via its upgrade", async () => {
        game.upgradeset.purchaseUpgrade('heat_control_operator');
        game.saveGame(1);
        const savedData = JSON.parse(localStorage.getItem('reactorGameSave_1'));
        expect(savedData.toggles.heat_control).toBe(true);

        await game.set_defaults();
        await game.loadGame(1);
        
        // Apply pending toggle states (normally done in startGame)
        if (game._pendingToggleStates) {
            game.ui.stateManager.setGame(game); // Ensure stateManager has game reference
            Object.entries(game._pendingToggleStates).forEach(([key, value]) => {
                game.ui.stateManager.setVar(key, value);
            });
            delete game._pendingToggleStates;
        }
        
        expect(game.reactor.heat_controlled).toBe(true);
    });
});
