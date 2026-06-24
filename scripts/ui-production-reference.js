import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  HEADLESS,
  setLogPrefix,
  logStep,
  bindDialogAccept,
  delay,
  STEP_DELAY_MS,
  prepareGameSession,
  openSettingsModal,
  closeSettingsModal,
  openQuickStartModal,
  closeQuickStartModal,
  waitForSelectorOptional,
  navigateToGamePage,
} from "./ui-audit-core.js";
import {
  PRODUCTION_URL,
  PRODUCTION_REFERENCE_DIR,
  PRODUCTION_SCREENSHOT_DIR,
  ALIGNMENT_RESOLUTION,
  PRE_GAME_TARGETS,
  PAGE_TARGETS,
  MODAL_TARGETS,
  listAlignmentTargetNames,
  screenshotPath,
} from "./ui-screenshot-config.js";
import {
  launchScreenshotBrowser,
  prepareSplashSession,
} from "./ui-screenshot-capture.js";
import {
  downloadStylesheets,
  extractPageDomSnapshot,
  extractStylesheetInventory,
  savePageSnapshot,
} from "./ui-page-snapshot.js";

const MODAL_HANDLERS = {
  settings: { open: openSettingsModal, close: closeSettingsModal },
  quick_start: { open: openQuickStartModal, close: closeQuickStartModal },
};

function clearDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
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
      { timeout: 8000 },
      pageId
    );
  } catch {
    logStep(`page not ready for ${pageId}, capturing anyway`);
  }
}

async function captureTargetScreenshot(page, targetName) {
  const filePath = screenshotPath(PRODUCTION_SCREENSHOT_DIR, ALIGNMENT_RESOLUTION.key, targetName);
  await page.screenshot({ path: filePath, type: "png" });
  logStep(`screenshot ${path.basename(filePath)}`);
  return filePath;
}

async function captureTargetReference(page, target, options = {}) {
  const { pageId = null, beforeScreenshot = null } = options;
  if (beforeScreenshot) await beforeScreenshot(page);
  else if (pageId) await waitForPageReady(page, pageId);
  else {
    await waitForSelectorOptional(page, target.waitFor);
    await delay(STEP_DELAY_MS * 2);
  }

  const snapshot = await extractPageDomSnapshot(page, {
    rootSelector: target.rootSelector,
    pageId,
    targetName: target.name ?? pageId,
  });
  await savePageSnapshot(PRODUCTION_REFERENCE_DIR, target.name ?? pageId, snapshot);
  await captureTargetScreenshot(page, target.name ?? pageId);
  return snapshot;
}

async function captureProductionReference(page) {
  clearDir(PRODUCTION_REFERENCE_DIR);
  clearDir(PRODUCTION_SCREENSHOT_DIR);
  fs.mkdirSync(path.join(PRODUCTION_REFERENCE_DIR, "css"), { recursive: true });
  fs.mkdirSync(path.join(PRODUCTION_REFERENCE_DIR, "pages"), { recursive: true });

  await page.setViewport({
    width: ALIGNMENT_RESOLUTION.width,
    height: ALIGNMENT_RESOLUTION.height,
    deviceScaleFactor: 1,
  });

  await prepareSplashSession(page, PRODUCTION_URL);
  const indexHtml = await page.content();
  fs.writeFileSync(path.join(PRODUCTION_REFERENCE_DIR, "index.html"), indexHtml);

  const stylesheets = await extractStylesheetInventory(page);
  const cssFiles = await downloadStylesheets(
    stylesheets,
    path.join(PRODUCTION_REFERENCE_DIR, "css"),
    logStep
  );

  const targets = [];
  for (const target of PRE_GAME_TARGETS) {
    await prepareSplashSession(page, PRODUCTION_URL);
    targets.push(await captureTargetReference(page, target));
  }

  await prepareGameSession(page, PRODUCTION_URL);
  for (const pageId of PAGE_TARGETS) {
    targets.push(
      await captureTargetReference(page, { name: pageId, waitFor: `#${pageId}`, rootSelector: `#${pageId}` }, { pageId })
    );
  }

  for (const modal of MODAL_TARGETS) {
    const handlers = MODAL_HANDLERS[modal.name];
    targets.push(
      await captureTargetReference(
        page,
        { name: modal.name, waitFor: modal.waitFor, rootSelector: "#modal-root, .modal-root, body" },
        {
          beforeScreenshot: async (p) => {
            await handlers.open(p);
            await waitForSelectorOptional(p, modal.waitFor);
            await delay(STEP_DELAY_MS * 2);
            if (modal.scrollSettings) {
              await p.evaluate(() => {
                const panel = document.querySelector(".settings-content");
                if (panel) panel.scrollTop = panel.scrollHeight;
              });
              await delay(STEP_DELAY_MS);
            }
          },
        }
      )
    );
    await handlers.close(page);
  }

  const manifest = {
    version: 1,
    source: PRODUCTION_URL,
    capturedAt: new Date().toISOString(),
    resolution: ALIGNMENT_RESOLUTION.key,
    stylesheetCount: stylesheets.length,
    cssFiles,
    stylesheets,
    targets: listAlignmentTargetNames(),
    snapshots: targets.map((snapshot) => ({
      targetName: snapshot.targetName,
      pageId: snapshot.pageId,
      classCount: snapshot.classes.length,
      idCount: snapshot.ids.length,
      bodyClass: snapshot.bodyClass,
    })),
  };
  fs.writeFileSync(
    path.join(PRODUCTION_REFERENCE_DIR, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  logStep(`reference saved → ${PRODUCTION_REFERENCE_DIR}`);
  return manifest;
}

async function main() {
  setLogPrefix("ui-production-reference");
  logStep(`capturing production UI model from ${PRODUCTION_URL}`);

  const { browser, page } = await launchScreenshotBrowser(puppeteer, HEADLESS);
  bindDialogAccept(page);

  try {
    const manifest = await captureProductionReference(page);
    console.log("\n=== Production UI Reference ===");
    console.log(`URL: ${PRODUCTION_URL}`);
    console.log(`Reference: ${PRODUCTION_REFERENCE_DIR}`);
    console.log(`Screenshots: ${PRODUCTION_SCREENSHOT_DIR}`);
    console.log(`Targets: ${manifest.targets.length}`);
    console.log(`CSS files: ${manifest.cssFiles.length}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
