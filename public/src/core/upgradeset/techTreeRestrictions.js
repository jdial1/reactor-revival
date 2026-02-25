const OBJECTIVE_REQUIRED_UPGRADES = {
  improvedChronometers: ["chronometer"],
  investInResearch1: ["infused_cells", "unleashed_cells"],
};

export function isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId) {
  const objectives = upgradeset.game.objectives_manager?.objectives_data;
  if (!objectives?.length) return false;
  for (const obj of objectives) {
    if (obj.completed) continue;
    const checkId = obj.checkId;
    const required = OBJECTIVE_REQUIRED_UPGRADES[checkId];
    if (required?.includes(upgradeId)) return true;
    if (checkId === "experimentalUpgrade") {
      const upg = upgradeset.getUpgrade(upgradeId);
      if (upg?.upgrade?.type?.startsWith("experimental_")) return true;
    }
  }
  return false;
}

export function isUpgradeDoctrineLocked(upgradeset, upgradeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions) return false;
  if (!upgradeset.restrictedUpgrades.has(upgradeId)) return false;
  if (!upgradeset.game.tech_tree) return false;
  const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
  if (!allowedTrees || allowedTrees.has(upgradeset.game.tech_tree)) return false;
  if (isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId)) return false;
  return true;
}

export function isUpgradeAvailable(upgradeset, upgradeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions) return true;
  if (isUpgradeDoctrineLocked(upgradeset, upgradeId)) return false;
  if (!upgradeset.restrictedUpgrades.has(upgradeId)) return true;
  const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
  if (allowedTrees && allowedTrees.has(upgradeset.game.tech_tree)) return true;
  if (isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId)) return true;
  return false;
}

export function getExclusiveUpgradeIdsForTree(upgradeset, treeId) {
  if (!treeId) return [];
  return [...upgradeset.upgradeToTechTreeMap.entries()]
    .filter(([, treeSet]) => treeSet.size === 1 && treeSet.has(treeId))
    .map(([id]) => id);
}

export function resetDoctrineUpgradeLevels(upgradeset, treeId) {
  const ids = getExclusiveUpgradeIdsForTree(upgradeset, treeId);
  ids.forEach((upgradeId) => {
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) {
      upgrade.setLevel(0);
    }
  });
}

export function sanitizeDoctrineUpgradeLevelsOnLoad(upgradeset, techTreeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions || !techTreeId) return;
  upgradeset.upgradeToTechTreeMap.forEach((treeSet, upgradeId) => {
    if (treeSet.size !== 1 || treeSet.has(techTreeId)) return;
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) upgrade.setLevel(0);
  });
}
