import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  ventRateAt,
} from "../../helpers/sessionHelpers.js";

describe("Upgrade Actions Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("applies chronometer as tickRateBonus", () => {
    expect(session.modifiers.tickRateBonus).toBe(0);
    expect(purchaseSessionUpgrade(session, "chronometer")).toBe(true);
    expect(session.modifiers.tickRateBonus).toBeGreaterThan(0);
  });

  it("applies component reinforcement to part containment", () => {
    const before = Number(session.getPart("capacitor1").containment);
    expect(purchaseSessionUpgrade(session, "component_reinforcement")).toBe(true);
    expect(Number(session.getPart("capacitor1").containment)).toBeGreaterThan(before);
  });

  it("applies reactor rows as gridRowsBonus", () => {
    expect(session.modifiers.gridRowsBonus).toBe(0);
    expect(purchaseSessionUpgrade(session, "expand_reactor_rows")).toBe(true);
    expect(session.getUpgradeLevel("expand_reactor_rows")).toBe(1);
    expect(session.modifiers.gridRowsBonus).toBe(1);
  });

  it("applies forceful fusion heatPowerMultiplier", () => {
    expect(purchaseSessionUpgrade(session, "forceful_fusion")).toBe(true);
    expect(session.modifiers.heatPowerMultiplier).toBe(1);
  });

  it("applies active venting to placed vent display rate", () => {
    session.placeComponent(0, 0, "vent1");
    session.placeComponent(0, 1, "capacitor1");
    const initialVent = ventRateAt(session, 0, 0);
    session.setUpgradeLevels([{ id: "active_venting", level: 1 }]);
    expect(ventRateAt(session, 0, 0)).toBeGreaterThan(initialVent);
  });

  it("applies improved heat vents doubling vent rate", () => {
    session.placeComponent(0, 0, "vent1");
    const baseVent = Number(session.getPart("vent1").vent);
    expect(purchaseSessionUpgrade(session, "improved_heat_vents")).toBe(true);
    expect(ventRateAt(session, 0, 0)).toBe(baseVent * 2);
  });
});
