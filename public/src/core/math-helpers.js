import { VU_LED_SEGMENTS } from "../constants/balance.js";

// The VU meter is a bar of discrete LED segments, so every readout quantises the
// same way and differs only in the unit it reports back.
const HEAT_RED_SEGMENT = 13;

function litSegments(ratio01) {
  return Math.min(VU_LED_SEGMENTS, Math.max(0, Math.round(ratio01 * VU_LED_SEGMENTS)));
}

export function vuLitFromPercent(rawPercent, atMax) {
  return atMax ? VU_LED_SEGMENTS : litSegments(rawPercent / 100);
}

export function vuQuantizePercent(rawPercent, atMax) {
  return atMax ? 100 : (litSegments(rawPercent / 100) / VU_LED_SEGMENTS) * 100;
}

export function vuSegmentRatio01(pct01) {
  return litSegments(pct01) / VU_LED_SEGMENTS;
}

// Width of the red overload zone, measured from the first red segment.
export function vuHeatRedWidthPercent(vuLit, heatLedWarning) {
  if (!heatLedWarning || vuLit <= HEAT_RED_SEGMENT) return "0%";
  const span = ((vuLit - HEAT_RED_SEGMENT) / VU_LED_SEGMENTS) * 100;
  return `${Math.max(0, span)}%`;
}
