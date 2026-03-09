#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const dirs = {
  stalenhag: path.join(root, "public", "img", "misc", "stalenhag_bg"),
  splash: path.join(root, "public", "img", "misc", "backgrounds")
};

const splashPattern = /^splash_bg(\d+)\.png$/;
const bgImgPattern = /^bg_img(\d+)\.png$/;

function countInDir(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath).filter((f) => pattern.test(f));
  const nums = files.map((f) => parseInt(f.match(pattern)[1], 10));
  return nums.length ? Math.max(...nums) : 0;
}

const stalenhag = countInDir(dirs.stalenhag, bgImgPattern);
const splash = countInDir(dirs.splash, splashPattern);

const outPath = path.join(root, "public", "data", "splash_bg_count.json");
const data = JSON.stringify({ stalenhag, splash });
fs.writeFileSync(outPath, data);
