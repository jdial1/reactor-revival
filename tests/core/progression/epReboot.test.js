import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  sessionEp,
  setSessionEconomy,
} from "../../helpers/sessionHelpers.js";

describe("EP Reboot (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("grants EP at reboot from session power and heat (defining weave)", () => {
    setSessionEconomy(session, {
      currentExoticParticles: "0",
      totalExoticParticles: "0",
      sessionPowerProduced: "5000000",
      sessionHeatDissipated: "6000000",
    });
    expect(session.calculatePrestigeReward()).toBe(5);

    const earned = session.reboot({ keepEp: true });
    expect(earned).toBe(5);
    const ep = sessionEp(session);
    expect(ep.total).toBe(5);
    expect(ep.current).toBe(5);
    expect(ep.sessionPower).toBe(0);
    expect(ep.sessionHeat).toBe(0);
  });

  it("keeps total EP when rebooting with keepEp", () => {
    session.creditExoticParticles(75);
    setSessionEconomy(session, {
      sessionPowerProduced: "0",
      sessionHeatDissipated: "0",
    });
    const before = sessionEp(session);
    expect(before.total).toBe(75);

    session.reboot({ keepEp: true });
    const after = sessionEp(session);
    expect(after.total).toBe(75);
    expect(after.current).toBe(75);
    expect(after.money).toBe(Number(session.getSnapshot().economy.money));
  });

  it("preserves experimental upgrades but resets standard ones on reboot", () => {
    expect(purchaseSessionUpgrade(session, "chronometer")).toBeTruthy();
    session.creditExoticParticles(100);
    expect(purchaseSessionUpgrade(session, "laboratory")).toBeTruthy();
    expect(session.getUpgradeLevel("chronometer")).toBe(1);
    expect(session.getUpgradeLevel("laboratory")).toBe(1);

    session.reboot({ keepEp: true });

    expect(session.getUpgradeLevel("chronometer")).toBe(0);
    expect(session.getUpgradeLevel("laboratory")).toBe(1);
  });

  it("zeros all EP on discard reboot (keepEp false)", () => {
    session.creditExoticParticles(10);
    expect(sessionEp(session).total).toBe(10);

    session.reboot({ keepEp: false });

    const ep = sessionEp(session);
    expect(ep.current).toBe(0);
    expect(ep.total).toBe(0);
  });

  it("initializes EP at zero", () => {
    const ep = sessionEp(session);
    expect(ep.current).toBe(0);
    expect(ep.total).toBe(0);
  });
});
