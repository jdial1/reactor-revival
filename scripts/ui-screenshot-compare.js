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
} from "./ui-audit-core.js";
import {
  BASELINE_DIR,
  CURRENT_DIR,
  DIFF_DIR,
  expectedScreenshotCount,
  listScreenshotNames,
} from "./ui-screenshot-config.js";
import {
  captureAllScreenshots,
  launchScreenshotBrowser,
  printCaptureSummary,
} from "./ui-screenshot-capture.js";
import { assertBaselineExists } from "./ui-screenshot-backup.js";
import { hashFile } from "./ui-screenshot-hashes.js";

const PIXEL_THRESHOLD = Number(process.env.SCREENSHOT_DIFF_THRESHOLD || 0.1);
const DIFF_REPORT_PATH = path.join(DIFF_DIR, "compare-report.json");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clearDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
}

async function loadRawRgba(filePath) {
  const image = sharp(filePath);
  const meta = await image.metadata();
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels, meta };
}

async function comparePair(name, baselinePath, currentPath, diffPath) {
  if (!fs.existsSync(baselinePath)) {
    return { name, status: "missing_baseline", diffPixels: null, diffPercent: null, hashMatch: false };
  }
  if (!fs.existsSync(currentPath)) {
    return { name, status: "missing_current", diffPixels: null, diffPercent: null, hashMatch: false };
  }

  const baselineHash = hashFile(baselinePath);
  const currentHash = hashFile(currentPath);
  if (baselineHash === currentHash) {
    return { name, status: "identical", diffPixels: 0, diffPercent: 0, hashMatch: true };
  }

  const baseline = await loadRawRgba(baselinePath);
  const current = await loadRawRgba(currentPath);

  if (baseline.width !== current.width || baseline.height !== current.height) {
    return {
      name,
      status: "dimension_mismatch",
      diffPixels: null,
      diffPercent: null,
      hashMatch: false,
      baselineSize: `${baseline.width}x${baseline.height}`,
      currentSize: `${current.width}x${current.height}`,
    };
  }

  const pixelCount = baseline.width * baseline.height;
  const diffBuffer = Buffer.alloc(baseline.data.length);
  let diffPixels = 0;

  for (let i = 0; i < pixelCount; i++) {
    const offset = i * baseline.channels;
    const dr = Math.abs(baseline.data[offset] - current.data[offset]);
    const dg = Math.abs(baseline.data[offset + 1] - current.data[offset + 1]);
    const db = Math.abs(baseline.data[offset + 2] - current.data[offset + 2]);
    const da = Math.abs(baseline.data[offset + 3] - current.data[offset + 3]);
    const changed = dr > PIXEL_THRESHOLD || dg > PIXEL_THRESHOLD || db > PIXEL_THRESHOLD || da > PIXEL_THRESHOLD;

    if (changed) {
      diffPixels += 1;
      diffBuffer[offset] = 255;
      diffBuffer[offset + 1] = 0;
      diffBuffer[offset + 2] = 128;
      diffBuffer[offset + 3] = 255;
    } else {
      const gray = Math.round(
        baseline.data[offset] * 0.299 +
          baseline.data[offset + 1] * 0.587 +
          baseline.data[offset + 2] * 0.114
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

  const diffPercent = Number(((diffPixels / pixelCount) * 100).toFixed(2));
  return {
    name,
    status: diffPixels === 0 ? "identical" : "changed",
    diffPixels,
    diffPercent,
    hashMatch: false,
  };
}

async function compareDirectories(baselineDir, currentDir, diffDir) {
  clearDir(diffDir);
  const results = [];
  for (const name of listScreenshotNames()) {
    const result = await comparePair(
      name,
      path.join(baselineDir, name),
      path.join(currentDir, name),
      path.join(diffDir, name)
    );
    results.push(result);
    if (result.status === "changed") {
      logStep(`diff ${name}: ${result.diffPercent}% pixels (${result.diffPixels})`);
    } else if (result.status !== "identical") {
      logStep(`${result.status}: ${name}`);
    }
  }
  return results;
}

function printCompareSummary(results, baselineDir, currentDir, diffDir) {
  const identical = results.filter((r) => r.status === "identical").length;
  const changed = results.filter((r) => r.status === "changed").length;
  const problems = results.filter((r) => !["identical", "changed"].includes(r.status));

  console.log("\n=== UI Screenshot Compare ===");
  console.log(`Baseline: ${baselineDir}`);
  console.log(`Current:  ${currentDir}`);
  console.log(`Diff:     ${diffDir}`);
  console.log(`Identical: ${identical}`);
  console.log(`Changed:   ${changed}`);
  if (problems.length) {
    console.log(`Problems:  ${problems.length}`);
    for (const item of problems) {
      console.log(`  - ${item.name}: ${item.status}`);
    }
  }
  if (changed > 0) {
    const top = results
      .filter((r) => r.status === "changed")
      .sort((a, b) => b.diffPercent - a.diffPercent)
      .slice(0, 5);
    console.log("Largest diffs:");
    for (const item of top) {
      console.log(`  - ${item.name}: ${item.diffPercent}%`);
    }
  }
}

async function main() {
  setLogPrefix("ui-screenshot-compare");
  const baselineManifest = assertBaselineExists(BASELINE_DIR);
  logStep(`baseline loaded (${baselineManifest.fileCount} files from ${baselineManifest.createdAt})`);

  clearDir(CURRENT_DIR);
  logStep(`capturing current UI → ${CURRENT_DIR}`);

  const { browser, page } = await launchScreenshotBrowser(puppeteer, HEADLESS);
  bindDialogAccept(page);

  let savedPaths = [];
  try {
    savedPaths = await captureAllScreenshots(page, CURRENT_DIR, { clearOutputDir: false });
  } catch (error) {
    if (error?.name === "CriticalStartupError") {
      logStep(`FAIL: ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await browser.close();
  }

  printCaptureSummary(CURRENT_DIR, savedPaths, BASE_URL);

  const expected = expectedScreenshotCount();
  if (savedPaths.length < expected) {
    logStep(`FAIL: incomplete capture (${savedPaths.length}/${expected})`);
    process.exitCode = 1;
    return;
  }

  const results = await compareDirectories(BASELINE_DIR, CURRENT_DIR, DIFF_DIR);
  const report = {
    version: 1,
    comparedAt: new Date().toISOString(),
    baselineDir: BASELINE_DIR,
    currentDir: CURRENT_DIR,
    diffDir: DIFF_DIR,
    pixelThreshold: PIXEL_THRESHOLD,
    baselineCreatedAt: baselineManifest.createdAt,
    summary: {
      total: results.length,
      identical: results.filter((r) => r.status === "identical").length,
      changed: results.filter((r) => r.status === "changed").length,
      problems: results.filter((r) => !["identical", "changed"].includes(r.status)).length,
    },
    results,
  };
  fs.writeFileSync(DIFF_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  logStep(`report → ${DIFF_REPORT_PATH}`);

  printCompareSummary(results, BASELINE_DIR, CURRENT_DIR, DIFF_DIR);

  const hasProblems = report.summary.problems > 0;
  const hasChanges = report.summary.changed > 0;
  if (hasProblems || hasChanges) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
