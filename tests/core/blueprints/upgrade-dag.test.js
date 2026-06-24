import { expect, test } from "vitest";
import { bundledGameData } from "../../../public/src/bundledStaticData.js";

test("Upgrade dependency graph is acyclic", () => {
  const upgrades = bundledGameData.upgrades;
  const visited = new Set();
  const recursionStack = new Set();

  function checkCycle(upgradeId) {
    if (recursionStack.has(upgradeId)) {
      throw new Error(`Cycle detected at: ${upgradeId}`);
    }
    if (visited.has(upgradeId)) return;

    visited.add(upgradeId);
    recursionStack.add(upgradeId);

    const upgrade = upgrades.find((u) => u.id === upgradeId);
    if (upgrade?.erequires) {
      checkCycle(upgrade.erequires);
    }
    recursionStack.delete(upgradeId);
  }

  upgrades.forEach((u) => checkCycle(u.id));
  expect(true).toBe(true);
});
