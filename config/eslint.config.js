import js from "@eslint/js";

const nodeGlobals = {
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  process: "readonly",
  module: "readonly",
  exports: "writable",
  require: "readonly",
  URL: "readonly",
  global: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly"
};

const workerGlobals = {
  self: "readonly",
  workbox: "readonly",
  importScripts: "readonly",
  caches: "readonly",
  Headers: "readonly",
  Response: "readonly",
  fetch: "readonly",
  console: "readonly",
  clearInterval: "readonly",
  setInterval: "readonly"
};

export default [
  {
    ignores: [
      "**/public/lib/*.js",
      "**/public/sw.js",
      "**/public/sw-temp.js",
      "**/src-sw.js",
      "**/eslint-results.sarif",
      "**/config/workbox-config.cjs",
      "**/node_modules/**",
      "**/tests/**"
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        fetch: "readonly",
        XMLHttpRequest: "readonly",
        FileReader: "readonly",
        atob: "readonly",
        btoa: "readonly",
        location: "readonly",
        history: "readonly",
        caches: "readonly",
        performance: "readonly",
        getComputedStyle: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",
        PointerEvent: "readonly",
        MouseEvent: "readonly",
        TouchEvent: "readonly",
        CustomEvent: "readonly",
        MessageChannel: "readonly",
        AbortController: "readonly",
        Blob: "readonly",
        URLSearchParams: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        crypto: "readonly",
        Image: "readonly",
        registerPeriodicSync: "readonly",
        registerOneOffSync: "readonly",
        LaunchParams: "readonly",
        io: "readonly",
        gapi: "readonly",
        google: "readonly",
        pako: "readonly",
        Worker: "readonly",
        ResizeObserver: "readonly",
        Notification: "readonly",
        process: "readonly",
        __dirname: "readonly",
        global: "readonly",
        URL: "readonly",
        test: "readonly",
        expect: "readonly",
        describe: "readonly",
        it: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        vi: "readonly"
      }
    },
    rules: {
      "eqeqeq": ["warn", "always"],
      "no-console": "warn",
      "no-unused-vars": ["warn", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-case-declarations": "warn",
      "no-useless-escape": "warn"
    }
  },
  {
    files: ["scripts/**/*.js", "scripts/**/*.cjs"],
    languageOptions: {
      globals: { ...nodeGlobals }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["**/public/sw.js", "**/src-sw.js", "**/public/sw-temp.js"],
    languageOptions: {
      globals: { ...workerGlobals }
    },
    rules: {
      "no-console": "off"
    }
  },
  {
    files: ["**/public/src/worker/**/*.js"],
    languageOptions: {
      globals: { self: "readonly", console: "readonly" }
    },
    rules: {
      "no-console": "warn"
    }
  }
];
