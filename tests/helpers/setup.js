/**
 * Vitest Global Setup File
 *
 * This file is executed before all test suites. Its purpose is to establish a consistent,
 * mocked browser-like environment for running tests in Node.js. It also provides
 * common setup functions, test utilities, and enhanced debugging for test failures.
 *
 * Key Responsibilities:
 * 1. Mock essential browser globals (`window`, `document`, `localStorage`, `URL`, etc.).
 * 2. Export common testing utilities (`vi`, `expect`, `describe`) and application modules.
 * 3. Provide helper functions (`setupGameWithDOM`, `setupGameLogicOnly`) to initialize the game state.
 * 4. Implement advanced logging that captures console output per-test and dumps it on failure.
 * 5. Offer detailed debug reports for failed tests, including game state diffs and reactor grid snapshots.
 */

// --- Phase 1: Early Global Mocks ---
// These must be defined BEFORE any application code is imported to prevent reference errors.

import { URL as NodeURL } from 'url';
import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

// Helper to create a mock localStorage implementation.
function createMockLocalStorage() {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
        key: (i) => Object.keys(store)[i] || null,
    get length() {
      return Object.keys(store).length;
    },
    };
}

// Mock browser globals that are not available in the Node.js environment.
const mockBrowserGlobals = () => {
    global.localStorage = createMockLocalStorage();

  // CHANGE: Polyfill instead of overwriting to avoid "read-only" errors.
  // This is the primary fix for the TypeError.
  if (typeof global.crypto === 'undefined') {
    global.crypto = {};
  }
  if (typeof global.crypto.randomUUID === 'undefined') {
    global.crypto.randomUUID = () => 'mock-uuid-0000-0000-000000000000';
  }

  // CHANGE: Only define our custom URL if a global one doesn't already exist.
  if (typeof global.URL === 'undefined') {
    global.URL = class URL extends NodeURL {
      static createObjectURL() {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(7)}`;
      }
      static revokeObjectURL() {
        /* no-op */
      }
    };
  }

  // Mock other common browser APIs.
  global.requestAnimationFrame = (callback) => setTimeout(callback, 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
  global.ResizeObserver =
    global.ResizeObserver ||
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  global.PointerEvent =
    global.PointerEvent ||
    class PointerEvent extends Event {
      constructor(type, options) {
        super(type, options);
      }
    };
  
  // CHANGE: Polyfill performance methods instead of overwriting the object.
  if (typeof global.performance === 'undefined') {
    global.performance = {};
  }
  global.performance.mark = global.performance.mark || vi.fn();
  global.performance.measure = global.performance.measure || vi.fn();

  // Create a minimal `window` and `document` for imports that might access them at the top level.
  // JSDOM will provide a full implementation later for DOM-based tests.
  if (typeof global.window === 'undefined') {
    global.window = {
      localStorage: global.localStorage,
      crypto: global.crypto,
      URL: global.URL,
      requestAnimationFrame: global.requestAnimationFrame,
      cancelAnimationFrame: global.cancelAnimationFrame,
      ResizeObserver: global.ResizeObserver,
      PointerEvent: global.PointerEvent,
      performance: global.performance,
      setTimeout,
      clearTimeout,
      location: {
        href: 'http://localhost:8080/',
        origin: 'http://localhost:8080',
        hostname: 'localhost',
        reload: vi.fn(),
      },
    };
  }

  if (typeof global.document === 'undefined') {
    global.document = {
      body: { appendChild: vi.fn(), style: {}, classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() } },
        createElement: () => ({
            style: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
      }),
      // FIX: Make these functional mocks to prevent "is not a function" errors.
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };
  }

  // Flag for the game engine to know it's running in a test environment.
  global.__VITEST__ = true;
};

// Immediately execute the mocking.
mockBrowserGlobals();

// --- Phase 2: Common Imports & Exports ---
// Re-exporting common modules saves individual test files from importing them repeatedly.

// Vitest framework imports
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Core application imports
import { Game } from '../../public/src/core/game.js';
import { UI } from '../../public/src/components/ui.js';
import { Engine } from '../../public/src/core/engine.js';
import { ObjectiveManager } from '../../public/src/core/objective.js';
import { PageRouter } from '../../public/src/components/pageRouter.js';
import { TemplateLoader } from '../../public/src/services/templateLoader.js';

export {
  // Vitest
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  // Node.js
  fs,
  path,
  // DOM
  JSDOM,
  // Application
  Game,
  UI,
  Engine,
  ObjectiveManager,
  PageRouter,
  TemplateLoader,
};

// --- Phase 3: Test Utilities & Enhanced Debugging ---

// Store console logs per-test to only show them on failure.
const testLogs = new Map();
let currentTestName = null;
let initialGameState = null;

// Keep original console methods to use for test runner output.
const { log: originalLog, warn: originalWarn, error: originalError } = console;

// Intercept console methods to buffer logs.
const createLogger = (type) => (...args) => {
  if (currentTestName && testLogs.has(currentTestName)) {
    testLogs.get(currentTestName).push({ type, args });
  } else {
    // If not in a test context, log directly.
    const originalLogger = { log: originalLog, warn: originalWarn, error: originalError }[type];
    originalLogger(...args);
  }
};
console.log = createLogger('log');
console.warn = createLogger('warn');
console.error = createLogger('error');

// Helper to get the full test name (e.g., "describe > describe > it").
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

// Helper for diffing game state before and after a test.
function diffObjects(obj1, obj2, path = '') {
    const differences = {};
    const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
    for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        const val1 = obj1[key];
        const val2 = obj2[key];
    if (JSON.stringify(val1) !== JSON.stringify(val2)) {
            differences[newPath] = { from: val1, to: val2 };
        }
    }
    return differences;
}

// Helper to generate a visual text-based representation of the reactor grid.
function dumpGrid(game) {
  if (!game?.tileset || !game.rows || !game.cols) return 'Grid unavailable.';
  const getPartAbbreviation = (part) => {
    if (!part) return '..';
    const id = part.id;
    if (id.startsWith('uranium')) return `U${id.slice(-1)}`;
    if (id.startsWith('reflector')) return `R${id.slice(-1)}`;
    if (id.startsWith('capacitor')) return `C${id.slice(-1)}`;
    if (id.startsWith('vent')) return `V${id.slice(-1)}`;
    // Add other abbreviations as needed...
    return '??';
  };

    let output = '\n\u001b[34m--- Reactor Grid State ---\u001b[0m\n';
    for (let r = 0; r < game.rows; r++) {
    let rowStr = '';
        for (let c = 0; c < game.cols; c++) {
            const tile = game.tileset.getTile(r, c);
      const heatRatio = tile?.part?.containment > 0 ? tile.heat_contained / tile.part.containment : 0;
            let heatIndicator = ' ';
      if (heatRatio >= 1) heatIndicator = '\u001b[31m*'; // Red
      else if (heatRatio > 0.8) heatIndicator = '\u001b[33m!'; // Yellow
      else if (heatRatio > 0.5) heatIndicator = '\u001b[37m·'; // Dim
      rowStr += ` ${getPartAbbreviation(tile?.part)}${heatIndicator}\u001b[0m |`;
    }
    output += `|${rowStr}\n`;
  }
  output += '\u001b[34m--------------------------\u001b[0m\n';
    return output;
}

// Custom Jest/Vitest matchers for more readable game-specific assertions.
expect.extend({
  toHavePart(tile, expectedPartId) {
    const pass = tile.part && tile.part.id === expectedPartId;
    return {
      pass,
      message: () =>
        `Expected tile to have part ${expectedPartId}, but found ${tile.part?.id || 'null'}`,
    };
  },
  toHaveHeatLevel(tile, expectedHeat, tolerance = 0.1) {
    const actualHeat = tile.heat_contained || 0;
    const pass = Math.abs(actualHeat - expectedHeat) <= tolerance;
    return {
      pass,
      message: () =>
        `Expected tile heat to be ~${expectedHeat}, but found ${actualHeat}`,
    };
  },
});

// --- Phase 4: Core Test Setup Functions ---

let globalGameInstance = null;
let domInstance = null;

/**
 * Helper function to inject HTML content into the document.
 */
function injectHTMLContent(document, htmlContent) {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  // Use a document fragment for efficiency
  const fragment = document.createDocumentFragment();
  while (tempDiv.firstChild) {
    fragment.appendChild(tempDiv.firstChild);
  }
  document.body.appendChild(fragment);
}

/**
 * Sets up a game instance for CORE LOGIC tests without a real DOM.
 * Reuses a single game instance and resets it for performance.
 */
export async function setupGameLogicOnly() {
  if (globalGameInstance) {
    // Reset existing instance for speed
    await globalGameInstance.set_defaults();
    
    // CRITICAL FIX: Always re-initialize the tileset to ensure the grid exists
    // This is necessary because clearAllTiles() might leave the grid in an inconsistent state
    globalGameInstance.tileset.initialize();
    globalGameInstance.tileset.clearAllTiles();
    
    globalGameInstance.upgradeset.getAllUpgrades().forEach((u) => {
            u.level = 0;
      u.updateDisplayCost(); // CRITICAL: Recalculate cost after level reset.
    });
  } else {
    // Create a new instance
    const mockedUI = new UI();
    // Ensure the mocked UI is completely inert and won't try to access the DOM.
    mockedUI.cacheDOMElements = vi.fn(() => true);
    mockedUI.DOMElements = { main: { classList: { toggle: vi.fn() } } }; // Provide minimal required elements
    mockedUI.resizeReactor = vi.fn();
    mockedUI.showPage = vi.fn();
    mockedUI.runUpdateInterfaceLoop = vi.fn(); // Prevent UI update loops from accessing DOM
    // Further mock UI methods as needed...

    const game = new Game(mockedUI);
    await mockedUI.init(game);
    game.engine = new Engine(game);
    game.objectives_manager = new ObjectiveManager(game);

    // CRITICAL FIX: The tileset must be initialized to create the grid.
  game.tileset.initialize();

  await game.partset.initialize();
  await game.upgradeset.initialize();
    await game.objectives_manager.initialize();

    globalGameInstance = game;
  }

  // Set default state for logic tests
  globalGameInstance.bypass_tech_tree_restrictions = true;
  globalGameInstance.current_money = 1e30;
  globalGameInstance.current_exotic_particles = 1e20;
  globalGameInstance.partset.check_affordability(globalGameInstance);
  globalGameInstance.upgradeset.check_affordability(globalGameInstance);
  globalGameInstance.paused = false;

  return globalGameInstance;
}

/**
 * Sets up a game instance with a full JSDOM environment for UI tests.
 */
export async function setupGameWithDOM() {
  const indexHtmlPath = path.resolve(__dirname, '../../public/index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf-8');

  domInstance = new JSDOM(indexHtml, {
    url: 'http://localhost:8080/',
    pretendToBeVisual: true,
    resources: 'usable',
    runScripts: 'dangerously',
  });

  // Assign JSDOM globals
  global.window = domInstance.window;
  global.document = domInstance.window.document;
  
  // Re-apply mocks to the new JSDOM window object
  mockBrowserGlobals();
  window.AudioContext = vi.fn().mockImplementation(() => ({
    state: 'running',
    sampleRate: 44100,
    currentTime: 0,
    destination: {},
    createGain: () => ({
      gain: {
        value: 1,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createOscillator: () => ({
      type: 'sine',
      frequency: {
        value: 440,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
    createBuffer: (channels, length, sampleRate) => ({
      numberOfChannels: channels,
      length: length,
      sampleRate: sampleRate,
      getChannelData: (channelIndex) => new Float32Array(length),
    }),
    createWaveShaper: () => ({
      curve: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: {
        value: 1000,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      Q: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    suspend: vi.fn().mockResolvedValue(),
    resume: vi.fn().mockResolvedValue(),
  }));
  
  // Mock fetch to serve local files.
  global.fetch = window.fetch = async (url) => {
    const urlStr = url.toString();
    if (urlStr.includes('/api/leaderboard')) {
      return { ok: true, json: () => Promise.resolve({ success: true, data: [] }) };
    }
    const cleanPath = urlStr.replace(/^http:\/\/localhost:8080\//, '').split('?')[0];
    const filePath = path.resolve(__dirname, '../../public', cleanPath);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentType = path.extname(filePath) === '.json' ? 'application/json' : 'text/plain';
      return { ok: true, text: () => Promise.resolve(content), json: () => Promise.resolve(JSON.parse(content)), headers: new Map([['content-type', contentType]]) };
    }
    return { ok: false, status: 404 };
  };

  // Pre-load and inject HTML partials to build a complete DOM for UI tests.
  try {
    const pagesDir = path.resolve(__dirname, '../../public/pages');
    const componentDir = path.resolve(__dirname, '../../public/components');

    // List all HTML partials that define UI layout
    const partials = [
      path.join(pagesDir, 'reactor.html'),
      path.join(pagesDir, 'upgrades.html'),
      path.join(pagesDir, 'research.html'),
      path.join(pagesDir, 'game.html'),
      path.join(pagesDir, 'leaderboard.html'),
      path.join(componentDir, 'templates.html'),
      // Add any other HTML files that define your UI layout
    ];

    partials.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        const htmlContent = fs.readFileSync(filePath, 'utf-8');
        injectHTMLContent(global.document, htmlContent);
                  } else {
        console.warn(`[Test Setup] HTML partial not found: ${filePath}`);
                  }
    });
                } catch (e) {
    console.error('[Test Setup] Error injecting HTML partials:', e);
  }

  // Initialize game stack
  const ui = new UI();
  const game = new Game(ui);
  game.router = new PageRouter(ui);
  window.templateLoader = new TemplateLoader();

  await window.templateLoader.loadTemplates();
  await ui.init(game);
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  
  // CRITICAL: Initialize tileset after set_defaults() to ensure dimensions are correct
  // initialize() is safe to call multiple times - it recreates the grid
  game.tileset.initialize();
  
  game.objectives_manager = new ObjectiveManager(game);
  await game.objectives_manager.initialize();
  
  game.engine = new Engine(game);
  
  // CRITICAL: Initialize audio service like in app.js
  const { AudioService } = await import("../../public/src/services/audioService.js");
  game.audio = new AudioService();
  await game.audio.init();
  
  // Manually trigger UI setup that would normally happen on page load
     ui.initMainLayout();
     ui.gridScaler.resize();

  globalGameInstance = game;
  return { game, document: global.document, window: global.window };
}


export async function setupGame() {
  const { game } = await setupGameWithDOM();
  // For older tests that expect the engine to be running immediately.
  if (game.engine && !game.engine.running) {
    game.paused = false;
    game.engine.start();
  }
  return game;
}

/**
 * Cleans up the test environment after each test.
 */
export function cleanupGame() {
  // 1. Stop any running game engines immediately
  if (globalGameInstance?.engine?.stop) {
    globalGameInstance.engine.stop();
  }
  
  // 2. Stop UI update loops to prevent them from accessing DOM after cleanup
  if (globalGameInstance?.ui?.cleanup) {
    globalGameInstance.ui.cleanup();
  }
  if (globalGameInstance?.ui) {
    globalGameInstance.ui._updateLoopStopped = true;
    if (globalGameInstance.ui.update_interface_task) {
      if (typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(globalGameInstance.ui.update_interface_task);
      }
      globalGameInstance.ui.update_interface_task = null;
    }
  }
  
  // 3. Clear all mocks and spies
  vi.clearAllMocks();
  vi.restoreAllMocks();

  // 4. Close the JSDOM window to release its memory
  if (domInstance) {
    domInstance.window.close();
    domInstance = null;
  }
  
  globalGameInstance = null;
  initialGameState = null;
  
  mockBrowserGlobals();

  if (global.gc) {
    global.gc();
  }
}

beforeEach((context) => {
  currentTestName = getFullTestName(context.task);
  testLogs.set(currentTestName, []);
  if (globalGameInstance) {
    initialGameState = globalGameInstance.getSaveState();
  }
});

afterEach(async (context) => {
  const testFailed = context.task.state === 'fail';
  const shouldDumpLogs = testFailed || process.env.FORCE_LOG_DUMP;
  const logs = testLogs.get(currentTestName);

  if (shouldDumpLogs && logs?.length > 0) {
    originalLog(`\n\u001b[36m--- Console logs for test: "${currentTestName}" ---\u001b[0m`);
    logs.forEach(({ type, args }) => {
      const logger = { log: originalLog, warn: originalWarn, error: originalError }[type];
      logger(...args);
    });
    originalLog(`\u001b[36m--------------------------------------------------------\u001b[0m\n`);
  }

  if (testFailed && globalGameInstance) {
    originalLog(`\n\u001b[33m--- Extended Debug Info for Failed Test ---\u001b[0m`);
    originalLog(dumpGrid(globalGameInstance));
    if (initialGameState) {
      const finalGameState = globalGameInstance.getSaveState();
      const differences = diffObjects(initialGameState, finalGameState);
      if (Object.keys(differences).length > 0) {
        originalLog('\u001b[34m--- Game State Changes ---\u001b[0m');
        originalLog(differences);
      }
    }
    if (context.task.result?.error?.stack) {
        originalError('\u001b[31m--- Error Stack ---\u001b[0m');
        originalError(context.task.result.error.stack);
    }
    originalLog(`\u001b[33m-----------------------------------------\u001b[0m\n`);
  }

  testLogs.delete(currentTestName);
  currentTestName = null;
  
  cleanupGame();

 vi.useRealTimers();

  await new Promise(resolve => setTimeout(resolve, 10));
});