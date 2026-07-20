import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionReactorHeat,
  reactorHeat,
  reactorMaxHeat,
} from "../../helpers/sessionHelpers.js";

function setHeatControl(session, on) {
  session.toggles.heat_control = !!on;
}

describe("Auto Heat (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
    session.grid.maxHeat = 10000;
  });

  it("reduces hull heat when heat_control toggle is on", () => {
    setHeatControl(session, true);
    setSessionReactorHeat(session, 150);
    const initial = reactorHeat(session);
    session.tick();
    expect(reactorHeat(session)).toBeLessThan(initial);
  });

  it("does not reduce hull heat when heat_control toggle is off", () => {
    setHeatControl(session, false);
    setSessionReactorHeat(session, 1000);
    const initial = reactorHeat(session);
    session.tick();
    expect(reactorHeat(session)).toBe(initial);
  });

  it("switches reduction when heat_control toggle changes", () => {
    setSessionReactorHeat(session, 1000);

    setHeatControl(session, false);
    const beforeOff = reactorHeat(session);
    session.tick();
    expect(reactorHeat(session)).toBe(beforeOff);

    setHeatControl(session, true);
    const beforeOn = reactorHeat(session);
    session.tick();
    expect(reactorHeat(session)).toBeLessThan(beforeOn);
  });

  it("stays at zero heat when already empty", () => {
    setHeatControl(session, true);
    setSessionReactorHeat(session, 0);
    session.tick();
    expect(reactorHeat(session)).toBe(0);
  });

  it("keeps reducing across multiple ticks when toggle is on", () => {
    setHeatControl(session, true);
    setSessionReactorHeat(session, 1000);
    const initial = reactorHeat(session);
    for (let i = 0; i < 5; i++) session.tick();
    expect(reactorHeat(session)).toBeLessThan(initial);
  });

  it("does not reduce across multiple ticks when toggle is off", () => {
    setHeatControl(session, false);
    setSessionReactorHeat(session, 1000);
    const initial = reactorHeat(session);
    for (let i = 0; i < 5; i++) session.tick();
    expect(reactorHeat(session)).toBe(initial);
  });

  it("still auto-reduces when vents and capacitors are placed", () => {
    setHeatControl(session, true);
    setSessionReactorHeat(session, 1000);
    expect(session.placeComponent(0, 0, "vent1")).toBe(true);
    expect(session.placeComponent(0, 1, "capacitor1")).toBe(true);

    const before = reactorHeat(session);
    const autoReduction = reactorMaxHeat(session) / 10000;
    session.tick();
    expect(reactorHeat(session)).toBeLessThanOrEqual(before - autoReduction + 1e-6);
  });

  it("purchase heat_control_operator then enable toggle reduces heat", () => {
    expect(session.purchaseUpgrade("heat_control_operator")).toBe(true);
    expect(session.getUpgradeLevel("heat_control_operator")).toBe(1);
    setHeatControl(session, true);
    setSessionReactorHeat(session, 150);
    const initial = reactorHeat(session);
    session.tick();
    expect(reactorHeat(session)).toBeLessThan(initial);
  });
});
