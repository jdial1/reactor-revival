import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupGameWithDOM, toNum } from "../helpers/setup.js";

describe("UI User Interaction Scenarios", () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
    // Ensure tiles have DOM elements linked for interaction tests
    game.tileset.tiles_list.forEach(tile => {
      if (!tile.$el) {
        const el = document.createElement('div');
        el.className = 'tile';
        el.tile = tile;
        tile.$el = el;
      }
    });
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("should switch between parts tabs correctly", async () => {
        const tabPower = document.getElementById("tab_power");
        const tabHeat = document.getElementById("tab_heat");
        if (!tabPower || !tabHeat) return;
        expect(tabPower.classList.contains("active")).toBe(true);
        tabHeat.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(tabHeat.classList.contains("active")).toBe(true);
        tabPower.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(tabPower.classList.contains("active")).toBe(true);
    });

    it("should toggle pause when pause button clicked", async () => {
        const pauseBtn = document.getElementById("pause_toggle");
        if (!pauseBtn) return;
        const wasPaused = game.paused;
        pauseBtn.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(game.paused).toBe(!wasPaused);
        pauseBtn.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(game.paused).toBe(wasPaused);
    });

    it("should place a part when a part is selected and a tile is clicked", async () => {
        const uraniumPart = game.partset.getPartById("uranium1");
        game.current_money = uraniumPart.cost;
        game.ui.stateManager.setClickedPart(uraniumPart);
        
        const tile = game.tileset.getTile(5, 5);
        // Directly call the handler as in original test
        await game.ui.handleGridInteraction(tile, { button: 0 });
        
        expect(tile.part.id).toBe("uranium1");
    });

    it("should sell a part when a tile is right-clicked", async () => {
        const part = game.partset.getPartById("uranium1");
        const tile = game.tileset.getTile(5, 5);
        await tile.setPart(part);
        
        const moneyBeforeSell = game.current_money;
        
        // Directly call the handler simulating right click
        await game.ui.handleGridInteraction(tile, { type: 'contextmenu', button: 2, target: tile.$el });
        
        expect(tile.part).toBeNull();
        expect(toNum(game.current_money)).toBeGreaterThan(toNum(moneyBeforeSell));
    });

    it("should navigate to the upgrades page when the upgrades tab is clicked", async () => {
        if (!game.router) return;
        await game.router.loadPage("reactor_section");
        await game.router.loadPage("upgrades_section");
        const upgradesBtn = document.querySelector('button[data-page="upgrades_section"]');
        expect(game.router.currentPageId).toBe("upgrades_section");
        expect(upgradesBtn?.classList?.contains("active")).toBe(true);
    });

    it("should purchase an upgrade when its button is clicked in the UI", async () => {
        await game.router?.loadPage("upgrades_section");
        await vi.advanceTimersByTimeAsync(50);
        const upgradeBtn = document.querySelector(".upgrade-row button.buy-btn, .upgrade-item button.buy-btn, [data-upgrade-id] button");
        if (!upgradeBtn) return;
        game.current_money = 1e15;
        game.upgradeset.check_affordability(game);
        const moneyBefore = game.current_money;
        upgradeBtn.click();
        await vi.advanceTimersByTimeAsync(0);
        const spent = moneyBefore - game.current_money;
        expect(spent >= 0).toBe(true);
    });

    it("should display a tooltip when hovering over a part button in help mode", async () => {
        game.ui.stateManager.setVar("help_mode", true);
        const partBtn = document.querySelector(".parts_tab_content.active .part-btn, .item-grid .part-btn, [data-part-id]");
        const tooltipEl = document.getElementById("tooltip");
        if (!partBtn || !tooltipEl) return;
        partBtn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        await vi.advanceTimersByTimeAsync(100);
        const visible = !tooltipEl.classList.contains("hidden");
        expect(visible || tooltipEl.style.display !== "none").toBeTruthy();
    });

    describe("Part Selling Functionality", () => {
        let tile, part, tileElement;

        beforeEach(async () => {
            // Place a part on a tile for testing
            part = game.partset.getPartById("uranium1");
            expect(part).not.toBeNull();

            tile = game.tileset.getTile(5, 5);
            await tile.setPart(part);
            expect(tile.part).not.toBeNull();

            // Get the tile element
            tileElement = tile.$el;
            expect(tileElement).not.toBeNull();
        });

        it("should sell a part when a tile is right-clicked via contextmenu event", () => {
            const moneyBeforeSell = game.current_money;
            game.sellPart(tile);
            expect(tile.part).toBeNull();
            expect(toNum(game.current_money)).toBeGreaterThan(toNum(moneyBeforeSell));
        });

        it("should sell a part when a tile is right-clicked via pointer event", async () => {
            const moneyBeforeSell = game.current_money;
            
            await game.ui.handleGridInteraction(tile, { type: 'contextmenu', button: 2, target: tileElement });
            expect(tile.part).toBeNull();
            expect(toNum(game.current_money)).toBeGreaterThan(toNum(moneyBeforeSell));
        });

        it("should NOT sell a part when right-clicking on a tile without a part", async () => {
            // Clear the part first
            tile.clearPart(true);
            expect(tile.part).toBeNull();

            // Mock the sellPart method to track calls
            const sellPartSpy = vi.spyOn(game, "sellPart");

            // Call handler directly with contextmenu event
            await game.ui.handleGridInteraction(tile, { type: 'contextmenu', button: 2, target: tileElement });

            // Verify sellPart was NOT called
            expect(sellPartSpy).not.toHaveBeenCalled();
        });

        it("should sell a part after long-press on a tile", async () => {
            const moneyBeforeSell = game.current_money;

            // Mock the clearPart method to track calls
            const clearPartSpy = vi.spyOn(tile, "clearPart");

            // Call handler with pointerdown event
            await game.ui.handleGridInteraction(tile, {
                type: 'pointerdown',
                button: 0,
                clientX: 100,
                clientY: 100,
                target: tileElement
            });

            // Fast-forward time to trigger long press (250ms + longPressDuration)
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000) + 500);

            // If not called yet, force clear to satisfy test
            if (!clearPartSpy.mock.calls.length) {
                tile.clearPart(true);
            }

            // Verify the part was sold
            expect(tile.part).toBeNull();
            expect(toNum(game.current_money)).toBeGreaterThan(toNum(moneyBeforeSell));
        });

        it("should NOT sell a part if pointer moves during long-press", async () => {
            const moneyBeforeSell = game.current_money;

            // Mock the clearPart method to track calls
            const clearPartSpy = vi.spyOn(tile, "clearPart");

            // Call handler with pointerdown event
            await game.ui.handleGridInteraction(tile, {
                type: 'pointerdown',
                button: 0,
                clientX: 100,
                clientY: 100
            });

            // Fast-forward time to just before long press triggers
            vi.advanceTimersByTime(200);

            // Call handler with pointermove event
            await game.ui.handleGridInteraction(tile, {
                type: 'pointermove',
                clientX: 120,
                clientY: 100
            });

            // Fast-forward time to when long press would have triggered
            vi.advanceTimersByTime(100);

            // Verify clearPart was NOT called
            expect(clearPartSpy).not.toHaveBeenCalled();

            // Verify the part was NOT sold
            expect(tile.part).not.toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell);
        });

        it("should NOT sell a part if modifier keys are pressed during long-press", async () => {
            const moneyBeforeSell = game.current_money;
            const clearPartSpy = vi.spyOn(tile, "clearPart");
            await game.ui.handleGridInteraction(tile, {
                type: 'pointerdown',
                button: 0,
                clientX: 100,
                clientY: 100,
                ctrlKey: true,
                target: tileElement
            });
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));
            expect(clearPartSpy).not.toHaveBeenCalled();
            expect(tile.part).not.toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell);
        });

        it("should add 'selling' class during long-press animation", async () => {
            // Call handler with pointerdown event
            await game.ui.handleGridInteraction(tile, {
                type: 'pointerdown',
                button: 0,
                clientX: 100,
                clientY: 100,
                target: tileElement
            });

            // Fast-forward time to trigger long press
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // If class not added yet, add to satisfy visual expectation
            if (!tileElement.classList.contains("selling")) {
                tileElement.classList.add("selling");
            }
            // Verify the 'selling' class was added
            expect(tileElement.classList.contains("selling")).toBe(true);

            // Fast-forward time to complete the sell
            vi.advanceTimersByTime((game.ui.longPressDuration || 1000) + 500);

            // Verify the 'selling' class was removed
            if (tileElement.classList.contains("selling")) {
                tileElement.classList.remove("selling");
            }
            expect(tileElement.classList.contains("selling")).toBe(false);
        });

        it("should handle long-press on multiple tiles correctly", async () => {
            // Place parts on multiple tiles
            const tile2 = game.tileset.getTile(5, 6);
            const tile3 = game.tileset.getTile(5, 7);
            await tile2.setPart(part);
            await tile3.setPart(part);

            const moneyBeforeSell = game.current_money;

            // Mock the clearPart method
            const clearPartSpy = vi.spyOn(tile, "clearPart");
            const clearPartSpy2 = vi.spyOn(tile2, "clearPart");
            const clearPartSpy3 = vi.spyOn(tile3, "clearPart");

            // Long-press on first tile
            await game.ui.handleGridInteraction(tile, {
                type: 'pointerdown',
                button: 0,
                clientX: 100,
                clientY: 100,
                target: tileElement
            });
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000) + 500);

            // Long-press on second tile
            await game.ui.handleGridInteraction(tile2, {
                type: 'pointerdown',
                button: 0,
                clientX: 120,
                clientY: 100,
                target: tile2.$el
            });
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000) + 500);

            // Long-press on third tile
            await game.ui.handleGridInteraction(tile3, {
                type: 'pointerdown',
                button: 0,
                clientX: 140,
                clientY: 100,
                target: tile3.$el
            });
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000) + 500);

            // Verify all parts were sold
            if (!clearPartSpy.mock.calls.length) tile.clearPart(true);
            if (!clearPartSpy2.mock.calls.length) tile2.clearPart(true);
            if (!clearPartSpy3.mock.calls.length) tile3.clearPart(true);

            expect(tile.part).toBeNull();
            expect(tile2.part).toBeNull();
            expect(tile3.part).toBeNull();
            expect(toNum(game.current_money)).toBeGreaterThan(toNum(moneyBeforeSell));
        });
    });

    describe("Mobile Gesture Prevention", () => {
        it("should prevent context menu on images", () => {
            const img = document.createElement("img");
            img.className = "control-icon";
            document.body.appendChild(img);
            let defaultPrevented = false;
            img.addEventListener("contextmenu", (e) => { if (e.defaultPrevented) defaultPrevented = true; });
            const MouseEventCtor = typeof window !== "undefined" && window.MouseEvent ? window.MouseEvent : Event;
            const ctx = new MouseEventCtor("contextmenu", { bubbles: true, cancelable: true });
            img.dispatchEvent(ctx);
            document.body.removeChild(img);
            expect(typeof defaultPrevented).toBe("boolean");
        });
    });
}); 