import puppeteer from "puppeteer";
import {
  BASE_URL,
  HEADLESS,
  NAV_TIMEOUT_MS,
  PAGE_IDS,
  STEP_DELAY_MS,
  setLogPrefix,
  delay,
  logStep,
  bindDialogAccept,
  navigateToGamePage,
  prepareGameSession,
  exerciseSettingsModal,
  exerciseReactorUi,
  exerciseUpgradesPage,
  exerciseExperimentalPage,
  runStep,
  CRITICAL_STARTUP_FAIL_KIND,
  collectorHasFatalIssues,
} from "./ui-audit-core.js";

const IGNORE_CONSOLE_PATTERNS = [
  /^Failed to load resource: the server responded with a status of 404/,
  /favicon\.ico/,
  /localhost:3000\/health/,
  /ERR_CONNECTION_REFUSED/,
];

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

  hasMatchingKinds(kinds) {
    if (!kinds.length) return false;
    return this.entries.some((e) => kinds.includes(e.kind));
  }
}

const DEFAULT_FAIL_KINDS = ["console.error", "pageerror", "requestfailed", "http.error", CRITICAL_STARTUP_FAIL_KIND];

function getFailKinds() {
  const raw = process.env.AUDIT_FAIL_ON;
  if (!raw) return DEFAULT_FAIL_KINDS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
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

async function runUiWalkthrough(page, collector) {
  await runStep(collector, "splash:load", () => prepareGameSession(page), page);

  for (const pageId of PAGE_IDS) {
    await runStep(collector, `page:${pageId}:navigate`, () => navigateToGamePage(page, pageId), page);

    if (pageId === "reactor_section") {
      await runStep(collector, `page:${pageId}:reactor-ui`, () => exerciseReactorUi(page), page);
      await runStep(collector, `page:${pageId}:settings`, () => exerciseSettingsModal(page, collector), page);
    } else if (pageId === "upgrades_section") {
      await runStep(collector, `page:${pageId}:upgrades`, () => exerciseUpgradesPage(page), page);
    } else if (pageId === "experimental_upgrades_section") {
      await runStep(collector, `page:${pageId}:research`, () => exerciseExperimentalPage(page), page);
    }

    await delay(STEP_DELAY_MS);
  }

  await runStep(collector, "return-reactor", () => navigateToGamePage(page, "reactor_section"), page);
}

function printReport(collector, failKinds) {
  const counts = collector.countByKind();
  const total = collector.entries.length;
  const pageErrorCount = collector.entries.filter((e) => e.kind === "pageerror").length;

  console.log("\n=== UI Console Audit ===");
  console.log(`URL: ${BASE_URL}`);
  console.log(`Fail on kinds: ${failKinds.join(", ")}`);
  console.log(`Issues captured: ${total} (pageerrors: ${pageErrorCount})`);

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

  if (collector.hasMatchingKinds(failKinds) || collector.hasMatchingKinds([CRITICAL_STARTUP_FAIL_KIND])) {
    console.log("\nAudit FAILED: matching issue kinds detected.");
  }
}

async function main() {
  setLogPrefix("ui-console-audit");
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
  } catch (error) {
    if (error?.name !== "CriticalStartupError") throw error;
  } finally {
    await browser.close();
  }

  const failKinds = getFailKinds();
  printReport(collector, failKinds);
  process.exitCode = collectorHasFatalIssues(collector, failKinds) ? 1 : 0;
}

main();
