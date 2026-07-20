import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  setSessionEconomy,
} from "../../helpers/sessionHelpers.js";

describe("Upgradeset Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("lists required upgrades", () => {
    const ids = new Set(session.listUpgrades().map((u) => u.id));
    for (const upgradeId of [
      "chronometer",
      "forceful_fusion",
      "uranium1_cell_power",
      "uranium1_cell_tick",
      "uranium1_cell_perpetual",
    ]) {
      expect(ids.has(upgradeId)).toBe(true);
    }
  });

  it("previews upgrade by ID", () => {
    const upgrade = session.previewUpgrade("uranium1_cell_power");
    expect(upgrade.ok).toBe(true);
    expect(upgrade.id).toBe("uranium1_cell_power");
    expect(Number(upgrade.def.baseCost)).toBeGreaterThan(0);
    expect(session.getUpgradeLevel("uranium1_cell_power")).toBe(0);
    expect(upgrade.def.maxLevel == null || upgrade.def.maxLevel > 0).toBe(true);
  });

  it("returns unknown for invalid upgrade ID", () => {
    const upgrade = session.previewUpgrade("invalid_upgrade");
    expect(upgrade.ok).toBe(false);
    expect(upgrade.reason).toBe("unknown");
  });

  it("filters upgrades by type", () => {
    const other = session.listUpgrades().filter((u) => u.type === "other");
    expect(other.length).toBeGreaterThan(0);
    other.forEach((upgrade) => {
      expect(upgrade.type).toBe("other");
    });
  });

  it("returns empty for invalid type", () => {
    const upgrades = session.listUpgrades().filter((u) => u.type === "invalid_type");
    expect(upgrades).toEqual([]);
  });

  it("lists all upgrades with ids", () => {
    const all = session.listUpgrades();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((upgrade) => upgrade.id)).toBe(true);
  });

  it("checks affordability via previewUpgrade", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost) });
    expect(session.previewUpgrade("chronometer").canPurchase).toBe(true);

    setSessionEconomy(session, { money: String(cost - 1) });
    expect(session.previewUpgrade("chronometer").canPurchase).toBe(false);
  });

  it("purchases chronometer via session", () => {
    const cost = session.previewUpgrade("chronometer").cost;
    setSessionEconomy(session, { money: String(cost) });
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(true);
    expect(session.getUpgradeLevel("chronometer")).toBe(1);
  });
});
