import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  exportImportRoundTrip,
  readSessionSnapshot,
} from "./helpers.js";

test.describe("S7 .reactor export/import round-trip", () => {
  test("getSaveState payload reloads grid and money", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 4_000_000);
    await placePartOnGrid(page, "uranium1", 3, 3);
    const before = await readSessionSnapshot(page);

    const raw = await exportImportRoundTrip(page);
    expect(raw).toContain("uranium1");

    const after = await readSessionSnapshot(page);
    expect(after.slotIds.includes("uranium1")).toBe(true);
    expect(after.money).toBeGreaterThan(0);
    expect(Math.abs(after.money - before.money)).toBeLessThan(before.money * 0.25 + 1);
  });
});
