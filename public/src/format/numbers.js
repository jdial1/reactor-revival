import { getDecimal } from "../simUtils.js";
import { toNumber } from "../simUtils.js";

const COMPACT_SUFFIXES = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"];
const FORMAT_COMPACT_THRESHOLD = 1000;
const FORMAT_SCIENTIFIC_EXPONENT = 33;
const FORMAT_DEFAULT_PLACES = 2;
const FORMAT_HUGE_THRESHOLD = 1e36;
const INTL_COMPACT_MAX = 1e12;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

let _prefsGetter = null;
export function setFormatPreferencesGetter(fn) { _prefsGetter = fn; }
function getNumberFormatPreference() {
  try {
    if (typeof window === "undefined") return null;
    return _prefsGetter?.()?.numberFormat ?? null;
  } catch (_) { return null; }
}
function trimTrailingZeros(mantissaStr, fixedDecimals) { if (fixedDecimals) return mantissaStr; return mantissaStr.replace(/\.(\d*?)0+$/, (_, digits) => (digits ? `.${digits}` : "")); }
function formatDecimalScientific(num, places) { const p = places != null ? places : FORMAT_DEFAULT_PLACES; return num.toExponential(p); }
function formatDecimalSmall(num, places) { const p = places != null ? places : 0; return num.toNumber().toFixed(p); }
function formatDecimalCompact(num, places, fixedDecimals) {
  const exp = num.exponent;
  const pow = exp >= 3 ? Math.floor(exp / 3) * 3 : 0;
  const suffix = pow > 0 ? (COMPACT_SUFFIXES[pow / 3 - 1] || "") : "";
  const displayMantissa = pow > 0 ? num.mantissa * Math.pow(10, exp - pow) : num.toNumber();
  const p = places !== null ? places : (pow >= 3 ? FORMAT_DEFAULT_PLACES : 0);
  let mantissaStr = Number(displayMantissa).toFixed(p);
  return trimTrailingZeros(mantissaStr, fixedDecimals) + suffix;
}
function formatDecimal(num, places, fixedDecimals, style) {
  if (num.eq(0)) return "0";
  const pref = style ?? getNumberFormatPreference();
  if (pref === "scientific") return formatDecimalScientific(num, places);
  if (num.lt(FORMAT_COMPACT_THRESHOLD) && num.gt(-FORMAT_COMPACT_THRESHOLD)) return formatDecimalSmall(num, places);
  if (num.exponent >= FORMAT_SCIENTIFIC_EXPONENT) { const p = places != null ? places : FORMAT_DEFAULT_PLACES; return num.toStringWithDecimalPlaces(p); }
  return formatDecimalCompact(num, places, fixedDecimals);
}
function formatNumberScientific(num, places) { const p = places != null ? places : FORMAT_DEFAULT_PLACES; return num.toExponential(p); }
function formatNumberHuge(num, places) { let expStr = num.toExponential(places); return expStr.replace(/\.0+e/, "e"); }
function formatNumberCompact(num, places, fixedDecimals) {
  const absNum = Math.abs(num);
  const pow = Math.floor(Math.log10(absNum) / 3) * 3;
  const mantissa = num / Math.pow(10, pow);
  const suffix = COMPACT_SUFFIXES[pow / 3 - 1] || "";
  let mantissaStr = Number(mantissa).toFixed(places);
  return trimTrailingZeros(mantissaStr, fixedDecimals) + suffix;
}
function formatNumberWithIntl(num, places, fixedDecimals) {
  const maximumFractionDigits = places != null ? places : FORMAT_DEFAULT_PLACES;
  const minimumFractionDigits = fixedDecimals ? maximumFractionDigits : 0;
  const formatter = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short", maximumFractionDigits, minimumFractionDigits: fixedDecimals ? minimumFractionDigits : undefined });
  let result = formatter.format(num);
  if (!fixedDecimals) result = result.replace(/\.(\d*?)0+([a-zA-Z]+)/, (_, digits, suffix) => (digits ? `.${digits}${suffix}` : suffix));
  return result;
}
function formatFiniteNumber(num, places, fixedDecimals, style) {
  const absNum = Math.abs(num);
  let p = places;
  if (p === null) p = absNum >= FORMAT_COMPACT_THRESHOLD ? FORMAT_DEFAULT_PLACES : 0;
  const pref = style ?? getNumberFormatPreference();
  if (pref === "scientific") return formatNumberScientific(num, p);
  if (absNum >= FORMAT_HUGE_THRESHOLD) return formatNumberHuge(num, p);
  if (absNum < FORMAT_COMPACT_THRESHOLD) { let mantissaStr = num.toFixed(p); return trimTrailingZeros(mantissaStr, fixedDecimals); }
  if (absNum >= FORMAT_COMPACT_THRESHOLD && absNum < INTL_COMPACT_MAX) return formatNumberWithIntl(num, p, fixedDecimals);
  return formatNumberCompact(num, p, fixedDecimals);
}

export function formatNumber(value, options = {}) {
  const { style, places, fixedDecimals = false, infinitySymbol } = options;
  if (value === null || typeof value === "undefined") return "";
  const Decimal = getDecimal();
  if (value instanceof Decimal) return formatDecimal(value, places, fixedDecimals, style);
  const n = Number(value);
  if (!Number.isFinite(n)) return infinitySymbol ?? (Number.isNaN(n) ? "" : (n > 0 ? "Infinity" : "-Infinity"));
  return formatFiniteNumber(n, places, fixedDecimals, style);
}

const intlCompactPilot = new Intl.NumberFormat("en-US", { notation: "compact", compactDisplay: "short", maximumFractionDigits: 2 });
const intlStandardPilot = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatNumberCompactIntl(value, options = {}) {
  const n = typeof value === "number" ? value : toNumber(value);
  if (!Number.isFinite(n)) return "";
  if (options.scientific && Math.abs(n) >= 1e6) return n.toExponential(2);
  if (Math.abs(n) >= 1e6) return intlCompactPilot.format(n);
  return intlStandardPilot.format(n);
}

function formatDurationParts(ms, useHtml = false) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const sec = Math.floor(ms / MS_PER_SECOND);
  const s = sec % SECONDS_PER_MINUTE;
  const m = Math.floor(sec / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE;
  const h = Math.floor(sec / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) % HOURS_PER_DAY;
  const d = Math.floor(sec / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY));
  const unit = (val, label) => (useHtml ? `${val}<span class="time-unit">${label}</span>` : `${val}${label}`);
  return [d > 0 ? unit(d, "d") : "", h > 0 || d > 0 ? unit(h, "h") : "", m > 0 || h > 0 || d > 0 ? unit(m, "m") : "", unit(s, "s")].filter(Boolean).join(" ");
}

export const numFormat = (n, p, f) => formatNumber(n, { places: p, fixedDecimals: f });

export const formatStatNum = (n) => formatNumber(n, { places: 1 }) || "0";
export const formatPrestigeNumber = (n) => formatNumber(n, { places: 2, infinitySymbol: "∞" });
export function formatTime(ms) { return formatDurationParts(ms, true); }
export function formatDuration(ms, useHtml = false) { return formatDurationParts(ms, useHtml); }
export function formatPlaytimeLog(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "--:--:--";
  const s = Math.floor(ms / MS_PER_SECOND) % SECONDS_PER_MINUTE;
  const m = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE)) % MINUTES_PER_HOUR;
  const h = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "Unknown";
  const date = new Date(Number(timestamp) || timestamp);
  const diffMs = Date.now() - date;
  const diffHours = Math.floor(diffMs / (MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const diffDays = Math.floor(diffMs / (MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
export const formatDateTime = formatRelativeTime;
export const timeFormat = (ms) => formatDuration(ms, false);
