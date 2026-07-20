import { describe, it, expect, beforeEach } from "vitest";
import { setupSessionOnly, sessionEp } from "../../helpers/sessionHelpers.js";
import { getPartImagePath } from "@app/core/part-images.js";

describe("Part Mechanics (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e6 });
  });

  it("locks uranium1 catalog scalars to base values", () => {
    const part = session.getPart("uranium1");
    expect(part).toBeDefined();
    expect(part.power).toBe(part.basePower);
    expect(part.heat).toBe(part.baseHeat);
    expect(part.baseCost).toBeGreaterThan(0);
    expect(Number(part.epHeat ?? part.baseEpHeat)).toBe(Number(part.baseEpHeat));
    expect(part.level).toBe(1);
    expect(part.category).toBe("cell");
    expect(part.type).toBe("uranium");
    expect(part.perpetual).toBe(false);
  });

  it("locks vent, capacitor, and accelerator specialty scalars", () => {
    expect(session.getPart("vent1").vent).toBeGreaterThan(0);
    expect(session.getPart("capacitor1").reactorPower).toBeGreaterThan(0);
    expect(Number(session.getPart("particle_accelerator1").epHeat)).toBeGreaterThan(0);
  });

  it("recalculates reflector ticks from upgrade levels", () => {
    const before = Number(session.getPart("reflector1").baseTicks);
    session.setUpgradeLevels([{ id: "improved_reflector_density", level: 1 }]);
    expect(Number(session.getPart("reflector1").baseTicks)).toBeGreaterThan(before);
  });

  it("maps multi-level and cell icon paths from part POJO fields", () => {
    const cap = session.getPart("capacitor3");
    const cell = session.getPart("plutonium2");
    expect(
      getPartImagePath({
        type: cap.type,
        category: cap.category,
        level: cap.level,
        id: cap.id,
      })
    ).toBe("img/parts/capacitor_3.png");
    expect(
      getPartImagePath({
        type: cell.type,
        category: cell.category,
        level: cell.level,
        id: cell.id,
      })
    ).toBe("img/parts/cell_2_2.png");
  });

  it("builds descriptive text from session catalog", () => {
    const description = session.getPartDescription("uranium1")?.text ?? "";
    expect(description).toContain("Creates");
    expect(description).toContain("heat");
    expect(description).toContain("power");
    expect(description).toContain("Lasts");
    expect(description).toContain("ticks.");
  });

  it("treats affordability as money versus baseCost", () => {
    const cost = Number(session.getPart("uranium1").baseCost);
    expect(sessionEp(session).money).toBeGreaterThanOrEqual(cost);
    session.debitMoney(sessionEp(session).money);
    expect(sessionEp(session).money).toBeLessThan(cost);
  });
});
