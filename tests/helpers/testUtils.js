import { vi, expect } from "vitest";
import { serializeSave, toDecimal, StorageUtilsAsync } from "@app/utils.js";
import { clearGrid } from "./gameHelpers.js";

export function simulateViewportResize(width, height) {
  const w = typeof globalThis.window !== "undefined" ? globalThis.window : globalThis;
  const h = height !== undefined ? height : w.innerHeight;
  Object.defineProperty(w, "innerWidth", { configurable: true, writable: true, value: width });
  Object.defineProperty(w, "innerHeight", { configurable: true, writable: true, value: h });
  const Ev = w.Event || globalThis.Event;
  w.dispatchEvent(new Ev("resize"));
}

export function mockClipboardAPI(options = {}) {
  const { readText } = options;
  const previous = globalThis.navigator;
  const mockNav = {
    clipboard: {
      writeText: vi.fn(),
      readText: vi.fn(),
    },
  };
  if (readText !== undefined) {
    mockNav.clipboard.readText.mockResolvedValue(readText);
  }
  Object.defineProperty(globalThis, "navigator", {
    value: mockNav,
    writable: true,
    configurable: true,
  });
  return {
    navigator: mockNav,
    restore() {
      Object.defineProperty(globalThis, "navigator", {
        value: previous,
        writable: true,
        configurable: true,
      });
    },
  };
}

export async function simulateSaveAndLoad(game, stateOverrides = {}, options = {}) {
  const slot = options.slot ?? 1;
  const shouldClear = options.clearGrid !== false;
  const rawSave = await game.saveOrchestrator.getSaveState();
  const saveData = { ...rawSave, ...stateOverrides };
  const payload = serializeSave(saveData);
  await StorageUtilsAsync.setRaw(`reactorGameSave_${slot}`, payload);
  await StorageUtilsAsync.set("reactorCurrentSaveSlot", slot);
  if (shouldClear) {
    await clearGrid(game);
  }
  return game.saveManager.loadGame(slot);
}

export function setUpgradeLevelAndRefresh(game, upgradeId, level) {
  const upgrade = game.upgradeset.getUpgrade(upgradeId);
  if (!upgrade) {
    throw new Error(`Upgrade ${upgradeId} not found`);
  }
  upgrade.setLevel(level);
  upgrade.updateDisplayCost();
}

export async function captureConsoleOutputs(method, fn) {
  const original = console[method];
  const captured = [];
  console[method] = (...args) => {
    captured.push(args);
    original.apply(console, args);
  };
  try {
    return await Promise.resolve(fn(captured));
  } finally {
    console[method] = original;
  }
}

export async function captureOutput(vi, type, fn) {
  const method = ["log", "warn", "error"].includes(type) ? type : "log";
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  try {
    return await Promise.resolve(fn(spy));
  } finally {
    spy.mockRestore();
  }
}

export function setupMockAudio(vi) {
  const win = globalThis.window ?? globalThis;
  const impl = createJSDOMAudioContextMock(vi);
  const prevAC = win.AudioContext;
  const prevWebkit = win.webkitAudioContext;
  win.AudioContext = vi.fn().mockImplementation(impl);
  win.webkitAudioContext = vi.fn().mockImplementation(impl);
  return () => {
    if (prevAC !== undefined) win.AudioContext = prevAC;
    else delete win.AudioContext;
    if (prevWebkit !== undefined) win.webkitAudioContext = prevWebkit;
    else delete win.webkitAudioContext;
  };
}

export function setResourcesAndRefreshAffordability(game, money, ep) {
  if (money !== undefined && money !== null) {
    game.current_money = money;
    game.ui.stateManager.setVar("current_money", game.current_money);
  }
  if (ep !== undefined && ep !== null) {
    const epVal = typeof ep === "object" && ep !== null && typeof ep.toNumber === "function" ? ep : toDecimal(ep);
    game.current_exotic_particles = epVal;
    game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
  }
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

export async function setupPage(game, pageId) {
  try {
    await game.router.loadPage(pageId);
  } catch (err) {
    const msg = err?.message ?? "";
    if (!msg.includes("ChildPart") || !msg.includes("parentNode")) {
      throw err;
    }
  }
  if (game.ui?.coreLoopUI?.runUpdateInterfaceLoop) {
    game.ui.coreLoopUI.runUpdateInterfaceLoop(0);
  }
  await new Promise((r) => setTimeout(r, 0));
}

export function mockHardwareAPIs(options = {}) {
  const visibilityTarget = options.visibilityState ?? "visible";
  const prevNav = globalThis.navigator;
  const prevVis = typeof document !== "undefined" ? document.visibilityState : undefined;
  const vibrate = vi.fn();
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release });
  const stubNav =
    prevNav && typeof prevNav === "object"
      ? { ...prevNav, vibrate, wakeLock: { request } }
      : { vibrate, wakeLock: { request } };
  vi.stubGlobal("navigator", stubNav);
  if (typeof document !== "undefined") {
    Object.defineProperty(document, "visibilityState", {
      value: visibilityTarget,
      configurable: true,
    });
  }
  function restoreMockHardwareAPIs() {
    vi.unstubAllGlobals();
    if (typeof document !== "undefined" && prevVis !== undefined) {
      Object.defineProperty(document, "visibilityState", {
        value: prevVis,
        configurable: true,
      });
    }
  }
  return { vibrate, wakeLockRequest: request, restore: restoreMockHardwareAPIs };
}

export function createTrackedMockAudioContext(vi) {
  const last = { oscillator: null, bufferSource: null };
  const mockAudioContext = {
    state: "running",
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createGain: vi.fn(() => {
      const gainValue = { value: 0 };
      const gainParam = {
        get value() {
          return gainValue.value;
        },
        set value(v) {
          gainValue.value = v;
        },
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        setTargetAtTime: vi.fn(),
      };
      return {
        get gain() {
          return gainParam;
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      last.oscillator = osc;
      return osc;
    }),
    createBufferSource: vi.fn(() => {
      const src = {
        buffer: null,
        loop: false,
        playbackRate: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      last.bufferSource = src;
      return src;
    }),
    createBiquadFilter: vi.fn(() => ({
      type: "lowpass",
      frequency: {
        value: 1000,
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      Q: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createWaveShaper: vi.fn(() => ({
      curve: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBuffer: vi.fn((channels, length, sampleRate) => ({
      length,
      numberOfChannels: channels,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: vi.fn(() => {
        const data = new Float32Array(length);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        return data;
      }),
    })),
    createStereoPanner: vi.fn(() => ({
      pan: { value: 0 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    suspend: vi.fn(),
    resume: vi.fn(),
  };
  return {
    mockAudioContext,
    get mockOscillator() {
      return last.oscillator;
    },
    get mockBufferSource() {
      return last.bufferSource;
    },
  };
}

export function attachAudioContextToWindow(win, mockAudioContext) {
  win.AudioContext = vi.fn(() => mockAudioContext);
  win.webkitAudioContext = vi.fn(() => mockAudioContext);
}

export function createJSDOMAudioContextMock(vi) {
  return () => ({
    state: "running",
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
      type: "sine",
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
      type: "lowpass",
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
    createStereoPanner: () => ({
      pan: { value: 0 },
      connect: vi.fn(),
    }),
    suspend: vi.fn().mockResolvedValue(),
    resume: vi.fn().mockResolvedValue(),
    close: vi.fn().mockResolvedValue(),
  });
}

export function createServiceWorkerTestMocks(vi) {
  const mockServiceWorkerRegistration = {
    active: {
      postMessage: vi.fn(),
      state: "activated",
    },
    installing: null,
    waiting: null,
    scope: "/",
    updateViaCache: "all",
    unregister: vi.fn().mockResolvedValue(true),
    addEventListener: vi.fn(),
  };
  const mockServiceWorker = {
    postMessage: vi.fn(),
    state: "activated",
    scriptURL: "/sw.js",
  };
  const mockServiceWorkerContainer = {
    register: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
    getRegistration: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
    getRegistrations: vi.fn().mockResolvedValue([mockServiceWorkerRegistration]),
    controller: mockServiceWorker,
    ready: Promise.resolve(mockServiceWorkerRegistration),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const mockCache = {
    match: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(),
  };
  const mockCaches = {
    open: vi.fn().mockResolvedValue(mockCache),
    delete: vi.fn().mockResolvedValue(true),
    keys: vi.fn().mockResolvedValue(["static-resources", "pages", "images"]),
    match: vi.fn(),
    has: vi.fn().mockResolvedValue(true),
  };
  const mockFetch = vi.fn();
  const applyGlobals = () => {
    global.navigator = {
      serviceWorker: mockServiceWorkerContainer,
    };
    global.caches = mockCaches;
    global.fetch = mockFetch;
  };
  return {
    mockServiceWorkerRegistration,
    mockServiceWorker,
    mockServiceWorkerContainer,
    mockCache,
    mockCaches,
    mockFetch,
    applyGlobals,
  };
}

export function attachMockDOMToTiles(game, document = null) {
  const tiles = game.tileset?.tiles_list || [];
  if (document?.createElement) {
    for (const tile of tiles) {
      if (!tile.$el) {
        const el = document.createElement("div");
        el.className = "tile";
        el.tile = tile;
        tile.$el = el;
      }
    }
    return;
  }
  for (const tile of tiles) {
    if (!tile.$el) {
      const classes = new Set();
      tile.$el = {
        classList: {
          contains: (cls) => classes.has(cls),
          add: (cls) => classes.add(cls),
          remove: (cls) => classes.delete(cls),
        },
        dataset: {},
        removeAttribute: () => {},
        querySelector: () => null,
      };
    } else {
      tile.$el.dataset = tile.$el.dataset || {};
      tile.$el.removeAttribute = tile.$el.removeAttribute || (() => {});
      if (!tile.$el.querySelector) tile.$el.querySelector = () => null;
      if (!tile.$el.classList || !tile.$el.classList.contains) {
        const classes = new Set();
        tile.$el.classList = {
          contains: (cls) => classes.has(cls),
          add: (cls) => classes.add(cls),
          remove: (cls) => classes.delete(cls),
        };
      }
    }
  }
}

export function patchAudioContextForMeltdown(game, vi) {
  if (!game.audio) return;
  game.audio.enabled = true;
  if (game.audio.context) {
    Object.defineProperty(game.audio.context, "state", { value: "running", writable: true });
    const ctx = game.audio.context;
    if (!ctx.createOscillator) {
      ctx.createOscillator = vi.fn(() => ({
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
    }
    if (!ctx.createGain) {
      ctx.createGain = vi.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      }));
    }
    if (!ctx.createBufferSource) {
      ctx.createBufferSource = vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }));
    }
    if (!ctx.createBiquadFilter) {
      ctx.createBiquadFilter = vi.fn(() => ({
        type: "lowpass",
        frequency: { value: 1000 },
        connect: vi.fn(),
      }));
    }
    if (!ctx.createStereoPanner) {
      ctx.createStereoPanner = vi.fn(() => ({
        pan: { value: 0 },
        connect: vi.fn(),
      }));
    }
    if (!ctx.createWaveShaper) {
      ctx.createWaveShaper = vi.fn(() => ({
        curve: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      }));
    }
    if (!ctx.currentTime) {
      Object.defineProperty(ctx, "currentTime", { value: 0, writable: true });
    }
  } else {
    game.audio.context = {
      state: "running",
      currentTime: 0,
      destination: {},
      createGain: vi.fn(() => ({
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      })),
      createOscillator: vi.fn(() => ({
        type: "sine",
        frequency: {
          value: 440,
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBufferSource: vi.fn(() => ({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      })),
      createBiquadFilter: vi.fn(() => ({
        type: "lowpass",
        frequency: { value: 1000 },
        connect: vi.fn(),
      })),
      createStereoPanner: vi.fn(() => ({
        pan: { value: 0 },
        connect: vi.fn(),
      })),
      createWaveShaper: vi.fn(() => ({
        curve: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
      })),
    };
  }
}

export function buildKeyboardEvent(key, options = {}) {
  const { type = "keydown", ...rest } = options;
  return new KeyboardEvent(type, { key, bubbles: true, ...rest });
}

export function simulateKeyPress(target, key, options = {}) {
  const event = buildKeyboardEvent(key, options);
  target.dispatchEvent(event);
  return event;
}

export function simulateGridPointerDown(tile, options = {}) {
  const el = tile.$el;
  if (!el) {
    throw new Error("simulateGridPointerDown: tile has no $el");
  }
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      button: 0,
      ...options,
    })
  );
}

export function interceptEngineMethod(engine, methodName, interceptor) {
  const original = engine[methodName].bind(engine);
  engine[methodName] = function intercepted(...args) {
    return interceptor(original, args);
  };
  return () => {
    engine[methodName] = original;
  };
}

export function mockPerformanceAPI(vi, { stepMs = 10 } = {}) {
  const original = global.performance;
  let time = 0;
  global.performance = {
    now: vi.fn(() => {
      time += stepMs;
      return time;
    }),
    mark: vi.fn(),
    measure: vi.fn(),
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
  };
  return () => {
    global.performance = original;
  };
}

export async function flushUIUpdates(game, { deltaMs = 16.667, rolling = true } = {}) {
  await new Promise((r) => setTimeout(r, 0));
  const core = game?.ui?.coreLoopUI;
  if (!core) return;
  core.processUpdateQueue?.();
  if (rolling) {
    core.updateRollingNumbers?.(deltaMs);
  }
}

export function setupWorkerContext(vi) {
  const postMessage = vi.fn();
  const self = { postMessage, onmessage: null };
  globalThis.self = self;
  return {
    postMessage,
    self,
    restore() {
      delete globalThis.self;
    },
  };
}

export function monitorFloatingTextPooling(vi, doc = globalThis.document) {
  const counts = { div: 0 };
  const orig = doc.createElement.bind(doc);
  const spy = vi.spyOn(doc, "createElement").mockImplementation((tag, ...rest) => {
    if (tag === "div") counts.div++;
    return orig(tag, ...rest);
  });
  return {
    counts,
    restore() {
      spy.mockRestore();
    },
  };
}

export function createNowController(vi) {
  let t = 1_000_000;
  const spy = vi.spyOn(Date, "now").mockImplementation(() => t);
  return {
    getTime: () => t,
    setTime: (v) => {
      t = v;
    },
    advance: (ms) => {
      t += ms;
    },
    restore: () => spy.mockRestore(),
  };
}

export function mockThrottle(vi, { startMs } = {}) {
  const ctrl = createNowController(vi);
  if (startMs !== undefined) ctrl.setTime(startMs);
  return ctrl;
}

export function assertActivePage(game, pageId) {
  expect(game.router.currentPageId).toBe(pageId);
  const slug = pageId.replace("_section", "");
  expect(document.body.classList.contains(`page-${slug}`)).toBe(true);
}

