import fs from "fs";

const p = "tests/core/engine/coverage.test.js";
let s = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

s = s.replace(
  `describe("Full Part and Upgrade Coverage", async () => {
  const catalogGame = await setupGame();
  const allParts = catalogGame.partset.getAllParts();
  const allUpgrades = catalogGame.upgradeset.getAllUpgrades();
  let game;
  beforeEach(async () => {
    game = await setupGame();
  });`,
  `const coverageCatalog = await setupGame();
const allParts = coverageCatalog.partset.getAllParts();
const allUpgrades = coverageCatalog.upgradeset.getAllUpgrades();

describe("Full Part and Upgrade Coverage", () => {
  let game;
  beforeEach(async () => {
    game = await setupGame();
  });`,
);

fs.writeFileSync(p, s);
console.log("hoisted catalog", s.startsWith("import"));
