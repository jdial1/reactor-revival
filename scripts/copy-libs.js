#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");
const libDir = path.join(root, "public", "lib");
const corePkgRoot = path.join(root, "node_modules", "reactor-core-lib");
const localGameDataRoot = path.join(root, "game-data");

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
  "lit-unsafe-html": "lit-html/directives/unsafe-html.js",
  "reactor-core": path.join(corePkgRoot, "src", "index.js"),
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
    chunkNames: "chunk-[hash]",
    platform: "browser",
    external: ["node:fs/promises", "node:url", "node:path"],
  });
  console.log("✓ All ESM packages bundled successfully into public/lib!");
} catch (err) {
  console.error("✗ Error bundling packages:", err);
  process.exit(1);
}

const coreGamesDir = path.join(libDir, "reactor-core", "games");
const coreGamesSrc = path.join(corePkgRoot, "src", "games");
const gameDataFiles = ["data.json", "parts.json", "upgrades.json", "research.json"];

function copyGameDataFrom(sourceRoot, label) {
  if (!fs.existsSync(sourceRoot)) return;
  for (const gameId of fs.readdirSync(sourceRoot)) {
    const gameSrcDir = path.join(sourceRoot, gameId);
    if (!fs.statSync(gameSrcDir).isDirectory()) continue;
    const destDir = path.join(coreGamesDir, gameId);
    let copied = false;
    for (const file of gameDataFiles) {
      const srcPath = path.join(gameSrcDir, file);
      if (!fs.existsSync(srcPath)) continue;
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, path.join(destDir, file));
      copied = true;
    }
    if (copied) console.log(`✓ Copied reactor-core game data (${label}): ${gameId}`);
  }
}

copyGameDataFrom(coreGamesSrc, "package");
copyGameDataFrom(localGameDataRoot, "local");
