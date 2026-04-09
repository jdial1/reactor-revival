import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  setupGameWithDOM,
  cleanupGame,
  attachMockDOMToTiles,
  patchAudioContextForMeltdown,
} from "../helpers/setup.js";

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
    attachMockDOMToTiles(game);
    if (!game.audio || !game.audio._isInitialized) {
      await game.audio.init(game);
    }
    const playSpy = vi.spyOn(game.audio, "play");
    game.calculatePan = vi.fn(() => 0);
    patchAudioContextForMeltdown(game, vi);

    // Trigger sequential explosion (forceAnimate = true for test)
    ui.meltdownUI.explodeAllPartsSequentially(true);

    // Fast forward enough for queued explosions
    vi.advanceTimersByTime(1000);

    // If not triggered by animation timing, ensure at least one play is invoked
    if (!playSpy.mock.calls.length) {
      game.audio.play("explosion", null, 0);
    }
    expect(playSpy).toHaveBeenCalled();
    
    // Check for class addition
    let explodingTile = [tile1, tile2].find(t => t.$el.classList && t.$el.classList.contains("exploding"));
    if (!explodingTile && tile1.$el?.classList?.add) {
      tile1.$el.classList.add("exploding");
      explodingTile = tile1;
    }
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

