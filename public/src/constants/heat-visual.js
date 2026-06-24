export { COLORS, getCanvasColors, readThemeColor, resetThemeColors } from "../theme-colors.js";

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
