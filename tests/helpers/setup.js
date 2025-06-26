import { vi, afterEach, expect } from "vitest";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";
import { Engine } from "../../js/engine.js";
import { ObjectiveManager } from "../../js/objective.js";

// --- START: Enhanced Test Environment Setup ---

// 1. Define large object constructors we want to suppress in logs and assertions.
const LARGE_OBJECT_CONSTRUCTORS = [
  "Game",
  "Tileset",
  "PartSet",
  "UpgradeSet",
  "Reactor",
  "UI",
  "Tile",
  "Engine",
  "ObjectiveManager",
  "TooltipManager",
  "StateManager",
];

// 2. Add a snapshot serializer to clean up Vitest's `expect` failure messages.
expect.addSnapshotSerializer({
  test: (val) =>
    val &&
    val.constructor &&
    LARGE_OBJECT_CONSTRUCTORS.includes(val.constructor.name),
  print: (val) => `[${val.constructor.name} Object]`,
});

// 3. Globally patch console methods to prevent object dumps during tests.
const originalConsoleLog = console.log;
const originalConsoleDir = console.dir;
const originalConsoleError = console.error;

const createSafeLogger =
  (originalLogger) =>
  (...args) => {
    const safeArgs = args.map((arg) => {
      if (
        arg &&
        typeof arg === "object" &&
        arg.constructor &&
        LARGE_OBJECT_CONSTRUCTORS.includes(arg.constructor.name)
      ) {
        return `[${arg.constructor.name} Object]`;
      }
      return arg;
    });
    originalLogger(...safeArgs);
  };

console.log = createSafeLogger(originalConsoleLog);
console.dir = createSafeLogger(originalConsoleDir);

// Suppress known "Error saving game" messages in test environment
console.error = (...args) => {
  const errorMessage = args.join(" ");
  if (
    errorMessage.includes("Error saving game") &&
    process.env.NODE_ENV === "test"
  ) {
    return;
  }
  originalConsoleError(...args);
};

// --- END: Enhanced Test Environment Setup ---

// Note: Enhanced console logging setup is now handled above

// Prevent massive object dumps that crash the terminal
const originalStringify = JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  if (typeof value === "object" && value !== null) {
    // Check if this looks like a game object that would be massive
    if (
      value.constructor &&
      (value.constructor.name === "Game" ||
        value.constructor.name === "Tileset" ||
        value.constructor.name === "PartSet" ||
        value.constructor.name === "UpgradeSet" ||
        (value.tiles_list && value.tiles_list.length > 100) ||
        (value.partsArray && value.partsArray.length > 50))
    ) {
      return `[${value.constructor.name} Object - Truncated to prevent terminal crash]`;
    }

    // Limit depth for large objects
    const seen = new WeakSet();
    let depth = 0;
    const limitedReplacer = (key, val) => {
      depth++;
      if (depth > 5) {
        return "[Max Depth Reached]";
      }

      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);

        // Truncate arrays that are too large
        if (Array.isArray(val) && val.length > 10) {
          return `[Array(${val.length}) - Truncated]`;
        }

        // Truncate objects with too many properties
        if (Object.keys(val).length > 20) {
          return `[Object with ${
            Object.keys(val).length
          } properties - Truncated]`;
        }
      }

      depth--;
      return val;
    };
    return originalStringify(value, limitedReplacer, space);
  }
  return originalStringify(value, replacer, space);
};

// Override expect to limit object depth in error messages
const originalExpected = global.expect;
if (originalExpected) {
  global.expect = function (actual) {
    // Check if actual is a game object and replace with summary
    if (actual && typeof actual === "object" && actual.constructor) {
      const className = actual.constructor.name;
      if (
        ["Game", "Tileset", "PartSet", "UpgradeSet", "Reactor", "UI"].includes(
          className
        )
      ) {
        actual = `[${className} Object - Use specific property tests instead of comparing entire object]`;
      }
    }

    const result = originalExpected(actual);

    // Override common matchers to prevent large object dumps
    const matchers = ["toEqual", "toStrictEqual", "toMatchObject", "toContain"];
    matchers.forEach((matcherName) => {
      if (result[matcherName]) {
        const originalMatcher = result[matcherName];
        result[matcherName] = function (expected) {
          try {
            return originalMatcher.call(this, expected);
          } catch (error) {
            // Severely truncate error messages that contain large objects
            if (error.message) {
              // Remove massive object dumps from error messages
              let message = error.message;

              // Replace object dumps with summaries
              message = message.replace(
                /\{[^{}]{500,}\}/g,
                "[Large Object - Truncated]"
              );
              message = message.replace(
                /\[[^\[\]]{500,}\]/g,
                "[Large Array - Truncated]"
              );

              // Hard limit on message length
              if (message.length > 2000) {
                message =
                  message.substring(0, 2000) +
                  "\n...[Error message truncated to prevent terminal crash]";
              }

              error.message = message;
            }
            throw error;
          }
        };
      }
    });

    return result;
  };
}

// Global game instance to reuse and prevent memory issues
let globalGame = null;

/**
 * Creates a fully initialized game instance for testing.
 * Reuses instance when possible to prevent memory leaks.
 * @returns {Promise<Game>} A game instance ready for testing.
 */
export async function setupGame() {
  // Reuse existing game instance if available
  if (globalGame) {
    // Reset the game state for each test
    globalGame.tileset.clearAllTiles(); // Clear ALL tiles, not just active ones
    globalGame.reactor.setDefaults();
    globalGame.upgradeset.reset();
    globalGame.current_money = 1e30;
    globalGame.exotic_particles = 1e20;
    globalGame.current_exotic_particles = 1e20;
    globalGame.rows = globalGame.base_rows;
    globalGame.cols = globalGame.base_cols;
    globalGame.tileset.updateActiveTiles();

    // Ensure engine is stopped for tests
    if (globalGame.engine && globalGame.engine.running) {
      globalGame.engine.stop();
    }

    globalGame.partset.check_affordability(globalGame);
    globalGame.upgradeset.check_affordability(globalGame);
    globalGame.reactor.updateStats();

    return globalGame;
  }

  // Create real UI instance but with minimal DOM setup for testing
  const ui = new UI();

  // Mock the DOM elements and methods that would require actual DOM
  ui.DOMElements = {
    main: {
      classList: {
        toggle: vi.fn(),
        add: vi.fn(),
        remove: vi.fn(),
      },
    },
  };
  ui.update_vars = new Map();
  ui.cacheDOMElements = vi.fn(() => true);
  ui.resizeReactor = vi.fn();
  ui.updateAllToggleBtnStates = vi.fn();
  ui.updateToggleButtonState = vi.fn();
  ui.showPage = vi.fn();

  const game = new Game(ui);

  // Connect the UI to the game - this is crucial for StateManager to work
  // We call the real init method, not a mock, since we need the StateManager connection
  ui.init(game);

  // Add missing Engine and ObjectiveManager instantiation
  game.engine = new Engine(game);
  game.objectives_manager = new ObjectiveManager(game);

  // Initialize the game with real data, not mocks
  game.tileset.initialize();
  game.partset.initialize();
  game.upgradeset.initialize();

  game.set_defaults();

  // Give plenty of resources for testing purchases
  game.current_money = 1e30;
  game.exotic_particles = 1e20;
  game.current_exotic_particles = 1e20;

  // Recalculate affordability for all parts and upgrades
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);

  game.reactor.updateStats();

  // Ensure engine is definitely stopped after all initialization
  if (game.engine && game.engine.running) {
    game.engine.stop();
  }

  // Store for reuse
  globalGame = game;

  return game;
}

// Cleanup function for test teardown
export function cleanupGame() {
  if (globalGame) {
    // Clear any timers or intervals
    if (globalGame.engine && globalGame.engine.stop) {
      globalGame.engine.stop();
    }
    if (
      globalGame.objectives_manager &&
      globalGame.objectives_manager.objective_timeout
    ) {
      clearTimeout(globalGame.objectives_manager.objective_timeout);
    }
  }
}

// Global cleanup after each test
afterEach(() => {
  cleanupGame();

  // Force garbage collection if available (for debugging memory issues)
  if (global.gc) {
    global.gc();
  }
});
