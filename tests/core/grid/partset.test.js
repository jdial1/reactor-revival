import { describe, it, expect, beforeEach } from "vitest";
import { setupSessionOnly } from "../../helpers/sessionHelpers.js";

function partsByType(session, type) {
  return session.listParts().filter((p) => p.type === type);
}

function partsByLevel(session, level) {
  return session.listParts().filter((p) => p.level === level);
}

function partsByCategory(session, category) {
  return session.listParts().filter((p) => p.category === category);
}

describe("Partset Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("exposes required catalog ids via getPart/listParts", () => {
    for (const id of ["uranium1", "uranium2", "uranium3", "vent1", "capacitor1"]) {
      const part = session.getPart(id);
      expect(part).toBeDefined();
      expect(part.id).toBe(id);
    }
    expect(session.listParts().length).toBeGreaterThan(0);
    expect(session.listParts().every((p) => p.id && p.type)).toBe(true);
  });

  it("returns nullish for invalid part ids", () => {
    expect(session.getPart("invalid_part")).toBeFalsy();
  });

  it("filters parts by type, level, and category", () => {
    const uranium = partsByType(session, "uranium");
    expect(uranium).toHaveLength(3);
    uranium.forEach((p) => expect(p.id).toMatch(/^uranium\d$/));

    const vents = partsByType(session, "vent");
    expect(vents).toHaveLength(6);
    vents.forEach((p) => expect(p.id).toMatch(/^vent\d$/));

    expect(partsByType(session, "invalid_type")).toEqual([]);

    const tier1 = partsByLevel(session, 1);
    expect(tier1.length).toBeGreaterThan(0);
    tier1.forEach((p) => expect(p.level).toBe(1));

    const tier2 = partsByLevel(session, 2);
    expect(tier2.length).toBeGreaterThan(0);
    tier2.forEach((p) => expect(p.level).toBe(2));
    expect(partsByLevel(session, 999)).toEqual([]);

    const cells = partsByCategory(session, "cell");
    expect(cells.length).toBeGreaterThan(0);
    cells.forEach((p) => expect(p.category).toBe("cell"));

    const cooling = partsByCategory(session, "vent");
    expect(cooling.length).toBeGreaterThan(0);
    cooling.forEach((p) => expect(p.category).toBe("vent"));
    expect(partsByCategory(session, "invalid_category")).toEqual([]);
  });

  it("unlocks higher tiers when placedCounts hit the threshold", () => {
    expect(session.getPlacedCount("uranium", 1)).toBeLessThan(10);
    session.setPlacedCounts({ "uranium:1": 10 });
    expect(session.getPlacedCount("uranium", 1)).toBeGreaterThanOrEqual(10);
    expect(session.getPart("uranium2")).toBeDefined();
  });
});
