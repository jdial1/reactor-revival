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
