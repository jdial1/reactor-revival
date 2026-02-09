import { describe, it, expect, beforeEach, setupGame, vi, afterEach, toNum } from "../helpers/setup.js";
import { placePart } from "../helpers/gameHelpers.js";

describe("Neighbor Interactions", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        // Use a predictable environment
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("cells only receive reflector bonuses from cardinal-adjacent reflectors", async () => {
        await placePart(game, 5, 5, "uranium1");
        
        game.reactor.updateStats();
        const basePower = game.reactor.stats_power;

        const cardinals = [
            await placePart(game, 5, 4, "reflector1"),
            await placePart(game, 5, 6, "reflector1"),
            await placePart(game, 4, 5, "reflector1"),
            await placePart(game, 6, 5, "reflector1"),
        ];
        
        await placePart(game, 4, 4, "reflector1");

        game.reactor.updateStats();
        const withCardinals = game.reactor.stats_power;

        // Remove diagonal effect by comparing against baseline + expected increases
        expect(withCardinals).toBeGreaterThan(basePower);

        // Now remove one cardinal reflector and ensure power decreases
        await cardinals[0].clearPart(false);
        game.reactor.updateStats();
        const afterRemoval = game.reactor.stats_power;
        expect(afterRemoval).toBeLessThan(withCardinals);

        // Ensure diagonal-only placement does not affect
        for (let i = 1; i < cardinals.length; i++) {
            await cardinals[i].clearPart(false);
        }
        game.reactor.updateStats();
        const withOnlyDiagonal = game.reactor.stats_power;
        expect(withOnlyDiagonal).toBeCloseTo(basePower);
    });

    it("reflectors do not affect non-cell neighbors", async () => {
        const ventTile = await placePart(game, 3, 3, "vent1");
        await placePart(game, 3, 4, "reflector1");

        ventTile.heat_contained = 0; // so self-venting does nothing
        game.reactor.updateStats();
        game.engine.tick();

        // Vent unchanged; reflector didn't modify neighbor state
        expect(ventTile.heat_contained).toBe(0);
    });

    it("heat outlet transfers reactor heat to cardinal containment neighbors and can overfill full neighbors (may explode)", async () => {
        await placePart(game, 5, 5, "heat_outlet1");
        const neighbor = await placePart(game, 5, 6, "vent1");
        const diagonal = await placePart(game, 4, 4, "vent1");

        game.reactor.current_heat = 100;
        neighbor.heat_contained = 0;
        diagonal.heat_contained = 0;

        game.reactor.updateStats();
        game.engine.tick();

        expect(neighbor.heat_contained).toBeGreaterThan(0);
        expect(diagonal.heat_contained).toBe(0);

        // Fill neighbor to capacity; outlet may still push heat over capacity, potentially causing explosion
        const prevReactorHeat = game.reactor.current_heat;
        const capacity = neighbor.part.containment;
        neighbor.heat_contained = capacity;
        game.engine.tick();
        // If component did not explode, it should have been overfilled
        if (neighbor.part) {
            expect(neighbor.heat_contained).toBeGreaterThan(capacity);
        } else {
            // If it exploded, part should be cleared
            expect(neighbor.part).toBeNull();
        }
        // Reactor heat should not be lower than before (transfer and/or explosion returns heat)
        expect(toNum(game.reactor.current_heat)).toBeGreaterThanOrEqual(toNum(prevReactorHeat));
    });

    it("heat exchanger balances heat with cooler cardinal neighbors only", async () => {
        const exchTile = await placePart(game, 6, 6, "heat_exchanger1");
        const coolNeighbor = await placePart(game, 6, 5, "vent1");
        const diagonal = await placePart(game, 5, 5, "vent1");

        exchTile.heat_contained = 100;
        coolNeighbor.heat_contained = 0;
        diagonal.heat_contained = 0;

        game.reactor.updateStats();
        game.engine.tick();

        expect(exchTile.heat_contained).toBeLessThan(100);
        expect(coolNeighbor.heat_contained).toBeGreaterThan(0);
        expect(diagonal.heat_contained).toBe(0);
    });

    it("vents reduce only their own heat and do not modify neighbors", async () => {
        const ventTile = await placePart(game, 2, 2, "vent1");
        const neighbor = await placePart(game, 2, 3, "vent1");

        ventTile.heat_contained = 20;
        neighbor.heat_contained = 10;

        game.reactor.updateStats();
        game.engine.tick();

        expect(ventTile.heat_contained).toBeLessThan(20);
        // Neighbor should only change due to its own venting, not due to adjacency
        expect(neighbor.heat_contained).toBeLessThanOrEqual(10);
    });

    it("capacitor and reactor plating modify global stats without neighbor side effects", async () => {
        await placePart(game, 0, 0, "capacitor1");
        await placePart(game, 0, 1, "reactor_plating1");
        const neighbor = await placePart(game, 0, 2, "vent1");

        neighbor.heat_contained = 0;
        const prevMaxPower = game.reactor.max_power;
        const prevMaxHeat = game.reactor.max_heat;

        game.reactor.updateStats();

        expect(toNum(game.reactor.max_power)).toBeGreaterThanOrEqual(toNum(prevMaxPower));
        expect(toNum(game.reactor.max_heat)).toBeGreaterThanOrEqual(toNum(prevMaxHeat));

        game.engine.tick();
        // Neighbor should remain unaffected by cap/plate (no heat pushed/pulled)
        expect(neighbor.heat_contained).toBe(0);
    });

    it("heat inlet pulls heat from adjacent components into the reactor", async () => {
        await placePart(game, 7, 7, "heat_inlet1");
        const hotNeighbor = await placePart(game, 7, 6, "vent1");

        hotNeighbor.heat_contained = 50;
        const prevReactorHeat = game.reactor.current_heat;

        game.reactor.updateStats();
        game.engine.tick();

        expect(hotNeighbor.heat_contained).toBeLessThan(50);
        expect(toNum(game.reactor.current_heat)).toBeGreaterThan(toNum(prevReactorHeat));
    });

    it("extreme heat inlet (range 2) pulls from two-tiles-away components", async () => {
        await placePart(game, 5, 5, "heat_inlet6");
        const farHotNeighbor = await placePart(game, 5, 7, "vent1");

        farHotNeighbor.heat_contained = 50;
        const prevReactorHeat = game.reactor.current_heat;

        game.reactor.updateStats();
        game.engine.tick();

        expect(farHotNeighbor.heat_contained).toBeLessThan(50);
        expect(toNum(game.reactor.current_heat)).toBeGreaterThan(toNum(prevReactorHeat));
    });

    it("extreme heat outlet (range 2) pushes to two-tiles-away components", async () => {
        await placePart(game, 6, 6, "heat_outlet6");
        const farNeighbor = await placePart(game, 6, 4, "vent1");

        game.reactor.current_heat = 100;
        farNeighbor.heat_contained = 0;

        game.reactor.updateStats();
        game.engine.tick();

        expect(farNeighbor.heat_contained).toBeGreaterThan(0);
    });

    it("particle accelerator gains heat from outlet (cardinal only)", async () => {
        await placePart(game, 9, 9, "heat_outlet1");
        const paTile = await placePart(game, 9, 10, "particle_accelerator1");

        // Provide reactor heat for outlet to push into PA
        game.reactor.current_heat = 200;

        game.reactor.updateStats();
        game.engine.tick();

        // PA should have received some heat from outlet
        expect(paTile.heat_contained).toBeGreaterThan(0);

        // Run a few more ticks to continue heat flow; EP generation requires massive heat, so we don't assert it here
        for (let i = 0; i < 3; i++) game.engine.tick();
        expect(paTile.heat_contained).toBeGreaterThan(0);
    });
});


