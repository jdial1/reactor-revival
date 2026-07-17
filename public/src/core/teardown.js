import { logger } from "./logger.js";

export function safeCall(fn, label = "teardown") {
  try {
    fn();
  } catch (err) {
    logger.warn(`${label} failed`, err);
  }
}

export function teardownAll(fns, label = "teardown") {
  if (!fns?.length) return;
  for (const fn of fns) {
    if (typeof fn !== "function") continue;
    safeCall(fn, label);
  }
}
