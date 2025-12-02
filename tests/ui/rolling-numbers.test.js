import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from "../helpers/setup.js";

describe("Rolling Numbers UI", () => {
    let game;
    let ui;
    let window;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        ui = game.ui;
        window = setup.window;
        document = setup.document;
    });

    it("should initialize display values structure", () => {
        expect(ui.displayValues).toBeDefined();
        expect(ui.displayValues.money).toBeDefined();
        expect(ui.displayValues.heat).toBeDefined();
        expect(ui.displayValues.power).toBeDefined();
        expect(ui.displayValues.ep).toBeDefined();
    });

    it("should interpolate current value towards target value", () => {
        const moneyObj = ui.displayValues.money;
        moneyObj.current = 0;
        moneyObj.target = 1000;

        // Simulate 1 frame (approx 16ms)
        ui.updateRollingNumbers(16.667);

        expect(moneyObj.current).toBeGreaterThan(0);
        expect(moneyObj.current).toBeLessThan(1000);
        
        // Simulate many frames
        for(let i=0; i<60; i++) {
            ui.updateRollingNumbers(16.667);
        }

        // Should be very close or equal to target
        expect(moneyObj.current).toBeCloseTo(1000, -1); 
    });

    it("should snap to target when difference is small", () => {
        const moneyObj = ui.displayValues.money;
        moneyObj.target = 100;
        moneyObj.current = 99.95; // Within epsilon

        ui.updateRollingNumbers(16.667);

        expect(moneyObj.current).toBe(100);
    });

    it("should format large heat numbers with specific logic (2 decimals + suffix)", () => {
        const heatObj = ui.displayValues.heat;
        heatObj.current = 1499.9;
        heatObj.target = 1500;
        
        // Mock window width to desktop to force formatting check
        Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
        
        // Spy on textContent assignment essentially by checking DOM after update
        const heatEl = document.getElementById('info_heat_desktop');
        
        ui.updateRollingNumbers(16.667);
        
        expect(heatEl.textContent).toBe("1.50K");
    });

    it("should update target via state manager", () => {
        ui.stateManager.setVar('current_money', 5000);
        ui.processUpdateQueue();
        
        // The config onupdate should set the target
        expect(ui.displayValues.money.target).toBe(5000);
        // Current shouldn't change instantly
        expect(ui.displayValues.money.current).not.toBe(5000);
    });
});

