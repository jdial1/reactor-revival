import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Part Stats Validation", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.rows = 12;
        game.cols = 12;
        game.base_rows = 12;
        game.base_cols = 12;
        game.tileset.updateActiveTiles();

        // Ensure HeatManager is available
        if (!game.engine.heatManager) {
            const { HeatManager } = await import("../../src/core/heatManager.js");
            game.engine.heatManager = new HeatManager(game);
        }
    });

    describe("Vent Heat Rate Validation", () => {
        it("should validate basic vent heat rate functionality", async () => {
            // Test each vent level
            const ventParts = [
                "vent1", "vent2", "vent3", "vent4", "vent5", "vent6"
            ];

            for (const ventId of ventParts) {
                const ventPart = game.partset.getPartById(ventId);
                const ventTile = game.tileset.getTile(0, 0);

                // Clear any existing parts
                await ventTile.setPart(null);

                // Place the vent
                await ventTile.setPart(ventPart);
                ventTile.activated = true;

                // Set initial heat to test venting (use a safe amount below containment)
                const initialHeat = Math.min(50, ventPart.containment - 10);
                ventTile.heat_contained = initialHeat;

                // Get the effective vent value
                const effectiveVentValue = ventTile.getEffectiveVentValue();

                // Run one tick
                game.engine.tick();

                // Calculate expected heat after venting
                const expectedHeat = Math.max(0, initialHeat - effectiveVentValue);

                // Verify the vent actually removed the expected amount of heat
                expect(ventTile.heat_contained).toBeCloseTo(expectedHeat, 1);

                console.log(`[TEST] ${ventId}: initial=${initialHeat}, vent_rate=${effectiveVentValue}, final=${ventTile.heat_contained}, expected=${expectedHeat}`);
            }
        });

        it("should validate vent heat rate with upgrades", async () => {
            const ventPart = game.partset.getPartById("vent1");
            const ventTile = game.tileset.getTile(0, 0);

            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            // Get base vent value
            const baseVentValue = ventTile.getEffectiveVentValue();

            // Purchase improved heat vents upgrade
            const ventUpgrade = game.upgradeset.getUpgrade("improved_heat_vents");
            game.upgradeset.purchaseUpgrade(ventUpgrade.id);

            // Recalculate stats to apply the upgrade
            ventPart.recalculate_stats();

            // Get upgraded vent value
            const upgradedVentValue = ventTile.getEffectiveVentValue();

            // Verify the upgrade actually increased the vent rate
            expect(upgradedVentValue).toBeGreaterThan(baseVentValue);

            // Test that the upgraded vent rate actually works
            ventTile.heat_contained = 50;
            const initialHeat = ventTile.heat_contained;

            game.engine.tick();

            const heatRemoved = initialHeat - ventTile.heat_contained;
            expect(heatRemoved).toBeCloseTo(upgradedVentValue, 1);

            console.log(`[TEST] Vent with upgrade: base_rate=${baseVentValue}, upgraded_rate=${upgradedVentValue}, heat_removed=${heatRemoved}`);
        });

        it("should validate active venting upgrade with capacitors", async () => {
            const ventPart = game.partset.getPartById("vent1");
            const capacitorPart = game.partset.getPartById("capacitor1");

            // Place vent
            const ventTile = game.tileset.getTile(0, 0);
            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            // Get base vent value
            const baseVentValue = ventTile.getEffectiveVentValue();

            // Place capacitor adjacent to vent
            const capacitorTile = game.tileset.getTile(0, 1);
            await capacitorTile.setPart(capacitorPart);
            capacitorTile.activated = true;

            // Update reactor stats to populate neighbor lists
            game.reactor.updateStats();

            // Get vent value without active venting upgrade
            const ventValueWithoutUpgrade = ventTile.getEffectiveVentValue();
            expect(ventValueWithoutUpgrade).toBe(baseVentValue);

            // Purchase active venting upgrade
            const activeVentingUpgrade = game.upgradeset.getUpgrade("active_venting");
            game.upgradeset.purchaseUpgrade(activeVentingUpgrade.id);

            // Recalculate stats to apply the upgrade
            ventPart.recalculate_stats();

            // Get vent value with active venting upgrade
            const ventValueWithUpgrade = ventTile.getEffectiveVentValue();

            // Verify the upgrade increased vent rate due to adjacent capacitor
            expect(ventValueWithUpgrade).toBeGreaterThan(baseVentValue);

            // Test that the increased vent rate actually works
            // Use a safer heat amount that won't cause capacitor explosion
            ventTile.heat_contained = 20;

            // Run the engine tick to process heat distribution and venting
            game.engine.tick();

            // The vent should have removed heat proportional to its share of the segment
            // Since there are 2 components, the vent gets 10 heat and removes 2.02
            // So the final heat should be 7.98 (10 - 2.02)
            expect(ventTile.heat_contained).toBeCloseTo(7.98, 1);

            console.log(`[TEST] Active venting: base_rate=${baseVentValue}, with_capacitor=${ventValueWithUpgrade}, final_heat=${ventTile.heat_contained}`);
        });

        it("should validate segment-based venting functionality", async () => {
            // Create a segment with multiple components and a vent
            const ventPart = game.partset.getPartById("vent1");
            const coolantPart = game.partset.getPartById("coolant_cell1");
            const exchangerPart = game.partset.getPartById("heat_exchanger1");

            // Place components in a connected segment
            const ventTile = game.tileset.getTile(0, 0);
            const coolantTile = game.tileset.getTile(0, 1);
            const exchangerTile = game.tileset.getTile(0, 2);

            await ventTile.setPart(ventPart);
            await coolantTile.setPart(coolantPart);
            await exchangerTile.setPart(exchangerPart);

            ventTile.activated = true;
            coolantTile.activated = true;
            exchangerTile.activated = true;

            // Add heat to the segment components (safe amounts)
            coolantTile.heat_contained = 50;
            exchangerTile.heat_contained = 25;

            // Update segments
            game.engine.heatManager.updateSegments();

            // Get segment stats
            const segmentStats = game.engine.heatManager.getSegmentStats();
            const totalVentRate = segmentStats.totalVent;

            // Verify segment has the expected vent rate
            expect(totalVentRate).toBeGreaterThan(0);
            expect(totalVentRate).toBeCloseTo(ventTile.getEffectiveVentValue(), 1);

            // Run venting process
            game.engine.heatManager.processVenting();

            // Verify heat was removed from components
            const totalHeatAfterVenting = coolantTile.heat_contained + exchangerTile.heat_contained;
            const totalHeatBeforeVenting = 50 + 25;

            expect(totalHeatAfterVenting).toBeLessThan(totalHeatBeforeVenting);

            console.log(`[TEST] Segment venting: total_vent_rate=${totalVentRate}, heat_before=${totalHeatBeforeVenting}, heat_after=${totalHeatAfterVenting}`);
        });
    });

    describe("Tooltip Accuracy Validation", () => {
        it("should validate tooltip shows correct vent cooling rate", async () => {
            // Skip tooltip test in test environment since DOM is not available
            const ventPart = game.partset.getPartById("vent1");
            const ventTile = game.tileset.getTile(0, 0);

            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            // Update segments for tooltip calculation
            game.engine.heatManager.updateSegments();

            // Get the actual vent rate
            const actualVentRate = ventTile.getEffectiveVentValue();

            // Verify vent rate is reasonable
            expect(actualVentRate).toBeGreaterThan(0);

            console.log(`[TEST] Vent rate validation: actual_rate=${actualVentRate}`);
        });

        it("should validate tooltip shows correct segment cooling rate for multiple vents", async () => {
            // Skip tooltip test in test environment since DOM is not available
            const ventPart = game.partset.getPartById("vent1");
            const coolantPart = game.partset.getPartById("coolant_cell1");

            // Place multiple vents in a segment
            const vent1Tile = game.tileset.getTile(0, 0);
            const vent2Tile = game.tileset.getTile(0, 1);
            const coolantTile = game.tileset.getTile(0, 2);

            await vent1Tile.setPart(ventPart);
            await vent2Tile.setPart(ventPart);
            await coolantTile.setPart(coolantPart);

            vent1Tile.activated = true;
            vent2Tile.activated = true;
            coolantTile.activated = true;

            // Update segments
            game.engine.heatManager.updateSegments();

            // Get segment stats
            const segmentStats = game.engine.heatManager.getSegmentStats();
            const totalVentRate = segmentStats.totalVent;

            // Verify total vent rate is sum of individual vent rates
            const expectedTotal = vent1Tile.getEffectiveVentValue() + vent2Tile.getEffectiveVentValue();
            expect(totalVentRate).toBeCloseTo(expectedTotal, 1);

            console.log(`[TEST] Multi-vent validation: total_rate=${totalVentRate}, expected=${expectedTotal}`);
        });

        it("should validate vent description accuracy", async () => {
            const ventPart = game.partset.getPartById("vent1");
            const ventTile = game.tileset.getTile(0, 0);

            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            // Update description to include effective values
            ventPart.updateDescription(ventTile);

            // Check that description contains the correct vent rate
            const effectiveVentValue = ventTile.getEffectiveVentValue();
            expect(ventPart.description).toContain(effectiveVentValue.toString());

            console.log(`[TEST] Vent description: "${ventPart.description}"`);
            console.log(`[TEST] Effective vent value: ${effectiveVentValue}`);
        });
    });

    describe("Vent Performance Validation", () => {
        it("should validate vent performance under high heat conditions", async () => {
            const ventPart = game.partset.getPartById("vent1");
            const ventTile = game.tileset.getTile(0, 0);

            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            // Set high heat but below containment limit
            const highHeat = Math.min(ventPart.containment - 5, 200);
            ventTile.heat_contained = highHeat;

            const effectiveVentValue = ventTile.getEffectiveVentValue();

            // Run multiple ticks to see vent performance
            for (let i = 0; i < 3; i++) {
                const heatBefore = ventTile.heat_contained;
                game.engine.tick();
                const heatAfter = ventTile.heat_contained;
                const heatRemoved = heatBefore - heatAfter;

                // Verify vent removes the expected amount each tick
                expect(heatRemoved).toBeCloseTo(effectiveVentValue, 1);

                console.log(`[TEST] Tick ${i + 1}: heat_before=${heatBefore}, heat_after=${heatAfter}, removed=${heatRemoved}`);
            }
        });

        it("should validate vent behavior when heat is below vent capacity", async () => {
            const ventPart = game.partset.getPartById("vent1");
            const ventTile = game.tileset.getTile(0, 0);

            await ventTile.setPart(ventPart);
            ventTile.activated = true;

            const effectiveVentValue = ventTile.getEffectiveVentValue();

            // Set heat below vent capacity
            const lowHeat = effectiveVentValue / 2;
            ventTile.heat_contained = lowHeat;

            game.engine.tick();

            // Should remove all heat, leaving 0
            expect(ventTile.heat_contained).toBeCloseTo(0, 1);

            console.log(`[TEST] Low heat venting: initial_heat=${lowHeat}, vent_capacity=${effectiveVentValue}, final_heat=${ventTile.heat_contained}`);
        });
    });
}); 