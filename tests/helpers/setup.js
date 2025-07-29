// Test framework imports
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Node.js imports
import fs from "fs";
import path from "path";

// DOM testing imports
import { JSDOM } from "jsdom";

// Core game imports
import { Game } from "../../src/core/game.js";
import { UI } from "../../src/components/ui.js";
import { Engine } from "../../src/core/engine.js";
import { ObjectiveManager } from "../../src/core/objective.js";
import { PageRouter } from "../../src/components/pageRouter.js";
import { TemplateLoader } from "../../src/services/templateLoader.js";

// Export all common imports for use in test files
export {
  // Test framework
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,

  // Node.js
  fs,
  path,

  // DOM testing
  JSDOM,

  // Core game classes
  Game,
  UI,
  Engine,
  ObjectiveManager,
  PageRouter,
  TemplateLoader
};

// Polyfill performance.mark and performance.measure for all tests
if (typeof global.performance === "undefined") {
  global.performance = {};
}
global.performance.mark = global.performance.mark || (() => { });
global.performance.measure = global.performance.measure || (() => { });

// Polyfill PointerEvent for tests
if (typeof global.PointerEvent === "undefined") {
  global.PointerEvent = class PointerEvent extends Event {
    constructor(type, options = {}) {
      super(type, options);
      this.pointerId = options.pointerId || 1;
      this.pointerType = options.pointerType || "mouse";
      this.button = options.button || 0;
      this.buttons = options.buttons || 0;
      this.clientX = options.clientX || 0;
      this.clientY = options.clientY || 0;
      this.screenX = options.screenX || 0;
      this.screenY = options.screenY || 0;
      this.ctrlKey = options.ctrlKey || false;
      this.altKey = options.altKey || false;
      this.shiftKey = options.shiftKey || false;
      this.metaKey = options.metaKey || false;

      // Ensure target has closest method if it's an element
      if (options.target && typeof options.target.closest === 'undefined') {
        options.target.closest = function (selector) {
          let element = this;
          while (element) {
            if (element.matches && element.matches(selector)) {
              return element;
            }
            element = element.parentElement;
          }
          return null;
        };
      }
    }
  };
}

// Polyfill closest method for window object in tests
if (typeof global.window !== "undefined" && typeof global.window.closest === "undefined") {
  global.window.closest = function (selector) {
    // Window doesn't have a closest method, return null
    return null;
  };
}

// Store original console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

// Map to store logs for each test, keyed by full test name
const testLogs = new Map();

// Track the current test context
let currentTestName = null;

// Helper to get a unique name for the current test
const getFullTestName = (task) => {
  if (!task) return 'global';
  const path = [];
  let current = task;
  while (current && current.name) {
    path.unshift(current.name);
    current = current.suite;
  }
  return path.join(' > ');
};

// Immediately override console methods to ensure they're captured
const createLogger = (type) => (...args) => {
  const logs = currentTestName ? testLogs.get(currentTestName) : null;

  const sanitizedArgs = args.map((arg) => {
    if (typeof arg === "object" && arg !== null) {
      return safeSerialize(arg, 2);
    }
    return arg;
  });

  if (logs) {
    logs.push({ type, args: sanitizedArgs });
  } else {
    // If we're not in a test context, use the original logger
    const originalLogger = {
      log: originalConsoleLog,
      warn: originalConsoleWarn,
      error: originalConsoleError,
    }[type];
    originalLogger(...sanitizedArgs);
  }
};

// Global flag to force log buffer dumps even on successful tests
global.FORCE_LOG_DUMP = process.env.FORCE_LOG_DUMP === 'true' || process.env.FORCE_LOG_DUMP === '1';

// Override console methods immediately
console.log = createLogger('log');
console.warn = createLogger('warn');
console.error = createLogger('error');

// Before each test, create a new log buffer
beforeEach((context) => {
  currentTestName = getFullTestName(context.task);
  testLogs.set(currentTestName, []);
});

// After each test, check its state and print logs if it failed
afterEach((context) => {
  const fullTestName = getFullTestName(context.task);
  const logs = testLogs.get(fullTestName);

  // Check if test failed - look for both 'fail' state and error presence
  const testFailed = context.task.state === 'fail' || context.task.result?.state === 'fail' || context.task.result?.error;

  // Dump logs if test failed OR if FORCE_LOG_DUMP is enabled
  if ((testFailed || global.FORCE_LOG_DUMP) && logs && logs.length > 0) {
    const status = testFailed ? 'failed' : 'passed';
    originalConsoleLog(`\n\u001b[36m--- Console logs for ${status} test: "${fullTestName}" ---\u001b[0m`);
    logs.forEach(({ type, args }) => {
      const originalLogger = {
        log: originalConsoleLog,
        warn: originalConsoleWarn,
        error: originalConsoleError,
      }[type];
      originalLogger(...args);
    });
    originalConsoleLog(`\u001b[36m---------------------------------------------------------\u001b[0m\n`);
  }

  // Clean up the logs for the completed test
  testLogs.delete(fullTestName);
  currentTestName = null;
});

// Helper to detect circular references safely
const hasCircularReference = (obj) => {
  try {
    JSON.stringify(obj);
    return false;
  } catch (e) {
    return e.message.includes("circular");
  }
};

// Helper to safely serialize objects for console output
const safeSerialize = (obj, maxDepth = 2, currentDepth = 0) => {
  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== 'object') {
    return String(obj);
  }

  if (currentDepth >= maxDepth) {
    return '[Deep Object]';
  }

  if (hasCircularReference(obj)) {
    return '[Circular Object]';
  }

  // Handle DOM elements
  if (obj.constructor && obj.constructor.name.includes("HTML")) {
    return `[${obj.constructor.name}]`;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (obj.length > 10) return `[Array(${obj.length})]`;
    return `[${obj.slice(0, 10).map(item => safeSerialize(item, maxDepth, currentDepth + 1)).join(', ')}${obj.length > 10 ? '...' : ''}]`;
  }

  // Handle objects
  try {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length > 10) return `{Object(${keys.length} keys)}`;

    const serialized = keys.slice(0, 10).map(key => {
      const value = safeSerialize(obj[key], maxDepth, currentDepth + 1);
      return `${key}: ${value}`;
    }).join(', ');

    return `{${serialized}${keys.length > 10 ? '...' : ''}}`;
  } catch (e) {
    return '[Complex Object]';
  }
};

// This setup is for CORE LOGIC tests that do not require a DOM.
// It uses a mocked UI for speed and isolation.
let globalGameLogicOnly = null;

export async function setupGame() {
  if (globalGameLogicOnly) {
    globalGameLogicOnly.tileset.clearAllTiles();
    globalGameLogicOnly.reactor.setDefaults();
    globalGameLogicOnly.upgradeset.reset();
    await globalGameLogicOnly.upgradeset.initialize(); // Re-initialize upgrades after reset
    globalGameLogicOnly.partset.reset();
    await globalGameLogicOnly.partset.initialize();
    await globalGameLogicOnly.objectives_manager.initialize(); // Re-initialize objective manager
    globalGameLogicOnly.current_money = 1e30;
    globalGameLogicOnly.exotic_particles = 1e20;
    globalGameLogicOnly.current_exotic_particles = 1e20;
    globalGameLogicOnly.rows = globalGameLogicOnly.base_rows;
    globalGameLogicOnly.cols = globalGameLogicOnly.base_cols;
    globalGameLogicOnly.tileset.updateActiveTiles();

    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.running) {
      globalGameLogicOnly.engine.stop();
    }

    // Reset state manager
    globalGameLogicOnly.ui.stateManager.setVar("current_money", globalGameLogicOnly.current_money);
    globalGameLogicOnly.ui.stateManager.setVar("exotic_particles", globalGameLogicOnly.exotic_particles);
    globalGameLogicOnly.ui.stateManager.setVar("current_exotic_particles", globalGameLogicOnly.current_exotic_particles);

    globalGameLogicOnly.partset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.upgradeset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.reactor.updateStats();

    // Start the engine for tests (unless explicitly testing pause behavior)
    if (globalGameLogicOnly.engine && !globalGameLogicOnly.paused) {
      globalGameLogicOnly.engine.start();
    }

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
  await ui.init(game);
  game.engine = new Engine(game);
  game.objectives_manager = new ObjectiveManager(game);
  await game.objectives_manager.initialize(); // Initialize the objective manager
  game.tileset.initialize();
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  game.current_money = 1e30;
  game.exotic_particles = 1e20;
  game.current_exotic_particles = 1e20;
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  game.reactor.updateStats();

  if (game.engine && game.engine.running) {
    game.engine.stop();
  }

  // Start the engine for tests (unless explicitly testing pause behavior)
  if (game.engine && !game.paused) {
    game.engine.start();
  }

  globalGameLogicOnly = game;
  return game;
}

let dom, window, document;
let globalGameWithDOM = null;

// Helper function to inject HTML content into the DOM
function injectHTMLContent(document, htmlContent) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;

  // Move all child nodes to the document body
  while (tempDiv.firstChild) {
    document.body.appendChild(tempDiv.firstChild);
  }
}

// Helper function to initialize template loader with real content
async function initializeTemplateLoader(window) {
  try {
    // Read the actual templates.html file
    const templatesPath = path.resolve(__dirname, "../../public/components/templates.html");
    const templatesContent = fs.readFileSync(templatesPath, "utf-8");

    // Create a template loader instance
    const templateLoader = new TemplateLoader();

    // Mock the fetch method to return our templates content
    const originalFetch = window.fetch;
    window.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('templates.html')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(templatesContent)
        });
      }
      // Fall back to original fetch for other URLs
      return originalFetch(url);
    });

    // Load templates
    await templateLoader.loadTemplates();

    // Restore original fetch
    window.fetch = originalFetch;

    return templateLoader;
  } catch (error) {
    console.warn("Failed to initialize template loader with real content:", error.message);
    // Return a basic mock if real content fails
    return {
      cloneTemplateElement: vi.fn(() => document.createElement('div')),
      getTemplate: vi.fn(() => document.createElement('div'))
    };
  }
}

export async function setupGameWithDOM() {
  const indexHtml = fs.readFileSync(
    path.resolve(__dirname, "../../public/index.html"),
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

  // Enhanced fetch mock that handles more file types
  global.fetch = async (url) => {
    try {
      // Handle different URL patterns
      let relativePath = url.toString();

      // Remove leading slash if present
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }

      // Handle relative paths that start with ./
      if (relativePath.startsWith('./')) {
        relativePath = relativePath.substring(2);
      }

      // Resolve to public directory for static assets
      const filePath = path.resolve(
        __dirname,
        "../../public",
        relativePath
      );

      const content = fs.readFileSync(filePath, "utf-8");

      // Determine content type based on file extension
      let contentType = "text/plain";
      if (relativePath.endsWith('.json')) {
        contentType = "application/json";
      } else if (relativePath.endsWith('.html')) {
        contentType = "text/html";
      } else if (relativePath.endsWith('.css')) {
        contentType = "text/css";
      } else if (relativePath.endsWith('.js')) {
        contentType = "application/javascript";
      }

      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', contentType]]),
        text: () => Promise.resolve(content),
        json: () => Promise.resolve(JSON.parse(content)),
      };
    } catch (error) {
      console.error(`Fetch failed for URL: ${url}`, error);
      return { ok: false, status: 404, statusText: "Not Found" };
    }
  };

  // Initialize the template loader with real content
  window.templateLoader = await initializeTemplateLoader(window);

  // Inject required HTML content from game pages
  try {
    // Inject reactor page content
    const reactorHtmlPath = path.resolve(__dirname, "../../public/pages/reactor.html");
    if (fs.existsSync(reactorHtmlPath)) {
      const reactorContent = fs.readFileSync(reactorHtmlPath, "utf-8");
      injectHTMLContent(document, reactorContent);
    }

    // Inject game page content
    const gameHtmlPath = path.resolve(__dirname, "../../public/pages/game.html");
    if (fs.existsSync(gameHtmlPath)) {
      const gameContent = fs.readFileSync(gameHtmlPath, "utf-8");
      injectHTMLContent(document, gameContent);
    }
  } catch (error) {
    console.warn("Failed to inject HTML content:", error.message);
  }

  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;

  // Mock Google Drive functionality for all tests
  game.googleDriveSave = {
    saveToCloud: vi.fn(() => Promise.resolve()),
    loadFromCloud: vi.fn(() => Promise.resolve({})),
    isSignedIn: vi.fn(() => false)
  };

  await ui.init(game);

  // Add a basic tooltip manager mock for DOM tests
  game.tooltip_manager = {
    show: () => { },
    hide: () => { },
    closeView: () => { },
    update: () => { },
    updateUpgradeAffordability: () => { },
    isLocked: false,
    tooltip_showing: false,
    current_obj: null,
  };

  game.tileset.initialize();
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  game.objectives_manager = new ObjectiveManager(game);
  await game.objectives_manager.initialize();
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

// Enhanced DOM setup for UI elements required by tests
beforeEach(() => {
  if (typeof document !== 'undefined') {
    // Ensure required UI elements exist
    const requiredElements = [
      'reactor_copy_btn',
      'reactor_paste_btn',
      'reactor',
      'main',
      'tooltip',
      'splash-container',
      'pause_toggle',
      'tab_power',
      'tab_heat',
      'parts_tab_power',
      'parts_tab_heat',
      'parts_help_toggle',
      'parts_section',
      'reactor_section',
      'upgrades_section'
    ];

    requiredElements.forEach(id => {
      if (!document.getElementById(id)) {
        const element = document.createElement(id.includes('btn') || id.includes('toggle') ? 'button' : 'div');
        element.id = id;
        element.className = id;

        // Set specific attributes for certain elements
        if (id === 'pause_toggle') {
          element.textContent = 'Pause';
        } else if (id === 'tab_power') {
          element.setAttribute('data-tab', 'power');
          element.classList.add('parts_tab', 'active');
        } else if (id === 'tab_heat') {
          element.setAttribute('data-tab', 'heat');
          element.classList.add('parts_tab');
        } else if (id === 'parts_tab_power') {
          element.classList.add('parts_tab_content', 'active');
        } else if (id === 'parts_tab_heat') {
          element.classList.add('parts_tab_content');
        } else if (id === 'parts_help_toggle') {
          element.textContent = '?';
          element.classList.add('parts_help_btn');
        } else if (id === 'parts_section') {
          element.classList.add('parts_section');
          // Add parts tabs container
          const partsTabs = document.createElement('div');
          partsTabs.className = 'parts_tabs';
          element.appendChild(partsTabs);

          // Add parts tab contents container
          const partsTabContents = document.createElement('div');
          partsTabContents.id = 'parts_tab_contents';
          element.appendChild(partsTabContents);
        }

        document.body.appendChild(element);
      }
    });

    // Add specific classes and attributes for UI elements
    const reactorElement = document.getElementById('reactor');
    if (reactorElement) {
      reactorElement.className = 'reactor-grid';
    }

    const mainElement = document.getElementById('main');
    if (mainElement) {
      mainElement.className = 'main-container';
    }

    // Ensure parts tabs are properly structured
    const partsTabs = document.querySelector('.parts_tabs');
    if (partsTabs) {
      const powerTab = document.getElementById('tab_power');
      const heatTab = document.getElementById('tab_heat');
      const helpToggle = document.getElementById('parts_help_toggle');

      if (powerTab && !partsTabs.contains(powerTab)) {
        partsTabs.appendChild(powerTab);
      }
      if (heatTab && !partsTabs.contains(heatTab)) {
        partsTabs.appendChild(heatTab);
      }
      if (helpToggle && !partsTabs.contains(helpToggle)) {
        partsTabs.appendChild(helpToggle);
      }
    }

    // Ensure parts tab contents are properly structured
    const partsTabContents = document.getElementById('parts_tab_contents');
    if (partsTabContents) {
      const powerContent = document.getElementById('parts_tab_power');
      const heatContent = document.getElementById('parts_tab_heat');

      if (powerContent && !partsTabContents.contains(powerContent)) {
        partsTabContents.appendChild(powerContent);
      }
      if (heatContent && !partsTabContents.contains(heatContent)) {
        partsTabContents.appendChild(heatContent);
      }
    }

    // Create a sample tile for testing
    const reactor = document.getElementById('reactor');
    if (reactor && !reactor.querySelector('.tile')) {
      const tile = document.createElement('div');
      tile.className = 'tile enabled';
      tile.setAttribute('data-row', '5');
      tile.setAttribute('data-col', '5');
      tile.tile = { row: 5, col: 5, part: null };
      reactor.appendChild(tile);
    }
  }
});

afterEach(() => {
  cleanupGame();
  vi.restoreAllMocks();
});

// Custom assertion helpers for focused error reporting
export const gameAssertions = {
  // Assert tile has specific part
  tileHasPart: (tile, expectedPartId, message = '') => {
    if (!tile.part) {
      throw new Error(`${message}Tile has no part. Expected: ${expectedPartId}`);
    }
    if (tile.part.id !== expectedPartId) {
      throw new Error(`${message}Tile has wrong part. Expected: ${expectedPartId}, Got: ${tile.part.id}`);
    }
  },

  // Assert tile heat level
  tileHeatLevel: (tile, expectedHeat, tolerance = 0.1, message = '') => {
    const actualHeat = tile.heat_contained || 0;
    if (Math.abs(actualHeat - expectedHeat) > tolerance) {
      throw new Error(`${message}Tile heat level incorrect. Expected: ${expectedHeat}, Got: ${actualHeat}`);
    }
  },

  // Assert reactor stats
  reactorStats: (reactor, expectedStats, message = '') => {
    const errors = [];
    Object.entries(expectedStats).forEach(([key, expectedValue]) => {
      const actualValue = reactor[key];
      if (typeof expectedValue === 'number') {
        if (Math.abs(actualValue - expectedValue) > 0.1) {
          errors.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
        }
      } else if (actualValue !== expectedValue) {
        errors.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
      }
    });

    if (errors.length > 0) {
      throw new Error(`${message}Reactor stats mismatch:\n${errors.join('\n')}`);
    }
  },

  // Assert upgrade level
  upgradeLevel: (upgrade, expectedLevel, message = '') => {
    if (upgrade.level !== expectedLevel) {
      throw new Error(`${message}Upgrade level incorrect. Expected: ${expectedLevel}, Got: ${upgrade.level}`);
    }
  },

  // Assert money amount
  moneyAmount: (game, expectedAmount, tolerance = 0.1, message = '') => {
    const actualAmount = game.current_money;
    if (Math.abs(actualAmount - expectedAmount) > tolerance) {
      throw new Error(`${message}Money amount incorrect. Expected: ${expectedAmount}, Got: ${actualAmount}`);
    }
  },

  // Assert part ticks
  partTicks: (tile, expectedTicks, message = '') => {
    const actualTicks = tile.ticks;
    if (actualTicks !== expectedTicks) {
      throw new Error(`${message}Part ticks incorrect. Expected: ${expectedTicks}, Got: ${actualTicks}`);
    }
  },

  // Assert tile is activated
  tileActivated: (tile, expectedActivated = true, message = '') => {
    const actualActivated = tile.activated;
    if (actualActivated !== expectedActivated) {
      throw new Error(`${message}Tile activation incorrect. Expected: ${expectedActivated}, Got: ${actualActivated}`);
    }
  },

  // Assert part exists
  partExists: (partset, partId, message = '') => {
    const part = partset.getPartById(partId);
    if (!part) {
      throw new Error(`${message}Part not found: ${partId}`);
    }
  },

  // Assert upgrade exists
  upgradeExists: (upgradeset, upgradeId, message = '') => {
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (!upgrade) {
      throw new Error(`${message}Upgrade not found: ${upgradeId}`);
    }
  }
};

// Enhanced expect matchers for game objects
expect.extend({
  toHavePart(received, expectedPartId) {
    const pass = received.part && received.part.id === expectedPartId;
    return {
      pass,
      message: () =>
        pass
          ? `Expected tile not to have part ${expectedPartId}`
          : `Expected tile to have part ${expectedPartId}, but got ${received.part?.id || 'null'}`
    };
  },

  toHaveHeatLevel(received, expectedHeat, tolerance = 0.1) {
    const actualHeat = received.heat_contained || 0;
    const pass = Math.abs(actualHeat - expectedHeat) <= tolerance;
    return {
      pass,
      message: () =>
        pass
          ? `Expected tile heat level not to be ${expectedHeat}`
          : `Expected tile heat level to be ${expectedHeat}, but got ${actualHeat}`
    };
  },

  toHaveUpgradeLevel(received, expectedLevel) {
    const pass = received.level === expectedLevel;
    return {
      pass,
      message: () =>
        pass
          ? `Expected upgrade level not to be ${expectedLevel}`
          : `Expected upgrade level to be ${expectedLevel}, but got ${received.level}`
    };
  }
});
