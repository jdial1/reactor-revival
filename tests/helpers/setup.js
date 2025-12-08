// Ensure globals are mocked for all tests BEFORE any imports

// --- 1. Define Mock Storage Factory ---
const createMockLocalStorage = () => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
        key: (i) => Object.keys(store)[i] || null,
        get length() { return Object.keys(store).length; },
        _data: store // backdoor for tests
    };
};

// --- 2. Ensure Global localStorage exists immediately ---
// This is crucial because module imports (like Game) might use it at top-level
if (typeof global.localStorage === "undefined") {
    global.localStorage = createMockLocalStorage();
}

if (typeof global.crypto === "undefined") {
    global.crypto = {
        randomUUID: () => '00000000-0000-0000-0000-000000000000'
    };
}

if (typeof global.window === "undefined") {
    global.window = {
        localStorage: global.localStorage,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
        location: {
            href: 'http://localhost:8080/',
            origin: 'http://localhost:8080',
            pathname: '/',
            hash: ''
        }
    };
}

if (typeof global.document === "undefined") {
    global.document = {
        createElement: () => ({ 
            style: {}, 
            classList: { add: () => {}, remove: () => {}, toggle: () => {} },
            appendChild: () => {},
            addEventListener: () => {}
        }),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {}
    };
}

// Test framework imports
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Node.js imports
import fs from "fs";
import path from "path";
import { numFormat as fmt } from "../../public/src/utils/util.js";

// DOM testing imports
import { JSDOM } from "jsdom";

// Core game imports
import { Game } from "../../public/src/core/game.js";
import { UI } from "../../public/src/components/ui.js";
import { Engine } from "../../public/src/core/engine.js";
import { ObjectiveManager } from "../../public/src/core/objective.js";
import { PageRouter } from "../../public/src/components/pageRouter.js";
import { TemplateLoader } from "../../public/src/services/templateLoader.js";

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

// Helper to get the test file name from the task
const getTestFileName = (task) => {
  if (!task) return 'unknown';
  let current = task;
  while (current) {
    if (current.file) {
      let filePath;
      if (typeof current.file === 'string') {
        filePath = current.file;
      } else if (current.file.filepath) {
        filePath = current.file.filepath;
      } else if (current.file.name) {
        filePath = current.file.name;
      } else {
        filePath = String(current.file);
      }
      return path.basename(filePath);
    }
    current = current.suite;
  }
  return 'unknown';
};

// Immediately override console methods to ensure they're captured
const createLogger = (type) => (...args) => {
  const logs = currentTestName ? testLogs.get(currentTestName) : null;

  // Filter out toggle and time flux debug logs for successful tests
  // These will still be captured for failed tests in afterEach, but suppressed for successful tests
  if (!global.FORCE_LOG_DUMP) {
    const hasToggleOrTimeFluxLog = args.some((arg) => {
      if (typeof arg === "string") {
        return arg.startsWith('[TOGGLE]') || arg.startsWith('[TIME FLUX]');
      }
      return false;
    });

    if (hasToggleOrTimeFluxLog) {
      // Skip these logs entirely for successful tests
      // They'll be available in failed tests via other debug info
      return;
    }
  }

  // Filter out large objects and save data to prevent verbose logging
  const shouldLog = args.every((arg) => {
    if (typeof arg === "string") {
      // Don't log save data or large JSON strings
      if (arg.includes('"version"') && arg.includes('"current_money"') && arg.includes('"rows"')) {
        return false; // This looks like save data
      }
      // Don't log very long strings
      if (arg.length > 200) {
        return false;
      }
    }
    if (typeof arg === "object" && arg !== null) {
      // Don't log very large objects
      try {
        const size = JSON.stringify(arg).length;
        if (size > 500) {
          return false;
        }

        // Don't log Tile objects or other game objects that are verbose
        if (arg.constructor && (
          arg.constructor.name === 'Tile' ||
          arg.constructor.name === 'Game' ||
          arg.constructor.name === 'Reactor' ||
          arg.constructor.name === 'Engine' ||
          arg.constructor.name === 'Tileset' ||
          arg.constructor.name === 'PartSet' ||
          arg.constructor.name === 'UpgradeSet'
        )) {
          return false;
        }
      } catch (e) {
        // If we can't serialize, don't log it
        return false;
      }
    }
    return true;
  });

  if (!shouldLog) {
    // Replace with a summary message
    const summaryArgs = args.map((arg) => {
      if (typeof arg === "string" && arg.length > 200) {
        return `[Long string: ${arg.length} characters]`;
      }
      if (typeof arg === "object" && arg !== null) {
        try {
          const size = JSON.stringify(arg).length;
          if (size > 500) {
            return `[Large object: ${size} characters]`;
          }

          // Handle game objects specifically
          if (arg.constructor && (
            arg.constructor.name === 'Tile' ||
            arg.constructor.name === 'Game' ||
            arg.constructor.name === 'Reactor' ||
            arg.constructor.name === 'Engine' ||
            arg.constructor.name === 'Tileset' ||
            arg.constructor.name === 'PartSet' ||
            arg.constructor.name === 'UpgradeSet'
          )) {
            return `[${arg.constructor.name} object]`;
          }
        } catch (e) {
          return '[Complex object]';
        }
      }
      return arg;
    });

    if (logs) {
      logs.push({ type, args: summaryArgs });
    }
    return;
  }

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

function diffObjects(obj1, obj2, path = '') {
    const differences = {};
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);

    for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        const val1 = obj1[key];
        const val2 = obj2[key];

        if (typeof val1 === 'object' && val1 !== null && typeof val2 === 'object' && val2 !== null && !Array.isArray(val1) && !Array.isArray(val2)) {
            const deepDiff = diffObjects(val1, val2, newPath);
            if (Object.keys(deepDiff).length > 0) {
                Object.assign(differences, deepDiff);
            }
        } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            differences[newPath] = { from: val1, to: val2 };
        }
    }
    return differences;
}

let initialGameState = null;

function getPartAbbreviation(part) {
    if (!part) return '..';
    const id = part.id;
    if (id.startsWith('uranium')) return `U${id.slice(-1)}`;
    if (id.startsWith('plutonium')) return `P${id.slice(-1)}`;
    if (id.startsWith('thorium')) return `T${id.slice(-1)}`;
    if (id.startsWith('seaborgium')) return `S${id.slice(-1)}`;
    if (id.startsWith('dolorium')) return `D${id.slice(-1)}`;
    if (id.startsWith('nefastium')) return `N${id.slice(-1)}`;
    if (id.startsWith('protium')) return `X${id.slice(-1)}`;
    if (id.startsWith('reflector')) return `R${id.slice(-1)}`;
    if (id.startsWith('capacitor')) return `C${id.slice(-1)}`;
    if (id.startsWith('vent')) return `V${id.slice(-1)}`;
    if (id.startsWith('heat_exchanger')) return `E${id.slice(-1)}`;
    if (id.startsWith('heat_inlet')) return `I${id.slice(-1)}`;
    if (id.startsWith('heat_outlet')) return `O${id.slice(-1)}`;
    if (id.startsWith('coolant_cell')) return `c${id.slice(-1)}`;
    if (id.startsWith('reactor_plating')) return `p${id.slice(-1)}`;
    if (id.startsWith('particle_accelerator')) return `A${id.slice(-1)}`;
    if (id.startsWith('overflow_valve')) return `Ov`;
    if (id.startsWith('topup_valve')) return `Tu`;
    if (id.startsWith('check_valve')) return `Ch`;
    return '??';
}

function dumpGrid(game) {
    if (!game || !game.tileset || !game.rows || !game.cols) return "Could not dump grid: game or tileset not found.\n";
    let output = '\n\u001b[34m--- Reactor Grid State ---\u001b[0m\n';
    let header = ' '.repeat(3);
    for (let c = 0; c < game.cols; c++) {
        header += ` ${String(c).padStart(2)} `;
    }
    output += header + '\n';
    output += '  +' + '----'.repeat(game.cols) + '+\n';

    for (let r = 0; r < game.rows; r++) {
        let rowStr = `${String(r).padStart(2)}|`;
        for (let c = 0; c < game.cols; c++) {
            const tile = game.tileset.getTile(r, c);
            let heatIndicator = ' ';
            if (tile?.part?.containment > 0 && tile.heat_contained > 0) {
                const heatRatio = tile.heat_contained / tile.part.containment;
                if (heatRatio >= 1) heatIndicator = '\u001b[31m*'; // Red asterisk for overheating/exploded
                else if (heatRatio > 0.8) heatIndicator = '\u001b[33m!'; // Yellow exclamation for high heat
                else if (heatRatio > 0.5) heatIndicator = '\u001b[37m·'; // Dim dot for some heat
            }
            rowStr += ` ${getPartAbbreviation(tile?.part)}${heatIndicator}\u001b[0m|`;
        }
        output += rowStr + '\n';
    }

    output += '  +' + '----'.repeat(game.cols) + '+\n';
    output += 'Legend: \u001b[37m·\u001b[0m >50% heat, \u001b[33m!\u001b[0m >80% heat, \u001b[31m*\u001b[0m >=100% heat (Overheated)\n';
    output += '\u001b[34m--- End Reactor Grid ---\u001b[0m\n';
    return output;
}

const logGameStateSnapshot = (game, message = "Game State Snapshot") => {
    originalConsoleLog(`\n\u001b[35m--- ${message} ---\u001b[0m`);
    originalConsoleLog(dumpGrid(game));
    originalConsoleLog('\u001b[34m--- Key Stats ---\u001b[0m');
    originalConsoleLog(`Money: ${game.current_money}, Power: ${game.reactor.current_power.toFixed(2)}, Heat: ${game.reactor.current_heat.toFixed(2)}`);
    originalConsoleLog('\u001b[34m--- Active Upgrades ---\u001b[0m');
    game.upgradeset.getAllUpgrades().filter(u => u.level > 0).forEach(u => originalConsoleLog(`- ${u.id} (Level ${u.level})`));
    originalConsoleLog(`\u001b[35m--- End Snapshot ---\u001b[0m\n`);
};
global.logGameStateSnapshot = logGameStateSnapshot;

// Before each test, create a new log buffer
beforeEach((context) => {
  currentTestName = getFullTestName(context.task);
  const game = globalGameWithDOM || globalGameLogicOnly;
  if (game) {
    initialGameState = game.getSaveState();
  }
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

  if (testFailed) {
    const game = globalGameWithDOM || globalGameLogicOnly;
    if (game && game.getSaveState) {
      const testFileName = getTestFileName(context.task);
      originalConsoleLog(`\n\u001b[33m--- Extended Debug Information for Failed Test ---\u001b[0m`);
      originalConsoleLog(`\u001b[33mTest: "${fullTestName}" | File: ${testFileName}\u001b[0m`);

      // Grid State
      originalConsoleLog(dumpGrid(game));

      // Key State Variables
      const objective = game.objectives_manager?.getCurrentObjectiveInfo();
      originalConsoleLog('\u001b[34m--- Key State Variables ---\u001b[0m');
      originalConsoleLog(`Money: ${fmt(game.current_money)} | Power: ${game.reactor?.current_power?.toFixed(2)} | Heat: ${game.reactor?.current_heat?.toFixed(2)} | EP: ${fmt(game.current_exotic_particles)}`);
      if (objective) {
        originalConsoleLog(`Objective: #${objective.index} - ${objective.title}`);
      }

      // State Diff
      if (initialGameState) {
        originalConsoleLog('\u001b[34m--- Game State Diff (Before vs. After) ---\u001b[0m');
        const finalGameState = game.getSaveState();
        const differences = diffObjects(initialGameState, finalGameState);
        if (Object.keys(differences).length > 0) {
          for (const [key, { from, to }] of Object.entries(differences)) {
            const fromStr = JSON.stringify(from, null, 2);
            const toStr = JSON.stringify(to, null, 2);
            originalConsoleLog(`  \u001b[33m${key}:\u001b[0m \u001b[31m${fromStr}\u001b[0m -> \u001b[32m${toStr}\u001b[0m`);
          }
        } else {
          originalConsoleLog('No state changes detected.');
        }
      }

      // Active Upgrades
      originalConsoleLog('\u001b[34m--- Active Upgrades (at time of failure) ---\u001b[0m');
      const activeUpgrades = game.upgradeset.getAllUpgrades().filter(u => u.level > 0);
      if (activeUpgrades.length > 0) {
        activeUpgrades.forEach(u => originalConsoleLog(`- ${u.id} (Level ${u.level})`));
      } else {
        originalConsoleLog('None');
      }

      // In-Game Event History
      if (game.debugHistory && game.debugHistory.getHistory().length > 0) {
        originalConsoleLog('\u001b[34m--- In-Game Event History (last 200) ---\u001b[0m');
        originalConsoleLog(game.debugHistory.format());
      } else {
        originalConsoleLog('\u001b[34m--- In-Game Event History: No events recorded. ---\u001b[0m');
      }

      // Full Game State
      console.groupCollapsed('\u001b[34m--- Full Game State (at time of failure) ---\u001b[0m');
      try {
        const gameState = game.getSaveState();
        const replacer = (key, value) => typeof value === 'bigint' ? value.toString() : value;
        originalConsoleLog(JSON.stringify(gameState, replacer, 2));
      } catch (e) {
        originalConsoleError('Error serializing game state for debug:', e);
      }
      console.groupEnd();

      // Detailed Error
      if (context.task.result?.error?.stack) {
        originalConsoleLog('\u001b[31m--- Assertion Error Stack ---\u001b[0m');
        originalConsoleError(context.task.result.error.stack);
      }

      originalConsoleLog('\u001b[33m--- End Extended Debug Information ---\u001b[0m');
    }
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
const safeSerialize = (obj, maxDepth = 1, currentDepth = 0) => {
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
    if (obj.length > 5) return `[Array(${obj.length})]`;
    return `[${obj.slice(0, 5).map(item => safeSerialize(item, maxDepth, currentDepth + 1)).join(', ')}${obj.length > 5 ? '...' : ''}]`;
  }

  // Handle objects - be more aggressive about truncating
  try {
    const keys = Object.keys(obj);
    if (keys.length === 0) return '{}';
    if (keys.length > 5) return `{Object(${keys.length} keys)}`;

    const serialized = keys.slice(0, 5).map(key => {
      const value = safeSerialize(obj[key], maxDepth, currentDepth + 1);
      return `${key}: ${value}`;
    }).join(', ');

    return `{${serialized}${keys.length > 5 ? '...' : ''}}`;
  } catch (e) {
    return '[Complex Object]';
  }
};

// This setup is for CORE LOGIC tests that do not require a DOM.
// It uses a mocked UI for speed and isolation.
let globalGameLogicOnly = null;

export async function setupGame() {
  // Ensure localStorage is available
  if (!global.localStorage) {
    global.localStorage = createMockLocalStorage();
  } else if (global.localStorage.clear) {
    // Reset it if it exists
    global.localStorage.clear();
  }

  if (globalGameLogicOnly) {
    // Don't call set_defaults() when reusing global instance to preserve save state
    // Only reset basic values that don't affect save state
    globalGameLogicOnly.current_money = 1e30;
    globalGameLogicOnly.exotic_particles = 1e20;
    globalGameLogicOnly.current_exotic_particles = 1e20;
    globalGameLogicOnly.partset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.upgradeset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.reactor.updateStats();

    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.running) {
      globalGameLogicOnly.engine.stop();
    }

    const currentPauseState = globalGameLogicOnly.ui.stateManager.getVar("pause");
    if (currentPauseState === undefined) {
      globalGameLogicOnly.paused = false;
      globalGameLogicOnly.ui.stateManager.setVar("pause", false);
    } else {
      globalGameLogicOnly.paused = currentPauseState;
    }

    globalGameLogicOnly.ui.stateManager.setVar("current_money", globalGameLogicOnly.current_money);
    globalGameLogicOnly.ui.stateManager.setVar("exotic_particles", globalGameLogicOnly.exotic_particles);
    globalGameLogicOnly.ui.stateManager.setVar("current_exotic_particles", globalGameLogicOnly.current_exotic_particles);

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

  // Mock stateManager methods after UI is created
  if (ui.stateManager) {
    ui.stateManager.handlePartAdded = vi.fn();
    ui.stateManager.handleUpgradeAdded = vi.fn();
    ui.stateManager.handleObjectiveCompleted = vi.fn();
    ui.stateManager.handleObjectiveLoaded = vi.fn();
    ui.stateManager.handleObjectiveUnloaded = vi.fn();
    ui.stateManager.setVar = vi.fn();
  } else {
    // Create stateManager if it doesn't exist
    ui.stateManager = {
      handlePartAdded: vi.fn(),
      handleUpgradeAdded: vi.fn(),
      handleObjectiveCompleted: vi.fn(),
      handleObjectiveLoaded: vi.fn(),
      handleObjectiveUnloaded: vi.fn(),
      setVar: vi.fn()
    };
  }
  const game = new Game(ui);
  await ui.init(game);
  game.engine = new Engine(game);

  // Only create a new objective manager if one doesn't exist
  if (!game.objectives_manager) {
    game.objectives_manager = new ObjectiveManager(game);
    await game.objectives_manager.initialize(); // Initialize the objective manager
  }

  game.tileset.initialize();
  await game.partset.initialize();
  await game.upgradeset.initialize();

  // Only call set_defaults() if there's no saved objective index
  if (game._saved_objective_index === undefined) {
    await game.set_defaults();
  }

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
  
  // Ensure localStorage exists in JSDOM
  if (!window.localStorage) {
    Object.defineProperty(window, 'localStorage', {
      value: createMockLocalStorage()
    });
    global.localStorage = window.localStorage;
  } else {
    global.localStorage = window.localStorage;
  }
  global.HTMLElement = window.HTMLElement;
  global.Element = window.Element;
  global.Node = window.Node;
  global.CustomEvent = window.CustomEvent;
  global.Event = window.Event;

  // Add only essential global properties to avoid circular references
  // Fix location object to prevent url-parse library errors
  const location = {
    href: 'http://localhost:8080/',
    origin: 'http://localhost:8080',
    protocol: 'http:',
    host: 'localhost:8080',
    hostname: 'localhost',
    port: '8080',
    pathname: '/',
    search: '',
    hash: '',
    username: '',
    password: '',
    _location: {
      href: 'http://localhost:8080/',
      origin: 'http://localhost:8080',
      protocol: 'http:',
      host: 'localhost:8080',
      hostname: 'localhost',
      port: '8080',
      pathname: '/',
      search: '',
      hash: '',
      username: '',
      password: ''
    }
  };

  global.location = location;
  global.navigator = window.navigator;
  global.URL = window.URL;
  global.URLSearchParams = window.URLSearchParams;

  // Mock AudioContext for JSDOM
  window.AudioContext = class {
    constructor() {
      this.state = 'running';
      this.destination = {};
    }
    createGain() {
      return {
        gain: {
          value: 0,
          setValueAtTime: () => {},
          linearRampToValueAtTime: () => {},
          setTargetAtTime: () => {},
          exponentialRampToValueAtTime: () => {}
        },
        connect: () => {},
        disconnect: () => {}
      };
    }
    createOscillator() {
      return {
        type: 'sine',
        frequency: { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect: () => {},
        disconnect: () => {},
        start: () => {},
        stop: () => {}
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { value: 1000, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
        Q: { value: 1 },
        connect: () => {},
        disconnect: () => {}
      };
    }
    createWaveShaper() {
      return { curve: null, connect: () => {}, disconnect: () => {} };
    }
    createBuffer() {
      return {
        getChannelData: () => new Float32Array(100)
      };
    }
    suspend() {}
    resume() {}
  };
  window.webkitAudioContext = window.AudioContext;

  // Try to fix window.location to prevent url-parse library errors
  // Use a safer approach that doesn't try to redefine non-configurable properties
  // NOTE: Some tests (clipboard.test.js, pasteModal.test.js, meltdown.test.js) may still fail
  // on GitHub Actions due to JSDOM environment differences where window.location._location
  // is null when url-parse library tries to access it. These tests are excluded from
  // GitHub Actions CI/CD but run successfully locally.
  try {
    // First try to set the _location property directly
    if (window.location) {
      window.location._location = location._location;
    }
  } catch (error) {
    // If that fails, try to define the property only if it's configurable
    try {
      const descriptor = Object.getOwnPropertyDescriptor(window, 'location');
      if (descriptor && descriptor.configurable) {
        Object.defineProperty(window, 'location', {
          value: location,
          writable: true,
          configurable: true
        });
      } else {
        // If not configurable, just set the _location property on the existing object
        if (window.location) {
          Object.defineProperty(window.location, '_location', {
            value: location._location,
            writable: true,
            configurable: true
          });
        }
      }
    } catch (innerError) {
      // If all else fails, just log the error and continue
      console.warn('Could not configure window.location for url-parse compatibility:', innerError.message);
    }
  }

  // Add missing clipboard API
  global.navigator.clipboard = {
    readText: vi.fn(() => Promise.resolve('')),
    writeText: vi.fn(() => Promise.resolve()),
    read: vi.fn(() => Promise.resolve([])),
    write: vi.fn(() => Promise.resolve())
  };

  // Add missing matchMedia API
  global.matchMedia = vi.fn(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));

  // Add missing ResizeObserver API
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }));

  // Add missing IntersectionObserver API
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }));

  // Add missing MutationObserver API
  global.MutationObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    takeRecords: vi.fn(() => [])
  }));

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
  game.audio = new (await import("../../public/src/services/audioService.js")).AudioService();
  await game.audio.init();
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
  game.reactor.updateStats();

  globalGameWithDOM = game;
  return { game, document, window };
}

export function cleanupGame() {
  // Clean up global game logic instance
  if (globalGameLogicOnly) {
    // Stop engine and clear timers
    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.stop) {
      globalGameLogicOnly.engine.stop();
    }
    if (globalGameLogicOnly.engine && globalGameLogicOnly.engine.interval) {
      clearInterval(globalGameLogicOnly.engine.interval);
      globalGameLogicOnly.engine.interval = null;
    }

    // Clear objective manager timeouts
    if (globalGameLogicOnly.objectives_manager) {
      if (globalGameLogicOnly.objectives_manager.objective_timeout) {
        clearTimeout(globalGameLogicOnly.objectives_manager.objective_timeout);
        globalGameLogicOnly.objectives_manager.objective_timeout = null;
      }
      // Clear any other timers in objective manager
      if (globalGameLogicOnly.objectives_manager.timers) {
        globalGameLogicOnly.objectives_manager.timers.forEach(timer => clearTimeout(timer));
        globalGameLogicOnly.objectives_manager.timers = [];
      }
    }

    // Stop UI update loop
    if (globalGameLogicOnly.ui) {
      if (globalGameLogicOnly.ui.update_interface_task) {
        clearTimeout(globalGameLogicOnly.ui.update_interface_task);
        globalGameLogicOnly.ui.update_interface_task = null;
      }
      // Set a flag to prevent the loop from continuing
      globalGameLogicOnly.ui._updateLoopStopped = true;
      
      // Clear any other timers
      if (globalGameLogicOnly.ui.timers) {
        globalGameLogicOnly.ui.timers.forEach(timer => clearTimeout(timer));
        globalGameLogicOnly.ui.timers = [];
      }
    }

    // Reset pause state
    globalGameLogicOnly.paused = false;
    if (globalGameLogicOnly.ui?.stateManager) {
      globalGameLogicOnly.ui.stateManager.setVar("pause", false);
    }

    // Clear references to prevent memory leaks
    globalGameLogicOnly = null;
  }

  // Clean up DOM-based game instance
  if (globalGameWithDOM) {
    // Stop engine and clear timers
    if (globalGameWithDOM.engine) {
      globalGameWithDOM.engine.stop();
      if (globalGameWithDOM.engine.interval) {
        clearInterval(globalGameWithDOM.engine.interval);
        globalGameWithDOM.engine.interval = null;
      }
    }

    // Stop UI update loop
    if (globalGameWithDOM.ui) {
      if (globalGameWithDOM.ui.update_interface_task) {
        clearTimeout(globalGameWithDOM.ui.update_interface_task);
        globalGameWithDOM.ui.update_interface_task = null;
      }
      if (globalGameWithDOM.ui._performanceUpdateInterval) {
        clearInterval(globalGameWithDOM.ui._performanceUpdateInterval);
        globalGameWithDOM.ui._performanceUpdateInterval = null;
      }
      // Set a flag to prevent the loop from continuing
      globalGameWithDOM.ui._updateLoopStopped = true;
    }

    // Clear objective manager timeouts
    if (globalGameWithDOM.objectives_manager) {
      if (globalGameWithDOM.objectives_manager.objective_timeout) {
        clearTimeout(globalGameWithDOM.objectives_manager.objective_timeout);
        globalGameWithDOM.objectives_manager.objective_timeout = null;
      }
      if (globalGameWithDOM.objectives_manager.timers) {
        globalGameWithDOM.objectives_manager.timers.forEach(timer => clearTimeout(timer));
        globalGameWithDOM.objectives_manager.timers = [];
      }
    }

    // Clear any other timers
    if (globalGameWithDOM.ui?.timers) {
      globalGameWithDOM.ui.timers.forEach(timer => clearTimeout(timer));
      globalGameWithDOM.ui.timers = [];
    }

    globalGameWithDOM = null;
  }

  // Clean up JSDOM environment
  if (global.window && typeof global.window.close === "function") {
    // Clear all timers to prevent async operations after test teardown
    if (global.window.setTimeout && global.window.clearTimeout) {
      const maxTimerId = setTimeout(() => {}, 0);
      for (let i = 0; i <= maxTimerId; i++) {
        clearTimeout(i);
        clearInterval(i);
      }
      if (global.window._virtualConsole) {
        global.window._virtualConsole.off("error", console.error);
      }
    }
    global.window.close();
  }

  // Clear global references
  global.window = undefined;
  global.document = undefined;
  
  // CRITICAL FIX: Restore mock localStorage instead of setting to undefined
  // This ensures subsequent tests that don't use setupGameWithDOM still have a working localStorage
  global.localStorage = createMockLocalStorage();
  
  global.location = undefined;
  global.navigator = undefined;

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
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

  // Additional memory cleanup
  if (global.gc) {
    global.gc();
  }

  // Clear any remaining timers
  const maxTimerId = 10000;
  for (let i = 1; i <= maxTimerId; i++) {
    try {
      clearTimeout(i);
      clearInterval(i);
    } catch (e) {
      // Ignore errors for non-existent timers
    }
  }
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
