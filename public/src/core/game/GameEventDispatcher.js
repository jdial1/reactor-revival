import { fromError } from "zod-validation-error";
import { z } from "zod";
import { EVENT_SCHEMA_REGISTRY } from "../schemas.js";

const DEFAULT_PAYLOAD_SCHEMA = z.object({}).passthrough();

export class GameEventDispatcher {
  constructor(logger) {
    this._listeners = new Map();
    this._logger = logger;
  }

  on(eventName, handler) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, []);
    this._listeners.get(eventName).push(handler);
  }

  off(eventName, handler) {
    const list = this._listeners.get(eventName);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }

  emit(eventName, payload) {
    const schema = EVENT_SCHEMA_REGISTRY[eventName] ?? DEFAULT_PAYLOAD_SCHEMA;
    const result = schema.safeParse(payload ?? {});
    if (!result.success) {
      this._logger?.warn?.(`[Game] Event "${eventName}" payload validation failed:`, fromError(result.error).toString());
      return;
    }
    payload = result.data;
    const list = this._listeners.get(eventName);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        const msg = err?.message ?? String(err);
        this._logger?.warn?.(`[Game] Event handler error for "${eventName}":`, msg);
      }
    });
  }
}
