import { isCellUpgradeVisible } from "./domain/upgrade.js";

function getUpgradeContainerIdForSection(upgrade) {
  if (upgrade.base_ecost?.gt?.(0)) {
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
  let affordable = 0;
  const isUpgradeAvailable = (id) => upgradeset.isUpgradeAvailable(id);
  const upgradesArray = upgradeset.upgradesArray;
  const game = upgradeset.game;

  groupIds.forEach((groupId) => {
    const upgrades = upgradesArray.filter((upgrade) => {
      if (!includeUpgrade(upgrade)) return false;
      if (!isUpgradeAvailable(upgrade.id)) return false;
      const containerId = getUpgradeContainerIdForSection(upgrade);
      if (containerId !== groupId) return false;
      if (!isCellUpgradeVisible(upgrade, game)) return false;
      return true;
    });

    upgrades.forEach((upgrade) => {
      total += upgrade.max_level;
      researched += upgrade.level;
      if (upgrade.level < upgrade.max_level && upgrade.affordable) affordable += 1;
    });
  });

  return { total, researched, affordable };
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
    if (groupIds.length === 0) return { ...section, total: 0, researched: 0, affordable: 0 };
    const includeUpgrade = section.isResearch
      ? (u) => u.base_ecost.gt && u.base_ecost.gt(0)
      : (u) => !(u.base_ecost.gt && u.base_ecost.gt(0));
    const { total, researched, affordable } = countUpgradesInGroupsWithFilter(upgradeset, groupIds, includeUpgrade);
    return { ...section, total, researched, affordable };
  });
}

export function findTopAffordableInSection(upgradeset, sectionName) {
  const groupIds = getSectionUpgradeGroups(sectionName);
  if (!groupIds.length || !upgradeset?.upgradesArray) return null;
  const section = UPGRADE_SECTIONS.find((s) => s.name === sectionName);
  const includeUpgrade = section?.isResearch
    ? (u) => u.base_ecost?.gt?.(0)
    : (u) => !(u.base_ecost?.gt?.(0));
  let best = null;
  for (const upgrade of upgradeset.upgradesArray) {
    if (!includeUpgrade(upgrade)) continue;
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) continue;
    if (!isCellUpgradeVisible(upgrade, upgradeset.game)) continue;
    const containerId = getUpgradeContainerIdForSection(upgrade);
    if (!groupIds.includes(containerId)) continue;
    if (upgrade.level >= upgrade.max_level || !upgrade.affordable) continue;
    if (!best || getUpgradeSortCost(upgrade) < getUpgradeSortCost(best)) best = upgrade;
  }
  return best;
}

function getUpgradeSortCost(upgrade) {
  const cost = upgrade.base_ecost?.gt?.(0) ? upgrade.current_ecost : upgrade.current_cost;
  return typeof cost?.toNumber === "function" ? cost.toNumber() : Number(cost) || 0;
}
