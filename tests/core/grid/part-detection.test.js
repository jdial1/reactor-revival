import { describe, it, expect, beforeEach } from "vitest";
import { setupSessionOnly } from "../../helpers/sessionHelpers.js";

describe("Part Detection (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("classifies placed outlet and vent into active session lists", () => {
    expect(session.placeComponent(5, 5, "heat_outlet1")).toBe(true);
    expect(session.placeComponent(5, 6, "vent1")).toBe(true);

    const outlets = session.getActivePartList("active_outlets");
    const vessels = session.getActivePartList("active_vessels");
    const vents = session.getActivePartList("active_vents");

    expect(outlets.some((e) => e.row === 5 && e.col === 5 && e.id === "heat_outlet1")).toBe(true);
    expect(vents.some((e) => e.row === 5 && e.col === 6 && e.id === "vent1")).toBe(true);
    expect(vessels.some((e) => e.row === 5 && e.col === 5 && e.id === "heat_outlet1")).toBe(true);
    expect(vessels.some((e) => e.row === 5 && e.col === 6 && e.id === "vent1")).toBe(true);
    expect(outlets.every((e) => e.activated)).toBe(true);
    expect(vents.every((e) => e.activated)).toBe(true);
  });
});
