import puppeteer from "puppeteer";

const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
const HEADLESS = process.env.HEADED !== "1";
const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);
const MODAL_TIMEOUT_MS = Number(process.env.MODAL_TIMEOUT_MS || 8000);
const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 400);

const PAGE_IDS = [
  "reactor_section",
  "upgrades_section",
  "experimental_upgrades_section",
  "leaderboard_section",
  "about_section",
  "soundboard_section",
  "privacy_policy_section",
  "terms_of_service_section",
];

const SETTINGS_TAB_IDS = [
  "settings_tab_audio_btn",
  "settings_tab_visuals_btn",
  "settings_tab_system_btn",
  "settings_tab_data_btn",
];

const IGNORE_CONSOLE_PATTERNS = [
  /^Failed to load resource: the server responded with a status of 404/,
  /favicon\.ico/,
  /localhost:3000\/health/,
  /ERR_CONNECTION_REFUSED/,
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStep(message) {
  console.log(`[ui-console-audit] ${message}`);
}

function shouldIgnoreConsole(text) {
  return IGNORE_CONSOLE_PATTERNS.some((pattern) => pattern.test(text));
}

class IssueCollector {
  constructor() {
    this.entries = [];
    this.currentStep = "init";
  }

  setStep(step) {
    this.currentStep = step;
  }

  add(kind, message, context = {}) {
    this.entries.push({
      kind,
      message: String(message),
      context: { ...context, step: context.step ?? this.currentStep },
      at: new Date().toISOString(),
    });
  }

  countByKind() {
    const counts = {};
    for (const entry of this.entries) {
      counts[entry.kind] = (counts[entry.kind] || 0) + 1;
    }
    return counts;
  }

  hasErrors() {
    return this.entries.some(
      (e) =>
        e.kind === "console.error" ||
        e.kind === "pageerror" ||
        e.kind === "requestfailed" ||
        e.kind === "runner.error"
    );
  }
}

function attachDiagnostics(page, collector) {
  page.on("console", (msg) => {
    const type = msg.type();
    if (type !== "error" && type !== "warning") return;
    const text = msg.text();
    if (shouldIgnoreConsole(text)) return;
    collector.add(`console.${type}`, text, { location: msg.location() });
  });

  page.on("pageerror", (error) => {
    collector.add("pageerror", error?.message || String(error), { stack: error?.stack });
  });

  page.on("requestfailed", (request) => {
    const failure = request.failure();
    const url = request.url();
    if (url.includes("favicon") || url.includes("localhost:3000/health")) return;
    collector.add("requestfailed", `${failure?.errorText || "failed"} ${url}`, {
      resourceType: request.resourceType(),
    });
  });

  page.on("response", (response) => {
    const status = response.status();
    if (status < 400) return;
    const url = response.url();
    if (url.includes("favicon") || url.includes("analytics") || url.includes("localhost:3000")) return;
    collector.add("http.error", `${status} ${url}`);
  });
}

async function waitForSelector(page, selector, timeout = NAV_TIMEOUT_MS) {
  return page.waitForSelector(selector, { visible: true, timeout });
}

async function waitForSelectorOptional(page, selector, timeout = MODAL_TIMEOUT_MS) {
  try {
    return await page.waitForSelector(selector, { visible: true, timeout });
  } catch {
    return null;
  }
}

async function domClick(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing selector: ${sel}`);
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
  }, selector);
}

async function clickWhenReady(page, selector, timeout = NAV_TIMEOUT_MS) {
  await waitForSelector(page, selector, timeout);
  await domClick(page, selector);
  await delay(STEP_DELAY_MS);
}

async function clickIfPresent(page, selector) {
  const exists = await page.$(selector);
  if (!exists) return false;
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ block: "center", inline: "center" });
      el.click();
    }
  }, selector);
  await delay(STEP_DELAY_MS);
  return true;
}

async function runStep(collector, label, fn) {
  collector.setStep(label);
  logStep(label);
  try {
    await fn();
  } catch (error) {
    const message = error?.message || String(error);
    collector.add("runner.error", message, { stack: error?.stack });
    logStep(`WARN: ${label} — ${message}`);
  }
}

function bindDialogAccept(page) {
  page.on("dialog", async (dialog) => {
    try {
      await dialog.accept();
    } catch (_) {}
  });
}

async function clearGameStorage(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  });
}

async function startNewGame(page) {
  await clickWhenReady(page, "#splash-new-game-btn");

  const hasSetup = await page.$("#game-setup-overlay:not(.hidden)");
  if (hasSetup) {
    await clickWhenReady(page, "button[data-difficulty='easy']");
    await clickWhenReady(page, ".setup-start-btn:not([disabled])");
  }

  await page.waitForFunction(
    () => {
      const wrapper = document.getElementById("wrapper");
      return wrapper && !wrapper.classList.contains("hidden");
    },
    { timeout: NAV_TIMEOUT_MS }
  );
  await delay(STEP_DELAY_MS);
}

async function dismissBlockingModals(page) {
  for (const id of ["#quick-start-close", "#quick-start-close-2", "#welcome-back-close"]) {
    if (await clickIfPresent(page, id)) break;
  }
  await clickIfPresent(page, ".modal-close-btn");
}

async function navigateToGamePage(page, pageId) {
  await page.evaluate(async (id) => {
    const current = window.game?.router?.currentPageId;
    if (current === id) return;

    const isVisible = (el) => el && (el.offsetParent !== null || el.getClientRects().length > 0);

    const bottomBtn = document.querySelector(`#bottom_nav button[data-page="${id}"]`);
    if (isVisible(bottomBtn)) {
      bottomBtn.click();
      return;
    }

    const topBtn = document.querySelector(`#main_top_nav button[data-page="${id}"]`);
    if (isVisible(topBtn)) {
      topBtn.click();
      return;
    }

    const router = window.pageRouter || window.game?.router;
    if (router?.loadPage) await router.loadPage(id, true);
    else window.location.hash = id;
  }, pageId);
  await delay(STEP_DELAY_MS * 2);
}

async function waitForPageVisible(page, pageId) {
  await page.waitForFunction(
    (id) => {
      const section = document.getElementById(id);
      return section && !section.classList.contains("hidden");
    },
    { timeout: NAV_TIMEOUT_MS },
    pageId
  );
}

async function openSettingsModal(page) {
  await page.evaluate(() => {
    const orchestrator = window.ui?.modalOrchestrator;
    if (orchestrator?.showModal) {
      orchestrator.showModal("settings");
      return;
    }
    const settingsBtn = document.getElementById("settings_btn");
    if (settingsBtn) settingsBtn.click();
    else document.getElementById("menu_tab_btn")?.click();
  });
  await delay(STEP_DELAY_MS);
}

async function closeSettingsModal(page) {
  await page.evaluate(() => {
    const orchestrator = window.ui?.modalOrchestrator;
    if (orchestrator?.hideModal) orchestrator.hideModal("settings");
  });
  await clickIfPresent(page, ".settings-modal-overlay .modal-close-btn");
  await delay(STEP_DELAY_MS);
}

async function exerciseSettingsModal(page, collector) {
  const hasSettingsControl = await page.evaluate(() => {
    return !!(
      window.ui?.modalOrchestrator ||
      document.getElementById("settings_btn") ||
      document.getElementById("menu_tab_btn")
    );
  });
  if (!hasSettingsControl) {
    logStep("settings modal skipped (no settings control in DOM)");
    return;
  }

  await openSettingsModal(page);
  const overlay = await waitForSelectorOptional(page, ".settings-modal-overlay, #modal-root .settings-modal");
  if (!overlay) {
    collector.add("runner.warn", "Settings modal did not open within timeout", {});
    logStep("settings modal did not open — skipping tab exercise");
    return;
  }

  for (const tabId of SETTINGS_TAB_IDS) {
    await clickIfPresent(page, `#${tabId}`);
  }

  await closeSettingsModal(page);
}

async function exerciseReactorUi(page) {
  await clickIfPresent(page, "#parts_sheet_handle");
  await clickIfPresent(page, "button.parts_tab[aria-label='Heat Management']");
  await clickIfPresent(page, "button.parts_tab[aria-label='Power Creation']");

  if (await page.$("#cells button, #cells .part")) {
    await page.evaluate(() => document.querySelector("#cells button, #cells .part")?.click());
    await delay(STEP_DELAY_MS);
  }

  if (await page.$("#reactor .tile")) {
    await page.evaluate(() => document.querySelector("#reactor .tile")?.click());
    await delay(STEP_DELAY_MS);
  }

  await clickIfPresent(page, "#reactor_blueprint_toggle");
  await clickIfPresent(page, "#reactor_copy_paste_toggle");
  await clickIfPresent(page, "#reactor_deselect_btn");
}

async function exerciseUpgradesPage(page) {
  if (await page.$(".upgrade:not([disabled])")) {
    await page.evaluate(() => document.querySelector(".upgrade:not([disabled])")?.click());
    await delay(STEP_DELAY_MS);
  }
}

async function exerciseExperimentalPage(page) {
  if (await page.$(".ep-upgrade:not([disabled]), .upgrade:not([disabled])")) {
    await page.evaluate(() =>
      document.querySelector(".ep-upgrade:not([disabled]), .upgrade:not([disabled])")?.click()
    );
    await delay(STEP_DELAY_MS);
  }
}

async function runUiWalkthrough(page, collector) {
  await runStep(collector, "splash:load", async () => {
    await clearGameStorage(page);
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await page.waitForSelector("#splash-new-game-btn, #app_root", { timeout: NAV_TIMEOUT_MS });
    await delay(STEP_DELAY_MS * 2);
  });

  await runStep(collector, "new-game", () => startNewGame(page));
  await runStep(collector, "modals:dismiss", () => dismissBlockingModals(page));

  for (const pageId of PAGE_IDS) {
    await runStep(collector, `page:${pageId}:navigate`, async () => {
      await navigateToGamePage(page, pageId);
      await waitForPageVisible(page, pageId);
    });

    if (pageId === "reactor_section") {
      await runStep(collector, `page:${pageId}:reactor-ui`, () => exerciseReactorUi(page));
      await runStep(collector, `page:${pageId}:settings`, () => exerciseSettingsModal(page, collector));
    } else if (pageId === "upgrades_section") {
      await runStep(collector, `page:${pageId}:upgrades`, () => exerciseUpgradesPage(page));
    } else if (pageId === "experimental_upgrades_section") {
      await runStep(collector, `page:${pageId}:research`, () => exerciseExperimentalPage(page));
    }

    await delay(STEP_DELAY_MS);
  }

  await runStep(collector, "return-reactor", async () => {
    await navigateToGamePage(page, "reactor_section");
    await waitForPageVisible(page, "reactor_section");
    await delay(STEP_DELAY_MS);
  });
}

function printReport(collector) {
  const counts = collector.countByKind();
  const total = collector.entries.length;

  console.log("\n=== UI Console Audit ===");
  console.log(`URL: ${BASE_URL}`);
  console.log(`Issues captured: ${total}`);

  if (total === 0) {
    console.log("No console errors, page errors, or failed requests detected.");
    return;
  }

  console.log("By kind:", counts);
  console.log("\nDetails:");
  for (const entry of collector.entries) {
    const ctx = entry.context?.step ? ` [${entry.context.step}]` : "";
    console.log(`- ${entry.kind}${ctx}: ${entry.message}`);
  }
}

async function main() {
  logStep(`starting (headless=${HEADLESS}, url=${BASE_URL})`);
  const collector = new IssueCollector();
  const browser = await puppeteer.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--autoplay-policy=no-user-gesture-required",
    ],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  attachDiagnostics(page, collector);
  bindDialogAccept(page);

  try {
    await runUiWalkthrough(page, collector);
  } finally {
    await browser.close();
  }

  printReport(collector);
  process.exitCode = collector.hasErrors() ? 1 : 0;
}

main();
