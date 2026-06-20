export const BASE_URL = process.env.BASE_URL || "http://localhost:8080";
export const HEADLESS = process.env.HEADED !== "1";
export const NAV_TIMEOUT_MS = Number(process.env.NAV_TIMEOUT_MS || 45000);
export const PAGE_WAIT_MS = Number(process.env.PAGE_WAIT_MS || 5000);
export const MODAL_TIMEOUT_MS = Number(process.env.MODAL_TIMEOUT_MS || 8000);
export const STEP_DELAY_MS = Number(process.env.STEP_DELAY_MS || 400);

export const PAGE_IDS = [
  "reactor_section",
  "upgrades_section",
  "experimental_upgrades_section",
  "leaderboard_section",
  "about_section",
  "soundboard_section",
  "privacy_policy_section",
  "terms_of_service_section",
];

export const SETTINGS_TAB_IDS = [
  "settings_tab_audio_btn",
  "settings_tab_visuals_btn",
  "settings_tab_system_btn",
  "settings_tab_data_btn",
];

let logPrefix = "ui-audit";

export function setLogPrefix(prefix) {
  logPrefix = prefix;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function logStep(message) {
  console.log(`[${logPrefix}] ${message}`);
}

export async function waitForSelector(page, selector, timeout = NAV_TIMEOUT_MS) {
  return page.waitForSelector(selector, { visible: true, timeout });
}

export async function waitForSelectorOptional(page, selector, timeout = MODAL_TIMEOUT_MS) {
  try {
    return await page.waitForSelector(selector, { visible: true, timeout });
  } catch {
    return null;
  }
}

export async function domClick(page, selector) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Missing selector: ${sel}`);
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
  }, selector);
}

export async function clickWhenReady(page, selector, timeout = NAV_TIMEOUT_MS) {
  await waitForSelector(page, selector, timeout);
  await domClick(page, selector);
  await delay(STEP_DELAY_MS);
}

export async function clickIfPresent(page, selector) {
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

export async function runStep(collector, label, fn) {
  collector?.setStep?.(label);
  logStep(label);
  try {
    await fn();
  } catch (error) {
    const message = error?.message || String(error);
    const isTimeout = error?.name === "TimeoutError" || /exceeded|Waiting failed/i.test(message);
    const kind = isTimeout ? "runner.warn" : "runner.error";
    collector?.add?.(kind, message, { stack: error?.stack });
    logStep(`WARN: ${label} — ${message}`);
  }
}

export async function clickNavButton(page, selector) {
  const handle = await page.$(selector);
  if (!handle) return false;
  try {
    await handle.click({ delay: 30, force: true });
    return true;
  } catch {
    return false;
  }
}

export async function navigateToGamePage(page, pageId) {
  const current = await page.evaluate(() => window.game?.router?.currentPageId);
  if (current === pageId) return;

  const routed = await page.evaluate(async (id) => {
    const router = window.game?.router;
    if (router?.loadPage) {
      await router.loadPage(id, true);
      return router.currentPageId === id;
    }
    window.location.hash = id;
    return window.location.hash.replace(/^#/, "") === id;
  }, pageId);

  if (!routed) {
    const selectors = [
      `#main_top_nav button[data-page="${pageId}"]`,
      `#bottom_nav button[data-page="${pageId}"]`,
    ];

    for (const selector of selectors) {
      if (await clickNavButton(page, selector)) {
        await delay(STEP_DELAY_MS * 2);
        break;
      }
    }
  } else {
    await delay(STEP_DELAY_MS * 2);
  }

  try {
    await page.waitForFunction(
      (id) => {
        if (window.game?.router?.currentPageId === id) return true;
        const section = document.getElementById(id);
        return section && !section.classList.contains("hidden");
      },
      { timeout: PAGE_WAIT_MS },
      pageId
    );
  } catch {
    const actual = await page.evaluate(() => window.game?.router?.currentPageId);
    logStep(`nav timeout for ${pageId} (router at ${actual ?? "unknown"})`);
  }
}

export function bindDialogAccept(page) {
  page.on("dialog", async (dialog) => {
    try {
      await dialog.accept();
    } catch (_) {}
  });
}

export async function clearGameStorage(page) {
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
  });
}

export async function startNewGame(page) {
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

export async function dismissBlockingModals(page) {
  for (const id of ["#quick-start-close", "#quick-start-close-2", "#welcome-back-close"]) {
    if (await clickIfPresent(page, id)) break;
  }
  await clickIfPresent(page, ".modal-close-btn");
}

export async function openSettingsModal(page) {
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

export async function closeSettingsModal(page) {
  await page.evaluate(() => {
    const orchestrator = window.ui?.modalOrchestrator;
    if (orchestrator?.hideModal) orchestrator.hideModal("settings");
  });
  await clickIfPresent(page, ".settings-modal-overlay .modal-close-btn");
  await delay(STEP_DELAY_MS);
}

export async function openQuickStartModal(page) {
  await page.evaluate(() => {
    window.ui?.modalOrchestrator?.showModal?.("quickStart", { game: window.game });
  });
  await delay(STEP_DELAY_MS);
}

export async function closeQuickStartModal(page) {
  await clickIfPresent(page, "#quick-start-close");
  await clickIfPresent(page, "#quick-start-close-2");
  await page.evaluate(() => {
    window.ui?.modalOrchestrator?.hideModal?.("quickStart");
  });
  await delay(STEP_DELAY_MS);
}

export async function exerciseSettingsModal(page, collector) {
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
    collector?.add?.("runner.warn", "Settings modal did not open within timeout", {});
    logStep("settings modal did not open — skipping tab exercise");
    return;
  }

  for (const tabId of SETTINGS_TAB_IDS) {
    await clickIfPresent(page, `#${tabId}`);
  }

  await closeSettingsModal(page);
}

export async function exerciseReactorUi(page) {
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

export async function exerciseUpgradesPage(page) {
  if (await page.$(".upgrade:not([disabled])")) {
    await page.evaluate(() => document.querySelector(".upgrade:not([disabled])")?.click());
    await delay(STEP_DELAY_MS);
  }
}

export async function exerciseExperimentalPage(page) {
  if (await page.$(".ep-upgrade:not([disabled]), .upgrade:not([disabled])")) {
    await page.evaluate(() =>
      document.querySelector(".ep-upgrade:not([disabled]), .upgrade:not([disabled])")?.click()
    );
    await delay(STEP_DELAY_MS);
  }
}

export async function prepareGameSession(page) {
  await clearGameStorage(page);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
  await page.waitForSelector("#splash-new-game-btn, #app_root", { timeout: NAV_TIMEOUT_MS });
  await delay(STEP_DELAY_MS * 2);
  await startNewGame(page);
  await dismissBlockingModals(page);
}
