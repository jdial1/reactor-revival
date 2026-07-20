import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  setSessionReactorHeat,
  reactorMaxHeat,
  hasMeltedDown,
  setSessionGraceTicks,
  sessionGraceTicks,
} from "../../helpers/sessionHelpers.js";

describe("Reactor Meltdown Scenarios (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly();
  });

  it("keeps reporting meltdown on subsequent ticks", () => {
    setSessionReactorHeat(session, reactorMaxHeat(session) * 2.1);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
    const again = session.tick();
    expect(again.meltdown).toBe(true);
    expect(hasMeltedDown(session)).toBe(true);
  });

  it("clears meltdown on reboot", () => {
    setSessionReactorHeat(session, reactorMaxHeat(session) * 2.1);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
    session.reboot();
    expect(hasMeltedDown(session)).toBe(false);
  });

  it("blocks meltdown while gracePeriodTicks > 0", () => {
    setSessionGraceTicks(session, 2);
    setSessionReactorHeat(session, reactorMaxHeat(session) * 2.1);
    session.tick();
    expect(sessionGraceTicks(session)).toBe(1);
    expect(hasMeltedDown(session)).toBe(false);
    session.tick();
    expect(sessionGraceTicks(session)).toBe(0);
    expect(hasMeltedDown(session)).toBe(false);
    session.tick();
    expect(hasMeltedDown(session)).toBe(true);
  });
});
