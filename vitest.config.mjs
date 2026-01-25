import { defineConfig } from "vite";

const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost:8080/",
      },
    }, 
    setupFiles: ["./tests/helpers/setup.js"],
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
    forceRerunTriggers: ["**/package.json", "{vitest,vite}.config.*"],
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
