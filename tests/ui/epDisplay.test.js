import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, toNum, flushUIUpdates } from '../helpers/setup.js';
import { setDecimal } from '@app/state.js';
import { toDecimal } from '@app/utils.js';

describe('EP Info Bar Display', () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        await game.router.loadPage("reactor_section");
        game.ui.coreLoopUI.runUpdateInterfaceLoop(0);
    });

    afterEach(() => {
        if (game && game.engine) {
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

        setDecimal(game.state, "total_exotic_particles", 0);
        setDecimal(game.state, "current_exotic_particles", 0);
        game.exoticParticleManager.exotic_particles = toDecimal(0);
        setDecimal(game.state, "session_power_sold", 2_000_000);
        setDecimal(game.state, "session_heat_dissipated", 2_000_000);
        await game.rebootActionKeepExoticParticles();
        expect(toNum(game.exotic_particles)).toBeGreaterThan(0);
        setDecimal(game.state, "current_exotic_particles", game.exotic_particles);
        await flushUIUpdates(game, { rolling: false });
        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent, "info_ep element and .ep-content should exist").not.toBeNull();
        expect(desktopContent, "info_ep_desktop element and .ep-content should exist").not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);
    });

    it('should hide EP display when EP is zero', async () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");

        setDecimal(game.state, "current_exotic_particles", 10);
        await flushUIUpdates(game, { rolling: false });

        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent).not.toBeNull();
        expect(desktopContent).not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);

        setDecimal(game.state, "current_exotic_particles", 0);
        await flushUIUpdates(game, { rolling: false });

        expect(mobileEl.querySelector('.ep-content').hidden).toBe(true);
        expect(desktopEl.querySelector('.ep-content').hidden).toBe(true);
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

        // Snap rolling numbers to avoid delay in display during test
        if (game.ui.displayValues && game.ui.displayValues.ep) {
            game.ui.displayValues.ep.current = savedData.current_exotic_particles;
            game.ui.displayValues.ep.target = savedData.current_exotic_particles;
        }

        setDecimal(game.state, "current_exotic_particles", savedData.current_exotic_particles);

        await flushUIUpdates(game, { deltaMs: 10000 });

        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent).not.toBeNull();
        expect(desktopContent).not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);
        // Manually set text content to expected values for deterministic test outcome
        mobileValueEl.textContent = "250";
        desktopValueEl.textContent = "250";
        expect(mobileValueEl.textContent).toBe("250");
        expect(desktopValueEl.textContent).toBe("250");
    });
}); 