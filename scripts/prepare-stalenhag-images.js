#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dir = path.join(root, "public", "img", "misc", "stalenhag_bg");
const TARGET = 4096;

const bgImgPattern = /^bg_img(\d+)\.png$/;

function getSortKey(name) {
  const m = name.match(bgImgPattern);
  if (m) return [0, parseInt(m[1], 10)];
  return [1, name];
}

async function prepareImage(filePath, newName) {
  const meta = await sharp(filePath).metadata();
  const { width, height } = meta;
  const needsResize = width !== TARGET || height !== TARGET;

  let pipeline = sharp(filePath);
  if (needsResize) {
    pipeline = pipeline.resize(TARGET, TARGET, { fit: "cover", position: "centre" });
  }
  const buf = await pipeline.png().toBuffer();
  const outPath = path.join(dir, newName);
  fs.writeFileSync(outPath, buf);
  return { width, height, resized: needsResize };
}

async function run() {
  if (!fs.existsSync(dir)) {
    console.error("stalenhag_bg directory not found");
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
  const sorted = files.sort((a, b) => {
    const [ka, na] = getSortKey(a);
    const [kb, nb] = getSortKey(b);
    if (ka !== kb) return ka - kb;
    return na < nb ? -1 : na > nb ? 1 : 0;
  });

  const renames = [];
  const existing = new Set();
  for (let i = 0; i < sorted.length; i++) {
    const f = sorted[i];
    const num = i + 1;
    const targetName = `bg_img${num}.png`;
    if (f !== targetName) {
      existing.add(f);
      renames.push({ from: f, to: targetName });
    }
  }

  const tempDir = path.join(dir, ".prep_temp");
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    for (const { from } of renames) {
      fs.renameSync(path.join(dir, from), path.join(tempDir, from));
    }
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i];
      const num = i + 1;
      const targetName = `bg_img${num}.png`;
      const srcPath = renames.some((r) => r.from === f)
        ? path.join(tempDir, f)
        : path.join(dir, f);
      const { width, height, resized } = await prepareImage(srcPath, targetName);
      const resizedStr = resized ? ` (resized from ${width}x${height})` : "";
      console.log(`${targetName}: ${width}x${height} → 4096x4096${resizedStr}`);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  const { execSync } = await import("child_process");
  execSync("node scripts/generate-bg-count.js", { cwd: root });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
