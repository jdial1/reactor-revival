import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe("Core Game Mechanics", () => {
  let game;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    if (game.engine) {
      game.engine.running = false;
      game.engine.animationFrameId = null;
    }
    game.paused = true;
    if (game.ui && game.ui.stateManager) {
      game.ui.stateManager.setVar("pause", true);
      game.ui.stateManager.setVar("engine_status", "stopped");
    }
  });

  afterEach(() => {
    cleanupGame();
  });

  it("should initialize with default values", () => {
    expect(game.current_money).toBe(game.base_money);
    expect(game.exotic_particles).toBe(0);
    expect(game.tileset.tiles.length).toBe(game.max_rows);
  });

  it("should process game loop ticks updates money on sell", () => {
    const initialMoney = game.current_money;
    
    const tile = game.tileset.getTile(0, 0);
    const part = game.partset.getPartById("uranium1");
    tile.setPart(part);
    tile.activated = true;
    
    // Simulate power generation and sell
    game.reactor.current_power = 10;
    game.sell_action();
    
    expect(game.current_money).toBeGreaterThan(initialMoney);
  });

  it("should handle reboot logic correctly", async () => {
    game.current_money = 100000;
    game.exotic_particles = 50;
    game.total_exotic_particles = 100;
    
    const tile = game.tileset.getTile(0, 0);
    tile.setPart(game.partset.getPartById("uranium1"));
    
    // Reboot keeping EP (Prestige)
    await game.reboot_action(true);
    
    expect(game.current_money).toBe(game.base_money);
    expect(game.exotic_particles).toBe(0); // Resets spendable EP
    expect(game.total_exotic_particles).toBe(100); 
    expect(tile.part).toBeNull();
  });
});
