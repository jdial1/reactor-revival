import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  forceWelcomeBackModal,
  readSessionSnapshot,
} from "./helpers.js";

test.describe("S4 Welcome-Back FF", () => {
  test("fast-forward does not clobber money or EP to zero", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 3_000_000);
    await placePartOnGrid(page, "uranium1", 0, 0);

    const seeded = await readSessionSnapshot(page);
    expect(seeded.money).toBeGreaterThan(0);

    const beforeFf = await forceWelcomeBackModal(page);
    const after = await readSessionSnapshot(page);

    expect(after.money).toBeGreaterThan(0);
    expect(after.money).toBeGreaterThanOrEqual(beforeFf.money * 0.5);
    expect(after.ep).toBeGreaterThanOrEqual(0);
    expect(after.melted).toBe(false);
  });
});
