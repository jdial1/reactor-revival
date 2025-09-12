import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Browser globals
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
        // Node.js environment (scripts, tests)
        process: "readonly",
        __dirname: "readonly",
        global: "readonly",
        // For Vitest
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
      // Enforce strict equality
      "eqeqeq": ["error", "always"],
      // Warn about console logs instead of failing
      "no-console": "warn"
    },
    ignores: [
      "public/lib/*.js", // Ignore copied third-party libraries
      "public/sw.js", // Generated service worker
      "src-sw.js", // Service worker source
      "eslint-results.sarif",
      "workbox-config.cjs",
      "node_modules/**/*", // Node modules
      "tests/**/*" // Test files
    ]
  }
];
