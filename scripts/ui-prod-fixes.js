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
  PRODUCTION_URL,
  PRODUCTION_REFERENCE_DIR,
  RESOLUTIONS,
  PRE_GAME_TARGETS,
  PAGE_TARGETS,
  MODAL_TARGETS,
} from "./ui-screenshot-config.js";
import { prepareSplashSession } from "./ui-screenshot-capture.js";
import {
  buildRuleIndex,
  buildProdFixesHeader,
  classCoveredInCorpus,
  dedupeRules,
  diffStyleObjects,
  findRulesForClass,
  findRulesForId,
  formatPageSection,
  loadCssCorpus,
  pageMarker,
  ruleExistsInIndex,
  ruleFingerprint,
  sectionMarker,
  computedOverridesToRule,
  STYLE_PROPS,
} from "./css-prod-extract.js";

const PUBLIC_CSS_DIR = path.resolve("public/css");
const PROD_FIXES_PATH = path.resolve("public/css/prod_fixes.css");
const PROD_FIXES_REPORT = path.resolve("reference/prod-fixes-report.json");
const PRODUCTION_CSS_DIR = path.join(PRODUCTION_REFERENCE_DIR, "css");

const MODAL_HANDLERS = {
  settings: { open: openSettingsModal, close: closeSettingsModal },
  quick_start: { open: openQuickStartModal, close: closeQuickStartModal },
};

class ProdFixesWriter {
  constructor({ outputPath, reportPath, sourceUrl }) {
    this.outputPath = outputPath;
    this.reportPath = reportPath;
    this.sourceUrl = sourceUrl;
    this.rulesByFingerprint = new Map();
    this.reportEntries = [];
    this.startedAt = new Date().toISOString();
  }

  init() {
    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    if (process.env.PROD_FIXES_FRESH === "1") {
      fs.writeFileSync(this.outputPath, buildProdFixesHeader(this.sourceUrl, 0, true));
      this.rulesByFingerprint.clear();
      this.reportEntries = [];
      logStep("fresh run — prod_fixes.css reset");
      return;
    }
    if (!fs.existsSync(this.outputPath) || !fs.readFileSync(this.outputPath, "utf8").trim()) {
      fs.writeFileSync(this.outputPath, buildProdFixesHeader(this.sourceUrl, 0, true));
    } else {
      this.refreshHeader(true);
      logStep("continuing — all pages/resolutions will be re-processed");
    }
  }

  refreshHeader(inProgress) {
    let body = "";
    if (fs.existsSync(this.outputPath)) {
      const lines = fs.readFileSync(this.outputPath, "utf8").split("\n");
      let index = 0;
      while (index < lines.length && lines[index].trim().startsWith("/*")) index += 1;
      body = lines.slice(index).join("\n");
    }
    fs.writeFileSync(
      this.outputPath,
      `${buildProdFixesHeader(this.sourceUrl, this.rulesByFingerprint.size, inProgress)}${body}`
    );
  }

  saveReport() {
    fs.mkdirSync(path.dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(
      this.reportPath,
      `${JSON.stringify(
        {
          version: 1,
          startedAt: this.startedAt,
          updatedAt: new Date().toISOString(),
          productionUrl: this.sourceUrl,
          localUrl: BASE_URL,
          output: this.outputPath,
          totalRules: this.rulesByFingerprint.size,
          entries: this.reportEntries,
        },
        null,
        2
      )}\n`
    );
  }

  finalize() {
    this.refreshHeader(false);
    this.saveReport();
  }

  ensurePageHeader(targetName) {
    const marker = pageMarker(targetName);
    const content = fs.existsSync(this.outputPath) ? fs.readFileSync(this.outputPath, "utf8") : "";
    if (content.includes(marker)) return;
    fs.appendFileSync(this.outputPath, `\n${marker}\n`);
  }

  replacePageSection(resolutionKey, targetName, rules) {
    const marker = sectionMarker(resolutionKey, targetName);
    const section = formatPageSection(resolutionKey, targetName, rules).trimStart();
    let content = fs.readFileSync(this.outputPath, "utf8");
    const start = content.indexOf(marker);

    if (start === -1) {
      content = `${content.trimEnd()}\n\n${section}`;
    } else {
      const tail = content.slice(start + marker.length);
      const next = tail.search(/\n\/\* (?:===|---)/);
      const end = next === -1 ? content.length : start + marker.length + next;
      content = `${content.slice(0, start).trimEnd()}\n\n${section}${next === -1 ? "\n" : content.slice(end)}`;
    }

    fs.writeFileSync(this.outputPath, content);

    for (const rule of rules) {
      const fp = ruleFingerprint(rule.selector, rule.body, rule.media);
      this.rulesByFingerprint.set(fp, rule);
    }

    this.refreshHeader(true);
    this.saveReport();
    return rules.length;
  }
}

async function prepareTargetPage(page, target, baseUrl) {
  if (PRE_GAME_TARGETS.some((item) => item.name === target.name)) {
    await prepareSplashSession(page, baseUrl);
    await waitForSelectorOptional(page, target.waitFor);
    await delay(STEP_DELAY_MS * 2);
    return;
  }
  if (PAGE_TARGETS.includes(target.name)) {
    await prepareGameSession(page, baseUrl);
    await navigateToGamePage(page, target.name);
    await delay(STEP_DELAY_MS * 2);
    return;
  }
  await prepareGameSession(page, baseUrl);
  const modal = MODAL_TARGETS.find((item) => item.name === target.name);
  if (!modal) return;
  const handlers = MODAL_HANDLERS[modal.name];
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
}

async function extractComponents(page, target) {
  return page.evaluate(({ rootSelector, styleProps }) => {
    const root =
      document.querySelector(rootSelector) ??
      document.getElementById("wrapper") ??
      document.body;

    function buildSelector(el) {
      if (el.id) return `#${el.id}`;
      const classes = [...el.classList].filter(Boolean);
      if (classes.length) return `.${classes.join(".")}`;
      return el.tagName.toLowerCase();
    }

    const components = [];
    const seen = new Set();
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const el of nodes) {
      if (!(el instanceof Element)) continue;
      if (!el.classList.length && !el.id) continue;
      const selector = buildSelector(el);
      if (seen.has(selector)) continue;
      seen.add(selector);
      const style = getComputedStyle(el);
      const styles = {};
      for (const prop of styleProps) {
        styles[prop] = style[prop];
      }
      components.push({
        selector,
        id: el.id || null,
        classes: [...el.classList],
        tag: el.tagName.toLowerCase(),
        styles,
      });
    }
    return components;
  }, { rootSelector: target.rootSelector, styleProps: STYLE_PROPS });
}

function collectRulesForPage({
  productionComponents,
  localComponents,
  productionCorpus,
  localCorpus,
  localIndex,
  target,
  resolution,
}) {
  const candidates = [];
  const localBySelector = new Map(localComponents.map((item) => [item.selector, item]));
  const prodClasses = new Set(productionComponents.flatMap((item) => item.classes));
  const viewportMedia = `(width: ${resolution.width}px) and (height: ${resolution.height}px)`;

  for (const className of prodClasses) {
    if (classCoveredInCorpus(className, localCorpus)) continue;
    for (const rule of findRulesForClass(className, productionCorpus)) {
      candidates.push({
        ...rule,
        reason: "class_not_in_local_css",
        target: target.name,
        resolution: resolution.key,
        className,
      });
    }
  }

  for (const prodComponent of productionComponents) {
    for (const className of prodComponent.classes) {
      if (classCoveredInCorpus(className, localCorpus)) continue;
      for (const rule of findRulesForClass(className, productionCorpus)) {
        candidates.push({
          ...rule,
          reason: "class_not_in_local_css",
          target: target.name,
          resolution: resolution.key,
          component: prodComponent.selector,
          className,
        });
      }
    }
    if (prodComponent.id) {
      for (const rule of findRulesForId(prodComponent.id, productionCorpus)) {
        candidates.push({
          ...rule,
          reason: "id_not_in_local_css",
          target: target.name,
          resolution: resolution.key,
          component: prodComponent.selector,
          id: prodComponent.id,
        });
      }
    }

    const localComponent = localBySelector.get(prodComponent.selector);
    if (localComponent) {
      const overrides = diffStyleObjects(prodComponent.styles, localComponent.styles);
      const keys = Object.keys(overrides);
      if (keys.length) {
        const rule = computedOverridesToRule(prodComponent.selector, overrides);
        rule.media = viewportMedia;
        rule.reason = "computed_diff";
        rule.target = target.name;
        rule.resolution = resolution.key;
        rule.changedProps = keys;
        candidates.push(rule);
      }
    }
  }

  return dedupeRules(candidates.filter((rule) => !ruleExistsInIndex(rule, localIndex)));
}

function allTargets() {
  return [
    ...PRE_GAME_TARGETS,
    ...PAGE_TARGETS.map((pageId) => ({
      name: pageId,
      waitFor: `#${pageId}`,
      rootSelector: `#${pageId}`,
    })),
    ...MODAL_TARGETS.map((modal) => ({
      name: modal.name,
      waitFor: modal.waitFor,
      rootSelector: "#modal-root, .settings-modal-overlay, #quick-start-overlay, body",
      modal: true,
    })),
  ];
}

async function captureTargetAtResolution(productionPage, localPage, target, resolution) {
  await productionPage.setViewport({
    width: resolution.width,
    height: resolution.height,
    deviceScaleFactor: 1,
  });
  await localPage.setViewport({
    width: resolution.width,
    height: resolution.height,
    deviceScaleFactor: 1,
  });

  await prepareTargetPage(productionPage, target, PRODUCTION_URL);
  await prepareTargetPage(localPage, target, BASE_URL);

  const [productionComponents, localComponents] = await Promise.all([
    extractComponents(productionPage, target),
    extractComponents(localPage, target),
  ]);

  return { productionComponents, localComponents };
}

async function main() {
  setLogPrefix("ui-prod-fixes");
  if (!fs.existsSync(PRODUCTION_CSS_DIR)) {
    throw new Error("production CSS missing — run: npm run ui:production:reference");
  }

  const productionCorpus = loadCssCorpus([PRODUCTION_CSS_DIR]);
  const localCorpus = loadCssCorpus([PUBLIC_CSS_DIR], { exclude: ["prod_fixes.css"] });
  const localIndex = buildRuleIndex(localCorpus);
  const writer = new ProdFixesWriter({
    outputPath: PROD_FIXES_PATH,
    reportPath: PROD_FIXES_REPORT,
    sourceUrl: PRODUCTION_URL,
  });

  writer.init();
  logStep(`production css files: ${productionCorpus.length}, local css files: ${localCorpus.length}`);

  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const productionPage = await browser.newPage();
  const localPage = await browser.newPage();
  bindDialogAccept(productionPage);
  bindDialogAccept(localPage);

  try {
    for (const target of allTargets()) {
      logStep(`page ${target.name}: reviewing ${RESOLUTIONS.length} resolutions`);
      writer.ensurePageHeader(target.name);

      for (const resolution of RESOLUTIONS) {
        const label = `${resolution.key}/${target.name}`;
        try {
          const { productionComponents, localComponents } = await captureTargetAtResolution(
            productionPage,
            localPage,
            target,
            resolution
          );

          const pageRules = collectRulesForPage({
            productionComponents,
            localComponents,
            productionCorpus,
            localCorpus,
            localIndex,
            target,
            resolution,
          });

          const ruleCount = writer.replacePageSection(resolution.key, target.name, pageRules);
          writer.reportEntries.push({
            resolution: resolution.key,
            target: target.name,
            productionComponents: productionComponents.length,
            localComponents: localComponents.length,
            rulesAdded: ruleCount,
            totalRules: writer.rulesByFingerprint.size,
          });
          writer.saveReport();

          logStep(`${label}: ${ruleCount} rules → prod_fixes.css (${writer.rulesByFingerprint.size} total)`);
        } catch (error) {
          logStep(`WARN ${label}: ${error.message}`);
          writer.reportEntries.push({
            resolution: resolution.key,
            target: target.name,
            error: error.message,
          });
          writer.saveReport();
        }
      }

      logStep(`page ${target.name}: complete across all resolutions`);
    }
  } finally {
    await browser.close();
    writer.finalize();
  }

  console.log("\n=== Production CSS Fixes ===");
  console.log(`Output: ${PROD_FIXES_PATH}`);
  console.log(`Rules: ${writer.rulesByFingerprint.size}`);
  console.log(`Report: ${PROD_FIXES_REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
