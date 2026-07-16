import { describe, it, expect, beforeEach, vi, afterEach, setupGame , syncActivePartsAtTickBoundary} from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";

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
        game.tileset.clearAllTiles();

        const coolantTile1 = await placePart(game, 3, 5, "coolant_cell1");
        const valveTile1 = await placePart(game, 3, 6, "overflow_valve");
        const ventTile1 = await placePart(game, 3, 7, "vent1");

        coolantTile1.heat_contained = 1000;
        valveTile1.heat_contained = 0;
        ventTile1.heat_contained = 100;

        const coolantTile2 = await placePart(game, 5, 5, "coolant_cell1");
        const valveTile2 = await placePart(game, 5, 6, "overflow_valve");
        const ventTile2 = await placePart(game, 5, 7, "vent1");

        coolantTile2.heat_contained = 1700;
        valveTile2.heat_contained = 0;
        ventTile2.heat_contained = 0;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

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
        game.tileset.clearAllTiles();
        const coolantTile = await placePart(game, 5, 5, "coolant_cell1");
        const valveTile = await placePart(game, 5, 6, "overflow_valve");
        const ventTile = await placePart(game, 5, 7, "vent1");

        coolantTile.heat_contained = 1000;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 100;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

        game.engine.tick();

        expect(ventTile.heat_contained).toBeLessThan(100);
    });

    it("should debug valve processing step by step", async () => {
        game.tileset.clearAllTiles();
        const coolantTile = await placePart(game, 5, 5, "coolant_cell1");
        const valveTile = await placePart(game, 5, 6, "overflow_valve");
        const ventTile = await placePart(game, 5, 7, "vent1");

        coolantTile.heat_contained = 1700;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 0;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

        game.engine.tick();

        expect(coolantTile.heat_contained).toBeLessThan(1700);
        expect(ventTile.heat_contained).toBeGreaterThan(0);
    });

    it("should process valve at top-left corner without out-of-bounds", async () => {
        game.tileset.clearAllTiles();
        const coolantTile = await placePart(game, 1, 0, "coolant_cell1");
        const valveTile = await placePart(game, 0, 0, "overflow_valve");
        const ventTile = await placePart(game, 0, 1, "vent1");

        coolantTile.heat_contained = 1700;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 0;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

        expect(() => game.engine.tick()).not.toThrow();
        expect(coolantTile.heat_contained).toBeLessThan(1700);
    });

    it("should process valve at bottom-right corner without out-of-bounds", async () => {
        const rows = game.rows - 1;
        const cols = game.cols - 1;
        game.tileset.clearAllTiles();
        const coolantTile = await placePart(game, rows, cols - 1, "coolant_cell1");
        const valveTile = await placePart(game, rows, cols, "overflow_valve");
        const ventTile = await placePart(game, rows - 1, cols, "vent1");

        coolantTile.heat_contained = 1700;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 0;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

        expect(() => game.engine.tick()).not.toThrow();
        expect(coolantTile.heat_contained).toBeLessThan(1700);
    });

    it("should process valve at left edge (col 0) without out-of-bounds", async () => {
        game.tileset.clearAllTiles();
        const coolantTile = await placePart(game, 4, 0, "coolant_cell1");
        const valveTile = await placePart(game, 5, 0, "overflow_valve");
        const ventTile = await placePart(game, 6, 0, "vent1");

        coolantTile.heat_contained = 1700;
        valveTile.heat_contained = 0;
        ventTile.heat_contained = 0;

        game.reactor.updateStats();
        syncActivePartsAtTickBoundary(game.engine);

        expect(() => game.engine.tick()).not.toThrow();
    });
});
