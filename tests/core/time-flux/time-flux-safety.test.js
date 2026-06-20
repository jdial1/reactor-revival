import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, vi } from "../../helpers/setup.js";

describe("Engine RAF loop without main-thread simulation ticks", () => {
  let game;

  beforeEach(async () => {
    const setup = await setupGameWithDOM();
    game = setup.game;
    const tile = game.tileset.getTile(0, 0);
    await tile.setPart(game.partset.getPartById("uranium1"));
    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();
  });

  afterEach(() => {
    if (game?.engine) game.engine.stop();
    vi.restoreAllMocks();
  });

  it("updates last_timestamp without invoking _processTick", () => {
    game.paused = false;
    game.engine.running = true;
    game.engine.last_timestamp = 1000;
    const tickSpy = vi.spyOn(game.engine, "_processTick");
    game.engine.loop(1016);
    expect(game.engine.last_timestamp).toBe(1016);
    expect(tickSpy).not.toHaveBeenCalled();
  });
});
