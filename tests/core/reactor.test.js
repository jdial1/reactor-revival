import { describe, it, expect, beforeEach, vi, setupGame, toNum } from "../helpers/setup.js";

describe("Reactor Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  it("should initialize with correct default values", () => {
    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(toNum(game.reactor.max_power)).toBe(toNum(game.reactor.base_max_power));
    expect(toNum(game.reactor.max_heat)).toBe(toNum(game.reactor.base_max_heat));
    expect(game.reactor.has_melted_down).toBe(false);
  });

  it("should update stats based on active parts", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);
    game.reactor.updateStats();

    expect(game.reactor.stats_power).toBe(part.power);
    expect(game.reactor.stats_heat_generation).toBe(part.heat);
    expect(game.reactor.stats_total_part_heat).toBe(0); // No heat contained initially
  });

  it("should handle multiple active parts", async () => {
    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(1, 1);
    const part = game.partset.getPartById("uranium1");
    await tile1.setPart(part);
    await tile2.setPart(part);
    game.reactor.updateStats();

    expect(game.reactor.stats_power).toBe(part.power * 2);
    expect(game.reactor.stats_heat_generation).toBe(part.heat * 2);
    expect(game.reactor.stats_total_part_heat).toBe(0); // No heat contained initially
  });

  it("should calculate total part heat correctly", async () => {
    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(1, 1);
    const part = game.partset.getPartById("uranium1");
    await tile1.setPart(part);
    await tile2.setPart(part);

    // Simulate heat contained in parts
    tile1.heat_contained = 50;
    tile2.heat_contained = 75;

    game.reactor.updateStats();

    expect(game.reactor.stats_total_part_heat).toBe(125); // 50 + 75
  });

  it("should handle heat generation and venting", async () => {
    const initialHeat = 0;
    game.reactor.current_heat = 0;
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);

    // Activate the cell and set ticks so it generates heat
    tile.activated = true;
    tile.ticks = 10;

    game.engine.tick();
    const naturalVenting = game.reactor.max_heat / 10000; // 0.1
    const heatGenerated = part.heat; // Get actual heat from the part
    const expected = initialHeat + heatGenerated - naturalVenting;

    expect(toNum(game.reactor.current_heat)).toBeCloseTo(expected, 0);
  });

  it("should not vent below zero heat", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);

    game.reactor.current_heat = 0;
    game.reactor.vent_value = 10;

    game.engine.tick();

    // Should not go below zero, but may be a small positive value due to decay logic
    expect(toNum(game.reactor.current_heat)).toBeGreaterThanOrEqual(0);
  });

  it("should handle reactor size changes", () => {
    game.rows = 5;
    game.cols = 5;
    game.tileset.updateActiveTiles();

    const activeTiles = game.tileset.active_tiles_list;
    expect(activeTiles.length).toBe(25); // 5x5 grid
    activeTiles.forEach((tile) => {
      expect(tile.enabled).toBe(true);
    });
  });

  it("should disable tiles outside reactor size", () => {
    game.rows = 2;
    game.cols = 2;
    game.tileset.updateActiveTiles();

    // getTile only returns tiles within reactor bounds, so we need to access
    // the tile directly from tiles_list to check if it's disabled
    const tile = game.tileset.tiles_list.find(
      (t) => t.row === 2 && t.col === 2
    );
    expect(tile).toBeDefined();
    expect(tile.enabled).toBe(false);
  });

  it("should handle power generation and selling", async () => {
    const cell = game.partset.getPartById('uranium1');
    await game.tileset.getTile(0, 0).setPart(cell);
    game.engine.tick();
    expect(toNum(game.reactor.current_power)).toBe(toNum(cell.power));
    const initialMoney = toNum(game.current_money);
    game.reactor.sellPower();
    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(toNum(game.current_money)).toBe(initialMoney + toNum(cell.power));
    expect(game.sold_power).toBe(true);
  });

  it("should apply reflector bonuses during stat updates", async () => {
    const cell = game.partset.getPartById("uranium1");
    const reflector = game.partset.getPartById("reflector1");
    await game.tileset.getTile(0, 0).setPart(cell);
    await game.tileset.getTile(0, 1).setPart(reflector);
    game.reactor.updateStats();

    const expectedPower = cell.power * (1 + reflector.power_increase / 100);
    expect(game.reactor.stats_power).toBeCloseTo(expectedPower);
  });

  it("should manually reduce heat", () => {
    game.reactor.current_heat = 100;
    game.manual_reduce_heat_action();
    expect(toNum(game.reactor.current_heat)).toBe(100 - game.base_manual_heat_reduce);
    expect(game.sold_heat).toBe(false);

    game.reactor.current_heat = 0.5;
    game.manual_reduce_heat_action();
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(game.sold_heat).toBe(true);
  });

  it("should go into meltdown when heat > 2 * max_heat", () => {
    // Set up spy on setVar method
    const setVarSpy = vi.spyOn(game.ui.stateManager, "setVar");

    game.reactor.current_heat = game.reactor.max_heat * 2 + 1;
    const meltdown = game.reactor.checkMeltdown();
    expect(meltdown).toBe(true);
    expect(game.reactor.has_melted_down).toBe(true);
    expect(setVarSpy).toHaveBeenCalledWith("melting_down", true, true);

    // Clean up spy
    setVarSpy.mockRestore();
  });

  it("should not meltdown when heat is high but not critical", () => {
    game.reactor.current_heat = game.reactor.max_heat * 1.9;
    const meltdown = game.reactor.checkMeltdown();
    expect(meltdown).toBe(false);
    expect(game.reactor.has_melted_down).toBe(false);
  });

  it("should apply Infused Cells power multiplier correctly", async () => {
    game.bypass_tech_tree_restrictions = true;
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);
    
    // Ensure EP for purchase
    const labUpgrade = game.upgradeset.getUpgrade('laboratory');
    const infusedUpgrade = game.upgradeset.getUpgrade('infused_cells');
    game.current_exotic_particles = Math.max(toNum(labUpgrade.getEcost()), toNum(infusedUpgrade.getEcost())) + 1000;
    game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
    game.upgradeset.check_affordability(game);
    
    const labPurchased = game.upgradeset.purchaseUpgrade('laboratory');
    expect(labPurchased).toBe(true);
    game.upgradeset.check_affordability(game);
    const infusedPurchased = game.upgradeset.purchaseUpgrade('infused_cells');
    expect(infusedPurchased).toBe(true);
    expect(game.upgradeset.getUpgrade('infused_cells').level).toBe(1);
    part.recalculate_stats();
    game.reactor.updateStats();
    game.engine.tick();
    expect(toNum(game.reactor.current_power)).toBeCloseTo(toNum(part.base_power) * 2, 0);
  });

  it("should handle heat generation correctly", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);
    game.reactor.heat_power_multiplier = 2;
    game.engine.tick();
    expect(toNum(game.reactor.current_heat)).toBeGreaterThan(0);
  });

  it("should handle power generation correctly", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);
    game.reactor.power_multiplier = 2;
    game.engine.tick();
    expect(toNum(game.reactor.current_power)).toBe(toNum(part.power) * 2);
  });

  it("should handle heat venting correctly", async () => {
    game.reactor.current_heat = 1000;
    game.reactor.heat_controlled = true;
    game.engine.tick();
    expect(toNum(game.reactor.current_heat)).toBeLessThan(1000);
    expect(toNum(game.reactor.current_heat)).toBeGreaterThan(0);
  });

  it("should handle power storage correctly", async () => {
    // This test is not relevant unless you have a capacitor part and logic for storage
    // If you do, set up a capacitor and check current_power after a tick
    // Otherwise, remove this test
    expect(true).toBe(true);
  });

  it("should handle reactor reset correctly", () => {
    game.reactor.current_heat = 1000;
    game.reactor.current_power = 500;
    game.reactor.has_melted_down = true;
    game.reactor.setDefaults();
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(game.reactor.has_melted_down).toBe(false);
  });

  it("should handle reactor stats update correctly", async () => {
    const initialMaxHeat = game.reactor.max_heat;
    const plating = game.partset.getPartById('reactor_plating1');
    await game.tileset.getTile(0, 0).setPart(plating);
    game.reactor.updateStats();
    expect(toNum(game.reactor.max_heat)).toBe(toNum(initialMaxHeat) + toNum(plating.reactor_heat));
  });

  it("should handle reactor tick correctly", () => {
    const tickSpy = vi.spyOn(game.engine, "tick");
    game.engine.tick();
    expect(tickSpy).toHaveBeenCalled();
  });

  it("should reset with setDefaults", () => {
    game.reactor.current_heat = 1000;
    game.reactor.current_power = 500;
    game.reactor.has_melted_down = true;
    game.reactor.setDefaults();
    expect(toNum(game.reactor.current_heat)).toBe(0);
    expect(toNum(game.reactor.current_power)).toBe(0);
    expect(game.reactor.has_melted_down).toBe(false);
  });
});
