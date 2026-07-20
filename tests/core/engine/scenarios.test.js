import { describe, it, expect, beforeEach, vi, afterEach, setupGame, toNum } from "../../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../../helpers/gameHelpers.js";
import { syncGridFromGame } from "../../helpers/bridge-test-harness.js";

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
        const rflPulse = 1 + reflector.power_increase / 100;
        const pulse = 1 + 4 * rflPulse;
        const expectedPower = powerWithoutReflectors * pulse;

        expect(game.reactor.stats_power).toBeCloseTo(expectedPower);
    });



    it("should effectively manage heat in a checkerboard layout", async () => {
        game.reactor.setDefaults();
        game.reactor.max_power = 10000;
        game.reactor.altered_max_power = 10000;
        game.coreBridge.setReactorHeat(0);
        game.coreBridge.setReactorPower(0);
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

        expect(toNum(game.reactor.current_heat)).toBe(0);
        expect(ventTile1.heat_contained).toBeLessThan(ventTile1.part.containment);
        expect(ventTile2.heat_contained).toBeLessThan(ventTile2.part.containment);

        // Check that vents were placed correctly
        expect(ventTile1.part).not.toBeNull();
        expect(ventTile1.part.category).toBe("vent");
        expect(ventTile1.activated).toBe(true);

        expect(ventTile2.part).not.toBeNull();
        expect(ventTile2.part.category).toBe("vent");
        expect(ventTile2.activated).toBe(true);
    });

    it("should handle grid expansion and part placement on new edges", async () => {
        const initialRows = game.rows;
        const initialCols = game.cols;

        forcePurchaseUpgrade(game, "expand_reactor_rows");
        forcePurchaseUpgrade(game, "expand_reactor_cols");
        game.coreBridge.projectLiveState();
        expect(game.rows).toBe(initialRows + 1);
        expect(game.cols).toBe(initialCols + 1);
        if (typeof game.tileset.resize === "function") {
          game.tileset.resize(game.rows, game.cols);
        }
        game.tileset.updateActiveTiles();
        game.coreBridge.session?.grid?.resize?.(game.rows, game.cols);
        syncGridFromGame(game);
        expect(game.tileset.getTile(initialRows, 5)).toBeTruthy();
        expect(game.tileset.getTile(initialRows, initialCols)).toBeTruthy();

        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");

        const newEdgeTileRow = await placePart(game, initialRows, 5, "uranium1");
        const cornerTile = await placePart(game, initialRows, initialCols, "reflector1");

        expect(newEdgeTileRow.enabled).toBe(true);
        expect(cornerTile.enabled).toBe(true);

        game.reactor.updateStats();
        const neighborOfCorner = await placePart(game, initialRows, initialCols - 1, "uranium1");
        game.reactor.updateStats();

        expect(newEdgeTileRow.part.id).toBe("uranium1");
        expect(cornerTile.part.id).toBe("reflector1");
        const rflPulse = 1 + reflector.power_increase / 100;
        const boostedCellPower = cell.power * (1 + rflPulse);
        const plainCellPower = cell.power;
        expect(game.reactor.stats_power).toBeGreaterThan(cell.power * 2);
        expect(game.reactor.stats_power).toBeCloseTo(boostedCellPower + plainCellPower);
    });

    it("should handle Forceful Fusion upgrade with high heat", async () => {
        forcePurchaseUpgrade(game, "forceful_fusion");

        for (let i = 0; i < 5; i++) {
            await placePart(game, i, 0, "plutonium3");
        }

        for (let i = 0; i < 5; i++) {
            game.engine.tick();
        }
        expect(toNum(game.reactor.current_heat)).toBeGreaterThan(1000);

        expect(toNum(game.reactor.stats_power)).toBeGreaterThan(100);
        game.engine.tick();
        expect(toNum(game.reactor.current_power)).toBeGreaterThanOrEqual(0);
    });

}); 