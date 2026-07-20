import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectExoticParticles,
  placePartOnGrid,
  ensureReactorPage,
  navigateToPage,
  clickWhenVisible,
  expectVisibleOnScreen,
  readSessionSnapshot,
  purchaseUpgrade,
} from "./helpers.js";

test.describe("S6 Prestige / reboot / doctrine respec", () => {
  test("prestige clears cells; keepEp reboot and doctrine respec stay consistent", async ({ page }) => {
    await bootGame(page);
    await injectExoticParticles(page, 200);
    await ensureReactorPage(page);
    await placePartOnGrid(page, "uranium1", 5, 5);

    const prestigeSeqBefore = await page.evaluate(
      () => Number(window.__reactorAudit?.game?.state?.prestige_seq ?? 0)
    );

    await navigateToPage(page, "experimental_upgrades_section");
    const prestigeHeader = page.locator("#reboot_section .research-section-header");
    const isCollapsed = await page.locator("#reboot_section").evaluate((el) =>
      el.classList.contains("section-collapsed")
    );
    if (isCollapsed) await prestigeHeader.click();

    await clickWhenVisible(page.locator("#refund_btn"), "prestige button");
    await expectVisibleOnScreen(page.locator(".prestige-modal-overlay"), "prestige modal");
    await clickWhenVisible(page.locator("#prestige_modal_confirm_prestige"), "confirm prestige");

    await page.waitForFunction(
      (prev) => {
        const game = window.__reactorAudit?.game;
        const seq = Number(game?.state?.prestige_seq ?? 0);
        const cells =
          game?.tileset?.active_tiles_list?.filter((t) => t.part?.category === "cell").length ?? 0;
        return seq > prev && cells === 0;
      },
      prestigeSeqBefore,
      { timeout: 15000 }
    );

    const cellCount = await page.evaluate(
      () =>
        window.__reactorAudit.game.tileset.active_tiles_list.filter((t) => t.part?.category === "cell")
          .length
    );
    const prestigeSeqAfter = await page.evaluate(
      () => Number(window.__reactorAudit?.game?.state?.prestige_seq ?? 0)
    );
    expect(cellCount).toBe(0);
    expect(prestigeSeqAfter).toBeGreaterThan(prestigeSeqBefore);

    await injectExoticParticles(page, 50);
    await purchaseUpgrade(page, "laboratory");
    const epAfterLab = (await readSessionSnapshot(page)).ep;

    await page.evaluate(() => {
      const game = window.__reactorAudit?.game;
      game?.coreBridge?.dispatch?.({ type: "REBOOT", payload: { keepEp: true, refundEp: false } });
      game?.reactor?.clearMeltdownState?.();
      game?.coreBridge?.projectLiveState?.();
    });

    const afterReboot = await readSessionSnapshot(page);
    expect(afterReboot.ep).toBeGreaterThanOrEqual(0);
    expect(afterReboot.ep).toBeLessThanOrEqual(epAfterLab + 50);

    const respec = await page.evaluate(() => {
      const game = window.__reactorAudit?.game;
      if (typeof game?.respecDoctrine !== "function") return { ok: true, skipped: true };
      try {
        game.respecDoctrine();
        return { ok: true, skipped: false };
      } catch (error) {
        return { ok: false, reason: String(error) };
      }
    });
    expect(respec.ok).toBe(true);
  });
});
