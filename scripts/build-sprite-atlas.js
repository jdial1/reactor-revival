import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { glob } from "glob";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PARTS_GLOB = "public/img/parts/**/*.png";
const OUT_IMG = path.join(ROOT, "public/img/reactor-parts-atlas.png");
const OUT_JSON = path.join(ROOT, "public/data/sprite-atlas.json");
const PADDING = 1;
const MAX_COLS = 32;

async function main() {
  const cwd = ROOT;
  const files = (await glob(PARTS_GLOB, { cwd, nodir: true })).sort();
  if (files.length === 0) {
    console.error("No PNG files under public/img/parts");
    process.exit(1);
  }
  const metas = [];
  for (const rel of files) {
    const abs = path.join(cwd, rel);
    const m = await sharp(abs).metadata();
    metas.push({ rel: rel.replace(/\\/g, "/"), abs, w: m.width || 0, h: m.height || 0 });
  }
  const n = metas.length;
  const cols = Math.min(MAX_COLS, Math.ceil(Math.sqrt(n)));
  const rows = Math.ceil(n / cols);
  let rowHeights = Array(rows).fill(0);
  let colWidths = Array(cols).fill(0);
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (i >= n) break;
      const m = metas[i++];
      rowHeights[r] = Math.max(rowHeights[r], m.h);
      colWidths[c] = Math.max(colWidths[c], m.w);
    }
  }
  const rowTops = [];
  let yAcc = 0;
  for (let r = 0; r < rows; r++) {
    rowTops.push(yAcc);
    yAcc += rowHeights[r] + PADDING;
  }
  const colLefts = [];
  let xAcc = 0;
  for (let c = 0; c < cols; c++) {
    colLefts.push(xAcc);
    xAcc += colWidths[c] + PADDING;
  }
  const atlasW = Math.max(1, xAcc);
  const atlasH = Math.max(1, yAcc);
  const layers = [];
  const manifest = {};
  i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (i >= n) break;
      const m = metas[i];
      const dx = colLefts[c] + Math.floor((colWidths[c] - m.w) / 2);
      const dy = rowTops[r] + Math.floor((rowHeights[r] - m.h) / 2);
      const key = m.rel.replace(/^public\//, "");
      manifest[key] = { x: dx, y: dy, w: m.w, h: m.h };
      layers.push({ input: m.abs, left: dx, top: dy });
      i++;
    }
  }
  await sharp({
    create: { width: atlasW, height: atlasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(layers.map((l) => ({ input: l.input, left: l.left, top: l.top })))
    .png()
    .toFile(OUT_IMG);
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify({ atlas: "img/reactor-parts-atlas.png", frames: manifest }, null, 0));
  console.log(`Wrote ${OUT_IMG} (${atlasW}x${atlasH}), ${OUT_JSON} (${Object.keys(manifest).length} frames)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
