import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  BASE_URL,
  HEADLESS,
  NAV_TIMEOUT_MS,
  PAGE_WAIT_MS,
  STEP_DELAY_MS,
  setLogPrefix,
  delay,
  logStep,
  bindDialogAccept,
  navigateToGamePage,
  prepareGameSession,
  openSettingsModal,
  closeSettingsModal,
  openQuickStartModal,
  closeQuickStartModal,
  waitForSelectorOptional,
} from "./ui-audit-core.js";

const OUTPUT_DIR = path.resolve(process.env.SCREENSHOT_DIR || "screenshots/ui");

const RESOLUTIONS = [
  { key: "390x844", width: 390, height: 844, label: "phone" },
  { key: "768x1024", width: 768, height: 1024, label: "tablet" },
  { key: "1280x800", width: 1280, height: 800, label: "laptop" },
  { key: "1920x1080", width: 1920, height: 1080, label: "widescreen" },
];

const PAGE_TARGETS = [
  "reactor_section",
  "upgrades_section",
  "experimental_upgrades_section",
  "leaderboard_section",
  "about_section",
];

const MODAL_TARGETS = [
  {
    name: "settings",
    open: openSettingsModal,
    close: closeSettingsModal,
    waitFor: ".settings-modal-overlay, #modal-root .settings-modal",
  },
  {
    name: "quick_start",
    open: openQuickStartModal,
    close: closeQuickStartModal,
    waitFor: "#quick-start-overlay:not(.hidden), .quick-start-modal, #modal-root .quick-start",
  },
];

function clearOutputDir() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function screenshotPath(resolutionKey, targetName) {
  return path.join(OUTPUT_DIR, `${resolutionKey}_${targetName}.png`);
}

const savedPaths = [];

async function captureScreenshot(page, resolutionKey, targetName) {
  const filePath = screenshotPath(resolutionKey, targetName);
  await page.screenshot({ path: filePath, type: "png" });
  savedPaths.push(filePath);
  logStep(`saved ${path.basename(filePath)}`);
  return filePath;
}

async function waitForPageReady(page, pageId) {
  await navigateToGamePage(page, pageId);
  await delay(STEP_DELAY_MS * 2);
  try {
    await page.waitForFunction(
      (id) => {
        const section = document.getElementById(id);
        return section && !section.classList.contains("hidden");
      },
      { timeout: PAGE_WAIT_MS },
      pageId
    );
  } catch {
    logStep(`page not ready for ${pageId}, capturing anyway`);
  }
}

async function captureTarget(label, fn) {
  try {
    await fn();
  } catch (error) {
    logStep(`WARN: ${label} — ${error?.message || String(error)}`);
  }
}

async function capturePageScreenshots(page, resolution) {
  for (const pageId of PAGE_TARGETS) {
    await captureTarget(`page:${pageId}`, async () => {
      await waitForPageReady(page, pageId);
      await captureScreenshot(page, resolution.key, pageId);
    });
  }
}

async function captureModalScreenshots(page, resolution) {
  for (const modal of MODAL_TARGETS) {
    await captureTarget(`modal:${modal.name}`, async () => {
      await modal.open(page);
      await waitForSelectorOptional(page, modal.waitFor);
      await delay(STEP_DELAY_MS * 2);
      await captureScreenshot(page, resolution.key, modal.name);
      await modal.close(page);
    });
  }
}

async function captureResolution(page, resolution) {
  logStep(`viewport ${resolution.key} (${resolution.label})`);
  await page.setViewport({ width: resolution.width, height: resolution.height, deviceScaleFactor: 1 });
  await prepareGameSession(page);
  await capturePageScreenshots(page, resolution);
  await captureModalScreenshots(page, resolution);
}

function printSummary(savedPaths) {
  const expected = RESOLUTIONS.length * (PAGE_TARGETS.length + MODAL_TARGETS.length);
  console.log("\n=== UI Screenshots ===");
  console.log(`URL: ${BASE_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Resolutions: ${RESOLUTIONS.map((r) => r.key).join(", ")}`);
  console.log(`Pages: ${PAGE_TARGETS.join(", ")}`);
  console.log(`Modals: ${MODAL_TARGETS.map((m) => m.name).join(", ")}`);
  console.log(`Captured: ${savedPaths.length} / ${expected}`);
}

async function main() {
  setLogPrefix("ui-screenshots");
  clearOutputDir();
  logStep(`starting (headless=${HEADLESS}, url=${BASE_URL})`);
  logStep(`output dir cleared: ${OUTPUT_DIR}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required",
    ],
    defaultViewport: { width: RESOLUTIONS[0].width, height: RESOLUTIONS[0].height },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  bindDialogAccept(page);

  try {
    for (const resolution of RESOLUTIONS) {
      await captureResolution(page, resolution);
    }
  } finally {
    await browser.close();
  }

  printSummary(savedPaths);
  const expected = RESOLUTIONS.length * (PAGE_TARGETS.length + MODAL_TARGETS.length);
  process.exitCode = savedPaths.length < expected ? 1 : 0;
}

main();
