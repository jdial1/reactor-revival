import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  purchaseSessionUpgrade,
  setSessionTileHeat,
  tileHeatAt,
  setSessionReactorHeat,
  reactorHeat,
  sessionEp,
  setSessionEconomy,
} from "../../helpers/sessionHelpers.js";

function power(session) {
  return Number(session.getSnapshot().grid.currentPower ?? 0);
}

describe("New Gameplay Upgrades (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
  });

  describe("efficiency and utility", () => {
    it("stirling_generators converts vented heat to power", () => {
      expect(session.placeComponent(0, 0, "vent1")).toBe(true);
      setSessionTileHeat(session, 0, 0, 40);
      expect(purchaseSessionUpgrade(session, "stirling_generators")).toBe(true);
      expect(session.modifiers.stirlingMultiplier).toBeGreaterThan(0);

      const powerBefore = power(session);
      const heatBefore = tileHeatAt(session, 0, 0);
      session.tick();
      const vented = heatBefore - tileHeatAt(session, 0, 0);
      expect(vented).toBeGreaterThan(0);
      expect(power(session) - powerBefore).toBeCloseTo(
        vented * session.modifiers.stirlingMultiplier,
        4
      );
    });

    it("emergency_coolant increases VENT_HEAT reduction", () => {
      setSessionReactorHeat(session, 1000);
      session.grid.maxHeat = 1000;
      expect(purchaseSessionUpgrade(session, "emergency_coolant")).toBe(true);
      expect(session.modifiers.manualVentPercent).toBeGreaterThan(0);

      session.runCommand({ type: "VENT_HEAT", payload: {} });
      expect(reactorHeat(session)).toBe(1000 - (1 + 1000 * 0.005));
    });
  });

  describe("durability and stability", () => {
    it("component_reinforcement raises buffer containment", () => {
      const before = Number(session.getPart("capacitor1").containment);
      expect(purchaseSessionUpgrade(session, "component_reinforcement")).toBe(true);
      expect(Number(session.getPart("capacitor1").containment)).toBeCloseTo(before * 1.1, 5);
    });

    it("isotope_stabilization raises cell baseTicks", () => {
      const before = Number(session.getPart("uranium1").baseTicks);
      expect(purchaseSessionUpgrade(session, "isotope_stabilization")).toBe(true);
      expect(Number(session.getPart("uranium1").baseTicks)).toBeCloseTo(before * 1.05, 5);
    });

    it("reflector_cooling reduces adjacent cell heat output", () => {
      expect(session.placeComponent(0, 0, "uranium1")).toBe(true);
      expect(session.placeComponent(0, 1, "reflector1")).toBe(true);
      const heatBefore = Number(session.getCellOutputAt(0, 0).heat);
      expect(purchaseSessionUpgrade(session, "reflector_cooling")).toBe(true);
      expect(session.modifiers.reflectorCoolingFactor).toBeGreaterThan(0);
      expect(Number(session.getCellOutputAt(0, 0).heat)).toBeLessThan(heatBefore);
      expect(Number(session.getCellOutputAt(0, 0).heat)).toBeCloseTo(heatBefore * 0.98, 1);
    });
  });

  describe("layout and risk", () => {
    it("manual_override sets manualOverrideMult", () => {
      expect(purchaseSessionUpgrade(session, "manual_override")).toBe(true);
      expect(session.modifiers.manualOverrideMult).toBeGreaterThan(0);
    });

    it("convective_airflow boosts venting with empty neighbors", () => {
      expect(session.placeComponent(1, 1, "vent1")).toBe(true);
      setSessionTileHeat(session, 1, 1, 40);
      expect(purchaseSessionUpgrade(session, "convective_airflow")).toBe(true);
      expect(session.modifiers.convectiveBoost).toBeGreaterThan(0);

      const heatBefore = tileHeatAt(session, 1, 1);
      session.tick();
      expect(heatBefore - tileHeatAt(session, 1, 1)).toBeCloseTo(5.6, 1);
    });

    it("convective_airflow vents less when neighbors are occupied", () => {
      expect(session.placeComponent(1, 1, "vent1")).toBe(true);
      expect(session.placeComponent(0, 1, "uranium1")).toBe(true);
      expect(session.placeComponent(2, 1, "uranium1")).toBe(true);
      setSessionTileHeat(session, 1, 1, 40);
      expect(purchaseSessionUpgrade(session, "convective_airflow")).toBe(true);

      const heatBefore = tileHeatAt(session, 1, 1);
      session.tick();
      const vented = heatBefore - tileHeatAt(session, 1, 1);
      expect(vented).toBeGreaterThan(0);
      expect(vented).toBeLessThan(5.5);
    });

    it("electro_thermal_conversion burns power to cut critical hull heat", () => {
      session.toggles.heat_control = false;
      session.grid.maxHeat = 10000;
      session.grid.maxPower = 20000;
      setSessionReactorHeat(session, 9000);
      session.grid.currentPower = 5;
      expect(purchaseSessionUpgrade(session, "electro_thermal_conversion")).toBe(true);
      expect(session.modifiers.powerToHeatRatio).toBeGreaterThan(0);

      const heatBefore = reactorHeat(session);
      session.tick();
      expect(power(session)).toBe(0);
      expect(reactorHeat(session)).toBeCloseTo(heatBefore - 10, 1);
    });

    it("sub_atomic_catalysts reduces particle accelerator epHeat", () => {
      const before = Number(session.getPart("particle_accelerator1").epHeat);
      expect(purchaseSessionUpgrade(session, "sub_atomic_catalysts")).toBe(true);
      expect(session.modifiers.catalystReduction).toBeGreaterThan(0);
      expect(Number(session.getPart("particle_accelerator1").epHeat)).toBeLessThan(before);
    });
  });

  describe("synergy and materials", () => {
    it("restores stirling and convective modifiers via setUpgradeLevels", async () => {
      expect(purchaseSessionUpgrade(session, "stirling_generators")).toBe(true);
      expect(purchaseSessionUpgrade(session, "convective_airflow")).toBe(true);
      const stirling = session.modifiers.stirlingMultiplier;
      const convective = session.modifiers.convectiveBoost;
      expect(stirling).toBeGreaterThan(0);

      const levels = [
        { id: "stirling_generators", level: 1 },
        { id: "convective_airflow", level: 1 },
      ];
      const loaded = await setupSessionOnly();
      loaded.setUpgradeLevels(levels);
      expect(loaded.modifiers.stirlingMultiplier).toBeCloseTo(stirling, 5);
      expect(loaded.modifiers.convectiveBoost).toBeCloseTo(convective, 5);
    });

    it("thermal_feedback sets thermalFeedbackRate", () => {
      expect(purchaseSessionUpgrade(session, "thermal_feedback")).toBe(true);
      expect(session.modifiers.thermalFeedbackRate).toBeGreaterThan(0);
    });

    it("volatile_tuning sets volatileTuningMax", () => {
      expect(purchaseSessionUpgrade(session, "volatile_tuning")).toBe(true);
      expect(session.modifiers.volatileTuningMax).toBeGreaterThan(0);
    });

    it("ceramic_composite boosts plating reactorHeat", () => {
      const before = Number(session.getPart("reactor_plating1").reactorHeat);
      expect(purchaseSessionUpgrade(session, "ceramic_composite")).toBe(true);
      expect(Number(session.getPart("reactor_plating1").reactorHeat)).toBeCloseTo(
        before * 1.05,
        5
      );
    });

    it("accelerator tick does not bank EP without session power and heat weave", () => {
      setSessionEconomy(session, {
        currentExoticParticles: "0",
        totalExoticParticles: "0",
        sessionPowerProduced: "0",
        sessionHeatDissipated: "0",
      });
      expect(session.placeComponent(0, 0, "particle_accelerator1")).toBe(true);
      setSessionTileHeat(session, 0, 0, 1e9);
      session.tick();
      expect(sessionEp(session).current).toBe(0);
    });

    it("stirling scales with improved_heat_vents vent rate", () => {
      expect(purchaseSessionUpgrade(session, "stirling_generators")).toBe(true);
      expect(purchaseSessionUpgrade(session, "improved_heat_vents")).toBe(true);
      expect(session.placeComponent(0, 0, "vent1")).toBe(true);
      setSessionTileHeat(session, 0, 0, 40);
      const powerBefore = power(session);
      session.tick();
      expect(power(session)).toBeGreaterThan(powerBefore);
    });
  });
});
