import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  resolve: {
    alias: [
      { find: "@app", replacement: path.resolve(repoRoot, "public/src") },
      { find: "@test-helpers", replacement: path.resolve(repoRoot, "tests/helpers/setup.js") },
      { find: "lit-html/directives/class-map.js", replacement: path.resolve(repoRoot, "public/lib/lit-class-map.js") },
      { find: "lit-html/directives/style-map.js", replacement: path.resolve(repoRoot, "public/lib/lit-style-map.js") },
      { find: "lit-html/directives/repeat.js", replacement: path.resolve(repoRoot, "public/lib/lit-repeat.js") },
      { find: "lit-html/directives/when.js", replacement: path.resolve(repoRoot, "public/lib/lit-when.js") },
      { find: "lit-html/directives/unsafe-html.js", replacement: path.resolve(repoRoot, "public/lib/lit-unsafe-html.js") },
      { find: "lit-html", replacement: path.resolve(repoRoot, "public/lib/lit-html.js") },
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
    forceRerunTriggers: ["**/package.json", "config/vitest.config.mjs"],
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
