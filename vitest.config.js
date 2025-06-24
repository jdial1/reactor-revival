import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/helpers/setup.js"],
    reporters: ["default"],
    outputFile: {
      json: "./test-results.json",
    },
    maxConcurrency: 1,
    silent: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    errorOnDeprecated: false,
    isolate: false,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
      },
    },
    // Optimize memory usage
    forceRerunTriggers: ["**/package.json/**", "**/{vitest,vite}.config.*"],
    // Prevent massive console output
    printConsoleTrace: false,
    logHeapUsage: false,
    env: {
      NODE_OPTIONS: "--max-old-space-size=4096",
    },
  },
  define: {
    "process.env.NODE_ENV": '"test"',
  },
  esbuild: {
    target: "esnext",
  },
  optimizeDeps: {
    force: true,
  },
  // Use ESM instead of CJS
  build: {
    target: "esnext",
    minify: false,
  },
});
