import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../helpers/gameHelpers.js";

describe("Upgrade Actions Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should apply chronometer upgrade correctly", () => {
    const initialWait = game.base_loop_wait;
    const purchased = forcePurchaseUpgrade(game, "chronometer");
    expect(purchased).toBe(true);
    expect(game.loop_wait).toBe(initialWait / 2);
  });

  it("should apply power lines upgrade correctly", () => {
    forcePurchaseUpgrade(game, "improved_power_lines");
    expect(game.reactor.auto_sell_multiplier).toBe(0.01);
  });

  it("should apply reactor rows upgrade correctly", () => {
    const initialRows = game.rows;
    forcePurchaseUpgrade(game, "expand_reactor_rows");
    expect(game.rows).toBe(initialRows + 1);
  });

  it("should apply forceful fusion upgrade correctly", () => {
    forcePurchaseUpgrade(game, "forceful_fusion");
    expect(game.reactor.heat_power_multiplier).toBe(1);
  });

  it("should apply improved alloys upgrade correctly", async () => {
    const plating = game.partset.getPartById("reactor_plating1");
    await placePart(game, 0, 0, "reactor_plating1");
    
    game.reactor.updateStats();
    
    forcePurchaseUpgrade(game, "improved_alloys");
    // Force recalculation on placed parts and reset altered stats
    game.partset.getPartById("reactor_plating1").recalculate_stats();
    game.tileset.active_tiles_list.forEach(t => t.part && t.part.recalculate_stats());
    game.reactor.altered_max_heat = game.reactor.base_max_heat;
    game.reactor.updateStats();
    
    const expectedHeat = game.reactor.base_max_heat + (plating.base_reactor_heat * 2);
    expect(game.reactor.max_heat).toBeCloseTo(expectedHeat);
  });

  it("should apply quantum buffering upgrade correctly", async () => {
    const plating = game.partset.getPartById("reactor_plating1");
    await placePart(game, 0, 0, "reactor_plating1");
    game.reactor.updateStats();
    
    const initialMaxHeat = game.reactor.max_heat;
    forcePurchaseUpgrade(game, "laboratory");
    const bought = forcePurchaseUpgrade(game, "quantum_buffering");
    expect(bought).toBe(true);
    
    // Reset altered stats and force recalculation on placed parts
    game.reactor.altered_max_heat = game.reactor.base_max_heat;
    game.partset.getPartById("reactor_plating1").recalculate_stats();
    game.tileset.active_tiles_list.forEach(t => t.part && t.part.recalculate_stats());
    game.reactor.updateStats();
    
    expect(game.reactor.max_heat).toBeGreaterThan(initialMaxHeat);
    // Quantum buffering doubles plating contribution
    expect(game.reactor.max_heat).toBe(game.reactor.base_max_heat + (plating.base_reactor_heat * 2));
  });

  it("should apply active venting upgrade correctly", async () => {
    const tile = await placePart(game, 0, 0, "vent1");
    await placePart(game, 0, 1, "capacitor1");
    
    const initialVent = tile.getEffectiveVentValue();
    const upgrade = game.upgradeset.getUpgrade("active_venting");
    upgrade.setLevel(1);
    tile.part.recalculate_stats();
    
    expect(tile.getEffectiveVentValue()).toBeGreaterThan(initialVent);
  });

  it("should apply improved heat vents upgrade correctly", async () => {
    const tile = await placePart(game, 0, 0, "vent1");
    const ventPart = tile.part;
    const baseVentValue = ventPart.base_vent;
    
    const bought = forcePurchaseUpgrade(game, "improved_heat_vents");
    expect(bought).toBe(true);
    
    ventPart.recalculate_stats();
    const expectedValue = baseVentValue * 2;
    expect(tile.getEffectiveVentValue()).toBe(expectedValue);
  });
});
