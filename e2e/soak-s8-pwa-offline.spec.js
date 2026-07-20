import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  assertManifestAndSwApi,
  readSessionSnapshot,
  autoSaveGame,
} from "./helpers.js";

test.describe("S8 PWA install surface + short offline session", () => {
  test("manifest + SW API present; offline does not wipe session money", async ({ page, context }) => {
    await bootGame(page);
    await injectFunds(page, 1_000_000);
    await placePartOnGrid(page, "uranium1", 0, 1);
    await autoSaveGame(page);

    const pwa = await assertManifestAndSwApi(page);
    expect(pwa.hasServiceWorkerApi).toBe(true);

    const before = await readSessionSnapshot(page);
    await context.setOffline(true);
    await page.waitForTimeout(300);
    const mid = await readSessionSnapshot(page);
    expect(mid.money).toBeGreaterThan(0);
    expect(mid.money).toBeGreaterThanOrEqual(before.money * 0.9);
    expect(mid.slotIds.includes("uranium1") || mid.tileIds.includes("uranium1")).toBe(true);

    await context.setOffline(false);
    const after = await readSessionSnapshot(page);
    expect(after.money).toBeGreaterThan(0);
  });
});
