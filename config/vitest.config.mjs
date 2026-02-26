import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  resolve: {
    alias: [
      { find: "zod", replacement: path.resolve(__dirname, "../public/lib/zod.js") },
      { find: "zod/v3", replacement: path.resolve(__dirname, "../public/lib/zod.js") },
      { find: "zod-validation-error", replacement: path.resolve(__dirname, "../public/lib/zod-validation-error.js") },
      { find: "lit-html/directives/class-map.js", replacement: path.resolve(__dirname, "../node_modules/lit-html/directives/class-map.js") },
      { find: "lit-html/directives/style-map.js", replacement: path.resolve(__dirname, "../node_modules/lit-html/directives/style-map.js") },
      { find: "lit-html/directives/repeat.js", replacement: path.resolve(__dirname, "../node_modules/lit-html/directives/repeat.js") },
      { find: "lit-html/directives/when.js", replacement: path.resolve(__dirname, "../node_modules/lit-html/directives/when.js") },
      { find: "lit-html/directives/unsafe-html.js", replacement: path.resolve(__dirname, "../node_modules/lit-html/directives/unsafe-html.js") },
      { find: "lit-html", replacement: path.resolve(__dirname, "../node_modules/lit-html/lit-html.js") },
      { find: "superjson", replacement: path.resolve(__dirname, "../node_modules/superjson/dist/index.js") },
      { find: "@tanstack/query-core", replacement: path.resolve(__dirname, "../node_modules/@tanstack/query-core/build/modern/index.js") },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "**/performance.test.js"],
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:8080/",
      },
    },
    setupFiles: ["./tests/helpers/setupDecimal.js", "./tests/helpers/setup.js"],
    reporters: ["default"],
    css: false,
    pool: "threads",
    poolOptions: {
      threads: {
        isolate: true,
        useAtomics: !isCI,
        minThreads: 1,
        maxThreads: isCI ? 2 : 4,
      },
    },
    teardownTimeout: isCI ? 60000 : 10000,
    testTimeout: isCI ? 120000 : 10000,
    hookTimeout: isCI ? 60000 : 10000,
    silent: false,
    forceRerunTriggers: ["**/package.json", "config/{vitest,vite}.config.*"],
    printConsoleTrace: false,
    outputTruncateLength: 80,
    chaiConfig: {
      truncateThreshold: 40,
      useColors: true,
      showDiff: true,
    },
    diffLimit: 500,
    errorOnConsole: false,
    errorOnDeprecated: false,
  },
  esbuild: {
    target: "esnext",
  },
});
