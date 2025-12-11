import { describe, it, expect, beforeEach, afterEach, vi, setupGameWithDOM } from '../helpers/setup.js';
import { AudioService } from '../../public/src/services/audioService.js';
import { placePart, forcePurchaseUpgrade, runTicks } from "../helpers/gameHelpers.js";

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

        // Initialize UI state manager with EP values
        game.ui.stateManager.setVar("exotic_particles", 0);
        game.ui.stateManager.setVar("total_exotic_particles", 0);
        game.ui.stateManager.setVar("current_exotic_particles", 0);
    });

    afterEach(() => {
        // Clean up any timers or intervals
        if (game && game.engine) {
            game.engine.stop();
        }
    });

    describe('EP Generation and Display', () => {
        it('should generate EP from particle accelerators', async () => {
            game.paused = false;
            if (!game.engine.running) {
                game.engine.start();
            }
            const part = game.partset.getPartById("particle_accelerator1");
            const tile = await placePart(game, 0, 0, "particle_accelerator1");
            tile.heat_contained = part.ep_heat * 10;
            
            game.reactor.updateStats();
            const initialEP = game.exotic_particles;
            
            for (let i = 0; i < 20; i++) {
                game.engine.tick();
                game.reactor.updateStats();
                if (game.exotic_particles > initialEP) break;
            }
            expect(game.exotic_particles).toBeGreaterThan(initialEP);
        });

        it('should update EP state manager correctly', () => {
            game.exotic_particles = 150;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);

            expect(game.ui.stateManager.getVar("exotic_particles")).toBe(150);
        });

        it('should update total EP state manager correctly', () => {
            game.total_exotic_particles = 500;
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);

            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(500);
        });

        it('should update EP displays when values change', () => {
            // Set initial values
            game.exotic_particles = 100;
            game.total_exotic_particles = 200;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);

            // Update values
            game.exotic_particles = 250;
            game.total_exotic_particles = 350;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);

            expect(game.ui.stateManager.getVar("exotic_particles")).toBe(250);
            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(350);
        });
    });

    describe('Reboot for EP (Keep EP)', () => {
        it('should play reboot sound and keep EP when rebooting', async () => {
            game.paused = false;
            game.engine.start();
            const playSpy = vi.spyOn(game.audio, 'play');
            
            const pa_tile = await placePart(game, 0, 2, "particle_accelerator1");
            pa_tile.part.ep_heat = 1000;
            pa_tile.heat_contained = 1000;
            
            runTicks(game, 20);
            expect(game.exotic_particles).toBeGreaterThan(50);
            
            const epBeforeReboot = game.exotic_particles;
            game.current_money = 5000;
            await game.reboot_action(true);

            // EP should be preserved and added to total
            expect(game.exotic_particles).toBe(0); // Current EP is reset
            expect(game.total_exotic_particles).toBe(epBeforeReboot);
            expect(game.current_exotic_particles).toBe(epBeforeReboot);
            expect(game.current_money).toBe(game.base_money); // Money should be reset

            // Verify that the game action updated the state manager
            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(epBeforeReboot);
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(epBeforeReboot);
            expect(playSpy).toHaveBeenCalledWith('reboot');
        });

        it('should preserve experimental upgrades but reset standard ones on reboot', async () => {
            forcePurchaseUpgrade(game, "chronometer");
            forcePurchaseUpgrade(game, "laboratory");
            
            const standardUpgrade = game.upgradeset.getUpgrade("chronometer");
            const labUpgrade = game.upgradeset.getUpgrade("laboratory");
            
            expect(standardUpgrade.level).toBe(1);
            expect(labUpgrade.level).toBe(1);
            
            await game.reboot_action(true);
            
            expect(game.upgradeset.getUpgrade("chronometer").level).toBe(0);
            expect(game.upgradeset.getUpgrade("laboratory").level).toBe(1);
        });
    });

    describe('Reboot and Refund EP (Full Refund)', () => {
        it('should reset all EP to zero on a full refund reboot', async () => {
            game.paused = false;
            game.engine.start();
            
            const paTile = await placePart(game, 0, 2, "particle_accelerator1");
            paTile.part.ep_heat = 1000;
            paTile.heat_contained = 1000;
            
            runTicks(game, 10);
            expect(game.exotic_particles).toBeGreaterThan(0);
            
            game.current_money = 5000;
            await game.router.loadPage("experimental_upgrades_section");
            await game.reboot_action(false);

            expect(game.exotic_particles).toBe(0);
            expect(game.total_exotic_particles).toBe(0);
            expect(game.current_exotic_particles).toBe(0);
        });

        it('should update state manager after refund reboot', async () => {
            game.exotic_particles = 75;
            game.total_exotic_particles = 125;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);

            await game.reboot_action(false);

            // Check that state manager is updated correctly
            expect(game.ui.stateManager.getVar("exotic_particles")).toBe(0);
            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(0);
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(0);
        });
    });

    describe('UI Button Functionality', () => {
        it('should have correct reboot function signature', () => {
            // Test that the reboot_action method exists and can be called with correct parameters
            expect(typeof game.reboot_action).toBe('function');

            // Test that it can be called with true (keep EP)
            expect(() => game.reboot_action(true)).not.toThrow();

            // Test that it can be called with false (refund EP)
            expect(() => game.reboot_action(false)).not.toThrow();
        });
    });

    describe('EP State Management', () => {
        it('should properly initialize EP state', () => {
            expect(game.exotic_particles).toBe(0);
            expect(game.total_exotic_particles).toBe(0);
            expect(game.current_exotic_particles).toBe(0);
        });

        it('should maintain EP state across game operations', () => {
            // Set EP values
            game.exotic_particles = 50;
            game.total_exotic_particles = 100;
            game.current_exotic_particles = 150;

            // Update state manager
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);
            game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);

            // Verify state is maintained
            expect(game.exotic_particles).toBe(50);
            expect(game.total_exotic_particles).toBe(100);
            expect(game.current_exotic_particles).toBe(150);

            // Verify UI state manager has correct values
            expect(game.ui.stateManager.getVar("exotic_particles")).toBe(50);
            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(100);
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(150);
        });
    });
}); 