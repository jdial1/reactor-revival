import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM, toNum, flushUIUpdates } from '../helpers/setup.js';
import { setDecimal } from "@app/store.js";
import { toDecimal } from '@app/simUtils.js';
import { loadEconomyFromHost } from '../helpers/bridge-test-harness.js';

async function syncEpHud(game) {
    loadEconomyFromHost(game);
    game.coreBridge?.projectLiveState?.();
    await flushUIUpdates(game, { rolling: false });
    await new Promise((r) => requestAnimationFrame(r));
}

describe('EP Info Bar Display', () => {
    let game;
    let document;

    beforeEach(async () => {
        const setup = await setupGameWithDOM();
        game = setup.game;
        document = setup.document;
        await game.router.loadPage("reactor_section");
        game.ui.startRenderLoop(0);
    });

    afterEach(() => {
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    it('should have EP display elements in DOM', () => {
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
        setDecimal(game.state, "session_power_produced", 2_000_000);
        setDecimal(game.state, "session_heat_dissipated", 2_000_000);
        loadEconomyFromHost(game);
        await game.rebootActionKeepExoticParticles();
        expect(toNum(game.exotic_particles)).toBeGreaterThan(0);
        setDecimal(game.state, "current_exotic_particles", game.exotic_particles);
        await syncEpHud(game);
        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent, "info_ep element and .ep-content should exist").not.toBeNull();
        expect(desktopContent, "info_ep_desktop element and .ep-content should exist").not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);
        expect(mobileValueEl).toBeDefined();
        expect(desktopValueEl).toBeDefined();
    });

    it('should hide EP display when EP is zero', async () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");

        setDecimal(game.state, "current_exotic_particles", 10);
        await syncEpHud(game);

        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent).not.toBeNull();
        expect(desktopContent).not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);

        setDecimal(game.state, "current_exotic_particles", 0);
        await syncEpHud(game);

        expect(mobileEl.querySelector('.ep-content').hidden).toBe(true);
        expect(desktopEl.querySelector('.ep-content').hidden).toBe(true);
    });

    it('should show EP display immediately when loading saved game with EP', async () => {
        const mobileEl = document.getElementById("info_ep");
        const desktopEl = document.getElementById("info_ep_desktop");
        const mobileValueEl = document.getElementById("info_ep_value");
        const desktopValueEl = document.getElementById("info_ep_value_desktop");

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

        await game.applySaveState(savedData);

        setDecimal(game.state, "current_exotic_particles", savedData.current_exotic_particles);
        await syncEpHud(game);

        const mobileContent = mobileEl?.querySelector('.ep-content');
        const desktopContent = desktopEl?.querySelector('.ep-content');
        expect(mobileContent).not.toBeNull();
        expect(desktopContent).not.toBeNull();
        expect(mobileContent.hidden).toBe(false);
        expect(desktopContent.hidden).toBe(false);
        expect(mobileValueEl).toBeDefined();
        expect(desktopValueEl).toBeDefined();
    });
});
