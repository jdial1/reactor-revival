#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "public", "data");
const outPath = path.join(root, "public", "src", "bundledStaticData.js");

const pairs = [
  ["part_list.json", "parts"],
  ["upgrade_list.json", "upgrades"],
  ["tech_tree.json", "techTree"],
  ["objective_list.json", "objectives"],
  ["achievement_list.json", "achievements"],
  ["difficulty_curves.json", "difficulty"],
  ["help_text.json", "helpText"],
  ["settings_help.json", "settingsHelp"],
  ["flavor_text.json", "flavorText"],
  ["splash_bg_count.json", "splashBgCount"],
  ["changelog.json", "changelog"],
  ["failure_flavor.json", "failureFlavor"],
];

const bundled = {};
for (const [file, key] of pairs) {
  const raw = fs.readFileSync(path.join(dataDir, file), "utf8");
  bundled[key] = JSON.parse(raw);
}

const body = `export const bundledGameData = Object.freeze(${JSON.stringify(bundled)});\n`;
fs.writeFileSync(outPath, body, "utf8");
console.log(`Wrote ${outPath}`);
