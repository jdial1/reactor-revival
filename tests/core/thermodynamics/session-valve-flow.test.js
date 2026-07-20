import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  tileHeatAt,
  setSessionTileHeat,
  containmentAt,
  hasMeltedDown,
} from "../../helpers/sessionHelpers.js";

function place(session, row, col, id) {
  expect(session.placeComponent(row, col, id)).toBe(true);
}

describe("Valve heat flow (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("transfers overflow-valve coolant heat into a vent", () => {
    place(session, 5, 5, "coolant_cell1");
    place(session, 5, 6, "overflow_valve");
    place(session, 5, 7, "vent1");
    setSessionTileHeat(session, 5, 5, 1700);
    setSessionTileHeat(session, 5, 6, 0);
    setSessionTileHeat(session, 5, 7, 0);

    session.tick();

    expect(tileHeatAt(session, 5, 5)).toBeLessThan(1700);
    expect(tileHeatAt(session, 5, 7)).toBeGreaterThan(0);
  });

  it("lets a vent self-cool when overflow source is below transfer threshold", () => {
    place(session, 5, 5, "coolant_cell1");
    place(session, 5, 6, "overflow_valve");
    place(session, 5, 7, "vent1");
    const coolCap = containmentAt(session, 5, 5);
    setSessionTileHeat(session, 5, 5, coolCap * 0.5);
    setSessionTileHeat(session, 5, 6, 0);
    setSessionTileHeat(session, 5, 7, 100);

    session.tick();

    expect(tileHeatAt(session, 5, 7)).toBeLessThan(100);
  });

  it("processes overflow valves at grid corners without throwing", () => {
    place(session, 1, 0, "coolant_cell1");
    place(session, 0, 0, "overflow_valve");
    place(session, 0, 1, "vent1");
    setSessionTileHeat(session, 1, 0, 1700);

    expect(() => session.tick()).not.toThrow();
    expect(tileHeatAt(session, 1, 0)).toBeLessThan(1700);
  });

  it("keeps a top-up valve lattice stable over many ticks without meltdown", () => {
    const layout = [
      [1, 6, "vent1"],
      [1, 7, "topup_valve"],
      [1, 8, "vent1"],
      [1, 9, "topup_valve"],
      [2, 6, "topup_valve"],
      [2, 7, "coolant_cell1"],
      [2, 8, "heat_exchanger1"],
      [2, 9, "coolant_cell1"],
      [3, 6, "topup_valve"],
      [3, 7, "vent1"],
      [3, 8, "topup_valve"],
      [3, 9, "vent1"],
    ];
    for (const [r, c, id] of layout) place(session, r, c, id);

    setSessionTileHeat(session, 1, 6, 50);
    setSessionTileHeat(session, 1, 8, 30);
    setSessionTileHeat(session, 2, 7, 800);
    setSessionTileHeat(session, 2, 9, 800);

    for (let i = 0; i < 40; i++) session.tick();

    expect(hasMeltedDown(session)).toBe(false);
    expect(session.grid.getComponentAt(1, 6)?.definition?.id).toBe("vent1");
    expect(session.grid.getComponentAt(3, 7)?.definition?.id).toBe("vent1");
  });
});
