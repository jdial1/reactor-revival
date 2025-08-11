import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // Treat `public/` as a normal folder in tests so imports like
  // "../../public/src/components/ui.js" resolve in CI.
  // Without this, Vite considers `public/` a static assets dir and won't
  // include modules from there in the module graph during Vitest runs.
  publicDir: false,
  resolve: {
    alias: [
      // Specific rule for components first (actual location under public/src)
      { find: "@app/components", replacement: path.resolve(__dirname, "public/src/components") },
      // Fallback for other @app imports (e.g., core, services)
      { find: "@app", replacement: path.resolve(__dirname, "public/src") },
      { find: "@public", replacement: path.resolve(__dirname, "public") },
    ],
  },
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
    maxConcurrency: 1,
    silent: false,
    testTimeout: 60000,
    hookTimeout: 60000,
    errorOnDeprecated: false,
    isolate: false,
    pool: "threads",
    poolOptions: {
      threads: {
        singleThread: true,
        isolate: false,
        memoryLimit: "4GB", // Increased from 2GB to 4GB
      },
    },
    // Optimize memory usage
    forceRerunTriggers: ["**/package.json", "{vitest,vite}.config.*"],
    // Prevent massive console output and DOM object dumps
    printConsoleTrace: false,
    logHeapUsage: false,
    // Reduce verbosity of DOM objects in test output
    outputTruncateLength: 80,
    chaiConfig: {
      truncateThreshold: 40,
      useColors: true,
      showDiff: true,
    },
    // Enhanced error output control
    onConsoleLog(log, type) {
      // Allow debug output to pass through, but suppress regular test output
      // We will handle console output manually in setup.js to buffer it.
      if (log.includes('[DEBUG]')) {
        return true; // Allow debug output
      }
      return false; // Suppress regular test output
    },
    // Limit diff output size
    diffLimit: 1000,
    // Prevent full object dumps in error messages
    errorOnConsole: false,
    env: {
      NODE_OPTIONS: "--max-old-space-size=8192", // Removed gc-interval as it's not allowed in worker threads
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
