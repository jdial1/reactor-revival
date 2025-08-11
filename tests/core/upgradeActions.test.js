import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Upgrade Actions Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should apply chronometer upgrade correctly", () => {
    const initialWait = game.base_loop_wait;
    console.log(`Initial loop_wait: ${game.loop_wait}, base_loop_wait: ${game.base_loop_wait}`);

    // Add money to purchase the upgrade
    game.current_money = 10000;
    game.ui.stateManager.setVar("current_money", game.current_money);

    // Check affordability after setting money
    game.upgradeset.check_affordability(game);

    const purchased = game.upgradeset.purchaseUpgrade("chronometer");
    console.log(`Purchase result: ${purchased}`);

    const chronometerUpgrade = game.upgradeset.getUpgrade("chronometer");
    console.log(`Chronometer upgrade level: ${chronometerUpgrade?.level}`);
    console.log(`Final loop_wait: ${game.loop_wait}`);

    expect(game.loop_wait).toBe(initialWait / 2); // Level 1 = divide by (1 + 1) = 2
  });

  it("should apply power lines upgrade correctly", () => {
    game.upgradeset.purchaseUpgrade("improved_power_lines");
    expect(game.reactor.auto_sell_multiplier).toBe(0.01);
  });

  it("should apply reactor rows upgrade correctly", () => {
    const initialRows = game.rows;
    game.upgradeset.purchaseUpgrade("expand_reactor_rows");
    expect(game.rows).toBe(initialRows + 1);
  });

  it("should apply forceful fusion upgrade correctly", () => {
    game.upgradeset.purchaseUpgrade("forceful_fusion");
    expect(game.reactor.heat_power_multiplier).toBe(1);
  });

  it("should apply improved alloys upgrade correctly", async () => {
    const plating = game.partset.getPartById("reactor_plating1");
    await game.tileset.getTile(0, 0).setPart(plating);
    game.reactor.updateStats();
    const initialHeat = game.reactor.max_heat;

    game.upgradeset.purchaseUpgrade("improved_alloys");
    game.reactor.updateStats();

    // (base + original part) * 2 for level 1 upgrade
    const expectedHeat =
      game.reactor.base_max_heat + plating.base_reactor_heat * 2;
    expect(game.reactor.max_heat).toBeCloseTo(expectedHeat);
  });

  it("should apply quantum buffering upgrade correctly", async () => {
    const plating = game.partset.getPartById("reactor_plating1");
    // FIX: Get base heat before any parts are added
    const initialMaxHeat = game.reactor.base_max_heat;

    await game.tileset.getTile(0, 0).setPart(plating);

    game.current_exotic_particles = 1;
    game.upgradeset.purchaseUpgrade("laboratory");
    game.current_exotic_particles = 50;
    game.upgradeset.check_affordability(game);
    const purchased = game.upgradeset.purchaseUpgrade("quantum_buffering");
    expect(purchased).toBe(true);
    const quantumBufferingUpgrade = game.upgradeset.getUpgrade("quantum_buffering");
    expect(quantumBufferingUpgrade.level).toBe(1);

    plating.recalculate_stats();
    game.reactor.updateStats();

    const multiplier = Math.pow(2, quantumBufferingUpgrade.level);
    // FIX: Calculate expected heat based on initial value + upgraded part value
    const expectedMaxHeat = initialMaxHeat + (plating.base_reactor_heat * multiplier);

    expect(game.reactor.max_heat).toBeCloseTo(expectedMaxHeat);
    expect(game.reactor.max_heat).toBeGreaterThan(initialMaxHeat + plating.base_reactor_heat);
  });

  it("should apply active venting upgrade correctly", async () => {
    await game.tileset
      .getTile(0, 0)
      .setPart(game.partset.getPartById("capacitor1"));
    const ventTile = game.tileset.getTile(0, 1);
    await ventTile.setPart(game.partset.getPartById("vent1"));
    game.reactor.updateStats();
    const initialVent = ventTile.getEffectiveVentValue();

    game.upgradeset.purchaseUpgrade("active_venting");
    game.reactor.updateStats();

    expect(ventTile.getEffectiveVentValue()).toBeGreaterThan(initialVent);
  });

  it("should apply improved heat vents upgrade correctly", async () => {
    const ventPart = game.partset.getPartById("vent1");
    const tile = game.tileset.getTile(0, 0);
    await tile.setPart(ventPart);
    const baseVentValue = ventPart.base_vent; // Get the base value
    console.log(`[TEST] Before upgrade: vent value = ${tile.getEffectiveVentValue()}, part.vent = ${tile.part.vent}`);

    game.upgradeset.purchaseUpgrade("improved_heat_vents");
    console.log(`[TEST] After upgrade: vent value = ${tile.getEffectiveVentValue()}, part.vent = ${tile.part.vent}`);

    const expectedValue = baseVentValue * 2; // Calculate based on base value
    expect(tile.getEffectiveVentValue()).toBe(expectedValue);
    console.log(`[TEST] Base vent: ${baseVentValue}, expected: ${expectedValue}, actual: ${tile.getEffectiveVentValue()}`);
  });
});
