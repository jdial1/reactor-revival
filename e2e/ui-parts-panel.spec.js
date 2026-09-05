import { test, expect } from "@playwright/test";
import { bootGame, gotoPageViaRouter } from "./helpers.js";

// The "selected module / selected upgrade" readout was removed from the app.
// Nothing should render it on any page, in any selection state.
test.describe("Selected-detail readout is gone", () => {
  test.use({ viewport: { width: 412, height: 790 } });

  const leftovers = (page) =>
    page.evaluate(() => ({
      ids: ["parts_module_info", "upgrades_detail_panel", "research_detail_panel"].filter((id) =>
        document.getElementById(id),
      ),
      classes: [
        ".upgrade-hub-detail-panel",
        ".upgrade-hub-detail-empty",
        ".parts-module-info-panel",
        ".parts-module-info-empty",
        ".parts-module-info-close",
      ].filter((sel) => document.querySelector(sel)),
      placeholderText: document.body.innerText.match(/Select a[n]? (module|upgrade)/g) || [],
    }));

  test("absent on reactor, upgrades and research, selected or not", async ({ page }) => {
    page.on("dialog", (d) => d.accept().catch(() => {}));
    await bootGame(page);

    for (const pageId of ["reactor_section", "upgrades_section", "experimental_upgrades_section"]) {
      await gotoPageViaRouter(page, pageId);
      await page.waitForTimeout(500);
      const found = await leftovers(page);
      expect(found.ids, `detail panel elements on ${pageId}`).toEqual([]);
      expect(found.classes, `detail panel classes on ${pageId}`).toEqual([]);
      expect(found.placeholderText, `placeholder copy on ${pageId}`).toEqual([]);
    }

    // Selecting a part must not resurrect it.
    await gotoPageViaRouter(page, "reactor_section");
    await page.evaluate(() => {
      const ui = window.__reactorAudit?.ui;
      ui?.stateManager?.setClickedPart?.(
        window.__reactorAudit?.game?.partset?.getPartById?.("uranium1"),
      );
    });
    await page.waitForTimeout(600);
    const afterSelect = await leftovers(page);
    expect(afterSelect.ids, "detail panel after selecting a part").toEqual([]);
    expect(afterSelect.placeholderText, "placeholder after selecting a part").toEqual([]);
  });
});
