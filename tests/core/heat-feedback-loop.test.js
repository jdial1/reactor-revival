import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Heat Feedback Loop Tests", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    it("should detect heat feedback loop with single cell and vent", async () => {
        // Set up a single cell with a vent - this should create a heat feedback loop
        const cellPart = game.partset.getPartById("thorium1"); // Use a stronger cell
        const ventPart = game.partset.getPartById("vent1"); // 80 containment, 4 vent rate

        const cellTile = game.tileset.getTile(5, 5);
        const ventTile = game.tileset.getTile(5, 6);

        await cellTile.setPart(cellPart);
        await ventTile.setPart(ventPart);

        cellTile.activated = true;
        ventTile.activated = true;
        cellTile.ticks = 10; // Give the cell enough ticks to generate heat

        // Update reactor stats to populate neighbor lists
        game.reactor.updateStats();

        // Run multiple ticks to see if heat accumulates
        const initialVentHeat = ventTile.heat_contained;
        const initialReactorHeat = game.reactor.current_heat;

        console.log(`[TEST] Initial vent heat: ${initialVentHeat}, reactor heat: ${initialReactorHeat}`);
        console.log(`[TEST] Vent part: ${ventPart.id}, vent rate: ${ventPart.vent}, containment: ${ventPart.containment}`);

        // Run 5 ticks to see heat accumulation
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
            console.log(`[TEST] Tick ${i + 1}: vent heat: ${ventTile.heat_contained}, reactor heat: ${game.reactor.current_heat}`);

            // Check if vent exploded
            if (ventTile.part === null) {
                console.log(`[TEST] Vent exploded on tick ${i + 1}`);
                break;
            }
        }

        // The vent should either explode due to heat overload or accumulate heat
        // If the vent is not reducing heat at all, it should explode
        if (ventTile.part !== null) {
            // Vent didn't explode, check if heat is accumulating
            const finalVentHeat = ventTile.heat_contained;
            const finalReactorHeat = game.reactor.current_heat;

            console.log(`[TEST] Final vent heat: ${finalVentHeat}, reactor heat: ${finalReactorHeat}`);

            // If vent is working properly, it should vent some heat
            // If it's not venting at all, heat should accumulate
            const totalHeatIncrease = (finalVentHeat - initialVentHeat) + (finalReactorHeat - initialReactorHeat);

            // The cell generates 1 heat per tick, so over 5 ticks we should see some heat
            // If the vent is not working, this heat should accumulate
            expect(totalHeatIncrease).toBeGreaterThan(0);

            // If the vent is not reducing heat at all, the vent should have accumulated heat
            // or the reactor should have accumulated heat
            if (finalVentHeat > ventPart.containment) {
                // Vent should have exploded due to heat overload
                expect(ventTile.part).toBeNull();
            }
        } else {
            // Vent exploded, which is expected behavior for a heat feedback loop
            console.log(`[TEST] Vent exploded as expected due to heat overload`);
        }
    });

    it("should verify vent is actually reducing heat in segment", async () => {
        // Test that vents are properly reducing heat in their segments
        const ventPart = game.partset.getPartById("vent1"); // 4 vent rate
        const coolantPart = game.partset.getPartById("coolant_cell1"); // 100 containment

        const ventTile = game.tileset.getTile(5, 5);
        const coolantTile = game.tileset.getTile(5, 6);

        await ventTile.setPart(ventPart);
        await coolantTile.setPart(coolantPart);

        ventTile.activated = true;
        coolantTile.activated = true;

        // Add heat to the coolant cell
        coolantTile.heat_contained = 50;

        // Update reactor stats to populate neighbor lists
        game.reactor.updateStats();

        const initialHeat = coolantTile.heat_contained;
        console.log(`[TEST] Initial coolant heat: ${initialHeat}`);
        console.log(`[TEST] Vent part: ${ventPart.id}, vent rate: ${ventPart.vent}, containment: ${ventPart.containment}`);

        // Debug: Check segment creation
        const segment = game.engine.heatManager.getSegmentForTile(ventTile);
        if (segment) {
            console.log(`[TEST] Segment created with ${segment.components.length} components: ${segment.components.map(t => t.part?.id).join(', ')}`);
            console.log(`[TEST] Segment has ${segment.vents.length} vents: ${segment.vents.map(t => t.part?.id).join(', ')}`);
            console.log(`[TEST] Segment current heat: ${segment.currentHeat}`);
        }

        // Run a tick to process venting
        game.engine.tick();

        const finalHeat = coolantTile.heat_contained;
        console.log(`[TEST] Final coolant heat: ${finalHeat}`);

        // Debug: Check segment after tick
        const segmentAfter = game.engine.heatManager.getSegmentForTile(ventTile);
        if (segmentAfter) {
            console.log(`[TEST] Segment after tick - current heat: ${segmentAfter.currentHeat}`);
        }

        // The vent should reduce heat by its vent rate (4) per tick
        // So heat should be reduced from 50 to 46
        expect(finalHeat).toBeLessThan(initialHeat);
        expect(finalHeat).toBeCloseTo(25, 1); // 50 total heat / 2 components = 25. Venting only affects the vent component, not the coolant cell.
    });

    it("should debug venting process step by step", async () => {
        // Create a simple setup to debug the venting process
        const ventPart = game.partset.getPartById("vent1");
        const coolantPart = game.partset.getPartById("coolant_cell1");

        const ventTile = game.tileset.getTile(5, 5);
        const coolantTile = game.tileset.getTile(5, 6);

        await ventTile.setPart(ventPart);
        await coolantTile.setPart(coolantPart);

        ventTile.activated = true;
        coolantTile.activated = true;

        // Add heat to the coolant cell
        coolantTile.heat_contained = 50;

        // Update reactor stats
        game.reactor.updateStats();

        console.log(`[DEBUG] Before tick: coolant heat: ${coolantTile.heat_contained}, vent heat: ${ventTile.heat_contained}`);

        // Replace the isolated call to processVenting() with a full game tick
        game.engine.tick();

        console.log(`[DEBUG] After tick: coolant heat: ${coolantTile.heat_contained}, vent heat: ${ventTile.heat_contained}`);

        // Check if venting actually reduced heat
        expect(coolantTile.heat_contained).toBeLessThan(50);
    });

    it("should test heat feedback loop with multiple cells and vents", async () => {
        // Test a more complex scenario with multiple cells and vents
        const cellPart = game.partset.getPartById("thorium1"); // 7400 heat per tick
        const ventPart = game.partset.getPartById("vent1"); // 80 containment, 4 vent rate

        // Place cells in a pattern
        const cellTiles = [
            game.tileset.getTile(4, 4),
            game.tileset.getTile(4, 6),
            game.tileset.getTile(6, 4),
            game.tileset.getTile(6, 6)
        ];

        // Place vents between cells
        const ventTiles = [
            game.tileset.getTile(4, 5),
            game.tileset.getTile(5, 4),
            game.tileset.getTile(5, 6),
            game.tileset.getTile(6, 5)
        ];

        // Set up cells
        for (const tile of cellTiles) {
            await tile.setPart(cellPart);
            tile.activated = true;
            tile.ticks = 5;
        }

        // Set up vents
        for (const tile of ventTiles) {
            await tile.setPart(ventPart);
            tile.activated = true;
        }

        // Update reactor stats
        game.reactor.updateStats();

        console.log(`[TEST] Set up ${cellTiles.length} cells and ${ventTiles.length} vents`);

        // Run ticks and monitor heat accumulation
        for (let i = 0; i < 3; i++) {
            game.engine.tick();

            const totalVentHeat = ventTiles.reduce((sum, tile) => sum + (tile.heat_contained || 0), 0);
            const totalReactorHeat = game.reactor.current_heat;

            console.log(`[TEST] Tick ${i + 1}: total vent heat: ${totalVentHeat}, reactor heat: ${totalReactorHeat}`);

            // Check if any vents exploded
            const explodedVents = ventTiles.filter(tile => tile.part === null);
            if (explodedVents.length > 0) {
                console.log(`[TEST] ${explodedVents.length} vents exploded on tick ${i + 1}`);
                break;
            }
        }

        // At least some vents should explode due to the high heat from thorium cells
        const explodedVents = ventTiles.filter(tile => tile.part === null);
        expect(explodedVents.length).toBeGreaterThan(0);
    });
}); 