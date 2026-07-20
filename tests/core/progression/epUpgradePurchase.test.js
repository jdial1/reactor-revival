import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  sessionEp,
  setSessionEconomy,
} from "../../helpers/sessionHelpers.js";

describe("EP Upgrade Purchase (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  describe("EP cost calculation", () => {
    it("reports base EP cost for experimental upgrades", () => {
      const infused = session.previewUpgrade("infused_cells");
      expect(infused.ok).toBe(true);
      expect(infused.def.baseCost).toBe(100);
      expect(infused.cost).toBe(100);
      expect(infused.currency).toBe("ep");

      session.setUpgradeLevels([{ id: "infused_cells", level: 1 }]);
      expect(session.previewUpgrade("infused_cells").cost).toBe(200);
    });

    it("reports base EP cost for laboratory", () => {
      const lab = session.previewUpgrade("laboratory");
      expect(lab.ok).toBe(true);
      expect(lab.def.baseCost).toBe(1);
      expect(lab.cost).toBe(1);
      expect(lab.currency).toBe("ep");
    });

    it("reports base EP cost for experimental boosts", () => {
      const fractal = session.previewUpgrade("fractal_piping");
      expect(fractal.ok).toBe(true);
      expect(fractal.def.baseCost).toBe(50);
      expect(fractal.cost).toBe(50);
      expect(fractal.currency).toBe("ep");
    });
  });

  describe("EP affordability", () => {
    it("marks laboratory purchasable when EP covers cost", () => {
      const cost = session.previewUpgrade("laboratory").cost;
      session.creditExoticParticles(cost + 1000);
      const lab = session.previewUpgrade("laboratory");
      expect(lab.canPurchase).toBe(true);
      expect(lab.reason).toBeNull();
    });

    it("marks laboratory unpurchasable when EP is insufficient", () => {
      setSessionEconomy(session, {
        currentExoticParticles: "0",
        totalExoticParticles: "0",
      });
      const lab = session.previewUpgrade("laboratory");
      expect(lab.canPurchase).toBe(false);
      expect(lab.reason).toBe("funds");
    });

    it("blocks protium_cells until laboratory is owned", () => {
      session.creditExoticParticles(1000);
      const protium = session.previewUpgrade("protium_cells");
      expect(protium.def.erequires).toEqual(["laboratory"]);
      expect(protium.canPurchase).toBe(false);
      expect(protium.reason).toBe("requires");
    });

    it("allows protium_cells after laboratory purchase", () => {
      session.creditExoticParticles(1000);
      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);
      const protium = session.previewUpgrade("protium_cells");
      expect(protium.canPurchase).toBe(true);
      expect(protium.reason).toBeNull();
    });
  });

  describe("EP purchase", () => {
    it("spends current EP and raises laboratory level", () => {
      const cost = session.previewUpgrade("laboratory").cost;
      session.creditExoticParticles(cost + 100);
      const before = sessionEp(session).current;

      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);
      expect(session.getUpgradeLevel("laboratory")).toBe(1);
      expect(sessionEp(session).current).toBe(before - cost);
    });

    it("rejects purchase when EP is insufficient", () => {
      setSessionEconomy(session, {
        currentExoticParticles: "0",
        totalExoticParticles: "0",
      });
      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(false);
      expect(session.getUpgradeLevel("laboratory")).toBe(0);
      expect(sessionEp(session).current).toBe(0);
    });

    it("rejects protium_cells without laboratory", () => {
      session.creditExoticParticles(1000);
      expect(purchaseSessionUpgrade(session, "protium_cells")).toBe(false);
      expect(session.getUpgradeLevel("protium_cells")).toBe(0);
      expect(sessionEp(session).current).toBe(1000);
    });

    it("rejects purchase at max level without spending EP", () => {
      session.setUpgradeLevels([{ id: "laboratory", level: 1 }]);
      session.creditExoticParticles(10);
      const before = sessionEp(session).current;

      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(false);
      expect(session.previewUpgrade("laboratory").reason).toBe("max_level");
      expect(sessionEp(session).current).toBe(before);
    });
  });

  describe("EP purchase integration", () => {
    it("unlocks protium affordability after buying laboratory", () => {
      const labCost = session.previewUpgrade("laboratory").cost;
      const protiumCost = session.previewUpgrade("protium_cells").cost;
      session.creditExoticParticles(labCost + protiumCost);

      expect(session.previewUpgrade("protium_cells").canPurchase).toBe(false);
      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);
      expect(session.previewUpgrade("protium_cells").canPurchase).toBe(true);
    });

    it("purchases fractal_piping after laboratory and spends EP to zero", () => {
      session.setUpgradeLevels([{ id: "laboratory", level: 1 }]);
      const cost = session.previewUpgrade("fractal_piping").cost;
      setSessionEconomy(session, {
        currentExoticParticles: String(cost),
        totalExoticParticles: String(cost),
      });

      expect(purchaseSessionUpgrade(session, "fractal_piping")).toBe(true);
      expect(session.getUpgradeLevel("fractal_piping")).toBe(1);
      expect(sessionEp(session).current).toBe(0);
    });
  });

  describe("EP economy", () => {
    it("decrements current EP only; total EP stays put", () => {
      const cost = session.previewUpgrade("laboratory").cost;
      const initial = cost + 50;
      setSessionEconomy(session, {
        currentExoticParticles: String(initial),
        totalExoticParticles: String(initial),
      });

      expect(purchaseSessionUpgrade(session, "laboratory")).toBe(true);
      const ep = sessionEp(session);
      expect(ep.current).toBe(initial - cost);
      expect(ep.total).toBe(initial);
    });
  });
});
