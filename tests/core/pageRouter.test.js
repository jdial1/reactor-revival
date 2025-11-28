import { describe, it, expect, beforeEach, vi, PageRouter, setupGameWithDOM } from "../helpers/setup.js";

describe("PageRouter Grid Transition", () => {
    let pageRouter;
    let ui;
    let game;

    beforeEach(async () => {
        vi.useFakeTimers();
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        pageRouter = game.router;
        
        // Ensure reactor element exists and has style
        if (ui.DOMElements.reactor) {
            ui.DOMElements.reactor.style.visibility = "visible";
        }
    });

    it("should hide grid when transitioning from upgrades to reactor", async () => {
        // Set current page to upgrades
        pageRouter.currentPageId = "upgrades_section";

        // Mock the page cache to simulate a cached reactor page
        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        // Call loadPage to transition to reactor
        await pageRouter.loadPage("reactor_section");

        // Check that the grid was hidden
        expect(ui.DOMElements.reactor.style.visibility).toBe("hidden");

        // Fast-forward time to trigger the visibility restoration (100ms for cached pages)
        vi.advanceTimersByTime(100);

        // Check that the grid is visible again
        expect(ui.DOMElements.reactor.style.visibility).toBe("visible");
    });

    it("should not hide grid when transitioning from other pages to reactor", async () => {
        // Set current page to about (not upgrades)
        pageRouter.currentPageId = "about_section";

        // Mock the page cache
        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        // Call loadPage to transition to reactor
        await pageRouter.loadPage("reactor_section");

        // Check that the grid was NOT hidden
        expect(ui.DOMElements.reactor.style.visibility).toBe("visible");
    });

    it("should handle missing reactor element gracefully", async () => {
        // Set current page to upgrades
        pageRouter.currentPageId = "upgrades_section";

        // Remove reactor element to simulate missing element
        delete ui.DOMElements.reactor;

        // Mock the page cache
        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        // This should not throw an error
        await expect(pageRouter.loadPage("reactor_section")).resolves.not.toThrow();
    });

    afterEach(() => {
        vi.useRealTimers();
    });
}); 