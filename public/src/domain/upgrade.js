import { TechTreeSchema } from "../schema/index.js";
import { bundledGameData } from "../generated/bundledStaticData.js";
import { applyComputedModifiers } from "../bridge/bridge-mechanics.js";
import { calculateSectionCounts } from "./upgrade-sections.js";
import { runCheckAffordability } from "../bridge/bridge-upgrades.js";
import { toDecimal, toNumber, getDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../core/numbers.js";
import { logger } from "../core/logger.js";
import { MAX_PART_VARIANTS } from "../constants/balance.js";
import { bumpGridPartsRevision } from "../bridge/bridge-grid-sync.js";
import { getActiveBridge, requireActiveBridge } from "../bridge/active.js";

const Decimal = getDecimal();

const CELL_UPGRADE_EFFECTS = new Set(["cell_power", "cell_tick", "cell_perpetual"]);
const CATALOG_TRANSIENT_CLASSES = new Set(["hidden", "locked", "maxed"]);

const loadTechTree = () => TechTreeSchema.parse(bundledGameData.techTree);

const normalizeErequires = (raw) => {
  if (Array.isArray(raw)) return raw[0] || null;
  return raw || null;
};

const catalogEntryToHostDef = (entry, game) => {
  const bridge = game.coreBridge;
  const storeDef = bridge.session?.systems?.upgrades?.getDefinition?.(entry.id);
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
    icon: entry.iconPath || entry.icon || (typeof part?.getImagePath === "function" ? part.getImagePath() : null),
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

const needsPartStatSync = (upgrade) => {
  const actionId = upgrade?.actionId || "";
  const type = upgrade?.type || upgrade?.upgrade?.type || "";
  const id = upgrade?.id || "";
  if (type.includes("cell") || id.includes("_cell_") || actionId.includes("cell")) return true;
  if (actionId === "perpetual_reflectors" || actionId === "perpetual_capacitors") return true;
  return false;
};

const syncUpgradeDerivedEffects = (game, upgrade) => {
  if (!game || !upgrade) return;
  bumpGridPartsRevision(game.tileset);
  const pid = upgrade.upgrade?.part?.id;
  if (pid && String(upgrade.id || "").endsWith("_cell_perpetual")) {
    const p = game.partset.getPartById(pid);
    if (p) p.perpetual = upgrade.level > 0;
  }
  const perpetualReflectors = (game.upgradeset.getUpgrade("perpetual_reflectors")?.level ?? 0) > 0;
  for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
    const rp = game.partset.getPartById(`reflector${i}`);
    if (rp) rp.perpetual = perpetualReflectors;
  }
  if (upgrade.type?.includes?.("cell")) game.update_cell_power?.();
  game.reactor?.updateStats?.();
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
    this.level = 0;
    this.current_cost = this.base_cost;
    this.current_ecost = this.base_ecost;
    this.affordable = false;
    this.afford_progress = 0;
    this.$el = null;
    this.$levels = null;
    this.display_cost = "";
    this.updateDisplayCost();
  }

  get cost() {
    return toNumber(this.base_cost);
  }

  get ecost() {
    return toNumber(this.base_ecost);
  }

  setLevel(level, opts = {}) {
    if (this.level !== level) {
      this.level = level;
      this.updateDisplayCost();
      this._syncDisplayToState();
      if (this.actionId === "chronometer") {
        this.game.loop_wait = this.game.base_loop_wait;
        this.game.emit?.("statePatch", { loop_wait: this.game.loop_wait });
      } else if (needsPartStatSync(this)) {
        syncUpgradeDerivedEffects(this.game, this);
      }
    }
    const bridge = getActiveBridge(this.game);
    if (bridge?.session?.setUpgradeLevels && !opts.skipSessionSync) {
      const sessLevel = bridge.session.getUpgradeLevel?.(this.id) ?? 0;
      if (sessLevel !== this.level) {
        const entries = (this.game.upgradeset?.toSaveState?.() || []).map((e) => ({ id: e.id, level: e.level }));
        const idx = entries.findIndex((e) => e.id === this.id);
        if (this.level > 0) {
          if (idx >= 0) entries[idx].level = this.level;
          else entries.push({ id: this.id, level: this.level });
        } else if (idx >= 0) {
          entries.splice(idx, 1);
        }
        bridge.session.setUpgradeLevels(entries);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
    if (!opts.deferSync) {
      applyComputedModifiers(this.game);
    }
    this.game.reactor?.updateStats?.();
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
    }
  }

  setAffordProgress(progress) {
    this.afford_progress = progress;
  }

  updateDisplayCost() {
    const bridge = requireActiveBridge(this.game, "updateDisplayCost");
    const preview = bridge.previewUpgrade(this.id);
    if (!preview) return;
    if (preview.reason === "max_level" || this.level >= this.max_level) {
      this.display_cost = "MAX";
      this.current_cost = Decimal.MAX_VALUE;
      this.current_ecost = Decimal.MAX_VALUE;
    } else {
      const costDec = preview.costDecimal != null
        ? toDecimal(preview.costDecimal)
        : toDecimal(preview.cost);
      const isEp = preview.currency === "ep" || preview.currency === "exotic_particles";
      if (isEp) {
        this.current_ecost = costDec;
        this.current_cost = toDecimal(0);
        this.display_cost = `${fmt(this.current_ecost)} EP`;
      } else {
        this.current_cost = costDec;
        this.current_ecost = toDecimal(0);
        this.display_cost = `$${fmt(this.current_cost)}`;
      }
    }
    this._syncDisplayToState();
  }

  _syncDisplayToState() {
    const st = this.game?.state?.upgrade_display;
    if (st) st[this.id] = { level: this.level, display_cost: this.display_cost };
  }

  getCost() {
    return this.current_cost;
  }

  getEcost() {
    return this.current_ecost || 0;
  }
}

export function isCellUpgradeVisible(upgrade, game) {
  const upgType = upgrade?.upgrade?.type || "";
  const basePart = upgrade?.upgrade?.part;
  const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
  if (!isCellUpgrade || !basePart || basePart.category !== "cell") return true;
  const unlockManager = game?.unlockManager;
  if (unlockManager && typeof unlockManager.isPartUnlocked === "function") {
    return unlockManager.isPartUnlocked(basePart);
  }
  return true;
}

const OBJECTIVE_REQUIRED_UPGRADES = {
  improvedChronometers: ["chronometer"],
  investInResearch1: ["infused_cells", "unleashed_cells"],
};

function isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId) {
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
  if (!upgradeset.treeList || upgradeset.treeList.length <= 1) return [];
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
  upgradeset.upgradeToTechTreeMap.forEach((treeSet, upgradeId) => {
    if (treeSet.size !== 1 || treeSet.has(techTreeId)) return;
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) upgrade.setLevel(0);
  });
}

function runPurchaseUpgradeToMax(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.isUpgradeAvailable(upgradeId)) return 0;
  let count = 0;
  while (upgrade.level < upgrade.max_level && this.purchaseUpgrade(upgradeId)) {
    count++;
  }
  return count;
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
    this.upgradeToTechTreeMap = new Map(); // upgradeId -> Set of treeIds
    this.techTrees = []; // Store raw doctrine data
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
    if (!bridge) return false;
    const before = this.getUpgrade(upgradeId)?.level ?? 0;
    bridge.purchaseUpgrade(upgradeId);
    return (this.getUpgrade(upgradeId)?.level ?? 0) > before;
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
