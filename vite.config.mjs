import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

const globPatterns = [
  "index.html",
  "css/**/*.css",
  "data/**/*.json",
  "img/**/*.{png,svg,jpg,jpeg}",
  "pages/**/*.html",
  "components/**/*.html",
  "manifest.json",
  "version.json",
  "lib/**/*.js",
  "src/**/*.js",
  "components/**/*.js",
];

const globIgnores = [
  "**/node_modules/**",
  "css/old_app.css",
  "css/old2_app.css",
  "sw.js",
  "workbox-*.js"
];

export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist-sw",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      output: {
        entryFileNames: "src-sw.js",
        format: "iife",
      },
    },
  },
  plugins: [
    VitePWA({
      strategies: "injectManifest",
      srcDir: ".",
      filename: "src-sw.js",
      registerType: "autoUpdate",
      manifest: false,
      injectManifest: {
        swDest: resolve(process.cwd(), "public", "sw.js"),
        globDirectory: "public",
        globPatterns,
        globIgnores,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});

