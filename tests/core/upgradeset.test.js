import { describe, it, expect, beforeEach, setupGame } from "../helpers/setup.js";

describe("Upgradeset Mechanics", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
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
    expect(upgrade.base_cost).toBeGreaterThan(0);
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

    // Has enough money
    game.current_money = upgrade.getCost();
    game.upgradeset.check_affordability(game);
    expect(upgrade.affordable).toBe(true);

    // Not enough money
    game.current_money = upgrade.getCost() - 1;
    game.upgradeset.check_affordability(game);
    expect(upgrade.affordable).toBe(false);
  });

  it("should correctly purchase an upgrade", () => {
    const upgrade = game.upgradeset.getUpgrade("chronometer");
    const initialMoney = upgrade.getCost();
    game.current_money = initialMoney;

    const result = game.upgradeset.purchaseUpgrade(upgrade.id);

    expect(result).toBe(true);
    expect(upgrade.level).toBe(1);
    expect(game.current_money).toBe(0);
  });
});
