#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import { writeSplashBgCount } from "./generate-metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const WEBP_QUALITY = 80;

const dirs = [
  path.join(root, "public", "img", "misc", "backgrounds"),
  path.join(root, "public", "img", "misc", "stalenhag_bg"),
];

async function convertPngToWebp(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, ".webp");
  const before = fs.statSync(pngPath).size;
  await sharp(pngPath).webp({ quality: WEBP_QUALITY }).toFile(webpPath);
  const after = fs.statSync(webpPath).size;
  fs.unlinkSync(pngPath);
  const pct = before > 0 ? Math.round((1 - after / before) * 100) : 0;
  return { before, after, pct };
}

async function run() {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
    if (files.length === 0) {
      console.log(`${path.basename(dir)}: no PNG files to convert`);
      continue;
    }
    let totalBefore = 0;
    let totalAfter = 0;
    for (const f of files) {
      const p = path.join(dir, f);
      const { before, after, pct } = await convertPngToWebp(p);
      totalBefore += before;
      totalAfter += after;
      console.log(
        `${f} → ${f.replace(/\.png$/i, ".webp")}: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB (${pct}% smaller)`
      );
    }
    const totalPct = totalBefore > 0 ? Math.round((1 - totalAfter / totalBefore) * 100) : 0;
    console.log(
      `${path.basename(dir)}: ${(totalBefore / 1024 / 1024).toFixed(2)} MB → ${(totalAfter / 1024 / 1024).toFixed(2)} MB (${totalPct}% total)`
    );
  }
  writeSplashBgCount();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
