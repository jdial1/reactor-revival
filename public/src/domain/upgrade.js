import { TechTreeSchema } from "../schema/index.js";
import { bundledGameData } from "../generated/bundledStaticData.js";
import { applyComputedModifiers } from "../bridge/bridge-mechanics.js";
import { calculateSectionCounts } from "./upgrade-sections.js";
import {
  runCheckAffordability,
  mergeSessionUpgradeLevel,
  projectUpgradeCosts,
  projectAllUpgradeCosts,
} from "../bridge/bridge-upgrades.js";
import { toDecimal, toNumber } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { getActiveBridge, requireActiveBridge } from "../bridge/active.js";
import { getPartImagePath } from "../core/part-images.js";
import { bumpSnapshotRev } from "../state/snapshot-rev.js";

const CELL_UPGRADE_EFFECTS = new Set(["cell_power", "cell_tick", "cell_perpetual"]);
const CATALOG_TRANSIENT_CLASSES = new Set(["hidden", "locked", "maxed"]);

const loadTechTree = () => TechTreeSchema.parse(bundledGameData.techTree);

const normalizeErequires = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

const catalogEntryToHostDef = (entry, game) => {
  const bridge = game.coreBridge;
  const storeDef = bridge?.session?.systems?.upgrades?.getDefinition?.(entry.id);
  const isEp = entry.currency === "ep" || entry.currency === "exotic_particles";
  const baseCost = storeDef?.baseCost ?? entry.baseCost ?? entry.cost ?? 0;
  const isCell = CELL_UPGRADE_EFFECTS.has(entry.effect);
  const part = entry.partId ? game.partset?.getPartById?.(entry.partId) : null;

  return {
    id: entry.id,
    type: isCell ? `${entry.effect}_upgrades` : (entry.type || entry.section || "other"),
    title: entry.displayTitle || entry.title,
    description: entry.description || "",
    levels: entry.maxLevel ?? storeDef?.maxLevel,
    cost: isEp ? 0 : baseCost,
    ecost: isEp ? baseCost : 0,
    multiplier: storeDef?.costMultiplier ?? entry.costMultiplier ?? 2,
    ecost_multiplier: storeDef?.costMultiplier ?? entry.costMultiplier ?? 2,
    actionId: isCell ? entry.effect : entry.id,
    erequires: normalizeErequires(entry.erequires),
    classList: (entry.classList || []).filter((cls) => !CATALOG_TRANSIENT_CLASSES.has(cls)),
    part: part || undefined,
    icon: entry.iconPath || entry.icon || (part
      ? getPartImagePath({ type: part.type, category: part.category, level: part.level, id: part.id })
      : null),
    visible: entry.visible,
    unlockVisible: entry.unlockVisible,
  };
};

const buildUpgradeDefsFromSession = (game) => {
  const bridge = requireActiveBridge(game, "UpgradeSet.initialize");
  const catalog = bridge.listUpgrades() || [];
  const defs = [];
  for (let i = 0; i < catalog.length; i++) {
    defs.push(catalogEntryToHostDef(catalog[i], game));
  }
  return defs;
};

export class Upgrade {
  constructor(upgrade_definition, game) {
    this.game = game;
    this.upgrade = upgrade_definition;

    this.id = upgrade_definition.id;
    this.title = upgrade_definition.title;
    this.description = upgrade_definition.description;
    this.base_cost = toDecimal(upgrade_definition.cost);
    this.cost_multiplier = upgrade_definition.multiplier ?? 1;
    this.max_level = upgrade_definition.levels ?? game.upgrade_max_level;
    this.type = upgrade_definition.type;
    this.category = upgrade_definition.category;
    this.erequires = upgrade_definition.erequires;
    this.base_ecost = toDecimal(upgrade_definition.ecost);
    this.ecost_multiplier = upgrade_definition.ecost_multiplier ?? 1;
    this.actionId = upgrade_definition.actionId;
    this.icon = upgrade_definition.icon;

    this.affordable = false;
    this.afford_progress = 0;
    this.level = 0;
    this.cost = toNumber(this.base_cost);
    this.ecost = toNumber(this.base_ecost);
    this.current_cost = this.base_cost;
    this.current_ecost = this.base_ecost;
    projectUpgradeCosts(this);
  }

  setLevel(level, opts = {}) {
    const bridge = getActiveBridge(this.game);
    if (bridge?.session && !opts.skipSessionSync) {
      const current = bridge.getUpgradeLevel(this.id);
      if (current !== level) {
        mergeSessionUpgradeLevel(bridge.session, this.id, level);
      }
    }

    this.level = level;
    projectUpgradeCosts(this);

    if (opts.deferSync) return;

    if (this.actionId === "chronometer") {
      this.game.loop_wait = this.game.base_loop_wait;
    }

    applyComputedModifiers(this.game);
    this.game.reactor?.updateStats?.();
    bumpSnapshotRev(this.game);
  }
}

export { isCellUpgradeVisible } from "./upgrade-visibility.js";

function isUpgradeAvailable(upgradeset, upgradeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions) return true;

  const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
  if (allowedTrees && allowedTrees.size > 0 && !allowedTrees.has(upgradeset.game.tech_tree)) {
    return false;
  }

  return requireActiveBridge(upgradeset.game, "isUpgradeAvailable").isUpgradeAvailable(upgradeId);
}

function getExclusiveUpgradeIdsForTree(upgradeset, treeId) {
  if (!treeId) return [];
  const trees = upgradeset.techTrees;
  if (!trees || trees.length <= 1) return [];

  return [...upgradeset.upgradeToTechTreeMap.entries()]
    .filter(([, treeSet]) => treeSet.size === 1 && treeSet.has(treeId))
    .map(([id]) => id);
}

function resetDoctrineUpgradeLevels(upgradeset, treeId) {
  const ids = getExclusiveUpgradeIdsForTree(upgradeset, treeId);
  ids.forEach((upgradeId) => {
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) {
      upgrade.setLevel(0);
    }
  });
}

function sanitizeDoctrineUpgradeLevelsOnLoad(upgradeset, techTreeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions || !techTreeId) return;

  let changed = false;
  upgradeset.upgradeToTechTreeMap.forEach((treeSet, upgradeId) => {
    if (treeSet.size !== 1 || treeSet.has(techTreeId)) return;
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) {
      upgrade.setLevel(0);
      changed = true;
    }
  });

  if (changed) {
    upgradeset.game.coreBridge?.hydrateFromHost?.();
  }
}

function runPurchaseUpgradeToMax(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.isUpgradeAvailable(upgradeId)) return 0;

  let count = 0;
  while (upgrade.level < upgrade.max_level && upgradeset.purchaseUpgrade(upgradeId)) {
    count++;
  }
  return count;
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
    this.upgradeToTechTreeMap = new Map();
    this.techTrees = [];
    this.restrictedUpgrades = new Set();
    this._populateSectionFn = null;
  }

  setPopulateSectionFn(fn) {
    this._populateSectionFn = fn;
  }

  async initialize() {
    const techTree = loadTechTree();
    this.techTrees = techTree;

    this.reset();
    this.upgradeToTechTreeMap.clear();
    techTree.forEach((tree) => {
      tree.upgrades.forEach((upgId) => {
        if (!this.upgradeToTechTreeMap.has(upgId)) {
          this.upgradeToTechTreeMap.set(upgId, new Set());
        }
        this.upgradeToTechTreeMap.get(upgId).add(tree.id);
      });
    });

    const data = buildUpgradeDefsFromSession(this.game);
    logger.log("debug", "game", "Upgrade data loaded:", data?.length, "upgrades");

    data.forEach((upgradeDef) => {
      const upgradeInstance = new Upgrade(upgradeDef, this.game);
      this.upgrades.set(upgradeInstance.id, upgradeInstance);
      this.upgradesArray.push(upgradeInstance);
    });
    projectAllUpgradeCosts(this);

    return this.upgradesArray;
  }

  reset() {
    this.upgrades.clear();
    this.upgradesArray = [];
  }

  getUpgrade(id) {
    return this.upgrades.get(id);
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
    const bridge = getActiveBridge(this.game);
    if (!bridge?.session) return false;
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade) return false;
    if (!bridge.session.systems?.upgrades?.getDefinition?.(upgradeId)) return false;
    const before = upgrade.level ?? 0;
    const dispatchResult = bridge.dispatch({ type: "PURCHASE_UPGRADE", payload: { id: upgradeId } });
    const after = bridge.session.getUpgradeLevel?.(upgradeId) ?? 0;
    if (!dispatchResult.ok || !(after > before)) return false;
    projectUpgradeCosts(upgrade);
    this.game.syncModifiersFromUpgrades?.();
    this.updateSectionCounts();
    void this.game.saveManager?.autoSave?.();
    return true;
  }

  purchaseUpgradeToMax(upgradeId) {
    return runPurchaseUpgradeToMax(this, upgradeId);
  }

  check_affordability(game) {
    runCheckAffordability(this, game);
  }

  isUpgradeAvailable(upgradeId) {
    return isUpgradeAvailable(this, upgradeId);
  }

  isUpgradeDoctrineLocked(upgradeId) {
    return !this.isUpgradeAvailable(upgradeId);
  }

  getExclusiveUpgradeIdsForTree(treeId) {
    return getExclusiveUpgradeIdsForTree(this, treeId);
  }

  resetDoctrineUpgradeLevels(treeId) {
    resetDoctrineUpgradeLevels(this, treeId);
    this.updateSectionCounts();
  }

  sanitizeDoctrineUpgradeLevelsOnLoad(techTreeId) {
    sanitizeDoctrineUpgradeLevelsOnLoad(this, techTreeId);
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
