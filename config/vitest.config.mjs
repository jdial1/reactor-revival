import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localThreads = Math.min(
  Math.max(2, typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length),
  16
);

export default defineConfig({
  resolve: {
    alias: [
      { find: "@app", replacement: path.resolve(repoRoot, "public/src") },
      { find: "@test-helpers", replacement: path.resolve(repoRoot, "tests/helpers/setup.js") },
      { find: "lit-html/directives/class-map.js", replacement: path.resolve(repoRoot, "node_modules/lit-html/directives/class-map.js") },
      { find: "lit-html/directives/style-map.js", replacement: path.resolve(repoRoot, "node_modules/lit-html/directives/style-map.js") },
      { find: "lit-html/directives/repeat.js", replacement: path.resolve(repoRoot, "node_modules/lit-html/directives/repeat.js") },
      { find: "lit-html/directives/when.js", replacement: path.resolve(repoRoot, "node_modules/lit-html/directives/when.js") },
      { find: "lit-html/directives/unsafe-html.js", replacement: path.resolve(repoRoot, "node_modules/lit-html/directives/unsafe-html.js") },
      { find: "lit-html", replacement: path.resolve(repoRoot, "node_modules/lit-html/lit-html.js") },
      { find: "reactor-core", replacement: path.resolve(repoRoot, "node_modules/reactor-core-lib/src/index.js") },
    ],
  },
  test: {
    exclude: [...configDefaults.exclude, "**/performance.test.js", "e2e/**"],
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
        isolate: isCI,
        useAtomics: !isCI,
        minThreads: 1,
        maxThreads: isCI ? 2 : localThreads,
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
