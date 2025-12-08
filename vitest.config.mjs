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
    outputFile: {
      json: "./test-results.json",
    },
    maxConcurrency: 10,
    silent: false,
    testTimeout: 300000, // Increased to 5 minutes for long-running tests
    hookTimeout: 300000, // Increased to 5 minutes for long-running hooks
    errorOnDeprecated: false,
    isolate: false,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
        memoryLimit: "16GB", // Increased from 4GB to 8GB
      },
    },
    // Optimize memory usage
    forceRerunTriggers: ["**/package.json", "{vitest,vite}.config.*"],
    // Prevent massive console output and DOM object dumps
    printConsoleTrace: false,
    logHeapUsage: true, // Enable heap usage logging for memory diagnostics
    // Reduce verbosity of DOM objects in test output
    outputTruncateLength: 80,
    chaiConfig: {
      truncateThreshold: 40,
      useColors: true,
      showDiff: true,
    },
    // Enhanced error output control
    onConsoleLog(log, type) {
      // Temporarily enable console output for debugging
      return true;
    },
    // Limit diff output size
    diffLimit: 1000,
    // Prevent full object dumps in error messages
    errorOnConsole: false,
    env: {
      NODE_OPTIONS: "--max-old-space-size=32768", // Increased to 32GB heap size
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
