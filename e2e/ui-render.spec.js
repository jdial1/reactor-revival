import { test, expect } from "@playwright/test";
import { bootGame, gotoPageViaRouter, expectVisibleOnScreen } from "./helpers.js";
import { PAGE_TARGETS, MODAL_TARGETS } from "./viewports.js";

// Renders every page and modal at the project's viewport, asserts nothing crashed
// or collapsed, and attaches the capture to the Playwright report.
//
// Replaces scripts/ui-audit/ui-screenshots.js + ui-screenshot-capture.js +
// ui-screenshot-hashes.js. The old hash baseline (tests/ui/screenshot-baseline.json)
// shipped with zero hashes, so its verify step always short-circuited as "skipped";
// the only assertion it made in practice was "all 49 views rendered".

async function expectNoCriticalStartupFailure(page, context) {
  const failure = await page.evaluate(() => {
    const overlay = document.getElementById("critical-error-overlay");
    if (!overlay) return null;
    return {
      title: overlay.querySelector(".critical-error-title")?.textContent?.trim() || "",
      message: overlay.querySelector(".critical-error-message")?.textContent?.trim() || "",
    };
  });
  expect(
    failure,
    `critical startup overlay present at ${context}: ${failure?.title ?? ""} ${failure?.message ?? ""}`
  ).toBeNull();
}

async function capture(page, testInfo, name) {
  await testInfo.attach(`${testInfo.project.name}_${name}.png`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
}

// A landscape phone is the tightest vertical budget the game ships into: the
// fixed mobile chrome once totalled ~333px in a 390px-tall viewport, leaving the
// reactor grid about 100px tall. Guard the share of height the grid actually gets.
test.describe("Short-viewport reactor budget", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("reactor keeps a usable share of a landscape phone", async ({ page }) => {
    await bootGame(page);
    await gotoPageViaRouter(page, "reactor_section");

    const share = await page.evaluate(() => {
      const wrapper = document.querySelector("#reactor_wrapper");
      if (!wrapper) return 0;
      return wrapper.getBoundingClientRect().height / window.innerHeight;
    });

    expect(share, "reactor wrapper share of a 390px-tall viewport").toBeGreaterThan(0.35);
  });
});

test.describe("UI renders at every supported viewport", () => {
  test("pages and modals render without crashing", async ({ page }, testInfo) => {
    await bootGame(page);
    await expectNoCriticalStartupFailure(page, "boot");

    for (const pageId of PAGE_TARGETS) {
      await gotoPageViaRouter(page, pageId);
      await expectVisibleOnScreen(page.locator(`#${pageId}`), `page ${pageId}`);
      await expectNoCriticalStartupFailure(page, `page ${pageId}`);
      await capture(page, testInfo, pageId);
    }

    await gotoPageViaRouter(page, "reactor_section");

    for (const modal of MODAL_TARGETS) {
      await modal.open(page);
      await expectVisibleOnScreen(
        page.locator(modal.waitFor).first(),
        `modal ${modal.name}`,
        { timeout: 8000 }
      );
      await expectNoCriticalStartupFailure(page, `modal ${modal.name}`);
      await capture(page, testInfo, modal.name);
      await modal.close(page);
    }
  });
});
