import { describe, it, expect, beforeEach, setupGame, vi, afterEach } from "../helpers/setup.js";

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
        const cell = game.partset.getPartById("uranium1");
        const reflector = game.partset.getPartById("reflector1");

        const cellTile = game.tileset.getTile(5, 5);
        await cellTile.setPart(cell);
        cellTile.activated = true;
        cellTile.ticks = 10;

        // Baseline
        game.reactor.updateStats();
        const basePower = game.reactor.stats_power;

        // Place reflectors in four cardinal directions and one diagonal
        const cardinals = [
            game.tileset.getTile(5, 4),
            game.tileset.getTile(5, 6),
            game.tileset.getTile(4, 5),
            game.tileset.getTile(6, 5),
        ];
        const diagonal = game.tileset.getTile(4, 4);

        for (const t of cardinals) {
            await t.setPart(reflector);
            t.activated = true;
        }
        await diagonal.setPart(reflector);
        diagonal.activated = true;

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
        const vent = game.partset.getPartById("vent1");
        const reflector = game.partset.getPartById("reflector1");

        const ventTile = game.tileset.getTile(3, 3);
        const reflTile = game.tileset.getTile(3, 4);
        await ventTile.setPart(vent);
        await reflTile.setPart(reflector);
        ventTile.activated = true;
        reflTile.activated = true;

        ventTile.heat_contained = 0; // so self-venting does nothing
        game.reactor.updateStats();
        game.engine.tick();

        // Vent unchanged; reflector didn't modify neighbor state
        expect(ventTile.heat_contained).toBe(0);
    });

    it("heat outlet transfers reactor heat to cardinal containment neighbors and can overfill full neighbors (may explode)", async () => {
        const outlet = game.partset.getPartById("heat_outlet1");
        const vent = game.partset.getPartById("vent1");

        const outletTile = game.tileset.getTile(5, 5);
        const neighbor = game.tileset.getTile(5, 6); // cardinal
        const diagonal = game.tileset.getTile(4, 4); // diagonal
        await outletTile.setPart(outlet);
        await neighbor.setPart(vent);
        await diagonal.setPart(vent);
        outletTile.activated = true;
        neighbor.activated = true;
        diagonal.activated = true;

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
        expect(game.reactor.current_heat).toBeGreaterThanOrEqual(prevReactorHeat);
    });

    it("heat exchanger balances heat with cooler cardinal neighbors only", async () => {
        const exchanger = game.partset.getPartById("heat_exchanger1");
        const vent = game.partset.getPartById("vent1");

        const exchTile = game.tileset.getTile(6, 6);
        const coolNeighbor = game.tileset.getTile(6, 5); // cardinal neighbor
        const diagonal = game.tileset.getTile(5, 5); // diagonal neighbor
        await exchTile.setPart(exchanger);
        await coolNeighbor.setPart(vent);
        await diagonal.setPart(vent);
        exchTile.activated = true;
        coolNeighbor.activated = true;
        diagonal.activated = true;

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
        const vent = game.partset.getPartById("vent1");

        const ventTile = game.tileset.getTile(2, 2);
        const neighbor = game.tileset.getTile(2, 3);
        await ventTile.setPart(vent);
        await neighbor.setPart(vent);
        ventTile.activated = true;
        neighbor.activated = true;

        ventTile.heat_contained = 20;
        neighbor.heat_contained = 10;

        game.reactor.updateStats();
        game.engine.tick();

        expect(ventTile.heat_contained).toBeLessThan(20);
        // Neighbor should only change due to its own venting, not due to adjacency
        expect(neighbor.heat_contained).toBeLessThanOrEqual(10);
    });

    it("capacitor and reactor plating modify global stats without neighbor side effects", async () => {
        const cap = game.partset.getPartById("capacitor1");
        const plate = game.partset.getPartById("reactor_plating1");
        const vent = game.partset.getPartById("vent1");

        const capTile = game.tileset.getTile(0, 0);
        const plateTile = game.tileset.getTile(0, 1);
        const neighbor = game.tileset.getTile(0, 2);
        await capTile.setPart(cap);
        await plateTile.setPart(plate);
        await neighbor.setPart(vent);
        capTile.activated = true;
        plateTile.activated = true;
        neighbor.activated = true;

        neighbor.heat_contained = 0;
        const prevMaxPower = game.reactor.max_power;
        const prevMaxHeat = game.reactor.max_heat;

        game.reactor.updateStats();

        expect(game.reactor.max_power).toBeGreaterThanOrEqual(prevMaxPower);
        expect(game.reactor.max_heat).toBeGreaterThanOrEqual(prevMaxHeat);

        game.engine.tick();
        // Neighbor should remain unaffected by cap/plate (no heat pushed/pulled)
        expect(neighbor.heat_contained).toBe(0);
    });

    it("heat inlet pulls heat from adjacent components into the reactor", async () => {
        const inlet = game.partset.getPartById("heat_inlet1");
        const vent = game.partset.getPartById("vent1");

        const inletTile = game.tileset.getTile(7, 7);
        const hotNeighbor = game.tileset.getTile(7, 6);
        await inletTile.setPart(inlet);
        await hotNeighbor.setPart(vent);
        inletTile.activated = true;
        hotNeighbor.activated = true;

        hotNeighbor.heat_contained = 50;
        const prevReactorHeat = game.reactor.current_heat;

        game.reactor.updateStats();
        game.engine.tick();

        expect(hotNeighbor.heat_contained).toBeLessThan(50);
        expect(game.reactor.current_heat).toBeGreaterThan(prevReactorHeat);
    });

    it("extreme heat inlet (range 2) pulls from two-tiles-away components", async () => {
        const inlet6 = game.partset.getPartById("heat_inlet6");
        const vent = game.partset.getPartById("vent1");

        const inletTile = game.tileset.getTile(5, 5);
        const farHotNeighbor = game.tileset.getTile(5, 7); // distance 2
        await inletTile.setPart(inlet6);
        await farHotNeighbor.setPart(vent);
        inletTile.activated = true;
        farHotNeighbor.activated = true;

        farHotNeighbor.heat_contained = 50;
        const prevReactorHeat = game.reactor.current_heat;

        game.reactor.updateStats();
        game.engine.tick();

        expect(farHotNeighbor.heat_contained).toBeLessThan(50);
        expect(game.reactor.current_heat).toBeGreaterThan(prevReactorHeat);
    });

    it.skip("extreme heat outlet (range 2) pushes to two-tiles-away components", async () => {
        const outlet6 = game.partset.getPartById("heat_outlet6");
        const vent = game.partset.getPartById("vent1");

        const outletTile = game.tileset.getTile(6, 6);
        const farNeighbor = game.tileset.getTile(6, 4); // distance 2
        await outletTile.setPart(outlet6);
        await farNeighbor.setPart(vent);
        outletTile.activated = true;
        farNeighbor.activated = true;

        game.reactor.current_heat = 100;
        farNeighbor.heat_contained = 0;

        game.reactor.updateStats();
        game.engine.tick();

        expect(farNeighbor.heat_contained).toBeGreaterThan(0);
    });

    it("particle accelerator gains heat from outlet (cardinal only)", async () => {
        const outlet = game.partset.getPartById("heat_outlet1");
        const pa = game.partset.getPartById("particle_accelerator1");

        const outletTile = game.tileset.getTile(9, 9);
        const paTile = game.tileset.getTile(9, 10);
        await outletTile.setPart(outlet);
        await paTile.setPart(pa);
        outletTile.activated = true;
        paTile.activated = true;

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


