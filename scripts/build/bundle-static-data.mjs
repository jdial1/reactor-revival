#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const revivalDir = path.join(root, "game-data", "reactor_revival");
const dataDir = path.join(root, "public", "data");
const outPath = path.join(root, "public", "src", "generated", "bundledStaticData.js");

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
}

function readRevivalJson(name) {
  return JSON.parse(fs.readFileSync(path.join(revivalDir, name), "utf8"));
}

function loadRevivalResearch() {
  try {
    return readRevivalJson("research.json");
  } catch {
    return {};
  }
}

const research = fs.existsSync(revivalDir) ? loadRevivalResearch() : null;

const bundled = research
  ? {
      parts: readJson("part_list.json"),
      upgrades: readJson("upgrade_list.json"),
      techTree: research.techTree,
      objectives: research.objectives,
      achievements: research.achievements,
      difficulty: research.difficulty,
      helpText: research.presentation?.helpText ?? readJson("help_text.json"),
      flavorText: research.presentation?.flavorText ?? readJson("flavor_text.json"),
      failureFlavor: research.presentation?.failureFlavor ?? readJson("failure_flavor.json"),
      splashBgCount: readJson("splash_bg_count.json"),
      changelog: readJson("changelog.json"),
    }
  : {};

if (!research) {
  const pairs = [
    ["part_list.json", "parts"],
    ["upgrade_list.json", "upgrades"],
    ["tech_tree.json", "techTree"],
    ["objective_list.json", "objectives"],
    ["achievement_list.json", "achievements"],
    ["difficulty_curves.json", "difficulty"],
    ["help_text.json", "helpText"],
    ["flavor_text.json", "flavorText"],
    ["splash_bg_count.json", "splashBgCount"],
    ["changelog.json", "changelog"],
    ["failure_flavor.json", "failureFlavor"],
  ];
  for (const [file, key] of pairs) {
    bundled[key] = readJson(file);
  }
}

const body = `export const bundledGameData = Object.freeze(${JSON.stringify(bundled)});\n`;
fs.writeFileSync(outPath, body, "utf8");
console.log(`Wrote ${outPath}`);
