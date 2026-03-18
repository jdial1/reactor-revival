import { get, set, del, clear } from "idb-keyval";
import { z, prettifyError } from "zod";
import superjson from "superjson";


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

const Decimal = getDecimal();
superjson.registerCustom(
  { isApplicable: (v) => v instanceof Decimal, serialize: (v) => v.toString(), deserialize: (v) => new Decimal(v) },
  "Decimal"
);
const superjsonStringify = (obj) => superjson.stringify(obj);
const superjsonParse = (str) => superjson.parse(str);

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
export function safeAdd(a, b) {
  return toDecimal(a).add(toDecimal(b));
}
export function safeSub(a, b) {
  return toDecimal(a).sub(toDecimal(b));
}
const DecimalProxy = new Proxy(function () {}, {
  construct(_, args) { return new (getDecimal())(...args); },
  get(_, prop) { return getDecimal()[prop]; },
  apply(_, t, args) { return getDecimal()(...args); }
});
export default DecimalProxy;

export function escapeHtml(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

const VALID_LEVELS = ['error', 'warn', 'info', 'debug'];
class Logger {
  constructor() {
    this.levels = { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 };
    this.mutedContexts = new Set();
    this.productionMode = typeof window !== 'undefined' && window.PRODUCTION_BUILD === true;
    this.currentLevel = this.levels.INFO;
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') this.currentLevel = this.levels.DEBUG;
    if (!this.productionMode) {
      try {
        const storedLevel = localStorage.getItem('reactor_log_level');
        if (storedLevel && this.levels[storedLevel.toUpperCase()] !== undefined) this.currentLevel = this.levels[storedLevel.toUpperCase()];
      } catch (e) {}
    }
  }
  setLevel(level) {
    if (this.levels[level.toUpperCase()] !== undefined) {
      this.currentLevel = this.levels[level.toUpperCase()];
      try { localStorage.setItem('reactor_log_level', level.toUpperCase()); } catch (e) {}
    }
  }
  shouldLog(level) {
    if (this.productionMode) return level <= this.levels.WARN;
    return this.currentLevel >= level;
  }
  _formatArgs(args) {
    const seen = new WeakSet();
    const replacer = (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
        if (value.constructor && value.constructor.name !== 'Object' && value.constructor.name !== 'Array') return `[${value.constructor.name}]`;
      }
      return value;
    };
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        try { return JSON.stringify(arg, replacer, 2); } catch (e) { return '[Unserializable Object]'; }
      }
      return arg;
    });
  }
  _log(levelName, level, message, ...args) {
    if (this.shouldLog(level)) {
      const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
      const prefix = `[${timestamp}] [${levelName}]`;
      const formattedArgs = this._formatArgs(args);
      console[levelName.toLowerCase()](prefix, message, ...formattedArgs);
    }
  }
  log(level, context, message, ...args) {
    const lvl = typeof level === 'string' ? level.toLowerCase() : level;
    const ctx = typeof context === 'string' ? context.toLowerCase() : 'app';
    if (!VALID_LEVELS.includes(lvl) || !ctx) return;
    if (this.mutedContexts.has(ctx)) return;
    const levelName = lvl.toUpperCase();
    const levelVal = this.levels[levelName];
    if (levelVal === undefined) return;
    const contextPrefix = ctx !== 'app' ? `[${ctx.toUpperCase()}] ` : '';
    this._log(levelName, levelVal, contextPrefix + message, ...args);
  }
  setMutedContexts(contexts) { this.mutedContexts = new Set(contexts.map((c) => String(c).toLowerCase())); }
  muteContext(context) { this.mutedContexts.add(String(context).toLowerCase()); }
  unmuteContext(context) { this.mutedContexts.delete(String(context).toLowerCase()); }
  error(message, ...args) { this.log('error', 'app', message, ...args); }
  warn(message, ...args) { this.log('warn', 'app', message, ...args); }
  info(message, ...args) { this.log('info', 'app', message, ...args); }
  debug(message, ...args) { this.log('debug', 'app', message, ...args); }
  group(label) { if (this.shouldLog(this.levels.DEBUG)) console.group(label); }
  groupCollapsed(label) { if (this.shouldLog(this.levels.DEBUG)) console.groupCollapsed(label); }
  groupEnd() { if (this.shouldLog(this.levels.DEBUG)) console.groupEnd(); }
}
const logger = new Logger();
if (typeof window !== 'undefined') {
  window.logger = logger;
  window.setLogLevel = (level) => {
    const validLevels = ['ERROR', 'WARN', 'INFO', 'DEBUG'];
    if (!validLevels.includes(level.toUpperCase())) { console.warn(`Invalid level. Use: ${validLevels.join(', ')}`); return; }
    logger.setLevel(level);
    console.log(`Log level set to: ${level}`);
  };
  window.setDebug = () => window.setLogLevel('DEBUG');
  window.setInfo = () => window.setLogLevel('INFO');
  window.setWarn = () => window.setLogLevel('WARN');
  window.setError = () => window.setLogLevel('ERROR');
  window.getLogLevel = () => ['ERROR', 'WARN', 'INFO', 'DEBUG'][logger.currentLevel];
}
export { Logger, logger };

export { render } from "lit-html";
export { classMap } from "lit-html/directives/class-map.js";
export { styleMap } from "lit-html/directives/style-map.js";
export { repeat } from "lit-html/directives/repeat.js";
export { when } from "lit-html/directives/when.js";
export { unsafeHTML } from "lit-html/directives/unsafe-html.js";

const CELL_LEVEL_TILES = { 1: 1, 2: 2, 3: 4 };
const CELL_TYPE_TO_NUM = { uranium: 1, plutonium: 2, thorium: 3, seaborgium: 4, dolorium: 5, nefastium: 6, protium: 1 };
const CELL_TYPES = new Set(Object.keys(CELL_TYPE_TO_NUM));
const VALVE_IMAGE_MAP = {
  overflow_valve: "valve_1_1", overflow_valve2: "valve_1_2", overflow_valve3: "valve_1_3", overflow_valve4: "valve_1_4",
  topup_valve: "valve_2_1", topup_valve2: "valve_2_2", topup_valve3: "valve_2_3", topup_valve4: "valve_2_4",
  check_valve: "valve_3_1", check_valve2: "valve_3_2", check_valve3: "valve_3_3", check_valve4: "valve_3_4",
};
const CATEGORY_FOLDERS = {
  cell: "cells", reflector: "reflectors", capacitor: "capacitors", vent: "vents",
  heat_exchanger: "exchangers", heat_inlet: "inlets", heat_outlet: "outlets", coolant_cell: "coolants",
  reactor_plating: "platings", particle_accelerator: "accelerators", accelerator: "accelerators", valve: "valves",
};
const FILENAME_PREFIX = { heat_exchanger: "exchanger", heat_inlet: "inlet", heat_outlet: "outlet", reactor_plating: "plating", particle_accelerator: "accelerator" };
export function getPartImagePath({ type, category, level = 1, id = null }) {
  const resolvedCategory = category || (CELL_TYPES.has(type) ? "cell" : type);
  const folder = CATEGORY_FOLDERS[resolvedCategory] || resolvedCategory;
  if (resolvedCategory === "cell") {
    const cellType = type === "protium" ? "xcell" : "cell";
    const cellNum = CELL_TYPE_TO_NUM[type] || 1;
    const count = CELL_LEVEL_TILES[level] || 1;
    return `img/parts/${folder}/${cellType}_${cellNum}_${count}.png`;
  }
  if (resolvedCategory === "valve") {
    const filename = (id && VALVE_IMAGE_MAP[id]) || "valve_1";
    return `img/parts/${folder}/${filename}.png`;
  }
  const prefix = FILENAME_PREFIX[resolvedCategory] || type;
  return `img/parts/${folder}/${prefix}_${level}.png`;
}

const FIELD_RULES = {
  required: { name: { type: 'string', minLength: 1 }, short_name: { type: 'string', minLength: 1 }, start_url: { type: 'string', minLength: 1 }, icons: { type: 'array', minLength: 1 } },
  recommended: { background_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ }, description: { type: 'string', minLength: 1 }, display: { type: 'string', values: ['fullscreen', 'standalone', 'minimal-ui', 'browser'] }, id: { type: 'string', minLength: 1 }, launch_handler: { type: 'object' }, orientation: { type: 'string', values: ['any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'] }, screenshots: { type: 'array', minLength: 1 }, theme_color: { type: 'string', pattern: /^#[0-9A-Fa-f]{6}$/ } },
  optional: { categories: { type: 'array', minLength: 1 }, dir: { type: 'string', values: ['ltr', 'rtl', 'auto'] }, iarc_rating_id: { type: 'string', minLength: 1 }, lang: { type: 'string', minLength: 1 }, prefer_related_applications: { type: 'boolean' }, related_applications: { type: 'array' }, scope: { type: 'string', minLength: 1 } }
};
const ARRAY_HANDLER_RULES = [
  { key: 'file_handlers', requiredKeys: ['action', 'accept'] }, { key: 'protocol_handlers', requiredKeys: ['protocol', 'url'] },
  { key: 'shortcuts', requiredKeys: ['name', 'url'] }, { key: 'widgets', requiredKeys: [] },
];
const URL_RULES = [{ key: 'start_url', check: v => v.startsWith('/'), msg: 'start_url should start with /' }, { key: 'scope', check: v => v.startsWith('/'), msg: 'scope should start with /' }];
const SENSITIVE_TERMS = ["password", "secret", "key", "token", "api"];
const SCORE_ERROR_WEIGHT = 3;
const SCORE_MAX_ISSUES = 50;

function validateFieldGroup(manifest, fields, severity, errors, warnings) {
  const collector = severity === 'error' ? errors : warnings;
  const label = severity === 'error' ? 'required' : 'recommended';
  for (const [field, rules] of Object.entries(fields)) {
    if (!manifest[field]) {
      if (severity === 'error') errors.push(`Missing required field: ${field}`);
      else if (severity !== 'skip') warnings.push(`Missing ${label} field: ${field}`);
      continue;
    }
    if (typeof manifest[field] !== rules.type) { collector.push(`Field ${field} ${severity === 'error' ? 'must' : 'should'} be a ${rules.type}`); continue; }
    if (rules.pattern && !rules.pattern.test(manifest[field])) collector.push(`Field ${field} should match pattern: ${rules.pattern}`);
    if (rules.values && !rules.values.includes(manifest[field])) collector.push(`Field ${field} should be one of: ${rules.values.join(', ')}`);
    if (rules.minLength && manifest[field].length < rules.minLength) collector.push(`Field ${field} ${severity === 'error' ? 'must' : 'should'} have at least ${rules.minLength} character(s)`);
  }
}
function validateIconRequirements(icons, errors, warnings) {
  if (!icons || !Array.isArray(icons)) return;
  const parsed = icons.map(icon => { const sizes = icon.sizes?.split("x") || []; return { width: parseInt(sizes[0]) || 0, height: parseInt(sizes[1]) || 0, purpose: icon.purpose || "any" }; });
  const anyIcons = parsed.filter(i => i.purpose === "any");
  if (anyIcons.length === 0) warnings.push('No icons with purpose "any" found');
  const checkSize = (list, size, label, collector) => { if (!list.some(i => i.width >= size && i.height >= size)) collector.push(`No icon with size ${size}x${size} or larger found for "${label}" purpose`); };
  checkSize(anyIcons, 192, "any", errors); checkSize(anyIcons, 512, "any", errors);
  const maskable = parsed.filter(i => i.purpose === "maskable");
  if (maskable.length === 0) warnings.push('No maskable icons found'); else checkSize(maskable, 192, "maskable", warnings);
}
function validateScreenshotRequirements(screenshots, warnings) {
  if (!screenshots || !Array.isArray(screenshots)) return;
  screenshots.forEach((s, i) => { if (!s.src) warnings.push(`screenshots[${i}] missing src field`); if (!s.sizes) warnings.push(`screenshots[${i}] missing sizes field`); if (!s.type) warnings.push(`screenshots[${i}] missing type field`); });
  if (!screenshots.some(s => s.form_factor === "wide")) warnings.push('No screenshots for wide form factor found');
  if (!screenshots.some(s => s.form_factor === "narrow")) warnings.push('No screenshots for narrow form factor found');
}
function validateArrayHandlers(manifest, warnings) {
  for (const { key, requiredKeys } of ARRAY_HANDLER_RULES) {
    if (!manifest[key]) continue;
    if (!Array.isArray(manifest[key])) { warnings.push(`${key} should be an array`); continue; }
    if (requiredKeys.length === 0) continue;
    manifest[key].forEach((item, i) => { const missing = requiredKeys.filter(k => !item[k]); if (missing.length) warnings.push(`${key}[${i}] missing required ${missing.join(' or ')} fields`); });
  }
  if (manifest.background_sync && typeof manifest.background_sync !== 'object') warnings.push('background_sync should be an object');
  if (manifest.share_target) { if (typeof manifest.share_target !== 'object') warnings.push('share_target should be an object'); else if (!manifest.share_target.action) warnings.push('share_target missing required action field'); }
}
function validateUrls(manifest, warnings) {
  for (const { key, check, msg } of URL_RULES) { if (manifest[key] && !check(manifest[key])) warnings.push(msg); }
  if (manifest.file_handlers) manifest.file_handlers.forEach((h, i) => { if (h.action && !h.action.startsWith('/')) warnings.push(`file_handlers[${i}].action should start with /`); });
  if (manifest.protocol_handlers) manifest.protocol_handlers.forEach((h, i) => { if (h.url && !h.url.includes('%s')) warnings.push(`protocol_handlers[${i}].url should contain %s placeholder`); });
}
function validateSecurity(manifest, warnings) { const str = JSON.stringify(manifest).toLowerCase(); SENSITIVE_TERMS.forEach(term => { if (str.includes(term)) warnings.push(`Manifest contains potentially sensitive term: ${term}`); }); }
function calculateScore(errors, warnings) { return Math.round(Math.max(0, 100 - ((errors.length * SCORE_ERROR_WEIGHT + warnings.length) / SCORE_MAX_ISSUES) * 100)); }
function isFieldValid(manifest, field) {
  const value = manifest[field];
  if (value == null) return false;
  const allRules = { ...FIELD_RULES.required, ...FIELD_RULES.recommended, ...FIELD_RULES.optional };
  const rules = allRules[field];
  if (!rules) return true;
  if (typeof value !== rules.type) return false;
  if (rules.pattern && !rules.pattern.test(value)) return false;
  if (rules.values && !rules.values.includes(value)) return false;
  if (rules.minLength && value.length < rules.minLength) return false;
  if (field === 'start_url' || field === 'scope') return typeof value === 'string' && value.startsWith('/');
  return true;
}
function getFieldGroupStatus(manifest, fields) { const status = {}; for (const field of Object.keys(fields)) status[field] = { present: !!manifest[field], valid: isFieldValid(manifest, field) }; return status; }

export class ManifestValidator {
  constructor(manifest) { this.manifest = manifest; this.errors = []; this.warnings = []; }
  validate() {
    this.errors = []; this.warnings = [];
    validateFieldGroup(this.manifest, FIELD_RULES.required, 'error', this.errors, this.warnings);
    validateFieldGroup(this.manifest, FIELD_RULES.recommended, 'warning', this.errors, this.warnings);
    validateFieldGroup(this.manifest, FIELD_RULES.optional, 'skip', this.errors, this.warnings);
    validateArrayHandlers(this.manifest, this.warnings);
    validateIconRequirements(this.manifest.icons, this.errors, this.warnings);
    validateScreenshotRequirements(this.manifest.screenshots, this.warnings);
    validateUrls(this.manifest, this.warnings);
    validateSecurity(this.manifest, this.warnings);
    return { isValid: this.errors.length === 0, errors: this.errors, warnings: this.warnings, score: calculateScore(this.errors, this.warnings) };
  }
  getReport() {
    const validation = this.validate();
    return { isValid: validation.isValid, score: validation.score, errors: validation.errors, warnings: validation.warnings, summary: { totalErrors: validation.errors.length, totalWarnings: validation.warnings.length, requiredFields: getFieldGroupStatus(this.manifest, FIELD_RULES.required), recommendedFields: getFieldGroupStatus(this.manifest, FIELD_RULES.recommended), optionalFields: getFieldGroupStatus(this.manifest, FIELD_RULES.optional) } };
  }
}
export async function validateManifestFromFile(filePath) {
  try {
    const fs = await import('fs');
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return new ManifestValidator(manifest).getReport();
  } catch (error) {
    return { isValid: false, score: 0, errors: [`Failed to load manifest: ${error.message}`], warnings: [], summary: { totalErrors: 1, totalWarnings: 0, requiredFields: {}, recommendedFields: {}, optionalFields: {} } };
  }
}
export function validateManifest(manifest) { return new ManifestValidator(manifest).getReport(); }

export class ComponentRegistry {
  constructor() { this._registry = new Map(); }
  register(name, componentInstance) { this._registry.set(name, componentInstance); }
  get(name) { return this._registry.get(name); }
  unregister(name) { this._registry.delete(name); }
}

export async function runWithConcurrencyLimit(tasks, limit) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    const e = p.then(() => { const idx = executing.indexOf(e); if (idx >= 0) executing.splice(idx, 1); });
    executing.push(e);
    if (executing.length >= limit) await Promise.race(executing);
  }
  return Promise.all(results);
}

export class DebugHistory {
  constructor(maxSize = 200) { this.maxSize = maxSize; this.history = []; }
  add(source, message, data = {}) {
    if (this.history.length >= this.maxSize) this.history.shift();
    this.history.push({ timestamp: performance.now(), source, message, data });
  }
  getHistory() { return this.history; }
  clear() { this.history = []; }
  format() {
    if (this.history.length === 0) return "No events recorded.";
    return this.history.map(entry => {
      const time = entry.timestamp.toFixed(2).padStart(8, ' ');
      const dataStr = Object.keys(entry.data).length > 0 ? ` | ${JSON.stringify(entry.data)}` : '';
      return `[${time}ms] [${entry.source.toUpperCase()}] ${entry.message}${dataStr}`;
    }).join('\n');
  }
}

export function bindEvents(container, eventMap, { signal } = {}) {
  const addOpts = signal ? { signal } : {};
  for (const [selector, config] of Object.entries(eventMap)) {
    const handlers = typeof config === "function" ? { click: config } : config;
    const elements = container.querySelectorAll(selector);
    elements.forEach((el) => { for (const [eventType, fn] of Object.entries(handlers)) el.addEventListener(eventType, fn, addOpts); });
  }
}

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
  if (!fixedDecimals) result = result.replace(/\.(\d*?)0+([KMBT])/, (_, digits, suffix) => digits ? `.${digits}${suffix}` : suffix);
  return result;
}
function formatNumber(num, places, fixedDecimals, style) {
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

export class Formatter {
  static number(value, options = {}) {
    const { style, places, fixedDecimals = false, infinitySymbol } = options;
    if (value === null || typeof value === "undefined") return "";
    const Decimal = getDecimal();
    if (value instanceof Decimal) return formatDecimal(value, places, fixedDecimals, style);
    const n = Number(value);
    if (!Number.isFinite(n)) return infinitySymbol ?? (Number.isNaN(n) ? "" : (n > 0 ? "Infinity" : "-Infinity"));
    return formatNumber(n, places, fixedDecimals, style);
  }
  static time(ms, useHtml = false) {
    if (!Number.isFinite(ms) || ms < 0) ms = 0;
    const s = Math.floor(ms / MS_PER_SECOND) % SECONDS_PER_MINUTE;
    const m = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE)) % SECONDS_PER_MINUTE;
    const h = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR)) % HOURS_PER_DAY;
    const d = Math.floor(ms / (MS_PER_SECOND * SECONDS_PER_MINUTE * MINUTES_PER_HOUR * HOURS_PER_DAY));
    const unit = (val, label) => useHtml ? `${val}<span class="time-unit">${label}</span>` : `${val}${label}`;
    const parts = [];
    if (d > 0) parts.push(unit(d, "d"));
    if (h > 0 || parts.length > 0) parts.push(unit(h, "h"));
    if (m > 0 || parts.length > 0) parts.push(unit(m, "m"));
    parts.push(unit(s, "s"));
    return parts.join(" ");
  }
}
export const Format = Formatter;
export const numFormat = (n, p, f) => Formatter.number(n, { places: p, fixedDecimals: f });
export const formatStatNum = (n) => Formatter.number(n, { places: 1 }) || "0";
export const formatPrestigeNumber = (n) => Formatter.number(n, { places: 2, infinitySymbol: "∞" });
export function formatTime(ms) { return Formatter.time(ms, true); }
export function formatDuration(ms, useHtml = false) { return Formatter.time(ms, useHtml); }
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

const isTestEnvStorage = () =>
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof global !== "undefined" && global.__VITEST__) ||
  (typeof window !== "undefined" && window.__VITEST__);

function safeDeserialize(raw) {
  if (typeof raw !== "string") return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) return superjsonParse(raw);
    return parsed;
  } catch { return raw; }
}

export const StorageAdapter = {
  async set(key, value) { try { if (!isTestEnvStorage() && typeof indexedDB === "undefined") return false; await set(key, superjsonStringify(value)); return true; } catch (err) { logger.log("error", "StorageAdapter", `Failed to set key ${key}`, err); return false; } },
  async get(key, schema = null) {
    try {
      if (!isTestEnvStorage() && typeof indexedDB === "undefined") return null;
      const raw = await get(key);
      if (raw == null) return null;
      const parsed = safeDeserialize(raw);
      if (schema) {
        if (parsed == null || typeof parsed !== "object") return null;
        const validation = schema.safeParse(parsed);
        if (!validation.success) { logger.log("warn", "StorageAdapter", `Zod Schema validation failed for ${key}`, prettifyError(validation.error)); return null; }
        return validation.data;
      }
      return parsed;
    } catch (err) { logger.log("error", "StorageAdapter", `Failed to get key ${key}`, err); return null; }
  },
  async getRaw(key, defaultValue = null) { try { if (!isTestEnvStorage() && typeof indexedDB === "undefined") return defaultValue; const raw = await get(key); return raw ?? defaultValue; } catch (err) { logger.log("error", "StorageAdapter", `Failed to get key ${key}`, err); return defaultValue; } },
  async setRaw(key, value) { try { if (!isTestEnvStorage() && typeof indexedDB === "undefined") return false; await set(key, typeof value === "string" ? value : JSON.stringify(value)); return true; } catch (err) { logger.log("error", "StorageAdapter", `Failed to set raw key ${key}`, err); return false; } },
  async remove(key) { try { if (!isTestEnvStorage() && typeof indexedDB === "undefined") return; await del(key); } catch (err) { logger.log("error", "StorageAdapter", `Failed to remove key ${key}`, err); } },
  async clearAll() { try { if (!isTestEnvStorage() && typeof indexedDB === "undefined") return; await clear(); } catch (err) { logger.log("error", "StorageAdapter", "Failed to clear storage", err); } },
};

export function serializeSave(obj) { return superjsonStringify(obj); }
export function deserializeSave(raw) {
  if (typeof raw !== "string") return raw;
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && "json" in parsed && "meta" in parsed) return superjsonParse(raw);
  return parsed;
}

export const on = (parentElement, selector, eventType, handler) => {
  if (!parentElement) return;
  parentElement.addEventListener(eventType, (event) => {
    const targetElement = event.target.closest(selector);
    if (targetElement && parentElement.contains(targetElement)) handler.call(targetElement, event);
  });
};

export const performance = (typeof window !== 'undefined' && window.performance) || { now: () => new Date().getTime() };

export function isTestEnv() {
  return (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') || (typeof global !== 'undefined' && global.__VITEST__) || (typeof window !== 'undefined' && window.__VITEST__);
}

export function getBasePath() {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) return '';
  try {
    const isGitHubPages = window.location.hostname && window.location.hostname.includes('github.io');
    if (isGitHubPages && window.location.pathname) {
      const pathParts = window.location.pathname.split('/');
      const repoName = pathParts.length > 1 && pathParts[1] ? pathParts[1] : '';
      return repoName ? `/${repoName}` : '';
    }
  } catch (_) {}
  return '';
}

export function getResourceUrl(resourcePath) {
  const basePath = getBasePath();
  if (resourcePath.startsWith('/')) return `${basePath}${resourcePath}`;
  return `${basePath}/${resourcePath}`;
}

let storageAvailable = null;
function isStorageAvailable() {
  if (storageAvailable !== null) return storageAvailable;
  try { const test = '__storage_test__'; localStorage.setItem(test, test); localStorage.removeItem(test); storageAvailable = true; } catch (e) { storageAvailable = false; }
  return storageAvailable;
}

function saveDataReplacer(_key, value) {
  if (typeof value === "bigint") return value.toString();
  if (value != null && typeof value === "object" && value instanceof getDecimal()) return value.toString();
  return value;
}

export const StorageUtils = {
  get(key, defaultValue = null) { if (!isStorageAvailable()) return defaultValue; try { const raw = localStorage.getItem(key); if (raw === null) return defaultValue; try { return deserializeSave(raw); } catch (_) { return raw; } } catch (e) { return defaultValue; } },
  set(key, value) { if (!isStorageAvailable()) return false; try { const str = (typeof value === "object" && value !== null) || typeof value === "bigint" ? superjsonStringify(value) : JSON.stringify(value); localStorage.setItem(key, str); return true; } catch (e) { return false; } },
  remove(key) { if (!isStorageAvailable()) return false; try { localStorage.removeItem(key); return true; } catch (e) { return false; } },
  getRaw(key, defaultValue = null) { if (!isStorageAvailable()) return defaultValue; try { const value = localStorage.getItem(key); return value !== null ? value : defaultValue; } catch (e) { return defaultValue; } },
  setRaw(key, value) { if (!isStorageAvailable()) return false; try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
  serialize(obj, space) { return JSON.stringify(obj, saveDataReplacer, space ?? undefined); },
};

const SAVE_SLOT1_KEY = "reactorGameSave_1";
const SAVE_PREVIOUS_KEY = "reactorGameSave_Previous";
const SAVE_BACKUP_KEY = "reactorGameSave_Backup";
const MIGRATION_KEYS = ["reactorGameSave", "reactorGameSave_1", "reactorGameSave_2", "reactorGameSave_3", "reactorGameSave_Previous", "reactorGameSave_Backup", "reactorCurrentSaveSlot"];

export async function migrateLocalStorageToIndexedDB() {
  if (typeof indexedDB === "undefined" || !isStorageAvailable()) return;
  try {
    for (const key of MIGRATION_KEYS) {
      const fromLS = localStorage.getItem(key);
      if (fromLS === null) continue;
      const fromIDB = await StorageAdapter.getRaw(key);
      if (fromIDB != null) continue;
      await StorageAdapter.setRaw(key, fromLS);
    }
  } catch (_) {}
}

export function rotateSlot1ToBackup(value) {
  if (!isStorageAvailable()) return false;
  try {
    const current = StorageUtils.getRaw(SAVE_SLOT1_KEY);
    const previous = StorageUtils.getRaw(SAVE_PREVIOUS_KEY);
    if (previous != null) StorageUtils.setRaw(SAVE_BACKUP_KEY, previous);
    if (current != null) StorageUtils.setRaw(SAVE_PREVIOUS_KEY, current);
    StorageUtils.setRaw(SAVE_SLOT1_KEY, value);
    return true;
  } catch (e) { return false; }
}

export function getBackupSaveForSlot1() { return StorageUtils.getRaw(SAVE_BACKUP_KEY); }

export function setSlot1FromBackup() {
  const backup = StorageUtils.getRaw(SAVE_BACKUP_KEY);
  if (backup == null) return false;
  StorageUtils.setRaw(SAVE_SLOT1_KEY, backup);
  return true;
}

export const StorageUtilsAsync = {
  async get(key, defaultValue = null) { const result = await StorageAdapter.get(key); return result ?? defaultValue; },
  async set(key, value) { await StorageAdapter.set(key, value); },
  async remove(key) { await StorageAdapter.remove(key); },
  async getRaw(key, defaultValue = null) { return await StorageAdapter.getRaw(key, defaultValue); },
  async setRaw(key, value) { await StorageAdapter.setRaw(key, value); },
};

export async function rotateSlot1ToBackupAsync(value) {
  try {
    const current = await StorageAdapter.getRaw(SAVE_SLOT1_KEY);
    const previous = await StorageAdapter.getRaw(SAVE_PREVIOUS_KEY);
    if (previous != null) await StorageAdapter.setRaw(SAVE_BACKUP_KEY, previous);
    if (current != null) await StorageAdapter.setRaw(SAVE_PREVIOUS_KEY, current);
    await StorageAdapter.setRaw(SAVE_SLOT1_KEY, value);
    return true;
  } catch (_) { return false; }
}

export async function getBackupSaveForSlot1Async() { return await StorageAdapter.getRaw(SAVE_BACKUP_KEY); }

export async function setSlot1FromBackupAsync() {
  const backup = await StorageAdapter.getRaw(SAVE_BACKUP_KEY);
  if (backup == null) return false;
  await StorageAdapter.setRaw(SAVE_SLOT1_KEY, backup);
  return true;
}

export const timeFormat = (ms) => formatDuration(ms, false);

export const VALVE_OVERFLOW_THRESHOLD = 0.8;
export const VALVE_TOPUP_THRESHOLD = 0.2;
export const REACTOR_HEAT_STANDARD_DIVISOR = 10000;
export const TICKS_FULL_CYCLE = 10000;
export const TICKS_10PCT = 1000;
export const CRITICAL_HEAT_RATIO = 0.85;
export const REFERENCE_POWER = 20;
export const OVERRIDE_DURATION_MS = 10000;
export const HEAT_PAYLOAD_MAX_INLETS = 32;
export const HEAT_PAYLOAD_MAX_VALVES = 32;
export const HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS = 256;
export const HEAT_PAYLOAD_MAX_EXCHANGERS = 64;
export const HEAT_PAYLOAD_MAX_OUTLETS = 32;
export const HEAT_TRANSFER_MAX_ITERATIONS = 10000;
export const GRID_SIZE_NO_SAB_THRESHOLD = 2500;
export const WORKER_HEARTBEAT_MS = 2000;
export const WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK = 3;
export const UPGRADE_MAX_LEVEL = 32;

export const AUTONOMIC_REPAIR_POWER_COST = 50;
export const AUTONOMIC_REPAIR_POWER_MIN = 50;
export const EP_HEAT_SAFE_CAP = 1e100;
export const EP_CHANCE_LOG_BASE = 10;
export const HEAT_REMOVAL_TARGET_RATIO = 0.1;
export const MULTIPLIER_FLOOR = 0.001;
export const MAX_EP_EMIT_PER_TICK = 5;

export const FLUX_ACCUMULATOR_POWER_RATIO_MIN = 0.90;
export const FLUX_ACCUMULATOR_EP_RATE = 0.0001;
export const REALITY_FLUX_RATE_PROTIUM = 0.0005;
export const REALITY_FLUX_RATE_NEFASTIUM = 0.001;
export const REALITY_FLUX_RATE_BLACK_HOLE = 0.002;

export const VISUAL_PARTICLE_HIGH_THRESHOLD = 200;
export const VISUAL_PARTICLE_MED_THRESHOLD = 50;
export const VISUAL_PARTICLE_HIGH_COUNT = 3;
export const VISUAL_PARTICLE_MED_COUNT = 2;

export const PAUSED_POLL_MS = 500;

export const DEFAULT_OVERFLOW_RATIO = 0.5;
export const DEFAULT_POWER_MULTIPLIER = 1;
export const DEFAULT_SELL_PRICE_MULTIPLIER = 1;
export const VENT_BONUS_PERCENT_DIVISOR = 100;

export const BASE_MAX_HEAT = 1000;
export const BASE_MAX_POWER = 100;
export const MELTDOWN_HEAT_MULTIPLIER = 2;
export const CLASSIFICATION_HISTORY_MAX = 10;
export const MARK_II_E_THRESHOLD_CYCLES = 16;
export const MAX_SUBCLASS_CYCLES = 15;
export const REFLECTOR_COOLING_MIN_MULTIPLIER = 0.1;
export const HEAT_POWER_LOG_CAP = 1e100;
export const HEAT_POWER_LOG_BASE = 1000;
export const PERCENT_DIVISOR = 100;

export const MAX_TEST_FRAMES = 200;
export const SESSION_UPDATE_INTERVAL_MS = 60000;
export const MAX_VISUAL_EVENTS = 500;
export const HEAT_CALC_POOL_SIZE = 500;

export const MAX_TICKS_PER_FRAME_NO_SAB = 2;
export const SLOW_MODE_TICKS_PER_FRAME = 2;
export const GAME_LOOP_WORKER_MIN_TICKS = 3;
export const TIME_FLUX_CHUNK_TICKS = 100;
export const SAMPLE_TICKS = 5;
export const OFFLINE_TIME_THRESHOLD_MS = 30000;
export const MAX_ACCUMULATOR_MULTIPLIER = 100;
export const HEAT_SAFETY_STOP_THRESHOLD = 0.9;
export const ACCUMULATOR_EPSILON = 0.001;
export const MAX_LIVE_TICKS = 10;
export const WELCOME_BACK_FF_MAX_TICKS = 100;
export const MAX_CATCHUP_TICKS = 500;

export const MAX_GRID_DIMENSION = 50;
export const BASE_LOOP_WAIT_MS = 1000;
export const BASE_MONEY = 10;
export const MOBILE_BREAKPOINT_PX = 900;
export const RESIZE_DELAY_MS = 50;

export const PRESTIGE_MULTIPLIER_PER_EP = 0.001;
export const PRESTIGE_MULTIPLIER_CAP = 100;
export const RESPEC_DOCTRINE_EP_COST = 50;
export const FAILSAFE_MONEY_THRESHOLD = 10;

export const BASE_COLS_MOBILE = 10;
export const BASE_COLS_DESKTOP = 12;
export const BASE_ROWS_MOBILE = 14;
export const BASE_ROWS_DESKTOP = 12;

export const DEFAULT_AUTOSAVE_INTERVAL_MS = 30000;

export const HEAT_TRANSFER_DIFF_DIVISOR = 2;
export const HEAT_EPSILON = 0.001;
export const EXCHANGER_MIN_HEADROOM = 1;
export const EXCHANGER_MIN_TRANSFER_UNIT = 1;

export const GRID_TARGET_TOTAL_TILES = 144;
export const GRID_MIN_DIMENSION = 6;
export const GRID_MAX_DISPLAY_DIMENSION = 20;
export const ZOOM_DAMPING_FACTOR = 0.24;
export const PINCH_DISTANCE_THRESHOLD_PX = 10;
export const MOMENTUM_DECAY_FACTOR = 0.92;
export const SNAP_BACK_THRESHOLD_RATIO = 0.4;
export const SNAP_BACK_SPRING_CONSTANT = 0.12;
export const ZOOM_SCALE_MIN = 0.5;
export const ZOOM_SCALE_MAX = 2.0;

export const MAX_PART_VARIANTS = 6;

export function getIndex(row, col, cols) {
  return row * cols + col;
}

export function isInBounds(nr, nc, rows, cols) {
  return nr >= 0 && nr < rows && nc >= 0 && nc < cols;
}

export function getNeighborKeys(r, c) {
  return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
}

export function areAdjacent(tile1, tile2) {
  if (!tile1 || !tile2) return false;
  const dx = Math.abs(tile1.col - tile2.col);
  const dy = Math.abs(tile1.row - tile2.row);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
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

export function clampHeat(heat, maxHeat) {
  if (heat > maxHeat && maxHeat > 0) return maxHeat;
  if (heat < 0) return 0;
  return heat;
}

export function clampHeatDecimal(heat, maxHeat) {
  if (heat.gt(maxHeat) && maxHeat.gt(0)) return maxHeat;
  if (heat.lt(0)) return heat.constructor(0);
  return heat;
}

export const GRID = {
  defaultRows: 12,
  defaultCols: 12,
  defaultTileSize: 48,
  imageCacheMax: 128,
};

export const COLORS = {
  tileBg: "rgb(20 20 20)",
  tileStroke: "rgb(30 30 30)",
  heatBarBg: "rgba(0,0,0,0.85)",
  heatBarFill: "rgb(231 76 60)",
  durabilityBarFill: "rgb(89 196 53)",
  boostPulse: (a) => `rgba(128, 0, 255, ${a})`,
  explosionGlow: (a) => `rgba(255, 90, 40, ${a})`,
  explosionStroke: (a) => `rgba(255, 120, 60, ${a})`,
  sellingFill: "rgba(255, 200, 80, 0.25)",
  sellingStroke: "rgba(255, 180, 60, 0.9)",
  highlightFill: "rgba(100, 180, 255, 0.2)",
  highlightStroke: "rgba(100, 180, 255, 0.7)",
  hoverFill: "rgba(255, 255, 255, 0.08)",
  hoverStroke: "rgba(255, 255, 255, 0.35)",
  heatFlowArrow: "rgba(255,120,40,0.85)",
  heatFlowArrowHead: "rgba(255,120,40,0.9)",
  shimmerTint: (a) => `rgba(255, 200, 120, ${a})`,
};

export const HEAT_MAP = {
  blobRadiusRatio: 0.42,
  baseAlpha: 0.15,
  alphaRange: 0.55,
};

export const HEAT_SHIMMER = {
  threshold: 0.35,
  baseAlphaMultiplier: 0.06,
  layerCount: 3,
  phaseSpacing: 0.6,
  timeScale: 0.002,
};

export const HEAT_HAZE = {
  threshold: 0.5,
  riseSpeedPx: 0.08,
  wobbleFreq: 0.003,
  maxRadiusRatio: 0.85,
};

export const HEAT_FLOW = {
  maxAmountForSpeed: 500,
  baseSpeed: 0.4,
  speedAmountScale: 2,
  arrowStrokeColor: "rgba(255,120,40,0.85)",
  arrowHeadColor: "rgba(255,120,40,0.9)",
  pulseColor: (a) => `rgba(255,180,80,${Math.min(1, a)})`,
  pulseLen: 0.2,
  pulseCount: 2,
};

export const SINGULARITY = {
  blackHoleAlpha: 0.85,
  innerTint: "rgba(40, 20, 80, 0.5)",
  midTint: "rgba(80, 40, 120, 0.2)",
  ringBaseAlpha: 0.25,
  ringPulseAmplitude: 0.15,
  ringTimeScale: 0.008,
  orbitTimeScale: 0.002,
};

export const OVERHEAT_VISUAL = {
  heatRatioThreshold: 0.9,
  wiggleFreq: 0.008,
  wiggleAmplitude: 2,
  strokeBaseAlpha: 0.4,
  strokePulseAmplitude: 0.2,
  strokePulseFreq: 0.012,
  lineWidth: 2,
};

export const BAR = {
  barHeightRatio: 5 / 48,
  minBarHeight: 2,
};

export const NumericLike = z.union([z.number(), z.string()]);
export const DecimalLike = z.union([
  z.number(),
  z.string(),
  z.custom((v) => v == null || (typeof v?.gte === "function")),
]);
export const GridCoordinate = z.number().int().min(0);

export const DecimalSchema = NumericLike.transform((v) => (v != null && v !== "" ? toDecimal(v) : toDecimal(0)));

export const SaveDecimalSchema = z
  .union([DecimalLike, z.undefined()])
  .transform((v) => (v != null && v !== "" ? toDecimal(v) : toDecimal(0)));

export const ObjectiveIndexSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    if (v === undefined || v === null) return 0;
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? 0 : Math.floor(n);
  });

export const NumericToNumber = DecimalLike.transform((v) => (v != null && v !== "" ? toDecimal(v).toNumber() : undefined));

export const TechTreeDoctrineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    shortTitle: z.string().optional(),
    subtitle: z.string().optional(),
    playstyle: z.string().optional(),
    focus: z.string().optional(),
    mechanics: z.array(z.string()).optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    upgrades: z.array(z.string()),
    bonuses: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const TechTreeSchema = z.array(TechTreeDoctrineSchema);

export const ObjectiveDefinitionSchema = z
  .object({
    title: z.string(),
    flavor_text: z.string().optional(),
    reward: z.number().optional(),
    ep_reward: z.number().optional(),
    checkId: z.string(),
    isChapterCompletion: z.boolean().optional(),
  })
  .strict();

export const ObjectiveListSchema = z.array(ObjectiveDefinitionSchema);

export const GameDimensionsSchema = z.object({
  base_cols: z.number().int().min(1).default(12),
  base_rows: z.number().int().min(1).default(12),
});

export const DifficultyPresetSchema = z.object({
  base_money: z.union([z.number(), z.string()]),
  base_max_heat: z.union([z.number(), z.string()]),
  base_max_power: z.union([z.number(), z.string()]),
  base_loop_wait: z.union([z.number(), z.string()]),
  base_manual_heat_reduce: z.union([z.number(), z.string()]),
  power_overflow_to_heat_pct: z.union([z.number(), z.string()]),
});

const HelpTextSectionSchema = z.record(z.string(), z.union([z.string(), z.object({ title: z.string(), content: z.string() }).passthrough()]));
export const HelpTextSchema = z.record(z.string(), HelpTextSectionSchema);

export const VersionSchema = z.object({
  version: z.string().optional().default("Unknown"),
}).passthrough();

export const PartDefinitionSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  category: z.string(),
  base_cost: DecimalSchema.optional().default(0),
  base_ecost: DecimalSchema.optional().default(0),
  cell_tick_upgrade_cost: DecimalSchema.optional(),
  cell_power_upgrade_cost: DecimalSchema.optional(),
  cell_perpetual_upgrade_cost: DecimalSchema.optional(),
  levels: z.number().int().min(1).optional(),
  level: z.number().int().min(1).optional().default(1),
  base_power: z.number().optional().default(0),
  base_heat: z.number().optional().default(0),
  base_ticks: z.number().optional().default(0),
  base_containment: z.number().optional(),
  base_vent: z.number().optional().default(0),
  base_transfer: z.number().optional().default(0),
  base_reactor_power: z.number().optional().default(0),
  base_reactor_heat: z.number().optional().default(0),
  base_power_increase: z.number().optional().default(0),
  base_heat_increase: z.number().optional().default(0),
  base_range: z.number().optional().default(1),
  base_ep_heat: z.number().optional().default(0),
  base_description: z.string().optional().default(""),
  erequires: z.string().optional().nullable(),
  experimental: z.boolean().optional().default(false),
  location: z.string().optional().nullable(),
  valve_group: z.string().optional().nullable(),
  activation_threshold: z.union([z.number(), z.string()]).optional().nullable(),
  transfer_direction: z.string().optional().nullable(),
  cell_count: z.number().optional().default(0),
  cost_multi: z.number().optional().default(1),
  ticks_multiplier: z.number().optional(),
  containment_multi: z.number().optional(),
  reactor_power_multi: z.number().optional(),
  reactor_heat_multiplier: z.number().optional(),
  vent_multiplier: z.number().optional(),
  transfer_multiplier: z.number().optional(),
  power_increase_add: z.number().optional(),
  containment_multiplier: z.number().optional(),
  ep_heat_multiplier: z.number().optional(),
  cell_tick_upgrade_multi: z.number().optional(),
  cell_power_upgrade_multi: z.number().optional(),
}).strict();

export const UpgradeDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  cost: DecimalSchema.optional().default(0),
  type: z.string(),
  multiplier: z.number().optional().default(1.5),
  levels: z.number().int().min(1).optional(),
  ecost: DecimalSchema.optional().default(0),
  ecost_multiplier: z.number().optional().default(1.5),
  erequires: z.string().optional(),
  actionId: z.string().optional(),
  category: z.string().optional(),
  icon: z.string().optional(),
  classList: z.array(z.string()).optional().default([]),
  part_level: z.number().int().min(1).optional(),
}).strict();

export const TileSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  partId: z.string(),
  ticks: z.number().optional().default(0),
  heat_contained: z.number().optional().default(0),
});

const ReactorStateSchema = z.object({
  current_heat: SaveDecimalSchema.optional().default(toDecimal(0)),
  current_power: SaveDecimalSchema.optional().default(toDecimal(0)),
  has_melted_down: z.boolean().optional(),
  base_max_heat: NumericToNumber.optional(),
  base_max_power: NumericToNumber.optional(),
  altered_max_heat: NumericToNumber.optional(),
  altered_max_power: NumericToNumber.optional(),
}).passthrough();

const UpgradeStateSchema = z.object({
  id: z.string(),
  level: z.number().int().min(0),
});

const InfiniteObjectiveSchema = z
  .object({
    title: z.string().optional(),
    checkId: z.string().optional(),
    target: z.unknown().optional(),
    reward: z.unknown().optional(),
    completed: z.boolean().optional(),
    _lastInfinitePowerTarget: z.number().optional(),
    _lastInfiniteHeatMaintain: z.number().optional(),
    _lastInfiniteMoneyThorium: z.number().optional(),
    _lastInfiniteHeat: z.number().optional(),
    _lastInfiniteEP: z.number().optional(),
    _infiniteChallengeIndex: z.number().optional(),
    _infiniteCompletedCount: z.number().optional(),
  })
  .passthrough()
  .optional();

export const SaveDataSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== "object") return raw;
  const data = { ...raw };
  if (!data.version) data.version = "1.0.0";
  if (data.tiles && Array.isArray(data.tiles) && data.tiles.length > 0) {
    const first = data.tiles[0];
    if (Array.isArray(first)) {
      const migrated = [];
      (data.tiles || []).forEach((row, r) => {
        (row || []).forEach((cell, c) => {
          if (cell && (cell.partId || cell.id)) {
            migrated.push({
              row: r,
              col: c,
              partId: cell.partId ?? cell.id,
              ticks: cell.ticks ?? 0,
              heat_contained: cell.heat_contained ?? 0,
            });
          }
        });
      });
      data.tiles = migrated;
    }
  }
  return data;
}, z.object({
  version: z.string().optional().default("1.0.0"),
  current_money: SaveDecimalSchema.optional().default(toDecimal(0)),
  rows: z.number().int().min(1).optional().default(12),
  cols: z.number().int().min(1).optional().default(12),
  run_id: z
    .union([z.string(), z.undefined()])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : crypto.randomUUID()))
    .catch(() => crypto.randomUUID()),
  tech_tree: z.string().optional().nullable(),
  protium_particles: z.number().catch(0).optional().default(0),
  total_exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  current_exotic_particles: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  reality_flux: SaveDecimalSchema.catch(toDecimal(0)).optional().default(toDecimal(0)),
  sold_power: z.boolean().optional().default(false),
  sold_heat: z.boolean().optional().default(false),
  grace_period_ticks: z.number().optional().default(0),
  total_played_time: z.number().optional().default(0),
  last_save_time: z.number().optional().nullable(),
  base_rows: z.number().optional().default(12),
  base_cols: z.number().optional().default(12),
  reactor: ReactorStateSchema.optional(),
  placedCounts: z.record(z.string(), z.number()).catch({}).optional().default({}),
  tiles: z.array(TileSchema).catch([]).default([]),
  upgrades: z.array(UpgradeStateSchema).catch([]).default([]),
  objectives: z.object({
    current_objective_index: ObjectiveIndexSchema,
    completed_objectives: z.array(z.union([z.boolean(), z.null(), z.undefined()]).transform((v) => v === true)).optional().default([]),
    infinite_objective: InfiniteObjectiveSchema,
  }).passthrough().catch({}).optional().default({}),
  toggles: z.record(z.string(), z.unknown()).catch({}).optional().default({}),
  quick_select_slots: z.array(z.unknown()).catch([]).optional().default([]),
  ui: z.object({}).passthrough().catch({}).optional().default({}),
}).passthrough());

const ArrayBufferLike = typeof SharedArrayBuffer !== "undefined"
  ? z.union([z.instanceof(ArrayBuffer), z.instanceof(SharedArrayBuffer)])
  : z.instanceof(ArrayBuffer);

const GameLoopPartRowSchema = z.object({
  id: z.string(),
  containment: z.number().optional().default(0),
  vent: z.number().optional().default(0),
  power: z.number().optional().default(0),
  heat: z.number().optional().default(0),
  category: z.string().optional().default(""),
  ticks: z.number().optional().default(0),
  type: z.string().optional().default(""),
  ep_heat: z.number().optional().default(0),
  level: z.number().optional().default(1),
  transfer: z.number().optional().default(0),
}).passthrough();

const GameLoopLayoutRowSchema = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  partIndex: z.number().int().min(0),
  ticks: z.number().optional().default(0),
  activated: z.boolean().optional().default(false),
  transferRate: z.number().optional().default(0),
  ventRate: z.number().optional().default(0),
}).passthrough();

const GameLoopReactorStateSchema = z.object({
  current_heat: z.union([z.number(), z.any()]).optional().default(0),
  current_power: z.union([z.number(), z.any()]).optional().default(0),
  max_heat: z.number().optional().default(0),
  max_power: z.number().optional().default(0),
  auto_sell_multiplier: z.number().optional().default(0),
  sell_price_multiplier: z.number().optional().default(1),
  power_overflow_to_heat_ratio: z.number().optional().default(0.5),
  power_multiplier: z.number().optional().default(1),
  heat_controlled: z.number().optional().default(0),
  vent_multiplier_eff: z.number().optional().default(0),
  stirling_multiplier: z.number().optional().default(0),
}).passthrough();

export const GameLoopTickInputSchema = z.object({
  type: z.literal("tick"),
  tickId: z.number().int().min(1),
  tickCount: z.number().int().min(1).optional().default(1),
  multiplier: z.number().optional().default(1),
  heatBuffer: ArrayBufferLike,
  partLayout: z.array(GameLoopLayoutRowSchema),
  partTable: z.array(GameLoopPartRowSchema),
  reactorState: GameLoopReactorStateSchema,
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  maxCols: z.number().int().min(1).optional(),
  autoSell: z.boolean().optional().default(false),
  current_money: z.union([z.number(), z.string()]).optional(),
}).passthrough();

export const GameLoopTickResultSchema = z.object({
  type: z.literal("tickResult").optional(),
  tickId: z.number().int().min(0),
  reactorHeat: z.number().optional().default(0),
  reactorPower: z.number().optional().default(0),
  explosionIndices: z.array(z.number().int().min(0)).optional().default([]),
  depletionIndices: z.array(z.number().int().min(0)).optional().default([]),
  tileUpdates: z.array(z.object({ r: z.number().int(), c: z.number().int(), ticks: z.number() })).optional().default([]),
  moneyEarned: z.number().optional().default(0),
  powerDelta: z.number().optional().default(0),
  heatDelta: z.number().optional().default(0),
  tickCount: z.number().int().min(1).optional().default(1),
  transfers: z.array(z.unknown()).optional().default([]),
  error: z.boolean().optional(),
}).passthrough();

export const PhysicsTickInputSchema = z.object({
  heatBuffer: ArrayBufferLike,
  containmentBuffer: ArrayBufferLike.optional(),
  reactorHeat: z.number().optional().default(0),
  multiplier: z.number().optional().default(1),
  tickId: z.number().int().min(0),
  useSAB: z.boolean().optional(),
  rows: z.number().int().min(1).optional(),
  cols: z.number().int().min(1).optional(),
  nInlets: z.number().int().min(0).optional().default(0),
  nValves: z.number().int().min(0).optional().default(0),
  nValveNeighbors: z.number().int().min(0).optional().default(0),
  nExchangers: z.number().int().min(0).optional().default(0),
  nOutlets: z.number().int().min(0).optional().default(0),
  inletsData: z.any().optional(),
  valvesData: z.any().optional(),
  valveNeighborData: z.any().optional(),
  exchangersData: z.any().optional(),
  outletsData: z.any().optional(),
}).passthrough();

export const PhysicsTickResultSchema = z.object({
  reactorHeat: z.number().optional().default(0),
  heatFromInlets: z.number().optional().default(0),
  transfers: z.array(z.object({ fromIdx: z.number(), toIdx: z.number(), amount: z.number() })).optional().default([]),
  explosionIndices: z.array(z.number().int().min(0)).optional().default([]),
  tickId: z.number().int().min(0),
  useSAB: z.boolean().optional(),
  heatBuffer: z.any().optional(),
  containmentBuffer: z.any().optional(),
  inletsData: z.any().optional(),
  valvesData: z.any().optional(),
  valveNeighborData: z.any().optional(),
  exchangersData: z.any().optional(),
  outletsData: z.any().optional(),
}).passthrough();

const BlueprintPartSchema = z.object({
  r: z.number().int().min(0),
  c: z.number().int().min(0),
  t: z.string(),
  id: z.string(),
  lvl: z.number().int().min(1).optional().default(1),
});

export const BlueprintSchema = z.object({
  size: z.object({
    rows: z.number().int().min(1),
    cols: z.number().int().min(1),
  }),
  parts: z.array(BlueprintPartSchema),
});

export const LegacyGridSchema = z.array(z.array(z.unknown())).min(1);

const ComponentExplosionPayloadSchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  partId: z.string().optional(),
}).passthrough();

const MeltdownPayloadSchema = z.object({
  hasMeltedDown: z.boolean().optional(),
}).passthrough();

const VibrationRequestPayloadSchema = z.object({
  type: z.enum(["heavy", "meltdown", "doublePulse"]).optional(),
}).passthrough();

const SaveLoadedPayloadSchema = z.object({
  toggles: z.record(z.string(), z.unknown()).optional(),
  quick_select_slots: z.array(z.unknown()).optional(),
}).passthrough();

const ExoticParticlesChangedPayloadSchema = z.object({}).passthrough();

const ToggleStateChangedPayloadSchema = z.object({
  toggleName: z.string(),
  value: z.unknown(),
}).passthrough();

const ReactorTickPayloadSchema = z.object({
  current_heat: z.union([z.number(), z.any()]).optional(),
  current_power: z.union([z.number(), z.any()]).optional(),
}).passthrough();

const TimeFluxPayloadSchema = z.object({
  queuedTicks: z.number().optional(),
  progress: z.number().optional(),
  isCatchingUp: z.boolean().optional(),
  deltaTime: z.number().optional(),
}).passthrough();

const MoneyChangedPayloadSchema = z.object({
  current_money: z.any().optional(),
}).passthrough();

const StatePatchPayloadSchema = z.object({
  loop_wait: z.number().optional(),
  manual_heat_reduce: z.number().optional(),
}).passthrough();

export const EVENT_SCHEMA_REGISTRY = {
  component_explosion: ComponentExplosionPayloadSchema,
  meltdown: MeltdownPayloadSchema,
  meltdownResolved: MeltdownPayloadSchema,
  meltdownStarted: z.object({}).passthrough(),
  vibrationRequest: VibrationRequestPayloadSchema,
  saveLoaded: SaveLoadedPayloadSchema,
  exoticParticlesChanged: ExoticParticlesChangedPayloadSchema,
  toggleStateChanged: ToggleStateChangedPayloadSchema,
  reactorTick: ReactorTickPayloadSchema,
  powerSold: z.object({}).passthrough(),
  clearAnimations: z.object({}).passthrough(),
  clearImageCache: z.object({}).passthrough(),
  layoutPasted: z.object({ layout: z.any() }).passthrough(),
  gridResized: z.object({}).passthrough(),
  grid_changed: z.object({}).passthrough(),
  tickRecorded: z.object({}).passthrough(),
  timeFluxButtonUpdate: TimeFluxPayloadSchema,
  timeFluxSimulationUpdate: TimeFluxPayloadSchema,
  welcomeBackOffline: TimeFluxPayloadSchema,
  moneyChanged: MoneyChangedPayloadSchema,
  statePatch: StatePatchPayloadSchema,
  quickSelectSlotsChanged: z.object({ slots: z.array(z.unknown()).optional() }).passthrough(),
  upgradePurchased: z.object({ upgrade: z.any().optional() }).passthrough(),
  heatWarning: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
  pipeIntegrityWarning: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
  firstHighHeat: z.object({ heatRatio: z.number().optional(), tickCount: z.number().optional() }).passthrough(),
};

const TileRefSchema = z.custom((val) => val != null && typeof val.row === "number" && typeof val.col === "number");

const SellPartPayloadSchema = z.object({
  tile: TileRefSchema,
}).strict();

const LayoutCellSchema = z.object({
  id: z.string(),
  t: z.string().optional(),
  lvl: z.number().int().min(1).optional().default(1),
}).passthrough();

const LayoutGridSchema = z.array(z.array(z.union([LayoutCellSchema.nullable(), z.null()])));

const PasteLayoutPayloadSchema = z.object({
  layout: z.union([LayoutGridSchema, BlueprintSchema]),
  options: z.object({
    skipCostDeduction: z.boolean().optional().default(false),
  }).passthrough().optional().default({}),
}).strict();

export const ACTION_SCHEMA_REGISTRY = {
  sell: z.object({}).strict(),
  manualReduceHeat: z.object({}).strict(),
  pause: z.object({}).strict(),
  resume: z.object({}).strict(),
  togglePause: z.object({}).strict(),
  rebootKeepEp: z.object({}).strict(),
  rebootDiscardEp: z.object({}).strict(),
  reboot: z.object({}).strict(),
  sellPart: SellPartPayloadSchema,
  pasteLayout: PasteLayoutPayloadSchema,
};

const GameActionTypeSchema = z.enum(["sell", "manualReduceHeat", "pause", "resume", "togglePause", "rebootKeepEp", "rebootDiscardEp", "reboot", "sellPart", "pasteLayout"]);

export const GameActionSchema = z.object({
  type: GameActionTypeSchema,
  payload: z.record(z.string(), z.unknown()).optional().default({}),
});

export const UserPreferencesSchema = z.object({
  mute: z.boolean().optional().default(false),
  reducedMotion: z.boolean().optional().default(false),
  heatFlowVisible: z.boolean().optional().default(true),
  heatMapVisible: z.boolean().optional().default(false),
  debugOverlay: z.boolean().optional().default(false),
  forceNoSAB: z.boolean().optional().default(false),
  numberFormat: z.enum(["default", "scientific"]).optional().default("default"),
  volumeMaster: z.number().min(0).max(1).optional().default(0.25),
  volumeEffects: z.number().min(0).max(1).optional().default(0.5),
  volumeAlerts: z.number().min(0).max(1).optional().default(0.5),
  volumeSystem: z.number().min(0).max(1).optional().default(0.5),
  volumeAmbience: z.number().min(0).max(1).optional().default(0.12),
  hideUnaffordableUpgrades: z.boolean().optional().default(true),
  hideUnaffordableResearch: z.boolean().optional().default(true),
  hideMaxUpgrades: z.boolean().optional().default(true),
  hideMaxResearch: z.boolean().optional().default(true),
  hideOtherDoctrineUpgrades: z.boolean().optional().default(false),
}).passthrough();

export const BalanceConfigSchema = z.object({
  valveTopupCapRatio: z.number().min(0).max(1),
  autoSellMultiplierPerLevel: z.number().min(0),
  stirlingMultiplierPerLevel: z.number().min(0),
  defaultCostMultiplier: z.number().min(1),
  reflectorSellMultiplier: z.number().min(0),
  cellSellMultiplier: z.number().min(0),
  powerThreshold10k: z.number().min(0),
  marketLobbyingMultPerLevel: z.number().min(0),
  emergencyCoolantMultPerLevel: z.number().min(0),
  reflectorCoolingFactorPerLevel: z.number().min(0),
  insurancePercentPerLevel: z.number().min(0).max(1),
  manualOverrideMultPerLevel: z.number().min(0),
  convectiveBoostPerLevel: z.number().min(0),
  electroThermalBaseRatio: z.number().min(0),
  electroThermalStep: z.number().min(0),
  catalystReductionPerLevel: z.number().min(0).max(1),
  thermalFeedbackRatePerLevel: z.number().min(0),
  volatileTuningMaxPerLevel: z.number().min(0).max(1),
  platingTransferRatePerLevel: z.number().min(0).max(1),
  phlembotinumPowerBase: z.number().min(0),
  phlembotinumHeatBase: z.number().min(0),
  phlembotinumMultiplier: z.number().min(1),
}).passthrough();

export const BALANCE_POWER_THRESHOLD_10K = 10000;

const env = typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {};
const winConfig = typeof window !== "undefined" && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {};

export const USER_PREF_KEYS = {
  mute: "reactor_mute",
  reducedMotion: "reactor_reduced_motion",
  heatFlowVisible: "reactor_heat_flow_visible",
  heatMapVisible: "reactor_heat_map_visible",
  debugOverlay: "reactor_debug_overlay",
  forceNoSAB: "reactor_force_no_sab",
  numberFormat: "number_format",
};

export function getPref(key) { return StorageUtils.get(key); }
export function setPref(key, value) { return StorageUtils.set(key, value); }

export function getSupabaseUrl() {
  return env.VITE_SUPABASE_URL ?? winConfig.supabaseUrl ?? "";
}

export function getSupabaseAnonKey() {
  return env.VITE_SUPABASE_ANON_KEY ?? winConfig.supabaseAnonKey ?? "";
}

export function getGoogleDriveApiKey() {
  return env.VITE_GOOGLE_DRIVE_API_KEY ?? winConfig.googleDriveApiKey ?? "";
}

export function getGoogleDriveClientId() {
  return env.VITE_GOOGLE_DRIVE_CLIENT_ID ?? winConfig.googleDriveClientId ?? "";
}

export const GOOGLE_DRIVE_CONFIG = {
  SCOPES: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata",
  FALLBACK_SCOPES: "https://www.googleapis.com/auth/drive.file",
  ENABLE_GOOGLE_DRIVE: true
};

export function getGoogleDriveAuth() {
  return {
    API_KEY: getGoogleDriveApiKey(),
    CLIENT_ID: getGoogleDriveClientId(),
    ...GOOGLE_DRIVE_CONFIG
  };
}

export const UPDATE_TOAST_STYLES = `
  .update-toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #2a2a2a;
    border: 2px solid #4CAF50;
    border-radius: 8px;
    padding: 0;
    z-index: 10000;
    font-family: 'Minecraft', monospace;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    animation: toast-slide-up 0.3s ease-out;
    max-width: 400px;
    width: 90%;
  }
  .update-toast-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    gap: 12px;
  }
  .update-toast-message {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    color: #fff;
  }
  .update-toast-icon { font-size: 1.2em; }
  .update-toast-text { font-size: 0.9em; font-weight: 500; }
  .update-toast-button {
    background: #4CAF50;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-family: 'Minecraft', monospace;
    font-size: 0.8em;
    cursor: pointer;
    transition: background-color 0.2s;
    white-space: nowrap;
  }
  .update-toast-button:hover { background: #45a049; }
  .update-toast-close {
    background: transparent;
    color: #ccc;
    border: none;
    font-size: 1.2em;
    cursor: pointer;
    padding: 4px;
    line-height: 1;
    transition: color 0.2s;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .update-toast-close:hover { color: #fff; }
  @keyframes toast-slide-up {
    from { transform: translateX(-50%) translateY(100px); opacity: 0; }
    to { transform: translateX(-50%) translateY(0); opacity: 1; }
  }
  @media (max-width: 480px) {
    .update-toast {
      bottom: 10px;
      left: 10px;
      right: 10px;
      transform: none;
      max-width: none;
      width: auto;
    }
    .update-toast-content { padding: 10px 12px; gap: 8px; }
    .update-toast-text { font-size: 0.8em; }
    .update-toast-button { padding: 6px 12px; font-size: 0.75em; }
  }
`;
