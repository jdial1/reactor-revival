import { describe, it, expect, beforeEach, afterEach, setupGame } from '../helpers/setup.js';

describe('EP Upgrade Purchase Functionality', () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
    });

    afterEach(() => {
        if (game.engine) {
            game.engine.stop();
        }
    });

    describe('EP Cost Calculation', () => {
        it('should calculate correct EP cost for experimental upgrades', () => {
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");
            expect(infusedCells).not.toBeNull();
            expect(infusedCells.base_ecost).toBe(100);
            expect(infusedCells.current_ecost).toBe(100);

            // Level 1 should cost base_ecost * multiplier
            infusedCells.setLevel(1);
            infusedCells.updateDisplayCost();
            expect(infusedCells.current_ecost).toBe(100 * 2); // 200
        });

        it('should calculate correct EP cost for laboratory upgrade', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            expect(laboratory).not.toBeNull();
            expect(laboratory.base_ecost).toBe(1);
            expect(laboratory.current_ecost).toBe(1);
        });

        it('should calculate correct EP cost for experimental boosts', () => {
            const fractalPiping = game.upgradeset.getUpgrade("fractal_piping");
            expect(fractalPiping).not.toBeNull();
            expect(fractalPiping.base_ecost).toBe(50);
            expect(fractalPiping.current_ecost).toBe(50);
        });
    });

    describe('EP Affordability Checks', () => {
        it('should mark EP upgrade as affordable when user has enough EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Set user to have exactly enough EP
            game.current_exotic_particles = cost;
            game.ui.stateManager.setVar("current_exotic_particles", cost);

            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(true);
        });

        it('should mark EP upgrade as unaffordable when user has insufficient EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Set user to have less than required EP
            game.current_exotic_particles = cost - 1;
            game.ui.stateManager.setVar("current_exotic_particles", cost - 1);

            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(false);
        });

        it('should mark EP upgrade as unaffordable when required upgrade is missing', () => {
            const protiumCells = game.upgradeset.getUpgrade("protium_cells");
            expect(protiumCells.erequires).toBe("laboratory");

            // Give user enough EP but don't have laboratory
            game.current_exotic_particles = protiumCells.base_ecost;
            game.ui.stateManager.setVar("current_exotic_particles", protiumCells.base_ecost);

            game.upgradeset.check_affordability(game);
            expect(protiumCells.affordable).toBe(false);
        });

        it('should mark EP upgrade as affordable when required upgrade is purchased', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const protiumCells = game.upgradeset.getUpgrade("protium_cells");

            // Purchase laboratory first
            game.current_exotic_particles = laboratory.base_ecost;
            game.ui.stateManager.setVar("current_exotic_particles", laboratory.base_ecost);
            game.upgradeset.purchaseUpgrade("laboratory");

            // Now give enough EP for protium cells
            game.current_exotic_particles = protiumCells.base_ecost;
            game.ui.stateManager.setVar("current_exotic_particles", protiumCells.base_ecost);

            game.upgradeset.check_affordability(game);
            expect(protiumCells.affordable).toBe(true);
        });
    });

    describe('EP Purchase Functionality', () => {
        it('should successfully purchase EP upgrade and spend EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;
            const initialEP = cost + 50; // Give extra EP

            game.current_exotic_particles = initialEP;
            game.ui.stateManager.setVar("current_exotic_particles", initialEP);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");

            expect(purchased).toBe(true);
            expect(laboratory.level).toBe(1);
            expect(game.current_exotic_particles).toBe(initialEP - cost);
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(initialEP - cost);
        });

        it('should fail to purchase EP upgrade when insufficient EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Give less EP than required
            game.current_exotic_particles = cost - 1;
            game.ui.stateManager.setVar("current_exotic_particles", cost - 1);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");

            expect(purchased).toBe(false);
            expect(laboratory.level).toBe(0);
            expect(game.current_exotic_particles).toBe(cost - 1); // EP should not change
        });

        it('should fail to purchase EP upgrade when required upgrade is missing', () => {
            const protiumCells = game.upgradeset.getUpgrade("protium_cells");
            const cost = protiumCells.base_ecost;

            // Give enough EP but don't have laboratory
            game.current_exotic_particles = cost;
            game.ui.stateManager.setVar("current_exotic_particles", cost);

            const purchased = game.upgradeset.purchaseUpgrade("protium_cells");

            expect(purchased).toBe(false);
            expect(protiumCells.level).toBe(0);
            expect(game.current_exotic_particles).toBe(cost); // EP should not change
        });

        it('should fail to purchase EP upgrade when at max level', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Set to max level
            laboratory.setLevel(laboratory.max_level);

            game.current_exotic_particles = cost;
            game.ui.stateManager.setVar("current_exotic_particles", cost);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");

            expect(purchased).toBe(false);
            expect(game.current_exotic_particles).toBe(cost); // EP should not change
        });
    });

    describe('EP Cost Display and UI', () => {
        it('should display correct EP cost in upgrade display', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            laboratory.updateDisplayCost();

            expect(laboratory.display_cost).toBe("1"); // base_ecost formatted
        });

        it('should update EP cost display when level increases', () => {
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");

            // Level 0
            infusedCells.updateDisplayCost();
            expect(infusedCells.display_cost).toBe("100");

            // Level 1
            infusedCells.setLevel(1);
            infusedCells.updateDisplayCost();
            expect(infusedCells.display_cost).toBe("200"); // 100 * 2
        });

        it('should show max level indicator when at max level', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            laboratory.setLevel(laboratory.max_level);
            laboratory.updateDisplayCost();

            expect(laboratory.display_cost).toBe("--");
            expect(laboratory.current_ecost).toBe(Infinity);
        });
    });

    describe('EP Purchase Integration', () => {
        it('should update affordability after purchasing EP upgrade', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const protiumCells = game.upgradeset.getUpgrade("protium_cells");

            // Give enough EP for both upgrades
            const totalCost = laboratory.base_ecost + protiumCells.base_ecost;
            game.current_exotic_particles = totalCost;
            game.ui.stateManager.setVar("current_exotic_particles", totalCost);

            // Initially protium cells should not be affordable (no laboratory)
            game.upgradeset.check_affordability(game);
            expect(protiumCells.affordable).toBe(false);

            // Purchase laboratory
            const purchased = game.upgradeset.purchaseUpgrade("laboratory");
            expect(purchased).toBe(true);

            // Now protium cells should be affordable
            game.upgradeset.check_affordability(game);
            expect(protiumCells.affordable).toBe(true);
        });

        it('should handle multiple EP purchases correctly', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const fractalPiping = game.upgradeset.getUpgrade("fractal_piping");

            // Give enough EP for both
            const totalCost = laboratory.base_ecost + fractalPiping.base_ecost;
            game.current_exotic_particles = totalCost;
            game.ui.stateManager.setVar("current_exotic_particles", totalCost);

            // Purchase laboratory
            const labPurchased = game.upgradeset.purchaseUpgrade("laboratory");
            expect(labPurchased).toBe(true);
            expect(game.current_exotic_particles).toBe(fractalPiping.base_ecost);

            // Purchase fractal piping
            const fractalPurchased = game.upgradeset.purchaseUpgrade("fractal_piping");
            expect(fractalPurchased).toBe(true);
            expect(game.current_exotic_particles).toBe(0);
        });
    });

    describe('EP State Synchronization', () => {
        it('should keep game state and UI state synchronized after EP purchase', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;
            const initialEP = cost + 100;

            game.current_exotic_particles = initialEP;
            game.ui.stateManager.setVar("current_exotic_particles", initialEP);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");
            expect(purchased).toBe(true);

            // Verify both game state and UI state are updated
            expect(game.current_exotic_particles).toBe(initialEP - cost);
            expect(game.ui.stateManager.getVar("current_exotic_particles")).toBe(initialEP - cost);
        });

        it('should update all EP-related state variables correctly', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;
            const initialEP = cost + 50;

            // Set all EP state variables
            game.exotic_particles = initialEP;
            game.total_exotic_particles = initialEP;
            game.current_exotic_particles = initialEP;

            game.ui.stateManager.setVar("exotic_particles", initialEP);
            game.ui.stateManager.setVar("total_exotic_particles", initialEP);
            game.ui.stateManager.setVar("current_exotic_particles", initialEP);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");
            expect(purchased).toBe(true);

            // Only current_exotic_particles should be reduced (for purchasing)
            expect(game.current_exotic_particles).toBe(initialEP - cost);
            expect(game.exotic_particles).toBe(initialEP); // Should remain unchanged
            expect(game.total_exotic_particles).toBe(initialEP); // Should remain unchanged
        });
    });
}); 