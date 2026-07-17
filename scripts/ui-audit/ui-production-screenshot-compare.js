import fs from "fs";
import path from "path";
import sharp from "sharp";
import puppeteer from "puppeteer";
import {
  BASE_URL,
  HEADLESS,
  setLogPrefix,
  logStep,
  bindDialogAccept,
  prepareGameSession,
  openSettingsModal,
  closeSettingsModal,
  openQuickStartModal,
  closeQuickStartModal,
  waitForSelectorOptional,
  navigateToGamePage,
  delay,
  STEP_DELAY_MS,
} from "./ui-audit-core.js";
import {
  PRODUCTION_SCREENSHOT_DIR,
  ALIGNMENT_RESOLUTION,
  PRE_GAME_TARGETS,
  PAGE_TARGETS,
  MODAL_TARGETS,
  listAlignmentTargetNames,
  screenshotPath,
} from "./ui-screenshot-config.js";
import { launchScreenshotBrowser, prepareSplashSession } from "./ui-screenshot-capture.js";
import { hashFile } from "./ui-screenshot-hashes.js";

const LOCAL_CAPTURE_DIR = path.resolve(process.env.SCREENSHOT_CURRENT_DIR || "screenshots/ui-local-production");
const DIFF_DIR = path.resolve(process.env.SCREENSHOT_DIFF_DIR || "screenshots/ui-production-diff");
const PIXEL_THRESHOLD = Number(process.env.SCREENSHOT_DIFF_THRESHOLD || 0.1);
const REPORT_PATH = path.join(DIFF_DIR, "compare-report.json");

function clearDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function loadRawRgba(filePath) {
  const image = sharp(filePath);
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function comparePair(name, baselinePath, currentPath, diffPath) {
  if (!fs.existsSync(baselinePath)) return { name, status: "missing_baseline" };
  if (!fs.existsSync(currentPath)) return { name, status: "missing_current" };
  if (hashFile(baselinePath) === hashFile(currentPath)) {
    return { name, status: "identical", diffPercent: 0 };
  }
  const baseline = await loadRawRgba(baselinePath);
  const current = await loadRawRgba(currentPath);
  if (baseline.width !== current.width || baseline.height !== current.height) {
    return { name, status: "dimension_mismatch" };
  }
  const pixelCount = baseline.width * baseline.height;
  const diffBuffer = Buffer.alloc(baseline.data.length);
  let diffPixels = 0;
  for (let i = 0; i < pixelCount; i++) {
    const offset = i * baseline.channels;
    const changed =
      Math.abs(baseline.data[offset] - current.data[offset]) > PIXEL_THRESHOLD ||
      Math.abs(baseline.data[offset + 1] - current.data[offset + 1]) > PIXEL_THRESHOLD ||
      Math.abs(baseline.data[offset + 2] - current.data[offset + 2]) > PIXEL_THRESHOLD;
    if (changed) {
      diffPixels += 1;
      diffBuffer[offset] = 255;
      diffBuffer[offset + 1] = 0;
      diffBuffer[offset + 2] = 128;
      diffBuffer[offset + 3] = 255;
    } else {
      const gray = Math.round(
        baseline.data[offset] * 0.299 + baseline.data[offset + 1] * 0.587 + baseline.data[offset + 2] * 0.114
      );
      diffBuffer[offset] = gray;
      diffBuffer[offset + 1] = gray;
      diffBuffer[offset + 2] = gray;
      diffBuffer[offset + 3] = 180;
    }
  }
  await sharp(diffBuffer, {
    raw: { width: baseline.width, height: baseline.height, channels: baseline.channels },
  })
    .png()
    .toFile(diffPath);
  return {
    name,
    status: "changed",
    diffPercent: Number(((diffPixels / pixelCount) * 100).toFixed(2)),
  };
}

async function captureLocalProductionTargets(page) {
  await page.setViewport({
    width: ALIGNMENT_RESOLUTION.width,
    height: ALIGNMENT_RESOLUTION.height,
    deviceScaleFactor: 1,
  });

  for (const target of PRE_GAME_TARGETS) {
    await prepareSplashSession(page, BASE_URL);
    await waitForSelectorOptional(page, target.waitFor);
    await delay(STEP_DELAY_MS * 2);
    await page.screenshot({
      path: screenshotPath(LOCAL_CAPTURE_DIR, ALIGNMENT_RESOLUTION.key, target.name),
      type: "png",
    });
  }

  await prepareGameSession(page, BASE_URL);
  for (const pageId of PAGE_TARGETS) {
    await navigateToGamePage(page, pageId);
    await delay(STEP_DELAY_MS * 2);
    await page.screenshot({
      path: screenshotPath(LOCAL_CAPTURE_DIR, ALIGNMENT_RESOLUTION.key, pageId),
      type: "png",
    });
  }

  const modalHandlers = {
    settings: { open: openSettingsModal, close: closeSettingsModal },
    quick_start: { open: openQuickStartModal, close: closeQuickStartModal },
  };

  for (const modal of MODAL_TARGETS) {
    const handlers = modalHandlers[modal.name];
    await handlers.open(page);
    await waitForSelectorOptional(page, modal.waitFor);
    await delay(STEP_DELAY_MS * 2);
    await page.screenshot({
      path: screenshotPath(LOCAL_CAPTURE_DIR, ALIGNMENT_RESOLUTION.key, modal.name),
      type: "png",
    });
    await handlers.close(page);
  }
}

async function main() {
  setLogPrefix("ui-production-screenshot-compare");
  if (!fs.existsSync(PRODUCTION_SCREENSHOT_DIR)) {
    throw new Error("production screenshots missing — run: npm run ui:production:reference");
  }

  clearDir(LOCAL_CAPTURE_DIR);
  clearDir(DIFF_DIR);
  logStep(`capturing local @ ${ALIGNMENT_RESOLUTION.key}`);

  const { browser, page } = await launchScreenshotBrowser(puppeteer, HEADLESS);
  bindDialogAccept(page);
  try {
    await captureLocalProductionTargets(page);
  } finally {
    await browser.close();
  }

  const results = [];
  for (const targetName of listAlignmentTargetNames()) {
    const fileName = `${ALIGNMENT_RESOLUTION.key}_${targetName}.png`;
    const result = await comparePair(
      fileName,
      path.join(PRODUCTION_SCREENSHOT_DIR, fileName),
      path.join(LOCAL_CAPTURE_DIR, fileName),
      path.join(DIFF_DIR, fileName)
    );
    results.push(result);
    if (result.status === "changed") logStep(`diff ${fileName}: ${result.diffPercent}%`);
  }

  fs.writeFileSync(REPORT_PATH, `${JSON.stringify({ comparedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log("\n=== Production Screenshot Compare ===");
  console.log(`Production: ${PRODUCTION_SCREENSHOT_DIR}`);
  console.log(`Local: ${LOCAL_CAPTURE_DIR}`);
  console.log(`Diff: ${DIFF_DIR}`);
  console.log(`Identical: ${results.filter((r) => r.status === "identical").length}`);
  console.log(`Changed: ${results.filter((r) => r.status === "changed").length}`);
  if (results.some((r) => r.status !== "identical")) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
