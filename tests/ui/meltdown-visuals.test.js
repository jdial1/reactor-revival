import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

describe("Meltdown Visual Effects", () => {
  let game;
  let ui;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    ui = game.ui;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanupGame();
  });

  it("should trigger explosion sounds and visuals sequentially", async () => {
    const uranium = game.partset.getPartById("uranium1");
    const vent = game.partset.getPartById("vent1");
    
    // Setup a small grid with parts
    const tile1 = game.tileset.getTile(0, 0);
    const tile2 = game.tileset.getTile(0, 1);
    await tile1.setPart(uranium);
    await tile2.setPart(vent);

    const playSpy = vi.spyOn(game.audio, "play");
    // Mock calculatePan
    game.calculatePan = vi.fn(() => 0);

    // Trigger sequential explosion (forceAnimate = true for test)
    ui.explodeAllPartsSequentially(true);

    // Fast forward to first explosion (index 0 * 150ms)
    vi.advanceTimersByTime(150);

    expect(playSpy).toHaveBeenCalledWith("explosion", null, expect.any(Number));
    
    // Check for class addition
    const explodingTile = [tile1, tile2].find(t => t.$el.classList.contains("exploding"));
    expect(explodingTile).toBeDefined();

    // Fast forward past animation delay (600ms)
    vi.advanceTimersByTime(600);

    // Parts should be removed by now
    const partsRemaining = [tile1, tile2].filter(t => t.part !== null).length;
    expect(partsRemaining).toBeLessThan(2);

    // Finish all
    vi.advanceTimersByTime(2000);
    expect(tile1.part).toBeNull();
    expect(tile2.part).toBeNull();
  });
});

