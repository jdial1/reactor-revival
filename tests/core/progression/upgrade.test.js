import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  sessionEp,
  setSessionEconomy,
} from "../../helpers/sessionHelpers.js";

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

describe("Upgrade Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("scales money cost by costMultiplier after purchase", () => {
    const before = session.previewUpgrade("chronometer");
    expect(before.cost).toBe(before.def.baseCost);

    setSessionEconomy(session, { money: String(before.cost * 2) });
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(true);

    const after = session.previewUpgrade("chronometer");
    expect(after.cost).toBeCloseTo(before.def.baseCost * before.def.costMultiplier, 10);
  });

  it("applies expand_reactor_rows as gridRowsBonus", () => {
    expect(session.modifiers.gridRowsBonus).toBe(0);
    const cost = session.previewUpgrade("expand_reactor_rows").cost;
    setSessionEconomy(session, { money: String(cost) });
    expect(purchaseSessionUpgrade(session, "expand_reactor_rows")).toBe(true);
    expect(session.getUpgradeLevel("expand_reactor_rows")).toBe(1);
    expect(session.modifiers.gridRowsBonus).toBe(1);
  });

  it("marks money upgrade unpurchasable with insufficient funds", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost - 1) });
    const preview = session.previewUpgrade("chronometer");
    expect(preview.canPurchase).toBe(false);
    expect(preview.reason).toBe("funds");
  });

  it("gates experimental upgrades on EP affordability after laboratory", () => {
    setSessionEconomy(session, {
      currentExoticParticles: "200",
      totalExoticParticles: "200",
    });
    expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);

    const cost = session.previewUpgrade("infused_cells").cost;
    setSessionEconomy(session, {
      currentExoticParticles: String(cost),
      totalExoticParticles: String(cost),
    });
    expect(session.previewUpgrade("infused_cells").canPurchase).toBe(true);

    setSessionEconomy(session, {
      currentExoticParticles: String(cost - 1),
      totalExoticParticles: String(cost - 1),
    });
    const unafford = session.previewUpgrade("infused_cells");
    expect(unafford.canPurchase).toBe(false);
    expect(unafford.reason).toBe("funds");
  });

  it("reports max_level when upgrade is at cap", () => {
    session.setUpgradeLevels([{ id: "heat_control_operator", level: 1 }]);
    const preview = session.previewUpgrade("heat_control_operator");
    expect(preview.def.maxLevel).toBe(1);
    expect(preview.reason).toBe("max_level");
    expect(Number.isFinite(preview.cost)).toBe(false);
  });

  it("rejects purchase with insufficient funds", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost - 1) });
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(false);
    expect(session.getUpgradeLevel("chronometer")).toBe(0);
  });

  it("purchases with sufficient funds and deducts cost", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost + 1000) });
    const expected = cost + 1000 - cost;
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(true);
    expect(session.getUpgradeLevel("chronometer")).toBe(1);
    expect(money(session)).toBeCloseTo(expected, 10);
    expect(sessionEp(session).money).toBeCloseTo(expected, 10);
  });
});
