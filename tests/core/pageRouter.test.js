import { describe, it, expect, beforeEach, vi } from "vitest";
import { PageRouter } from "../../js/pageRouter.js";
import { UI } from "../../js/ui.js";
import { Game } from "../../js/game.js";

describe("PageRouter Grid Transition", () => {
    let pageRouter;
    let ui;
    let game;

    beforeEach(async () => {
        // Set up fake timers
        vi.useFakeTimers();

        // Create mock DOM elements
        const mockReactorElement = {
            style: {
                visibility: "visible"
            }
        };

        const mockDOMElements = {
            reactor: mockReactorElement
        };

        // Create UI mock
        ui = {
            DOMElements: mockDOMElements,
            resizeReactor: vi.fn(),
            showObjectivesForPage: vi.fn(),
            initializePage: vi.fn()
        };

        // Create game mock
        game = {
            engine: {
                start: vi.fn(),
                stop: vi.fn()
            },
            reactor: {
                has_melted_down: false
            },
            ui: {
                stateManager: {
                    getVar: vi.fn().mockReturnValue(false) // Not manually paused
                }
            }
        };

        ui.game = game;

        // Create page router
        pageRouter = new PageRouter(ui);

        // Mock DOM methods
        global.document = {
            querySelector: vi.fn().mockImplementation((selector) => {
                if (selector === "#page_content_area") {
                    return {
                        appendChild: vi.fn(),
                        classList: {
                            add: vi.fn(),
                            remove: vi.fn(),
                            contains: vi.fn().mockReturnValue(true)
                        }
                    };
                }
                if (selector === "#main_top_nav" || selector === "#bottom_nav") {
                    return {
                        querySelectorAll: vi.fn().mockReturnValue([])
                    };
                }
                return null;
            }),
            getElementById: vi.fn().mockReturnValue({
                classList: {
                    toggle: vi.fn()
                }
            })
        };

        global.window = {
            location: {
                hash: ""
            }
        };

        // Mock document.body
        global.document.body = {
            className: "",
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        };
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

        // Fast-forward time to trigger the visibility restoration
        vi.advanceTimersByTime(250);

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