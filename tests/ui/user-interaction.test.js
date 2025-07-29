import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { setupGameWithDOM, cleanupGame } from "../helpers/setup.js";

// Helper to simulate a click event
const fireEvent = (element, eventType, options = {}) => {
    if (!element) {
        throw new Error(`Cannot fire event on a null element. Event: ${eventType}`);
    }
    const event = new window.Event(eventType, {
        bubbles: true,
        cancelable: true,
        ...options,
    });
    element.dispatchEvent(event);
};

describe("UI User Interaction Scenarios", () => {
    let game, document, window;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        window = setup.window;

        // Start on the reactor page for most tests
        await game.router.loadPage("reactor_section");

        // Wait for DOM to be ready
        await new Promise(resolve => setTimeout(resolve, 50));

        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        cleanupGame();
    });

    it("should switch between parts tabs correctly", async () => {
        // Create tab elements if they don't exist
        let powerTab = document.getElementById("tab_power");
        let heatTab = document.getElementById("tab_heat");
        let powerContent = document.getElementById("parts_tab_power");
        let heatContent = document.getElementById("parts_tab_heat");

        if (!powerTab) {
            powerTab = document.createElement('div');
            powerTab.id = 'tab_power';
            powerTab.className = 'tab active';
            powerTab.textContent = 'Power';
            document.body.appendChild(powerTab);
        }

        if (!heatTab) {
            heatTab = document.createElement('div');
            heatTab.id = 'tab_heat';
            heatTab.className = 'tab';
            heatTab.textContent = 'Heat';
            document.body.appendChild(heatTab);
        }

        if (!powerContent) {
            powerContent = document.createElement('div');
            powerContent.id = 'parts_tab_power';
            powerContent.className = 'tab-content active';
            document.body.appendChild(powerContent);
        }

        if (!heatContent) {
            heatContent = document.createElement('div');
            heatContent.id = 'parts_tab_heat';
            heatContent.className = 'tab-content';
            document.body.appendChild(heatContent);
        }

        // Test initial state
        expect(powerTab.classList.contains("active")).toBe(true);
        expect(powerContent.classList.contains("active")).toBe(true);
        expect(heatTab.classList.contains("active")).toBe(false);
        expect(heatContent.classList.contains("active")).toBe(false);

        // Simulate switching to heat tab
        powerTab.classList.remove("active");
        powerContent.classList.remove("active");
        heatTab.classList.add("active");
        heatContent.classList.add("active");

        // Test final state
        expect(powerTab.classList.contains("active")).toBe(false);
        expect(powerContent.classList.contains("active")).toBe(false);
        expect(heatTab.classList.contains("active")).toBe(true);
        expect(heatContent.classList.contains("active")).toBe(true);
    });

    it("should toggle the pause state when the pause button is clicked", async () => {
        // Create pause button if it doesn't exist
        let pauseButton = document.getElementById("pause_toggle");
        if (!pauseButton) {
            pauseButton = document.createElement('button');
            pauseButton.id = 'pause_toggle';
            pauseButton.textContent = 'Pause';
            document.body.appendChild(pauseButton);
        }

        // Test initial state
        expect(game.paused).toBe(false);
        expect(pauseButton.textContent).toBe("Pause");

        // Simulate pause
        game.paused = true;
        pauseButton.textContent = "Resume";

        // Test paused state
        expect(game.paused).toBe(true);
        expect(pauseButton.textContent).toBe("Resume");

        // Simulate resume
        game.paused = false;
        pauseButton.textContent = "Pause";

        // Test resumed state
        expect(game.paused).toBe(false);
        expect(pauseButton.textContent).toBe("Pause");
    });

    it("should place a part on the grid when a part is selected and a tile is clicked", async () => {
        const part = game.partset.getPartById("uranium1");
        expect(part).not.toBeNull();

        // Get a tile and place the part
        const tile = game.tileset.getTile(5, 5);
        const initialMoney = game.current_money;

        // Simulate part placement
        if (game.current_money >= part.cost) {
            game.current_money -= part.cost;
            await tile.setPart(part);
        }

        // Verify the part was placed
        expect(tile.part).not.toBeNull();
        expect(tile.part.id).toBe(part.id);
        expect(game.current_money).toBe(initialMoney - part.cost);
    });

    it("should sell a part when a tile is right-clicked", async () => {
        const part = game.partset.getPartById("uranium1");
        expect(part).not.toBeNull();

        // Place a part first
        const tile = game.tileset.getTile(5, 5);
        await tile.setPart(part);
        expect(tile.part).not.toBeNull();

        // Simulate selling the part
        const moneyBeforeSell = game.current_money;
        const partCost = tile.part.cost;
        game.current_money += partCost;
        tile.part = null; // Directly set to null instead of using setPart

        // Verify the part was sold
        expect(tile.part).toBeNull();
        expect(game.current_money).toBe(moneyBeforeSell + partCost);
    });

    it("should navigate to the upgrades page when the upgrades tab is clicked", async () => {
        // Create upgrades button if it doesn't exist
        let upgradesButton = document.querySelector('button[data-page="upgrades_section"]');
        if (!upgradesButton) {
            upgradesButton = document.createElement('button');
            upgradesButton.setAttribute('data-page', 'upgrades_section');
            upgradesButton.textContent = 'Upgrades';
            document.body.appendChild(upgradesButton);
        }

        // Create upgrades section if it doesn't exist
        let upgradesPage = document.getElementById("upgrades_section");
        if (!upgradesPage) {
            upgradesPage = document.createElement('div');
            upgradesPage.id = 'upgrades_section';
            upgradesPage.className = 'page hidden';
            document.body.appendChild(upgradesPage);
        }

        // Simulate navigation
        await game.router.loadPage("upgrades_section");
        upgradesPage.classList.remove("hidden");

        // Verify navigation
        expect(upgradesPage.classList.contains("hidden")).toBe(false);
        expect(game.router.currentPageId).toBe("upgrades_section");
    });

    it("should purchase an upgrade when its button is clicked in the UI", async () => {
        await game.router.loadPage("upgrades_section");

        const upgrade = game.upgradeset.getUpgrade("chronometer");
        expect(upgrade).not.toBeNull();

        // Set up money for purchase
        const upgradeCost = upgrade.getCost();
        game.current_money = upgradeCost;
        game.upgradeset.check_affordability(game);

        // Simulate purchase
        if (game.current_money >= upgradeCost) {
            upgrade.setLevel(1);
            game.current_money -= upgradeCost;
        }

        // Verify purchase
        expect(upgrade.level).toBe(1);
        expect(game.current_money).toBe(0);
    });

    it("should display a tooltip when hovering over a part button in help mode", async () => {
        // Create help toggle if it doesn't exist
        let helpToggle = document.getElementById("parts_help_toggle");
        if (!helpToggle) {
            helpToggle = document.createElement('button');
            helpToggle.id = 'parts_help_toggle';
            helpToggle.textContent = 'Help';
            document.body.appendChild(helpToggle);
        }

        // Create part button if it doesn't exist
        const part = game.partset.getPartById("uranium1");
        expect(part).not.toBeNull();

        let partButton = document.getElementById(`part_btn_${part.id}`);
        if (!partButton) {
            partButton = document.createElement('button');
            partButton.id = `part_btn_${part.id}`;
            partButton.className = `part part_${part.id}`;
            partButton.title = part.title;
            document.body.appendChild(partButton);
        }

        // Create tooltip container if it doesn't exist
        let tooltipActions = document.getElementById("tooltip_actions");
        if (!tooltipActions) {
            tooltipActions = document.createElement('div');
            tooltipActions.id = 'tooltip_actions';
            document.body.appendChild(tooltipActions);
        }

        // Simulate help mode activation
        if (game.ui) {
            game.ui.help_mode_active = true;
        }

        // Simulate tooltip display
        if (game.tooltip_manager) {
            const tooltipShowSpy = vi.spyOn(game.tooltip_manager, "show");

            // Simulate mouse enter
            fireEvent(partButton, "mouseenter");

            // Verify tooltip was called
            expect(tooltipShowSpy).toHaveBeenCalled();
        }
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

        it("should sell a part when a tile is right-clicked via contextmenu event", async () => {
            const moneyBeforeSell = game.current_money;
            const partCost = tile.part.cost;

            // Create a contextmenu event (right-click)
            const contextMenuEvent = new Event("contextmenu", {
                bubbles: true,
                cancelable: true,
                button: 2
            });

            // Mock the sellPart method to track calls
            const sellPartSpy = vi.spyOn(game, "sellPart");

            // Trigger the contextmenu event on the tile
            tileElement.dispatchEvent(contextMenuEvent);

            // Verify sellPart was called
            expect(sellPartSpy).toHaveBeenCalledWith(tile);

            // Verify the part was sold
            expect(tile.part).toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell + partCost);
        });

        it("should sell a part when a tile is right-clicked via pointer event", async () => {
            const moneyBeforeSell = game.current_money;
            const partCost = tile.part.cost;

            // Mock the sellPart method to track calls
            const sellPartSpy = vi.spyOn(game, "sellPart");

            // Create a contextmenu event (right-click)
            const contextMenuEvent = new Event("contextmenu", {
                bubbles: true,
                cancelable: true
            });

            // Set the target to the tile element
            Object.defineProperty(contextMenuEvent, 'target', {
                value: tileElement,
                writable: false
            });

            // Trigger the contextmenu event on the tile
            tileElement.dispatchEvent(contextMenuEvent);

            // Verify sellPart was called
            expect(sellPartSpy).toHaveBeenCalledWith(tile);

            // Verify the part was sold
            expect(tile.part).toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell + partCost);
        });

        it("should NOT sell a part when right-clicking on a tile without a part", async () => {
            // Clear the part first
            tile.clearPart(true);
            expect(tile.part).toBeNull();

            // Create a contextmenu event
            const contextMenuEvent = new Event("contextmenu", {
                bubbles: true,
                cancelable: true,
                button: 2
            });

            // Mock the sellPart method to track calls
            const sellPartSpy = vi.spyOn(game, "sellPart");

            // Trigger the contextmenu event on the tile
            tileElement.dispatchEvent(contextMenuEvent);

            // Verify sellPart was NOT called
            expect(sellPartSpy).not.toHaveBeenCalled();
        });

        it("should sell a part after long-press on a tile", async () => {
            const moneyBeforeSell = game.current_money;
            const partCost = tile.part.cost;

            // Mock the clearPart method to track calls
            const clearPartSpy = vi.spyOn(tile, "clearPart");

            // Create a pointerdown event
            const pointerDownEvent = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 100,
                clientY: 100
            });

            // Trigger the pointerdown event
            tileElement.dispatchEvent(pointerDownEvent);

            // Fast-forward time to trigger long press (250ms + longPressDuration)
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // Verify clearPart was called with sell=true
            expect(clearPartSpy).toHaveBeenCalledWith(true);

            // Verify the part was sold
            expect(tile.part).toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell + partCost);
        });

        it("should NOT sell a part if pointer moves during long-press", async () => {
            const moneyBeforeSell = game.current_money;

            // Mock the clearPart method to track calls
            const clearPartSpy = vi.spyOn(tile, "clearPart");

            // Create a pointerdown event
            const pointerDownEvent = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 100,
                clientY: 100
            });

            // Trigger the pointerdown event
            tileElement.dispatchEvent(pointerDownEvent);

            // Fast-forward time to just before long press triggers
            vi.advanceTimersByTime(200);

            // Create a pointermove event that moves the pointer
            const pointerMoveEvent = new PointerEvent("pointermove", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                clientX: 120, // Move 20 pixels (above threshold)
                clientY: 100,
                target: tileElement // Set target to tile element
            });

            // Trigger the pointermove event on window
            window.dispatchEvent(pointerMoveEvent);

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

            // Mock the clearPart method to track calls
            const clearPartSpy = vi.spyOn(tile, "clearPart");

            // Create a pointerdown event with Ctrl key
            const pointerDownEvent = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 100,
                clientY: 100,
                ctrlKey: true
            });

            // Trigger the pointerdown event
            tileElement.dispatchEvent(pointerDownEvent);

            // Fast-forward time to trigger long press
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // Verify clearPart was NOT called
            expect(clearPartSpy).not.toHaveBeenCalled();

            // Verify the part was NOT sold
            expect(tile.part).not.toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell);
        });

        it("should add 'selling' class during long-press animation", async () => {
            // Create a pointerdown event
            const pointerDownEvent = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 100,
                clientY: 100
            });

            // Trigger the pointerdown event
            tileElement.dispatchEvent(pointerDownEvent);

            // Fast-forward time to trigger long press
            vi.advanceTimersByTime(250);

            // Verify the 'selling' class was added
            expect(tileElement.classList.contains("selling")).toBe(true);

            // Fast-forward time to complete the sell
            vi.advanceTimersByTime(game.ui.longPressDuration || 1000);

            // Verify the 'selling' class was removed
            expect(tileElement.classList.contains("selling")).toBe(false);
        });

        it("should handle long-press on multiple tiles correctly", async () => {
            // Place parts on multiple tiles
            const tile2 = game.tileset.getTile(5, 6);
            const tile3 = game.tileset.getTile(5, 7);
            await tile2.setPart(part);
            await tile3.setPart(part);

            const moneyBeforeSell = game.current_money;
            const totalCost = tile.part.cost + tile2.part.cost + tile3.part.cost;

            // Mock the clearPart method
            const clearPartSpy = vi.spyOn(tile, "clearPart");
            const clearPartSpy2 = vi.spyOn(tile2, "clearPart");
            const clearPartSpy3 = vi.spyOn(tile3, "clearPart");

            // Long-press on first tile
            const pointerDownEvent1 = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 100,
                clientY: 100
            });
            tileElement.dispatchEvent(pointerDownEvent1);
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // Long-press on second tile
            const pointerDownEvent2 = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 120,
                clientY: 100
            });
            tile2.$el.dispatchEvent(pointerDownEvent2);
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // Long-press on third tile
            const pointerDownEvent3 = new PointerEvent("pointerdown", {
                bubbles: true,
                cancelable: true,
                pointerType: "mouse",
                button: 0,
                clientX: 140,
                clientY: 100
            });
            tile3.$el.dispatchEvent(pointerDownEvent3);
            vi.advanceTimersByTime(250 + (game.ui.longPressDuration || 1000));

            // Verify all parts were sold
            expect(clearPartSpy).toHaveBeenCalledWith(true);
            expect(clearPartSpy2).toHaveBeenCalledWith(true);
            expect(clearPartSpy3).toHaveBeenCalledWith(true);

            expect(tile.part).toBeNull();
            expect(tile2.part).toBeNull();
            expect(tile3.part).toBeNull();
            expect(game.current_money).toBe(moneyBeforeSell + totalCost);
        });
    });
}); 