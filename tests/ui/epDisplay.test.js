import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM } from '../helpers/setup.js';

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

    it('should update EP display when exotic_particles are generated', async () => {
        game.engine.start();
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");
        const mobileValueEl = document.getElementById("info_ep_value");
        const desktopValueEl = document.getElementById("info_ep_value_desktop");

        const pa = game.partset.getPartById('particle_accelerator1');
        const paTile = game.tileset.getTile(0, 2);
        pa.ep_heat = 1000;
        await paTile.setPart(pa);
        paTile.heat_contained = 1000;

        game.engine.tick();
        expect(game.exotic_particles).toBeGreaterThan(0);

        game.ui.processUpdateQueue();
        const mobileContent = mobileEl.querySelector('.ep-content');
        const desktopContent = desktopEl.querySelector('.ep-content');
        expect(mobileContent.style.display).not.toBe("none");
        expect(desktopContent.style.display).not.toBe("none");
    });

    it('should hide EP display when EP is zero', () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");

        game.ui.stateManager.setVar("current_exotic_particles", 10); // Use current_exotic_particles
        game.ui.processUpdateQueue();

        // FIX: Check the inner content element, not the parent
        expect(mobileEl.querySelector('.ep-content').style.display).not.toBe("none");
        expect(desktopEl.querySelector('.ep-content').style.display).not.toBe("none");

        game.ui.stateManager.setVar("current_exotic_particles", 0); // Use current_exotic_particles
        game.ui.processUpdateQueue();

        expect(mobileEl.querySelector('.ep-content').style.display).toBe("none");
        expect(desktopEl.querySelector('.ep-content').style.display).toBe("none");
    });

    it('should show EP display immediately when loading saved game with EP', async () => {
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
        await game.applySaveState(savedData);
        
        game.ui.processUpdateQueue();
        // Force rolling numbers to update immediately by simulating a large time delta
        game.ui.updateRollingNumbers(10000);

        // Check that EP display elements are immediately visible
        expect(mobileEl.style.display).not.toBe("none");
        expect(desktopEl.style.display).not.toBe("none");
        expect(mobileValueEl.textContent).toBe("250");
        expect(desktopValueEl.textContent).toBe("250");
    });
}); 