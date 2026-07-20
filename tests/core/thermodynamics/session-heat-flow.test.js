import { describe, it, expect, beforeEach } from "vitest";
import { setupSessionOnly, tileHeatAt } from "../../helpers/sessionHelpers.js";

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

describe("Session heat flow (createGameSession)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("routes cell heat into a neighboring heat exchanger (hull stays 0)", () => {
    expect(session.placeComponent(5, 1, "uranium1")).toBe(true);
    expect(session.placeComponent(5, 2, "heat_exchanger1")).toBe(true);

    session.tick();
    const snap = session.getSnapshot();
    expect(snap.grid.currentHeat).toBe(0);
    expect(tileHeatAt(session, 5, 2)).toBeGreaterThan(0);
    expect(slotId(session, 5, 2)).toBe("heat_exchanger1");
    expect(snap.hasMeltedDown).toBe(false);
  });

  it("stores cell heat in a neighboring coolant cell (hull stays 0)", () => {
    expect(session.placeComponent(5, 5, "uranium1")).toBe(true);
    expect(session.placeComponent(5, 6, "coolant_cell1")).toBe(true);

    const powerBefore = Number(session.getSnapshot().grid.currentPower);
    session.tick();
    const snap = session.getSnapshot();
    expect(Number(snap.grid.currentPower)).toBeGreaterThan(powerBefore);
    expect(snap.grid.currentHeat).toBe(0);
    expect(tileHeatAt(session, 5, 6)).toBeGreaterThan(0);
    expect(slotId(session, 5, 6)).toBe("coolant_cell1");
  });

  it("vents tile heat when unpaused and holds it when paused", () => {
    expect(session.placeComponent(0, 0, "vent1")).toBe(true);
    session.grid.setTileHeat(0, 0, 80);
    expect(tileHeatAt(session, 0, 0)).toBe(80);

    session.setPaused(true);
    session.tick();
    expect(tileHeatAt(session, 0, 0)).toBe(80);

    session.setPaused(false);
    session.tick();
    expect(tileHeatAt(session, 0, 0)).toBeLessThan(80);
  });
});
