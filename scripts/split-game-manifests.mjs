#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const gamesRoot = path.join(root, "game-data");

const RESEARCH_KEYS = ["techTree", "objectives", "achievements", "difficulty", "presentation"];

function splitGame(gameId) {
  const gameDir = path.join(gamesRoot, gameId);
  const dataPath = path.join(gameDir, "data.json");
  if (!fs.existsSync(dataPath)) return;

  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const parts = { components: data.components ?? [] };
  const upgrades = data.upgrades ?? [];
  const research = {};
  for (const key of RESEARCH_KEYS) {
    if (data[key] != null) research[key] = data[key];
  }

  const base = { ...data };
  delete base.components;
  delete base.upgrades;
  for (const key of RESEARCH_KEYS) delete base[key];

  fs.writeFileSync(path.join(gameDir, "parts.json"), `${JSON.stringify(parts, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(gameDir, "upgrades.json"), `${JSON.stringify(upgrades, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(gameDir, "research.json"), `${JSON.stringify(research, null, 2)}\n`, "utf8");
  fs.writeFileSync(dataPath, `${JSON.stringify(base, null, 2)}\n`, "utf8");
  console.log(`Split ${gameId}: ${parts.components.length} parts, upgrades=${Array.isArray(upgrades) ? upgrades.length : Object.keys(upgrades).length} keys, research=${Object.keys(research).length} keys`);
}

for (const gameId of fs.readdirSync(gamesRoot)) {
  const stat = fs.statSync(path.join(gamesRoot, gameId));
  if (stat.isDirectory()) splitGame(gameId);
}
