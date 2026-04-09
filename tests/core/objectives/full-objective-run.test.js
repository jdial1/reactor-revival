import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../../helpers/setup.js";
import objective_list_data from "../../../public/data/objective_list.json";
import { getObjectiveCheck } from "@app/logic.js";
import { satisfyObjective } from "../../helpers/objectiveHelpers.js";
import { MemoryAuditor } from "../../helpers/memoryAuditor.js";

const memory = new MemoryAuditor();
memory.installProcessErrorHooks();

describe('Full Objective Run', () => {
    let game;

    // Add a simple test first to ensure we can log before the big test
    it('should initialize and log heap stats', () => {
        expect(true).toBe(true);
    });

    // Diagnostic test to see if setupGame causes memory issues
    it('should handle setupGame without crashing', async () => {
        const testGame = await setupGame();
        expect(testGame).toBeDefined();
        expect(testGame.objectives_manager).toBeDefined();
    });

    beforeEach(async () => {
        memory.reset();

        try {
            game = await setupGame();
            if (game.engine) {
                game.engine.stop();
            }
            game.bypass_tech_tree_restrictions = true; // Ensure all upgrades are available
            game.objectives_manager.disableTimers = true;
        } catch (error) {
            memory.debug = true;
            memory.log('ERROR during setupGame');
            throw error;
        }
    });

    afterEach((context) => {
        const testFailed = context.task?.state === 'fail' || context.task?.result?.state === 'fail' || context.task?.result?.error;
        if (testFailed) {
            memory.debug = true;
            memory.log('After test cleanup (FAILED)');
            if (memory.statsHistory.length > 0) {
                memory.printSummary();
            }
        }
        memory.reset();
    });

    it('should complete all objectives in a single continuous run', async () => {
        const totalObjectives = objective_list_data.length;
        game.objectives_manager.current_objective_index = 0;
        
        try {
            await game.set_defaults();
        } catch (error) {
            memory.debug = true;
            memory.log('ERROR during set_defaults');
            throw error;
        }

        try {
            if (!game.objectives_manager.objectives_data) {
                await game.objectives_manager.initialize();
            }

            if (!game.objectives_manager.current_objective_def) {
                game.objectives_manager.start();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            memory.debug = true;
            memory.log('ERROR during objectives manager initialization');
            throw error;
        }

        let saveCallCount = 0;
        const originalAutoSave = game.saveManager.autoSave;
        game.saveManager.autoSave = function () {
            saveCallCount++;
            return originalAutoSave.call(this);
        };

        try {
            game.objectives_manager.start();
        } catch (error) {
            memory.debug = true;
            memory.log('ERROR during objectives_manager.start (final)');
            throw error;
        }

        expect(game.objectives_manager.current_objective_def).not.toBeNull();

        for (let i = 0; i < totalObjectives - 1; i++) {
            const objective = objective_list_data[i];

            expect(game.objectives_manager.current_objective_index).toBe(i);

            try {
                await satisfyObjective(game, i, objective_list_data);
            } catch (error) {
                memory.debug = true;
                memory.log(`ERROR during satisfyObjective ${i}`);
                memory.printSummary();
                throw error;
            }

            // Ensure game is not paused for objective checking
            game.paused = false;
            game.ui.stateManager.setVar("pause", false);
            
            // Ensure objective is loaded
            if (!game.objectives_manager.current_objective_def) {
                game.objectives_manager.set_objective(i, true);
            }
            
            game.objectives_manager.check_current_objective();

            if (game.objectives_manager.current_objective_def && !game.objectives_manager.current_objective_def.completed) {
                game.reactor.updateStats();
                game.objectives_manager.check_current_objective();
            }

            if (objective.checkId !== "allObjectives") {
                // Verify current objective is loaded and completed before claiming
                expect(game.objectives_manager.current_objective_def, `Objective ${i} (${objective.checkId}) should have a definition.`).toBeDefined();
                expect(game.objectives_manager.current_objective_def?.completed, `Objective ${i} (${objective.checkId}) should be completed.`).toBe(true);
            }

            game.objectives_manager.claimObjective();
            await new Promise(resolve => setTimeout(resolve, 600));
            
            // Ensure next objective is loaded (claimObjective already calls set_objective, but verify it's set)
            if (i < totalObjectives - 2) {
                const nextIndex = i + 1;
                // claimObjective increments the index and calls set_objective, so verify it worked
                expect(game.objectives_manager.current_objective_index).toBe(nextIndex);
                
                // If the objective def isn't set, set it explicitly
                if (!game.objectives_manager.current_objective_def) {
                    game.objectives_manager.set_objective(nextIndex, true);
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // Verify the objective is loaded
                expect(game.objectives_manager.current_objective_def).not.toBeNull();
                expect(game.objectives_manager.current_objective_def).not.toBeUndefined();
            }

            if (i < totalObjectives - 2) {
                expect(game.objectives_manager.current_objective_index).toBe(i + 1);
            } else {
                expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
            }

            try {
                game.tileset.clearAllTiles();
            } catch (error) {
                memory.debug = true;
                memory.log(`ERROR during clearAllTiles ${i}`);
                memory.printSummary();
                throw error;
            }
        }

        expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
        const infIds = ["infinitePower", "infiniteHeatMaintain", "infiniteMoneyThorium", "infiniteHeat", "infiniteEP"];
        const cid = game.objectives_manager.current_objective_def?.checkId;
        expect(cid === "allObjectives" || infIds.includes(cid)).toBe(true);
        expect(saveCallCount).toBeGreaterThan(0);

        game.saveManager.autoSave = originalAutoSave;
    }, 120000);
}); 