import { describe, it, expect, beforeEach, setupGame, toNum } from "../helpers/setup.js";
import { forcePurchaseUpgrade } from "../helpers/gameHelpers.js";

describe("Upgradeset Mechanics", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
    game.bypass_tech_tree_restrictions = true;
  });

  it("should initialize with all required upgrades", () => {
    const requiredUpgrades = [
      "chronometer",
      "forceful_fusion",
      "uranium1_cell_power",
      "uranium1_cell_tick",
      "uranium1_cell_perpetual",
    ];

    requiredUpgrades.forEach((upgradeId) => {
      const upgrade = game.upgradeset.getUpgrade(upgradeId);
      expect(upgrade).toBeDefined();
      expect(upgrade.id).toBe(upgradeId);
    });
  });

  it("should get upgrade by ID", () => {
    const upgrade = game.upgradeset.getUpgrade("uranium1_cell_power");
    expect(upgrade).toBeDefined();
    expect(upgrade.id).toBe("uranium1_cell_power");
    expect(toNum(upgrade.base_cost)).toBeGreaterThan(0);
    expect(upgrade.level).toBe(0);
    expect(upgrade.max_level).toBeGreaterThan(0);
  });

  it("should return undefined for invalid upgrade ID", () => {
    const upgrade = game.upgradeset.getUpgrade("invalid_upgrade");
    expect(upgrade).toBeUndefined();
  });

  it("should get upgrades by type", () => {
    const otherUpgrades = game.upgradeset.getUpgradesByType("other");
    expect(otherUpgrades.length).toBeGreaterThan(0);
    otherUpgrades.forEach((upgrade) => {
      expect(upgrade.upgrade.type).toBe("other");
    });
  });

  it("should return empty array for invalid type", () => {
    const upgrades = game.upgradeset.getUpgradesByType("invalid_type");
    expect(upgrades).toEqual([]);
  });

  it("should get all available upgrades", () => {
    const allUpgrades = game.upgradeset.getAllUpgrades();
    expect(allUpgrades.length).toBeGreaterThan(0);
    expect(
      allUpgrades.every((upgrade) => upgrade.id && upgrade.max_level)
    ).toBe(true);
  });

  it("should check affordability correctly", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    // Ensure clean state
    upgrade.setLevel(0);
    upgrade.updateDisplayCost();
    
    const cost = upgrade.getCost();
    
    game.current_money = cost;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(upgrade.affordable, `Expected affordable at money ${cost}`).toBe(true);
    
    game.current_money = cost - 1;
    game.ui.stateManager.setVar("current_money", game.current_money);
    game.upgradeset.check_affordability(game);
    expect(upgrade.affordable, `Expected unaffordable at money ${cost - 1}`).toBe(false);
  });

  it("should correctly purchase an upgrade", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    upgrade.setLevel(0);
    upgrade.updateDisplayCost();

    const result = forcePurchaseUpgrade(game, "chronometer");

    expect(result, "Purchase returned false").toBe(true);
    expect(upgrade.level).toBe(1);
  });
});
