const UNIT_LABELS = {
  CELL_COUNT: "Count",
  CELL_TYPE: "Type",
  POWER_UNITS: "Power",
  HEAT_UNITS: "Heat",
  CONTAINMENT_UNITS: "Containment",
  TRANSFER_UNITS: "Transfer",
  VENT_UNITS: "Vent",
  TICKS_UNITS: "Ticks",
  RANGE_UNITS: "Range",
  EP_HEAT_UNITS: "EP heat",
  REACTOR_POWER_UNITS: "Reactor power",
  REACTOR_HEAT_UNITS: "Reactor heat",
  POWER_INCREASE_UNITS: "Power increase",
  HEAT_INCREASE_UNITS: "Heat increase",
};

export function formatSemanticSegmentsForTooltip(segments, fmt, iconifyFn) {
  if (!segments?.length) return "";
  const iconify = typeof iconifyFn === "function" ? iconifyFn : (s) => s;
  const out = [];
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    if (s.kind === "text") {
      const label = UNIT_LABELS[s.unitKey] || s.unitKey;
      const line = `${label}: ${s.value}`;
      out.push(`<div class="tooltip-bullet">${iconify(line)}</div>`);
      continue;
    }
    const label = UNIT_LABELS[s.unitKey] || s.unitKey;
    const places = s.places;
    const n = typeof s.value === "number" ? s.value : Number(s.value);
    const formatted = typeof fmt === "function" ? fmt(n, places) : String(n);
    const line = `${label}: ${formatted}`;
    out.push(`<div class="tooltip-bullet">${iconify(line)}</div>`);
  }
  return out.join("");
}

export function semanticStatLine(key, value, fmt) {
  const unit = UNIT_LABELS[key] || key;
  const n = typeof value === "number" ? value : Number(value);
  const s = typeof fmt === "function" ? fmt(n) : String(n);
  return `${unit}: ${s}`;
}
