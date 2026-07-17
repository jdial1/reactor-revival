import { BASE_MAX_POWER } from "./constants/balance.js";

export function toNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toNumber === "function") {
    try {
      return value.toNumber();
    } catch (e) {
      return Number.isFinite(Number(value.toString())) ? Number(value.toString()) : 0;
    }
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function getDecimal() {
  const D =
    (typeof window !== "undefined" && window?.Decimal) ||
    (typeof global !== "undefined" && global?.Decimal) ||
    (typeof globalThis !== "undefined" && globalThis?.Decimal);
  if (!D) throw new Error("break_infinity.js must be loaded before decimal.js (script tag or test setup)");
  return D;
}

export function toDecimal(value) {
  const Decimal = getDecimal();
  if (value instanceof Decimal) return value;
  if (value === undefined || value === null) return new Decimal(0);
  if (typeof value === "number") {
    if (Number.isNaN(value) || !Number.isFinite(value)) return new Decimal(0);
    return new Decimal(value);
  }
  if (typeof value === "string") return new Decimal(value);
  const n = Number(value);
  return new Decimal(Number.isNaN(n) || !Number.isFinite(n) ? 0 : n);
}

export function isTestEnv() {
  return (typeof process !== "undefined" && process.env && process.env.NODE_ENV === "test")
    || (typeof global !== "undefined" && global.__VITEST__)
    || (typeof window !== "undefined" && window.__VITEST__);
}

export const DEFAULT_OVERFLOW_RATIO = 1;
export const DEFAULT_POWER_MULTIPLIER = 1;
export const DEFAULT_SELL_PRICE_MULTIPLIER = 1;
export const VENT_BONUS_PERCENT_DIVISOR = 100;
export const BASE_LOOP_WAIT_MS = 1000;

export function getIndex(row, col, cols) {
  return row * cols + col;
}

export function isInBounds(nr, nc, rows, cols) {
  return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
}

export function resolveEffectiveMaxPower(reactorState) {
  const explicit = Number(reactorState?.effective_max_power ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return toDecimal(explicit);
  const layout = toDecimal(reactorState?.max_power ?? 0);
  const altered = toDecimal(reactorState?.altered_max_power ?? reactorState?.base_max_power ?? 0);
  if (altered.gt(0)) return altered;
  if (layout.gt(0)) return layout;
  return toDecimal(BASE_MAX_POWER);
}

export function isAllPowerOverflowingToHeat(state, reactor = null) {
  const statsPower = toNumber(state?.stats_power ?? 0);
  if (statsPower <= 0) return false;
  const overflowRatio = Number(
    state?.power_overflow_to_heat_ratio ?? reactor?.power_overflow_to_heat_ratio ?? 1
  ) || 0;
  if (overflowRatio <= 0) return false;
  const currentPower = toNumber(state?.current_power ?? 0);
  const cap = toNumber(resolveEffectiveMaxPower({
    effective_max_power: state?.effective_max_power,
    max_power: state?.max_power,
    base_max_power: reactor?.base_max_power ?? state?.base_max_power,
    altered_max_power: reactor?.altered_max_power ?? state?.altered_max_power,
  }));
  if (cap <= 0) return true;
  const potential = currentPower + statsPower;
  const overflow = Math.max(0, potential - cap);
  return overflow >= statsPower;
}

export * from "./constants/sim.js";
