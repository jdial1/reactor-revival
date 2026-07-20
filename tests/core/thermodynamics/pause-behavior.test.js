import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionTileHeat,
  tileHeatAt,
  reactorHeat,
  componentTicksAt,
} from "../../helpers/sessionHelpers.js";

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

function power(session) {
  return Number(session.getSnapshot().grid.currentPower ?? 0);
}

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

describe("Pause Behavior (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e6 });
  });

  it("blocks hull heat generation while paused and resumes when unpaused", () => {
    expect(session.placeComponent(0, 0, "plutonium1")).toBe(true);
    const initial = reactorHeat(session);

    session.setPaused(true);
    for (let i = 0; i < 5; i++) session.tick();
    expect(reactorHeat(session)).toBe(initial);

    session.setPaused(false);
    session.tick();
    expect(reactorHeat(session)).toBeGreaterThan(initial);
  });

  it("holds coolant heat while paused and transfers when unpaused", () => {
    expect(session.placeComponent(5, 5, "coolant_cell1")).toBe(true);
    expect(session.placeComponent(5, 6, "heat_exchanger1")).toBe(true);
    expect(session.placeComponent(5, 7, "vent1")).toBe(true);
    setSessionTileHeat(session, 5, 5, 1000);
    const initial = tileHeatAt(session, 5, 5);

    session.setPaused(true);
    session.tick();
    expect(tileHeatAt(session, 5, 5)).toBe(initial);

    session.setPaused(false);
    session.tick();
    session.tick();
    expect(tileHeatAt(session, 5, 5)).not.toBe(initial);
  });

  it("freezes fuel ticks while paused and decrements when unpaused", () => {
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    const initial = componentTicksAt(session, 0, 0);

    session.setPaused(true);
    for (let i = 0; i < 10; i++) session.tick();
    expect(componentTicksAt(session, 0, 0)).toBe(initial);

    session.setPaused(false);
    session.tick();
    expect(componentTicksAt(session, 0, 0)).toBeLessThan(initial);
  });

  it("freezes power and tile heat across a multi-part layout while paused", () => {
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    expect(session.placeComponent(0, 1, "vent1")).toBe(true);
    expect(session.placeComponent(0, 2, "capacitor1")).toBe(true);

    const heat0 = reactorHeat(session);
    const power0 = power(session);
    const vent0 = tileHeatAt(session, 0, 1);

    session.setPaused(true);
    for (let i = 0; i < 10; i++) session.tick();

    expect(reactorHeat(session)).toBe(heat0);
    expect(power(session)).toBe(power0);
    expect(tileHeatAt(session, 0, 1)).toBe(vent0);
    expect(slotId(session, 0, 0)).toBe("uranium1");

    session.setPaused(false);
    session.tick();
    expect(power(session)).not.toBe(power0);
  });

  it("does not increase money while paused even with auto_sell", () => {
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    expect(session.placeComponent(0, 1, "capacitor1")).toBe(true);
    session.toggles.auto_sell = true;

    session.setPaused(true);
    const before = money(session);
    for (let i = 0; i < 50; i++) session.tick();
    expect(money(session)).toBe(before);

    session.setPaused(false);
    for (let i = 0; i < 5; i++) session.tick();
    const processed =
      power(session) > 0 || reactorHeat(session) > 0 || money(session) !== before;
    expect(processed).toBe(true);
  });

  it("preserves pause across session save/load", async () => {
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    session.setPaused(true);
    expect(session.getSnapshot().paused).toBe(true);

    const saved = session.save();
    const loaded = await setupSessionOnly();
    loaded.load(saved);

    expect(loaded.getSnapshot().paused).toBe(true);
    expect(loaded.getSnapshot().toggles.pause).toBe(true);

    loaded.setPaused(false);
    expect(loaded.getSnapshot().paused).toBe(false);
  });
});
