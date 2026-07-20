import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionTileHeat,
  tileHeatAt,
  setSessionReactorHeat,
  reactorHeat,
  reactorMaxHeat,
  hasMeltedDown,
} from "../../helpers/sessionHelpers.js";

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

function power(session) {
  return Number(session.getSnapshot().grid.currentPower ?? 0);
}

function maxPower(session) {
  return Number(session.getSnapshot().grid.maxPower ?? 0);
}

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

function cellPower(session, row, col) {
  return Number(session.getCellOutputAt(row, col)?.power ?? 0);
}

function cellHeat(session, row, col) {
  return Number(session.getCellOutputAt(row, col)?.heat ?? 0);
}

describe("Reactor Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e6 });
  });

  it("initializes with zero live scalars and default caps", () => {
    expect(power(session)).toBe(0);
    expect(reactorHeat(session)).toBe(0);
    expect(maxPower(session)).toBe(100);
    expect(reactorMaxHeat(session)).toBe(1000);
    expect(hasMeltedDown(session)).toBe(false);
  });

  it("reports cell output power and heat for active parts", () => {
    place(session, 0, 0, "uranium1");
    const part = session.getPart("uranium1");
    expect(cellPower(session, 0, 0)).toBe(Number(part.power ?? part.basePower));
    expect(cellHeat(session, 0, 0)).toBe(Number(part.heat ?? part.baseHeat));
    expect(tileHeatAt(session, 0, 0)).toBe(0);
  });

  it("sums outputs across multiple active cells", () => {
    place(session, 0, 0, "uranium1");
    place(session, 1, 1, "uranium1");
    const part = session.getPart("uranium1");
    expect(cellPower(session, 0, 0) + cellPower(session, 1, 1)).toBe(
      Number(part.power ?? part.basePower) * 2
    );
    expect(cellHeat(session, 0, 0) + cellHeat(session, 1, 1)).toBe(
      Number(part.heat ?? part.baseHeat) * 2
    );
  });

  it("sums contained tile heat across parts", () => {
    place(session, 0, 0, "uranium1");
    place(session, 1, 1, "uranium1");
    setSessionTileHeat(session, 0, 0, 50);
    setSessionTileHeat(session, 1, 1, 75);
    expect(tileHeatAt(session, 0, 0) + tileHeatAt(session, 1, 1)).toBe(125);
  });

  it("adds cell heat to the hull on tick", () => {
    place(session, 0, 0, "uranium1");
    setSessionReactorHeat(session, 0);
    session.toggles.heat_control = false;
    session.tick();
    expect(reactorHeat(session)).toBeGreaterThan(0);
    expect(reactorHeat(session)).toBe(cellHeat(session, 0, 0));
  });

  it("keeps hull heat non-negative after a tick", () => {
    place(session, 0, 0, "uranium1");
    setSessionReactorHeat(session, 0);
    session.tick();
    expect(reactorHeat(session)).toBeGreaterThanOrEqual(0);
  });

  it("sells stored power for money via SELL_POWER", () => {
    place(session, 0, 0, "uranium1");
    session.tick();
    const stored = power(session);
    expect(stored).toBeGreaterThan(0);
    const before = money(session);
    const result = session.runCommand({ type: "SELL_POWER", payload: {} });
    expect(result.ok).toBe(true);
    expect(power(session)).toBe(0);
    expect(money(session)).toBeCloseTo(before + stored, 6);
  });

  it("applies cardinal reflector bonuses to cell output", () => {
    place(session, 0, 0, "uranium1");
    place(session, 0, 1, "reflector1");
    const cell = session.getPart("uranium1");
    const reflector = session.getPart("reflector1");
    const reflectorPulse = 1 + Number(reflector.powerIncrease) / 100;
    const expected = Number(cell.basePower) * (1 + reflectorPulse);
    expect(cellPower(session, 0, 0)).toBeCloseTo(expected);
  });

  it("vents hull heat via VENT_HEAT", () => {
    setSessionReactorHeat(session, 100);
    const result = session.runCommand({ type: "VENT_HEAT", payload: {} });
    expect(result.ok).toBe(true);
    expect(reactorHeat(session)).toBe(99);

    setSessionReactorHeat(session, 0.5);
    session.runCommand({ type: "VENT_HEAT", payload: {} });
    expect(reactorHeat(session)).toBe(0);
  });

  it("does not treat infused cells as a separate harmonic power multiplier beyond compiled output", () => {
    session.creditExoticParticles?.(1e6);
    session.setUpgradeLevels([
      { id: "laboratory", level: 1 },
      { id: "infused_cells", level: 1 },
    ]);
    place(session, 0, 0, "uranium1");
    session.grid.currentPower = 0;
    const part = session.getPart("uranium1");
    session.tick();
    expect(power(session)).toBeCloseTo(Number(part.basePower) * 4, 0);
  });

  it("auto-reduces hull heat when heat_control is on", () => {
    setSessionReactorHeat(session, 1000);
    session.toggles.heat_control = true;
    session.tick();
    expect(reactorHeat(session)).toBeLessThan(1000);
    expect(reactorHeat(session)).toBeGreaterThan(0);
  });

  it("clears melt and scalars on reboot", () => {
    setSessionReactorHeat(session, reactorMaxHeat(session) * 2.1);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
    session.reboot();
    expect(hasMeltedDown(session)).toBe(false);
    expect(reactorHeat(session)).toBe(0);
    expect(power(session)).toBe(0);
  });

  it("raises max heat when reactor plating is placed", () => {
    const before = reactorMaxHeat(session);
    const plating = session.getPart("reactor_plating1");
    place(session, 0, 0, "reactor_plating1");
    expect(reactorMaxHeat(session)).toBe(before + Number(plating.reactorHeat));
  });
});
