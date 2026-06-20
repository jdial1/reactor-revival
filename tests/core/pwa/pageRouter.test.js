import { describe, it, expect, beforeEach, afterEach, vi, PageRouter, setupGameWithDOM } from "../../helpers/setup.js";
import { getPageReactor } from "@app/components/ui-components.js";

describe("PageRouter Grid Transition", () => {
    let pageRouter;
    let ui;
    let game;

    function getReactorEl() {
        return getPageReactor(ui);
    }

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        pageRouter = game.router;
        
        const reactor = getReactorEl();
        if (reactor) {
            reactor.style.visibility = "visible";
        }
        
        vi.useFakeTimers();
    }, 60000);

    it("should hide grid when transitioning from upgrades to reactor", async () => {
        pageRouter.currentPageId = "upgrades_section";

        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        await pageRouter.loadPage("reactor_section");

        const reactor = getReactorEl();
        expect(reactor?.style.visibility).toBe("hidden");

        vi.advanceTimersByTime(250);

        expect(getReactorEl()?.style.visibility).toBe("visible");
    });

    it("should not hide grid when transitioning from other pages to reactor", async () => {
        pageRouter.currentPageId = "about_section";

        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        await pageRouter.loadPage("reactor_section");

        expect(getReactorEl()?.style.visibility).toBe("visible");
    });

    it("should handle missing reactor element gracefully", async () => {
        pageRouter.currentPageId = "upgrades_section";

        const reactor = getReactorEl();
        if (reactor) reactor.remove();

        pageRouter.pageCache.set("reactor_section", {
            classList: {
                add: vi.fn(),
                remove: vi.fn()
            }
        });

        await expect(pageRouter.loadPage("reactor_section")).resolves.not.toThrow();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (game && game.engine) {
            game.engine.stop();
        }
    });
}); 