import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  injectExoticParticles,
  placePartOnGrid,
  claimOrAdvanceObjective,
  readSessionSnapshot,
  navigateToPage,
  purchaseUpgrade,
  expectVisibleOnScreen,
} from "./helpers.js";

test.describe("S1 Fresh install → chapter teach → prestige-relevant gate", () => {
  test("places first cell, advances objective, unlocks laboratory teach", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 1_000_000);

    const before = await readSessionSnapshot(page);
    expect(before.objectiveIndex).toBe(0);

    await placePartOnGrid(page, "uranium1", 0, 0);
    await claimOrAdvanceObjective(page);

    await page.waitForFunction(
      () => (window.__reactorAudit?.game?.objectives_manager?.current_objective_index ?? 0) >= 1,
      { timeout: 15000 }
    );

    const afterCell = await readSessionSnapshot(page);
    expect(afterCell.objectiveIndex).toBeGreaterThanOrEqual(1);
    expect(afterCell.slotIds.some((id) => id === "uranium1")).toBe(true);

    await injectExoticParticles(page, 100);
    await navigateToPage(page, "experimental_upgrades_section");
    await purchaseUpgrade(page, "laboratory");
    await expectVisibleOnScreen(page.locator("#experimental_upgrades_section"), "experimental hub");

    const labLevel = await page.evaluate(
      () => window.__reactorAudit?.game?.upgradeset?.getUpgrade("laboratory")?.level ?? 0
    );
    expect(labLevel).toBeGreaterThanOrEqual(1);
  });
});
