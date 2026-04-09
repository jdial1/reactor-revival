#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { writeSplashBgCount } from "./generate-metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const dirs = [
  path.join(root, "public", "img", "misc", "backgrounds"),
  path.join(root, "public", "img", "misc", "stalenhag_bg")
];

async function compressPng(filePath) {
  const before = fs.statSync(filePath).size;
  try {
    const buf = await sharp(filePath)
      .png({ palette: true, quality: 95, compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(filePath, buf);
    const after = buf.length;
    const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    return { before, after, pct };
  } catch {
    const buf = await sharp(filePath)
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(filePath, buf);
    const after = buf.length;
    const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
    return { before, after, pct };
  }
}

async function run() {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png"));
    let totalBefore = 0;
    let totalAfter = 0;
    for (const f of files) {
      const p = path.join(dir, f);
      const { before, after, pct } = await compressPng(p);
      totalBefore += before;
      totalAfter += after;
      console.log(`${f}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB (${pct}% smaller)`);
    }
    const totalPct = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
    console.log(`${path.basename(dir)}: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${totalPct}% total)`);
  }
  writeSplashBgCount();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
