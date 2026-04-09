import Decimal from "break_infinity.js";
import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame, toNum } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import { getHeatNetChange, getPowerNetChange } from "@app/components/ui.js";

describe("Power Overflow Mechanics", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.reactor.heat_controlled = false;
        game.ui.stateManager.setVar("heat_control", false);
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
        const tile = await placePart(game, 0, 0, "uranium1");
        
        // Update stats to populate active_cells, then override values for precise testing
        game.reactor.updateStats();
        
        // Manipulate tile stats for precise testing
        // Note: engine.js reads 'tile.power' and 'tile.heat' which are set by reactor.updateStats()
        // We override them here to isolate the logic
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 20;
        tile.heat = 0; // Zero native heat generation

        // Set reactor to near full
        game.reactor.current_power = 90;
        game.reactor.max_power = 100;

        // Run tick
        // Expected: 90 + 20 = 110. Cap is 100. Excess is 10.
        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(10);
    });

    it("should convert 100% of generated power to heat if starting at max power", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 50;
        tile.heat = 5; // 5 native heat

        game.reactor.current_power = 100;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        // Run tick
        // Expected Power: 100 + 50 = 150 -> Capped at 100. Excess 50.
        // Expected Heat: 0 + 5 (native) + 50 (overflow) = 55.
        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(55);
    });

    it("should handle power multipliers correctly with overflow", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 10;
        tile.heat = 0;

        // Set a global power multiplier (simulating upgrades)
        game.reactor.power_multiplier = 2.0; // 10 base becomes 20 total
        
        game.reactor.current_power = 95;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        // Logic trace:
        // 1. Base Power Add: 10. 
        //    Potential = 95 + 10 = 105. 
        //    Excess = 5. 
        //    Current Power = 100.
        //    Heat += 5.
        // 2. Multiplier Add: (10 * 2) - 10 = 10 additional power.
        //    Potential = 100 (current) + 10 = 110.
        //    Excess = 10.
        //    Current Power = 100.
        //    Heat += 10.
        // Total Heat = 5 + 10 = 15.

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(15);
    });

    it("should NOT add extra heat if power is within capacity", async () => {
        const tile = await placePart(game, 0, 0, "uranium1");
        
        // Update stats to populate active_cells, then override values
        game.reactor.updateStats();
        
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 10;
        tile.heat = 5;

        game.reactor.current_power = 50;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(60);
        expect(toNum(game.reactor.current_heat)).toBe(5);
    });
});

describe("Difficulty power overflow to heat ratio", () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.reactor.heat_controlled = false;
        game.ui.stateManager.setVar("heat_control", false);
        game.reactor.base_max_power = 100;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;
        game.reactor.current_power = 0;
    });

    afterEach(() => {
        cleanupGame();
    });

    it("easy (ratio 0): overflow power is lost, no heat from overflow", async () => {
        game.reactor.power_overflow_to_heat_ratio = 0;
        const tile = await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 20;
        tile.heat = 0;
        game.reactor.current_power = 90;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(0);
    });

    it("medium (ratio 0.5): 50% of overflow goes to heat", async () => {
        game.reactor.power_overflow_to_heat_ratio = 0.5;
        const tile = await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 20;
        tile.heat = 0;
        game.reactor.current_power = 90;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(5);
    });

    it("hard (ratio 1): 100% of overflow goes to heat", async () => {
        game.reactor.power_overflow_to_heat_ratio = 1;
        const tile = await placePart(game, 0, 0, "uranium1");
        game.reactor.updateStats();
        tile.activated = true;
        tile.ticks = 10;
        tile.power = 20;
        tile.heat = 0;
        game.reactor.current_power = 90;
        game.reactor.max_power = 100;
        game.reactor.current_heat = 0;

        game.engine.tick();

        expect(toNum(game.reactor.current_power)).toBe(100);
        expect(toNum(game.reactor.current_heat)).toBe(10);
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

describe("StatsCalculatorUI Decimal coercion", () => {
    function mockUi(vars, gameOverrides = {}) {
        const stateManager = { getVar: (k) => vars[k] };
        const game = { reactor: { power_overflow_to_heat_ratio: 0.5, manual_heat_reduce: 1, base_manual_heat_reduce: 1, auto_sell_multiplier: 0 }, ...gameOverrides };
        return { stateManager, game };
    }

    it("getHeatNetChange uses numeric addition when current_power and max_power are Decimal", () => {
        const ui = mockUi({
            current_power: new Decimal(60),
            stats_power: 1000,
            max_power: new Decimal(120),
            stats_net_heat: 500,
        });
        const result = getHeatNetChange(ui);
        const expectedOverflow = Math.max(0, 60 + 1000 - 120) * 0.5;
        const expected = 500 + expectedOverflow - 1;
        expect(result).toBe(expected);
        expect(typeof result).toBe("number");
        expect(result).not.toBeNaN();
    });

    it("getHeatNetChange overflow heat is not string-concatenated (60+1000 must equal 1060, not 601000)", () => {
        const ui = mockUi({
            current_power: new Decimal(60),
            stats_power: 1000,
            max_power: new Decimal(120),
            stats_net_heat: 0,
        });
        const result = getHeatNetChange(ui);
        const overflowHeat = Math.max(0, 60 + 1000 - 120) * 0.5;
        expect(overflowHeat).toBe(470);
        expect(result).toBe(overflowHeat - 1);
        expect(result).toBeLessThan(1000);
    });

    it("getPowerNetChange returns number when stats_power is Decimal", () => {
        const ui = mockUi({ stats_power: new Decimal(500) }, { reactor: { auto_sell_multiplier: 0 } });
        const result = getPowerNetChange(ui);
        expect(result).toBe(500);
        expect(typeof result).toBe("number");
    });

    it("getPowerNetChange with auto_sell uses numeric math when values are Decimal", () => {
        const ui = mockUi(
            { stats_power: new Decimal(100), auto_sell: true },
            { reactor: { auto_sell_multiplier: new Decimal(0.5) } }
        );
        const result = getPowerNetChange(ui);
        expect(result).toBe(50);
        expect(typeof result).toBe("number");
    });

    it("getHeatNetChange uses numeric addition when total_heat, stats_vent, stats_outlet are Decimal", () => {
        const ui = mockUi({
            stats_net_heat: undefined,
            total_heat: new Decimal(1000),
            stats_vent: new Decimal(300),
            stats_outlet: new Decimal(100),
            current_power: 0,
            stats_power: 0,
            max_power: 100,
        });
        const result = getHeatNetChange(ui);
        const baseNetHeat = 1000 - 300 - 100;
        expect(result).toBe(baseNetHeat - 1);
        expect(typeof result).toBe("number");
    });

    it("getHeatNetChange returns number when manual_heat_reduce is Decimal", () => {
        const ui = mockUi(
            { stats_net_heat: 100, current_power: 0, stats_power: 0, max_power: 100 },
            { reactor: { power_overflow_to_heat_ratio: 0.5, manual_heat_reduce: new Decimal(10), base_manual_heat_reduce: 1 } }
        );
        const result = getHeatNetChange(ui);
        expect(result).toBe(90);
        expect(typeof result).toBe("number");
    });

    it("getPowerNetChange handles string stats_power without producing concatenation", () => {
        const ui = mockUi({ stats_power: "1000" }, { reactor: { auto_sell_multiplier: 0 } });
        const result = getPowerNetChange(ui);
        expect(result).toBe(1000);
        expect(typeof result).toBe("number");
    });
});

