import { describe, it, expect, beforeEach, vi, afterEach, setupGame } from "../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../helpers/gameHelpers.js";

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

        expect(game.reactor.current_power).toBe(basePower);
        expect(game.reactor.current_heat).toBe(baseHeat);

        game.reactor.current_power = 0;
        game.reactor.current_heat = 0;

        game.engine._processTick(2.0);

        expect(game.reactor.current_power).toBe(basePower * 2);
        expect(game.reactor.current_heat).toBe(baseHeat * 2);

        game.reactor.current_power = 0;
        game.reactor.current_heat = 0;

        game.engine._processTick(0.5);

        expect(game.reactor.current_power).toBe(basePower * 0.5);
        expect(game.reactor.current_heat).toBe(baseHeat * 0.5);
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

        const expectedTransfer = baseTransfer * multiplier;
        
        expect(t1.heat_contained + expectedTransfer).toBe(8000);
        expect(8000).toBeGreaterThan(expectedTransfer); 

        expect(t3.heat_contained).toBeCloseTo(expectedTransfer);
        expect(t1.heat_contained).toBeCloseTo(8000 - expectedTransfer);
    });

    it("should calculate correct multiplier from timestamps in the loop", async () => {
        vi.useFakeTimers();
        await placePart(game, 0, 0, "uranium1");
        game.engine.markPartCacheAsDirty();
        
        game.engine.start();
        
        const initialTime = game.engine.last_timestamp;
        const tickDuration = game.loop_wait;
        
        const tickSpy = vi.spyOn(game.engine, '_processTick');
        
        const nextTime = initialTime + (tickDuration * 1.5);
        game.engine.loop(nextTime);
        
        expect(tickSpy).toHaveBeenCalledTimes(1);
        const actualMultiplier = tickSpy.mock.calls[0][0];
        expect(actualMultiplier).toBeCloseTo(1.5, 10);
        
        vi.useRealTimers();
    });

    it("should clamp maximum multiplier to avoid spiral of death on massive lag spikes", async () => {
        await placePart(game, 0, 0, "uranium1");
        game.engine.markPartCacheAsDirty();
        
        game.time_flux = false;
        
        const tickSpy = vi.spyOn(game.engine, '_processTick');
        game.engine.start();
        
        const initialTime = game.engine.last_timestamp;
        const targetTickDuration = game.loop_wait;
        const nextTime = initialTime + (targetTickDuration * 15);
        
        game.engine.loop(nextTime);
        
        expect(tickSpy).toHaveBeenCalledTimes(1);
        expect(tickSpy).toHaveBeenCalledWith(10.0);
    });

    it("should generate fractional power for small multipliers (prevent stalling at high FPS)", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        const part = tile.part;
        const smallMultiplier = 0.016;
        const expectedPower = part.base_power * smallMultiplier;

        game.reactor.current_power = 0;
        game.engine._processTick(smallMultiplier);
        
        expect(game.reactor.current_power).toBeCloseTo(expectedPower, 4);
        expect(game.reactor.current_power).toBeGreaterThan(0);
    });

    it("should correctly handle Clock Cycle Accelerator upgrade (+1 tick/sec)", async () => {
        vi.useFakeTimers();
        game.bypass_tech_tree_restrictions = true;
        await placePart(game, 0, 0, "uranium1");
        game.engine.markPartCacheAsDirty();
        
        const upgrade = game.upgradeset.getUpgrade("chronometer");
        expect(upgrade.level).toBe(0);
        expect(game.loop_wait).toBe(1000);
        
        game.engine.last_timestamp = 0;
        game.engine.start();
        
        const t0 = game.engine.last_timestamp;
        const tickSpy = vi.spyOn(game.engine, '_processTick');
        game.engine.loop(t0 + 1000);
        expect(tickSpy.mock.calls[0][0]).toBeCloseTo(1.0, 5);
        tickSpy.mockClear();
        
        forcePurchaseUpgrade(game, "chronometer");
        expect(upgrade.level).toBe(1);
        expect(game.loop_wait).toBe(500); 

        const t1 = game.engine.last_timestamp;
        
        game.engine.loop(t1 + 1000);

        expect(tickSpy.mock.calls[0][0]).toBeCloseTo(2.0, 5);
        tickSpy.mockClear();

        forcePurchaseUpgrade(game, "chronometer", 2);
        forcePurchaseUpgrade(game, "chronometer", 3);
        
        expect(upgrade.level).toBe(3);
        expect(game.loop_wait).toBe(250);

        const t2 = game.engine.last_timestamp;
        game.engine.loop(t2 + 1000);

        expect(tickSpy.mock.calls[0][0]).toBeCloseTo(4.0, 5);

        vi.useRealTimers();
    });

    describe("Time Banking Logic", () => {
        it("should NOT accumulate time when reactor is empty during normal play (small delta)", () => {
            game.tileset.clearAllTiles();
            game.engine.markPartCacheAsDirty();
            // Ensure caches are updated so active_cells is 0
            game.engine._updatePartCaches();

            game.engine.time_accumulator = 5000;
            const processSpy = vi.spyOn(game.engine, '_processTick');

            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, 'requestAnimationFrame').mockReturnValue(123);
            game.engine.running = true;
            game.engine.last_timestamp = 1000;
            game.engine.loop(1016); // Delta 16ms (standard frame)

            expect(processSpy).not.toHaveBeenCalled();
            // Should NOT have added the 16ms to the existing 5000
            expect(game.engine.time_accumulator).toBe(5000);
            rafSpy.mockRestore();
        });

        it("should accumulate time when reactor is empty IF delta is large (>30s)", () => {
            game.tileset.clearAllTiles();
            game.engine.markPartCacheAsDirty();
            // Ensure caches are updated
            game.engine._updatePartCaches();

            game.engine.time_accumulator = 5000;
            const processSpy = vi.spyOn(game.engine, '_processTick');

            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, 'requestAnimationFrame').mockReturnValue(123);
            game.engine.running = true;
            game.engine.last_timestamp = 100000;
            game.engine.loop(130001); // Delta 30001ms

            expect(processSpy).not.toHaveBeenCalled();
            // Should HAVE added the 30001ms because it exceeds threshold
            expect(game.engine.time_accumulator).toBe(35001);
            rafSpy.mockRestore();
        });

        it("should spend banked time rapidly once a cell is placed", async () => {
            game.tileset.clearAllTiles();
            game.engine.time_accumulator = 5000;
            await placePart(game, 0, 0, "uranium1");
            game.engine.markPartCacheAsDirty();

            const processSpy = vi.spyOn(game.engine, '_processTick');
            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, 'requestAnimationFrame').mockReturnValue(123);
            game.engine.running = true;
            game.engine.last_timestamp = 1000;
            game.engine.loop(1016); // Small delta, but we have parts now

            expect(processSpy).toHaveBeenCalled();
            // Should process roughly 5 ticks (5000ms / 1000ms) plus the new 16ms fraction (0.016)
            expect(processSpy.mock.calls[0][0]).toBeGreaterThanOrEqual(5.016); 
            expect(game.engine.time_accumulator).toBeLessThan(1000);
            rafSpy.mockRestore();
        });

        it("should preserve banked time if Time Flux is disabled", async () => {
            game.tileset.clearAllTiles();
            game.engine.time_accumulator = 50000;
            game.time_flux = false;
            game.loop_wait = 1000;
            await placePart(game, 0, 0, "uranium1");
            game.engine.markPartCacheAsDirty();

            const processSpy = vi.spyOn(game.engine, '_processTick');
            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, 'requestAnimationFrame').mockReturnValue(123);
            
            game.engine.running = true;
            game.engine.last_timestamp = 1000;
            // Normal frame execution
            game.engine.loop(1016); // Delta 16ms

            expect(processSpy).toHaveBeenCalled();
            const callArg = processSpy.mock.calls[0][0];
            
            // Should process live time (~0.016 ticks)
            expect(callArg).toBeCloseTo(0.016, 3);
            
            // Accumulator should be UNTOUCHED because flux is disabled
            expect(game.engine.time_accumulator).toBe(50000);
            rafSpy.mockRestore();
        });

        it("should consume banked time if Time Flux is enabled", async () => {
            game.tileset.clearAllTiles();
            game.engine.time_accumulator = 50000;
            game.time_flux = true;
            game.loop_wait = 1000;
            await placePart(game, 0, 0, "uranium1");
            game.engine.markPartCacheAsDirty();

            const processSpy = vi.spyOn(game.engine, '_processTick');
            const target = globalThis.window || globalThis;
            if (!target.requestAnimationFrame) {
                target.requestAnimationFrame = vi.fn().mockReturnValue(123);
            }
            const rafSpy = vi.spyOn(target, 'requestAnimationFrame').mockReturnValue(123);
            
            game.engine.running = true;
            game.engine.last_timestamp = 1000;
            game.engine.loop(1016); // Delta 16ms

            expect(processSpy).toHaveBeenCalled();
            // Should be live time (0.016) + flux (10.0) = 10.016
            expect(processSpy.mock.calls[0][0]).toBeCloseTo(10.016, 3);
            
            // Accumulator should decrease significantly
            // 50000 - 10000 = 40000 (live time is processed separately from bank)
            expect(game.engine.time_accumulator).toBeCloseTo(40000, -1);
            rafSpy.mockRestore();
        });
    });
});
