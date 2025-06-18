import { vi } from "vitest";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";

// Configure test environment to limit verbose output
// Override console methods to prevent massive output
const originalConsoleLog = console.log;
const originalConsoleDir = console.dir;
const originalConsoleError = console.error;

console.log = (...args) => {
  // Only log simple values, truncate objects
  const truncatedArgs = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      return "[Object]";
    }
    return arg;
  });
  originalConsoleLog(...truncatedArgs);
};

console.dir = (obj, options) => {
  // Limit depth to 2 levels
  originalConsoleDir(obj, { ...options, depth: 2 });
};

console.error = (...args) => {
  // Truncate error objects
  const truncatedArgs = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      return "[Error Object]";
    }
    return arg;
  });
  originalConsoleError(...truncatedArgs);
};

// Limit the depth of object serialization to prevent massive dumps
const originalStringify = JSON.stringify;
JSON.stringify = function (value, replacer, space) {
  if (typeof value === "object" && value !== null) {
    // Limit depth for large objects
    const seen = new WeakSet();
    const limitedReplacer = (key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) {
          return "[Circular]";
        }
        seen.add(val);
        // Limit depth by truncating nested objects
        if (key && key.length > 2) {
          return "[Truncated]";
        }
      }
      return val;
    };
    return originalStringify(value, limitedReplacer, space);
  }
  return originalStringify(value, replacer, space);
};

// Override expect to limit object depth in error messages
const originalExpect = global.expect;
if (originalExpect) {
  global.expect = function (actual) {
    const result = originalExpect(actual);

    // Override toEqual to limit object depth
    const originalToEqual = result.toEqual;
    result.toEqual = function (expected) {
      try {
        return originalToEqual.call(this, expected);
      } catch (error) {
        // Truncate the error message if it contains large objects
        if (error.message && error.message.length > 1000) {
          error.message = error.message.substring(0, 1000) + "...[truncated]";
        }
        throw error;
      }
    };

    return result;
  };
}

// Mock the UI class, as we don't need to test the actual DOM rendering.
// We'll provide a mock stateManager to control game flags during tests.
vi.mock("../../js/ui.js", () => {
  const mockState = new Map();

  const mockGetVar = vi.fn((key) => {
    // Provide default values for toggleable states
    if (["auto_buy", "auto_sell", "heat_control", "pause"].includes(key)) {
      return mockState.get(key) ?? false;
    }
    if (key === "time_flux") {
      return mockState.get(key) ?? true;
    }
    return mockState.get(key);
  });

  const mockSetVar = vi.fn((key, value) => {
    mockState.set(key, value);
  });

  // Clear state between tests
  vi.spyOn(mockState, "clear").mockClear();
  vi.spyOn(mockGetVar, "mockClear").mockClear();
  vi.spyOn(mockSetVar, "mockClear").mockClear();

  const UI = vi.fn();
  UI.prototype.init = vi.fn(() => true);
  UI.prototype.cacheDOMElements = vi.fn(() => true);
  UI.prototype.resizeReactor = vi.fn();
  UI.prototype.updateAllToggleBtnStates = vi.fn();
  UI.prototype.updateToggleButtonState = vi.fn();
  UI.prototype.showPage = vi.fn();

  // The state manager is the most important part of the UI to mock for logic tests
  UI.prototype.stateManager = {
    handleTileAdded: vi.fn(),
    handlePartAdded: vi.fn(),
    handleUpgradeAdded: vi.fn(),
    getVar: mockGetVar,
    setVar: mockSetVar,
    setGame: vi.fn(),
    game_reset: vi.fn(),
    setClickedPart: vi.fn(),
    getClickedPart: vi.fn(() => null),
    handleObjectiveCompleted: vi.fn(),
    handleObjectiveLoaded: vi.fn(),
    handleObjectiveUnloaded: vi.fn(),
  };

  // Helper to access mocks from the test files
  UI.prototype.getMockGetVar = () => mockGetVar;
  UI.prototype.getMockSetVar = () => mockSetVar;

  return { UI };
});

/**
 * Creates a fully initialized game instance for testing.
 * @returns {Promise<Game>} A game instance ready for testing.
 */
export async function setupGame() {
  const mockUi = new UI();

  // Clear mocks before each setup
  mockUi.stateManager.getVar.mockClear();
  mockUi.stateManager.setVar.mockClear();

  const game = new Game(mockUi);

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

  return game;
}
