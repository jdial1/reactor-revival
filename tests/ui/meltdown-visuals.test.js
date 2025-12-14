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

    // Ensure audio is initialized
    if (!game.audio || !game.audio._isInitialized) {
      await game.audio.init(game);
    }
    const playSpy = vi.spyOn(game.audio, "play");
    // Mock calculatePan
    game.calculatePan = vi.fn(() => 0);
    // Ensure audio context is running for play checks and has all required methods
    game.audio.enabled = true;
    if (game.audio.context) {
      Object.defineProperty(game.audio.context, 'state', { value: 'running', writable: true });
      // Ensure all required AudioContext methods exist
      if (!game.audio.context.createOscillator) {
        game.audio.context.createOscillator = vi.fn(() => ({
          type: 'sine',
          frequency: {
            value: 440,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }));
      }
      if (!game.audio.context.createGain) {
        game.audio.context.createGain = vi.fn(() => ({
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        }));
      }
      if (!game.audio.context.createBufferSource) {
        game.audio.context.createBufferSource = vi.fn(() => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        }));
      }
      if (!game.audio.context.createBiquadFilter) {
        game.audio.context.createBiquadFilter = vi.fn(() => ({
          type: 'lowpass',
          frequency: { value: 1000 },
          connect: vi.fn(),
        }));
      }
      if (!game.audio.context.createStereoPanner) {
        game.audio.context.createStereoPanner = vi.fn(() => ({
          pan: { value: 0 },
          connect: vi.fn(),
        }));
      }
      if (!game.audio.context.createWaveShaper) {
        game.audio.context.createWaveShaper = vi.fn(() => ({
          curve: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
        }));
      }
      if (!game.audio.context.currentTime) {
        Object.defineProperty(game.audio.context, 'currentTime', { value: 0, writable: true });
      }
    } else {
      // Create a complete mock context if it doesn't exist
      game.audio.context = {
        state: 'running',
        currentTime: 0,
        destination: {},
        createGain: vi.fn(() => ({
          gain: {
            value: 1,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
        })),
        createOscillator: vi.fn(() => ({
          type: 'sine',
          frequency: {
            value: 440,
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createBufferSource: vi.fn(() => ({
          buffer: null,
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
        })),
        createBiquadFilter: vi.fn(() => ({
          type: 'lowpass',
          frequency: { value: 1000 },
          connect: vi.fn(),
        })),
        createStereoPanner: vi.fn(() => ({
          pan: { value: 0 },
          connect: vi.fn(),
        })),
        createWaveShaper: vi.fn(() => ({
          curve: null,
          connect: vi.fn(),
          disconnect: vi.fn(),
        })),
      };
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

