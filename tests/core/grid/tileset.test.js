import { describe, it, expect, beforeEach } from "vitest";
import { setupSessionOnly } from "../../helpers/sessionHelpers.js";
import { topologyNeighborCoords } from "reactor-core";

function slotAt(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col] ?? null;
}

function clearOccupied(session) {
  const snap = session.getSnapshot();
  for (let i = 0; i < snap.grid.slots.length; i++) {
    const slot = snap.grid.slots[i];
    if (!slot?.id) continue;
    session.removeComponent(Math.floor(i / snap.grid.cols), i % snap.grid.cols);
  }
}

describe("Tileset Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("exposes a rectangular slot grid matching snapshot dims", () => {
    const { rows, cols, slots } = session.getSnapshot().grid;
    expect(rows).toBeGreaterThan(0);
    expect(cols).toBeGreaterThan(0);
    expect(slots).toHaveLength(rows * cols);
  });

  it("reads in-bounds coordinates and rejects out-of-bounds placement", () => {
    const { rows, cols } = session.getSnapshot().grid;
    expect(session.placeComponent(5, 8, "uranium1")).toBe(true);
    expect(slotAt(session, 5, 8)?.id).toBe("uranium1");
    expect(session.placeComponent(rows, cols, "uranium1")).toBe(false);
    expect(session.placeComponent(-1, 0, "uranium1")).toBe(false);
  });

  it("lists von Neumann neighbors via topologyNeighborCoords", () => {
    const { rows, cols } = session.getSnapshot().grid;
    const coords = topologyNeighborCoords("Manhattan", 5, 5, 1, rows, cols);
    expect(coords).toHaveLength(4);
    expect(coords).toContainEqual([4, 5]);
    expect(coords).toContainEqual([6, 5]);
    expect(coords).toContainEqual([5, 4]);
    expect(coords).toContainEqual([5, 6]);
  });

  it("clears all placed parts via removeComponent", () => {
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    expect(session.placeComponent(1, 1, "vent1")).toBe(true);
    clearOccupied(session);
    expect(slotAt(session, 0, 0)?.id).toBeFalsy();
    expect(slotAt(session, 1, 1)?.id).toBeFalsy();
    expect(session.getActivePartList("active_vessels")).toHaveLength(0);
  });
});
