import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";

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
      ecmaVersion: "latest",
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
        Element: "readonly",
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
        vi: "readonly",
        Buffer: "readonly",
        queueMicrotask: "readonly",
        requestIdleCallback: "readonly",
        crossOriginIsolated: "readonly",
        HTMLDialogElement: "readonly",
        AppState: "readonly"
      }
    },
    rules: {
      "eqeqeq": ["warn", "always"],
      "no-console": "warn",
      "no-unused-vars": ["warn", { "varsIgnorePattern": "^_", "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
      "no-empty": ["error", { "allowEmptyCatch": true }],
      "no-case-declarations": "warn",
      "no-useless-escape": "warn",
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/utils.js", "**/utils"],
          importNames: [
            "StorageAdapter",
            "StorageUtils",
            "serializeSave",
            "deserializeSave",
            "migrateLocalStorageToIndexedDB",
            "AUTOSAVE_SLOT_KEY",
            "render",
            "classMap",
            "styleMap",
            "repeat",
            "when",
            "unsafeHTML",
            "escapeHtml",
            "on",
            "BaseComponent",
          ],
          message: "Import storage from storage/index.js and DOM helpers from dom/lit.js",
        }],
      }],
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
    files: ["public/src/**/*.js"],
    plugins: { import: importPlugin },
    settings: {
      "import/core-modules": ["reactor-core"],
      "import/resolver": {
        node: {
          extensions: [".js", ".mjs", ".cjs"]
        }
      }
    },
    rules: {
      "import/named": "error",
      "import/default": "error",
      "import/no-unresolved": "error",
      "import/no-cycle": ["warn", { "maxDepth": 10, "ignoreExternal": true }]
    }
  },
  {
    files: ["public/src/domain/**/*.js"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [{
          group: ["../utils.js", "../../utils.js", "@app/utils.js"],
          message: "Import from domain-specific modules (simUtils.js, storage/, constants/) instead of the utils.js barrel.",
        }],
      }],
    },
  },
  {
    files: ["public/src/components/**/*.js"],
    rules: {
      "no-restricted-imports": ["warn", {
        patterns: [{
          group: ["../utils.js", "../../utils.js", "@app/utils.js"],
          message: "Import from dom/lit.js, storage/, format/, or constants/ instead of the utils.js barrel.",
        }],
      }],
    },
  },
  {
    files: ["public/src/domain/**/*.js", "public/src/logic/**/*.js", "public/src/logic-*.js"],
    rules: {
      "no-restricted-globals": ["warn", {
        "name": "document",
        "message": "Domain/logic modules must not access document — use state/effects and let components render."
      }, {
        "name": "window",
        "message": "Domain/logic modules must not access window — pass dependencies from components or state."
      }]
    }
  },
  {
    files: ["public/src/**/*.js"],
    ignores: ["public/src/app.js", "public/src/core/logger.js"],
    rules: {
      "no-restricted-syntax": ["warn", {
        selector: "MemberExpression[object.name='window'][property.name='game']",
        message: "Use getAppContext() instead of window.game."
      }, {
        selector: "MemberExpression[object.name='window'][property.name='ui']",
        message: "Use getAppContext() instead of window.ui."
      }, {
        selector: "MemberExpression[object.name='window'][property.name='pageRouter']",
        message: "Use getAppContext() instead of window.pageRouter."
      }]
    }
  }
];
