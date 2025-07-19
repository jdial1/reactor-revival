import { describe, it, expect, beforeEach } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Upgrade Actions Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should apply chronometer upgrade correctly", () => {
    const initialWait = game.base_loop_wait;
    game.upgradeset.purchaseUpgrade("chronometer");
    expect(game.loop_wait).toBe(initialWait / 2);
  });

  it("should apply power lines upgrade correctly", () => {
    game.upgradeset.purchaseUpgrade("improved_power_lines");
    expect(game.reactor.auto_sell_multiplier).toBe(0.01);
  });

  it("should apply reactor rows upgrade correctly", () => {
    const initialRows = game.rows;
    game.upgradeset.purchaseUpgrade("expand_reactor_rows");
    expect(game.rows).toBe(initialRows + 1);
  });

  it("should apply forceful fusion upgrade correctly", () => {
    game.upgradeset.purchaseUpgrade("forceful_fusion");
    expect(game.reactor.heat_power_multiplier).toBe(1);
  });

  it("should apply improved alloys upgrade correctly", async () => {
    const plating = game.partset.getPartById("reactor_plating1");
    await game.tileset.getTile(0, 0).setPart(plating);
    game.reactor.updateStats();
    const initialHeat = game.reactor.max_heat;

    game.upgradeset.purchaseUpgrade("improved_alloys");
    game.reactor.updateStats();

    // (base + original part) * 2 for level 1 upgrade
    const expectedHeat =
      game.reactor.base_max_heat + plating.base_reactor_heat * 2;
    expect(game.reactor.max_heat).toBeCloseTo(expectedHeat);
  });

  it("should apply quantum buffering upgrade correctly", async () => {
    // Add reactor plating to test the quantum buffering effect
    const plating = game.partset.getPartById("reactor_plating1");
    await game.tileset.getTile(0, 0).setPart(plating);
    game.reactor.updateStats();
    const initialMaxHeat = game.reactor.max_heat;

    // Purchase laboratory first (required for EP upgrades)
    game.current_exotic_particles = 1;
    game.upgradeset.purchaseUpgrade("laboratory");

    // Now purchase quantum buffering
    game.current_exotic_particles = 50; // quantum_buffering costs 50 EP
    game.upgradeset.purchaseUpgrade("quantum_buffering");
    game.reactor.updateStats();

    // Quantum buffering doubles the reactor_heat contribution from plating
    // Expected: base_max_heat + (plating.base_reactor_heat * 2)
    const expectedMaxHeat =
      game.reactor.base_max_heat + plating.base_reactor_heat * 2;
    expect(game.reactor.max_heat).toBeCloseTo(expectedMaxHeat);
    expect(game.reactor.max_heat).toBeGreaterThan(initialMaxHeat);
  });

  it("should apply active venting upgrade correctly", async () => {
    await game.tileset
      .getTile(0, 0)
      .setPart(game.partset.getPartById("capacitor1"));
    const ventTile = game.tileset.getTile(0, 1);
    await ventTile.setPart(game.partset.getPartById("vent1"));
    game.reactor.updateStats();
    const initialVent = ventTile.getEffectiveVentValue();

    game.upgradeset.purchaseUpgrade("active_venting");
    game.reactor.updateStats();

    expect(ventTile.getEffectiveVentValue()).toBeGreaterThan(initialVent);
  });

  it("should apply improved heat vents upgrade correctly", async () => {
    const ventPart = game.partset.getPartById("vent1");
    const tile = game.tileset.getTile(0, 0);
    await tile.setPart(ventPart);
    const initialVentValue = tile.getEffectiveVentValue();

    game.upgradeset.purchaseUpgrade("improved_heat_vents");

    const expectedValue = initialVentValue * 2;
    expect(tile.getEffectiveVentValue()).toBe(expectedValue);
  });
});
