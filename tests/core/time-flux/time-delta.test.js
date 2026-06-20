import { describe, it, expect, beforeEach, vi, afterEach, setupGame, toNum } from "../../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../../helpers/gameHelpers.js";

describe("Time Delta Physics Scaling", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.loop_wait = 1000;
        game.bypass_tech_tree_restrictions = true;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should scale cell power and heat generation by multiplier", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        const part = tile.part;
        const basePower = part.base_power;
        const baseHeat = part.base_heat;
        
        game.reactor.current_power = 0;
        game.reactor.current_heat = 0;

        game.engine._processTick(1.0);

        expect(toNum(game.reactor.current_power)).toBe(toNum(basePower));
        expect(toNum(game.reactor.current_heat)).toBe(toNum(baseHeat));

        game.reactor.current_power = 0;
        game.reactor.current_heat = 0;

        game.engine._processTick(2.0);

        expect(toNum(game.reactor.current_power)).toBe(toNum(basePower) * 2);
        expect(toNum(game.reactor.current_heat)).toBe(toNum(baseHeat) * 2);

        game.reactor.current_power = 0;
        game.reactor.current_heat = 0;

        game.engine._processTick(0.5);

        expect(toNum(game.reactor.current_power)).toBe(toNum(basePower) * 0.5);
        expect(toNum(game.reactor.current_heat)).toBe(toNum(baseHeat) * 0.5);
    });

    it("should decrease component lifespan based on multiplier", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        const initialTicks = tile.ticks;
        
        game.engine._processTick(1.5);
        
        expect(tile.ticks).toBe(initialTicks - 1.5);
    });

    it("should scale heat transfer rates by multiplier", async () => {
        const ventTile = await placePart(game, 0, 0, "vent1");
        const vent = ventTile.part;
        
        const initialHeat = 50;
        ventTile.heat_contained = initialHeat;
        const baseVentRate = vent.vent;

        game.engine._processTick(2.0);

        const expectedHeat = Math.max(0, initialHeat - (baseVentRate * 2.0));
        expect(ventTile.heat_contained).toBe(expectedHeat);
    });

    it("should scale valve transfer rates by multiplier", async () => {
        const t1 = await placePart(game, 0, 0, "coolant_cell1");
        const t2 = await placePart(game, 1, 0, "overflow_valve");
        const t3 = await placePart(game, 2, 0, "coolant_cell1");

        t1.part.containment = 10000;
        t1.heat_contained = 8000;

        t3.heat_contained = 0;
        t3.part.containment = 10000;

        game.engine.markPartCacheAsDirty();
        game.engine._updatePartCaches();
        game.engine._updateValveNeighborCache();

        const baseTransfer = t2.getEffectiveTransferValue();
        const multiplier = 2.5;

        game.engine._processTick(multiplier);

        const actualTransfer = t3.heat_contained;
        const expectedTransferCapped = Math.min(baseTransfer * multiplier, 8000);

        expect(t1.heat_contained + actualTransfer).toBe(8000);
        if (actualTransfer > 0) {
            expect(actualTransfer).toBeCloseTo(expectedTransferCapped);
            expect(t1.heat_contained).toBeCloseTo(8000 - expectedTransferCapped);
        }
    });

    it("should generate fractional power for small multipliers (prevent stalling at high FPS)", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        const part = tile.part;
        const smallMultiplier = 0.016;
        const expectedPower = part.base_power * smallMultiplier;

        game.reactor.current_power = 0;
        game.engine._processTick(smallMultiplier);
        
        expect(toNum(game.reactor.current_power)).toBeCloseTo(toNum(expectedPower), 4);
        expect(toNum(game.reactor.current_power)).toBeGreaterThan(0);
    });

    it("keeps loop_wait at foundational tick after chronometer upgrade", async () => {
        game.bypass_tech_tree_restrictions = true;
        const upgrade = game.upgradeset.getUpgrade("chronometer");
        expect(upgrade.level).toBe(0);
        expect(game.loop_wait).toBe(1000);
        forcePurchaseUpgrade(game, "chronometer");
        expect(upgrade.level).toBe(1);
        expect(game.loop_wait).toBe(1000);
    });

    describe("Offline accumulator", () => {
        it("does not change accumulator from RAF loop alone", () => {
            game.tileset.clearAllTiles();
            game.engine.markPartCacheAsDirty();
            game.engine._updatePartCaches();
            game.engine.time_accumulator = 5000;
            const processSpy = vi.spyOn(game.engine, "_processTick");
            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, "requestAnimationFrame").mockReturnValue(123);
            game.engine.running = true;
            game.engine.last_timestamp = 1000;
            game.engine.loop(130001);
            expect(processSpy).not.toHaveBeenCalled();
            expect(game.engine.time_accumulator).toBe(5000);
            rafSpy.mockRestore();
        });
    });
});
