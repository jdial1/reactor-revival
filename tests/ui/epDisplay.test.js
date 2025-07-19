import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupGameWithDOM } from '../helpers/setup.js';

describe('EP Info Bar Display', () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
    });

    afterEach(() => {
        if (game.engine) {
            game.engine.stop();
        }
    });

    it('should have EP display elements in DOM', () => {
        // Check that EP display elements exist
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");
        const mobileValueEl = document.getElementById("info_ep_value");
        const desktopValueEl = document.getElementById("info_ep_value_desktop");

        expect(mobileEl).toBeDefined();
        expect(desktopEl).toBeDefined();
        expect(mobileValueEl).toBeDefined();
        expect(desktopValueEl).toBeDefined();
    });

    it('should update EP display when exotic_particles state changes', () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");
        const mobileValueEl = document.getElementById("info_ep_value");
        const desktopValueEl = document.getElementById("info_ep_value_desktop");

        // Set EP to a positive value
        game.exotic_particles = 150;
        game.ui.stateManager.setVar("exotic_particles", 150);

        // Force the UI update queue to process
        game.ui.processUpdateQueue();

        // Check that EP display elements are visible
        expect(mobileEl.style.display).not.toBe("none");
        expect(desktopEl.style.display).not.toBe("none");
        expect(mobileValueEl.textContent).toBe("150");
        expect(desktopValueEl.textContent).toBe("150");
    });

    it('should hide EP display when EP is zero', () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");

        // Set EP to zero
        game.exotic_particles = 0;
        game.ui.stateManager.setVar("exotic_particles", 0);

        // Check that EP display elements are hidden
        expect(mobileEl.style.display).toBe("none");
        expect(desktopEl.style.display).toBe("none");
    });

    it('should show EP display immediately when loading saved game with EP', () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");
        const mobileValueEl = document.getElementById("info_ep_value");
        const desktopValueEl = document.getElementById("info_ep_value_desktop");

        // Simulate loading a saved game with EP
        const savedData = {
            exotic_particles: 250,
            total_exotic_particles: 500,
            current_exotic_particles: 250,
            current_money: 1000,
            rows: 3,
            cols: 3,
            tiles: [],
            upgrades: [],
            objectives: { current_objective_index: 0 },
            toggles: {}
        };

        // Apply the saved state
        game.applySaveState(savedData);

        // Force the UI update queue to process
        game.ui.processUpdateQueue();

        // Check that EP display elements are immediately visible
        expect(mobileEl.style.display).not.toBe("none");
        expect(desktopEl.style.display).not.toBe("none");
        expect(mobileValueEl.textContent).toBe("250");
        expect(desktopValueEl.textContent).toBe("250");
    });
}); 