import { vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { JSDOM } from "jsdom";
import { Game } from "../../js/game.js";
import { UI } from "../../js/ui.js";
import { Engine } from "../../js/engine.js";
import { ObjectiveManager } from "../../js/objective.js";
import { PageRouter } from "../../js/pageRouter.js";

// Suppress verbose console output during tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Helper to detect circular references safely
const hasCircularReference = (obj) => {
  try {
    JSON.stringify(obj);
    return false;
  } catch (e) {
    return e.message.includes("circular");
  }
};

// Override console methods to reduce DOM object dumps
console.log = (...args) => {
  const sanitizedArgs = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      if (arg.constructor && arg.constructor.name.includes("HTML")) {
        return `[${arg.constructor.name}]`;
      }
      if (hasCircularReference(arg)) {
        return "[Circular Object]";
      }
      try {
        const str = JSON.stringify(arg);
        if (str && str.length > 200) {
          return "[Large Object]";
        }
      } catch (e) {
        return "[Complex Object]";
      }
    }
    return arg;
  });

  // Only log during tests if explicitly requested
  if (process.env.VITEST_VERBOSE === "true") {
    originalConsoleLog(...sanitizedArgs);
  }
};

console.warn = (...args) => {
  // Filter out known test-related warnings
  const message = args[0]?.toString() || "";
  if (
    message.includes("[StateManager]") ||
    message.includes("Page loading failed") ||
    message.includes("exotic_particles_display") ||
    message.includes("PageRouter: Failed to load page") ||
    message.includes("Could not preserve cloud sync flags")
  ) {
    return; // Suppress these warnings
  }
  originalConsoleWarn(...args);
};

console.error = (...args) => {
  originalConsoleError(...args);
};

// This setup is for CORE LOGIC tests that do not require a DOM.
// It uses a mocked UI for speed and isolation.
let globalGameLogicOnly = null;

export async function setupGame() {
  if (globalGameLogicOnly) {
    globalGameLogicOnly.tileset.clearAllTiles();
    globalGameLogicOnly.reactor.setDefaults();
    globalGameLogicOnly.upgradeset.reset();
    globalGameLogicOnly.partset.reset();
    globalGameLogicOnly.partset.initialize();
    globalGameLogicOnly.current_money = 1e30;
    globalGameLogicOnly.exotic_particles = 1e20;
    globalGameLogicOnly.current_exotic_particles = 1e20;
    globalGameLogicOnly.rows = globalGameLogicOnly.base_rows;
    globalGameLogicOnly.cols = globalGameLogicOnly.base_cols;
    globalGameLogicOnly.tileset.updateActiveTiles();

    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.running) {
      globalGameLogicOnly.engine.stop();
    }

    globalGameLogicOnly.partset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.upgradeset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.reactor.updateStats();
    return globalGameLogicOnly;
  }

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
  ui.stateManager.handlePartAdded = vi.fn();
  ui.stateManager.handleUpgradeAdded = vi.fn();
  ui.stateManager.handleObjectiveCompleted = vi.fn();
  const game = new Game(ui);
  ui.init(game);
  game.engine = new Engine(game);
  game.objectives_manager = new ObjectiveManager(game);
  game.tileset.initialize();
  game.partset.initialize();
  game.upgradeset.initialize();
  game.set_defaults();
  game.current_money = 1e30;
  game.exotic_particles = 1e20;
  game.current_exotic_particles = 1e20;
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  game.reactor.updateStats();

  if (game.engine && game.engine.running) {
    game.engine.stop();
  }
  globalGameLogicOnly = game;
  return game;
}

// This setup is for UI/INTEGRATION tests that require a real DOM.
let dom, window, document;
let globalGameWithDOM = null;

export async function setupGameWithDOM() {
  const indexHtml = fs.readFileSync(
    path.resolve(__dirname, "../../index.html"),
    "utf-8"
  );
  dom = new JSDOM(indexHtml, {
    url: "http://localhost:8080",
    pretendToBeVisual: true,
    resources: "usable",
  });
  window = dom.window;
  document = window.document;

  global.window = window;
  global.document = document;
  global.localStorage = window.localStorage;
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.CustomEvent = window.CustomEvent;
  global.Event = window.Event;

  global.fetch = async (url) => {
    try {
      const filePath = path.resolve(
        __dirname,
        "../../",
        url.toString().replace(/^\//, "")
      );
      const content = fs.readFileSync(filePath, "utf-8");
      return {
        ok: true,
        text: () => Promise.resolve(content),
        json: () => Promise.resolve(JSON.parse(content)),
      };
    } catch (error) {
      console.error(`Fetch failed for URL: ${url}`, error);
      return { ok: false, status: 404, statusText: "Not Found" };
    }
  };

  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;

  ui.init(game);

  // Add a basic tooltip manager mock for DOM tests
  game.tooltip_manager = {
    show: () => {},
    hide: () => {},
    closeView: () => {},
    update: () => {},
    updateUpgradeAffordability: () => {},
    isLocked: false,
    tooltip_showing: false,
    current_obj: null,
  };

  game.tileset.initialize();
  game.partset.initialize();
  game.upgradeset.initialize();
  game.set_defaults();
  game.objectives_manager = new ObjectiveManager(game);
  game.engine = new Engine(game);

  try {
    await pageRouter.loadGameLayout();
    ui.initMainLayout();
    await pageRouter.loadPage("reactor_section");
  } catch (error) {
    // Suppress verbose page loading warnings
    if (process.env.VITEST_VERBOSE) {
      console.warn("Page loading failed in test setup:", error.message);
    }
  }

  game.current_money = 1e30;
  game.exotic_particles = 1e20;
  game.current_exotic_particles = 1e20;

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);

  globalGameWithDOM = game;
  return { game, document, window };
}

export function cleanupGame() {
  if (globalGameLogicOnly) {
    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.stop) {
      globalGameLogicOnly.engine.stop();
    }
    if (
      globalGameLogicOnly.objectives_manager &&
      globalGameLogicOnly.objectives_manager.objective_timeout
    ) {
      clearTimeout(globalGameLogicOnly.objectives_manager.objective_timeout);
    }
    if (globalGameLogicOnly.ui?.update_interface_task) {
      clearTimeout(globalGameLogicOnly.ui.update_interface_task);
      globalGameLogicOnly.ui.update_interface_task = null;
    }
  }

  // More thorough cleanup for the DOM-based game instance
  if (globalGameWithDOM) {
    if (globalGameWithDOM.engine) {
      globalGameWithDOM.engine.stop();
    }
    if (globalGameWithDOM.ui?.update_interface_task) {
      clearTimeout(globalGameWithDOM.ui.update_interface_task);
      globalGameWithDOM.ui.update_interface_task = null;
    }
    if (globalGameWithDOM.objectives_manager?.objective_timeout) {
      clearTimeout(globalGameWithDOM.objectives_manager.objective_timeout);
      globalGameWithDOM.objectives_manager.objective_timeout = null;
    }
    globalGameWithDOM = null;
  }

  if (global.window && typeof global.window.close === "function") {
    // This properly disposes of the JSDOM environment, including its timers
    global.window.close();
  }

  // Clear any potentially lingering globals to ensure test isolation
  global.window = undefined;
  global.document = undefined;
  global.localStorage = undefined;
}

afterEach(() => {
  cleanupGame();
  vi.restoreAllMocks();
});
