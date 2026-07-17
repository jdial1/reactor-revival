import path from "path";

export const BASELINE_DIR = path.resolve(
  process.env.SCREENSHOT_BASELINE_DIR || "screenshots/ui-baseline"
);
export const CURRENT_DIR = path.resolve(
  process.env.SCREENSHOT_CURRENT_DIR || "screenshots/ui-current"
);
export const DIFF_DIR = path.resolve(process.env.SCREENSHOT_DIFF_DIR || "screenshots/ui-diff");
export const DEFAULT_OUTPUT_DIR = path.resolve(process.env.SCREENSHOT_DIR || "screenshots/ui");

export const PRODUCTION_URL =
  process.env.PRODUCTION_URL || "https://jdial1.github.io/reactor-revival/";
export const PRODUCTION_REFERENCE_DIR = path.resolve(
  process.env.PRODUCTION_REFERENCE_DIR || "reference/production"
);
export const PRODUCTION_SCREENSHOT_DIR = path.resolve(
  process.env.PRODUCTION_SCREENSHOT_DIR || "screenshots/ui-production"
);

export const ALIGNMENT_RESOLUTION = { key: "1920x1080", width: 1920, height: 1080, label: "widescreen" };

export const PRE_GAME_TARGETS = [
  {
    name: "splash_screen",
    waitFor: "#splash-new-game-btn",
    rootSelector: "#splash-screen",
  },
  {
    name: "default_page",
    waitFor: "#app_root",
    rootSelector: "#app_root",
  },
];

export const RESOLUTIONS = [
  { key: "390x844", width: 390, height: 844, label: "phone" },
  { key: "576x960", width: 576, height: 960, label: "phablet" },
  { key: "768x1024", width: 768, height: 1024, label: "tablet" },
  { key: "1024x768", width: 1024, height: 768, label: "tablet-landscape" },
  { key: "1280x800", width: 1280, height: 800, label: "laptop" },
  { key: "1440x900", width: 1440, height: 900, label: "desktop" },
  { key: "1920x1080", width: 1920, height: 1080, label: "widescreen" },
];

export const PAGE_TARGETS = [
  "reactor_section",
  "upgrades_section",
  "experimental_upgrades_section",
  "leaderboard_section",
  "about_section",
];

export const MODAL_TARGETS = [
  {
    name: "settings",
    openKey: "settings",
    waitFor: ".settings-modal-overlay, #modal-root .settings-modal",
    scrollSettings: true,
  },
  {
    name: "quick_start",
    openKey: "quick_start",
    waitFor: "#quick-start-overlay:not(.hidden), .quick-start-modal, #modal-root .quick-start",
    scrollSettings: false,
  },
];

export function screenshotPath(outputDir, resolutionKey, targetName) {
  return path.join(outputDir, `${resolutionKey}_${targetName}.png`);
}

export function expectedScreenshotCount() {
  return RESOLUTIONS.length * (PAGE_TARGETS.length + MODAL_TARGETS.length);
}

export function listScreenshotNames(includePreGame = false) {
  const names = [];
  for (const resolution of RESOLUTIONS) {
    if (includePreGame) {
      for (const target of PRE_GAME_TARGETS) {
        names.push(`${resolution.key}_${target.name}.png`);
      }
    }
    for (const pageId of PAGE_TARGETS) {
      names.push(`${resolution.key}_${pageId}.png`);
    }
    for (const modal of MODAL_TARGETS) {
      names.push(`${resolution.key}_${modal.name}.png`);
    }
  }
  return names;
}

export function listAlignmentTargetNames() {
  return [
    ...PRE_GAME_TARGETS.map((t) => t.name),
    ...PAGE_TARGETS,
    ...MODAL_TARGETS.map((m) => m.name),
  ];
}
