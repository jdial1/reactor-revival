import { z } from "zod";
import { UpgradeDefinitionSchema, TechTreeSchema } from "../schema/index.js";
import { bundledGameData } from "../bundledStaticData.js";
import { applyComputedModifiers } from "./modifiers.js";
import { calculateSectionCounts } from "../logic-upgrade-sections.js";
import { runCheckAffordabilityCore, runCheckAffordability, computeAffordable } from "../domain/upgrade-affordance.js";
import { debitMoney, debitExoticParticles } from "./economy-intents.js";
import { toDecimal, toNumber, getDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { MAX_PART_VARIANTS } from "../constants/balance.js";

const Decimal = getDecimal();

function loadUpgradeTemplates() {
  const data = z.array(UpgradeDefinitionSchema).parse(bundledGameData.upgrades);
  const techTree = TechTreeSchema.parse(bundledGameData.techTree);
  return { upgrades: data, techTree };
}

const UPGRADE_ACTION_NO_PART_SYNC = new Set([
  "forceful_fusion",
  "heat_control_operator",
  "heat_outlet_control_operator",
  "expand_reactor_rows",
  "expand_reactor_cols",
  "improved_piping",
  "perpetual_capacitors",
  "reinforced_heat_exchangers",
  "active_exchangers",
  "improved_heatsinks",
  "active_venting",
  "stirling_generators",
  "emergency_coolant",
  "reflector_cooling",
  "manual_override",
  "convective_airflow",
  "electro_thermal_conversion",
  "thermal_feedback",
  "volatile_tuning",
  "auto_sell_operator",
  "auto_buy_operator",
  "protium_cells",
  "full_spectrum_reflectors",
  "fluid_hyperdynamics",
  "fractal_piping",
  "ultracryonics",
  "unstable_protium",
]);

import { bumpGridPartsRevision } from "./part-classification.js";

export function syncUpgradeDerivedEffects(game, upgrade) {
  if (!game || !upgrade) return;
  bumpGridPartsRevision(game.tileset);
  game.partset?.partsArray?.forEach?.((p) => p.recalculate_stats?.());
  game.tileset?.active_tiles_list?.forEach?.((tile) => {
    if (tile.part) tile.part.recalculate_stats();
  });
  const pid = upgrade.upgrade?.part?.id;
  if (pid) {
    const p = game.partset.getPartById(pid);
    if (p) {
      if (String(upgrade.id || "").endsWith("_cell_perpetual")) p.perpetual = upgrade.level > 0;
      p.recalculate_stats();
    }
  }
  for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
    const rp = game.partset.getPartById(`reflector${i}`);
    if (rp) {
      rp.perpetual = (game.upgradeset.getUpgrade("perpetual_reflectors")?.level ?? 0) > 0;
      rp.recalculate_stats();
    }
  }
  if (upgrade.id === "uranium1_cell_tick") {
    const part = game.partset.getPartById("uranium1");
    if (part) part.ticks = part.base_ticks * Math.pow(2, upgrade.level);
  }
  if (upgrade.id === "uranium1_cell_perpetual") {
    const part = game.partset.getPartById("uranium1");
    if (part) part.perpetual = true;
  }
  game.statDispatcher?.derive();
  if (upgrade.type?.includes?.("cell")) game.update_cell_power?.();
  game.reactor?.updateStats?.();
}

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
      } else if (this.actionId && !UPGRADE_ACTION_NO_PART_SYNC.has(this.actionId)) {
        syncUpgradeDerivedEffects(this.game, this);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
    if (!opts.deferSync) {
      applyComputedModifiers(this.game);
    }
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
    this.current_ecost = this.base_ecost.mul(Decimal.pow(this.ecost_multiplier, this.level));
    this.current_cost = this.base_cost.mul(Decimal.pow(this.cost_multiplier, this.level));

    if (this.level >= this.max_level) {
      this.display_cost = "MAX";
      this.current_cost = Decimal.MAX_VALUE;
      this.current_ecost = Decimal.MAX_VALUE;
    } else {
      this.display_cost = this.base_ecost.gt(0) ? `${fmt(this.current_ecost)} EP` : `$${fmt(this.current_cost)}`;
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

const CELL_UPGRADE_TEMPLATES = [
  { type: "cell_power", title: "Potent ", description: "s: +100% power.", actionId: "cell_power" },
  { type: "cell_tick", title: "Enriched ", description: "s: 2x duration.", actionId: "cell_tick" },
  { type: "cell_perpetual", title: "Perpetual ", description: "s: auto-replace at 1.5x normal price.", levels: 1, actionId: "cell_perpetual" },
];

function generateCellUpgrades(game) {
  const generatedUpgrades = [];
  const allParts = game.partset.getAllParts();
  logger.log('debug', 'game', 'All parts:', allParts.map((p) => ({ id: p.id, level: p.level, hasCost: !!p.part.cell_tick_upgrade_cost })));
  const baseCellParts = allParts.filter((p) => p.part.cell_tick_upgrade_cost && p.level === 1);
  logger.log('debug', 'game', 'Base cell parts for upgrades:', baseCellParts.map((p) => p.id));
  for (const template of CELL_UPGRADE_TEMPLATES) {
    for (const part of baseCellParts) {
      const upgradeDef = {
        id: `${part.id}_${template.type}`,
        type: `${template.type}_upgrades`,
        title: template.title + part.title,
        description: part.title + template.description,
        levels: template.levels,
        cost: part.part[`${template.type}_upgrade_cost`],
        multiplier: part.part[`${template.type}_upgrade_multi`],
        actionId: template.actionId,
        classList: [part.id, template.type],
        part: part,
        icon: part.getImagePath(),
      };
      logger.log('debug', 'game', `Generated upgrade: ${upgradeDef.id} with cost: ${upgradeDef.cost}`);
      generatedUpgrades.push(upgradeDef);
    }
  }
  logger.log('debug', 'game', 'Total generated upgrades:', generatedUpgrades.length);
  return generatedUpgrades;
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
    // If an upgrade isn't in any tech tree definitions, it is a global/base upgrade
    if (!allowedTrees || allowedTrees.size === 0) return true;

    // If it is in a tree, the game must have that specific tree active
    return allowedTrees.has(upgradeset.game.tech_tree);
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

export function purchaseUpgradeCore(upgradeset, upgradeId) {
  return runPurchaseUpgrade(upgradeset, upgradeId);
}

function runPurchaseUpgrade(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: Upgrade '${upgradeId}' not found.`);
    return false;
  }
  if (!upgradeset.isUpgradeAvailable(upgradeId)) {
    return false;
  }
  if (!computeAffordable(upgrade, upgradeset, upgradeset.game)) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' not affordable. Money: ${upgradeset.game.state.current_money}, Cost: ${upgrade.getCost()}`);
    return false;
  }
  if (upgrade.level >= upgrade.max_level) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' already at max level (${upgrade.level})`);
    return false;
  }

  const cost = upgrade.getCost();
  const ecost = upgrade.getEcost();
  let purchased = false;

  if (ecost.gt(0)) {
    if (toDecimal(upgradeset.game.state.current_exotic_particles).gte(ecost)) {
      debitExoticParticles(upgradeset.game, ecost.toNumber?.() ?? Number(ecost));
      purchased = true;
    }
  } else {
    if (toDecimal(upgradeset.game.state.current_money).gte(cost)) {
      debitMoney(upgradeset.game, cost.toNumber?.() ?? Number(cost));
      purchased = true;
    }
  }

  if (purchased) {
    upgrade.setLevel(upgrade.level + 1);
    upgradeset.game.emit?.("upgradePurchased", { upgrade });
    logger.log("debug", "upgrades", "Upgrade purchased", { id: upgradeId, level: upgrade.level });
    if (upgrade.upgrade.type === "experimental_parts") {
      upgradeset.game.epart_onclick(upgrade);
    }
    upgradeset.updateSectionCounts();
    void upgradeset.game.saveManager.autoSave();
  }

  return purchased;
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
    const { upgrades, techTree } = loadUpgradeTemplates();
    const data = upgrades;
    this.techTrees = techTree; // Store for Game.getDoctrine()
    this.reset();

    // Populate the Tech Tree Mapping
    this.upgradeToTechTreeMap.clear();
    techTree.forEach(tree => {
        tree.upgrades.forEach(upgId => {
            if (!this.upgradeToTechTreeMap.has(upgId)) {
                this.upgradeToTechTreeMap.set(upgId, new Set());
            }
            this.upgradeToTechTreeMap.get(upgId).add(tree.id);
        });
    });

    logger.log('debug', 'game', 'Upgrade data loaded:', data?.length, "upgrades");

    const fullUpgradeList = [...data, ...generateCellUpgrades(this.game)];
    fullUpgradeList.forEach((upgradeDef) => {
      const upgradeInstance = new Upgrade(upgradeDef, this.game);
      this.upgrades.set(upgradeInstance.id, upgradeInstance);
      this.upgradesArray.push(upgradeInstance);
    });
    
    const autoSellUpg = new Upgrade({ id: "auto_sell_operator", title: "Power Grid Sync", description: "Unlocks Auto-Sell toggle.", cost: 50000, type: "other", levels: 1 }, this.game);
    const autoBuyUpg = new Upgrade({ id: "auto_buy_operator", title: "Supply Chain Logistics", description: "Unlocks Auto-Buy toggle.", cost: 100000, type: "other", levels: 1 }, this.game);
    this.upgrades.set(autoSellUpg.id, autoSellUpg);
    this.upgradesArray.push(autoSellUpg);
    this.upgrades.set(autoBuyUpg.id, autoBuyUpg);
    this.upgradesArray.push(autoBuyUpg);

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
    const game = this.game;
    if (!game?.state) return false;
    const before = this.getUpgrade(upgradeId)?.level ?? 0;
    game.state.intent_queue.push({
      action: "PURCHASE_UPGRADE",
      timestamp: Date.now(),
      payload: { upgradeId },
    });
    game.engine?._processIntentQueue?.();
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
