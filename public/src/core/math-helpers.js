import { toDecimal } from "../simUtils.js";
import { VU_LED_SEGMENTS } from "../constants/balance.js";

export function vuQuantizePercent(rawPercent, atMax) {
  if (atMax) return 100;
  const lit = Math.min(VU_LED_SEGMENTS, Math.max(0, Math.round((rawPercent / 100) * VU_LED_SEGMENTS)));
  return (lit / VU_LED_SEGMENTS) * 100;
}

export function vuLitFromPercent(rawPercent, atMax) {
  if (atMax) return VU_LED_SEGMENTS;
  return Math.min(VU_LED_SEGMENTS, Math.max(0, Math.round((rawPercent / 100) * VU_LED_SEGMENTS)));
}

export function vuHeatRedWidthPercent(vuLit, heatLedWarning) {
  if (!heatLedWarning || vuLit <= 13) return "0%";
  const fillPct = (vuLit / VU_LED_SEGMENTS) * 100;
  const redStart = (13 / VU_LED_SEGMENTS) * 100;
  return `${Math.max(0, fillPct - redStart)}%`;
}

export function vuSegmentRatio01(pct01) {
  const lit = Math.min(VU_LED_SEGMENTS, Math.max(0, Math.round(pct01 * VU_LED_SEGMENTS)));
  return lit / VU_LED_SEGMENTS;
}

export function safeAdd(a, b) {
  return toDecimal(a).add(toDecimal(b));
}

export function safeSub(a, b) {
  return toDecimal(a).sub(toDecimal(b));
}
