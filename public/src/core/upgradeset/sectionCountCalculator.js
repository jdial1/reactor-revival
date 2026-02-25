function getUpgradeContainerId(upgrade) {
  if (upgrade.base_ecost && upgrade.base_ecost.gt(0)) {
    return upgrade.upgrade.type;
  }
  const normalizeKey = (key) => {
    if (key.endsWith("_upgrades")) return key;
    const map = {
      cell_power: "cell_power_upgrades",
      cell_tick: "cell_tick_upgrades",
      cell_perpetual: "cell_perpetual_upgrades",
      exchangers: "exchanger_upgrades",
      vents: "vent_upgrades",
      other: "other_upgrades",
    };
    return map[key] || key;
  };
  return normalizeKey(upgrade.upgrade.type);
}

function getSectionUpgradeGroups(sectionName) {
  const sectionMap = {
    "Cell Upgrades": ["cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades"],
    "Cooling Upgrades": ["vent_upgrades", "exchanger_upgrades"],
    "General Upgrades": ["other_upgrades"],
    "Laboratory": ["experimental_laboratory"],
    "Global Boosts": ["experimental_boost"],
    "Experimental Parts & Cells": ["experimental_parts", "experimental_cells", "experimental_cells_boost"],
    "Particle Accelerators": ["experimental_particle_accelerators"],
  };
  return sectionMap[sectionName] || [];
}

function countUpgradesInGroupsWithFilter(upgradeset, groupIds, includeUpgrade) {
  let total = 0;
  let researched = 0;
  const isUpgradeAvailable = (id) => upgradeset.isUpgradeAvailable(id);
  const upgradesArray = upgradeset.upgradesArray;
  const game = upgradeset.game;

  groupIds.forEach((groupId) => {
    const upgrades = upgradesArray.filter((upgrade) => {
      if (!includeUpgrade(upgrade)) return false;
      if (!isUpgradeAvailable(upgrade.id)) return false;
      const containerId = getUpgradeContainerId(upgrade);
      if (containerId !== groupId) return false;
      const upgType = upgrade?.upgrade?.type || "";
      const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
      if (isCellUpgrade) {
        const basePart = upgrade?.upgrade?.part;
        if (basePart && basePart.category === "cell") {
          if (game?.unlockManager && typeof game.unlockManager.isPartUnlocked === "function") {
            return game.unlockManager.isPartUnlocked(basePart);
          }
          return true;
        }
      }
      return true;
    });

    upgrades.forEach((upgrade) => {
      total += upgrade.max_level;
      researched += upgrade.level;
    });
  });

  return { total, researched };
}

const UPGRADE_SECTIONS = [
  { name: "Cell Upgrades", isResearch: false },
  { name: "Cooling Upgrades", isResearch: false },
  { name: "General Upgrades", isResearch: false },
  { name: "Laboratory", isResearch: true },
  { name: "Global Boosts", isResearch: true },
  { name: "Experimental Parts & Cells", isResearch: true },
  { name: "Particle Accelerators", isResearch: true },
];

export function calculateSectionCounts(upgradeset) {
  return UPGRADE_SECTIONS.map((section) => {
    const groupIds = getSectionUpgradeGroups(section.name);
    if (groupIds.length === 0) return { ...section, total: 0, researched: 0 };
    const includeUpgrade = section.isResearch
      ? (u) => u.base_ecost.gt && u.base_ecost.gt(0)
      : (u) => !(u.base_ecost.gt && u.base_ecost.gt(0));
    const { total, researched } = countUpgradesInGroupsWithFilter(upgradeset, groupIds, includeUpgrade);
    return { ...section, total, researched };
  });
}
