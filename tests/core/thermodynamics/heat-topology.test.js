import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  tileHeatAt,
  setSessionTileHeat,
  heatSegmentAt,
  componentTicksAt,
  hasMeltedDown,
  reactorMaxHeat,
} from "../../helpers/sessionHelpers.js";

function segmentTileKey(seg) {
  return (seg?.tiles ?? [])
    .map((t) => `${t.row},${t.col}`)
    .sort()
    .join("|");
}

describe("Heat Network Topology (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("decrements cell ticks when a vent neighbor is present", () => {
    expect(session.placeComponent(9, 4, "uranium1")).toBe(true);
    expect(session.placeComponent(10, 4, "vent1")).toBe(true);
    const before = componentTicksAt(session, 9, 4);
    session.tick();
    expect(componentTicksAt(session, 9, 4)).toBe(before - 1);
    expect(hasMeltedDown(session)).toBe(false);
  });

  it("lists active cells after placement", () => {
    expect(session.placeComponent(9, 4, "uranium1")).toBe(true);
    const cells = session.getActivePartList("active_cells");
    expect(cells.some((e) => e.row === 9 && e.col === 4)).toBe(true);
  });

  it("reports positive max heat after cell+vent placement", () => {
    expect(session.placeComponent(9, 4, "uranium1")).toBe(true);
    expect(session.placeComponent(10, 4, "vent1")).toBe(true);
    expect(reactorMaxHeat(session)).toBeGreaterThan(0);
  });

  it("merges two vent segments when a conducting tile bridges them", () => {
    expect(session.placeComponent(5, 2, "vent1")).toBe(true);
    expect(session.placeComponent(5, 4, "vent1")).toBe(true);
    expect(segmentTileKey(heatSegmentAt(session, 5, 2))).not.toBe(
      segmentTileKey(heatSegmentAt(session, 5, 4)),
    );

    expect(session.placeComponent(5, 3, "heat_exchanger1")).toBe(true);
    expect(segmentTileKey(heatSegmentAt(session, 5, 2))).toBe(
      segmentTileKey(heatSegmentAt(session, 5, 4)),
    );
  });

  it("splits a segment when the keystone bridge tile is sold", () => {
    expect(session.placeComponent(5, 2, "vent1")).toBe(true);
    expect(session.placeComponent(5, 3, "heat_exchanger1")).toBe(true);
    expect(session.placeComponent(5, 4, "vent1")).toBe(true);
    expect(segmentTileKey(heatSegmentAt(session, 5, 2))).toBe(
      segmentTileKey(heatSegmentAt(session, 5, 4)),
    );

    expect(session.runCommand({ type: "SELL_PART", payload: { row: 5, col: 3 } }).ok).toBe(true);
    expect(segmentTileKey(heatSegmentAt(session, 5, 2))).not.toBe(
      segmentTileKey(heatSegmentAt(session, 5, 4)),
    );
  });

  it("aggregates heat across merged segment components", () => {
    expect(session.placeComponent(5, 2, "vent1")).toBe(true);
    expect(session.placeComponent(5, 4, "vent1")).toBe(true);
    expect(session.placeComponent(5, 3, "heat_exchanger1")).toBe(true);
    setSessionTileHeat(session, 5, 2, 100);
    setSessionTileHeat(session, 5, 4, 100);

    const seg = heatSegmentAt(session, 5, 2);
    expect(seg.tiles.length).toBe(3);
    expect(seg.totalHeat).toBe(200);
    expect(seg.fullnessRatio).toBeGreaterThan(0);
    expect(tileHeatAt(session, 5, 2)).toBe(100);
  });
});
