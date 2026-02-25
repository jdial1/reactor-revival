import { runCheckAffordability } from "../../../core/upgradeset/affordabilityChecker.js";

function shouldSkipCellUpgrade(upgrade, upgradeset) {
  try {
    const upgType = upgrade?.upgrade?.type || "";
    const basePart = upgrade?.upgrade?.part;
    const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
    if (isCellUpgrade && basePart && basePart.category === "cell") {
      const show =
        upgradeset.game?.unlockManager && typeof upgradeset.game.unlockManager.isPartUnlocked === "function"
          ? upgradeset.game.unlockManager.isPartUnlocked(basePart)
          : true;
      return !show;
    }
  } catch (_) {}
  return false;
}

function mountUpgradeAndUpdateCost(upgrade, upgradeset) {
  upgrade.$el = null;
  upgradeset.game.emit?.("upgradeAdded", { upgrade, game: upgradeset.game });
  if (upgrade.$el) upgrade.updateDisplayCost();
}

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper) return;

  wrapper.querySelectorAll(".upgrade-group").forEach((el) => (el.innerHTML = ""));

  upgradeset.upgradesArray.filter(filterFn).forEach((upgrade) => {
    const available = upgradeset.isUpgradeAvailable(upgrade.id);
    if (available && shouldSkipCellUpgrade(upgrade, upgradeset)) return;
    mountUpgradeAndUpdateCost(upgrade, upgradeset);
  });

  if (upgradeset.game) runCheckAffordability(upgradeset, upgradeset.game);
}
