import { test, expect } from "@playwright/test";
import {
  bootGame,
  injectFunds,
  placePartOnGrid,
  placePartsOnGrid,
  expectAchievement,
  speedUpSimulation,
  waitForAchievementUnlock,
  toggleBlueprintMode,
  refreshBlueprintProjection,
  applyBlueprintPlan,
  expectOneVisibleOnScreen,
  expectVisibleOnScreen,
} from "./helpers.js";

test.describe("Engineering & Blueprints", () => {
  test("Measure Twice: Blueprint mode calculates net heat correctly", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 50_000_000);

    await toggleBlueprintMode(page);

    await placePartOnGrid(page, "uranium1", 0, 0);
    await placePartOnGrid(page, "vent1", 0, 1);

    const sample = await refreshBlueprintProjection(page);
    expect(sample?.stats_power ?? 0).toBeGreaterThan(0);

    const stabilityText = page.locator("#blueprint_planner_stability");
    await expectVisibleOnScreen(stabilityText, "blueprint stability");
    await expect(stabilityText).toHaveText(/(Stable|Balanced)/, { timeout: 15000 });

    await expectAchievement(page, "Measure Twice", { timeout: 60000 });

    const applied = await applyBlueprintPlan(page);
    expect(applied.ok).toBe(true);
    await expect(page.locator("#wrapper")).not.toHaveClass(/blueprint-planner-active/);
  });

  test("Thermodynamic Equilibrium: Net Heat 0 at high power", async ({ page }) => {
    await bootGame(page);
    await injectFunds(page, 50_000_000);

    const placements = [{ partId: "thorium1", row: 0, col: 0 }];
    for (let i = 0; i < 6; i++) placements.push({ partId: "heat_outlet2", row: 1, col: i });
    for (let i = 0; i < 12; i++) placements.push({ partId: "heat_outlet1", row: 2, col: i });
    for (let i = 0; i < 2; i++) placements.push({ partId: "vent1", row: 3, col: i });
    await placePartsOnGrid(page, placements);

    await speedUpSimulation(page, 50);

    await waitForAchievementUnlock(page, "ach_thermo_equilibrium", { timeout: 120000 });
    await expectAchievement(page, "Thermodynamic Equilibrium");

    const powerReadout = await expectOneVisibleOnScreen(
      page,
      ["#info_power_desktop", "#info_power", ".passive-top-power .value"],
      "power readout"
    );
    await expect(powerReadout).not.toHaveText(/^0$/);
    await expectVisibleOnScreen(page.locator("#ui_views_heat_strip_host"), "heat strip");
  });
});
