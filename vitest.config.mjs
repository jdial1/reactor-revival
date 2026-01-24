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
    css: false,
    pool: "threads",
    poolOptions: {
      threads: {
        isolate: true,
        useAtomics: true,
        minThreads: 1,
        maxThreads: 4,
      },
    },
    teardownTimeout: 10000,
    testTimeout: 10000,
    hookTimeout: 10000,
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
