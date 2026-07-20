import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  setToggle,
  speedUpSimulation,
  readSessionSnapshot,
  ensureReactorPage,
} from "./helpers.js";

test.describe("S9 Heat / power accrual with cells", () => {
  test("hull heat and stored power rise over time when a cell is running", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 1_000_000);
    await ensureReactorPage(page);

    await setToggle(page, "pause", false);
    await setToggle(page, "heat_control", false);
    await setToggle(page, "auto_sell", false);

    await placePartOnGrid(page, "uranium1", 2, 2);

    const before = await readSessionSnapshot(page);
    expect(before.slotIds.includes("uranium1")).toBe(true);
    expect(before.pause).toBe(false);

    await speedUpSimulation(page, 50);

    await page.waitForFunction(
      ({ heat0, power0 }) => {
        const game = window.__reactorAudit?.game;
        if (game?.paused) game.resume?.();
        const snap = game?.coreBridge?.getSnapshot?.() ?? game?.coreBridge?.session?.getSnapshot?.();
        const heat = Number(snap?.grid?.currentHeat ?? 0);
        const power = Number(snap?.grid?.currentPower ?? 0);
        return heat > heat0 && power > power0;
      },
      { heat0: before.heat, power0: before.power },
      { timeout: 30000 }
    );

    const after = await readSessionSnapshot(page);
    expect(after.heat).toBeGreaterThan(before.heat);
    expect(after.power).toBeGreaterThan(before.power);
  });
});
