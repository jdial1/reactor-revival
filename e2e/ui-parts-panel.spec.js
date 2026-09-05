import { test, expect } from "@playwright/test";
import { bootGame, gotoPageViaRouter } from "./helpers.js";

// The module readout costs ~150px of a phone screen, so it only renders while a
// part is selected and carries a corner control to clear the selection again.
// Pinned to a phone viewport: the parts sidebar is display:none on desktop.
test.describe("Parts module readout", () => {
  test.use({ viewport: { width: 412, height: 790 } });

  const state = (page) =>
    page.evaluate(() => ({
      present: !!document.getElementById("parts_module_info"),
      hasClose: !!document.querySelector(".parts-module-info-close"),
      selectedPartId: window.__reactorAudit?.ui?.uiState?.interaction?.selectedPartId ?? null,
    }));

  test("appears only with a selection and the corner control clears it", async ({ page }) => {
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await bootGame(page);
    await gotoPageViaRouter(page, "reactor_section");
    await page.waitForTimeout(500);

    expect((await state(page)).present, "hidden when nothing is selected").toBe(false);

    await page.evaluate(() => {
      const ui = window.__reactorAudit?.ui;
      ui?.stateManager?.setClickedPart?.(
        window.__reactorAudit?.game?.partset?.getPartById?.("uranium1"),
      );
    });
    await page.waitForTimeout(500);

    const selected = await state(page);
    expect(selected.present, "shown once a part is selected").toBe(true);
    expect(selected.hasClose, "corner deselect is rendered").toBe(true);

    await page.locator(".parts-module-info-close").click({ timeout: 5000 });
    await page.waitForTimeout(500);

    const after = await state(page);
    expect(after.present, "corner control hides the readout").toBe(false);
    expect(after.selectedPartId, "corner control clears the selection").toBeNull();
  });
});
