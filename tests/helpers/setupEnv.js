import Decimal from "break_infinity.js";
import { URL as NodeURL } from "url";
import { vi, afterEach } from "vitest";

if (typeof global !== "undefined") global.Decimal = Decimal;
if (typeof globalThis !== "undefined") globalThis.Decimal = Decimal;

function createMockLocalStorage() {
  let store = {};
  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
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

export function mockBrowserGlobals() {
  global.localStorage = createMockLocalStorage();

  if (typeof global.crypto === "undefined") {
    global.crypto = {};
  }
  if (typeof global.crypto.randomUUID === "undefined") {
    global.crypto.randomUUID = () => "mock-uuid-0000-0000-000000000000";
  }

  if (typeof global.URL === "undefined") {
    global.URL = class URL extends NodeURL {
      static createObjectURL() {
        return `blob:http://localhost:8080/${Math.random().toString(36).substring(7)}`;
      }
      static revokeObjectURL() {}
    };
  }

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

  if (typeof global.performance === "undefined") {
    global.performance = {};
  }
  global.performance.now = () => Date.now();
  global.performance.mark = vi.fn();
  global.performance.measure = vi.fn();
  if (
    typeof global.window !== "undefined" &&
    global.window.performance &&
    global.window.performance !== global.performance
  ) {
    global.window.performance.mark = function (name) {
      return global.performance.mark(name);
    };
    global.window.performance.measure = function (name, startMark, endMark) {
      return global.performance.measure(name, startMark, endMark);
    };
    global.window.performance.now = function () {
      return global.performance.now();
    };
  }

  if (typeof global.window === "undefined") {
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
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      location: {
        href: "http://localhost:8080/",
        origin: "http://localhost:8080",
        hostname: "localhost",
        reload: vi.fn(),
      },
    };
  }
  if (typeof global.window.addEventListener !== "function") {
    global.window.addEventListener = vi.fn();
  }
  if (typeof global.window.removeEventListener !== "function") {
    global.window.removeEventListener = vi.fn();
  }

  if (typeof global.document === "undefined") {
    const createCommentShim = (data) => ({
      nodeType: 8,
      data: String(data || ""),
      ownerDocument: null,
    });
    global.document = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      body: {
        appendChild: vi.fn(),
        style: {},
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn(),
          contains: vi.fn(() => false),
        },
      },
      createElement: () => ({
        style: {},
        classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
        appendChild: vi.fn(),
        addEventListener: vi.fn(),
        setAttribute: vi.fn(),
        ownerDocument: null,
      }),
      createComment: createCommentShim,
      getElementById: vi.fn(() => null),
      querySelector: vi.fn(() => null),
      querySelectorAll: vi.fn(() => []),
    };
  }

  global.__VITEST__ = true;
  if (global.window) global.window.Decimal = Decimal;
}

mockBrowserGlobals();

afterEach(() => {
  vi.useRealTimers();
});
