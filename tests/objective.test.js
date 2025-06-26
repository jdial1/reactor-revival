import { describe, it, expect, beforeEach } from "vitest";
import { setupGame } from "./helpers/setup.js";
import objective_list_data from "../data/objective_list.js";

// Helper to set up the game state for each objective
async function satisfyObjective(game, idx) {
  const obj = objective_list_data[idx];

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

    case 3: // Put a Heat Vent next to a power Cell
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

    case 5: // Purchase a Dual power Cell
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("uranium2"));
      break;

    case 6: // Have at least 10 active power Cells in your reactor
      // Start from position 1 to avoid overwriting the uranium2 cell at position 0
      for (let i = 1; i < 11; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("uranium1"));
      }
      break;

    case 7: // Purchase a Perpetual power Cell upgrade for Uranium
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
      // Place multiple high-power cells
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
      // Place multiple high-power cells
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

    case 16: // Have at least 5 active Quad Plutonium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("plutonium3"));
      }
      break;

    case 17: // Expand your reactor 4 times in either direction
      const expandRowsUpgrade = game.upgradeset.getUpgrade(
        "expand_reactor_rows"
      );
      expandRowsUpgrade.setLevel(4);
      break;

    case 18: // Have at least 5 active Quad Thorium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("thorium3"));
      }
      break;

    case 19: // Have at least $10,000,000,000 total
      game.current_money = 10000000000;
      game.ui.stateManager.setVar("current_money", game.current_money);
      break;

    case 20: // Have at least 5 active Quad Seaborgium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("seaborgium3"));
      }
      break;

    case 21: // Generate 10 Exotic Particles with Particle Accelerators
      game.exotic_particles = 10;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 22: // Generate 51 Exotic Particles with Particle Accelerators
      game.exotic_particles = 51;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 23: // Reboot your reactor in the Experiments tab
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

    case 24: // Purchase an Experimental Upgrade
      // First unlock laboratory
      const laboratoryUpgrade = game.upgradeset.getUpgrade("laboratory");
      laboratoryUpgrade.setLevel(1);
      // Then purchase an experimental upgrade
      const infusedCellsUpgrade = game.upgradeset.getUpgrade("infused_cells");
      infusedCellsUpgrade.setLevel(1);
      break;

    case 25: // Have at least 5 active Quad Dolorium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("dolorium3"));
      }
      break;

    case 26: // Generate 1000 Exotic Particles with Particle Accelerators
      game.exotic_particles = 1000;
      game.ui.stateManager.setVar("exotic_particles", game.exotic_particles);
      break;

    case 27: // Have at least 5 active Quad Nefastium Cells in your reactor
      for (let i = 0; i < 5; i++) {
        await game.tileset
          .getTile(0, i)
          .setPart(game.partset.getPartById("nefastium3"));
      }
      break;

    case 28: // Place an experimental part in your reactor
      // First unlock laboratory and protium cells
      const labUpgrade = game.upgradeset.getUpgrade("laboratory");
      labUpgrade.setLevel(1);
      const protiumCellsUpgrade = game.upgradeset.getUpgrade("protium_cells");
      protiumCellsUpgrade.setLevel(1);
      // Then place an experimental part
      await game.tileset
        .getTile(0, 0)
        .setPart(game.partset.getPartById("protium1"));
      break;

    case 29: // All objectives completed!
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
    it(`Objective ${idx + 1}: ${
      typeof obj.title === "function" ? obj.title() : obj.title
    }`, async () => {
      await satisfyObjective(game, idx);

      // For the last objective (All objectives completed), it should always return false
      if (idx === 29) {
        expect(obj.check(game)).toBe(false);
      } else {
        expect(obj.check(game)).toBe(true);
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
        { index: 24, description: "Experimental upgrade" },
      ];

      for (const { index, description } of testObjectives) {
        // Create a fresh game instance for each test
        const testGame = await setupGame();

        // Set up the game state to satisfy the objective
        await satisfyObjective(testGame, index);

        // Verify the objective condition is satisfied
        const objective = objective_list_data[index];
        expect(
          objective.check(testGame),
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

        // Set the objective (this should trigger immediate completion)
        testGame.objectives_manager.set_objective(index, true);

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
      await satisfyObjective(testGame, 5); // Purchase a Dual power Cell
      await satisfyObjective(testGame, 6); // Have at least 10 active power Cells

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

      // Set objective 4 (should auto-complete 4, 5, and 6)
      testGame.objectives_manager.set_objective(4, true);

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
});
