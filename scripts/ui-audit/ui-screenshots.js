import puppeteer from "puppeteer";
import {
  BASE_URL,
  HEADLESS,
  setLogPrefix,
  logStep,
  bindDialogAccept,
  prepareGameSession,
} from "./ui-audit-core.js";
import { DEFAULT_OUTPUT_DIR, expectedScreenshotCount } from "./ui-screenshot-config.js";
import {
  captureAllScreenshots,
  launchScreenshotBrowser,
  printCaptureSummary,
  RESOLUTIONS,
} from "./ui-screenshot-capture.js";
import {
  verifyScreenshotHashes,
  updateScreenshotBaseline,
} from "./ui-screenshot-hashes.js";
import { runPhase3LayoutAudits } from "./ui-layout-audit.js";

async function main() {
  setLogPrefix("ui-screenshots");
  logStep(`starting (headless=${HEADLESS}, url=${BASE_URL})`);

  const { browser, page } = await launchScreenshotBrowser(puppeteer, HEADLESS);
  bindDialogAccept(page);

  let savedPaths = [];
  try {
    savedPaths = await captureAllScreenshots(page, DEFAULT_OUTPUT_DIR, { clearOutputDir: true });
    logStep(`output dir cleared: ${DEFAULT_OUTPUT_DIR}`);

    const expected = expectedScreenshotCount();
    if (savedPaths.length >= expected && process.env.SCREENSHOT_LAYOUT_AUDIT !== "0") {
      await page.setViewport({ width: RESOLUTIONS[0].width, height: RESOLUTIONS[0].height, deviceScaleFactor: 1 });
      await prepareGameSession(page);
      await runPhase3LayoutAudits(page, logStep);
    }
  } catch (error) {
    if (error?.name === "CriticalStartupError" || error?.name === "LayoutAuditError") {
      logStep(`FAIL: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await browser.close();
  }

  if (process.exitCode === 1) {
    printCaptureSummary(DEFAULT_OUTPUT_DIR, savedPaths, BASE_URL);
    return;
  }

  const expected = printCaptureSummary(DEFAULT_OUTPUT_DIR, savedPaths, BASE_URL);
  if (savedPaths.length < expected) {
    process.exitCode = 1;
    return;
  }

  if (process.env.UPDATE_SCREENSHOT_BASELINE === "1") {
    updateScreenshotBaseline(DEFAULT_OUTPUT_DIR, expected, logStep);
  } else if (process.env.SCREENSHOT_VERIFY_HASHES !== "0") {
    const hashResult = verifyScreenshotHashes(DEFAULT_OUTPUT_DIR, expected, logStep);
    if (!hashResult.ok) {
      logStep(`FAIL: ${hashResult.reason}`);
      process.exitCode = 1;
    }
  }
}

main().catch((error) => {
  if (error?.name === "CriticalStartupError") {
    logStep(`FAIL: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});
