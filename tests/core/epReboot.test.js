import { describe, it, expect, beforeEach, afterEach, setupGame } from '../helpers/setup.js';

describe('EP Reboot Functionality', () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();

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
        if (game.engine) {
            game.engine.stop();
        }
    });

    describe('EP Generation and Display', () => {
        it('should generate EP from particle accelerators', async () => {
            // Set up a particle accelerator
            const tile = game.tileset.getTile(0, 0);
            const part = game.partset.getPartById("particle_accelerator1");
            await tile.setPart(part);

            // Set heat to trigger EP generation
            tile.heat_contained = part.ep_heat;

            const initialEP = game.exotic_particles;

            // Run engine tick to generate EP
            game.engine.tick();

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
        it('should keep EP when rebooting with keep_exotic_particles=true', async () => {
            // Set up initial state
            game.exotic_particles = 100;
            game.total_exotic_particles = 200;
            game.current_money = 5000;

            // Place a part to verify it gets cleared
            const tile = game.tileset.getTile(0, 0);
            tile.setPart(game.partset.getPartById("uranium1"));

            // Perform reboot that keeps EP
            await game.reboot_action(true);

            // EP should be preserved and added to total
            expect(game.exotic_particles).toBe(0); // Current EP is reset
            expect(game.total_exotic_particles).toBe(300); // Total should be 200 + 100
            expect(game.current_exotic_particles).toBe(300); // Current should match total
            expect(game.current_money).toBe(game.base_money); // Money should be reset
            expect(tile.part).toBeNull(); // Parts should be cleared
        });

        it('should update state manager after keeping EP reboot', async () => {
            game.exotic_particles = 75;
            game.total_exotic_particles = 125;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.ui.stateManager.setVar("total_exotic_particles", game.total_exotic_particles);

            await game.reboot_action(true);

            // Check that state manager is updated correctly
            expect(game.ui.stateManager.getVar("exotic_particles")).toBe(0); // Current EP is reset
            expect(game.ui.stateManager.getVar("total_exotic_particles")).toBe(200); // 125 + 75
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(200);
        });

        it('should preserve experimental upgrades but reset standard ones on reboot', async () => {
            // Ensure a clean and affordable state
            game.current_money = 1e9;
            game.exotic_particles = 1e6;
            game.current_exotic_particles = 1e6;
            game.upgradeset.check_affordability(game);

            // 1. Purchase a standard upgrade
            const standardUpgrade = game.upgradeset.getUpgrade("chronometer");
            expect(standardUpgrade).toBeDefined();
            game.current_money = standardUpgrade.getCost();
            game.upgradeset.purchaseUpgrade(standardUpgrade.id);
            expect(standardUpgrade.level).toBe(1);

            // 2. Purchase an experimental upgrade (research)
            const labUpgrade = game.upgradeset.getUpgrade("laboratory");
            expect(labUpgrade).toBeDefined();
            game.current_exotic_particles = labUpgrade.getEcost();
            game.upgradeset.purchaseUpgrade(labUpgrade.id);
            expect(labUpgrade.level).toBe(1);

            // 3. Perform the reboot for EP
            await game.reboot_action(true);

            // 4. Verify the state after reboot
            expect(game.upgradeset.getUpgrade("chronometer").level).toBe(0); // Standard reset
            expect(game.upgradeset.getUpgrade("laboratory").level).toBe(1);  // EP persists
        });
    });

    describe('Reboot and Refund EP (Full Refund)', () => {
        it('should refund all EP when rebooting with keep_exotic_particles=false', async () => {
            // Set up initial state
            game.exotic_particles = 100;
            game.total_exotic_particles = 200;
            game.current_money = 5000;

            // Place a part to verify it gets cleared
            const tile = game.tileset.getTile(0, 0);
            await tile.setPart(game.partset.getPartById("uranium1"));

            // Perform reboot that refunds all EP
            await game.reboot_action(false);

            // All EP should be reset to 0
            expect(game.exotic_particles).toBe(0);
            expect(game.total_exotic_particles).toBe(0);
            expect(game.current_exotic_particles).toBe(0);
            expect(game.current_money).toBe(game.base_money); // Money should be reset
            expect(tile.part).toBeNull(); // Parts should be cleared
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