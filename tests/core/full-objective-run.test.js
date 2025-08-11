import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame } from "../helpers/setup.js";
import objective_list_data from "../../public/data/objective_list.json";
import { getObjectiveCheck } from "../../public/src/core/objectiveActions.js";

async function satisfyObjective(game, idx) {
    const obj = objective_list_data[idx];
    switch (obj.checkId) {
        case "firstCell":
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium1"));
            // Run a tick to activate the cell
            game.engine?.tick?.();
            game.reactor.updateStats();
            // Ensure the tile is in the active tiles list
            game.tileset.updateActiveTiles();
            break;
        case "sellPower":
            game.sold_power = true;
            break;
        case "reduceHeat":
            game.sold_heat = true;
            break;
        case "ventNextToCell":
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium1"));
            await game.tileset
                .getTile(0, 1)
                .setPart(game.partset.getPartById("vent1"));
            break;
        case "purchaseUpgrade":
            game.upgradeset.getAllUpgrades()[0].setLevel(1);
            break;
        case "purchaseDualCell":
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium2"));
            // Run a tick and update stats to activate the cell
            game.engine?.tick?.();
            game.reactor.updateStats();
            game.objectives_manager.check_current_objective();
            break;
        case "tenActiveCells":
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("uranium1"));
                }
            }
            // Run a tick to activate all cells
            game.engine?.tick?.();
            game.reactor.updateStats();
            break;
        case "perpetualUranium":
            game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.setLevel(1);
            break;
        case "increaseMaxPower":
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("capacitor1"));
            break;
        case "powerPerTick200":
            for (let i = 0; i < 4; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("plutonium1"));
                }
            }
            game.reactor.updateStats();
            break;
        case "improvedChronometers":
            game.upgradeset.getUpgrade("chronometer")?.setLevel(1);
            break;
        case "fiveComponentKinds":
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("uranium1"));
            await game.tileset
                .getTile(0, 1)
                .setPart(game.partset.getPartById("vent1"));
            await game.tileset
                .getTile(0, 2)
                .setPart(game.partset.getPartById("capacitor1"));
            await game.tileset
                .getTile(0, 3)
                .setPart(game.partset.getPartById("reflector1"));
            await game.tileset
                .getTile(0, 4)
                .setPart(game.partset.getPartById("heat_exchanger1"));
            break;
        case "tenCapacitors":
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("capacitor1"));
                }
            }
            break;
        case "powerPerTick500":
            for (let i = 0; i < 8; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("plutonium1"));
                }
            }
            game.reactor.updateStats();
            break;
        case "potentUranium3":
            game.upgradeset.getUpgrade("uranium1_cell_power")?.setLevel(3);
            break;
        case "autoSell500":
            game.upgradeset.getUpgrade("improved_power_lines")?.setLevel(50);
            game.ui.stateManager.setVar("auto_sell", true);
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("capacitor1"));
                }
            }
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(1, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("plutonium1"));
                }
            }
            game.reactor.updateStats();
            game.reactor.stats_cash = 501;
            break;
        case "sustainedPower1k":
            for (let i = 0; i < 20; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("plutonium1"));
                }
            }
            game.reactor.updateStats();
            game.sustainedPower1k = { startTime: Date.now() - 180000 };
            break;
        case "infrastructureUpgrade1":
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("capacitor2"));
                }
            }
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(1, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("vent2"));
                }
            }
            break;
        case "fiveQuadPlutonium":
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("plutonium3"));
                }
            }
            break;
        case "initialExpansion2":
            game.upgradeset.getUpgrade("expand_reactor_rows")?.setLevel(2);
            break;
        case "incomeMilestone50k":
            game.upgradeset.getUpgrade("improved_power_lines")?.setLevel(100);
            game.ui.stateManager.setVar("auto_sell", true);
            for (let i = 0; i < 10; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("thorium1"));
                }
            }
            game.reactor.updateStats();
            game.reactor.stats_cash = 50001;
            break;
        case "expandReactor4":
            game.upgradeset.getUpgrade("expand_reactor_rows")?.setLevel(4);
            break;
        case "unlockThorium":
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("thorium3"));
                }
            }
            break;
        case "firstBillion":
            game.current_money = 1000000000;
            break;
        case "money10B":
            game.current_money = 1e10;
            break;
        case "unlockSeaborgium":
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("seaborgium3"));
                }
            }
            break;
        case "masterHighHeat":
            game.reactor.current_heat = 10000001;
            game.masterHighHeat = { startTime: Date.now() - 300000 };
            break;
        case "ep10":
            game.exotic_particles = 10;
            break;
        case "ep51":
            game.exotic_particles = 51;
            break;
        case "ep250":
            game.exotic_particles = 250;
            break;
        case "investInResearch1":
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.upgradeset.getUpgrade("infused_cells")?.setLevel(1);
            game.upgradeset.getUpgrade("unleashed_cells")?.setLevel(1);
            break;
        case "reboot":
            game.total_exotic_particles = 100;
            game.current_money = game.base_money;
            game.exotic_particles = 0;
            break;
        case "experimentalUpgrade":
            game.exotic_particles = 1;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.exotic_particles = 100;
            game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
            game.upgradeset.getUpgrade("infused_cells")?.setLevel(1);
            break;
        case "fiveQuadDolorium":
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("dolorium3"));
                }
            }
            break;
        case "ep1000":
            game.exotic_particles = 1000;
            break;
        case "fiveQuadNefastium":
            for (let i = 0; i < 5; i++) {
                const tile = game.tileset.getTile(0, i);
                if (tile) {
                    await tile.setPart(game.partset.getPartById("nefastium3"));
                }
            }
            break;
        case "placeExperimentalPart":
            game.upgradeset.getUpgrade("laboratory")?.setLevel(1);
            game.upgradeset.getUpgrade("protium_cells")?.setLevel(1);
            await game.tileset
                .getTile(0, 0)
                .setPart(game.partset.getPartById("protium1"));
            break;
        case "allObjectives":
            break;
        default:
            console.warn(`No test implementation for objective: ${obj.checkId}`);
            break;
    }
}

describe('Full Objective Run', () => {
    let game;

    beforeEach(async () => {
        game = await setupGame();
        game.objectives_manager.disableTimers = true;
        // vi.useFakeTimers(); // Removed as per new_code
    });

    afterEach(() => {
        // vi.useRealTimers(); // Removed as per new_code
    });

    it('should complete all objectives in a single continuous run', async () => {
        const totalObjectives = objective_list_data.length; // Include all objectives including "All objectives completed!"
        game.objectives_manager.current_objective_index = 0;
        await game.set_defaults(); // Wait for set_defaults to complete

        // Ensure objectives manager is properly initialized
        if (!game.objectives_manager.objectives_data) {
            await game.objectives_manager.initialize();
        }

        // Ensure objectives manager is properly initialized and ready
        if (!game.objectives_manager.current_objective_def) {
            game.objectives_manager.start();
            // Give it a moment to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        let saveCallCount = 0;
        const originalSaveGame = game.saveGame;
        game.saveGame = () => {
            saveCallCount++;
            originalSaveGame.call(game);
        };

        game.objectives_manager.start();

        // Ensure we have a valid objective before proceeding
        expect(game.objectives_manager.current_objective_def).not.toBeNull();

        for (let i = 0; i < totalObjectives - 1; i++) { // Loop through all objectives except the final "allObjectives"
            const objective = objective_list_data[i];

            expect(game.objectives_manager.current_objective_index).toBe(i);

            await satisfyObjective(game, i);

            game.objectives_manager.check_current_objective();

            if (game.objectives_manager.current_objective_def && !game.objectives_manager.current_objective_def.completed) {
                game.reactor.updateStats();
                game.objectives_manager.check_current_objective();
            }

            // The final "allObjectives" objective is just a placeholder and doesn't need to be completed
            if (objective.checkId !== "allObjectives") {
                expect(game.objectives_manager.current_objective_def.completed, `Objective ${i} (${objective.checkId}) should be completed.`).toBe(true);
            }

            // Claim the objective to advance to the next one
            game.objectives_manager.claimObjective();

            // Wait a bit for the claim to process
            await new Promise(resolve => setTimeout(resolve, 600));

            // Verify we've advanced to the next objective (or reached the end)
            if (i < totalObjectives - 2) {
                expect(game.objectives_manager.current_objective_index).toBe(i + 1);
            } else {
                expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
            }

            // Clear the grid after completing the objective to prevent part conflicts for the next objective
            game.tileset.clearAllTiles();
        }

        expect(game.objectives_manager.current_objective_index).toBe(totalObjectives - 1);
        expect(game.objectives_manager.current_objective_def.checkId).toBe("allObjectives");
        expect(saveCallCount).toBeGreaterThan(0);

        game.saveGame = originalSaveGame;
    }, 60000); // Increased timeout for this long-running test
}); 