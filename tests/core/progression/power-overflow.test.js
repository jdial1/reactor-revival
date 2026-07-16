import Decimal from "break_infinity.js";
import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame, toNum } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";

describe("Power Overflow Mechanics", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.reactor.heat_controlled = false;
        game.onToggleStateChange?.("heat_control", false);
        game.reactor.base_max_power = 100;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
        game.reactor.power_overflow_to_heat_ratio = 1;
    });

    afterEach(() => {
        cleanupGame();
    });

    it("should convert excess base power to heat when cap is reached", async () => {
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.power_overflow_to_heat_ratio = 1;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeGreaterThan(0);
    });

    it("should convert 100% of generated power to heat if starting at max power", async () => {
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        const cellPower = toNum(game.reactor.stats_power) || 1;
        const cellHeat = toNum(game.reactor.stats_heat_generation) || 1;

        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.power_overflow_to_heat_ratio = 1;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeCloseTo(cellHeat + cellPower, 0);
    });

    it("should handle power multipliers correctly with overflow", async () => {
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        game.reactor.power_multiplier = 2.0;
        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.power_overflow_to_heat_ratio = 1;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeGreaterThan(0);
    });

    it("should NOT add extra heat if power is within capacity", async () => {
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        const cellPower = toNum(game.reactor.stats_power) || 1;
        const cellHeat = toNum(game.reactor.stats_heat_generation) || 1;

        game.reactor.current_power = 50;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.power_overflow_to_heat_ratio = 1;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(50 + cellPower);
        expect(toNum(game.reactor.current_heat)).toBeCloseTo(cellHeat, 0);
    });
});

describe("Difficulty power overflow to heat ratio", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.reactor.heat_controlled = false;
        game.onToggleStateChange?.("heat_control", false);
        game.reactor.base_max_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
    });

    afterEach(() => {
        cleanupGame();
    });

    it("easy (ratio 0): overflow power is lost, no heat from overflow", async () => {
        game.reactor.power_overflow_to_heat_ratio = 0;
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        const cellHeat = toNum(game.reactor.stats_heat_generation) || 1;
        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeCloseTo(cellHeat, 0);
    });

    it("medium (ratio 0.5): 50% of overflow goes to heat", async () => {
        game.reactor.power_overflow_to_heat_ratio = 0.5;
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        const cellPower = toNum(game.reactor.stats_power) || 1;
        const cellHeat = toNum(game.reactor.stats_heat_generation) || 1;
        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeCloseTo(cellHeat + cellPower * 0.5, 0);
    });

    it("hard (ratio 1): 100% of overflow goes to heat", async () => {
        game.reactor.power_overflow_to_heat_ratio = 1;
        await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        const cellPower = toNum(game.reactor.stats_power) || 1;
        const cellHeat = toNum(game.reactor.stats_heat_generation) || 1;
        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.altered_max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBeCloseTo(cellHeat + cellPower, 0);
    });
});

describe("Difficulty settings persist after init", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        cleanupGame();
    });

    it("power_overflow_to_heat_ratio is not reset by initialize_new_game_state", async () => {
        game.reactor.power_overflow_to_heat_ratio = 0;
        await game.initialize_new_game_state();
        expect(game.reactor.power_overflow_to_heat_ratio).toBe(0);
    });

    it("applying easy-like settings leaves power_overflow_to_heat_ratio at 0 after init", async () => {
        game.base_money = 25;
        game.reactor.base_max_heat = 1500;
        game.reactor.base_max_power = 120;
        game.reactor.power_overflow_to_heat_ratio = 0;
        await game.initialize_new_game_state();
        expect(game.reactor.power_overflow_to_heat_ratio).toBe(0);
        expect(game.base_money).toBe(25);
        expect(game.reactor.base_max_heat).toBe(1500);
        expect(game.reactor.base_max_power).toBe(120);
    });
});

