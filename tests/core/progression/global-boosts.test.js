import { describe, it, expect, beforeEach } from "vitest";
import {
  setupSessionOnly,
  hasMeltedDown,
  sessionEp,
} from "../../helpers/sessionHelpers.js";

const GLOBAL_BOOST_IDS = [
  "full_spectrum_reflectors",
  "fluid_hyperdynamics",
  "fractal_piping",
  "ultracryonics",
];

describe("Global Boost Research Upgrades (session)", () => {
  let session;

  beforeEach(async () => {
    session = await setupSessionOnly({ money: 1e30 });
    session.setUpgradeLevels([{ id: "laboratory", level: 1 }]);
  });

  describe("Individual Upgrade Tests (Level 5)", () => {
    it("full_spectrum_reflectors boosts reflector powerIncrease", () => {
      const initial = Number(session.getPart("reflector1").powerIncrease);
      session.setUpgradeLevels([
        { id: "laboratory", level: 1 },
        { id: "full_spectrum_reflectors", level: 5 },
      ]);
      expect(Number(session.getPart("reflector1").powerIncrease)).toBe(initial * (1 + 5));
    });

    it("fluid_hyperdynamics boosts vent/exchanger transfer rates", () => {
      const vent = Number(session.getPart("vent1").vent);
      const exchanger = Number(session.getPart("heat_exchanger1").transfer);
      const inlet = Number(session.getPart("heat_inlet1").transfer);
      const outlet = Number(session.getPart("heat_outlet1").transfer);
      session.setUpgradeLevels([
        { id: "laboratory", level: 1 },
        { id: "fluid_hyperdynamics", level: 5 },
      ]);
      const mult = 2 ** 5;
      expect(Number(session.getPart("vent1").vent)).toBe(vent * mult);
      expect(Number(session.getPart("heat_exchanger1").transfer)).toBe(exchanger * mult);
      expect(Number(session.getPart("heat_inlet1").transfer)).toBe(inlet * mult);
      expect(Number(session.getPart("heat_outlet1").transfer)).toBe(outlet * mult);
    });

    it("fractal_piping boosts vent/exchanger containment", () => {
      const vent = Number(session.getPart("vent1").containment);
      const exchanger = Number(session.getPart("heat_exchanger1").containment);
      session.setUpgradeLevels([
        { id: "laboratory", level: 1 },
        { id: "fractal_piping", level: 5 },
      ]);
      const mult = 2 ** 5;
      expect(Number(session.getPart("vent1").containment)).toBe(vent * mult);
      expect(Number(session.getPart("heat_exchanger1").containment)).toBe(exchanger * mult);
    });

    it("ultracryonics boosts coolant containment", () => {
      const initial = Number(session.getPart("coolant_cell1").containment);
      session.setUpgradeLevels([
        { id: "laboratory", level: 1 },
        { id: "ultracryonics", level: 5 },
      ]);
      expect(Number(session.getPart("coolant_cell1").containment)).toBe(initial * 2 ** 5);
    });
  });

  describe("Max Level Sanity Check (Level 10)", () => {
    it("stays stable with all global boosts at level 10", () => {
      session.setUpgradeLevels([
        { id: "laboratory", level: 1 },
        ...GLOBAL_BOOST_IDS.map((id) => ({ id, level: 10 })),
      ]);
      session.placeComponent(5, 5, "uranium1");
      session.placeComponent(5, 6, "vent1");
      for (let i = 0; i < 10; i++) session.tick();

      const snap = session.getSnapshot();
      const money = sessionEp(session).money;
      const power = Number(session.grid.currentPower ?? 0);
      const heat = Number(session.grid.currentHeat ?? 0);
      const cell = session.getCellOutputAt(5, 5);

      expect(Number.isFinite(money)).toBe(true);
      expect(money).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(power)).toBe(true);
      expect(power).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(heat)).toBe(true);
      expect(heat).toBeGreaterThanOrEqual(0);
      expect(hasMeltedDown(session)).toBe(false);
      expect(Number(cell?.power ?? 0)).toBeGreaterThanOrEqual(1);
      expect(Number(cell?.heat ?? 0)).toBeGreaterThanOrEqual(1);
      expect(snap.grid).toBeTruthy();
    });
  });
});
