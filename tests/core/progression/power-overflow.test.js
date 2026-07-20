import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionToggle,
  reactorHeat,
  setSessionReactorHeat,
} from "../../helpers/sessionHelpers.js";

function setOverflowCap(session, { ratio, maxPower, currentPower }) {
  setSessionToggle(session, "heat_control", false);
  session.mechanicsOverrides = {
    ...(session.mechanicsOverrides || {}),
    powerOverflowToHeatRatio: ratio,
    alteredMaxPower: maxPower,
  };
  session.grid.maxPower = maxPower;
  session.grid.currentPower = currentPower;
  setSessionReactorHeat(session, 0);
}

function cellOut(session) {
  return session.getCellOutputAt(0, 0);
}

function power(session) {
  return Number(session.grid.currentPower ?? 0);
}

describe("Power Overflow Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("converts excess power to heat when cap is reached", () => {
    setOverflowCap(session, { ratio: 1, maxPower: 100, currentPower: 100 });
    session.placeComponent(0, 0, "uranium1");
    session.tick();
    expect(power(session)).toBe(100);
    expect(reactorHeat(session)).toBeGreaterThan(0);
  });

  it("converts all generated power to heat when starting at max power", () => {
    setOverflowCap(session, { ratio: 1, maxPower: 100, currentPower: 100 });
    session.placeComponent(0, 0, "uranium1");
    const { power: cellPower, heat: cellHeat } = cellOut(session);
    session.tick();
    expect(power(session)).toBe(100);
    expect(reactorHeat(session)).toBeCloseTo(cellHeat + cellPower, 0);
  });

  it("does not add overflow heat when power stays within capacity", () => {
    setOverflowCap(session, { ratio: 1, maxPower: 100, currentPower: 50 });
    session.placeComponent(0, 0, "uranium1");
    const { power: cellPower, heat: cellHeat } = cellOut(session);
    session.tick();
    expect(power(session)).toBe(50 + cellPower);
    expect(reactorHeat(session)).toBeCloseTo(cellHeat, 0);
  });
});

describe("Difficulty power overflow to heat ratio (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("easy (ratio 0): overflow power is lost, no heat from overflow", () => {
    setOverflowCap(session, { ratio: 0, maxPower: 100, currentPower: 100 });
    session.placeComponent(0, 0, "uranium1");
    const { heat: cellHeat } = cellOut(session);
    session.tick();
    expect(power(session)).toBe(100);
    expect(reactorHeat(session)).toBeCloseTo(cellHeat, 0);
  });

  it("medium (ratio 0.5): half of overflow goes to heat", () => {
    setOverflowCap(session, { ratio: 0.5, maxPower: 100, currentPower: 100 });
    session.placeComponent(0, 0, "uranium1");
    const { power: cellPower, heat: cellHeat } = cellOut(session);
    session.tick();
    expect(power(session)).toBe(100);
    expect(reactorHeat(session)).toBeCloseTo(cellHeat + cellPower * 0.5, 0);
  });

  it("hard (ratio 1): all overflow goes to heat", () => {
    setOverflowCap(session, { ratio: 1, maxPower: 100, currentPower: 100 });
    session.placeComponent(0, 0, "uranium1");
    const { power: cellPower, heat: cellHeat } = cellOut(session);
    session.tick();
    expect(power(session)).toBe(100);
    expect(reactorHeat(session)).toBeCloseTo(cellHeat + cellPower, 0);
  });
});
