import { resolveCoreSnapshot } from "./core-state-projection.js";

function clonePlain(value) {
  if (value === null || value === undefined || typeof value !== "object") return value;
  const sc = typeof globalThis.structuredClone === "function" ? globalThis.structuredClone : null;
  if (sc) {
    try {
      return sc(value);
    } catch {
      /* fall through */
    }
  }
  if (Array.isArray(value)) return value.map((item) => clonePlain(item));
  const out = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (typeof v === "function") continue;
    out[key] = clonePlain(v);
  }
  return out;
}

function deepFreeze(obj) {
  if (obj === null || obj === undefined || typeof obj !== "object" || Object.isFrozen(obj)) return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

function shouldFreezeCommit() {
  if (typeof process !== "undefined" && process.env?.VITEST) return true;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return false;
  return true;
}

function freezeCommit(commit) {
  if (!shouldFreezeCommit()) return commit;
  return deepFreeze(commit);
}

export function buildTickCommit(session, tickResult, tickMeta = {}, eventsOverride = null) {
  const events = Array.isArray(eventsOverride)
    ? eventsOverride
    : (session?.drainEvents?.() || []);
  const snap = resolveCoreSnapshot(session, tickResult);
  const cellOutputs = tickResult?.cellOutputs ?? snap?.cellOutputs ?? [];
  const stateSnapshot = clonePlain(snap);
  const commit = {
    stateSnapshot,
    cellOutputs: Array.isArray(cellOutputs) ? clonePlain(cellOutputs) : [],
    events: events.map((e) => ({
      type: e.type,
      payload: e.payload !== null && e.payload !== undefined ? clonePlain(e.payload) : e.payload,
    })),
    tickMeta: {
      heatBefore: tickMeta.heatBefore,
      powerBefore: tickMeta.powerBefore,
      multiplier: tickMeta.multiplier,
    },
    tickResult: tickResult
      ? {
          meltdown: tickResult.meltdown,
          heatWarningLevel: tickResult.heatWarningLevel,
          heatRatio: tickResult.heatRatio,
          ventedHeat: tickResult.ventedHeat,
          cellOutputs: Array.isArray(cellOutputs) ? clonePlain(cellOutputs) : [],
          stateSnapshot,
        }
      : null,
  };
  return freezeCommit(commit);
}

export function assertNotTickInFlight(bridge, label) {
  if (!bridge?._tickInFlight) return;
  if (bridge.game?._isRestoringSave) return;
  if (typeof process !== "undefined" && process.env?.VITEST && bridge.game?._hostEconomyWrite) return;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return;
  throw new Error(`Host session write during tick commit: ${label}`);
}
