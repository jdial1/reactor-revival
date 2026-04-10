import { describe, it, expect, beforeEach, setupGame, toNum } from "../../helpers/setup.js";
import { placePart, forcePurchaseUpgrade } from "../../helpers/gameHelpers.js";

describe("Upgrade Actions Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should apply chronometer upgrade correctly", () => {
    const initialWait = game.base_loop_wait;
    const purchased = forcePurchaseUpgrade(game, "chronometer");
    expect(purchased).toBe(true);
    expect(game.loop_wait).toBe(initialWait);
  });

  it("should apply component reinforcement upgrade correctly", () => {
    const vent = game.partset.getPartById("vent1");
    const before = vent.containment;
    forcePurchaseUpgrade(game, "component_reinforcement");
    vent.recalculate_stats();
    expect(vent.containment).toBeGreaterThan(before);
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
