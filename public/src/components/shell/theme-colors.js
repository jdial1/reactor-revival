import { subscribe } from "valtio/vanilla";
import { preferences } from "../../state/preferences.js";

let cachedColors = null;

export function readThemeColor(name) {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function resetThemeColors() {
  cachedColors = null;
}

function rgbaFromRgb(rgbValue, alpha) {
  const trimmed = rgbValue.trim();
  if (!trimmed) return "";
  if (trimmed.includes("/")) {
    return trimmed.replace(/\/\s*[\d.]+%?\s*\)/, `/ ${alpha})`);
  }
  if (trimmed.startsWith("rgb(")) {
    return trimmed.replace(")", ` / ${alpha})`);
  }
  return trimmed;
}

function buildCanvasColors() {
  const v = readThemeColor;
  return {
    tileBg: v("--surface-gost"),
    tileStroke: v("--neutral-black"),
    tileMachinedLine: v("--canvas-tile-machined"),
    tileOccDropShadow: v("--canvas-shadow"),
    heatBarBg: v("--canvas-heat-bar-bg"),
    heatBarFill: v("--canvas-heat-fill"),
    durabilityBarFill: v("--canvas-durability-fill"),
    boostPulse: (a) => rgbaFromRgb(v("--canvas-boost"), a),
    explosionGlow: (a) => rgbaFromRgb(v("--canvas-explosion-glow"), a),
    explosionStroke: (a) => rgbaFromRgb(v("--canvas-explosion-stroke"), a),
    sellingFill: v("--canvas-selling-fill"),
    sellingStroke: v("--canvas-selling-stroke"),
    highlightFill: v("--canvas-highlight-fill"),
    highlightStroke: v("--canvas-highlight-stroke"),
    hoverFill: v("--canvas-hover-fill"),
    hoverStroke: v("--canvas-hover-stroke"),
    heatFlowArrow: v("--canvas-heat-flow"),
    heatFlowArrowHead: v("--canvas-heat-flow"),
    shimmerTint: (a) => rgbaFromRgb(v("--canvas-shimmer"), a),
  };
}

function getCanvasColors() {
  if (!cachedColors) cachedColors = buildCanvasColors();
  return cachedColors;
}

export const COLORS = new Proxy(
  {},
  {
    get(_target, prop) {
      const colors = getCanvasColors();
      const value = colors[prop];
      return typeof value === "function" ? value.bind(colors) : value;
    },
  }
);

const unsubs = [];

if (typeof window !== "undefined") {
  unsubs.push(subscribe(preferences, () => {
    resetThemeColors();
  }));
}
