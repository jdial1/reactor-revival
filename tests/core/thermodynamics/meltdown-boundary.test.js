import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionReactorHeat,
  reactorHeat,
  reactorMaxHeat,
  hasMeltedDown,
} from "../../helpers/sessionHelpers.js";

describe("Meltdown heat boundary (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("locks meltdown boundary to strictly greater than 2x max heat", () => {
    const max = reactorMaxHeat(session);
    setSessionReactorHeat(session, max * 2);
    session.tick();
    expect(hasMeltedDown(session)).toBe(false);
    expect(reactorHeat(session)).toBe(max * 2);

    setSessionReactorHeat(session, max * 2 + 1);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
  });

  it("locks meltdown at 2.1x max heat same as minimal over-2x", () => {
    const max = reactorMaxHeat(session);
    const h = max * 2.1;
    setSessionReactorHeat(session, h);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
    expect(reactorHeat(session)).toBe(h);
  });
});
