import { test, expect } from "@playwright/test";
import { bootGame, gotoPageViaRouter } from "./helpers.js";
import {
  AUDIT_PROJECT_KEY,
  PAGE_TARGETS,
  EXTRA_CONSOLE_PAGES,
  SETTINGS_TAB_IDS,
} from "./viewports.js";

// Console-health walkthrough + layout regression assertions.
// Replaces scripts/ui-audit/ui-console-audit.js and ui-layout-audit.js.
//
// Both run once at the canonical viewport rather than once per project.

const IGNORED_CONSOLE = [
  /^Failed to load resource: the server responded with a status of 404/,
  /favicon/,
  /localhost:3000\/health/,
  /ERR_CONNECTION_REFUSED/,
  /analytics/,
];

const isIgnored = (text) => IGNORED_CONSOLE.some((pattern) => pattern.test(text));

function collectPageIssues(page) {
  const issues = [];
  const add = (kind, message) => {
    if (!isIgnored(message)) issues.push(`${kind}: ${message}`);
  };

  page.on("console", (msg) => {
    if (msg.type() === "error") add("console.error", msg.text());
  });
  page.on("pageerror", (error) => add("pageerror", error?.message || String(error)));
  page.on("requestfailed", (request) =>
    add("requestfailed", `${request.failure()?.errorText || "failed"} ${request.url()}`)
  );
  page.on("response", (response) => {
    if (response.status() >= 400) add("http.error", `${response.status()} ${response.url()}`);
  });

  return issues;
}

// Playwright requires the first hook parameter to be a destructuring pattern,
// so the empty pattern here is mandated by the framework, not an oversight.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, testInfo) => {
  test.skip(
    testInfo.project.name !== AUDIT_PROJECT_KEY,
    `single-run audit; pinned to the ${AUDIT_PROJECT_KEY} project`
  );
});

test.describe("UI console audit", () => {
  test("full walkthrough produces no page errors or failed requests", async ({ page }) => {
    const issues = collectPageIssues(page);

    await bootGame(page);

    for (const pageId of [...PAGE_TARGETS, ...EXTRA_CONSOLE_PAGES]) {
      await gotoPageViaRouter(page, pageId);
    }

    await gotoPageViaRouter(page, "reactor_section");

    // Exercise the settings modal tabs, historically the richest source of
    // lazy-render errors.
    await page.evaluate(() => {
      window.__reactorAudit?.ui?.modalOrchestrator?.showModal?.("settings");
    });
    for (const tabId of SETTINGS_TAB_IDS) {
      await page.locator(`#${tabId}`).click({ timeout: 4000 }).catch(() => {});
    }
    await page.evaluate(() => {
      window.__reactorAudit?.ui?.modalOrchestrator?.hideModal?.("settings");
    });

    const criticalOverlay = await page.locator("#critical-error-overlay").count();
    expect(criticalOverlay, "critical startup overlay was rendered").toBe(0);
    expect(issues, `UI walkthrough reported issues:\n${issues.join("\n")}`).toEqual([]);
  });
});

test.describe("Layout regressions", () => {
  test("research content is reachable at tablet-landscape", async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await gotoPageViaRouter(page, "experimental_upgrades_section");

    const result = await page.evaluate(() => {
      const lab = document.getElementById("experimental_laboratory");
      const wrapper = document.getElementById("experimental_upgrades_content_wrapper");
      const area = document.getElementById("page_content_area");
      if (!lab || !wrapper) return { ok: false, reason: "research DOM missing" };

      const scrollRoot =
        [wrapper, area].filter(Boolean).find((el) => {
          const overflow = getComputedStyle(el).overflowY;
          return overflow === "auto" || overflow === "scroll";
        }) || wrapper;

      const overflow = getComputedStyle(scrollRoot).overflowY;
      const canScroll = overflow === "auto" || overflow === "scroll";
      const needsScroll = scrollRoot.scrollHeight > scrollRoot.clientHeight + 2;
      if (!needsScroll) return { ok: true };
      if (!canScroll) return { ok: false, reason: "no scroll affordance on content wrapper" };

      const labBottom = lab.offsetTop + lab.offsetHeight;
      return labBottom <= scrollRoot.scrollHeight + 1
        ? { ok: true }
        : { ok: false, reason: "laboratory below scroll range" };
    });

    expect(result.ok, `research/laboratory unreachable: ${result.reason}`).toBe(true);
  });

  test("EP status panels are not clipped on reactor or research", async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 1024, height: 768 });

    for (const pageId of ["reactor_section", "experimental_upgrades_section"]) {
      await gotoPageViaRouter(page, pageId);
      const failures = await page.evaluate(() => {
        const found = [];
        for (const panel of document.querySelectorAll(".ep-status-panel")) {
          const style = getComputedStyle(panel);
          if (style.display === "none" || style.visibility === "hidden") continue;
          const rect = panel.getBoundingClientRect();
          if (rect.height < 4) found.push("zero-height panel");
          if (rect.top < -2) found.push("panel above viewport");
          if (rect.bottom > window.innerHeight + 2) found.push("panel below viewport");
        }
        return found;
      });
      expect(failures, `EP hazard panel clipped on ${pageId}`).toEqual([]);
    }
  });

  test("leaderboard layout column header reads 'Layout'", async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoPageViaRouter(page, "leaderboard_section");

    const header = page.locator(".leaderboard-col-layout");
    if ((await header.count()) === 0) test.skip(true, "leaderboard table not rendered");
    expect((await header.first().textContent())?.trim()).toBe("Layout");
  });

  test("bottom nav exposes accessible labels", async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 390, height: 844 });

    const failures = await page.evaluate(() => {
      const expected = [
        { page: "reactor_section", label: "Reactor (Core)" },
        { page: "upgrades_section", label: "Upgrades (Mods)" },
        { page: "experimental_upgrades_section", label: "Research (Tech)" },
      ];
      const found = [];
      for (const { page: pageId, label } of expected) {
        const btn = document.querySelector(`#bottom_nav button[data-page="${pageId}"]`);
        if (!btn) found.push(`missing ${pageId}`);
        else if (btn.getAttribute("aria-label") !== label) {
          found.push(`${pageId} aria-label=${btn.getAttribute("aria-label")}`);
        }
      }
      return found;
    });

    expect(failures, "bottom nav a11y labels").toEqual([]);
  });

  test("page chrome never overflows the viewport width", async ({ page }) => {
    await bootGame(page);

    // #wrapper.page-reactor #main carries a 275px padding-left for the desktop
    // parts rail. Without box-sizing:border-box that padding was added to a
    // width:100% box, pushing the reactor page 275px off the right edge at
    // every width >= 901px.
    for (const [w, h] of [[960, 576], [1024, 768], [1280, 800], [1920, 1080]]) {
      await page.setViewportSize({ width: w, height: h });
      await gotoPageViaRouter(page, "reactor_section");
      const over = await page.evaluate(() => {
        const main = document.querySelector("#main");
        return {
          mainOverflow: main ? Math.round(main.getBoundingClientRect().width) - window.innerWidth : 0,
          docOverflow: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(over.mainOverflow, `#main overflows at ${w}x${h}`).toBeLessThanOrEqual(0);
      expect(over.docOverflow, `document overflows at ${w}x${h}`).toBeLessThanOrEqual(0);
    }
  });

  test("desktop hull info bar keeps its label/icon/value structure", async ({ page }) => {
    await bootGame(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoPageViaRouter(page, "reactor_section");

    const result = await page.evaluate(() => {
      const hull = document.querySelector(".info-bar-desktop .info-item.hull");
      if (!hull || getComputedStyle(hull).display === "none") return { skipped: true };
      const value = hull.querySelector("#info_hull_desktop");
      return {
        hasLabel: !!hull.querySelector(".stats-inline-label"),
        hasIcon: !!hull.querySelector("img.icon"),
        hasValue: !!value && value.classList.contains("value"),
      };
    });

    if (result.skipped) test.skip(true, "desktop info bar hidden at this viewport");
    expect(result).toEqual({ hasLabel: true, hasIcon: true, hasValue: true });
  });
});
