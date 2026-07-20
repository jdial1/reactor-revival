import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  setSessionEconomy,
  setSessionToggle,
  sessionEp,
} from "../../helpers/sessionHelpers.js";

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

function ep(session) {
  return Number(session.getSnapshot().economy?.currentExoticParticles ?? 0);
}

function power(session) {
  return Number(session.grid.currentPower ?? 0);
}

function configureAutoSell(session, { maxPower, alteredMaxPower, percent, currentPower }) {
  session.setUpgradeLevels([{ id: "auto_sell_operator", level: 1 }]);
  setSessionToggle(session, "auto_sell", true);
  session.mechanicsOverrides = {
    ...(session.mechanicsOverrides || {}),
    alteredMaxPower: alteredMaxPower ?? maxPower,
    autoSellPercent: percent,
    sellPriceMultiplier: 1,
  };
  session.grid.maxPower = maxPower;
  session.grid.currentPower = currentPower;
}

describe("Group 3: Progression & Tech Tree (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("locks upgrade cost scaling mathematics", () => {
    const base = session.previewUpgrade("chronometer");
    expect(base.def.baseCost).toBe(10000);
    expect(base.def.costMultiplier).toBe(100);
    expect(base.cost).toBe(10000);

    session.setUpgradeLevels([{ id: "chronometer", level: 1 }]);
    expect(session.previewUpgrade("chronometer").cost).toBe(10000 * 100);

    session.setUpgradeLevels([{ id: "chronometer", level: 2 }]);
    expect(session.previewUpgrade("chronometer").cost).toBe(10000 * 100 ** 2);
  });

  it("locks experimental upgrade EP cost scaling mathematics", () => {
    const base = session.previewUpgrade("infused_cells");
    expect(base.def.baseCost).toBe(100);
    expect(base.def.costMultiplier).toBe(2);
    expect(base.cost).toBe(100);

    session.setUpgradeLevels([{ id: "infused_cells", level: 1 }]);
    expect(session.previewUpgrade("infused_cells").cost).toBe(200);

    session.setUpgradeLevels([{ id: "infused_cells", level: 2 }]);
    expect(session.previewUpgrade("infused_cells").cost).toBe(400);
  });

  it("deducts exact cash when purchasing a money upgrade", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost) });
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(true);
    expect(money(session)).toBe(0);
    expect(sessionEp(session).money).toBe(0);
    expect(session.getUpgradeLevel("chronometer")).toBe(1);
  });

  it("deducts exact exotic particles when purchasing an EP upgrade", () => {
    const cost = session.previewUpgrade("laboratory").cost;
    expect(cost).toBe(1);
    setSessionEconomy(session, {
      currentExoticParticles: String(cost),
      totalExoticParticles: String(cost),
    });
    expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);
    expect(ep(session)).toBe(0);
    expect(session.getUpgradeLevel("laboratory")).toBe(1);
  });

  it("locks auto-sell when sell cap is below stored power", () => {
    configureAutoSell(session, {
      maxPower: 1000,
      percent: 10,
      currentPower: 700,
    });
    const initialMoney = money(session);
    session.tick();
    expect(power(session)).toBe(600);
    expect(money(session)).toBe(initialMoney + 100);
  });

  it("locks auto-sell when stored power is below sell cap", () => {
    configureAutoSell(session, {
      maxPower: 1000,
      percent: 10,
      currentPower: 50,
    });
    const initialMoney = money(session);
    session.tick();
    expect(power(session)).toBe(0);
    expect(money(session)).toBe(initialMoney + 50);
  });

  it("uses altered max power for auto-sell cap when altered differs from base max", () => {
    configureAutoSell(session, {
      maxPower: 1000,
      alteredMaxPower: 2000,
      percent: 10,
      currentPower: 500,
    });
    const initialMoney = money(session);
    session.tick();
    expect(power(session)).toBe(300);
    expect(money(session)).toBe(initialMoney + 200);
  });

  it("does not sell power when auto-sell is disabled", () => {
    setSessionToggle(session, "auto_sell", false);
    session.mechanicsOverrides = {
      ...(session.mechanicsOverrides || {}),
      alteredMaxPower: 1000,
      autoSellPercent: 10,
      sellPriceMultiplier: 1,
      autoSellFromUpgrade: false,
    };
    session.grid.maxPower = 1000;
    session.grid.currentPower = 700;
    const initialMoney = money(session);
    session.tick();
    expect(power(session)).toBe(700);
    expect(money(session)).toBe(initialMoney);
  });

  it("reports core upgrades available on the unified tech tree", () => {
    session.techTree = "unified";
    setSessionEconomy(session, { money: "1e30" });
    expect(session.isUpgradeAvailable("chronometer")).toBe(true);
    expect(session.isUpgradeAvailable("heat_control_operator")).toBe(true);
    expect(session.isUpgradeAvailable("stirling_generators")).toBe(true);
  });

  it("rejects purchase when upgrade is at max level", () => {
    session.setUpgradeLevels([{ id: "heat_control_operator", level: 1 }]);
    const preview = session.previewUpgrade("heat_control_operator");
    expect(preview.def.maxLevel).toBe(1);
    expect(preview.reason).toBe("max_level");
    setSessionEconomy(session, { money: "1e30" });
    expect(purchaseSessionUpgrade(session, "heat_control_operator")).toBe(false);
    expect(session.getUpgradeLevel("heat_control_operator")).toBe(1);
  });

  it("purchases multiple money upgrades with exact combined funds", () => {
    const cArch = session.previewUpgrade("heat_control_operator").cost;
    const cEng = session.previewUpgrade("stirling_generators").cost;
    setSessionEconomy(session, { money: String(cArch + cEng) });
    expect(purchaseSessionUpgrade(session, "heat_control_operator")).toBe(true);
    expect(session.getUpgradeLevel("heat_control_operator")).toBe(1);
    expect(money(session)).toBe(cEng);
    expect(purchaseSessionUpgrade(session, "stirling_generators")).toBe(true);
    expect(session.getUpgradeLevel("stirling_generators")).toBe(1);
    expect(money(session)).toBe(0);
  });
});
