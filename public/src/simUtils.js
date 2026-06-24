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
export const FOUNDATIONAL_TICK_MS = BASE_LOOP_WAIT_MS;

export * from "./constants/sim.js";

export function getIndex(row, col, cols) {
  return row * cols + col;
}

export function isInBounds(nr, nc, rows, cols) {
  return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
}

export function applyPowerOverflowCalc(reactorPower, effectiveMaxPower, overflowRatio) {
  if (reactorPower <= effectiveMaxPower) return { reactorPower, overflowHeat: 0 };
  const overflow = reactorPower - effectiveMaxPower;
  return { reactorPower: effectiveMaxPower, overflowHeat: overflow * overflowRatio };
}

export function applyPowerOverflowCalcDecimal(reactorPower, effectiveMaxPower, overflowRatio) {
  if (reactorPower.lte(effectiveMaxPower)) return { reactorPower, overflowHeat: reactorPower.constructor(0) };
  const overflow = reactorPower.sub(effectiveMaxPower);
  return { reactorPower: effectiveMaxPower, overflowHeat: overflow.mul(overflowRatio) };
}
