import { describe, it, expect, beforeEach, afterEach, vi, setupGame , syncActivePartsAtTickBoundary} from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import {
  processOfflineTime,
  startOfflineFastForward,
} from "@app/logic.js";
import {
  BASE_LOOP_WAIT_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  OFFLINE_TIME_THRESHOLD_MS,
} from "@app/utils.js";

describe("Group 5: Offline time and deterministic catch-up", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.loop_wait = BASE_LOOP_WAIT_MS;
    game.paused = false;
    await placePart(game, 0, 0, "uranium1");
    syncActivePartsAtTickBoundary(game.engine);

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
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * BASE_LOOP_WAIT_MS;
    expect(game._offlineCatchupMs).toBe(Math.min(delta, capMs));
  });

  it("locks processOfflineTime clamps to max accumulator", () => {
    game._offlineCatchupMs = 50000;
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * BASE_LOOP_WAIT_MS;
    const r = processOfflineTime(game.engine, 2_000_000);
    expect(r).toBe(true);
    expect(game._offlineCatchupMs).toBe(capMs);
  });

  it("queues worker fast-forward ticks from offline span", () => {
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const bankedMs = MAX_ACCUMULATOR_MULTIPLIER * BASE_LOOP_WAIT_MS;
    game._offlineCatchupMs = bankedMs;

    startOfflineFastForward(game.engine);

    expect(game._offlineCatchupMs).toBe(0);
    expect(game.engine._offlineFastForwardTicks).toBe(MAX_ACCUMULATOR_MULTIPLIER);
    expect(game.engine._isCatchingUp).toBe(true);
  });

  it("queues partial offline span for worker fast-forward", () => {
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const ticks = 47;
    game._offlineCatchupMs = ticks * BASE_LOOP_WAIT_MS;

    startOfflineFastForward(game.engine);

    expect(game._offlineCatchupMs).toBe(0);
    expect(game.engine._offlineFastForwardTicks).toBe(ticks);
    expect(game.engine._isCatchingUp).toBe(true);
  });
});
