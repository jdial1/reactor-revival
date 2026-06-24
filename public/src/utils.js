export {
  toNumber,
  getDecimal,
  toDecimal,
  isTestEnv,
  getIndex,
  isInBounds,
  applyPowerOverflowCalc,
  applyPowerOverflowCalcDecimal,
  DEFAULT_OVERFLOW_RATIO,
  DEFAULT_POWER_MULTIPLIER,
  DEFAULT_SELL_PRICE_MULTIPLIER,
  VENT_BONUS_PERCENT_DIVISOR,
  BASE_LOOP_WAIT_MS,
  FOUNDATIONAL_TICK_MS,
} from "./simUtils.js";

export { default } from "./core/decimal-proxy.js";
export { Logger, logger } from "./core/logger.js";
export { default as DecimalProxy } from "./core/decimal-proxy.js";
export { vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent, vuSegmentRatio01, safeAdd, safeSub } from "./core/math-helpers.js";
export { getNeighborKeys, areAdjacent, clampHeat, clampHeatDecimal } from "./core/grid-helpers.js";
export { getPartImagePath } from "./core/part-images.js";
export { runWithConcurrencyLimit, getCompactLayout, countPlacedParts, serializeReactor, deserializeReactor } from "./layout/reactor-codec.js";

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
  formatDateTime,
  timeFormat,
  setFormatPreferencesGetter,
} from "./format/numbers.js";

export { ManifestValidator, validateManifest, validateManifestFromFile } from "./validation/manifest.js";
