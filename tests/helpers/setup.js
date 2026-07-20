import { mockBrowserGlobals } from './setupEnv.js';
import {
  getCoreBridgeOptions,
  isCoreEngineTestMode,
  testEngineMode,
} from './testEngineMode.js';

export { getCoreBridgeOptions, isCoreEngineTestMode, testEngineMode };
import Decimal from 'break_infinity.js';
import { toNumber } from '@app/simUtils.js';
if (isCoreEngineTestMode) {
  console.info("[test-engine] REACTOR_TEST_ENGINE=core — authoritative ticks via reactor-core-lib");
}
if (typeof global !== 'undefined') global.Decimal = Decimal;
if (typeof global.window !== 'undefined') global.window.Decimal = Decimal;

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock("@app/state.js", async (importOriginal) => {
  const actual = await importOriginal();
  const { hydrateEconomyFromHost } = await import("@app/bridge/bridge-economy-sync.js");
  const economyKeys = new Set([
    "current_money",
    "current_exotic_particles",
    "total_exotic_particles",
    "exotic_particles",
    "session_power_produced",
    "session_power_sold",
    "session_heat_dissipated",
  ]);
  return {
    ...actual,
    patchGameState(game, patch) {
      actual.patchGameState(game, patch);
      if (!game?.coreBridge || !patch) return;
      for (const key of Object.keys(patch)) {
        if (economyKeys.has(key)) {
          hydrateEconomyFromHost(game.coreBridge);
          return;
        }
      }
    },
  };
});

import fs from 'fs';
import pathModule from 'path';
import { JSDOM, ResourceLoader } from 'jsdom';
import { createJSDOMAudioContextMock } from './testUtils.js';

vi.mock('@app/storage/idb-keyval.js', () => {
  const getStorage = () => (typeof global !== 'undefined' && global.localStorage) || (typeof window !== 'undefined' && window.localStorage);
  return {
    get: (key) => {
      const s = getStorage();
      const v = s?.getItem?.(key);
      return Promise.resolve(v !== undefined && v !== null ? v : undefined);
    },
    set: (key, value) => {
      const s = getStorage();
      if (s?.setItem) s.setItem(key, value);
      return Promise.resolve();
    },
    del: (key) => {
      const s = getStorage();
      if (s?.removeItem) s.removeItem(key);
      return Promise.resolve();
    },
    clear: () => {
      const s = getStorage();
      if (s?.clear) s.clear();
      return Promise.resolve();
    },
  };
});

mockBrowserGlobals();
if (global.window) global.window.Decimal = Decimal;

import { Game } from '@app/domain/game.js';
import { Engine } from '@app/domain/engine.js';
import { ObjectiveManager } from '@app/domain/objectives.js';
import '@app/components/upgrades/presentation.js';
import { UI } from '@app/components/ui.js';
import { PageRouter } from '@app/page-router.js';
import { attachGameEventListeners } from '@app/components/shell/game-event-wiring.js';
import { grantInfiniteResources, setTilePart, clearTilePart } from './gameHelpers.js';
import { pushHostUpgradeLevelsForLoad, syncGridFromGame } from "./bridge-test-harness.js";
import { Tile } from '@app/domain/grid.js';
import { resolveTileDisplayRate } from '@app/components/tooltip-stats.js';

Tile.prototype.setPart = function setPart(part) {
  return setTilePart(this, part);
};
Tile.prototype.clearPart = function clearPart() {
  return clearTilePart(this);
};
Tile.prototype.sellPart = function sellPart() {
  return this.game?.sellPart?.(this);
};
Tile.prototype.getEffectiveVentValue = function getEffectiveVentValue() {
  return resolveTileDisplayRate(this, "vent");
};
Tile.prototype.getEffectiveTransferValue = function getEffectiveTransferValue() {
  return resolveTileDisplayRate(this, "transfer");
};
Tile.prototype.recalculateEffectiveValues = function recalculateEffectiveValues() {};

export const toNum = toNumber;

export {
  grantInfiniteResources,
  syncGridState,
  runTicks,
  setTechTreeState,
  withTechTree,
  assembleHeatChain,
  runManualActionUntil,
  getFlatIndex,
  setGridDimensions as reshapeGrid,
} from './gameHelpers.js';

export {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  fs,
  JSDOM,
  Game,
  UI,
  Engine,
  ObjectiveManager,
  PageRouter,
};

export * from "./testUtils.js";
export * from "./suiteHelpers.js";

let globalGameInstance = null;
let domInstance = null;
let cachedStrippedIndexHtml = null;
let domShellSnapshot = null;
let lastTestFilepath = null;

function abortableResourcePromise(promise, onAbort = () => {}) {
  if (promise && typeof promise.abort !== "function") {
    promise.abort = onAbort;
  }
  return promise;
}

class TestCustomResourceLoader extends ResourceLoader {
  fetch(url, options) {
    const urlStr = url.toString();
    if (urlStr.includes('fonts.googleapis.com') || urlStr.includes('fonts.gstatic.com')) {
      return abortableResourcePromise(Promise.resolve(Buffer.from('')));
    }
    if (urlStr.includes('/lib/') || urlStr.endsWith('.min.js') || (urlStr.endsWith('.js') && !urlStr.includes('/src/'))) {
      return abortableResourcePromise(Promise.resolve(Buffer.from('')));
    }
    const cleanPath = urlStr.replace(/^http:\/\/localhost:8080\//, '').split('?')[0];
    const filePath = pathModule.resolve(__dirname, '../../public', cleanPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return abortableResourcePromise(Promise.resolve(fs.readFileSync(filePath)));
    }
    return abortableResourcePromise(Promise.reject(new Error(`Resource not found: ${urlStr}`)));
  }
}

function getStrippedIndexHtml() {
  if (cachedStrippedIndexHtml === null) {
    const indexHtmlPath = pathModule.resolve(__dirname, '../../public/index.html');
    const raw = fs.readFileSync(indexHtmlPath, 'utf-8');
    cachedStrippedIndexHtml = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  }
  return cachedStrippedIndexHtml;
}

function applyDomSurface(domInst) {
  global.window = domInst.window;
  global.document = domInst.window.document;
  const helperDoc = global.document.implementation?.createHTMLDocument?.('');
  const createCommentImpl = helperDoc?.createComment
    ? function(data) {
        const c = helperDoc.createComment(data);
        return global.document.adoptNode ? global.document.adoptNode(c) : c;
      }
    : function(data) {
        const t = global.document.createElement('template');
        t.innerHTML = '<!--' + String(data || '').replace(/-->/g, '-\u0000->') + '-->';
        return t.content.firstChild;
      };
  try {
    global.document.createComment = createCommentImpl;
  } catch (_) {
    Object.defineProperty(global.document, 'createComment', { value: createCommentImpl, configurable: true });
  }
  if (domInst.window.AbortController) {
    global.AbortController = domInst.window.AbortController;
  }
  if (domInst.window.KeyboardEvent) {
    global.KeyboardEvent = domInst.window.KeyboardEvent;
  }
  if (domInst.window.Image) {
    global.Image = domInst.window.Image;
  }
  if (domInst.window.Event) {
    global.Event = domInst.window.Event;
  }

  const noop = () => {};
  const mock2DContext = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    drawImage: noop,
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
  };
  const originalGetContext = domInst.window.HTMLCanvasElement.prototype.getContext;
  domInst.window.HTMLCanvasElement.prototype.getContext = function (type) {
    if (type === '2d') return mock2DContext;
    return originalGetContext ? originalGetContext.call(this, type) : null;
  };
}

function wireDomFetchMock() {
  global.fetch = window.fetch = async (url) => {
    const urlStr = url.toString();
    if (urlStr.includes('/api/leaderboard')) {
      return { ok: true, json: () => Promise.resolve({ success: true, data: [] }) };
    }

    if (urlStr.includes('/lib/') || urlStr.endsWith('.min.js') || (urlStr.endsWith('.js') && !urlStr.includes('/src/'))) {
      return {
        ok: true,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve({}),
        headers: new Map([['content-type', 'application/javascript']])
      };
    }

    const cleanPath = urlStr.replace(/^http:\/\/localhost:8080\//, '').split('?')[0];
    const filePath = pathModule.resolve(__dirname, '../../public', cleanPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const contentType = pathModule.extname(filePath) === '.json' ? 'application/json' : 'text/plain';
      return {
        ok: true,
        text: () => Promise.resolve(content),
        json: () => Promise.resolve(JSON.parse(content)),
        headers: new Map([['content-type', contentType]])
      };
    }
    return { ok: false, status: 404 };
  };
}

function getTaskFilepath(task) {
  return task?.file?.filepath ?? task?.suite?.filepath;
}

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

function ensureLogicOnlyWindow() {
  if (typeof global.window?.addEventListener === "function") return;
  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "http://localhost:8080/",
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  mockBrowserGlobals();
  if (global.window) global.window.Decimal = Decimal;
}

/**
 * Sets up a game instance for CORE LOGIC tests without a real DOM.
 * Reuses a single game instance and resets it for performance.
 */
export async function setupGameLogicOnly({ infiniteResources = true } = {}) {
  ensureLogicOnlyWindow();
  if (globalGameInstance) {
    // Reset existing instance for speed
    await globalGameInstance.set_defaults();
    
    // CRITICAL FIX: Always re-initialize the tileset to ensure the grid exists
    // This is necessary because clearAllTiles() might leave the grid in an inconsistent state
    globalGameInstance.tileset.initialize();
    globalGameInstance.tileset.clearAllTiles();
    
    globalGameInstance.upgradeset.getAllUpgrades().forEach((u) => {
            u.level = 0;
    });
    pushHostUpgradeLevelsForLoad(globalGameInstance);
    globalGameInstance.syncModifiersFromUpgrades?.({ skipGrid: true });
    syncGridFromGame(globalGameInstance);
  } else {
    // Create a new instance
    const mockedUI = new UI();
    // Ensure the mocked UI is completely inert and won't try to access the DOM.
    mockedUI.cacheDOMElements = vi.fn(() => true);
    mockedUI.registry = { get: () => null };
    mockedUI.DOMElements = { main: { classList: { toggle: vi.fn() } } };
    mockedUI.resizeReactor = vi.fn();
    mockedUI.showPage = vi.fn();
    mockedUI.runUpdateInterfaceLoop = vi.fn();
    mockedUI.stateManager = {
      handleObjectiveCompleted: vi.fn(),
      handleObjectiveLoaded: vi.fn(),
      setGame: vi.fn(),
    };

    const game = new Game(mockedUI);
    const { createGameSaveManager } = await import("@app/domain/game-save.js");
    game.saveManager = createGameSaveManager(game);
    await mockedUI.init(game);
    game.engine = new Engine(game);
    game.objectives_manager = new ObjectiveManager(game);

    // CRITICAL FIX: The tileset must be initialized to create the grid.
  game.tileset.initialize();

  const { attachCoreBridge } = await import("@app/bridge/revival-session-bridge.js");
  const { attachHeatMutatorsForTests } = await import("./bridge-test-harness.js");
  await attachCoreBridge(game, getCoreBridgeOptions());
  attachHeatMutatorsForTests(game);
  await game.partset.initialize();
  await game.upgradeset.initialize();
    await game.objectives_manager.initialize();

    globalGameInstance = game;
  }

  // Set default state for logic tests
  globalGameInstance.bypass_tech_tree_restrictions = true;
  if (infiniteResources) grantInfiniteResources(globalGameInstance);
  globalGameInstance.paused = false;

  if (!globalGameInstance.coreBridge?.isActive) {
    const { attachCoreBridge } = await import("@app/bridge/revival-session-bridge.js");
    const { attachHeatMutatorsForTests } = await import("./bridge-test-harness.js");
    await attachCoreBridge(globalGameInstance, getCoreBridgeOptions());
    attachHeatMutatorsForTests(globalGameInstance);
  } else {
    const { attachHeatMutatorsForTests } = await import("./bridge-test-harness.js");
    attachHeatMutatorsForTests(globalGameInstance);
  }

  return globalGameInstance;
}

/**
 * Sets up a game instance with a full JSDOM environment for UI tests.
 */
export async function setupGameWithDOM() {
  const shellHtml = '<div id="app_root" class="theme-dark"><div id="splash-container"></div><div id="wrapper" class="hidden"></div><div id="modal-root"></div></div>';

  if (!domInstance) {
    const indexHtml = getStrippedIndexHtml();
    domInstance = new JSDOM(indexHtml, {
      url: 'http://localhost:8080/',
      pretendToBeVisual: true,
      resources: new TestCustomResourceLoader(),
      runScripts: 'outside-only',
    });
    applyDomSurface(domInstance);
    mockBrowserGlobals();
    global.localStorage = global.window.localStorage;
    window.AudioContext = vi.fn().mockImplementation(createJSDOMAudioContextMock(vi));
    wireDomFetchMock();
    injectHTMLContent(global.document, shellHtml);
    domShellSnapshot = domInstance.window.document.body.innerHTML;
  } else {
    domInstance.window.document.body.innerHTML = domShellSnapshot;
    global.window = domInstance.window;
    global.document = domInstance.window.document;
    mockBrowserGlobals();
    global.localStorage = global.window.localStorage;
    window.AudioContext = vi.fn().mockImplementation(createJSDOMAudioContextMock(vi));
    wireDomFetchMock();
  }

  const ui = new UI();
  const game = new Game(ui);
  const { createGameSaveManager } = await import("@app/domain/game-save.js");
  game.saveManager = createGameSaveManager(game);
  game.router = new PageRouter(ui);
  await ui.init(game);
  const { attachCoreBridge } = await import("@app/bridge/revival-session-bridge.js");
  const { attachHeatMutatorsForTests } = await import("./bridge-test-harness.js");
  await attachCoreBridge(game, getCoreBridgeOptions());
  attachHeatMutatorsForTests(game);
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();

  game.tileset.initialize();

  game.router.loadGameLayout();
  await game.router.loadPage("reactor_section", true);

  game.objectives_manager = new ObjectiveManager(game);
  await game.objectives_manager.initialize();
  
  if (typeof global.Worker === "undefined") {
    global.Worker = class MockWorker {
      constructor() {
        this.onmessage = null;
      }
      postMessage() {}
      terminate() {}
    };
    if (global.window) global.window.Worker = global.Worker;
  }

  game.engine = new Engine(game);

  const { AudioService } = await import("@app/services/app-services.js");
  game.audio = new AudioService();
  await game.audio.init();
  
  ui.detachGameEventListeners = attachGameEventListeners(game, ui);

  ui.initMainLayout();
  ui.gridScaler.resize();

  globalGameInstance = game;
  return { game, document: global.document, window: global.window };
}


export async function setupGame() {
  globalGameInstance = null;
  const game = await setupGameLogicOnly({ infiniteResources: false });
  game.bypass_tech_tree_restrictions = true;
  if (game.engine && !game.engine.running) {
    game.paused = false;
    game.engine.start();
  }
  return game;
}

export { setupSessionOnly, tileHeatAt, setSessionTileHeat } from "./sessionHelpers.js";

function teardownGameResources() {
  if (globalGameInstance?.engine?.stop) {
    globalGameInstance.engine.stop();
  }
  globalGameInstance?.objectives_manager?.teardown?.();

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

  if (globalGameInstance?.audio) {
    if (globalGameInstance.audio._testLoopInterval) clearInterval(globalGameInstance.audio._testLoopInterval);
    if (globalGameInstance.audio._warningLoopInterval) clearInterval(globalGameInstance.audio._warningLoopInterval);
    if (globalGameInstance.audio._geigerInterval) clearTimeout(globalGameInstance.audio._geigerInterval);
    if (globalGameInstance.audio.context && typeof globalGameInstance.audio.context.close === 'function') {
      try {
        const closeResult = globalGameInstance.audio.context.close();
        if (closeResult && typeof closeResult.catch === 'function') {
          closeResult.catch(() => {});
        }
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

function closeDomInstance() {
  if (!domInstance) return;
  try {
    domInstance.window.close();
  } catch (_) {
    /* jsdom aborts pending resource loads; ignore incomplete teardown */
  }
  domInstance = null;
}

function cleanupGameHard() {
  teardownGameResources();
  closeDomInstance();
  domShellSnapshot = null;
  delete global.window;
  delete global.document;
  globalGameInstance = null;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  mockBrowserGlobals();
  if (global.gc) {
    global.gc();
  }
}

function cleanupGameSoft() {
  teardownGameResources();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  try {
    domInstance?.window?.localStorage?.clear?.();
  } catch (_) {
    /* ignore */
  }
  globalGameInstance = null;
  if (global.gc) {
    global.gc();
  }
}

export function cleanupGame() {
  cleanupGameHard();
}

beforeEach((context) => {
  const fp = getTaskFilepath(context.task);
  if (lastTestFilepath !== null && fp != null && fp !== lastTestFilepath) {
    cleanupGameHard();
  }
  if (fp != null) {
    lastTestFilepath = fp;
  }
});

afterEach(() => {
  cleanupGameSoft();
});
