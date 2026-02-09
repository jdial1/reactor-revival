import js from "@eslint/js";

export default [
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
        process: "readonly",
        __dirname: "readonly",
        global: "readonly",
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
      "eqeqeq": ["error", "always"],
      "no-console": "warn"
    },
    ignores: [
      "public/lib/*.js",
      "public/sw.js",
      "src-sw.js",
      "eslint-results.sarif",
      "config/workbox-config.cjs",
      "node_modules/**/*",
      "tests/**/*"
    ]
  }
];
