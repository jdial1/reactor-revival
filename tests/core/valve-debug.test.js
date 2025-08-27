import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";

describe("Valve Debug Test", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should verify valve neighbor processing fix", async () => {
        // Test 1: Inactive valve - vent should self-cool
        game.tileset.clearAllTiles();

        const overflowValve = game.partset.getPartById("overflow_valve");
        const vent = game.partset.getPartById("vent1");
        const coolantCell = game.partset.getPartById("coolant_cell1");

        // Layout: coolant (low heat) -> valve -> vent (with heat)
        const coolantTile1 = game.tileset.getTile(3, 5);
        const valveTile1 = game.tileset.getTile(3, 6);
        const ventTile1 = game.tileset.getTile(3, 7);

        await coolantTile1.setPart(coolantCell);
        await valveTile1.setPart(overflowValve);
        await ventTile1.setPart(vent);

        coolantTile1.activated = true;
        valveTile1.activated = true;
        ventTile1.activated = true;

        // Inactive valve: coolant below 80% containment
        coolantTile1.heat_contained = 1000; // 50% of 2000 containment
        valveTile1.heat_contained = 0;
        ventTile1.heat_contained = 100; // Vent has heat to self-cool

        // Test 2: Active valve - vent should NOT self-cool in same tick
        const coolantTile2 = game.tileset.getTile(5, 5);
        const valveTile2 = game.tileset.getTile(5, 6);
        const ventTile2 = game.tileset.getTile(5, 7);

        await coolantTile2.setPart(coolantCell);
        await valveTile2.setPart(overflowValve);
        await ventTile2.setPart(vent);

        coolantTile2.activated = true;
        valveTile2.activated = true;
        ventTile2.activated = true;

        // Active valve: coolant above 80% containment
        coolantTile2.heat_contained = 1700; // 85% of 2000 containment
        valveTile2.heat_contained = 0;
        ventTile2.heat_contained = 0; // Vent starts with no heat

        game.reactor.updateStats();
        game.engine._updatePartCaches();

        console.log("=== BEFORE TICK ===");
        console.log(`Test 1 (inactive): coolant=${coolantTile1.heat_contained}, vent=${ventTile1.heat_contained}`);
        console.log(`Test 2 (active): coolant=${coolantTile2.heat_contained}, vent=${ventTile2.heat_contained}`);

        // Run one tick
        game.engine.tick();

        console.log("=== AFTER TICK ===");
        console.log(`Test 1 (inactive): coolant=${coolantTile1.heat_contained}, vent=${ventTile1.heat_contained}`);
        console.log(`Test 2 (active): coolant=${coolantTile2.heat_contained}, vent=${ventTile2.heat_contained}`);

        // Test 1: Inactive valve - vent should have self-cooled
        expect(ventTile1.heat_contained).toBeLessThan(100);

        // Test 2: Active valve - coolant heat should have been transferred
        expect(coolantTile2.heat_contained).toBeLessThan(1700);

        // The fix is working correctly!
        console.log("✓ Fix verified: inactive valve neighbors can self-cool, active valve transfers work correctly");
    });

    it("should allow vents adjacent to inactive valves to self-cool", async () => {
        // Clear all tiles first
        game.tileset.clearAllTiles();

        // Get parts
        const overflowValve = game.partset.getPartById("overflow_valve");
        const vent = game.partset.getPartById("vent1");
        const coolantCell = game.partset.getPartById("coolant_cell1");

        // Create layout: coolant -> valve -> vent
        const coolantTile = game.tileset.getTile(5, 5);
        const valveTile = game.tileset.getTile(5, 6);
        const ventTile = game.tileset.getTile(5, 7);

        await coolantTile.setPart(coolantCell);
        await valveTile.setPart(overflowValve);
        await ventTile.setPart(vent);

        // Activate components
        coolantTile.activated = true;
        valveTile.activated = true;
        ventTile.activated = true;

        // Set initial heat - coolant is below 80% containment so overflow valve will NOT activate
        coolantTile.heat_contained = 1000; // Only 50% of 2000 containment
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 100; // Give vent some heat to self-cool

        // Update reactor stats to populate neighbor lists
        game.reactor.updateStats();

        // Update engine part caches to ensure valve is added to active_exchangers
        game.engine._updatePartCaches();

        console.log("=== INACTIVE VALVE TEST ===");
        console.log(`Coolant heat ratio: ${coolantTile.heat_contained / coolantCell.containment} (should be < 0.8)`);
        console.log(`Vent initial heat: ${ventTile.heat_contained}`);

        // Run engine tick
        game.engine.tick();

        console.log(`Vent final heat: ${ventTile.heat_contained}`);
        console.log(`Vent should have self-cooled because valve is inactive`);

        // Vent should have self-cooled because valve is inactive
        expect(ventTile.heat_contained).toBeLessThan(100);
    });

    it("should debug valve processing step by step", async () => {
        // Clear all tiles first
        game.tileset.clearAllTiles();

        // Get parts
        const overflowValve = game.partset.getPartById("overflow_valve");
        const vent = game.partset.getPartById("vent1");
        const coolantCell = game.partset.getPartById("coolant_cell1");

        // Create layout: coolant -> valve -> vent
        const coolantTile = game.tileset.getTile(5, 5);
        const valveTile = game.tileset.getTile(5, 6);
        const ventTile = game.tileset.getTile(5, 7);

        await coolantTile.setPart(coolantCell);
        await valveTile.setPart(overflowValve);
        await ventTile.setPart(vent);

        // Activate components
        coolantTile.activated = true;
        valveTile.activated = true;
        ventTile.activated = true;

        // Set initial heat - coolant needs to be above 80% containment for overflow valve
        coolantTile.heat_contained = 1700;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 0;

        // Update reactor stats to populate neighbor lists
        game.reactor.updateStats();

        // Update engine part caches to ensure valve is added to active_exchangers
        game.engine._updatePartCaches();

        // Check valve state before processing
        const isValveActive = game.engine.active_exchangers.includes(valveTile);
        const valveNeighbors = valveTile.containmentNeighborTiles.filter(t => t.part);
        const coolantRatio = coolantTile.heat_contained / coolantCell.containment;

        console.log("=== VALVE STATE BEFORE PROCESSING ===");
        console.log(`Valve in active_exchangers: ${isValveActive}`);
        console.log(`Valve neighbors: ${valveNeighbors.length}`);
        console.log(`Coolant heat ratio: ${coolantRatio.toFixed(3)} (>=0.8? ${coolantRatio >= 0.8})`);

        valveNeighbors.forEach((n, i) => {
            if (n.part) {
                console.log(`  Neighbor ${i}: ${n.part.id} at (${n.row},${n.col}) with heat ${n.heat_contained || 0}`);
            }
        });

        // Check valve orientation
        const valveOrientation = game.engine._getValveOrientation(overflowValve.id);
        const { inputNeighbor, outputNeighbor } = game.engine._getInputOutputNeighbors(valveTile, valveNeighbors, valveOrientation);

        console.log(`Valve orientation: ${valveOrientation}`);
        console.log(`Input neighbor: ${inputNeighbor?.part?.id} at (${inputNeighbor?.row},${inputNeighbor?.col})`);
        console.log(`Output neighbor: ${outputNeighbor?.part?.id} at (${outputNeighbor?.row},${outputNeighbor?.col})`);

        // Check if valve should transfer heat
        if (inputNeighbor && outputNeighbor) {
            const inputHeat = inputNeighbor.heat_contained || 0;
            const inputContainment = inputNeighbor.part.containment || 1;
            const inputRatio = inputHeat / inputContainment;
            const valveTransfer = valveTile.getEffectiveTransferValue();

            console.log(`Input heat: ${inputHeat}, containment: ${inputContainment}, ratio: ${inputRatio.toFixed(3)}`);
            console.log(`Valve transfer capacity: ${valveTransfer}`);
            console.log(`Should transfer? ${inputRatio >= 0.8 && valveTransfer > 0}`);
        }

        // Check valve transfer value
        const valveTransfer = valveTile.getEffectiveTransferValue();
        console.log(`Valve effective transfer value: ${valveTransfer}`);

        // Check vent's effective vent value
        const ventVentValue = ventTile.getEffectiveVentValue();
        console.log(`Vent effective vent value: ${ventVentValue}`);

        // Check if vent is in active_vessels
        const isVentActive = game.engine.active_vessels.includes(ventTile);
        console.log(`Vent in active_vessels: ${isVentActive}`);

        // Check if vent is in valveNeighborTiles
        const valveNeighborTiles = new Set();
        for (const valve of game.engine.active_exchangers.filter(t => t.part && t.part.category === 'valve')) {
            const neighbors = valve.containmentNeighborTiles.filter(t => t.part);
            for (const neighbor of neighbors) {
                valveNeighborTiles.add(neighbor);
            }
        }
        const isVentInValveNeighbors = valveNeighborTiles.has(ventTile);
        console.log(`Vent in valveNeighborTiles: ${isVentInValveNeighbors}`);

        // Run engine tick
        console.log("=== RUNNING ENGINE TICK ===");

        // Add a hook to monitor heat values during the tick
        const originalTick = game.engine._processTick.bind(game.engine);
        let heatValuesDuringTick = [];

        game.engine._processTick = function (manual = false) {
            // Monitor heat values at key points
            heatValuesDuringTick.push({
                stage: "start",
                coolant: coolantTile.heat_contained,
                valve: valveTile.heat_contained,
                vent: ventTile.heat_contained
            });

            const result = originalTick(manual);

            heatValuesDuringTick.push({
                stage: "end",
                coolant: coolantTile.heat_contained,
                valve: valveTile.heat_contained,
                vent: ventTile.heat_contained
            });

            return result;
        };

        game.engine.tick();

        // Restore original tick function
        game.engine._processTick = originalTick;

        console.log("=== AFTER ENGINE TICK ===");
        console.log(`Coolant heat: ${coolantTile.heat_contained}`);
        console.log(`Valve heat: ${valveTile.heat_contained}`);
        console.log(`Vent heat: ${ventTile.heat_contained}`);

        // Show heat values during the tick
        console.log("=== HEAT VALUES DURING TICK ===");
        heatValuesDuringTick.forEach((values, index) => {
            console.log(`${values.stage}: coolant=${values.coolant}, valve=${values.valve}, vent=${values.vent}`);
        });

        // This test is just for debugging
        expect(coolantTile.heat_contained).toBeLessThan(1700); // Some heat should have been transferred
        // Note: With the fix, vents can now process heat in the same tick after receiving it from valves
        // This allows proper heat flow through the system
        expect(ventTile.heat_contained).toBeGreaterThan(0); // Vent should retain some heat after processing
    });
});
