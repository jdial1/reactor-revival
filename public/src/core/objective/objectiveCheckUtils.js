import { PERCENT_COMPLETE_MAX } from "./objectiveConstants.js";

const COMPARE_OPS = {
  gt: (val, n) => (val?.gt ? val.gt(n) : val > n),
  gte: (val, n) => (val?.gte ? val.gte(n) : val >= n),
  lt: (val, n) => (val?.lt ? val.lt(n) : val < n),
  eq: (val, n) => (val?.eq ? val.eq(n) : val === n),
};

export function compare(value, threshold, operator) {
  const fn = COMPARE_OPS[operator];
  return fn ? fn(value, threshold) : false;
}

export function progressWithCap(current, target) {
  return Math.min(PERCENT_COMPLETE_MAX, (current / target) * PERCENT_COMPLETE_MAX);
}

export function createProgress(current, target, unit = "", textOverride = null) {
  const percent = target > 0 ? progressWithCap(current, target) : (current > 0 ? PERCENT_COMPLETE_MAX : 0);
  return {
    completed: current >= target,
    percent,
    text: textOverride || `${current.toLocaleString()} / ${target.toLocaleString()} ${unit}`.trim(),
  };
}

export function boolProgress(done, doneText, pendingText) {
  return { completed: done, percent: done ? PERCENT_COMPLETE_MAX : 0, text: done ? doneText : pendingText };
}
