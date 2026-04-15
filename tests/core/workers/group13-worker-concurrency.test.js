import { describe, it, expect, beforeEach, afterEach, vi, setupGame, setupWorkerContext } from "../../helpers/setup.js";
import { placePart } from "../../helpers/gameHelpers.js";
import {
  WORKER_HEARTBEAT_MS,
  WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK,
} from "@app/utils.js";
import { PhysicsTickResultSchema } from "../../../public/src/schema/stateSchemas.js";

describe("Group 13: Web Worker Concurrency and Fallbacks", () => {
  let game;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "Worker",
      class MockWorker {
        constructor() {
          this.onmessage = null;
        }
        postMessage() {}
      }
    );
    game = await setupGame();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("disables physics worker after consecutive heartbeat timeouts and runs sync heat", async () => {
    const engine = game.engine;
    engine._heatUseSAB = true;
    engine._workerFailed = false;
    engine._worker = null;
    engine._heatWorkerConsecutiveTimeouts = 0;
    game.tileset.clearAllTiles();
    await placePart(game, 0, 0, "uranium1");
    game.reactor.updateStats();
    engine._updatePartCaches();
    const syncSpy = vi.spyOn(engine, "_runHeatStepSync");
    for (let i = 0; i < WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK; i++) {
      engine._processTick(1.0, false);
      expect(engine._workerPending).toBe(true);
      vi.advanceTimersByTime(WORKER_HEARTBEAT_MS);
    }
    expect(engine._workerFailed).toBe(true);
    expect(syncSpy.mock.calls.length).toBeGreaterThanOrEqual(WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK);
  });

  it("rejects malformed physics worker results via PhysicsTickResultSchema", () => {
    const bad = { tickId: 1, useSAB: true, reactorHeat: "not-a-number" };
    expect(PhysicsTickResultSchema.safeParse(bad).success).toBe(false);
  });

  it("setForceNoSAB disables game loop worker and SAB worker send path", () => {
    const engine = game.engine;
    engine._gameLoopWorkerFailed = false;
    engine._heatUseSABNative = true;
    engine.setForceNoSAB(false);
    expect(engine._heatUseSAB).toBe(true);
    expect(engine._useGameLoopWorker()).toBe(true);
    engine.setForceNoSAB(true);
    expect(engine._heatUseSAB).toBe(false);
    expect(engine._useGameLoopWorker()).toBe(false);
    const canSendWorker =
      engine._useWorker() && engine._heatUseSAB && !engine._workerPending;
    expect(canSendWorker).toBe(false);
  });

  it("physics.worker returns null payload when heatBuffer is missing", async () => {
    vi.resetModules();
    const ctx = setupWorkerContext(vi);
    await import("@app/worker/physics.worker.js");
    self.onmessage({ data: { tickId: 77 } });
    expect(ctx.postMessage).toHaveBeenCalledTimes(1);
    expect(ctx.postMessage.mock.calls[0][0]).toEqual({
      heatBuffer: null,
      reactorHeat: 0,
      heatFromInlets: 0,
      tickId: 77,
    });
    ctx.restore();
  });

  it("engine.worker routes tick messages to game loop and emits tickResult", async () => {
    vi.resetModules();
    const ctx = setupWorkerContext(vi);
    await import("@app/worker/engine.worker.js");
    const heat = new Float32Array(4);
    self.onmessage({
      data: {
        type: "tick",
        tickId: 7,
        tickCount: 1,
        heatBuffer: heat.buffer,
        partLayout: [],
        partTable: [],
        rows: 2,
        cols: 2,
        maxCols: 2,
        multiplier: 1,
        autoSell: false,
        reactorState: {
          current_heat: 0,
          current_power: 0,
          max_power: 100,
          max_heat: 1000,
        },
      },
    });
    expect(ctx.postMessage).toHaveBeenCalledTimes(1);
    const result = ctx.postMessage.mock.calls[0][0];
    expect(result.type).toBe("tickResult");
    expect(result.tickId).toBe(7);
    ctx.restore();
  });

  it("gameLoop.worker processes a tick message and emits tickResult", async () => {
    vi.resetModules();
    const ctx = setupWorkerContext(vi);
    await import("@app/worker/gameLoop.worker.js");
    const heat = new Float32Array(4);
    self.onmessage({
      data: {
        type: "tick",
        tickId: 5,
        tickCount: 2,
        heatBuffer: heat.buffer,
        partLayout: [],
        partTable: [],
        rows: 2,
        cols: 2,
        maxCols: 2,
        multiplier: 1,
        autoSell: false,
        reactorState: {
          current_heat: 0,
          current_power: 0,
          max_power: 100,
          max_heat: 1000,
        },
      },
    });
    expect(ctx.postMessage).toHaveBeenCalledTimes(1);
    const result = ctx.postMessage.mock.calls[0][0];
    expect(result.type).toBe("tickResult");
    expect(result.tickId).toBe(5);
    expect(result.tickCount).toBe(2);
    expect(Array.isArray(result.explosionIndices)).toBe(true);
    ctx.restore();
  });
});
