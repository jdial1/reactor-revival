import { describe, it, expect, beforeEach, vi, setupGame } from "../helpers/setup.js";

describe("Upgrade Mechanics", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
  });

  it("should calculate increasing cost based on level and multiplier", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    expect(upgrade.current_cost).toBe(upgrade.base_cost);

    upgrade.setLevel(1);
    upgrade.updateDisplayCost();

    expect(upgrade.current_cost).toBe(
      upgrade.base_cost * upgrade.cost_multiplier
    );
  });

  it("should set level and trigger its action", () => {
    const upgrade = game.upgradeset.getUpgrade("expand_reactor_rows");

    // Track the initial reactor rows
    const initialRows = game.rows;

    upgrade.setLevel(1);
    expect(upgrade.level).toBe(1);

    // Verify the action was executed by checking the effect
    expect(game.rows).toBe(initialRows + 1);
  });

  it("should become unaffordable with insufficient funds", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    game.current_money = upgrade.current_cost - 1;
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
    expect(upgrade.display_cost).toBe("--");
    expect(upgrade.current_cost).toBe(Infinity);
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
    game.current_money = cost;

    const result = game.upgradeset.purchaseUpgrade(upgrade.id);

    expect(result).toBe(true);
    expect(upgrade.level).toBe(1);
    expect(game.current_money).toBe(0);
  });
});
