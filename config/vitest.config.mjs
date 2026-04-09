import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, configDefaults } from "vitest/config";

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  resolve: {
    alias: {
      "@app": path.resolve(repoRoot, "public/src"),
      "@test-helpers": path.resolve(repoRoot, "tests/helpers/setup.js"),
    },
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
