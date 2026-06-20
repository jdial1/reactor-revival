import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM, toNum } from '../../helpers/setup.js';
import { AudioService } from '@app/services.js';
import { setDecimal } from "@app/store.js";
import { patchGameState } from "@app/state.js";
import { toDecimal } from '@app/utils.js';
import { forcePurchaseUpgrade } from "../../helpers/gameHelpers.js";

describe('EP Reboot Functionality', () => {
    let game;

    beforeEach(async () => {
        vi.spyOn(AudioService.prototype, 'play').mockImplementation(() => {});
        const setup = await setupGameWithDOM();
        game = setup.game;
        game.audio = new AudioService();
        await game.audio.init();

        // Reset EP to 0 to ensure clean state
        game.exotic_particles = 0;
        game.total_exotic_particles = 0;
        game.current_exotic_particles = 0;
        game.exoticParticleManager.exotic_particles = toDecimal(0);
        setDecimal(game.state, "total_exotic_particles", 0);
        setDecimal(game.state, "current_exotic_particles", 0);
        patchGameState(game, { exotic_particles: 0 });
    });

    afterEach(() => {
        // Clean up any timers or intervals
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    describe('EP Generation and Display', () => {
        it('grants EP at reboot from session power and heat (defining weave)', async () => {
            setDecimal(game.state, "total_exotic_particles", 0);
            setDecimal(game.state, "current_exotic_particles", 0);
            game.exoticParticleManager.exotic_particles = toDecimal(0);
            setDecimal(game.state, "session_power_produced", 5_000_000);
            setDecimal(game.state, "session_heat_dissipated", 6_000_000);
            await game.rebootActionKeepExoticParticles();
            expect(toNum(game.state.total_exotic_particles)).toBe(5);
            expect(toNum(game.state.current_exotic_particles)).toBe(5);
        });

        it('should update EP state manager correctly', () => {
            game.exotic_particles = 150;
            patchGameState(game, { exotic_particles: game.exotic_particles });

            expect(toNum(game.exotic_particles)).toBe(150);
        });

        it('should update total EP state manager correctly', () => {
            game.total_exotic_particles = 500;
            patchGameState(game, { total_exotic_particles: game.total_exotic_particles });

            expect(toNum(game.state.total_exotic_particles)).toBe(500);
        });

        it('should update EP displays when values change', () => {
            game.exotic_particles = 100;
            game.total_exotic_particles = 200;
            patchGameState(game, { exotic_particles: game.exotic_particles, total_exotic_particles: game.total_exotic_particles });

            game.exotic_particles = 250;
            game.total_exotic_particles = 350;
            patchGameState(game, { exotic_particles: game.exotic_particles, total_exotic_particles: game.total_exotic_particles });

            expect(toNum(game.exotic_particles)).toBe(250);
            expect(toNum(game.state.total_exotic_particles)).toBe(350);
        });
    });

    describe('Reboot for EP (Keep EP)', () => {
        it('should play reboot sound and keep EP when rebooting', async () => {
            game.paused = false;
            game.engine.start();
            const playSpy = vi.spyOn(game.audio, 'play');

            setDecimal(game.state, "total_exotic_particles", 75);
            setDecimal(game.state, "current_exotic_particles", 75);
            game.exoticParticleManager.exotic_particles = toDecimal(75);

            const epBeforeReboot = game.exotic_particles;
            game.current_money = 5000;
            setDecimal(game.state, "session_power_produced", 0);
            setDecimal(game.state, "session_heat_dissipated", 0);
            await game.rebootActionKeepExoticParticles();

            expect(toNum(game.exotic_particles)).toBe(0);
            expect(toNum(game.total_exotic_particles)).toBe(toNum(epBeforeReboot));
            expect(toNum(game.current_exotic_particles)).toBe(toNum(epBeforeReboot));
            expect(toNum(game.current_money)).toBe(toNum(game.base_money));

            expect(toNum(game.state.total_exotic_particles)).toBe(toNum(epBeforeReboot));
            expect(toNum(game.state.current_exotic_particles)).toBe(toNum(epBeforeReboot));
            expect(playSpy).toHaveBeenCalledWith('reboot');
        });

        it('should preserve experimental upgrades but reset standard ones on reboot', async () => {
            forcePurchaseUpgrade(game, "chronometer");
            forcePurchaseUpgrade(game, "laboratory");
            
            const standardUpgrade = game.upgradeset.getUpgrade("chronometer");
            const labUpgrade = game.upgradeset.getUpgrade("laboratory");
            
            expect(standardUpgrade.level).toBe(1);
            expect(labUpgrade.level).toBe(1);
            
            await game.rebootActionKeepExoticParticles();

            expect(game.upgradeset.getUpgrade("chronometer").level).toBe(0);
            expect(game.upgradeset.getUpgrade("laboratory").level).toBe(1);
        });
    });

    describe('Reboot and Refund EP (Full Refund)', () => {
        it('should reset all EP to zero on a full refund reboot', async () => {
            game.paused = false;
            game.engine.start();

            setDecimal(game.state, "total_exotic_particles", 10);
            setDecimal(game.state, "current_exotic_particles", 10);
            game.exoticParticleManager.exotic_particles = toDecimal(10);

            game.current_money = 5000;
            await game.router.loadPage("experimental_upgrades_section");
            await game.rebootActionDiscardExoticParticles();

            expect(toNum(game.exotic_particles)).toBe(0);
            expect(toNum(game.total_exotic_particles)).toBe(0);
            expect(toNum(game.current_exotic_particles)).toBe(0);
        });

        it('should update state manager after refund reboot', async () => {
            game.exotic_particles = 75;
            game.total_exotic_particles = 125;
            patchGameState(game, { exotic_particles: game.exotic_particles, total_exotic_particles: game.total_exotic_particles });

            await game.rebootActionDiscardExoticParticles();

            expect(toNum(game.exotic_particles)).toBe(0);
            expect(toNum(game.state.total_exotic_particles)).toBe(0);
            expect(toNum(game.state.current_exotic_particles)).toBe(0);
        });
    });

    describe('UI Button Functionality', () => {
        it('should have correct reboot function signature', () => {
            expect(typeof game.rebootActionKeepExoticParticles).toBe('function');
            expect(typeof game.rebootActionDiscardExoticParticles).toBe('function');
            expect(() => game.rebootActionKeepExoticParticles()).not.toThrow();
            expect(() => game.rebootActionDiscardExoticParticles()).not.toThrow();
        });
    });

    describe('EP State Management', () => {
        it('should properly initialize EP state', () => {
            expect(toNum(game.exotic_particles)).toBe(0);
            expect(toNum(game.total_exotic_particles)).toBe(0);
            expect(toNum(game.current_exotic_particles)).toBe(0);
        });

        it('should maintain EP state across game operations', () => {
            // Set EP values
            game.exotic_particles = 50;
            game.total_exotic_particles = 100;
            game.current_exotic_particles = 150;

            patchGameState(game, {
              exotic_particles: game.exotic_particles,
              total_exotic_particles: game.total_exotic_particles,
              current_exotic_particles: game.current_exotic_particles,
            });

            expect(toNum(game.exotic_particles)).toBe(50);
            expect(toNum(game.total_exotic_particles)).toBe(100);
            expect(toNum(game.current_exotic_particles)).toBe(150);
            expect(toNum(game.state.total_exotic_particles)).toBe(100);
            expect(toNum(game.state.current_exotic_particles)).toBe(150);
        });
    });
}); 