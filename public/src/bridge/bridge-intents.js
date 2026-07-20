import { recordSimEvent } from "../domain/sim-events.js";
import { bumpGridPartsRevision } from "./bridge-grid-sync.js";
import { requireActiveBridge } from "./active.js";
import { runSubsystemHook } from "../core/subsystem-registry.js";

function syncPlannerFromSession(game, bridge) {
  const planner = bridge.session?.blueprintPlanner;
  if (!game.blueprintPlanner || !planner) return;
  game.blueprintPlanner.slots = { ...(planner.slots ?? {}) };
  game.blueprintPlanner.active = !!planner.active;
  game._syncBlueprintPlannerUi?.();
}

function clearMeltdownRecoveryAfterPlace(game) {
  if (!game?.reactor?.has_melted_down) return;
  game.reactor.clearMeltdownState();
  const bridge = game.coreBridge;
  if (bridge?.session) {
    bridge.session.grid.resetHeat();
    bridge.projectLiveState();
  }
  const engineStopped = game.engine && !game.engine.running;
  if (!engineStopped) return;
  const currentPauseState = game.state?.pause ?? game.paused;
  if (currentPauseState) {
    game.onToggleStateChange?.("pause", false);
    return;
  }
  const isTestEnv = (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test")
    || (typeof global !== "undefined" && global.__VITEST__)
    || (typeof window !== "undefined" && window.__VITEST__);
  if (isTestEnv) return;
  game.engine?.start?.();
}

function afterSessionCommand(game, bridge, type, payload, ok, result) {
  if (type === "PLACE_PART_PAID" || type === "PLACE_PART") {
    const row = payload?.row | 0;
    const col = payload?.col | 0;
    if (!ok) {
      if (type === "PLACE_PART_PAID") {
        recordSimEvent(game, { type: "INSUFFICIENT_FUNDS", row, col });
      }
      return { placed: null, sold: null, gridMutated: false };
    }
    const partId = payload?.id;
    const part = partId ? game.partset?.getPartById?.(partId) : null;
    recordSimEvent(game, {
      type: "PART_PLACED",
      row,
      col,
      category: part?.category,
    });
    clearMeltdownRecoveryAfterPlace(game);
    return { placed: { row, col, part }, sold: null, gridMutated: true };
  }
  if (type === "SELL_PART" || type === "REMOVE_PART") {
    if (!ok) return { placed: null, sold: null, gridMutated: false };
    return {
      placed: null,
      sold: { row: payload?.row | 0, col: payload?.col | 0 },
      gridMutated: true,
    };
  }
  if (type === "APPLY_BLUEPRINT" || type === "COMMIT_BLUEPRINT_PLANNER") {
    if (!ok) {
      if (result?.reason === "deficit") {
        game.emit?.("blueprintApplyDeficit", result);
        recordSimEvent(game, { type: "OPERATION_FAILED", context: "reactor" });
      }
      return { placed: null, sold: null, gridMutated: false };
    }
    if (type === "COMMIT_BLUEPRINT_PLANNER") syncPlannerFromSession(game, bridge);
    game.reactor?.updateStats?.();
    game.partset?.check_affordability?.(game);
    return { placed: null, sold: null, gridMutated: true };
  }
  if (type === "VENT_HEAT" && ok) {
    recordSimEvent(game, { type: "MANUAL_HEAT_REDUCE" });
  }
  return { placed: null, sold: null, gridMutated: false };
}

export function shouldDrainIntentsImmediately(game) {
  if (!game) return true;
  if (typeof process !== "undefined" && process.env?.VITEST) return true;
  if (game.paused) return true;
  if (!game.engine?.running) return true;
  return false;
}

export function enqueueIntent(game, intent) {
  const q = game?.state?.intent_queue;
  if (!q || !intent?.type) return;
  q.push({
    type: intent.type,
    payload: intent.payload ?? {},
    ts: Date.now(),
  });
}

function drainIntentBatchSync(game, engine, intents) {
  const placed = [];
  const sold = [];
  const reboots = [];
  let gridMutated = false;
  const bridge = requireActiveBridge(game, "drainIntentQueue");
  for (let i = 0; i < intents.length; i++) {
    const intent = intents[i];
    const type = intent?.type;
    if (!type) continue;
    if (type === "REBOOT") {
      reboots.push(intent);
      continue;
    }
    const { ok, result } = bridge.dispatch({ type, payload: intent.payload ?? {} });
    const outcome = afterSessionCommand(game, bridge, type, intent.payload, ok, result);
    if (outcome.placed) placed.push(outcome.placed);
    if (outcome.sold) sold.push(outcome.sold);
    if (outcome.gridMutated) gridMutated = true;
  }
  if (gridMutated) {
    game.reactor?.updateStats?.();
    bumpGridPartsRevision(game.tileset);
  }
  runSubsystemHook(game, "postTick");
  return { placed, sold, reboots };
}

async function runRebootIntents(game, reboots) {
  for (let i = 0; i < reboots.length; i++) {
    const keepEp = reboots[i].payload?.keepEp === true;
    if (keepEp) await game.rebootActionKeepExoticParticles();
    else await game.rebootActionDiscardExoticParticles();
  }
}

async function drainGridIntentsAsync(game, engine, intents) {
  const { placed, sold, reboots } = drainIntentBatchSync(game, engine, intents);
  await runRebootIntents(game, reboots);
  return { placed, sold, queued: false };
}

export function drainIntentQueue(game, engine) {
  const q = game?.state?.intent_queue;
  if (!q?.length) return { placed: [], sold: [], reboots: [] };
  return drainIntentBatchSync(game, engine, q.splice(0, q.length));
}

export function dispatchPlayerIntent(game, engine, intent) {
  if (!game || !intent?.type) return Promise.resolve({ placed: [], sold: [], queued: false });
  if (shouldDrainIntentsImmediately(game)) {
    return drainGridIntentsAsync(game, engine, [intent]);
  }
  enqueueIntent(game, intent);
  return Promise.resolve({ placed: [], sold: [], queued: true });
}

export function dispatchPlayerIntents(game, engine, intents) {
  if (!game || !intents?.length) return Promise.resolve({ placed: [], sold: [], queued: false });
  if (shouldDrainIntentsImmediately(game)) {
    return drainGridIntentsAsync(game, engine, intents);
  }
  for (let i = 0; i < intents.length; i++) enqueueIntent(game, intents[i]);
  return Promise.resolve({ placed: [], sold: [], queued: true });
}
