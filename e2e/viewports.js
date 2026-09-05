// Viewport matrix and render targets for the UI e2e sweep.
// Playwright turns each RESOLUTION into a project (see config/playwright.config.mjs),
// so specs read the active viewport from the project rather than setting it themselves.

export const RESOLUTIONS = [
  { key: "390x844", width: 390, height: 844, label: "phone" },
  { key: "576x960", width: 576, height: 960, label: "phablet" },
  { key: "768x1024", width: 768, height: 1024, label: "tablet" },
  { key: "1024x768", width: 1024, height: 768, label: "tablet-landscape" },
  { key: "1280x800", width: 1280, height: 800, label: "laptop" },
  { key: "1440x900", width: 1440, height: 900, label: "desktop" },
  { key: "1920x1080", width: 1920, height: 1080, label: "widescreen" },
];

// Viewport the single-run audits pin themselves to, so they execute once
// instead of once per project.
export const AUDIT_PROJECT_KEY = "1920x1080";

export const PAGE_TARGETS = [
  "reactor_section",
  "upgrades_section",
  "experimental_upgrades_section",
  "leaderboard_section",
  "about_section",
];

// Pages the console walkthrough visits but that have no meaningful render target.
export const EXTRA_CONSOLE_PAGES = [
  "soundboard_section",
  "privacy_policy_section",
  "terms_of_service_section",
];

export const MODAL_TARGETS = [
  {
    name: "settings",
    open: (page) =>
      page.evaluate(() => {
        window.__reactorAudit?.ui?.modalOrchestrator?.showModal?.("settings");
      }),
    close: (page) =>
      page.evaluate(() => {
        window.__reactorAudit?.ui?.modalOrchestrator?.hideModal?.("settings");
      }),
    waitFor: ".settings-modal-overlay, #modal-root .settings-modal",
  },
  {
    name: "quick_start",
    open: (page) =>
      page.evaluate(() => {
        const game = window.__reactorAudit?.game;
        window.__reactorAudit?.ui?.modalOrchestrator?.showModal?.("quickStart", { game });
      }),
    close: (page) =>
      page.evaluate(() => {
        window.__reactorAudit?.ui?.modalOrchestrator?.hideModal?.("quickStart");
      }),
    waitFor: "#quick-start-modal, .quick-start-overlay",
  },
];

export const SETTINGS_TAB_IDS = [
  "settings_tab_audio_btn",
  "settings_tab_visuals_btn",
  "settings_tab_system_btn",
  "settings_tab_data_btn",
];
