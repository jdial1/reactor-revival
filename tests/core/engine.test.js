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
    game.ui.stateManager.getVar.mockImplementation(
      (key) => key === "auto_sell"
    );
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

    game.ui.stateManager.getVar.mockImplementation((key) => key === "auto_buy");

    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("reflector1");
    await tile.setPart(part);

    const initialMoney = game.current_money;
    const replacementCost = part.cost * 1.5;
    tile.ticks = 1;

    game.engine.tick(); // This tick will deplete the part

    expect(tile.part).not.toBeNull();
    expect(tile.ticks).toBe(part.base_ticks);
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
    tile.heat_contained = part.ep_heat / 2; // some heat

    const initialEP = game.exotic_particles;
    vi.spyOn(Math, "random").mockReturnValue(0); // Make test deterministic

    game.engine.tick();

    expect(game.exotic_particles).toBeGreaterThan(initialEP);

    Math.random.mockRestore();
  });

  it("should trigger reactor meltdown if a particle accelerator overheats", async () => {
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("particle_accelerator1");
    await tile.setPart(part);

    tile.heat_contained = part.containment + 1;

    const stopSpy = vi.spyOn(game.engine, "stop");

    game.engine.tick();

    expect(game.reactor.has_melted_down).toBe(true);
    expect(stopSpy).toHaveBeenCalled();
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
    expect(totalHeat).toBeCloseTo(100);
  });
});
