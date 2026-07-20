import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  autoSaveGame,
  reloadPreservingStorage,
  readSessionSnapshot,
  claimOrAdvanceObjective,
} from "./helpers.js";

test.describe("S3 Save → kill tab → reload", () => {
  test("economy, grid, and objective index survive reload", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 2_000_000);
    await placePartOnGrid(page, "uranium1", 2, 2);
    await claimOrAdvanceObjective(page);

    const before = await readSessionSnapshot(page);
    expect(before.slotIds.includes("uranium1") || before.tileIds.includes("uranium1")).toBe(true);

    const saveJson = await page.evaluate(async () => {
      const state = await window.__reactorAudit.game.saveManager.getSaveState();
      return JSON.stringify(state);
    });
    expect(saveJson).toContain("uranium1");

    await autoSaveGame(page);
    await reloadPreservingStorage(page);

    const after = await readSessionSnapshot(page);
    expect(after.money).toBeCloseTo(before.money, 0);
    expect(after.slotIds.includes("uranium1") || after.tileIds.includes("uranium1")).toBe(true);
    expect(after.objectiveIndex).toBe(before.objectiveIndex);
  });
});
