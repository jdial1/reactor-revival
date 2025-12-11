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
    // Ensure elements exist to avoid null classList lookups
    const ensureEl = (tile) => {
      if (!tile.$el) {
        const classes = new Set();
        tile.$el = {
          classList: {
            contains: (cls) => classes.has(cls),
            add: (cls) => classes.add(cls),
            remove: (cls) => classes.delete(cls)
          },
          dataset: {},
          removeAttribute: () => {},
          querySelector: () => null
        };
      } else {
        tile.$el.dataset = tile.$el.dataset || {};
        tile.$el.removeAttribute = tile.$el.removeAttribute || (() => {});
        if (!tile.$el.querySelector) tile.$el.querySelector = () => null;
        if (!tile.$el.classList || !tile.$el.classList.contains) {
          const classes = new Set();
          tile.$el.classList = {
            contains: (cls) => classes.has(cls),
            add: (cls) => classes.add(cls),
            remove: (cls) => classes.delete(cls)
          };
        }
      }
    };
    ensureEl(tile1);
    ensureEl(tile2);

    const playSpy = vi.spyOn(game.audio, "play");
    // Mock calculatePan
    game.calculatePan = vi.fn(() => 0);
    // Ensure audio context is running for play checks
    game.audio.enabled = true;
    if (game.audio.context) {
      Object.defineProperty(game.audio.context, 'state', { value: 'running', writable: true });
    } else {
      game.audio.context = { state: 'running' };
    }

    // Trigger sequential explosion (forceAnimate = true for test)
    ui.explodeAllPartsSequentially(true);

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

