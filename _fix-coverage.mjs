import fs from "fs";

const p = "tests/core/engine/coverage.test.js";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const oldHeader = `import { Game } from "@app/logic.js";
import { UI } from "@app/components/ui.js";
import { describe, it, expect, beforeEach, setupGame, toNum } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";

// Create a temporary game instance just to generate the list of tests.
// This is NOT the instance that will be used in the \`it\` blocks.
const mockUiForTestGen = new UI();
const testGenGame = new Game(mockUiForTestGen);
testGenGame.tileset.initialize();
testGenGame.partset.initialize();
testGenGame.upgradeset.initialize();
const allParts = testGenGame.partset.getAllParts();
const allUpgrades = testGenGame.upgradeset.getAllUpgrades();

describe("Full Part and Upgrade Coverage", () => {
  let game;
  beforeEach(async () => {
    // Use the proper async setup for each actual test to get a clean state
    game = await setupGame();
  });`;

const newHeader = `import { describe, it, expect, beforeEach, setupGame, toNum } from "../../helpers/setup.js";
import { patchGameState } from "@app/state.js";

describe("Full Part and Upgrade Coverage", async () => {
  const catalogGame = await setupGame();
  const allParts = catalogGame.partset.getAllParts();
  const allUpgrades = catalogGame.upgradeset.getAllUpgrades();
  let game;
  beforeEach(async () => {
    game = await setupGame();
  });`;

if (!s.includes("mockUiForTestGen")) {
  console.log("coverage header already updated");
  process.exit(0);
}
if (!s.includes(oldHeader.slice(0, 80))) {
  throw new Error("header mismatch");
}
s = s.replace(oldHeader, newHeader);
fs.writeFileSync(p, s);
console.log("coverage patched");
