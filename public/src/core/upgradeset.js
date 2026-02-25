import { Upgrade } from "./upgrade.js";
import { logger } from "../utils/logger.js";
import { generateCellUpgrades } from "./upgradeCellGenerator.js";
import { runCheckAffordability } from "./upgradeset/affordabilityChecker.js";
import dataService from "../services/dataService.js";
import {
  isUpgradeAvailable as checkUpgradeAvailable,
  isUpgradeDoctrineLocked as checkUpgradeDoctrineLocked,
  getExclusiveUpgradeIdsForTree as fetchExclusiveUpgradeIdsForTree,
  resetDoctrineUpgradeLevels as runResetDoctrineUpgradeLevels,
  sanitizeDoctrineUpgradeLevelsOnLoad as runSanitizeDoctrineUpgradeLevelsOnLoad,
} from "./upgradeset/techTreeRestrictions.js";
import { calculateSectionCounts } from "./upgradeset/sectionCountCalculator.js";
import {
  runPurchaseUpgrade as doPurchaseUpgrade,
  runPurchaseUpgradeToMax as doPurchaseUpgradeToMax,
  runPurchaseAllUpgrades as doPurchaseAllUpgrades,
  runPurchaseAllResearch as doPurchaseAllResearch,
  runClearAllUpgrades as doClearAllUpgrades,
  runClearAllResearch as doClearAllResearch,
  runResetUpgradeLevel as doResetUpgradeLevel,
} from "./upgradeset/upgradeTransactionProcessor.js";

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
    this.upgradeToTechTreeMap = new Map();
    this.restrictedUpgrades = new Set();
    this._populateSectionFn = null;
  }

  setPopulateSectionFn(fn) {
    this._populateSectionFn = fn;
  }

  async initialize() {
    const { upgrades, techTree } = await dataService.ensureAllGameDataLoaded();
    const data = upgrades;
    const treeData = techTree?.default || techTree || [];
    this.reset();
    this.treeList = treeData;
    treeData.forEach(tree => {
      if (tree.upgrades) {
        tree.upgrades.forEach(upgradeId => {
          if (!this.upgradeToTechTreeMap.has(upgradeId)) {
            this.upgradeToTechTreeMap.set(upgradeId, new Set());
          }
          this.upgradeToTechTreeMap.get(upgradeId).add(tree.id);
          this.restrictedUpgrades.add(upgradeId);
        });
      }
    });

    logger.log('debug', 'game', 'Upgrade data loaded:', data?.length, "upgrades");

    const fullUpgradeList = [...data, ...generateCellUpgrades(this.game)];

    fullUpgradeList.forEach((upgradeDef) => {
      const upgradeInstance = new Upgrade(upgradeDef, this.game);
      this.upgrades.set(upgradeInstance.id, upgradeInstance);
      this.upgradesArray.push(upgradeInstance);
    });

    return this.upgradesArray;
  }


  reset() {
    this.upgrades.clear();
    this.upgradesArray = [];
  }

  getUpgrade(id) {
    return this.upgrades.get(id);
  }

  getDoctrineForUpgrade(upgradeId) {
    const treeIds = this.upgradeToTechTreeMap.get(upgradeId);
    if (!treeIds || treeIds.size !== 1) return null;
    const treeId = [...treeIds][0];
    const tree = (this.treeList || []).find(t => t.id === treeId);
    return tree ? { id: tree.id, icon: tree.icon, title: tree.title } : null;
  }

  getAllUpgrades() {
    return this.upgradesArray;
  }

  getUpgradesByType(type) {
    return this.upgradesArray.filter((upgrade) => upgrade.upgrade.type === type);
  }

  populateUpgrades() {
    this._populateUpgradeSection("upgrades_content_wrapper", (upgrade) => upgrade.base_ecost.eq ? upgrade.base_ecost.eq(0) : !upgrade.base_ecost);
    this.updateSectionCounts();
  }

  populateExperimentalUpgrades() {
    this._populateUpgradeSection("experimental_upgrades_content_wrapper", (upgrade) => upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
    this.updateSectionCounts();
  }

  _populateUpgradeSection(wrapperId, filterFn) {
    if (this._populateSectionFn) this._populateSectionFn(this, wrapperId, filterFn);
  }

  purchaseUpgrade(upgradeId) {
    return doPurchaseUpgrade(this, upgradeId);
  }

  purchaseUpgradeToMax(upgradeId) {
    return doPurchaseUpgradeToMax(this, upgradeId);
  }

  purchaseAllUpgrades() {
    doPurchaseAllUpgrades(this);
  }

  purchaseAllResearch() {
    doPurchaseAllResearch(this);
  }

  clearAllUpgrades() {
    doClearAllUpgrades(this);
  }

  clearAllResearch() {
    doClearAllResearch(this);
  }

  resetUpgradeLevel(upgradeId) {
    doResetUpgradeLevel(this, upgradeId);
  }

  check_affordability(game) {
    runCheckAffordability(this, game);
  }

  isUpgradeAvailable(upgradeId) {
    return checkUpgradeAvailable(this, upgradeId);
  }

  isUpgradeDoctrineLocked(upgradeId) {
    return checkUpgradeDoctrineLocked(this, upgradeId);
  }

  getExclusiveUpgradeIdsForTree(treeId) {
    return fetchExclusiveUpgradeIdsForTree(this, treeId);
  }

  resetDoctrineUpgradeLevels(treeId) {
    runResetDoctrineUpgradeLevels(this, treeId);
    this.updateSectionCounts();
  }

  sanitizeDoctrineUpgradeLevelsOnLoad(techTreeId) {
    runSanitizeDoctrineUpgradeLevelsOnLoad(this, techTreeId);
  }

  hasAffordableUpgrades() {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    return this.upgradesArray.some((upgrade) =>
      (upgrade.base_ecost.eq ? upgrade.base_ecost.eq(0) : !upgrade.base_ecost) &&
      !expandUpgradeIds.includes(upgrade.id) &&
      upgrade.affordable &&
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  hasAffordableResearch() {
    return this.upgradesArray.some((upgrade) => 
      upgrade.base_ecost.gt && upgrade.base_ecost.gt(0) && 
      upgrade.affordable && 
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  getSectionCounts() {
    return calculateSectionCounts(this);
  }

  updateSectionCounts() {
    this.game?.emit?.("upgradesChanged");
  }

  toSaveState() {
    return this.upgradesArray
      .filter((upg) => upg.level > 0)
      .map((upg) => ({
        id: upg.id,
        level: upg.level,
      }));
  }
}
