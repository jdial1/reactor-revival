export {
  toNumber,
  getDecimal,
  toDecimal,
  isTestEnv,
  getIndex,
  isInBounds,
  DEFAULT_OVERFLOW_RATIO,
  DEFAULT_POWER_MULTIPLIER,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  VENT_BONUS_PERCENT_DIVISOR,
  BASE_LOOP_WAIT_MS,
} from "./simUtils.js";

export { default, default as DecimalProxy } from "./core/decimal-proxy.js";
export { Logger, logger } from "./core/logger.js";
export { safeCall, teardownAll } from "./core/teardown.js";
export { vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent, vuSegmentRatio01, safeAdd, safeSub } from "./core/math-helpers.js";
export { getNeighborKeys, areAdjacent } from "./core/grid-helpers.js";
export { getPartImagePath } from "./core/part-images.js";
export { getCompactLayout, countPlacedParts, serializeReactor } from "./domain/reactor-codec.js";
export { deserializeReactor } from "./domain/blueprint.js";
export { getBasePath } from "./dom/lit.js";

export * from "./constants/balance.js";
export * from "./constants/ui-constants.js";
export * from "./constants/heat-visual.js";
export * from "./constants/sim.js";

export {
  formatNumber,
  formatNumberCompactIntl,
  numFormat,
  formatStatNum,
  formatPrestigeNumber,
  formatTime,
  formatDuration,
  formatPlaytimeLog,
  formatRelativeTime,
  timeFormat,
  setFormatPreferencesGetter,
} from "./core/numbers.js";
