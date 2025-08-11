import { describe, it, expect, beforeEach, afterEach, setupGame, cleanupGame, UI, Game, Engine, ObjectiveManager } from "./helpers/setup.js";
import dataService from "@app/services/dataService.js";
import { getObjectiveCheck } from "@app/core/objectiveActions.js";

// Load objective data
let objective_list_data = [];
beforeEach(async () => {
  try {
    objective_list_data = await dataService.loadObjectiveList();
  } catch (error) {
    console.warn("Failed to load objective list in test:", error);
    objective_list_data = [];
  }
});

describe("Debug Tests", () => {
  it("should clamp objective index to valid range when loading saved game", async () => {
    const testGame = await setupGame();

    // Ensure objectives_manager is fully initialized
    await testGame.objectives_manager.initialize();

    // Simulate a saved game with an invalid objective index (beyond the valid range)
    const invalidIndex = testGame.objectives_manager.objectives_data.length + 5; // Way beyond valid range

    // Mock console.warn to capture the warning message
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (msg) => {
      warningMessage = msg;
      originalWarn(msg);
    };

    // Apply save state with invalid index
    const saveData = {
      objectives: {
        current_objective_index: invalidIndex
      }
    };

    testGame.applySaveState(saveData);

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify the index was clamped to the valid range
    const maxValidIndex = testGame.objectives_manager.objectives_data.length - 2; // Last real objective (not "All objectives completed!")
    console.log(`Expected: ${maxValidIndex}, Actual: ${testGame.objectives_manager.current_objective_index}`);
    expect(testGame.objectives_manager.current_objective_index).toBe(maxValidIndex);
    expect(testGame._saved_objective_index).toBe(maxValidIndex);
    expect(warningMessage).toContain("beyond valid range");
    expect(warningMessage).toContain("Clamping to");

    // Restore console.warn
    console.warn = originalWarn;
    cleanupGame();
  });

  it("should handle loading a game with negative objective index", async () => {
    // Clear the global instance to ensure a fresh start
    cleanupGame();

    // Create a new game instance without using the global one
    const ui = new UI();
    ui.DOMElements = {
      main: { classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() } },
    };
    ui.update_vars = new Map();
    ui.cacheDOMElements = vi.fn(() => true);
    ui.resizeReactor = vi.fn();
    ui.updateAllToggleBtnStates = vi.fn();
    ui.updateToggleButtonState = vi.fn();
    ui.showPage = vi.fn();

    // Mock stateManager methods after UI is created
    if (ui.stateManager) {
      ui.stateManager.handlePartAdded = vi.fn();
      ui.stateManager.handleUpgradeAdded = vi.fn();
      ui.stateManager.handleObjectiveCompleted = vi.fn();
      ui.stateManager.handleObjectiveUnloaded = vi.fn();
      ui.stateManager.setVar = vi.fn();
    }

    const testGame = new Game(ui);
    await ui.init(testGame);
    testGame.engine = new Engine(testGame);

    // Create objective manager
    testGame.objectives_manager = new ObjectiveManager(testGame);
    await testGame.objectives_manager.initialize();

    testGame.tileset.initialize();
    await testGame.partset.initialize();
    await testGame.upgradeset.initialize();

    // Don't call set_defaults() here as we want to test the applySaveState behavior
    testGame.current_money = 1e30;
    testGame.exotic_particles = 1e20;
    testGame.current_exotic_particles = 1e20;
    testGame.partset.check_affordability(testGame);
    testGame.upgradeset.check_affordability(testGame);
    testGame.reactor.updateStats();

    // Create save data with negative objective index
    const saveData = {
      version: "1.4.0",
      objectives: {
        current_objective_index: -5
      }
    };

    // Mock console.warn to capture the warning message
    const originalWarn = console.warn;
    let warningMessage = "";
    console.warn = (msg) => {
      warningMessage = msg;
      originalWarn(msg);
    };

    // Apply save state with negative index
    await testGame.applySaveState(saveData);

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify the index was clamped to 0
    console.log(`Expected: 0, Actual: ${testGame.objectives_manager.current_objective_index}`);
    expect(testGame.objectives_manager.current_objective_index).toBe(0);
    expect(warningMessage).toContain("Negative");
    expect(warningMessage).toContain("Clamping to 0");

    // Restore console.warn
    console.warn = originalWarn;
  });

  it("should handle loading a game with string objective index", async () => {
    // Clear the global instance to ensure a fresh start
    cleanupGame();

    // Create a new game instance without using the global one
    const ui = new UI();
    ui.DOMElements = {
      main: { classList: { toggle: vi.fn(), add: vi.fn(), remove: vi.fn() } },
    };
    ui.update_vars = new Map();
    ui.cacheDOMElements = vi.fn(() => true);
    ui.resizeReactor = vi.fn();
    ui.updateAllToggleBtnStates = vi.fn();
    ui.updateToggleButtonState = vi.fn();
    ui.showPage = vi.fn();

    // Mock stateManager methods after UI is created
    if (ui.stateManager) {
      ui.stateManager.handlePartAdded = vi.fn();
      ui.stateManager.handleUpgradeAdded = vi.fn();
      ui.stateManager.handleObjectiveCompleted = vi.fn();
      ui.stateManager.handleObjectiveUnloaded = vi.fn();
      ui.stateManager.setVar = vi.fn();
    }

    const testGame = new Game(ui);
    await ui.init(testGame);
    testGame.engine = new Engine(testGame);

    // Create objective manager
    testGame.objectives_manager = new ObjectiveManager(testGame);
    await testGame.objectives_manager.initialize();

    testGame.tileset.initialize();
    await testGame.partset.initialize();
    await testGame.upgradeset.initialize();

    // Don't call set_defaults() here as we want to test the applySaveState behavior
    testGame.current_money = 1e30;
    testGame.exotic_particles = 1e20;
    testGame.current_exotic_particles = 1e20;
    testGame.partset.check_affordability(testGame);
    testGame.upgradeset.check_affordability(testGame);
    testGame.reactor.updateStats();

    // Create save data with string objective index
    const saveData = {
      version: "1.4.0",
      objectives: {
        current_objective_index: "5"
      }
    };

    // Apply save state with string index
    await testGame.applySaveState(saveData);

    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    // Verify the index is converted to number (the applySaveState method should handle this)
    console.log(`Expected: 5, Actual: ${testGame.objectives_manager.current_objective_index}`);
    expect(testGame.objectives_manager.current_objective_index).toBe(5);
  });
});
