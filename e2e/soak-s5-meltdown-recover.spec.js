import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartDirect,
  speedUpSimulation,
  readRecoveredBlueprintNames,
  expectVisibleOnScreen,
  readSessionSnapshot,
} from "./helpers.js";

test.describe("S5 Meltdown → Recovered Blueprint → resume", () => {
  test("stores Recovered Blueprint before clear; session remains addressable", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        await placePartDirect(page, "plutonium1", r, c);
      }
    }

    await speedUpSimulation(page, 20);
    await page.waitForFunction(
      () => document.getElementById("wrapper")?.classList.contains("reactor-meltdown"),
      { timeout: 60000 }
    );
    await expectVisibleOnScreen(page.locator("#meltdown_banner"), "meltdown banner", { timeout: 5000 });

    await page.waitForFunction(
      () => {
        try {
          const raw = localStorage.getItem("reactor_my_layouts");
          const list = raw ? JSON.parse(raw) : [];
          return (Array.isArray(list) ? list : []).some((e) => e?.name === "Recovered Blueprint");
        } catch {
          return false;
        }
      },
      { timeout: 15000 }
    );

    const names = await readRecoveredBlueprintNames(page);
    expect(names).toContain("Recovered Blueprint");

    await page.evaluate(() => {
      const game = window.__reactorAudit?.game;
      game?.reactor?.clearMeltdownState?.();
      document.getElementById("wrapper")?.classList.remove("reactor-meltdown");
      document.getElementById("app_root")?.classList.remove("crt-heat-tearing");
    });

    const snap = await readSessionSnapshot(page);
    expect(snap.melted).toBe(false);
    expect(Number.isFinite(snap.money)).toBe(true);
  });
});
