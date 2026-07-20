import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionReactorHeat,
  reactorHeat,
  reactorMaxHeat,
  componentTicksAt,
} from "../../helpers/sessionHelpers.js";
import { REACTOR_HEAT_STANDARD_DIVISOR } from "@app/constants/sim.js";

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

function power(session) {
  return Number(session.getSnapshot().grid.currentPower ?? 0);
}

function maxPower(session) {
  return Number(session.getSnapshot().grid.maxPower ?? 0);
}

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

describe("Group 1: Core Grid & Component Generation (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("locks base cell power and heat without reflectors", () => {
    place(session, 3, 3, "uranium1");
    const part = session.getPart("uranium1");
    const out = session.getCellOutputAt(3, 3);

    expect(out.power).toBe(Number(part.basePower));
    expect(out.heat).toBe(Number(part.baseHeat));

    session.grid.currentPower = 0;
    setSessionReactorHeat(session, 0);
    session.toggles.heat_control = true;
    session.tick();

    expect(power(session)).toBe(Number(part.basePower));
    expect(componentTicksAt(session, 3, 3)).toBe(Number(part.baseTicks) - 1);
    const baseVent = reactorMaxHeat(session) / REACTOR_HEAT_STANDARD_DIVISOR;
    expect(reactorHeat(session)).toBe(Number(part.baseHeat) - baseVent);
  });

  it("locks cardinal reflector multiplier and ignores diagonal reflectors", () => {
    place(session, 5, 5, "uranium1");
    place(session, 5, 6, "reflector1");
    place(session, 4, 4, "reflector1");
    const cardTicksBefore = componentTicksAt(session, 5, 6);
    const diagTicksBefore = componentTicksAt(session, 4, 4);

    const cell = session.getPart("uranium1");
    const reflector = session.getPart("reflector1");
    const reflectorPulse = 1 + Number(reflector.powerIncrease) / 100;
    const pulse = 1 + reflectorPulse;
    const expectedPower = Number(cell.basePower) * pulse;
    const expectedHeat = Number(cell.baseHeat) * pulse * pulse;

    const out = session.getCellOutputAt(5, 5);
    expect(out.power).toBeCloseTo(expectedPower, 10);
    expect(out.heat).toBeCloseTo(expectedHeat, 10);
    expect(out.reflectorCount).toBe(1);

    session.grid.currentPower = 0;
    setSessionReactorHeat(session, 0);
    session.toggles.heat_control = true;
    session.tick();

    expect(power(session)).toBeCloseTo(expectedPower, 10);
    const baseVent = reactorMaxHeat(session) / REACTOR_HEAT_STANDARD_DIVISOR;
    expect(reactorHeat(session)).toBeCloseTo(expectedHeat - baseVent, 10);
    expect(componentTicksAt(session, 5, 5)).toBe(Number(cell.baseTicks) - 1);
    expect(componentTicksAt(session, 5, 6)).toBe(cardTicksBefore - 1);
    expect(componentTicksAt(session, 4, 4)).toBe(diagTicksBefore);
  });

  it("locks capacitor and reactor plating global capacity effects", () => {
    const baseMaxPower = maxPower(session);
    const baseMaxHeat = reactorMaxHeat(session);
    const capacitor = session.getPart("capacitor1");
    const plating = session.getPart("reactor_plating1");

    place(session, 0, 0, "capacitor1");
    place(session, 0, 1, "reactor_plating1");

    expect(maxPower(session)).toBe(baseMaxPower + Number(capacitor.reactorPower));
    expect(reactorMaxHeat(session)).toBe(baseMaxHeat + Number(plating.reactorHeat));

    session.grid.currentPower = 0;
    setSessionReactorHeat(session, 0);
    session.tick();

    expect(power(session)).toBe(0);
    expect(reactorHeat(session)).toBe(0);
  });

  it("locks durability decrement by exactly one tick", () => {
    place(session, 1, 1, "uranium1");
    const part = session.getPart("uranium1");
    session.tick();
    expect(componentTicksAt(session, 1, 1)).toBe(Number(part.baseTicks) - 1);
  });

  it("locks depletion when durability reaches zero", () => {
    place(session, 2, 2, "uranium1");
    session.grid.getComponentAt(2, 2).ticks = 1;
    session.tick();

    expect(session.grid.getComponentAt(2, 2)).toBeNull();
    expect(slotId(session, 2, 2)).toBeFalsy();
    expect(componentTicksAt(session, 2, 2)).toBe(0);
  });
});
