import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../helpers/gameHelpers.js";

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
        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");

        const cellTile = await placePart(game, 5, 5, "uranium1");
        await placePart(game, 4, 5, "reflector1");
        await placePart(game, 6, 5, "reflector1");
        await placePart(game, 5, 4, "reflector1");
        await placePart(game, 5, 6, "reflector1");

        game.reactor.updateStats();
        const powerWithoutReflectors = cell.power;
        const expectedPower = powerWithoutReflectors * (1 + (reflector.power_increase * 4) / 100);

        // ACT & ASSERT
        expect(game.reactor.stats_power).toBeCloseTo(expectedPower);
    });



    it("should test heat exchanger functionality", async () => {
        const cellTile = await placePart(game, 5, 1, "uranium1");
        const exchangerTile = await placePart(game, 5, 2, "heat_exchanger1");

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
        game.reactor.setDefaults();
        game.reactor.max_power = 10000;
        game.reactor.altered_max_power = 10000;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
        game.reactor.power_multiplier = 1;

        await placePart(game, 0, 0, "plutonium2");
        const ventTile1 = await placePart(game, 0, 1, "vent3");
        const ventTile2 = await placePart(game, 1, 0, "vent3");
        await placePart(game, 1, 1, "plutonium2");

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

        expect(game.reactor.current_heat).toBe(0);
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
        await placePart(game, 5, 5, "uranium1");
        const coolantTile = await placePart(game, 5, 6, "coolant_cell1");

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
        const initialRows = game.rows;
        const initialCols = game.cols;

        forcePurchaseUpgrade(game, "expand_reactor_rows");
        forcePurchaseUpgrade(game, "expand_reactor_cols");

        expect(game.rows).toBe(initialRows + 1);
        expect(game.cols).toBe(initialCols + 1);

        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");

        const newEdgeTileRow = await placePart(game, initialRows, 5, "uranium1");
        const cornerTile = await placePart(game, initialRows, initialCols, "reflector1");

        expect(newEdgeTileRow.enabled).toBe(true);
        expect(cornerTile.enabled).toBe(true);

        game.reactor.updateStats();
        const neighborOfCorner = await placePart(game, initialRows, initialCols - 1, "uranium1");
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
        forcePurchaseUpgrade(game, "forceful_fusion");

        for (let i = 0; i < 5; i++) {
            await placePart(game, i, 0, "plutonium3");
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