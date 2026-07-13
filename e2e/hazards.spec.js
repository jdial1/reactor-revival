import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  expectAchievement,
  speedUpSimulation,
  expectVisibleOnScreen,
} from "./helpers.js";

test.describe("Hazard & Meltdown Mechanics", () => {
  test("Unplanned Disassembly: Component explodes due to heat", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page);

    await placePartOnGrid(page, "vent1", 5, 6);
    await placePartOnGrid(page, "plutonium1", 5, 5);

    await speedUpSimulation(page, 100);

    await expectAchievement(page, "Unplanned Disassembly", { timeout: 60000 });

    await expectVisibleOnScreen(page.locator(".explosion-emf-overlay").first(), "explosion overlay", { timeout: 10000 });
  });

  test("Not Great, Not Terrible: Core Meltdown", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page);

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        await placePartOnGrid(page, "plutonium1", r, c);
      }
    }

    await speedUpSimulation(page, 20);

    await expect(page.locator("#app_root")).toHaveClass(/crt-heat-tearing/, { timeout: 30000 });

    await page.waitForFunction(
      () => document.getElementById("wrapper")?.classList.contains("reactor-meltdown"),
      { timeout: 60000 }
    );
    await expectVisibleOnScreen(page.locator("#meltdown_banner"), "meltdown banner", { timeout: 5000 });

    await expectAchievement(page, "Not Great, Not Terrible", { timeout: 30000 });
  });
});
