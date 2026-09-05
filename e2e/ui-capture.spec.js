import { test } from "@playwright/test";
import fs from "fs";
import path from "path";
import { bootGame, gotoPageViaRouter, E2E_URL, clearGameStorage } from "./helpers.js";
import { PAGE_TARGETS, MODAL_TARGETS, SETTINGS_TAB_IDS } from "./viewports.js";

// Design-review capture: writes full-page PNGs for every screen at every viewport
// and orientation, for a human (or Claude) to eyeball. Opt-in via UI_SHOT_DIR so a
// normal `npm run test:e2e` never pays for it.
//
//   UI_SHOT_DIR=./shots npx playwright test -c config/playwright.config.mjs e2e/ui-capture.spec.js

const OUT = process.env.UI_SHOT_DIR;

// Portrait bases; each is also captured rotated. Desktop sizes are landscape-only.
const PORTRAIT = [
  { key: "phone", w: 390, h: 844 },
  { key: "phablet", w: 576, h: 960 },
  { key: "tablet", w: 768, h: 1024 },
];
const LANDSCAPE_ONLY = [
  { key: "laptop", w: 1280, h: 800 },
  { key: "widescreen", w: 1920, h: 1080 },
];

const VIEWPORTS = [
  ...PORTRAIT.flatMap((v) => [
    { name: `${v.key}-portrait`, width: v.w, height: v.h },
    { name: `${v.key}-landscape`, width: v.h, height: v.w },
  ]),
  ...LANDSCAPE_ONLY.map((v) => ({ name: `${v.key}-landscape`, width: v.w, height: v.h })),
];

test.describe("UI capture", () => {
  test.skip(!OUT, "set UI_SHOT_DIR to capture design-review screenshots");
  // One project is enough; this spec drives viewports itself.
  // eslint-disable-next-line no-empty-pattern
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "1920x1080", "capture runs once");
  });

  for (const vp of VIEWPORTS) {
    test(`capture ${vp.name}`, async ({ page }) => {
      test.setTimeout(180000);
      const dir = path.resolve(OUT);
      fs.mkdirSync(dir, { recursive: true });
      const shot = async (name) => {
        await page.screenshot({ path: path.join(dir, `${vp.name}__${name}.png`) });
      };

      // "NEW RUN" over an existing save raises a confirm(); accept it rather than
      // letting Playwright's default dismissal stall the boot.
      page.on("dialog", (d) => d.accept().catch(() => {}));

      await page.setViewportSize({ width: vp.width, height: vp.height });

      // Splash, before any game exists.
      await clearGameStorage(page);
      await page.goto(E2E_URL, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#splash-new-game-btn", { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(1200);
      await shot("00-splash");

      // clearGameStorage only clears once per session (it guards on a
      // sessionStorage flag), so reset that flag before bootGame reloads --
      // otherwise the splash comes back with a save and bootGame stalls.
      await page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          globalThis.indexedDB?.deleteDatabase?.("keyval-store");
        } catch (_) { /* storage unavailable */ }
      });

      await bootGame(page);

      for (const [i, pageId] of PAGE_TARGETS.entries()) {
        await gotoPageViaRouter(page, pageId);
        await page.waitForTimeout(500);
        await shot(`${String(i + 1).padStart(2, "0")}-${pageId}`);
      }

      await gotoPageViaRouter(page, "reactor_section");

      // Settings modal, one capture per tab.
      await page.evaluate(() => {
        window.__reactorAudit?.ui?.modalOrchestrator?.showModal?.("settings");
      });
      await page.waitForTimeout(700);
      for (const tabId of SETTINGS_TAB_IDS) {
        await page.locator(`#${tabId}`).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(500);
        await shot(`10-settings-${tabId.replace("settings_tab_", "").replace("_btn", "")}`);
      }
      await page.evaluate(() => {
        window.__reactorAudit?.ui?.modalOrchestrator?.hideModal?.("settings");
      });

      // Remaining modals.
      for (const modal of MODAL_TARGETS.filter((m) => m.name !== "settings")) {
        await modal.open(page);
        await page.waitForTimeout(700);
        await shot(`11-modal-${modal.name}`);
        await modal.close(page);
      }
    });
  }
});
