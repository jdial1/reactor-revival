function getDecimal() {
  const D = (typeof window !== "undefined" && window.Decimal) || (typeof global !== "undefined" && global.Decimal);
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
const DecimalProxy = new Proxy(function () {}, {
  construct(_, args) { return new (getDecimal())(...args); },
  get(_, prop) { return getDecimal()[prop]; },
  apply(_, t, args) { return getDecimal()(...args); }
});
export default DecimalProxy;
