import { fromError } from "../../lib/zod-validation-error.js";
import {
  GameLoopTickInputSchema,
  GameLoopTickResultSchema,
  PhysicsTickInputSchema,
} from "../schema/stateSchemas.js";
import { TickResultSchema } from "../domain/tick-result.js";
import { isTestEnv } from "../simUtils.js";

export function isWorkerBoundaryValidationEnabled() {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return true;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") return true;
  const loc =
    (typeof self !== "undefined" && self.location) ||
    (typeof window !== "undefined" && window.location);
  const host = loc?.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

export function validateWorkerInput(schema, msg, label) {
  if (!isWorkerBoundaryValidationEnabled()) {
    return { success: true, data: msg };
  }
  const result = schema.safeParse(msg);
  if (!result.success) {
    const detail = fromError(result.error).toString();
    if (typeof console !== "undefined" && console.error) {
      console.error(`[WorkerBoundary] ${label} validation failed:`, detail);
      console.error(`[WorkerBoundary] ${label} Zod issues:`, result.error.issues);
    }
  }
  return result;
}

export function validateGameLoopTickInput(msg, label = "GameLoopTickInput") {
  return validateWorkerInput(GameLoopTickInputSchema, msg, label);
}

export function validatePhysicsTickInput(msg, label = "PhysicsTickInput") {
  return validateWorkerInput(PhysicsTickInputSchema, msg, label);
}

export function validateGameLoopTickResult(msg, label = "GameLoopTickResult") {
  return validateWorkerInput(GameLoopTickResultSchema, msg, label);
}

export function validateTickResult(msg, label = "TickResult") {
  return validateWorkerInput(TickResultSchema, msg, label);
}

export function freezeWorkerTickSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const frozen = { ...snapshot };
  if (frozen.partLayout) {
    frozen.partLayout = Object.freeze(frozen.partLayout.map((entry) => Object.freeze({ ...entry })));
    Object.freeze(frozen.partLayout);
  }
  if (frozen.partTable) {
    frozen.partTable = Object.freeze(
      frozen.partTable.map((row) => {
        const copy = { ...row };
        if (Array.isArray(copy.traits)) copy.traits = Object.freeze(copy.traits.slice());
        return Object.freeze(copy);
      })
    );
    Object.freeze(frozen.partTable);
  }
  if (Array.isArray(frozen.intents)) {
    frozen.intents = Object.freeze(
      frozen.intents.map((intent) =>
        Object.freeze({
          ...intent,
          payload: intent.payload ? { ...intent.payload } : undefined,
        })
      )
    );
  }
  if (frozen.reactorState) frozen.reactorState = Object.freeze({ ...frozen.reactorState });
  return Object.freeze(frozen);
}

export function lockSimulationForWorker(engine) {
  if (isTestEnv()) return;
  if (engine) {
    engine._simulationLocked = true;
    if (engine.game?.state) engine.game.state._simulationLocked = true;
  }
}

export function unlockSimulationAfterCommit(engine) {
  if (!engine) return;
  engine._simulationLocked = false;
  if (engine.game?.state) engine.game.state._simulationLocked = false;
  const waiters = engine._intentDrainWaiters;
  if (!waiters?.length) return;
  const pending = waiters.splice(0);
  for (let i = 0; i < pending.length; i++) pending[i]();
}

export function waitForSimulationUnlock(engine) {
  if (!engine?._simulationLocked) return Promise.resolve();
  return new Promise((resolve) => {
    engine._intentDrainWaiters = engine._intentDrainWaiters || [];
    engine._intentDrainWaiters.push(resolve);
  });
}

export function isSimulationLocked(engine) {
  return !!engine?._simulationLocked;
}
