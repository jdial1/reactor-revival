import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  tileHeatAt,
  reactorHeat,
  setSessionReactorHeat,
  hasMeltedDown,
} from "../../helpers/sessionHelpers.js";

describe("Heat outlet flow (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("moves hull heat into a neighboring vent", () => {
    expect(session.placeComponent(5, 5, "heat_outlet1")).toBe(true);
    expect(session.placeComponent(5, 6, "vent1")).toBe(true);
    setSessionReactorHeat(session, 100);

    session.tick();

    expect(reactorHeat(session)).toBeLessThan(100);
    expect(tileHeatAt(session, 5, 6)).toBeGreaterThan(0);
    expect(hasMeltedDown(session)).toBe(false);
  });
});
