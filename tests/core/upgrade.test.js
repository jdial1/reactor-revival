import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../helpers/setup.js";

describe("Upgrade Mechanics", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
    game.bypass_tech_tree_restrictions = true; // Ensure upgrades are purchasable
  });

  it("should calculate increasing cost based on level and multiplier", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    expect(toNum(upgrade.current_cost)).toBe(toNum(upgrade.base_cost));

    game.current_money = toNum(upgrade.getCost()) * 2;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    game.upgradeset.purchaseUpgrade(upgrade.id);

    // After purchase, level is 1, so cost should be base_cost * cost_multiplier^1
    expect(toNum(upgrade.current_cost)).toBeCloseTo(toNum(upgrade.base_cost) * upgrade.cost_multiplier, 10);
  });

  it("should set level and trigger its action", () => {
    const upgrade = game.upgradeset.getUpgrade("expand_reactor_rows");
    const initialRows = game.rows;

    game.current_money = upgrade.getCost();
    game.upgradeset.check_affordability(game);
    game.upgradeset.purchaseUpgrade(upgrade.id);

    expect(game.rows).toBe(initialRows + 1);
  });

  it("should become unaffordable with insufficient funds", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    game.current_money = upgrade.getCost() - 1;
    game.upgradeset.check_affordability(game);
    expect(upgrade.affordable).toBe(false);
  });

  it("should correctly handle experimental upgrades requiring EP", () => {
    const labUpgrade = game.upgradeset.getUpgrade("laboratory");
    game.current_exotic_particles = labUpgrade.getCost() + 100;
    game.upgradeset.purchaseUpgrade("laboratory");

    const expUpgrade = game.upgradeset.getUpgrade("infused_cells");

    game.current_exotic_particles = expUpgrade.base_ecost;
    game.upgradeset.check_affordability(game);
    expect(expUpgrade.affordable).toBe(true);

    game.current_exotic_particles = expUpgrade.base_ecost - 1;
    game.upgradeset.check_affordability(game);
    expect(expUpgrade.affordable).toBe(false);
  });

  it("should show MAX cost when at max level", () => {
    const upgrade = game.upgradeset.getUpgrade("heat_control_operator"); // max_level: 1
    upgrade.setLevel(1);
    expect(upgrade.display_cost).toBe("MAX");
    expect(Number.isFinite(toNum(upgrade.current_cost))).toBe(false);
  });

  it("should not allow purchase with insufficient funds", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    const cost = upgrade.getCost();
    game.current_money = cost - 1;

    const result = game.upgradeset.purchaseUpgrade(upgrade.id);

    expect(result).toBe(false);
    expect(upgrade.level).toBe(0);
  });

  it("should allow purchase with sufficient funds and deduct cost", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    const cost = upgrade.getCost();
    game.current_money = cost + 1000;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    const expectedMoney = toNum(game.current_money) - toNum(cost);

    const result = game.upgradeset.purchaseUpgrade(upgrade.id);

    expect(result).toBe(true);
    expect(upgrade.level).toBe(1);
    expect(toNum(game.current_money)).toBeCloseTo(expectedMoney, 10);
  });
});
