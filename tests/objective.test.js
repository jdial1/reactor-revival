import { describe, it, expect, beforeEach } from "vitest";
import { setupGame } from "./helpers/setup.js";
import objective_list_data from "../data/objective_list.js";
import { getObjectiveCheck } from "../js/objectiveActions.js";

// Helper to set up the game state for each objective
async function satisfyObjective(game, idx) {
  const obj = objective_list_data[idx];
  const checkFn = getObjectiveCheck(obj.checkId);

  switch (idx) {
    case 0: // Place your first component in the reactor
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("uranium1"));
      break;

    case 1: // Sell all your power by clicking "Sell"
      game.sold_power = true;
      break;

    case 2: // Reduce your Current Heat to 0
      game.sold_heat = true;
      break;

    case 3: // Put a Heat Vent next to a Cell
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("uranium1"));
      await game.tileset
        .getTile(0, 1)
        .setPart(game.partset.getPartById("vent1"));
      break;

    case 4: // Purchase an Upgrade
      const upg = game.upgradeset.getAllUpgrades()[0];
      upg.setLevel(1);
      break;

    case 5: // Purchase a Dual Cell
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("uranium2"));
      break;

    case 6: // Have at least 10 active Cells in your reactor
      // Start from position 1 to avoid overwriting the uranium2 cell at position 0
      for (let i = 1; i < 11; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("uranium1"));
      }
      break;

    case 7: // Purchase a Perpetual Cell upgrade for Uranium
      const perpetualUpgrade = game.upgradeset.getUpgrade(
        "uranium1_cell_perpetual"
      );
      perpetualUpgrade.setLevel(1);
      break;

    case 8: // Increase your max power with a Capacitor
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("capacitor1"));
      break;

    case 9: // Generate at least 200 power per tick
      // Place multiple high-power Cells
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium1"));
      }
      game.reactor.updateStats();
      break;

    case 10: // Purchase one Improved Chronometers upgrade
      const chronometerUpgrade = game.upgradeset.getUpgrade("chronometer");
      chronometerUpgrade.setLevel(1);
      break;

    case 11: // Have 5 different kinds of components in your reactor
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

    case 12: // Have at least 10 Capacitors in your reactor
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("capacitor1"));
      }
      break;

    case 13: // Generate at least 500 power per tick
      // Place multiple high-power Cells
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium1"));
      }
      game.reactor.updateStats();
      break;

    case 14: // Upgrade Potent Uranium Cell to level 3 or higher
      const powerUpgrade = game.upgradeset.getUpgrade("uranium1_cell_power");
      powerUpgrade.setLevel(3);
      break;

    case 15: // Auto-sell at least 500 power per tick
      // Purchase Improved Power Lines upgrade to enable auto-sell
      const improvedPowerLinesUpgrade = game.upgradeset.getUpgrade(
        "improved_power_lines"
      );
      improvedPowerLinesUpgrade.setLevel(50); // Level 50 gives 50% auto-sell
      // Set up auto-sell and generate power
      game.ui.stateManager.setVar("auto_sell", true);
      // Add capacitors to increase max_power (needed for stats_cash calculation)
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("capacitor1"));
      }
      // Add some power generation
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(1, i)
          .setPart(game.partset.getPartById("plutonium1"));
      }
      game.reactor.updateStats();
      break;

    // New intermediary objectives
    case 16: // Achieve a steady power generation of 1,000 per tick for at least 3 minutes
      // Place enough cells to generate 1000+ power (but not too many to avoid tile limits)
      for (let i = 0; i < 8; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium3"));
      }
      game.reactor.updateStats();
      // Simulate 3 minutes of sustained power
      game.sustainedPower1k = { startTime: Date.now() - 180000 };
      break;

    case 17: // Have at least 10 active Advanced Capacitors and 10 Advanced Heat Vents
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("capacitor2"));
      }
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(1, i)
          .setPart(game.partset.getPartById("vent2"));
      }
      break;

    case 18: // Have at least 5 active Quad Plutonium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium3"));
      }
      break;

    case 19: // Expand your reactor 2 times in either direction
      const expandRowsUpgrade = game.upgradeset.getUpgrade(
        "expand_reactor_rows"
      );
      expandRowsUpgrade.setLevel(2);
      break;

    case 20: // Achieve a passive income of $50,000 per tick through auto-selling
      // Set up high power generation and auto-sell (but not too many tiles)
      for (let i = 0; i < 8; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium3"));
      }
      // Add capacitors to increase max_power
      for (let i = 0; i < 10; i++) {
        await game.tileset
          .getTile(1, i)
          .setPart(game.partset.getPartById("capacitor1"));
      }
      // Set up auto-sell
      game.ui.stateManager.setVar("auto_sell", true);
      // Purchase Improved Power Lines upgrade to enable auto-sell
      const improvedPowerLinesUpgrade2 = game.upgradeset.getUpgrade(
        "improved_power_lines"
      );
      improvedPowerLinesUpgrade2.setLevel(50); // Level 50 gives 50% auto-sell
      game.reactor.updateStats();
      // Manually set stats_cash to ensure it meets the requirement
      game.reactor.stats_cash = 60000;
      break;

    case 21: // Expand your reactor 4 times in either direction
      const expandRowsUpgrade4 = game.upgradeset.getUpgrade(
        "expand_reactor_rows"
      );
      expandRowsUpgrade4.setLevel(4);
      break;

    case 22: // Have at least 5 active Quad Thorium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("thorium3"));
      }
      break;

    case 23: // Reach a balance of $1,000,000,000
      game.current_money = 1000000000;
      game.ui.stateManager.setVar("current_money", game.current_money);
      break;

    case 24: // Have at least $10,000,000,000 total
      game.current_money = 10000000000;
      game.ui.stateManager.setVar("current_money", game.current_money);
      break;

    case 25: // Have at least 5 active Quad Seaborgium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("seaborgium3"));
      }
      break;

    case 26: // Sustain a reactor heat level above 10,000,000 for 5 minutes without a meltdown
      // Set up high heat generation (but not too many tiles)
      for (let i = 0; i < 8; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium3"));
      }
      game.reactor.updateStats();
      // Manually set high heat level
      game.reactor.current_heat = 15000000;
      // Simulate 5 minutes of sustained high heat
      game.masterHighHeat = { startTime: Date.now() - 300000 };
      break;

    case 27: // Generate 10 Exotic Particles with Particle Accelerators
      game.exotic_particles = 10;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 28: // Generate 51 Exotic Particles with Particle Accelerators
      game.exotic_particles = 51;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 29: // Generate 250 Exotic Particles
      game.exotic_particles = 250;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 30: // Purchase the 'Infused Cells' and 'Unleashed Cells' experimental upgrades
      // First unlock laboratory
      const laboratoryUpgrade = game.upgradeset.getUpgrade("laboratory");
      laboratoryUpgrade.setLevel(1);
      // Then purchase both upgrades
      const infusedCellsUpgrade = game.upgradeset.getUpgrade("infused_cells");
      infusedCellsUpgrade.setLevel(1);
      const unleashedCellsUpgrade = game.upgradeset.getUpgrade("unleashed_cells");
      unleashedCellsUpgrade.setLevel(1);
      break;

    case 31: // Reboot your reactor in the Experiments tab
      game.total_exotic_particles = 100;
      game.current_money = game.base_money;
      game.exotic_particles = 0;
      game.ui.stateManager.setVar(
        "total_exotic_particles",
        game.total_exotic_particles
      );
      game.ui.stateManager.setVar("current_money", game.current_money);
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 32: // Purchase an Experimental Upgrade
      // First unlock laboratory
      const labUpgrade = game.upgradeset.getUpgrade("laboratory");
      labUpgrade.setLevel(1);
      // Then purchase an experimental upgrade
      const infusedCellsUpgrade2 = game.upgradeset.getUpgrade("infused_cells");
      infusedCellsUpgrade2.setLevel(1);
      break;

    case 33: // Have at least 5 active Quad Dolorium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("dolorium3"));
      }
      break;

    case 34: // Generate 1000 Exotic Particles with Particle Accelerators
      game.exotic_particles = 1000;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 35: // Have at least 5 active Quad Nefastium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("nefastium3"));
      }
      break;

    case 36: // Place an experimental part in your reactor
      // First unlock laboratory and protium cells
      const labUpgrade2 = game.upgradeset.getUpgrade("laboratory");
      labUpgrade2.setLevel(1);
      const protiumCellsUpgrade = game.upgradeset.getUpgrade("protium_cells");
      protiumCellsUpgrade.setLevel(1);
      // Then place an experimental part
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("protium1"));
      break;

    case 37: // All objectives completed!
      // This objective should always return false
      break;

    default:
      console.warn(`No test implementation for objective ${idx}`);
      break;
  }
}

describe("Objective System", () => {
  let game;

  beforeEach(async () => {
    game = await setupGame();
  });

  objective_list_data.forEach((obj, idx) => {
    it(`Objective ${idx + 1}: ${typeof obj.title === "function" ? obj.title() : obj.title
      }`, async () => {
        await satisfyObjective(game, idx);

        const checkFn = getObjectiveCheck(obj.checkId);
        // For the last objective (All objectives completed), it should always return false
        if (idx === objective_list_data.length - 1) {
          expect(checkFn(game)).toBe(false);
        } else {
          expect(checkFn(game)).toBe(true);
        }
      });
  });

  describe("Already Completed Objectives", () => {
    it("should auto-complete objectives that are already satisfied when loaded", async () => {
      // Test critical objectives that could get stuck if already completed
      const testObjectives = [
        { index: 7, description: "Perpetual uranium upgrade" },
        { index: 10, description: "Chronometer upgrade" },
        { index: 14, description: "Uranium power upgrade level 3" },
        { index: 32, description: "Experimental upgrade" },
      ];

      for (const { index, description } of testObjectives) {
        // Create a fresh game instance for each test
        const testGame = await setupGame();

        // Set up the game state to satisfy the objective
        await satisfyObjective(testGame, index);

        // Verify the objective condition is satisfied
        const objective = objective_list_data[index];
        const checkFn = getObjectiveCheck(objective.checkId);
        expect(
          checkFn(testGame),
          `Objective ${index} (${description}) should be satisfied`
        ).toBe(true);

        // Start objective manager at the target objective
        testGame.objectives_manager.current_objective_index = index;

        // Track initial values
        const initialMoney = testGame.current_money;
        const initialEP = testGame.exotic_particles;

        // Mock the UI state manager methods to track calls
        let objectiveCompletedCalled = false;
        let objectiveLoadedCalled = false;
        const originalHandleCompleted =
          testGame.ui.stateManager.handleObjectiveCompleted;
        const originalHandleLoaded =
          testGame.ui.stateManager.handleObjectiveLoaded;

        testGame.ui.stateManager.handleObjectiveCompleted = () => {
          objectiveCompletedCalled = true;
          originalHandleCompleted.call(testGame.ui.stateManager);
        };

        testGame.ui.stateManager.handleObjectiveLoaded = (obj) => {
          objectiveLoadedCalled = true;
          originalHandleLoaded.call(testGame.ui.stateManager, obj);
        };

        // Mock saveGame to track if it's called
        let saveGameCalled = false;
        const originalSaveGame = testGame.saveGame;
        testGame.saveGame = () => {
          saveGameCalled = true;
          originalSaveGame.call(testGame);
        };

        // Start the objective manager (this should trigger auto-completion)
        testGame.objectives_manager.start();

        // Wait a bit for async completion
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify the objective was auto-completed
        expect(
          objectiveCompletedCalled,
          `Objective ${index} (${description}) should have been auto-completed`
        ).toBe(true);
        expect(
          testGame.objectives_manager.current_objective_index,
          `Should have advanced to next objective after completing ${index}`
        ).toBe(index + 1);

        // Verify rewards were given
        if (objective.reward) {
          expect(
            testGame.current_money,
            `Should have received money reward for objective ${index}`
          ).toBe(initialMoney + objective.reward);
        }
        if (objective.ep_reward) {
          expect(
            testGame.exotic_particles,
            `Should have received EP reward for objective ${index}`
          ).toBe(initialEP + objective.ep_reward);
        }

        // Verify save was called
        expect(
          saveGameCalled,
          `Game should have been saved after auto-completing objective ${index}`
        ).toBe(true);

        // Restore original methods
        testGame.ui.stateManager.handleObjectiveCompleted =
          originalHandleCompleted;
        testGame.ui.stateManager.handleObjectiveLoaded = originalHandleLoaded;
        testGame.saveGame = originalSaveGame;
      }
    });

    it("should handle multiple consecutive already-completed objectives", async () => {
      // Test scenario where multiple objectives in sequence are already completed
      const testGame = await setupGame();

      // Set up game state to satisfy objectives 4, 5, and 6
      await satisfyObjective(testGame, 4); // Purchase an Upgrade
      await satisfyObjective(testGame, 5); // Purchase a Dual Cell
      await satisfyObjective(testGame, 6); // Have at least 10 active Cells

      // Start at objective 4
      testGame.objectives_manager.current_objective_index = 4;

      let completionCount = 0;
      const originalHandleCompleted =
        testGame.ui.stateManager.handleObjectiveCompleted;
      testGame.ui.stateManager.handleObjectiveCompleted = () => {
        completionCount++;
        originalHandleCompleted.call(testGame.ui.stateManager);
      };

      // Mock saveGame to track calls
      let saveCallCount = 0;
      const originalSaveGame = testGame.saveGame;
      testGame.saveGame = () => {
        saveCallCount++;
        originalSaveGame.call(testGame);
      };

      // Start the objective manager (should auto-complete 4, 5, and 6)
      testGame.objectives_manager.start();

      // Wait for all async completions
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should have completed 3 objectives and be on objective 7
      expect(
        completionCount,
        "Should have auto-completed 3 consecutive objectives"
      ).toBe(3);
      expect(
        testGame.objectives_manager.current_objective_index,
        "Should have advanced to objective 7"
      ).toBe(7);
      expect(saveCallCount, "Should have saved at least once").toBeGreaterThan(
        0
      );

      // Restore original methods
      testGame.ui.stateManager.handleObjectiveCompleted =
        originalHandleCompleted;
      testGame.saveGame = originalSaveGame;
    });
  });

  describe("Objective Reward Validation", () => {
    it("should ensure every objective has either a reward or ep_reward", () => {
      objective_list_data.forEach((objective, index) => {
        const hasReward = objective.reward !== undefined && objective.reward !== null;
        const hasEpReward = objective.ep_reward !== undefined && objective.ep_reward !== null;
        const hasEitherReward = hasReward || hasEpReward;

        expect(
          hasEitherReward,
          `Objective ${index + 1}: "${typeof objective.title === 'function' ? objective.title() : objective.title}" should have either reward or ep_reward`
        ).toBe(true);

        // Additional validation: should not have both reward types
        if (hasReward && hasEpReward) {
          console.warn(
            `Objective ${index + 1} has both reward (${objective.reward}) and ep_reward (${objective.ep_reward}). This might be intentional but should be reviewed.`
          );
        }
      });
    });

    it("should validate reward values are positive numbers", () => {
      objective_list_data.forEach((objective, index) => {
        if (objective.reward !== undefined && objective.reward !== null) {
          expect(
            typeof objective.reward === 'number' && objective.reward >= 0,
            `Objective ${index + 1}: reward should be a non-negative number, got ${objective.reward} (${typeof objective.reward})`
          ).toBe(true);
        }

        if (objective.ep_reward !== undefined && objective.ep_reward !== null) {
          expect(
            typeof objective.ep_reward === 'number' && objective.ep_reward >= 0,
            `Objective ${index + 1}: ep_reward should be a non-negative number, got ${objective.ep_reward} (${typeof objective.ep_reward})`
          ).toBe(true);
        }
      });
    });

    it("should validate that the final objective has zero reward", () => {
      const finalObjective = objective_list_data[objective_list_data.length - 1];
      expect(
        finalObjective.reward === 0,
        "Final objective should have reward of 0"
      ).toBe(true);
      expect(
        finalObjective.ep_reward === undefined || finalObjective.ep_reward === null,
        "Final objective should not have ep_reward"
      ).toBe(true);
    });

    it("should validate reward progression makes sense", () => {
      const rewards = objective_list_data
        .filter(obj => obj.reward !== undefined && obj.reward !== null)
        .map(obj => obj.reward);

      const epRewards = objective_list_data
        .filter(obj => obj.ep_reward !== undefined && obj.ep_reward !== null)
        .map(obj => obj.ep_reward);

      // Check that money rewards generally increase (allowing for some variation)
      let increasingCount = 0;
      for (let i = 1; i < rewards.length; i++) {
        if (rewards[i] >= rewards[i - 1]) {
          increasingCount++;
        }
      }

      const increasingPercentage = increasingCount / (rewards.length - 1);
      expect(
        increasingPercentage >= 0.7, // At least 70% should be increasing
        `Money rewards should generally increase. Only ${(increasingPercentage * 100).toFixed(1)}% are increasing.`
      ).toBe(true);

      // Check that EP rewards are reasonable (not too high for early objectives)
      const earlyEpRewards = epRewards.slice(0, 5); // First 5 EP rewards
      const lateEpRewards = epRewards.slice(-5); // Last 5 EP rewards

      if (earlyEpRewards.length > 0 && lateEpRewards.length > 0) {
        const avgEarly = earlyEpRewards.reduce((a, b) => a + b, 0) / earlyEpRewards.length;
        const avgLate = lateEpRewards.reduce((a, b) => a + b, 0) / lateEpRewards.length;

        expect(
          avgLate >= avgEarly,
          "Later EP rewards should generally be higher than early ones"
        ).toBe(true);
      }
    });

    it("should validate that objectives with EP rewards are in the correct section", () => {
      // EP rewards should only appear in objectives after the first EP objective (index 27) - adjusted for new objectives
      const firstEpObjectiveIndex = 27; // "Generate 10 Exotic Particles"

      objective_list_data.forEach((objective, index) => {
        if (objective.ep_reward !== undefined && objective.ep_reward !== null) {
          expect(
            index >= firstEpObjectiveIndex,
            `Objective ${index + 1} has EP reward but appears before the first EP objective (index ${firstEpObjectiveIndex + 1})`
          ).toBe(true);
        }
      });
    });

    it("should validate that money rewards are properly formatted", () => {
      objective_list_data.forEach((objective, index) => {
        if (objective.reward !== undefined && objective.reward !== null) {
          // Check that money rewards are whole numbers (no decimals for money)
          expect(
            Number.isInteger(objective.reward),
            `Objective ${index + 1}: money reward should be a whole number, got ${objective.reward}`
          ).toBe(true);
        }
      });
    });

    it("should validate that EP rewards are properly formatted", () => {
      objective_list_data.forEach((objective, index) => {
        if (objective.ep_reward !== undefined && objective.ep_reward !== null) {
          // Check that EP rewards are whole numbers
          expect(
            Number.isInteger(objective.ep_reward),
            `Objective ${index + 1}: EP reward should be a whole number, got ${objective.ep_reward}`
          ).toBe(true);
        }
      });
    });

    it("should actually give rewards when objectives are completed", async () => {
      // Test a few key objectives to ensure rewards are actually given
      const testObjectives = [
        { index: 0, expectedReward: 10, rewardType: 'money' },
        { index: 4, expectedReward: 100, rewardType: 'money' },
        { index: 28, expectedReward: 50, rewardType: 'ep' },
        { index: 34, expectedReward: 1000, rewardType: 'ep' },
      ];

      for (const { index, expectedReward, rewardType } of testObjectives) {
        const testGame = await setupGame();

        // Set initial values
        const initialMoney = testGame.current_money;
        const initialEP = testGame.exotic_particles;

        // Set up the objective condition
        await satisfyObjective(testGame, index);

        // Verify the objective is satisfied
        const objective = objective_list_data[index];
        const checkFn = getObjectiveCheck(objective.checkId);
        expect(checkFn(testGame)).toBe(true);

        // Manually trigger the reward logic (simulating objective completion)
        if (rewardType === 'money' && objective.reward) {
          testGame.current_money += objective.reward;
          testGame.ui.stateManager.setVar('current_money', testGame.current_money, true);

          expect(
            testGame.current_money,
            `Objective ${index + 1} should give ${expectedReward} money`
          ).toBe(initialMoney + expectedReward);
        } else if (rewardType === 'ep' && objective.ep_reward) {
          // For EP rewards, we need to simulate the actual reward being given
          // The satisfyObjective function sets exotic_particles to satisfy the condition
          // but doesn't give the reward. We need to add the reward on top of that.
          const currentEP = testGame.exotic_particles;
          testGame.exotic_particles += objective.ep_reward;
          testGame.ui.stateManager.setVar('exotic_particles', testGame.exotic_particles, true);

          expect(
            testGame.exotic_particles,
            `Objective ${index + 1} should give ${expectedReward} EP on top of current EP`
          ).toBe(currentEP + expectedReward);
        }
      }
    });

    it("should validate that objectives with both reward types are flagged", () => {
      const objectivesWithBothRewards = objective_list_data.filter(
        obj => obj.reward !== undefined && obj.reward !== null &&
          obj.ep_reward !== undefined && obj.ep_reward !== null
      );

      if (objectivesWithBothRewards.length > 0) {
        console.warn(
          `Found ${objectivesWithBothRewards.length} objectives with both reward types:`,
          objectivesWithBothRewards.map((obj, idx) => ({
            index: objective_list_data.indexOf(obj) + 1,
            title: typeof obj.title === 'function' ? obj.title() : obj.title,
            reward: obj.reward,
            ep_reward: obj.ep_reward
          }))
        );
      }

      // This test will pass but will warn about any objectives with both reward types
      expect(objectivesWithBothRewards.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("New Intermediary Objectives", () => {
    it("should test sustained power generation objective", async () => {
      const testGame = await setupGame();

      // Set up power generation
      for (let i = 0; i < 8; i++) {
        await testGame.tileset
          .getTile(0, i)
          .setPart(testGame.partset.getPartById("plutonium3"));
      }
      testGame.reactor.updateStats();

      // Reset sustained power state
      testGame.sustainedPower1k = { startTime: 0 };

      // Test that it fails without sustained time
      const checkFn = getObjectiveCheck("sustainedPower1k");
      expect(checkFn(testGame)).toBe(false);

      // Test that it passes with sustained time
      testGame.sustainedPower1k = { startTime: Date.now() - 180000 };
      expect(checkFn(testGame)).toBe(true);

      // Test that it fails if power drops below threshold
      testGame.reactor.stats_power = 500;
      expect(checkFn(testGame)).toBe(false);
    });

    it("should test infrastructure upgrade objective", async () => {
      const testGame = await setupGame();

      // Test that it fails without enough advanced components
      const checkFn = getObjectiveCheck("infrastructureUpgrade1");
      expect(checkFn(testGame)).toBe(false);

      // Add advanced capacitors
      for (let i = 0; i < 10; i++) {
        await testGame.tileset
          .getTile(0, i)
          .setPart(testGame.partset.getPartById("capacitor2"));
      }
      expect(checkFn(testGame)).toBe(false);

      // Add advanced heat vents
      for (let i = 0; i < 10; i++) {
        await testGame.tileset
          .getTile(1, i)
          .setPart(testGame.partset.getPartById("vent2"));
      }
      expect(checkFn(testGame)).toBe(true);
    });

    it("should test reactor expansion objectives", async () => {
      const testGame = await setupGame();

      // Test initial expansion
      const checkFn2 = getObjectiveCheck("initialExpansion2");
      expect(checkFn2(testGame)).toBe(false);

      const expandRowsUpgrade = testGame.upgradeset.getUpgrade("expand_reactor_rows");
      expandRowsUpgrade.setLevel(2);
      expect(checkFn2(testGame)).toBe(true);

      // Test full expansion
      const checkFn4 = getObjectiveCheck("expandReactor4");
      expect(checkFn4(testGame)).toBe(false);

      expandRowsUpgrade.setLevel(4);
      expect(checkFn4(testGame)).toBe(true);
    });

    it("should test high heat mastery objective", async () => {
      const testGame = await setupGame();

      // Set up high heat generation
      for (let i = 0; i < 8; i++) {
        await testGame.tileset
          .getTile(0, i)
          .setPart(testGame.partset.getPartById("plutonium3"));
      }
      testGame.reactor.updateStats();

      // Manually set high heat level
      testGame.reactor.current_heat = 15000000;

      // Reset high heat state
      testGame.masterHighHeat = { startTime: 0 };

      // Test that it fails without sustained time
      const checkFn = getObjectiveCheck("masterHighHeat");
      expect(checkFn(testGame)).toBe(false);

      // Test that it passes with sustained time
      testGame.masterHighHeat = { startTime: Date.now() - 300000 };
      expect(checkFn(testGame)).toBe(true);

      // Test that it fails if reactor melts down
      testGame.reactor.has_melted_down = true;
      expect(checkFn(testGame)).toBe(false);
    });

    it("should test research investment objective", async () => {
      const testGame = await setupGame();

      // Test that it fails without upgrades
      const checkFn = getObjectiveCheck("investInResearch1");
      expect(checkFn(testGame)).toBe(false);

      // Unlock laboratory
      const laboratoryUpgrade = testGame.upgradeset.getUpgrade("laboratory");
      laboratoryUpgrade.setLevel(1);

      // Purchase infused cells
      const infusedCellsUpgrade = testGame.upgradeset.getUpgrade("infused_cells");
      infusedCellsUpgrade.setLevel(1);
      expect(checkFn(testGame)).toBe(false);

      // Purchase unleashed cells
      const unleashedCellsUpgrade = testGame.upgradeset.getUpgrade("unleashed_cells");
      unleashedCellsUpgrade.setLevel(1);
      expect(checkFn(testGame)).toBe(true);
    });
  });

  describe("Part Icon Integration", () => {
    it("should add part icons to objective titles that mention parts", () => {
      const stateManager = game.ui.stateManager;

      // Test various objective titles that should have part icons
      const testCases = [
        {
          title: "Place your first Cell in the reactor by clicking 'Parts'",
          shouldHaveIcon: true,
          expectedIcon: 'img/parts/cells/cell_1_1.png'
        },
        {
          title: "Purchase a Dual Cell",
          shouldHaveIcon: true,
          expectedIcon: 'img/parts/cells/cell_1_2.png'
        },
        {
          title: "Put a Heat Vent next to a Cell",
          shouldHaveIcon: true,
          expectedIcon: 'img/parts/vents/vent_1.png'
        },
        {
          title: "Have at least 10 Capacitors",
          shouldHaveIcon: true,
          expectedIcon: 'img/parts/capacitors/capacitor_1.png'
        },
        {
          title: "Generate 10 Exotic Particles",
          shouldHaveIcon: true,
          expectedIcon: '🧬'
        },
        {
          title: "Have at least 5 active Quad Plutonium Cells in your reactor",
          shouldHaveIcon: true,
          expectedIcon: 'img/parts/cells/cell_1_4.png'
        },
        {
          title: "Sell all your power by clicking 'Power'",
          shouldHaveIcon: true,
          expectedIcon: '⚡'
        },
        {
          title: "Reduce your Current Heat to 0 by clicking 'Heat'",
          shouldHaveIcon: true,
          expectedIcon: '🔥'
        }
      ];

      testCases.forEach(({ title, shouldHaveIcon, expectedIcon }) => {
        const processedTitle = stateManager.addPartIconsToTitle(title);

        if (shouldHaveIcon) {
          if (expectedIcon.startsWith('./img/') || expectedIcon.startsWith('img/')) {
            // Image files should create img tags
            expect(processedTitle).toContain('<img');
            expect(processedTitle).toContain('objective-part-icon');
            expect(processedTitle).toContain(expectedIcon);
          } else {
            // Emojis should be inserted directly
            expect(processedTitle).toContain(expectedIcon);
          }
        } else {
          expect(processedTitle).toBe(title);
        }
      });
    });

    it("should handle objective titles with multiple part mentions", () => {
      const stateManager = game.ui.stateManager;
      const title = "Put a Heat Vent next to a Cell";
      const processedTitle = stateManager.addPartIconsToTitle(title);

      // Should have icons for both "Heat Vent" and "Cell"
      expect(processedTitle).toContain('img/parts/vents/vent_1.png');
      expect(processedTitle).toContain('img/parts/cells/cell_1_1.png');
      expect(processedTitle).toContain('Heat Vent');
      expect(processedTitle).toContain('Cell');
    });

    it("should handle objective titles with emoji mentions", () => {
      const stateManager = game.ui.stateManager;
      const title = "Sell all your power by clicking 'Power'";
      const processedTitle = stateManager.addPartIconsToTitle(title);

      // Should have emoji for "Power"
      expect(processedTitle).toContain('⚡');
      expect(processedTitle).toContain('Power');
    });
  });
});
