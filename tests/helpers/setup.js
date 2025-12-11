// Ensure globals are mocked for all tests BEFORE any imports

// --- 1. Define Mock Storage Factory ---
function createMockLocalStorage() {
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
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        location: {
            href: 'http://localhost:8080/',
            origin: 'http://localhost:8080',
            hostname: 'localhost',
            host: 'localhost:8080',
            pathname: '/',
            hash: '',
            search: '',
            protocol: 'http:',
            port: '8080',
            reload: () => {}
        }
    };
} else {
    try {
        if (!global.window.location) {
            const plainLocation = {
                href: 'http://localhost:8080/',
                origin: 'http://localhost:8080',
                hostname: 'localhost',
                host: 'localhost:8080',
                pathname: '/',
                hash: '',
                search: '',
                protocol: 'http:',
                port: '8080',
                reload: () => {}
            };
            try {
                Object.defineProperty(global.window, 'location', {
                    value: plainLocation,
                    writable: true,
                    configurable: true
                });
            } catch (e2) {
                // If defineProperty fails, try direct assignment (only safe if location doesn't exist)
                global.window.location = plainLocation;
            }
        } else {
            // Always replace JSDOM's Location object with a plain object to avoid _location access errors
            const currentLocation = global.window.location;
            const plainLocation = {
                href: (currentLocation && currentLocation.href) ? String(currentLocation.href) : 'http://localhost:8080/',
                origin: 'http://localhost:8080',
                hostname: 'localhost',
                host: 'localhost:8080',
                pathname: (currentLocation && currentLocation.pathname) ? String(currentLocation.pathname) : '/',
                hash: (currentLocation && currentLocation.hash) ? String(currentLocation.hash) : '',
                search: (currentLocation && currentLocation.search) ? String(currentLocation.search) : '',
                protocol: 'http:',
                port: '8080',
                reload: () => {}
            };
            
            try {
                Object.defineProperty(global.window, 'location', {
                    value: plainLocation,
                    writable: true,
                    configurable: true
                });
            } catch (e) {
                try {
                    Object.defineProperty(global.window, 'location', {
                        value: plainLocation,
                        writable: true,
                        configurable: true
                    });
                } catch (e2) {
                    // If defineProperty fails, we can't safely set location on JSDOM window
                    // This should not happen if we're replacing it properly above
                }
            }
        }
    } catch (e) {
        // If all else fails, use defineProperty to replace the location descriptor
        const plainLocation = {
            href: 'http://localhost:8080/',
            origin: 'http://localhost:8080',
            hostname: 'localhost',
            host: 'localhost:8080',
            pathname: '/',
            hash: '',
            search: '',
            protocol: 'http:',
            port: '8080',
            reload: () => {}
        };
        try {
            Object.defineProperty(global.window, 'location', {
                value: plainLocation,
                writable: true,
                configurable: true
            });
        } catch (e2) {
            // If defineProperty fails, we can't safely set location on JSDOM window
            // This should not happen if we're replacing it properly above
        }
    }
}

if (typeof global.window.URL === "undefined") {
    if (typeof global.URL !== "undefined") {
        global.window.URL = global.URL;
    } else {
        global.window.URL = class URL {
            constructor(input, base) {
                this.href = String(input);
                this.origin = 'http://localhost:8080';
                this.pathname = String(input).split('?')[0];
            }
            static createObjectURL(blob) {
                return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
            }
            static revokeObjectURL(url) {
            }
        };
    }
}

if (typeof global.URL === "undefined") {
    global.URL = global.window.URL;
}

if (global.URL && !global.URL.createObjectURL) {
    global.URL.createObjectURL = function(blob) {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
    };
    global.URL.revokeObjectURL = function(url) {
    };
}


// CRITICAL: Mock requestAnimationFrame globally to prevent infinite loops in tests
if (typeof global.requestAnimationFrame === "undefined") {
    global.requestAnimationFrame = () => 0;
}
if (typeof global.cancelAnimationFrame === "undefined") {
    global.cancelAnimationFrame = () => {};
}

// Mark test environment for engine detection - must be set BEFORE any game code runs
if (typeof global !== 'undefined') {
  global.__VITEST__ = true;
}

// Mock ResizeObserver globally for all tests
if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
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

// Global mocks
if (typeof global.performance === "undefined") {
  global.performance = {};
}
global.performance.mark = global.performance.mark || (() => { });
global.performance.measure = global.performance.measure || (() => { });

// Mock PointerEvent
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

// Console Mocks & Filtering
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

// Shim for older tests using setupGame
export async function setupGame() {
  const { game } = await setupGameWithDOM();
  // Start the engine for tests that use setupGame (they expect it to be running)
  if (game.engine) {
    game.paused = false;
    game.engine.start();
    if (game.ui && game.ui.stateManager) {
      game.ui.stateManager.setVar("pause", false);
      game.ui.stateManager.setVar("engine_status", "running");
    }
  }
  return game;
}

// This setup is for CORE LOGIC tests that do not require a DOM.
// It uses a mocked UI for speed and isolation.
let globalGameLogicOnly = null;

export async function setupGameLogicOnly() {
  // Ensure localStorage is available
  if (!global.localStorage) {
    global.localStorage = createMockLocalStorage();
  } else if (global.localStorage.clear) {
    // Reset it if it exists
    global.localStorage.clear();
  }

  if (globalGameLogicOnly) {
    // Force a full reset of the reused game instance
    await globalGameLogicOnly.set_defaults();
    globalGameLogicOnly.bypass_tech_tree_restrictions = true; // Ensure restrictions are bypassed for logic tests
    
    // Set high resources for testing convenience by default, specific tests can override
    globalGameLogicOnly.current_money = 1e30;
    globalGameLogicOnly.exotic_particles = 1e20;
    globalGameLogicOnly.current_exotic_particles = 1e20;
    globalGameLogicOnly.total_exotic_particles = 1e20;
    
    // Explicitly reset critical subsystems that might retain state
    globalGameLogicOnly.reactor.heat_controlled = false;
    globalGameLogicOnly.reactor.current_heat = 0;
    globalGameLogicOnly.reactor.current_power = 0;
    if (globalGameLogicOnly.tileset.tiles_list.length === 0) {
      globalGameLogicOnly.tileset.initialize();
    }
    globalGameLogicOnly.tileset.clearAllTiles();
    
    // Reset all upgrades to level 0
    if (globalGameLogicOnly.upgradeset && globalGameLogicOnly.upgradeset.upgradesArray) {
        globalGameLogicOnly.upgradeset.upgradesArray.forEach(u => {
            u.level = 0;
            // CRITICAL FIX: Must recalculate display cost after level reset, 
            // otherwise current_cost remains high from previous tests
            u.updateDisplayCost(); 
        });
    }

    // Refresh affordability flags based on the new money/EP
    globalGameLogicOnly.partset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.upgradeset.check_affordability(globalGameLogicOnly);
    globalGameLogicOnly.reactor.updateStats();
    
    // Reset Engine state
    if (globalGameLogicOnly.engine) {
        if (globalGameLogicOnly.engine.running) globalGameLogicOnly.engine.stop();
        globalGameLogicOnly.engine.tick_count = 0;
        globalGameLogicOnly.engine.time_accumulator = 0;
    }

    // Reset UI State
    globalGameLogicOnly.paused = false;
    if (globalGameLogicOnly.ui && globalGameLogicOnly.ui.stateManager) {
        globalGameLogicOnly.ui.stateManager.setVar("pause", false);
        globalGameLogicOnly.ui.stateManager.setVar("current_money", globalGameLogicOnly.current_money);
        globalGameLogicOnly.ui.stateManager.setVar("exotic_particles", globalGameLogicOnly.exotic_particles);
        globalGameLogicOnly.ui.stateManager.setVar("current_exotic_particles", globalGameLogicOnly.current_exotic_particles);
    }

    // Restart engine for the test
    if (globalGameLogicOnly.engine) {
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
  
  // Mock template interaction
  if (typeof window !== 'undefined' && window) {
    window.templateLoader = {
      cloneTemplateElement: vi.fn(() => {
        // Return a dummy element to prevent crashes when logic tries to create UI
        if (typeof document !== 'undefined') {
          const el = document.createElement('div');
          el.dataset = {};
          return el;
        }
        return {
          querySelector: () => ({ textContent: '', style: {} }),
          classList: { add: () => {}, remove: () => {}, toggle: () => {} },
          style: {},
          addEventListener: () => {},
          appendChild: () => {},
          dataset: {}
        };
      }),
      getTemplate: vi.fn(),
      setText: vi.fn(),
      setVisible: vi.fn()
    };
  }

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
  game.bypass_tech_tree_restrictions = true; // Ensure restrictions are bypassed for DOM tests
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

  // Ensure game is not paused and engine is ready
  game.paused = false;
  if (game.engine && game.engine.running) {
    game.engine.stop();
  }

  // Start the engine for tests (unless explicitly testing pause behavior)
  if (game.engine) {
    game.engine.start();
  }

  globalGameLogicOnly = game;
  return game;
}

let globalGameWithDOM = null;
let dom, window, document;

// Initialize template loader with real file content
async function initializeTemplateLoader(window) {
  try {
    const templatesPath = path.resolve(__dirname, "../../public/components/templates.html");
    const templatesContent = fs.readFileSync(templatesPath, "utf-8");
    const templateLoader = new TemplateLoader();
    
    // Mock fetch just for this loader inside the window context if needed
    const originalFetch = window.fetch;
    window.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('templates.html')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(templatesContent)
        });
      }
      return originalFetch(url);
    });

    await templateLoader.loadTemplates();
    window.fetch = originalFetch; // Restore
    return templateLoader;
  } catch (error) {
    console.warn("Failed to initialize template loader with real content:", error.message);
    return {
      cloneTemplateElement: vi.fn(() => window.document.createElement('div')),
      getTemplate: vi.fn(() => window.document.createElement('div'))
    };
  }
}

function injectHTMLContent(document, htmlContent) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  while (tempDiv.firstChild) {
    document.body.appendChild(tempDiv.firstChild);
  }
}

// Main Setup Function
export async function setupGameWithDOM() {
  const indexHtmlPath = path.resolve(__dirname, "../../public/index.html");
  const indexHtml = fs.readFileSync(indexHtmlPath, "utf-8");

  // Create JSDOM environment
  dom = new JSDOM(indexHtml, {
    url: "http://localhost:8080/",
    pretendToBeVisual: true,
    resources: "usable",
    runScripts: "dangerously"
  });

  window = dom.window;
  document = window.document;
  global.window = window;
  global.document = document;

  // Replace JSDOM's Location object with a plain object immediately to avoid _location access errors
  const plainLocation = {
    href: 'http://localhost:8080/',
    origin: 'http://localhost:8080',
    hostname: 'localhost',
    host: 'localhost:8080',
    pathname: '/',
    hash: '',
    search: '',
    protocol: 'http:',
    port: '8080',
    reload: () => {}
  };
  
  try {
    Object.defineProperty(window, 'location', {
      value: plainLocation,
      writable: true,
      configurable: true
    });
  } catch (e) {
    try {
      Object.defineProperty(window, 'location', {
        value: plainLocation,
        writable: true,
        configurable: true
      });
    } catch (e2) {
      // If defineProperty fails, we can't safely set location on JSDOM window
      // This should not happen if we're replacing it properly above
    }
  }

  // Ensure reload exists on location (JSDOM might not have it or it might be a no-op)
  if (window.location && !window.location.reload) {
    window.location.reload = () => {};
  }

  if (!window.location) {
    const plainLocation = {
      href: 'http://localhost:8080/',
      origin: 'http://localhost:8080',
      hostname: 'localhost',
      host: 'localhost:8080',
      pathname: '/',
      hash: '',
      search: '',
      protocol: 'http:',
      port: '8080',
      reload: () => {}
    };
    try {
      Object.defineProperty(window, 'location', {
        value: plainLocation,
        writable: true,
        configurable: true
      });
    } catch (e) {
      try {
        Object.defineProperty(window, 'location', {
          value: plainLocation,
          writable: true,
          configurable: true
        });
      } catch (e2) {
        // If defineProperty fails, we can't safely set location on JSDOM window
      }
    }
  } else {
    try {
      const currentLocation = window.location;
      if (currentLocation && (typeof currentLocation.hostname === 'undefined' || currentLocation.hostname === null)) {
        const plainLocation = {
          href: currentLocation.href || 'http://localhost:8080/',
          origin: 'http://localhost:8080',
          hostname: 'localhost',
          host: 'localhost:8080',
          pathname: currentLocation.pathname || '/',
          hash: currentLocation.hash || '',
          search: currentLocation.search || '',
          protocol: currentLocation.protocol || 'http:',
          port: '8080',
          reload: currentLocation.reload || (() => {})
        };
        try {
          Object.defineProperty(window, 'location', {
            value: plainLocation,
            writable: true,
            configurable: true
          });
        } catch (e2) {
          try {
            Object.defineProperty(window, 'location', {
              value: plainLocation,
              writable: true,
              configurable: true
            });
          } catch (e3) {
            // If defineProperty fails, we can't safely set location on JSDOM window
          }
        }
      }
    } catch (e) {
    }
    let hasOrigin = false;
    try {
      hasOrigin = !!window.location.origin && window.location.origin !== 'null';
    } catch (e) {
    }

    if (!hasOrigin) {
      try {
        Object.defineProperty(window.location, 'origin', {
          value: 'http://localhost:8080',
          writable: true,
          configurable: true
        });
      } catch (e) {
        try {
          const locationBackup = {
            href: window.location?.href || 'http://localhost:8080/',
            origin: 'http://localhost:8080',
            hostname: window.location?.hostname || 'localhost',
            host: window.location?.host || 'localhost:8080',
            pathname: window.location?.pathname || '/',
            hash: window.location?.hash || '',
            search: window.location?.search || '',
            protocol: window.location?.protocol || 'http:',
            port: window.location?.port || '8080',
            reload: window.location?.reload || (() => {})
          };
          Object.defineProperty(window, 'location', {
            value: locationBackup,
            writable: true,
            configurable: true
          });
        } catch (e2) {
        }
      }
    }

    const props = {
      hostname: 'localhost',
      host: 'localhost:8080',
      protocol: 'http:',
      port: '8080',
      reload: () => {}
    };

    for (const [key, val] of Object.entries(props)) {
      try {
        if (!window.location[key]) {
          window.location[key] = val;
        }
      } catch (e) {
      }
    }
  }

  if (!window.URL || !window.URL.createObjectURL) {
    window.URL = window.URL || global.URL || class URL {
      constructor(input, base) {
        try {
          if (input == null) {
            input = 'http://localhost:8080/';
          }
          if (base == null) {
            base = 'http://localhost:8080';
          }
          const urlModule = require('url');
          if (urlModule && urlModule.URL) {
            try {
              const url = new urlModule.URL(String(input), String(base));
              if (url && url.href && typeof url.href === 'string') {
                this.href = url.href;
                this.origin = url.origin || 'http://localhost:8080';
                this.pathname = url.pathname || String(input).split('?')[0];
              } else {
                this.href = String(input);
                this.origin = 'http://localhost:8080';
                this.pathname = String(input).split('?')[0];
              }
            } catch (urlError) {
              this.href = String(input);
              this.origin = 'http://localhost:8080';
              this.pathname = String(input).split('?')[0];
            }
          } else {
            this.href = String(input);
            this.origin = 'http://localhost:8080';
            this.pathname = String(input).split('?')[0];
          }
        } catch (e) {
          this.href = String(input || 'http://localhost:8080/');
          this.origin = 'http://localhost:8080';
          this.pathname = String(input || '/').split('?')[0];
        }
      }
      static createObjectURL(blob) {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
      }
      static revokeObjectURL(url) {
      }
    };
    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = function(blob) {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
      };
      window.URL.revokeObjectURL = function(url) {
      };
    }
  }
  // Ensure we don't lose the global URL constructor if JSDOM replaced it
  if (global.URL && !window.URL) {
    window.URL = global.URL;
  }
  global.URL = window.URL;

  // Ensure window.localStorage is available (JSDOM provides it, but ensure it's working)
  if (!window.localStorage) {
    window.localStorage = createMockLocalStorage();
  }
  // Also ensure global.localStorage points to the same instance
  global.localStorage = window.localStorage;

  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  global.requestAnimationFrame = () => 0;

  // ResizeObserver Mock
  window.ResizeObserver = class ResizeObserver {
    constructor(callback) {
      this.callback = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  global.ResizeObserver = window.ResizeObserver;

  // Audio Context Mock (Simplified)
  window.AudioContext = class {
    constructor() { this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {}, setTargetAtTime: () => {} }, connect: () => {} }; }
    createOscillator() { return { type: 'sine', frequency: { value: 440, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {} }; }
    createBufferSource() { return { buffer: null, connect: () => {}, start: () => {}, stop: () => {} }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: { value: 350, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, Q: { value: 1, setValueAtTime: () => {} }, connect: () => {} }; }
    createWaveShaper() { return { connect: () => {} }; }
    createStereoPanner() { return { pan: { value: 0, setValueAtTime: () => {} }, connect: () => {} }; }
    createBuffer() { return { getChannelData: () => new Float32Array(1024) }; }
    suspend() { return Promise.resolve(); }
    resume() { return Promise.resolve(); }
  };
  window.webkitAudioContext = window.AudioContext;


  // Implement fetch to read from filesystem
  global.fetch = window.fetch = async (url) => {
    try {
      let urlStr = url.toString();
      // Handle relative paths from root or public
      let cleanPath = urlStr.replace(/^http:\/\/localhost:8080\//, '').replace(/^\.\//, '').split('?')[0]; // Remove query params

      // Force mock response for external libs to avoid HTML/404 syntax errors in JSDOM
      if (
        cleanPath.includes('lib/') ||
        cleanPath.includes('pako') ||
        cleanPath.includes('zip') ||
        cleanPath.includes('sqlite')
      ) {
        return {
          ok: true,
          status: 200,
          headers: new Map([['content-type', 'application/javascript']]),
          text: () => Promise.resolve('/* Mock Lib */'),
          json: () => Promise.resolve({})
        };
      }
      
      // Determine file path
      let filePath;
      if (cleanPath.startsWith('data/') || cleanPath.startsWith('pages/') || cleanPath.startsWith('components/') || cleanPath.startsWith('lib/')) {
        filePath = path.resolve(__dirname, "../../public", cleanPath);
      } else if (cleanPath === 'version.json') {
        filePath = path.resolve(__dirname, "../../public/version.json");
      } else {
        // Fallback or specific handling
        filePath = path.resolve(__dirname, "../../public", cleanPath);
      }

      if (!fs.existsSync(filePath)) {
        // For library JS files that don't exist, return empty JS to prevent errors
        if (cleanPath.includes('lib/') && (cleanPath.endsWith('.js') || cleanPath.endsWith('.min.js'))) {
          return {
            ok: true,
            status: 200,
            headers: new Map([['content-type', 'application/javascript']]),
            text: () => Promise.resolve('// Mock library file'),
            json: () => Promise.resolve({})
          };
        }
        return { ok: false, status: 404, statusText: "Not Found" };
      }

      const ext = path.extname(filePath);

      const content = fs.readFileSync(filePath, "utf-8");
      const contentType = ext === '.json' ? 'application/json' : (ext === '.html' ? 'text/html' : (ext === '.js' ? 'application/javascript' : 'text/plain'));

      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', contentType]]),
        text: () => Promise.resolve(content),
        json: () => Promise.resolve(JSON.parse(content)),
      };
    } catch (e) {
      console.error(`Fetch error for ${url}:`, e);
      return { ok: false, status: 500, statusText: "Internal Error" };
    }
  };

  // Load Templates
  window.templateLoader = await initializeTemplateLoader(window);

  // Inject Partials (Reactor, Game, etc.) to ensure DOM is complete
  try {
    const reactorHTML = fs.readFileSync(path.resolve(__dirname, "../../public/pages/reactor.html"), "utf-8");
    injectHTMLContent(document, reactorHTML);
    const gameHTML = fs.readFileSync(path.resolve(__dirname, "../../public/pages/game.html"), "utf-8");
    injectHTMLContent(document, gameHTML);
  } catch (e) {
    console.warn("Could not inject partials:", e.message);
  }

  // Initialize Game Stack
  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  
  game.audio = new (await import("../../public/src/services/audioService.js")).AudioService();
  await game.audio.init();
  
  game.router = pageRouter;
  game.googleDriveSave = {
    saveToCloud: vi.fn(() => Promise.resolve()),
    loadFromCloud: vi.fn(() => Promise.resolve({})),
    isSignedIn: vi.fn(() => false)
  };
  
  // Initialize UI and Game
  await ui.init(game);
  
  if (ui.stateManager) {
    // stateManager initialization if needed
  }
  
  game.tileset.initialize();
  await game.partset.initialize(); // Loads real JSON
  await game.upgradeset.initialize(); // Loads real JSON
  await game.set_defaults();
  
  game.objectives_manager = new ObjectiveManager(game);
  await game.objectives_manager.initialize(); // Loads real JSON
  
  game.engine = new Engine(game);
  
  // Start engine by default (tests that need it stopped can stop it in their beforeEach)
  game.paused = false;
  if (game.engine && !game.engine.running) {
    game.engine.start();
  }
  if (ui.stateManager) {
    ui.stateManager.setVar("pause", false);
    ui.stateManager.setVar("engine_status", "running");
  }

  // Initialize UI layout
  try {
     // Mock router loading the layout since we manually injected HTML
     // We just need to trigger the logic that binds events
     ui.initMainLayout();
     // Manually call resize to ensure grid is ready
     ui.gridScaler.resize();
  } catch(e) {
     console.error("UI Init Error:", e);
  }

  globalGameWithDOM = game;

  // Note: Do not set high resources by default in setupGameWithDOM
  // Tests that need high resources should set them explicitly
  // This allows tests to verify default initialization values
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  game.reactor.updateStats();

  return { game, document, window };
}

export function cleanupGame() {
  if (globalGameWithDOM) {
    if (globalGameWithDOM.engine) globalGameWithDOM.engine.stop();
    vi.clearAllTimers();
    globalGameWithDOM = null;
  }
  if (globalGameLogicOnly) {
    if (globalGameLogicOnly.engine) globalGameLogicOnly.engine.stop();
    globalGameLogicOnly = null;
  }
  dom = null;
  window = null;
  document = null;
  
  if (global.window && typeof global.window.close === 'function') {
    try {
      global.window.close();
    } catch (e) {
      // ignore
    }
  }
  
  // Clean up globals to ensure fresh state for next test
  delete global.window;
  delete global.document;

  vi.restoreAllMocks();
}

// Enhanced DOM setup for UI elements required by tests
beforeEach(() => {
  // Recreate minimal window/document if cleanup cleared them between tests
  if (typeof global.window === 'undefined' || !global.window) {
    global.window = {
      localStorage: global.localStorage || createMockLocalStorage(),
      setTimeout,
      clearTimeout,
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      location: {
        href: 'http://localhost:8080/',
        origin: 'http://localhost:8080',
        hostname: 'localhost',
        host: 'localhost:8080',
        pathname: '/',
        hash: '',
        search: '',
        protocol: 'http:',
        port: '8080',
        reload: () => {}
      }
    };
  } else {
    // Ensure location reload exists
    if (global.window.location && !global.window.location.reload) {
      global.window.location.reload = () => {};
    }
    
    try {
      if (!global.window.location) {
        const plainLocation = {
          href: 'http://localhost:8080/',
          origin: 'http://localhost:8080',
          hostname: 'localhost',
          host: 'localhost:8080',
          pathname: '/',
          hash: '',
          search: '',
          protocol: 'http:',
          port: '8080',
          reload: () => {}
        };
        try {
          Object.defineProperty(global.window, 'location', {
            value: plainLocation,
            writable: true,
            configurable: true
          });
        } catch (e2) {
          // If defineProperty fails, try direct assignment (only safe if location doesn't exist)
          global.window.location = plainLocation;
        }
      } else {
        // Always replace JSDOM's Location object with a plain object to avoid _location access errors
        const currentLocation = global.window.location;
        const plainLocation = {
          href: (currentLocation && currentLocation.href) ? String(currentLocation.href) : 'http://localhost:8080/',
          origin: 'http://localhost:8080',
          hostname: 'localhost',
          host: 'localhost:8080',
          pathname: (currentLocation && currentLocation.pathname) ? String(currentLocation.pathname) : '/',
          hash: (currentLocation && currentLocation.hash) ? String(currentLocation.hash) : '',
          search: (currentLocation && currentLocation.search) ? String(currentLocation.search) : '',
          protocol: 'http:',
          port: '8080',
          reload: () => {}
        };
        
        try {
          Object.defineProperty(global.window, 'location', {
            value: plainLocation,
            writable: true,
            configurable: true
          });
        } catch (e) {
          try {
            Object.defineProperty(global.window, 'location', {
              value: plainLocation,
              writable: true,
              configurable: true
            });
          } catch (e2) {
            // If defineProperty fails, we can't safely replace location on JSDOM window
            // This should not happen if we're replacing it properly above
          }
        }
      }
    } catch (e) {
      // If all else fails, use defineProperty to replace the location descriptor
      const plainLocation = {
        href: 'http://localhost:8080/',
        origin: 'http://localhost:8080',
        hostname: 'localhost',
        host: 'localhost:8080',
        pathname: '/',
        hash: '',
        search: '',
        protocol: 'http:',
        port: '8080',
        reload: () => {}
      };
      try {
        Object.defineProperty(global.window, 'location', {
          value: plainLocation,
          writable: true,
          configurable: true
        });
      } catch (e2) {
        // If defineProperty fails, we can't safely set location on JSDOM window
        // This should not happen if we're replacing it properly above
      }
    }
  }
  
  if (!global.window.URL || !global.window.URL.createObjectURL) {
    global.window.URL = global.URL || class URL {
      constructor(input, base) {
        this.href = String(input);
        this.origin = 'http://localhost:8080';
        this.pathname = String(input).split('?')[0];
      }
      static createObjectURL(blob) {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
      }
      static revokeObjectURL(url) {
      }
    };
    if (!global.window.URL.createObjectURL) {
      global.window.URL.createObjectURL = function(blob) {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(2)}`;
      };
      global.window.URL.revokeObjectURL = function(url) {
      };
    }
  }
  
  if (typeof global.URL === 'undefined') {
    global.URL = global.window.URL;
  }
  if (typeof global.document === 'undefined' || !global.document) {
    global.document = {
      body: { appendChild: () => {} },
      createElement: () => ({
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        appendChild: () => {},
        addEventListener: () => {},
        setAttribute: () => {},
        textContent: '',
        id: '',
        className: ''
      }),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {}
    };
  } else if (!global.document.body) {
    global.document.body = { appendChild: () => {} };
  }
  document = global.document;
  // Ensure any running game engines are stopped to prevent infinite loops
  if (globalGameWithDOM && globalGameWithDOM.engine) {
    globalGameWithDOM.engine.running = false;
    globalGameWithDOM.engine.animationFrameId = null;
    if (globalGameWithDOM.engine.interval) {
      clearInterval(globalGameWithDOM.engine.interval);
      globalGameWithDOM.engine.interval = null;
    }
  }
  if (globalGameLogicOnly && globalGameLogicOnly.engine) {
    globalGameLogicOnly.engine.running = false;
    globalGameLogicOnly.engine.animationFrameId = null;
    if (globalGameLogicOnly.engine.interval) {
      clearInterval(globalGameLogicOnly.engine.interval);
      globalGameLogicOnly.engine.interval = null;
    }
  }
  
  if (typeof document !== 'undefined' && document && document.body && typeof document.getElementById === 'function') {
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
  // CRITICAL: Force stop all engines before cleanup to prevent infinite loops
  if (globalGameWithDOM && globalGameWithDOM.engine) {
    globalGameWithDOM.engine.running = false;
    globalGameWithDOM.engine.animationFrameId = null;
    if (globalGameWithDOM.engine.interval) {
      clearInterval(globalGameWithDOM.engine.interval);
      globalGameWithDOM.engine.interval = null;
    }
  }
  if (globalGameLogicOnly && globalGameLogicOnly.engine) {
    globalGameLogicOnly.engine.running = false;
    globalGameLogicOnly.engine.animationFrameId = null;
    if (globalGameLogicOnly.engine.interval) {
      clearInterval(globalGameLogicOnly.engine.interval);
      globalGameLogicOnly.engine.interval = null;
    }
  }
  
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

// Export assertions for game state
export const gameAssertions = {
  // ... existing assertions ...
  tileHasPart: (tile, expectedPartId) => {
      if(!tile.part || tile.part.id !== expectedPartId) throw new Error(`Expected part ${expectedPartId}, got ${tile.part?.id}`);
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
