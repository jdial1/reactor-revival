import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  sellPartAt,
  ventHullHeat,
  setToggle,
  purchaseUpgrade,
  readSessionSnapshot,
  dispatchSession,
  ensureReactorPage,
} from "./helpers.js";

test.describe("S2 Place / sell / vent / toggle / buy upgrade", () => {
  test("each control once; session snapshot matches deck actions", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 5_000_000);
    await ensureReactorPage(page);

    await placePartOnGrid(page, "uranium1", 1, 1);
    let snap = await readSessionSnapshot(page);
    expect(snap.slotIds.includes("uranium1")).toBe(true);

    await placePartOnGrid(page, "vent1", 1, 2);
    await sellPartAt(page, 1, 2);
    snap = await readSessionSnapshot(page);
    expect(snap.slotIds.includes("vent1")).toBe(false);

    await page.evaluate(() => {
      const bridge = window.__reactorAudit?.game?.coreBridge;
      const session = bridge?.session;
      if (session?.grid) session.grid.currentHeat = 50;
    });
    const heatBefore = (await readSessionSnapshot(page)).heat;
    await ventHullHeat(page);
    snap = await readSessionSnapshot(page);
    expect(snap.heat).toBeLessThan(heatBefore);

    await setToggle(page, "pause", true);
    snap = await readSessionSnapshot(page);
    expect(snap.pause).toBe(true);
    await setToggle(page, "pause", false);

    await purchaseUpgrade(page, "chronometer");
    const chrono = await page.evaluate(
      () => window.__reactorAudit?.game?.upgradeset?.getUpgrade("chronometer")?.level ?? 0
    );
    expect(chrono).toBeGreaterThanOrEqual(1);

    await page.evaluate(() => {
      const game = window.__reactorAudit?.game;
      if (game?.paused) game.resume?.();
      const session = game?.coreBridge?.session;
      for (let i = 0; i < 3; i++) session?.tick?.();
      game?.coreBridge?.projectLiveState?.();
    });
    const charged = await readSessionSnapshot(page);
    expect(charged.power).toBeGreaterThan(0);

    const sellPower = await dispatchSession(page, "SELL_POWER", {});
    expect(sellPower.ok).toBe(true);
    const afterSell = await readSessionSnapshot(page);
    expect(afterSell.power).toBe(0);

    const finalSnap = await readSessionSnapshot(page);
    expect(finalSnap.money).toBeGreaterThan(0);
    expect(finalSnap.slotIds.includes("uranium1")).toBe(true);
  });
});
