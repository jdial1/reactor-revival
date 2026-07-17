import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import {
  BASE_URL,
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
  PRODUCTION_REFERENCE_DIR,
  PRODUCTION_SCREENSHOT_DIR,
  ALIGNMENT_RESOLUTION,
  PRE_GAME_TARGETS,
  PAGE_TARGETS,
  MODAL_TARGETS,
  listAlignmentTargetNames,
} from "./ui-screenshot-config.js";
import {
  launchScreenshotBrowser,
  prepareSplashSession,
} from "./ui-screenshot-capture.js";
import {
  diffComputedStyles,
  diffStringSets,
  extractPageDomSnapshot,
  extractStylesheetInventory,
  findCssFilesForClass,
  indexLocalCssFiles,
  savePageSnapshot,
} from "./ui-page-snapshot.js";

const LOCAL_REFERENCE_DIR = path.resolve(process.env.LOCAL_REFERENCE_DIR || "reference/local");
const ALIGNMENT_REPORT_PATH = path.resolve(
  process.env.ALIGNMENT_REPORT_PATH || "reference/alignment-report.json"
);
const PUBLIC_CSS_DIR = path.resolve("public/css");

const MODAL_HANDLERS = {
  settings: { open: openSettingsModal, close: closeSettingsModal },
  quick_start: { open: openQuickStartModal, close: closeQuickStartModal },
};

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertProductionReference() {
  const manifestPath = path.join(PRODUCTION_REFERENCE_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("production reference missing — run: npm run ui:production:reference");
  }
  return loadJson(manifestPath);
}

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

async function captureLocalTarget(page, target, options = {}) {
  const { pageId = null, beforeSnapshot = null } = options;
  if (beforeSnapshot) await beforeSnapshot(page);
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
  await savePageSnapshot(LOCAL_REFERENCE_DIR, target.name ?? pageId, snapshot);
  return snapshot;
}

async function captureLocalReference(page) {
  clearDir(LOCAL_REFERENCE_DIR);
  await page.setViewport({
    width: ALIGNMENT_RESOLUTION.width,
    height: ALIGNMENT_RESOLUTION.height,
    deviceScaleFactor: 1,
  });

  const snapshots = {};
  for (const target of PRE_GAME_TARGETS) {
    await prepareSplashSession(page, BASE_URL);
    snapshots[target.name] = await captureLocalTarget(page, target);
  }

  await prepareGameSession(page);
  for (const pageId of PAGE_TARGETS) {
    snapshots[pageId] = await captureLocalTarget(
      page,
      { name: pageId, waitFor: `#${pageId}`, rootSelector: `#${pageId}` },
      { pageId }
    );
  }

  for (const modal of MODAL_TARGETS) {
    const handlers = MODAL_HANDLERS[modal.name];
    snapshots[modal.name] = await captureLocalTarget(
      page,
      { name: modal.name, waitFor: modal.waitFor, rootSelector: "#modal-root, .modal-root, body" },
      {
        beforeSnapshot: async (p) => {
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
    );
    await handlers.close(page);
  }

  const stylesheets = await extractStylesheetInventory(page);
  return { snapshots, stylesheets };
}

function compareStylesheetLists(productionManifest, localStylesheets) {
  const prodNames = new Set(
    (productionManifest.stylesheets ?? []).map((sheet) => path.basename(new URL(sheet.href).pathname))
  );
  const localNames = new Set(
    localStylesheets.map((sheet) => path.basename(new URL(sheet.href).pathname))
  );
  return {
    missingInLocal: [...prodNames].filter((name) => !localNames.has(name)).sort(),
    extraInLocal: [...localNames].filter((name) => !prodNames.has(name)).sort(),
    shared: [...prodNames].filter((name) => localNames.has(name)).sort(),
  };
}

function compareCssFileContents(productionCssDir) {
  const cssIndex = indexLocalCssFiles(PUBLIC_CSS_DIR);
  const results = [];
  if (!fs.existsSync(productionCssDir)) return results;

  for (const file of fs.readdirSync(productionCssDir).filter((name) => name.endsWith(".css"))) {
    const prodPath = path.join(productionCssDir, file);
    const localPath = path.join(PUBLIC_CSS_DIR, file);
    const prodContent = fs.readFileSync(prodPath, "utf8");
    if (!fs.existsSync(localPath)) {
      results.push({ file, status: "missing_local_file", productionBytes: prodContent.length });
      continue;
    }
    const localContent = fs.readFileSync(localPath, "utf8");
    if (prodContent !== localContent) {
      results.push({
        file,
        status: "content_differs",
        productionBytes: prodContent.length,
        localBytes: localContent.length,
        deltaBytes: localContent.length - prodContent.length,
      });
    } else {
      results.push({ file, status: "identical" });
    }
  }
  return results;
}

function buildTargetReport(targetName, productionSnapshot, localSnapshot, cssIndex) {
  const classDiff = diffStringSets(productionSnapshot.classes, localSnapshot.classes);
  const idDiff = diffStringSets(productionSnapshot.ids, localSnapshot.ids);
  const styleDiffs = diffComputedStyles(productionSnapshot.computedStyles, localSnapshot.computedStyles);

  const missingClassHints = classDiff.missingInLocal.map((className) => ({
    className,
    localCssFiles: findCssFilesForClass(className, cssIndex),
  }));

  return {
    targetName,
    bodyClass: {
      production: productionSnapshot.bodyClass,
      local: localSnapshot.bodyClass,
      match: productionSnapshot.bodyClass === localSnapshot.bodyClass,
    },
    classes: classDiff,
    ids: idDiff,
    computedStyleDiffs: styleDiffs,
    missingClassHints,
    htmlSize: {
      production: productionSnapshot.html?.length ?? 0,
      local: localSnapshot.html?.length ?? 0,
    },
  };
}

function printSummary(report) {
  console.log("\n=== Production Alignment Report ===");
  console.log(`Production: ${report.productionUrl}`);
  console.log(`Local: ${report.localUrl}`);
  console.log(`Report: ${ALIGNMENT_REPORT_PATH}`);
  console.log(`Stylesheets missing locally: ${report.stylesheets.missingInLocal.length}`);
  console.log(`CSS files differing: ${report.cssFiles.filter((f) => f.status === "content_differs").length}`);
  console.log(`CSS files missing locally: ${report.cssFiles.filter((f) => f.status === "missing_local_file").length}`);

  const topTargets = [...report.targets]
    .sort(
      (a, b) =>
        b.classes.missingInLocal.length +
        b.computedStyleDiffs.length -
        (a.classes.missingInLocal.length + a.computedStyleDiffs.length)
    )
    .slice(0, 5);

  console.log("Top misaligned targets:");
  for (const target of topTargets) {
    console.log(
      `  - ${target.targetName}: ${target.classes.missingInLocal.length} missing classes, ${target.computedStyleDiffs.length} style diffs`
    );
  }
}

async function main() {
  setLogPrefix("ui-production-align");
  const productionManifest = assertProductionReference();
  logStep(`production reference loaded (${productionManifest.capturedAt})`);
  logStep(`capturing local reference from ${BASE_URL}`);

  const { browser, page } = await launchScreenshotBrowser(puppeteer, HEADLESS);
  bindDialogAccept(page);

  let localReference;
  try {
    localReference = await captureLocalReference(page);
  } finally {
    await browser.close();
  }

  const cssIndex = indexLocalCssFiles(PUBLIC_CSS_DIR);
  const productionCssDir = path.join(PRODUCTION_REFERENCE_DIR, "css");
  const targets = [];

  for (const targetName of listAlignmentTargetNames()) {
    const prodSnapshot = loadJson(path.join(PRODUCTION_REFERENCE_DIR, "pages", targetName, "snapshot.json"));
    const localSnapshot = localReference.snapshots[targetName];
    if (!localSnapshot) {
      targets.push({ targetName, status: "missing_local_capture" });
      continue;
    }
    targets.push(buildTargetReport(targetName, prodSnapshot, localSnapshot, cssIndex));
  }

  const report = {
    version: 1,
    comparedAt: new Date().toISOString(),
    productionUrl: productionManifest.source,
    localUrl: BASE_URL,
    productionReferenceDir: PRODUCTION_REFERENCE_DIR,
    localReferenceDir: LOCAL_REFERENCE_DIR,
    productionScreenshotDir: PRODUCTION_SCREENSHOT_DIR,
    resolution: ALIGNMENT_RESOLUTION.key,
    stylesheets: compareStylesheetLists(productionManifest, localReference.stylesheets),
    cssFiles: compareCssFileContents(productionCssDir),
    targets,
  };

  fs.mkdirSync(path.dirname(ALIGNMENT_REPORT_PATH), { recursive: true });
  fs.writeFileSync(ALIGNMENT_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  printSummary(report);

  const hasProblems =
    report.stylesheets.missingInLocal.length > 0 ||
    report.cssFiles.some((file) => file.status !== "identical") ||
    report.targets.some(
      (target) =>
        target.classes?.missingInLocal?.length ||
        target.computedStyleDiffs?.length ||
        target.status === "missing_local_capture"
    );
  if (hasProblems) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
