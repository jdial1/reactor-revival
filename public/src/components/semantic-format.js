const UNIT_LABELS = {
  CELL_COUNT: "Count",
  CELL_TYPE: "Type",
  POWER_UNITS: "Power",
  HEAT_UNITS: "Heat",
  CONTAINMENT_UNITS: "Containment",
  TRANSFER_UNITS: "Transfer",
  VENT_UNITS: "Vent",
  STIRLING_POWER_UNITS: "Stirling Power",
  TICKS_UNITS: "Ticks",
  RANGE_UNITS: "Range",
  EP_HEAT_UNITS: "EP heat",
  REACTOR_POWER_UNITS: "Reactor power",
  REACTOR_HEAT_UNITS: "Reactor heat",
  POWER_INCREASE_UNITS: "Power increase",
  HEAT_INCREASE_UNITS: "Heat increase",
};

function unitLabel(unitKey) {
  return UNIT_LABELS[unitKey] || unitKey;
}

export function formatSemanticSegmentsForTooltip(segments, fmt, iconifyFn) {
  if (!segments?.length) return "";
  const iconify = typeof iconifyFn === "function" ? iconifyFn : (s) => s;
  return segments.map((s) => {
    const label = unitLabel(s.unitKey);
    const value =
      s.kind === "text"
        ? s.value
        : typeof fmt === "function"
          ? fmt(typeof s.value === "number" ? s.value : Number(s.value), s.places)
          : String(s.value);
    return `<div class="tooltip-bullet">${iconify(`${label}: ${value}`)}</div>`;
  }).join("");
}
