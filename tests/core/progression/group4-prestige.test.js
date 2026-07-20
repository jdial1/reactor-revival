import { describe, it, expect, beforeEach } from "vitest";
import { cappedPrestigeEpContribution, expectedPrestigeMultiplierFromTotalEp } from "../../helpers/suiteHelpers.js";
import {
  setupSessionOnly,
  setSessionEconomy,
  sessionEp,
  setSessionTileHeat,
  setSessionReactorHeat,
  reactorHeat,
} from "../../helpers/sessionHelpers.js";
import { PRESTIGE_MULTIPLIER_CAP } from "@app/constants/balance.js";

function money(session) {
  return Number(session.getSnapshot().economy?.money ?? 0);
}

function slotId(session, row, col) {
  const snap = session.getSnapshot();
  return snap.grid.slots[row * snap.grid.cols + col]?.id ?? null;
}

describe("Group 4: Exotic Particles & Prestige (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  it("locks defining weave EP on keep-EP reboot from session min", () => {
    setSessionEconomy(session, {
      currentExoticParticles: "0",
      totalExoticParticles: "0",
      sessionPowerProduced: "4000000",
      sessionHeatDissipated: "5000000",
    });
    expect(session.calculatePrestigeReward()).toBe(4);
    expect(session.reboot({ keepEp: true })).toBe(4);
    const ep = sessionEp(session);
    expect(ep.total).toBe(4);
    expect(ep.current).toBe(4);
  });

  it("locks no EP weave grant when session min is below 1e6", () => {
    session.creditExoticParticles(10);
    setSessionEconomy(session, {
      sessionPowerProduced: "500000",
      sessionHeatDissipated: "600000",
    });
    expect(session.calculatePrestigeReward()).toBe(0);
    session.reboot({ keepEp: true });
    expect(sessionEp(session).total).toBe(10);
  });

  it("locks particle accelerator ticks to zero EP gain regardless of tile heat", () => {
    expect(session.placeComponent(0, 0, "particle_accelerator1")).toBe(true);
    setSessionTileHeat(session, 0, 0, 1000);
    const before = sessionEp(session).current;
    session.tick();
    expect(sessionEp(session).current).toBe(before);

    setSessionTileHeat(session, 0, 0, 0);
    session.tick();
    expect(sessionEp(session).current).toBe(before);
  });

  it("locks keep-EP reboot state isolation", () => {
    session.creditExoticParticles(100);
    setSessionReactorHeat(session, 777);
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    session.setUpgradeLevels([
      { id: "laboratory", level: 1 },
      { id: "chronometer", level: 1 },
    ]);
    setSessionEconomy(session, {
      sessionPowerProduced: "0",
      sessionHeatDissipated: "0",
    });

    const epBefore = sessionEp(session);
    expect(session.getPrestigeMultiplier()).toBe(
      expectedPrestigeMultiplierFromTotalEp(epBefore.total)
    );

    session.reboot({ keepEp: true });

    const ep = sessionEp(session);
    expect(ep.total).toBe(epBefore.total);
    expect(ep.current).toBe(epBefore.current);
    expect(money(session)).toBe(10);
    expect(reactorHeat(session)).toBe(0);
    expect(slotId(session, 0, 0)).toBeFalsy();
    expect(session.getUpgradeLevel("laboratory")).toBe(1);
    expect(session.getUpgradeLevel("chronometer")).toBe(0);
    expect(session.getPrestigeMultiplier()).toBe(
      expectedPrestigeMultiplierFromTotalEp(ep.total)
    );
  });

  it("locks prestige multiplier cap from total exotic particles", () => {
    session.creditExoticParticles(200000);
    const epTotal = sessionEp(session).total;
    expect(cappedPrestigeEpContribution(epTotal)).toBe(PRESTIGE_MULTIPLIER_CAP);
    expect(session.getPrestigeMultiplier()).toBe(1 + PRESTIGE_MULTIPLIER_CAP);
  });

  it("locks discard-EP reboot clearing exotic particles and experimental upgrades", () => {
    session.creditExoticParticles(100);
    expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
    session.setUpgradeLevels([{ id: "laboratory", level: 1 }]);

    session.reboot({ keepEp: false });

    const ep = sessionEp(session);
    expect(ep.current).toBe(0);
    expect(ep.total).toBe(0);
    expect(money(session)).toBe(10);
    expect(slotId(session, 0, 0)).toBeFalsy();
    expect(session.getPrestigeMultiplier()).toBe(1);
    expect(session.getUpgradeLevel("laboratory")).toBe(0);
  });
});
