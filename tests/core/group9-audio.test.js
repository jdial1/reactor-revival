import { describe, it, expect, beforeEach, afterEach, vi, setupGame } from "../helpers/setup.js";
import { AUDIO_RUNTIME_DEFAULTS } from "../../public/src/services.js";

describe("Group 9: Audio Engine & Spatial Panning", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  afterEach(() => {
    game?.audio?.warningManager?.stopWarningLoop();
    vi.restoreAllMocks();
  });

  it("locks explosion audio throttling to configured minimum interval", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(10_000);

    game.audio._lastExplosionTime = 0;
    game.audio.play("explosion");
    const firstExplosionTime = game.audio._lastExplosionTime;
    expect(firstExplosionTime).toBe(10_000);

    nowSpy.mockReturnValue(10_000 + AUDIO_RUNTIME_DEFAULTS.explosionIntervalMs - 1);
    game.audio.play("explosion");
    expect(game.audio._lastExplosionTime).toBe(firstExplosionTime);

    nowSpy.mockReturnValue(10_000 + AUDIO_RUNTIME_DEFAULTS.explosionIntervalMs);
    game.audio.play("explosion");
    expect(game.audio._lastExplosionTime).toBe(10_000 + AUDIO_RUNTIME_DEFAULTS.explosionIntervalMs);
  });

  it("locks stereo panning output between -1 and 1", () => {
    game.cols = 12;
    expect(game.calculatePan(0)).toBeGreaterThanOrEqual(-1);
    expect(game.calculatePan(0)).toBeLessThanOrEqual(1);
    expect(game.calculatePan(game.cols - 1)).toBeGreaterThanOrEqual(-1);
    expect(game.calculatePan(game.cols - 1)).toBeLessThanOrEqual(1);
    expect(game.calculatePan(0)).toBeCloseTo(-1);
    expect(game.calculatePan(game.cols - 1)).toBeCloseTo(1);
  });

  it("locks warning/geiger scheduling to scale with heat intensity", () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");

    game.audio.warningManager.startWarningLoop(0.1);
    const lowMs = timeoutSpy.mock.calls[timeoutSpy.mock.calls.length - 1][1];
    game.audio.warningManager.stopWarningLoop();

    timeoutSpy.mockClear();
    game.audio.warningManager.startWarningLoop(0.9);
    const highMs = timeoutSpy.mock.calls[timeoutSpy.mock.calls.length - 1][1];

    expect(highMs).toBeLessThan(lowMs);
    expect(game.audio.warningManager.getWarningIntensity()).toBe(0.9);
  });

  it("schedules geiger tick timeline deterministically from currentTime", () => {
    const manager = game.audio.warningManager;
    const tickSpy = vi.spyOn(manager, "_playGeigerTickAt").mockImplementation(() => {});
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    game.audio.context.currentTime = 10;
    manager._geigerActive = true;
    manager._geigerNextTime = 0;

    manager._scheduleGeigerBatch(0.8);

    expect(tickSpy).toHaveBeenCalledTimes(25);
    expect(tickSpy.mock.calls[0][1]).toBeCloseTo(10, 5);
    const baseIntervalS = (200 + (1 - 0.8) * 300) / 1000;
    expect(tickSpy.mock.calls[1][1]).toBeCloseTo(10 + baseIntervalS, 5);
    expect(manager._geigerNextTime).toBeCloseTo(10 + baseIntervalS * 25, 5);
    expect(timeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 5200);
    randomSpy.mockRestore();
  });

  it("queues warning batches using next schedule time and look-ahead cadence", () => {
    const manager = game.audio.warningManager;
    const warningSpy = vi.spyOn(manager, "_playWarningSoundAt").mockImplementation(() => {});
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    manager._warningLoopActive = true;
    game.audio.context.currentTime = 30;
    manager._warningNextScheduleTime = 0;

    manager._scheduleWarningBatch();

    expect(warningSpy).toHaveBeenCalledTimes(4);
    expect(warningSpy.mock.calls[0][1]).toBeCloseTo(30, 5);
    expect(warningSpy.mock.calls[1][1]).toBeCloseTo(35, 5);
    expect(warningSpy.mock.calls[3][1]).toBeCloseTo(45, 5);
    expect(manager._warningNextScheduleTime).toBeCloseTo(50, 5);
    expect(timeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 15000);
  });
});
