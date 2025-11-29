import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";

describe("Complex Grid Scenarios and Interactions", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Use fake timers to control engine ticks precisely
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should correctly stack bonuses from multiple reflectors on a single cell", async () => {
        // ARRANGE
        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");

        const cellTile = game.tileset.getTile(5, 5);
        await cellTile.setPart(cell);
        await game.tileset.getTile(4, 5).setPart(reflector);
        await game.tileset.getTile(6, 5).setPart(reflector);
        await game.tileset.getTile(5, 4).setPart(reflector);
        await game.tileset.getTile(5, 6).setPart(reflector);

        game.reactor.updateStats();
        const powerWithoutReflectors = cell.power;
        const expectedPower = powerWithoutReflectors * (1 + (reflector.power_increase * 4) / 100);

        // ACT & ASSERT
        expect(game.reactor.stats_power).toBeCloseTo(expectedPower);
    });



    it("should test heat exchanger functionality", async () => {
        // ARRANGE
        const cell = game.partset.getPartById("uranium1"); // Use uranium instead of thorium
        const exchanger = game.partset.getPartById("heat_exchanger1");

        // Place cell and exchanger adjacent to each other
        await game.tileset.getTile(5, 1).setPart(cell);
        await game.tileset.getTile(5, 2).setPart(exchanger);

        // Check parts immediately after placement
        const cellTile = game.tileset.getTile(5, 1);
        const exchangerTile = game.tileset.getTile(5, 2);

        expect(cellTile.part).not.toBeNull();
        expect(exchangerTile.part).not.toBeNull();
        expect(exchangerTile.part.category).toBe("heat_exchanger");

        // ACT
        game.engine.tick(); // Cell generates heat

        // ASSERT
        // The cell's heat goes to the exchanger, not the reactor core.
        expect(game.reactor.current_heat).toBe(0);
        expect(exchangerTile.heat_contained).toBeGreaterThan(0);

        // The exchanger should still be in place
        expect(exchangerTile.part).not.toBeNull();
        expect(exchangerTile.part.category).toBe("heat_exchanger");
        expect(exchangerTile.activated).toBe(true);
    });

    it("should effectively manage heat in a checkerboard layout", async () => {
        // ARRANGE
        const cell = game.partset.getPartById("plutonium2");
        const vent = game.partset.getPartById("vent3");

        // Reset reactor state completely
        game.reactor.setDefaults();
        
        // Increase max_power significantly to prevent power overflow from being converted to heat
        // This allows the test to focus on heat management rather than power overflow
        game.reactor.max_power = 10000;
        game.reactor.altered_max_power = 10000;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
        
        // Ensure no power multiplier is applied
        game.reactor.power_multiplier = 1;

        // Create a simple 2x2 pattern to test
        await game.tileset.getTile(0, 0).setPart(cell);
        await game.tileset.getTile(0, 1).setPart(vent);
        await game.tileset.getTile(1, 0).setPart(vent);
        await game.tileset.getTile(1, 1).setPart(cell);

        // Ensure tileset is updated and neighbor caches are populated
        game.tileset.updateActiveTiles();
        game.reactor.updateStats();
        
        // Invalidate all neighbor caches to force recalculation
        for (let r = 0; r < game.rows; r++) {
            for (let c = 0; c < game.cols; c++) {
                game.tileset.getTile(r, c).invalidateNeighborCaches();
            }
        }
        game.reactor.updateStats();

        // ACT
        game.engine.tick();

        // ASSERT
        // All heat from cells is transferred to adjacent vents.
        expect(game.reactor.current_heat).toBe(0);
        const ventTile1 = game.tileset.getTile(0, 1);
        const ventTile2 = game.tileset.getTile(1, 0);
        // Vents receive and then dissipate heat in the same tick.
        expect(ventTile1.heat_contained).toBe(0);
        expect(ventTile2.heat_contained).toBe(0);

        // Check that vents were placed correctly
        expect(ventTile1.part).not.toBeNull();
        expect(ventTile1.part.category).toBe("vent");
        expect(ventTile1.activated).toBe(true);

        expect(ventTile2.part).not.toBeNull();
        expect(ventTile2.part.category).toBe("vent");
        expect(ventTile2.activated).toBe(true);
    });

    it("should test coolant cell functionality", async () => {
        // ARRANGE
        const cell = game.partset.getPartById("uranium1"); // Use uranium instead of nefastium
        const coolant = game.partset.getPartById("coolant_cell1"); // Use regular coolant cell for testing

        // Place cell and coolant adjacent to each other
        await game.tileset.getTile(5, 5).setPart(cell);
        const coolantTile = game.tileset.getTile(5, 6);
        await coolantTile.setPart(coolant);

        // Check part immediately after placement
        expect(coolantTile.part).not.toBeNull();
        expect(coolantTile.part.category).toBe("coolant_cell");

        const initialPower = game.reactor.current_power;
        game.reactor.updateStats();

        // ACT
        game.engine.tick();

        // ASSERT
        // The cell should generate power and heat
        expect(game.reactor.current_power).toBeGreaterThan(initialPower);
        // The cell's heat goes to the coolant cell, not the reactor core.
        expect(game.reactor.current_heat).toBe(0);
        expect(coolantTile.heat_contained).toBeGreaterThan(0);

        // The coolant cell should be properly set up
        expect(coolantTile.part).not.toBeNull();
        expect(coolantTile.part.category).toBe("coolant_cell");
        expect(coolantTile.activated).toBe(true);
    });

    it("should handle grid expansion and part placement on new edges", async () => {
        // ARRANGE
        const initialRows = game.rows;
        const initialCols = game.cols;
        const rowUpgrade = game.upgradeset.getUpgrade("expand_reactor_rows");
        const colUpgrade = game.upgradeset.getUpgrade("expand_reactor_cols");

        // ACT: Expand the grid
        rowUpgrade.setLevel(1);
        colUpgrade.setLevel(1);

        // ASSERT: Grid size is updated
        expect(game.rows).toBe(initialRows + 1);
        expect(game.cols).toBe(initialCols + 1);

        // ARRANGE: Place parts on new edges
        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");
        const newEdgeTileRow = game.tileset.getTile(initialRows, 5);
        const newEdgeTileCol = game.tileset.getTile(5, initialCols);
        const cornerTile = game.tileset.getTile(initialRows, initialCols);

        expect(newEdgeTileRow.enabled).toBe(true);
        expect(newEdgeTileCol.enabled).toBe(true);
        expect(cornerTile.enabled).toBe(true);

        await newEdgeTileRow.setPart(cell);
        await cornerTile.setPart(reflector);

        // ACT: Check interaction
        game.reactor.updateStats();
        const neighborOfCorner = game.tileset.getTile(initialRows, initialCols - 1);
        await neighborOfCorner.setPart(cell);
        game.reactor.updateStats();

        // ASSERT
        expect(newEdgeTileRow.part.id).toBe("uranium1");
        expect(cornerTile.part.id).toBe("reflector1");
        // Check if the reflector is affecting the cell placed next to it on the new edge
        const expectedPower = cell.power * (1 + reflector.power_increase / 100);
        expect(game.reactor.stats_power).toBeGreaterThan(cell.power * 2); // Two cells, one is boosted
        expect(game.reactor.stats_power).toBeCloseTo(cell.power + expectedPower);
    });

    it("should handle Forceful Fusion upgrade with high heat", async () => {
        const fusionUpgrade = game.upgradeset.getUpgrade("forceful_fusion");
        if (fusionUpgrade) fusionUpgrade.setLevel(1);

        // Place multiple high-heat cells to generate heat naturally
        const cellPart = game.partset.getPartById("plutonium3");
        for (let i = 0; i < 5; i++) {
            await game.tileset.getTile(i, 0).setPart(cellPart);
        }

        // Run the engine for a few ticks to accumulate heat
        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }
        expect(game.reactor.current_heat).toBeGreaterThan(1000);

        const basePower = game.reactor.stats_power;
        game.engine.tick();
        expect(game.reactor.current_power).toBeGreaterThan(basePower);
    });

}); 