import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  tileHeatAt,
  setSessionTileHeat,
  setSessionReactorHeat,
  reactorHeat,
  reactorMaxHeat,
} from "../../helpers/sessionHelpers.js";

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

function cellPower(session, row, col) {
  return Number(session.getCellOutputAt(row, col)?.power ?? 0);
}

function maxPower(session) {
  return Number(session.getSnapshot().grid.maxPower ?? 0);
}

describe("Neighbor Interactions (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("cells only receive reflector bonuses from cardinal-adjacent reflectors", () => {
    place(session, 5, 5, "uranium1");
    const basePower = cellPower(session, 5, 5);

    place(session, 5, 4, "reflector1");
    place(session, 5, 6, "reflector1");
    place(session, 4, 5, "reflector1");
    place(session, 6, 5, "reflector1");
    place(session, 4, 4, "reflector1");

    const withCardinals = cellPower(session, 5, 5);
    expect(withCardinals).toBeGreaterThan(basePower);
    expect(session.getCellOutputAt(5, 5).reflectorCount).toBe(4);

    session.removeComponent(5, 4);
    expect(cellPower(session, 5, 5)).toBeLessThan(withCardinals);

    session.removeComponent(5, 6);
    session.removeComponent(4, 5);
    session.removeComponent(6, 5);
    expect(cellPower(session, 5, 5)).toBeCloseTo(basePower);
    expect(session.getCellOutputAt(5, 5).reflectorCount).toBe(0);
  });

  it("reflectors do not push heat into neighboring vents", () => {
    place(session, 3, 3, "vent1");
    place(session, 3, 4, "reflector1");
    setSessionTileHeat(session, 3, 3, 0);
    session.tick();
    expect(tileHeatAt(session, 3, 3)).toBe(0);
  });

  it("heat outlet transfers hull heat to cardinal vents only", () => {
    place(session, 5, 5, "heat_outlet1");
    place(session, 5, 6, "vent1");
    place(session, 4, 4, "vent1");
    setSessionReactorHeat(session, 100);
    setSessionTileHeat(session, 5, 6, 0);
    setSessionTileHeat(session, 4, 4, 0);

    session.tick();

    expect(tileHeatAt(session, 5, 6)).toBeGreaterThan(0);
    expect(tileHeatAt(session, 4, 4)).toBe(0);
    expect(reactorHeat(session)).toBeLessThan(100);
  });

  it("heat exchanger balances heat with cooler cardinal neighbors only", () => {
    place(session, 6, 6, "heat_exchanger1");
    place(session, 6, 5, "vent1");
    place(session, 5, 5, "vent1");
    setSessionTileHeat(session, 6, 6, 100);
    setSessionTileHeat(session, 6, 5, 0);
    setSessionTileHeat(session, 5, 5, 0);

    session.tick();

    expect(tileHeatAt(session, 6, 6)).toBeLessThan(100);
    expect(tileHeatAt(session, 6, 5)).toBeGreaterThan(0);
    expect(tileHeatAt(session, 5, 5)).toBe(0);
  });

  it("vents reduce only their own heat", () => {
    place(session, 2, 2, "vent1");
    place(session, 2, 3, "vent1");
    setSessionTileHeat(session, 2, 2, 20);
    setSessionTileHeat(session, 2, 3, 10);

    session.tick();

    expect(tileHeatAt(session, 2, 2)).toBeLessThan(20);
    expect(tileHeatAt(session, 2, 3)).toBeLessThanOrEqual(10);
  });

  it("capacitor and reactor plating raise caps without heating neighbors", () => {
    const prevMaxPower = maxPower(session);
    const prevMaxHeat = reactorMaxHeat(session);

    place(session, 0, 0, "capacitor1");
    place(session, 0, 1, "reactor_plating1");
    place(session, 0, 2, "vent1");
    setSessionTileHeat(session, 0, 2, 0);

    expect(maxPower(session)).toBeGreaterThanOrEqual(prevMaxPower);
    expect(reactorMaxHeat(session)).toBeGreaterThanOrEqual(prevMaxHeat);

    session.tick();
    expect(tileHeatAt(session, 0, 2)).toBe(0);
  });

  it("heat inlet pulls adjacent component heat into the hull", () => {
    place(session, 7, 7, "heat_inlet1");
    place(session, 7, 6, "vent1");
    setSessionTileHeat(session, 7, 6, 50);
    const prevHull = reactorHeat(session);

    session.tick();

    expect(tileHeatAt(session, 7, 6)).toBeLessThan(50);
    expect(reactorHeat(session)).toBeGreaterThan(prevHull);
  });

  it("particle accelerator receives heat from a cardinal heat outlet", () => {
    place(session, 9, 9, "heat_outlet1");
    place(session, 9, 10, "particle_accelerator1");
    setSessionReactorHeat(session, 200);

    session.tick();
    expect(tileHeatAt(session, 9, 10)).toBeGreaterThan(0);

    session.tick();
    session.tick();
    session.tick();
    expect(tileHeatAt(session, 9, 10)).toBeGreaterThan(0);
  });
});
