import { AppState } from "../store.js";
import { safeAdd, toDecimal } from "../utils.js";
import { compileAdjacency } from "./physics.js";

const TICK_MS = 1000;
let accumulator = 0;
let lastTime = performance.now();
let worker = null;

export function assertSimulationEnvironment() {
  if (typeof crossOriginIsolated !== "undefined" && !crossOriginIsolated) {
    throw new Error("Reactor Revival requires crossOriginIsolated (COOP/COEP headers).");
  }
  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error("Reactor Revival requires SharedArrayBuffer.");
  }
}

function syncHeatFromGrid() {
  const h = AppState.grid?.heat;
  if (!h) return;
  let sum = 0;
  for (let i = 0; i < h.length; i++) sum += h[i];
  AppState.heat = sum;
}

export function initLifecycle() {
  assertSimulationEnvironment();

  worker = new Worker(new URL("../worker/worker.js", import.meta.url), { type: "module" });

  worker.onmessage = (e) => {
    if (e.data.type === "TICK_RESULT") {
      const { power } = e.data.payload;
      AppState.money = safeAdd(AppState.money, toDecimal(power));
      syncHeatFromGrid();
    }
  };

  const topology = compileAdjacency(AppState.rows, AppState.cols);
  worker.postMessage({
    type: "INIT",
    payload: { grid: AppState.grid, topology },
  });

  requestAnimationFrame(mainLoop);
}

function mainLoop(now) {
  const dt = now - lastTime;
  lastTime = now;

  if (!AppState.isPaused && !AppState.meltdown) {
    accumulator += dt;

    let steps = 0;
    while (accumulator >= TICK_MS) {
      steps++;
      accumulator -= TICK_MS;
    }

    if (steps > 0 && worker) {
      const intents = AppState.intentQueue.slice();
      AppState.intentQueue.length = 0;

      worker.postMessage({
        type: "TICK_SYNC",
        payload: { steps, intents },
      });
    }
  }

  requestAnimationFrame(mainLoop);
}
