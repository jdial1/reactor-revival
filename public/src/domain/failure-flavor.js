import { z } from "zod";
import { bundledGameData } from "../generated/bundledStaticData.js";
import { logger } from "../core/logger.js";

export const FailureFlavorSchema = z.record(z.string(), z.string());

let _failureFlavorCache = null;

export function loadFailureFlavor() {
  if (_failureFlavorCache) return _failureFlavorCache;
  try {
    _failureFlavorCache = FailureFlavorSchema.parse(bundledGameData.failureFlavor ?? {});
  } catch (err) {
    logger.log("warn", "ui", "Failed to parse bundled failure flavor:", err);
    _failureFlavorCache = {};
  }
  return _failureFlavorCache;
}

export function getFailureFlavorMessage(map, state) {
  if (!state || state === "nominal") return null;
  return map?.[state] ?? null;
}
