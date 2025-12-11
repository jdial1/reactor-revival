import { defineConfig } from "vite";

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
    outputTruncateLength: 80,
    chaiConfig: {
      truncateThreshold: 40,
      useColors: true,
      showDiff: true,
    },
    diffLimit: 500,
    printConsoleTrace: true,
    errorOnConsole: false,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
        memoryLimit: "12GB",
      },
    },
    maxConcurrency: 15,
    testTimeout: 30000,
    hookTimeout: 30000,
    silent: false,
    logHeapUsage: false,
    forceRerunTriggers: ["**/package.json", "{vitest,vite}.config.*"],
    errorOnDeprecated: false,
  },
  esbuild: {
    target: "esnext",
  },
});
