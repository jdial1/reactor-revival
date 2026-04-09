import { describe, it, expect, beforeEach, afterEach, vi, setupGame, toNum } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import {
  processOfflineTime,
  runFluxTicksWithProjection,
} from "@app/logic.js";
import {
  HEAT_SAFETY_STOP_THRESHOLD,
  MAX_ACCUMULATOR_MULTIPLIER,
  MAX_TICKS_PER_FRAME_NO_SAB,
  OFFLINE_TIME_THRESHOLD_MS,
  SAMPLE_TICKS,
  TIME_FLUX_CHUNK_TICKS,
  VALVE_OVERFLOW_THRESHOLD,
} from "@app/utils.js";

describe("Group 5: Time Flux & Offline Simulation", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
    game.loop_wait = 1000;
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

  it("locks offline time accumulation into time_accumulator", () => {
    const t0 = 100000;
    const deltaMs = OFFLINE_TIME_THRESHOLD_MS + 500;
    const expectedMs = 1200 + deltaMs;
    game.time_flux = true;
    game.ui.stateManager.setVar("time_flux", true);
    game.engine.time_accumulator = 1200;
    game.engine.running = true;
    game.engine.last_timestamp = t0;

    const ts = t0 + deltaMs;
    game.engine.loop(ts);

    expect(game.engine.time_accumulator).toBe(expectedMs);
    expect(game.engine.last_timestamp).toBe(ts);
    const queuedTicks = Math.floor(expectedMs / game.loop_wait);
    expect(queuedTicks).toBe(31);
    expect(game.engine._timeFluxCatchupTotalTicks).toBe(queuedTicks);
    expect(game.engine._timeFluxCatchupRemainingTicks).toBe(queuedTicks);
  });

  it("locks offline lag spike clamp to accumulator safety cap", () => {
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * game.loop_wait;
    const t0 = 100000;
    const t1 = 900000;
    game.engine.time_accumulator = 20000;
    game.engine.running = true;
    game.engine.last_timestamp = t0;

    game.engine.loop(t1);

    expect(game.engine.time_accumulator).toBe(capMs);
    expect(game.engine.last_timestamp).toBe(t1);
  });

  it("locks processOfflineTime no-op at exact OFFLINE_TIME_THRESHOLD_MS", () => {
    game.engine.time_accumulator = 4000;
    const r = processOfflineTime(game.engine, OFFLINE_TIME_THRESHOLD_MS);
    expect(r).toBe(false);
    expect(game.engine.time_accumulator).toBe(4000);
  });

  it("locks processOfflineTime adds full delta when just above threshold", () => {
    game.engine.time_accumulator = 1200;
    const delta = OFFLINE_TIME_THRESHOLD_MS + 1;
    const r = processOfflineTime(game.engine, delta);
    expect(r).toBe(true);
    expect(game.engine.time_accumulator).toBe(1200 + delta);
  });

  it("locks processOfflineTime clamps to max accumulator", () => {
    game.engine.time_accumulator = 50000;
    const capMs = MAX_ACCUMULATOR_MULTIPLIER * game.loop_wait;
    const r = processOfflineTime(game.engine, 2_000_000);
    expect(r).toBe(true);
    expect(game.engine.time_accumulator).toBe(capMs);
  });

  it("locks no offline accumulation at exact threshold (30000ms)", () => {
    game.tileset.clearAllTiles();
    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();
    game.engine.time_accumulator = 5000;
    game.engine.running = true;
    game.engine.last_timestamp = 1000;
    const tickSpy = vi.spyOn(game.engine, "_processTick");

    game.engine.loop(31000);

    expect(tickSpy).not.toHaveBeenCalled();
    expect(game.engine.time_accumulator).toBe(5000);
    expect(game.engine.last_timestamp).toBe(31000);
  });

  it("locks analytical catch-up at 5001 queued ticks (strictly above threshold)", () => {
    game.time_flux = true;
    game.ui.stateManager.setVar("time_flux", true);
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const bankedMs = 5001 * game.loop_wait;
    expect(Math.floor(bankedMs / game.loop_wait)).toBe(5001);
    game.engine.time_accumulator = bankedMs;
    const tickSpy = vi.spyOn(game.engine, "_processTick");

    game.engine.runInstantCatchup();

    expect(tickSpy).toHaveBeenCalledTimes(SAMPLE_TICKS);
    for (let i = 0; i < SAMPLE_TICKS; i++) {
      expect(tickSpy).toHaveBeenNthCalledWith(i + 1, 1.0);
    }
    expect(game.engine.time_accumulator).toBe(0);
    expect(game.paused).toBe(false);
    expect(game.time_flux).toBe(true);
  });

  it("locks instant catch-up boundary at 5000 queued ticks (non-analytical path)", () => {
    game.time_flux = true;
    game.ui.stateManager.setVar("time_flux", true);
    game.reactor.current_heat = 50;
    game.reactor.max_heat = 1000;
    const bankedMs = 5000 * game.loop_wait;
    const queuedTicks = Math.floor(bankedMs / game.loop_wait);
    expect(queuedTicks).toBe(5000);
    game.engine.time_accumulator = bankedMs;
    const tickSpy = vi.spyOn(game.engine, "_processTick");

    game.engine.runInstantCatchup();

    const chunks = Math.ceil(queuedTicks / TIME_FLUX_CHUNK_TICKS);
    expect(chunks).toBe(50);
    const expectedSamples = chunks * SAMPLE_TICKS;
    expect(tickSpy.mock.calls.length).toBe(expectedSamples);
    for (let i = 0; i < expectedSamples; i++) {
      expect(tickSpy).toHaveBeenNthCalledWith(i + 1, 1.0);
    }
    expect(game.engine.time_accumulator).toBe(0);
    expect(game.paused).toBe(false);
    expect(game.time_flux).toBe(true);
  });

  it("locks rapid-loop fallback when flux chunk starts unstable", () => {
    game.reactor.max_heat = 1000;
    game.reactor.current_heat = game.reactor.max_heat.mul(VALVE_OVERFLOW_THRESHOLD);
    expect(
      game.reactor.current_heat.div(game.reactor.max_heat).toNumber()
    ).toBe(VALVE_OVERFLOW_THRESHOLD);

    const tickSpy = vi.spyOn(game.engine, "_processTick");

    runFluxTicksWithProjection(game.engine, TIME_FLUX_CHUNK_TICKS);

    expect(tickSpy).toHaveBeenCalledTimes(TIME_FLUX_CHUNK_TICKS);
    for (let i = 0; i < TIME_FLUX_CHUNK_TICKS; i++) {
      expect(tickSpy).toHaveBeenNthCalledWith(i + 1, 1.0);
    }
    expect(game.reactor.has_melted_down).toBe(false);
    expect(game.paused).toBe(false);
  });

  it("locks safety pause at heat ratio when banked time flux would catch up", () => {
    game.time_flux = true;
    game.ui.stateManager.setVar("time_flux", true);
    game.paused = false;
    game.reactor.max_heat = 1000;
    game.reactor.current_heat = game.reactor.max_heat.mul(HEAT_SAFETY_STOP_THRESHOLD);
    expect(
      game.reactor.current_heat.div(game.reactor.max_heat).toNumber()
    ).toBe(HEAT_SAFETY_STOP_THRESHOLD);
    const bankedMs = 10 * game.loop_wait;
    game.engine.time_accumulator = bankedMs;
    const t0 = 1000;
    game.engine.running = true;
    game.engine.last_timestamp = t0;

    const tickSpy = vi.spyOn(game.engine, "_processTick");

    const t1 = 1016;
    game.engine.loop(t1);

    expect(game.engine.last_timestamp).toBe(t1);
    expect(game.ui.stateManager.getVar("time_flux")).toBe(false);
    expect(game.time_flux).toBe(false);
    expect(game.paused).toBe(true);
    expect(tickSpy).not.toHaveBeenCalled();
    expect(game.engine.time_accumulator).toBe(bankedMs);
  });

  it("locks no safety pause below heat safety threshold", () => {
    game.time_flux = true;
    game.ui.stateManager.setVar("time_flux", true);
    game.paused = false;
    game.reactor.max_heat = 1000;
    game.reactor.current_heat = game.reactor.max_heat.mul(HEAT_SAFETY_STOP_THRESHOLD).sub(1);
    expect(toNum(game.reactor.current_heat.div(game.reactor.max_heat))).toBe(899 / 1000);
    const bankedMs = 10 * game.loop_wait;
    game.engine.time_accumulator = bankedMs;
    const t0 = 1000;
    game.engine.running = true;
    game.engine.last_timestamp = t0;

    const tickSpy = vi.spyOn(game.engine, "_processTick");

    const t1 = 1016;
    game.engine.loop(t1);

    expect(game.engine.last_timestamp).toBe(t1);
    expect(game.ui.stateManager.getVar("time_flux")).toBe(true);
    expect(game.time_flux).toBe(true);
    expect(game.paused).toBe(false);
    const requestedFluxTicks = Math.floor(bankedMs / game.loop_wait);
    const excessTicks = requestedFluxTicks - MAX_TICKS_PER_FRAME_NO_SAB;
    expect(excessTicks).toBe(8);
    expect(tickSpy).toHaveBeenCalledTimes(MAX_TICKS_PER_FRAME_NO_SAB);
    for (let i = 0; i < MAX_TICKS_PER_FRAME_NO_SAB; i++) {
      expect(tickSpy).toHaveBeenNthCalledWith(i + 1, 1.0);
    }
    expect(game.engine.time_accumulator).toBe(excessTicks * game.loop_wait);
    expect(game.reactor.has_melted_down).toBe(false);
  });
});
