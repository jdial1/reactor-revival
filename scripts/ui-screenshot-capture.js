import fs from "fs";
import {
  BASE_URL,
  NAV_TIMEOUT_MS,
  PAGE_WAIT_MS,
  STEP_DELAY_MS,
  logStep,
  delay,
  clearGameStorage,
  navigateToGamePage,
  prepareGameSession,
  openSettingsModal,
  closeSettingsModal,
  openQuickStartModal,
  closeQuickStartModal,
  waitForSelectorOptional,
  assertNoCriticalStartupFailure,
} from "./ui-audit-core.js";
import {
  MODAL_TARGETS,
  PAGE_TARGETS,
  PRE_GAME_TARGETS,
  RESOLUTIONS,
  screenshotPath,
} from "./ui-screenshot-config.js";

const MODAL_HANDLERS = {
  settings: { open: openSettingsModal, close: closeSettingsModal },
  quick_start: { open: openQuickStartModal, close: closeQuickStartModal },
};

export { RESOLUTIONS, PAGE_TARGETS, MODAL_TARGETS, PRE_GAME_TARGETS };

export async function prepareSplashSession(page, baseUrl = BASE_URL) {
  await clearGameStorage(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector("#splash-new-game-btn, #app_root", { timeout: NAV_TIMEOUT_MS });
  await delay(STEP_DELAY_MS * 3);
  try {
    await page.waitForFunction(
      () => {
        const btn = document.getElementById("splash-new-game-btn");
        const splash = document.getElementById("splash-screen");
        return btn && splash && !splash.classList.contains("hidden");
      },
      { timeout: PAGE_WAIT_MS }
    );
  } catch {
    logStep("splash not fully ready, capturing anyway");
  }
}

async function capturePreGameScreenshots(page, resolution, outputDir, savedPaths) {
  for (const target of PRE_GAME_TARGETS) {
    await captureTarget(`pregame:${target.name}`, async () => {
      await prepareSplashSession(page);
      await waitForSelectorOptional(page, target.waitFor);
      await delay(STEP_DELAY_MS * 2);
      await captureScreenshot(page, outputDir, resolution.key, target.name, savedPaths);
    });
  }
}

export function ensureOutputDir(outputDir, clear = true) {
  if (clear) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });
}

async function captureScreenshot(page, outputDir, resolutionKey, targetName, savedPaths) {
  await assertNoCriticalStartupFailure(page, null, `before screenshot ${resolutionKey}_${targetName}`);
  const filePath = screenshotPath(outputDir, resolutionKey, targetName);
  await page.screenshot({ path: filePath, type: "png" });
  savedPaths.push(filePath);
  logStep(`saved ${filePath.split(/[/\\]/).pop()}`);
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
  if (pageId === "leaderboard_section") {
    try {
      await page.waitForFunction(
        () => !document.querySelector(".leaderboard-loading-cell"),
        { timeout: 4000 }
      );
    } catch {
      logStep("leaderboard still loading, capturing anyway");
    }
    await delay(STEP_DELAY_MS);
  }
  if (pageId === "upgrades_section" || pageId === "experimental_upgrades_section") {
    try {
      await page.waitForFunction(
        () => document.querySelector(".section-hub-meta-host .section-count"),
        { timeout: 4000 }
      );
    } catch {
      logStep(`hub meta not ready for ${pageId}, capturing anyway`);
    }
    await delay(STEP_DELAY_MS);
  }
}

async function captureTarget(label, fn) {
  try {
    await fn();
  } catch (error) {
    if (error?.name === "CriticalStartupError") throw error;
    logStep(`WARN: ${label} — ${error?.message || String(error)}`);
  }
}

async function capturePageScreenshots(page, resolution, outputDir, savedPaths) {
  for (const pageId of PAGE_TARGETS) {
    await captureTarget(`page:${pageId}`, async () => {
      await waitForPageReady(page, pageId);
      await captureScreenshot(page, outputDir, resolution.key, pageId, savedPaths);
    });
  }
}

async function captureModalScreenshots(page, resolution, outputDir, savedPaths) {
  for (const modal of MODAL_TARGETS) {
    const handlers = MODAL_HANDLERS[modal.name];
    await captureTarget(`modal:${modal.name}`, async () => {
      await handlers.open(page);
      await waitForSelectorOptional(page, modal.waitFor);
      await delay(STEP_DELAY_MS * 2);
      if (modal.scrollSettings) {
        await page.evaluate(() => {
          const panel = document.querySelector(".settings-content");
          if (panel) panel.scrollTop = panel.scrollHeight;
        });
        await delay(STEP_DELAY_MS);
      }
      await captureScreenshot(page, outputDir, resolution.key, modal.name, savedPaths);
      await handlers.close(page);
    });
  }
}

export async function captureResolution(page, resolution, outputDir, savedPaths, { includePreGame = false } = {}) {
  logStep(`viewport ${resolution.key} (${resolution.label})`);
  await page.setViewport({ width: resolution.width, height: resolution.height, deviceScaleFactor: 1 });
  if (includePreGame) {
    await capturePreGameScreenshots(page, resolution, outputDir, savedPaths);
  }
  await prepareGameSession(page);
  await capturePageScreenshots(page, resolution, outputDir, savedPaths);
  await captureModalScreenshots(page, resolution, outputDir, savedPaths);
}

export async function captureAllScreenshots(page, outputDir, { clearOutputDir = true, includePreGame = false } = {}) {
  ensureOutputDir(outputDir, clearOutputDir);
  const savedPaths = [];
  for (const resolution of RESOLUTIONS) {
    await captureResolution(page, resolution, outputDir, savedPaths, { includePreGame });
  }
  return savedPaths;
}

export function printCaptureSummary(outputDir, savedPaths, baseUrl) {
  const expected = RESOLUTIONS.length * (PAGE_TARGETS.length + MODAL_TARGETS.length);
  console.log("\n=== UI Screenshots ===");
  console.log(`URL: ${baseUrl}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Resolutions: ${RESOLUTIONS.map((r) => r.key).join(", ")}`);
  console.log(`Pages: ${PAGE_TARGETS.join(", ")}`);
  console.log(`Modals: ${MODAL_TARGETS.map((m) => m.name).join(", ")}`);
  console.log(`Captured: ${savedPaths.length} / ${expected}`);
  return expected;
}

export async function launchScreenshotBrowser(puppeteer, headless) {
  const browser = await puppeteer.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required",
    ],
    defaultViewport: { width: RESOLUTIONS[0].width, height: RESOLUTIONS[0].height },
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  return { browser, page };
}
