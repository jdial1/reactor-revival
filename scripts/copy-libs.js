#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const libDir = path.join(__dirname, "..", "public", "lib");

if (fs.existsSync(libDir)) {
  fs.rmSync(libDir, { recursive: true, force: true });
}
fs.mkdirSync(libDir, { recursive: true });

const rawCopies = [
  { source: "node_modules/break_infinity.js/dist/break_infinity.min.js", target: "break_infinity.min.js" },
  { source: "node_modules/pako/dist/pako.min.js", target: "pako.min.js" },
  { source: "node_modules/@zip.js/zip.js/dist/zip.min.js", target: "zip.min.js" },
];

const fontCopies = [
  { source: "node_modules/@fontsource/share-tech-mono/files/share-tech-mono-latin-400-normal.woff2", target: "fonts/share-tech-mono-latin-400-normal.woff2" },
  { source: "node_modules/@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2", target: "fonts/press-start-2p-latin-400-normal.woff2" },
  { source: "node_modules/@fontsource/vt323/files/vt323-latin-400-normal.woff2", target: "fonts/vt323-latin-400-normal.woff2" },
  { source: "node_modules/@fontsource/oswald/files/oswald-latin-400-normal.woff2", target: "fonts/oswald-latin-400-normal.woff2" },
  { source: "node_modules/@fontsource/oswald/files/oswald-latin-500-normal.woff2", target: "fonts/oswald-latin-500-normal.woff2" },
  { source: "node_modules/@fontsource/oswald/files/oswald-latin-600-normal.woff2", target: "fonts/oswald-latin-600-normal.woff2" },
  { source: "node_modules/@fontsource/oswald/files/oswald-latin-700-normal.woff2", target: "fonts/oswald-latin-700-normal.woff2" },
];

rawCopies.forEach(({ source, target }) => {
  const srcPath = path.join(__dirname, "..", source);
  const destPath = path.join(libDir, target);
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied ${target}`);
  } else {
    console.warn(`⚠️ Source not found: ${source}`);
  }
});

fontCopies.forEach(({ source, target }) => {
  const srcPath = path.join(__dirname, "..", source);
  const destPath = path.join(libDir, target);
  if (fs.existsSync(srcPath)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
    console.log(`✓ Copied ${target}`);
  } else {
    console.warn(`⚠️ Source not found: ${source}`);
  }
});

const esmEntryPoints = {
  "derive-valtio": "derive-valtio",
  "query-core": "@tanstack/query-core",
  "idb-keyval": "idb-keyval",
  "superjson": "superjson",
  "zod": "zod",
  "zod-validation-error": "zod-validation-error",
  "valtio-vanilla": "valtio/vanilla",
  "valtio-utils": "valtio/vanilla/utils",
  "lit-html": "lit-html",
  "lit-class-map": "lit-html/directives/class-map.js",
  "lit-style-map": "lit-html/directives/style-map.js",
  "lit-repeat": "lit-html/directives/repeat.js",
  "lit-when": "lit-html/directives/when.js",
  "lit-unsafe-html": "lit-html/directives/unsafe-html.js"
};

console.log("\nBundling ESM dependencies using esbuild...");

try {
  await build({
    entryPoints: esmEntryPoints,
    bundle: true,
    format: "esm",
    splitting: true,
    outdir: libDir,
    minify: true,
    sourcemap: false,
    target: ["es2022"],
    chunkNames: "chunk-[hash]"
  });
  console.log("✓ All ESM packages bundled successfully into public/lib!");
} catch (err) {
  console.error("✗ Error bundling packages:", err);
  process.exit(1);
}
