import { describe, it, expect, beforeEach, afterEach, setupGameWithDOM } from '../helpers/setup.js';

describe('EP Price Display and Affordability Synchronization', () => {
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

    describe('Price Display Accuracy', () => {
        it('should display correct EP cost in tooltip', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");

            // Verify base costs are correct
            expect(laboratory.base_ecost).toBe(1);
            expect(infusedCells.base_ecost).toBe(100);

            // Verify display costs match base costs
            laboratory.updateDisplayCost();
            infusedCells.updateDisplayCost();
            expect(laboratory.display_cost).toBe("1 EP");
            expect(infusedCells.display_cost).toBe("100 EP");
        });

        it('should update price display when level increases', () => {
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");

            // Level 0
            infusedCells.updateDisplayCost();
            expect(infusedCells.display_cost).toBe("100 EP");

            // Level 1
            infusedCells.setLevel(1);
            infusedCells.updateDisplayCost();
            expect(infusedCells.display_cost).toBe("200 EP"); // 100 * 2

            // Level 2
            infusedCells.setLevel(2);
            infusedCells.updateDisplayCost();
            expect(infusedCells.display_cost).toBe("400 EP"); // 100 * 2^2
        });

        it('should show max level indicator when at max level', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");

            // Set to max level
            laboratory.setLevel(laboratory.max_level);
            laboratory.updateDisplayCost();

            expect(laboratory.display_cost).toBe("MAX");
            expect(laboratory.current_ecost).toBe(Infinity);
        });
    });

    describe('Affordability Synchronization', () => {
        it('should mark upgrade as affordable when user has exactly enough EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Set user to have exactly enough EP
            game.current_exotic_particles = cost;
            game.ui.stateManager.setVar("current_exotic_particles", cost);

            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(true);
        });

        it('should mark upgrade as unaffordable when user has insufficient EP', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Set user to have less than required EP
            game.current_exotic_particles = cost - 1;
            game.ui.stateManager.setVar("current_exotic_particles", cost - 1);

            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(false);
        });

        it('should update affordability when EP changes', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;

            // Initially no EP
            game.current_exotic_particles = 0;
            game.ui.stateManager.setVar("current_exotic_particles", 0);
            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(false);

            // Add enough EP
            game.current_exotic_particles = cost;
            game.ui.stateManager.setVar("current_exotic_particles", cost);
            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(true);

            // Remove EP again
            game.current_exotic_particles = 0;
            game.ui.stateManager.setVar("current_exotic_particles", 0);
            game.upgradeset.check_affordability(game);
            expect(laboratory.affordable).toBe(false);
        });
    });

    describe('Required Upgrade Dependencies', () => {
        it('should mark upgrade as unaffordable when required upgrade is missing', () => {
            const protiumCells = game.upgradeset.getUpgrade("protium_cells");
            expect(protiumCells.erequires).toBe("laboratory");

            // Give enough EP but don't have laboratory
            game.current_exotic_particles = protiumCells.base_ecost;
            game.ui.stateManager.setVar("current_exotic_particles", protiumCells.base_ecost);

            game.upgradeset.check_affordability(game);
            expect(protiumCells.affordable).toBe(false);
        });

        it('should mark upgrade as affordable when required upgrade is purchased', () => {
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

    describe('Purchase Validation', () => {
        it('should prevent purchase when required upgrade is missing', () => {
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

        it('should prevent purchase when insufficient EP', () => {
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

        it('should allow purchase when all conditions are met', () => {
            const laboratory = game.upgradeset.getUpgrade("laboratory");
            const cost = laboratory.base_ecost;
            const initialEP = cost + 50;

            game.current_exotic_particles = initialEP;
            game.ui.stateManager.setVar("current_exotic_particles", initialEP);

            const purchased = game.upgradeset.purchaseUpgrade("laboratory");
            expect(purchased).toBe(true);
            expect(laboratory.level).toBe(1);
            expect(game.current_exotic_particles).toBe(initialEP - cost);
        });
    });

    describe('Cost Calculation Accuracy', () => {
        it('should calculate EP costs using correct multiplier', () => {
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");

            // Verify base cost
            expect(infusedCells.base_ecost).toBe(100);
            expect(infusedCells.ecost_multiplier).toBe(2);

            // Level 0
            infusedCells.setLevel(0);
            infusedCells.updateDisplayCost();
            expect(infusedCells.current_ecost).toBe(100);

            // Level 1
            infusedCells.setLevel(1);
            infusedCells.updateDisplayCost();
            expect(infusedCells.current_ecost).toBe(200); // 100 * 2

            // Level 2
            infusedCells.setLevel(2);
            infusedCells.updateDisplayCost();
            expect(infusedCells.current_ecost).toBe(400); // 100 * 2^2
        });

        it('should use ecost_multiplier for EP costs, not cost_multiplier', () => {
            const infusedCells = game.upgradeset.getUpgrade("infused_cells");

            // Verify different multipliers
            expect(infusedCells.ecost_multiplier).toBe(2);
            expect(infusedCells.cost_multiplier).toBe(2); // Same in this case, but should use ecost_multiplier

            infusedCells.setLevel(1);
            infusedCells.updateDisplayCost();

            // Should use ecost_multiplier, not cost_multiplier
            expect(infusedCells.current_ecost).toBe(100 * infusedCells.ecost_multiplier);
        });
    });
}); 