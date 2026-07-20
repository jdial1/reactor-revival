import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  sessionEp,
  componentTicksAt,
} from "../../helpers/sessionHelpers.js";

function money(session) {
  return sessionEp(session).money;
}

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

function placePaid(session, row, col, partId) {
  return session.runCommand({
    type: "PLACE_PART_PAID",
    payload: { row, col, partId },
  });
}

describe("Tile Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e6 });
  });

  it("places paid parts and refunds full cost on SELL_PART", () => {
    const cost = Number(session.getPart("uranium1").baseCost);
    const before = money(session);
    expect(placePaid(session, 0, 0, "uranium1").ok).toBe(true);
    expect(slotId(session, 0, 0)).toBe("uranium1");
    expect(money(session)).toBeCloseTo(before - cost, 6);

    const beforeSell = money(session);
    expect(session.computeSellValue(0, 0)).toBe(cost);
    expect(session.runCommand({ type: "SELL_PART", payload: { row: 0, col: 0 } }).ok).toBe(true);
    expect(slotId(session, 0, 0)).toBeNull();
    expect(money(session)).toBeCloseTo(beforeSell + cost, 6);
  });

  it("clears a part without refund via REMOVE_PART", () => {
    expect(placePaid(session, 0, 0, "uranium1").ok).toBe(true);
    const before = money(session);
    expect(session.runCommand({ type: "REMOVE_PART", payload: { row: 0, col: 0 } }).ok).toBe(true);
    expect(slotId(session, 0, 0)).toBeNull();
    expect(money(session)).toBe(before);
  });

  it("partial-refunds damaged parts from remaining ticks", () => {
    expect(placePaid(session, 0, 0, "uranium1").ok).toBe(true);
    const part = session.getPart("uranium1");
    const fullTicks = Number(part.baseTicks);
    const inst = session.grid.getComponentAt(0, 0);
    inst.ticks = fullTicks / 2;
    const expected = Math.ceil(Number(part.baseCost) * (componentTicksAt(session, 0, 0) / fullTicks));
    expect(session.computeSellValue(0, 0)).toBe(expected);

    const before = money(session);
    expect(session.runCommand({ type: "SELL_PART", payload: { row: 0, col: 0 } }).ok).toBe(true);
    expect(money(session)).toBe(before + expected);
  });

  it("rejects paid placement on occupied tiles", () => {
    expect(placePaid(session, 0, 0, "uranium1").result?.ok).toBe(true);
    const second = placePaid(session, 0, 0, "vent1");
    expect(second.result?.ok).toBe(false);
    expect(second.result?.reason).toBe("occupied");
    expect(slotId(session, 0, 0)).toBe("uranium1");
  });

  it("scales vent catalog rate with improved_heat_vents", () => {
    const before = Number(session.getPart("vent1").vent);
    session.setUpgradeLevels([{ id: "improved_heat_vents", level: 1 }]);
    expect(Number(session.getPart("vent1").vent)).toBe(before * 2);
  });

  it("keeps in-bounds slots placeable and rejects out-of-bounds", () => {
    const snap = session.getSnapshot();
    expect(snap.grid.rows).toBeGreaterThan(0);
    expect(snap.grid.cols).toBeGreaterThan(0);
    expect(placePaid(session, 0, 0, "uranium1").ok).toBe(true);
    expect(session.placeComponent(snap.grid.rows, snap.grid.cols, "uranium1")).toBe(false);
  });

  it("sells vent and capacitor at purchase price without doubling", () => {
    for (const partId of ["uranium1", "vent1", "capacitor1"]) {
      const cost = Number(session.getPart(partId).baseCost);
      const beforeBuy = money(session);
      expect(placePaid(session, 0, 0, partId).ok).toBe(true);
      expect(money(session)).toBeCloseTo(beforeBuy - cost, 6);
      expect(session.computeSellValue(0, 0)).toBe(cost);

      const beforeSell = money(session);
      expect(session.runCommand({ type: "SELL_PART", payload: { row: 0, col: 0 } }).ok).toBe(true);
      expect(money(session) - beforeSell).toBeCloseTo(cost, 6);
      expect(money(session) - beforeSell).not.toBeCloseTo(cost * 2, 6);
      expect(slotId(session, 0, 0)).toBeNull();
    }
  });
});
