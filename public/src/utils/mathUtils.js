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
