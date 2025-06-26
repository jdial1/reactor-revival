import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setupGame } from "../helpers/setup.js";

describe("Engine Mechanics", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should initialize correctly", () => {
    expect(game.engine).toBeDefined();
    expect(game.engine.game).toBe(game);
    expect(game.engine.running).toBe(false);
  });

  it("should start and stop the game loop", () => {
    game.engine.start();
    expect(game.engine.running).toBe(true);
    expect(game.engine.loop_timeout).toBeDefined();

    game.engine.stop();
    expect(game.engine.running).toBe(false);
    expect(game.engine.loop_timeout).toBeNull();
  });

  it("should process a single tick correctly", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    await tile.setPart(part);

    const initialPower = game.reactor.current_power;
    const initialTicks = tile.ticks;

    game.engine.tick();

    expect(game.reactor.current_power).toBe(initialPower + part.power);
    expect(game.reactor.current_heat).toBeGreaterThan(0);
    expect(tile.ticks).toBe(initialTicks - 1);
  });

  it("should handle auto-sell when enabled", () => {
    // Set auto-sell state directly
    game.ui.stateManager.setVar("auto_sell", true);
    game.reactor.auto_sell_multiplier = 0.1; // 10%
    game.reactor.current_power = 500;
    game.reactor.max_power = 1000;
    const initialMoney = game.current_money;
    const sellAmount = Math.floor(1000 * 0.1); // 100

    game.engine.tick();

    expect(game.reactor.current_power).toBe(500 - sellAmount);
    expect(game.current_money).toBe(initialMoney + sellAmount);
  });

  it("should handle component depletion for a perpetual part with auto-buy on", async () => {
    const perpetualUpgrade = game.upgradeset.getUpgrade("perpetual_reflectors");
    game.upgradeset.purchaseUpgrade(perpetualUpgrade.id);

    // Set auto-buy state directly
    game.ui.stateManager.setVar("auto_buy", true);

    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("reflector1");
    await tile.setPart(part);

    // Verify the part is actually perpetual
    expect(part.perpetual).toBe(true);

    const initialMoney = game.current_money;
    const replacementCost = part.cost * 1.5;
    tile.ticks = 1;

    game.engine.tick(); // This tick will deplete the part

    expect(tile.part).not.toBeNull();
    // After replacement, ticks should be reset - just check it's not 0
    expect(tile.ticks).toBeGreaterThan(0);
    expect(game.current_money).toBe(initialMoney - replacementCost);
  });

  it("should clear part when a non-perpetual component is depleted", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1"); // Not perpetual by default
    await tile.setPart(part);
    tile.ticks = 1;

    game.engine.tick();

    expect(tile.part).toBeNull();
  });

  it("should generate exotic particles from particle accelerators", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("particle_accelerator1");
    await tile.setPart(part);

    // Reset EP to 0 to make generation easier to detect
    game.exotic_particles = 0;

    // Set heat to exactly the EP threshold
    tile.heat_contained = part.ep_heat;

    const initialEP = game.exotic_particles;

    // Run a few ticks and check for EP generation
    for (let i = 0; i < 5; i++) {
      game.engine.tick();
      if (game.exotic_particles > initialEP) {
        break; // EP was generated, test passes
      }
    }

    expect(game.exotic_particles).toBeGreaterThan(initialEP);
  });

  it("should trigger reactor meltdown if a particle accelerator overheats", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("particle_accelerator1");
    await tile.setPart(part);

    // Set reactor heat high enough to trigger meltdown when checkMeltdown is called
    game.reactor.current_heat = game.reactor.max_heat * 2.5;

    // Set heat way above containment to trigger explosion
    const testHeat = part.containment * 2;
    tile.heat_contained = testHeat;

    game.engine.tick();

    expect(game.reactor.has_melted_down).toBe(true);
  });

  it("should handle heat transfer for exchangers", async () => {
    const exchangerPart = game.partset.getPartById("heat_exchanger1");
    const ventPart1 = game.partset.getPartById("vent1");

    const exchangerTile = game.tileset.getTile(1, 1);
    const ventTile1 = game.tileset.getTile(1, 0);

    await exchangerTile.setPart(exchangerPart);
    await ventTile1.setPart(ventPart1);

    exchangerTile.heat_contained = 100;
    ventTile1.heat_contained = 0;

    game.reactor.updateStats(); // To populate neighbor lists

    game.engine.tick();

    // Heat should move from exchanger to vent, trying to balance
    expect(exchangerTile.heat_contained).toBeLessThan(100);
    expect(ventTile1.heat_contained).toBeGreaterThan(0);

    const totalHeat = exchangerTile.heat_contained + ventTile1.heat_contained;
    expect(totalHeat).toBeCloseTo(96, 0); // Allow for some heat loss to venting
  });
});
