import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectExoticParticles,
  placePartOnGrid,
  expectAchievement,
  navigateToPage,
  purchaseUpgrade,
  ensureReactorPage,
  expandUpgradeHubSection,
  expectVisibleOnScreen,
  clickWhenVisible,
} from "./helpers.js";

test.describe("Discovery & Prestige", () => {
  test("Closed-Door Research: Unlocking the Lab", async ({ page }) => {
    await bootGame(page);
    await injectExoticParticles(page, 100);

    await navigateToPage(page, "experimental_upgrades_section");
    await purchaseUpgrade(page, "laboratory");

    await expectAchievement(page, "Closed-Door Research");

    const labLevel = await page.evaluate(
      () => window.__reactorAudit?.game?.upgradeset?.getUpgrade("laboratory")?.level ?? 0
    );
    expect(labLevel).toBeGreaterThanOrEqual(1);

    await expandUpgradeHubSection(page, "Experimental Parts & Cells");
    await expectVisibleOnScreen(page.locator("#experimental_parts"), "experimental parts group");
  });

  test("Nuclear Disarmament: Prestige with 1 Cell", async ({ page }) => {
    await bootGame(page);

    await injectExoticParticles(page, 100);
    await ensureReactorPage(page);
    await placePartOnGrid(page, "uranium1", 5, 5);

    await navigateToPage(page, "experimental_upgrades_section");

    const prestigeHeader = page.locator("#reboot_section .research-section-header");
    const isCollapsed = await page.locator("#reboot_section").evaluate(el => el.classList.contains("section-collapsed"));
    if (isCollapsed) {
      await prestigeHeader.click();
    }

    await clickWhenVisible(page.locator("#refund_btn"), "prestige button");

    await expectVisibleOnScreen(page.locator(".prestige-modal-overlay"), "prestige modal");

    await clickWhenVisible(page.locator("#prestige_modal_confirm_prestige"), "confirm prestige");

    const cellCount = await page.evaluate(
      () =>
        window.__reactorAudit.game.tileset.active_tiles_list.filter((t) => t.part?.category === "cell")
          .length
    );
    expect(cellCount).toBe(0);

    await expectAchievement(page, "Nuclear Disarmament");
  });
});
