import { describe, it, expect, beforeEach, afterEach, vi, setupGame } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import {
  processOfflineTime,
  runInstantCatchup,
} from "@app/logic.js";
import {
  FOUNDATIONAL_TICK_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  OFFLINE_TIME_THRESHOLD_MS,
} from "@app/utils.js";

describe("Group 5: Offline time and deterministic catch-up", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.loop_wait = FOUNDATIONAL_TICK_MS;
    game.paused = false;
    game.engine.setForceNoSAB(true);
    game.engine._useGameLoopWorker = () => false;
    await placePart(game, 0, 0, "uranium1");
    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();
  });

  afterEach(() => {
    if (game?.engine) game.engine.stop();
    vi.restoreAllMocks();
  });

  it("locks processOfflineTime no-op at exact OFFLINE_TIME_THRESHOLD_MS", () => {
    game._offlineCatchupMs = 4000;
    const r = processOfflineTime(game.engine, OFFLINE_TIME_THRESHOLD_MS);
    expect(r).toBe(false);
    expect(game._offlineCatchupMs).toBe(4000);
  });

  it("locks processOfflineTime records clamped span when just above threshold", () => {
    game._offlineCatchupMs = 1200;
    const delta = OFFLINE_TIME_THRESHOLD_MS + 1;
    const r = processOfflineTime(game.engine, delta);
    expect(r).toBe(true);
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
    expect(game._offlineCatchupMs).toBe(Math.min(delta, capMs));
  });

  it("locks processOfflineTime clamps to max accumulator", () => {
    game._offlineCatchupMs = 50000;
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
    const r = processOfflineTime(game.engine, 2_000_000);
    expect(r).toBe(true);
    expect(game._offlineCatchupMs).toBe(capMs);
  });

  it("locks runInstantCatchup at offline span cap", () => {
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const bankedMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
    game._offlineCatchupMs = bankedMs;
    const tickSpy = vi.spyOn(game.engine, "_processTick");

    runInstantCatchup(game.engine);

    expect(tickSpy).not.toHaveBeenCalled();
    expect(game._offlineCatchupMs).toBe(0);
    expect(game.paused).toBe(false);
  });

  it("locks runInstantCatchup for partial queued offline span", () => {
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const ticks = 47;
    game._offlineCatchupMs = ticks * FOUNDATIONAL_TICK_MS;
    const tickSpy = vi.spyOn(game.engine, "_processTick");

    runInstantCatchup(game.engine);

    expect(tickSpy).not.toHaveBeenCalled();
    expect(game._offlineCatchupMs).toBe(0);
  });
});
