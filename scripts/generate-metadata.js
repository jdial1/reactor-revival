#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

export function writeVersion() {
  const now = new Date();
  const centralFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const centralParts = centralFormatter.formatToParts(now);
  const centralValues = {};
  centralParts.forEach((part) => {
    centralValues[part.type] = part.value;
  });
  const version =
    centralValues.year +
    "_" +
    centralValues.month +
    "_" +
    centralValues.day +
    "-" +
    centralValues.hour +
    centralValues.minute;
  const versionPath = path.join(root, "public", "version.json");
  fs.writeFileSync(versionPath, JSON.stringify({ version }, null, 2));
  console.log(`Generated version.json: ${version}`);
  console.log(`File location: ${versionPath}`);
  console.log(`UTC Time: ${now.toISOString()}`);
  console.log(`Central Time: ${centralFormatter.format(now)}`);
}

const splashPattern = /^splash_bg(\d+)\.png$/;
const bgImgPattern = /^bg_img(\d+)\.png$/;

function countInDir(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) return 0;
  const files = fs.readdirSync(dirPath).filter((f) => pattern.test(f));
  const nums = files.map((f) => parseInt(f.match(pattern)[1], 10));
  return nums.length ? Math.max(...nums) : 0;
}

export function writeSplashBgCount() {
  const stalenhagDir = path.join(root, "public", "img", "misc", "stalenhag_bg");
  const splashDir = path.join(root, "public", "img", "misc", "backgrounds");
  const stalenhag = countInDir(stalenhagDir, bgImgPattern);
  const splash = countInDir(splashDir, splashPattern);
  const outPath = path.join(root, "public", "data", "splash_bg_count.json");
  fs.writeFileSync(outPath, JSON.stringify({ stalenhag, splash }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeVersion();
  writeSplashBgCount();
}
