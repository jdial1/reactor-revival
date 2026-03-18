import Decimal, { toDecimal, toNumber, numFormat as fmt } from "../utils/utils_constants.js";
import { BALANCE } from "./heat_system.js";
import { logger } from "../utils/utils_constants.js";
import {
  MOBILE_BREAKPOINT_PX,
  RESIZE_DELAY_MS,
  BASE_MAX_POWER,
  BASE_MAX_HEAT,
  MAX_PART_VARIANTS,
} from "../utils/utils_constants.js";
import { getAffordabilitySettings, updateDecimal } from "./store.js";
import dataService from "../services/dataService.js";
import { renderToNode, UpgradeCard } from "../components/buttonFactory.js";

function updateAllPartStats(game, partType) {
  const basePart = game.partset.getPartById(partType);
  if (basePart) {
    basePart.recalculate_stats();
  }
  for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
    const part = game.partset.getPartById(`${partType}${i}`);
    if (part) part.recalculate_stats();
  }
  game.tileset.tiles_list.forEach(tile => {
    if (tile.part && tile.part.category === partType) {
      logger.log('debug', 'game', `Updating part ${tile.part.id} (category: ${tile.part.category}) on tile (${tile.row}, ${tile.col})`);
      tile.part.recalculate_stats();
    }
  });
}

const upgradeActions = {
  chronometer: (upgrade, game) => {
    game.loop_wait = game.base_loop_wait / (1 + upgrade.level);
    game.emit?.("statePatch", { loop_wait: game.loop_wait });
  },
  forceful_fusion: (upgrade, game) => {
    game.reactor.heat_power_multiplier = upgrade.level;
    game.reactor.updateStats();
  },
  heat_control_operator: (upgrade, game) => {
    const isEnabled = upgrade.level > 0;
    game.reactor.heat_controlled = isEnabled;
    game.onToggleStateChange?.("heat_control", isEnabled);
  },
  heat_outlet_control_operator: (upgrade, game) => {
    game.reactor.heat_outlet_controlled = upgrade.level > 0;
  },
  expand_reactor_rows: (upgrade, game) => {
    game.rows = game.base_rows + upgrade.level;
    if (typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      setTimeout(() => game.emit?.("gridResized"), RESIZE_DELAY_MS);
    }
  },
  expand_reactor_cols: (upgrade, game) => {
    game.cols = game.base_cols + upgrade.level;
    if (typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      setTimeout(() => game.emit?.("gridResized"), RESIZE_DELAY_MS);
    }
  },
  improved_piping: (upgrade, game) => {
    game.reactor.manual_heat_reduce =
      game.base_manual_heat_reduce * Math.pow(10, upgrade.level);
    game.emit?.("statePatch", { manual_heat_reduce: game.reactor.manual_heat_reduce });
  },
  improved_alloys: (upgrade, game) => {
    updateAllPartStats(game, "reactor_plating");
  },
  improved_power_lines: (upgrade, game) => {
    game.reactor.auto_sell_multiplier = BALANCE.autoSellMultiplierPerLevel * upgrade.level;
    game.reactor.updateStats();
  },
  improved_wiring: (upgrade, game) => {
    updateAllPartStats(game, "capacitor");
  },
  improved_coolant_cells: (upgrade, game) => {
    updateAllPartStats(game, "coolant_cell");
  },
  improved_reflector_density: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_neutron_reflection: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_heat_exchangers: (upgrade, game) => {
    ["heat_inlet", "heat_outlet", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  improved_heat_vents: (upgrade, game) => {
    logger.log('debug', 'game', `improved_heat_vents upgrade action called with level ${upgrade.level}`);
    updateAllPartStats(game, "vent");
  },
  perpetual_capacitors: (upgrade, game) => {
    game.reactor.perpetual_capacitors = upgrade.level > 0;
  },
  perpetual_reflectors: (upgrade, game) => {
    game.reactor.perpetual_reflectors = upgrade.level > 0;
    for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
      const part = game.partset.getPartById(`reflector${i}`);
      if (part) {
        part.perpetual = !!upgrade.level;
        part.recalculate_stats();
      }
    }
  },
  reinforced_heat_exchangers: (upgrade, game) => {
    game.reactor.transfer_plating_multiplier = upgrade.level;
  },
  active_exchangers: (upgrade, game) => {
    game.reactor.transfer_capacitor_multiplier = upgrade.level;
  },
  improved_heatsinks: (upgrade, game) => {
    game.reactor.vent_plating_multiplier = upgrade.level;
  },
  active_venting: (upgrade, game) => {
    game.reactor.updateStats();
  },
  stirling_generators: (upgrade, game) => {
    game.reactor.stirling_multiplier = upgrade.level * BALANCE.stirlingMultiplierPerLevel;
  },
  market_lobbying: (upgrade, game) => {
    game.reactor.sell_price_multiplier = 1 + (upgrade.level * BALANCE.marketLobbyingMultPerLevel);
  },
  emergency_coolant: (upgrade, game) => {
    game.reactor.manual_vent_percent = upgrade.level * BALANCE.emergencyCoolantMultPerLevel;
  },
  component_reinforcement: (upgrade, game) => {
    game.partset.partsArray.forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part) tile.part.recalculate_stats();
    });
  },
  isotope_stabilization: (upgrade, game) => {
    game.partset.getPartsByCategory("cell").forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "cell") {
        tile.part.recalculate_stats();
      }
    });
  },
  reflector_cooling: (upgrade, game) => {
    game.reactor.reflector_cooling_factor = upgrade.level * BALANCE.reflectorCoolingFactorPerLevel;
    game.reactor.updateStats();
  },
  quantum_tunneling: (upgrade, game) => {
    ["heat_inlet", "heat_outlet"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
    game.tileset.tiles_list.forEach(tile => tile.invalidateNeighborCaches());
  },
  reactor_insurance: (upgrade, game) => {
    game.reactor.insurance_percentage = upgrade.level * BALANCE.insurancePercentPerLevel;
  },
  manual_override: (upgrade, game) => {
    game.reactor.manual_override_mult = upgrade.level * BALANCE.manualOverrideMultPerLevel;
  },
  convective_airflow: (upgrade, game) => {
    game.reactor.convective_boost = upgrade.level * BALANCE.convectiveBoostPerLevel;
  },
  electro_thermal_conversion: (upgrade, game) => {
    game.reactor.power_to_heat_ratio = BALANCE.electroThermalBaseRatio + ((upgrade.level - 1) * BALANCE.electroThermalStep);
  },
  sub_atomic_catalysts: (upgrade, game) => {
    game.reactor.catalyst_reduction = upgrade.level * BALANCE.catalystReductionPerLevel;
    updateAllPartStats(game, "particle_accelerator");
  },
  flux_accumulators: (upgrade, game) => {
    game.reactor.flux_accumulator_level = upgrade.level;
  },
  thermal_feedback: (upgrade, game) => {
    game.reactor.thermal_feedback_rate = upgrade.level * BALANCE.thermalFeedbackRatePerLevel;
  },
  autonomic_repair: (upgrade, game) => {
    game.reactor.auto_repair_rate = upgrade.level;
  },
  volatile_tuning: (upgrade, game) => {
    game.reactor.volatile_tuning_max = upgrade.level * BALANCE.volatileTuningMaxPerLevel;
  },
  ceramic_composite: (upgrade, game) => {
    game.reactor.plating_transfer_rate = upgrade.level * BALANCE.platingTransferRatePerLevel;
    updateAllPartStats(game, "reactor_plating");
    game.tileset.tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "reactor_plating") {
        tile.part.recalculate_stats();
      }
    });
    if (game.engine) {
      game.engine.markPartCacheAsDirty();
    }
  },
  explosive_decompression: (upgrade, game) => {
    game.reactor.decompression_enabled = upgrade.level > 0;
  },
  laboratory: (upgrade, game) => {
  },
  infused_cells: (upgrade, game) => {
    game.update_cell_power();
  },
  unleashed_cells: (upgrade, game) => {
    game.update_cell_power();
  },
  protium_cells: (upgrade, game) => {
  },
  unstable_protium: (upgrade, game) => {
    game.update_cell_power();
  },
  quantum_buffering: (upgrade, game) => {
    updateAllPartStats(game, "capacitor");
    updateAllPartStats(game, "reactor_plating");
  },
  full_spectrum_reflectors: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  fluid_hyperdynamics: (upgrade, game) => {
    ["heat_inlet", "heat_outlet", "heat_exchanger", "vent"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  fractal_piping: (upgrade, game) => {
    ["vent", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  vortex_cooling: (upgrade, game) => {
    ["vent", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  ultracryonics: (upgrade, game) => {
    updateAllPartStats(game, "coolant_cell");
  },
  phlembotinum_core: (upgrade, game) => {
    game.reactor.base_max_power =
      BASE_MAX_POWER * Math.pow(BALANCE.phlembotinumMultiplier, upgrade.level);
    game.reactor.base_max_heat =
      BASE_MAX_HEAT * Math.pow(BALANCE.phlembotinumMultiplier, upgrade.level);
    game.reactor.altered_max_power = game.reactor.base_max_power;
    game.reactor.altered_max_heat = game.reactor.base_max_heat;
    game.reactor.updateStats();
  },
  cell_power: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    game.update_cell_power();
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_tick: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_perpetual: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.perpetual = !!upgrade.level;
      part.recalculate_stats();
    }
  },
  improved_particle_accelerators: (upgrade, game) => {
    const partLevel = upgrade.upgrade.part_level;
    const partToUpdate = game.partset.getPartById(
      "particle_accelerator" + partLevel
    );
    if (partToUpdate) {
      partToUpdate.recalculate_stats();
    }
  },
  uranium1_cell_power: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.power = part.base_power * Math.pow(2, upgrade.level);
    game.reactor.updateStats();
  },
  uranium1_cell_tick: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.ticks = part.base_ticks * Math.pow(2, upgrade.level);
    game.reactor.updateStats();
  },
  uranium1_cell_perpetual: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.perpetual = true;
    game.reactor.updateStats();
  },
};

export function executeUpgradeAction(actionId, upgrade, game) {
  if (upgradeActions[actionId]) {
    upgradeActions[actionId](upgrade, game);
  }
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
    this.$el = null;
    this.$levels = null;
    this.display_cost = "";
    this.updateDisplayCost();
  }

  setLevel(level) {
    if (this.level !== level) {
      this.level = level;
      this.updateDisplayCost();
      this._syncDisplayToState();
      if (this.actionId) {
        executeUpgradeAction(this.actionId, this, this.game);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
      if (this.$el) {
        const buyBtn = this.$el.querySelector(".upgrade-action-btn");
        if (buyBtn) {
          buyBtn.disabled = !isAffordable || this.level >= this.max_level;
        }
        this.$el.classList.toggle("unaffordable", !isAffordable);
      }
    }
  }

  setAffordProgress(progress) {
    const p = Math.max(0, Math.min(1, Number(progress)));
    if (this.$el) {
      const buyBtn = this.$el.querySelector(".upgrade-action-btn");
      if (buyBtn) {
        buyBtn.style.setProperty("--afford-progress", String(p));
      }
    }
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

    if (this.$el) {
      const buyBtn = this.$el.querySelector(".upgrade-action-btn");
      if (buyBtn) {
        const doctrineLocked = this.$el.classList.contains("doctrine-locked");
        if (doctrineLocked) {
          buyBtn.disabled = true;
          const doctrine = this.game.upgradeset?.getDoctrineForUpgrade(this.id);
          const doctrineName = doctrine?.title || doctrine?.id || "other doctrine";
          buyBtn.setAttribute("aria-label", `Locked – ${doctrineName}`);
        } else {
          buyBtn.disabled = !this.affordable || this.level >= this.max_level;
          buyBtn.setAttribute("aria-label", this.level >= this.max_level ? `${this.title} is maxed out` : `Buy ${this.title} for ${this.display_cost}`);
        }
      }

      const descEl = this.$el.querySelector(".upgrade-description");
      if (descEl) {
        descEl.style.display = this.level >= this.max_level ? "none" : "";
      }

      this.$el.classList.toggle("maxed-out", this.level >= this.max_level);
    }
  }

  createElement() {
    const doctrineSource = (id) => this.game?.upgradeset?.getDoctrineForUpgrade(id);
    const onBuyClick = (e) => {
      e.stopPropagation();
      if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
      if (!this.game.upgradeset.purchaseUpgrade(this.id)) {
        if (this.game.audio) this.game.audio.play('error');
        return;
      }
      if (this.game.audio) this.game.audio.play('upgrade');
      this.game.upgradeset.check_affordability(this.game);
    };
    const onBuyMaxClick = (e) => {
      e.stopPropagation();
      if (!this.game.isSandbox) return;
      if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
      const count = this.game.upgradeset.purchaseUpgradeToMax(this.id);
      if (count > 0 && this.game.audio) this.game.audio.play('upgrade');
    };
    const onResetClick = (e) => {
      e.stopPropagation();
      if (!this.game.isSandbox) return;
      this.game.upgradeset.resetUpgradeLevel(this.id);
    };
    this.$el = renderToNode(UpgradeCard(this, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick }));
    this.updateDisplayCost();
    return this.$el;
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

function handleUnavailableUpgrade(upgrade, hideOtherDoctrine) {
  if (!upgrade.$el) return;
  if (hideOtherDoctrine) upgrade.$el.classList.add("hidden");
  else {
    upgrade.$el.classList.remove("hidden");
    upgrade.$el.classList.add("doctrine-locked");
  }
  upgrade.setAffordable(false);
  upgrade.setAffordProgress(0);
}

function computeAffordable(upgrade, upgradeset, game) {
  if (game.isSandbox) {
    return !upgrade.erequires || (upgradeset.getUpgrade(upgrade.erequires)?.level ?? 0) > 0;
  }
  if (game.reactor && game.reactor.has_melted_down) return false;
  const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);
  if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) return false;
  if (upgrade.base_ecost && upgrade.base_ecost.gt(0)) {
    return toDecimal(game.state.current_exotic_particles).gte(upgrade.current_ecost);
  }
  return toDecimal(game.state.current_money).gte(upgrade.current_cost);
}

function isMaxLevelOrMeltedDown(upgrade, game) {
  return upgrade.level >= upgrade.max_level || game.reactor?.has_melted_down === true;
}

function usesExoticParticles(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function getProgressRatio(current, cost) {
  const n = toNumber(current);
  const c = toNumber(cost);
  return Math.min(1, n / c);
}

function getCurrentAndCost(upgrade, game) {
  const useEp = usesExoticParticles(upgrade);
  const raw = useEp ? game.state.current_exotic_particles : game.state.current_money;
  const current = toDecimal(raw);
  const cost = useEp ? upgrade.current_ecost : upgrade.current_cost;
  if (!cost || !cost.gt(0)) return null;
  return { current, cost };
}

function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (isMaxLevelOrMeltedDown(upgrade, game)) return 0;
  const pair = getCurrentAndCost(upgrade, game);
  if (!pair) return 0;
  return getProgressRatio(pair.current, pair.cost);
}

function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function applyUpgradeVisibility(upgrade, isAffordable, settings) {
  if (!upgrade.$el) return { isResearch: false, isInDOM: false, isMaxed: false };
  const isResearch = isResearchUpgrade(upgrade);
  const shouldHideUnaffordable = isResearch ? settings.hideResearch : settings.hideUpgrades;
  const shouldHideMaxed = isResearch ? settings.hideMaxResearch : settings.hideMaxUpgrades;
  const isMaxed = upgrade.level >= upgrade.max_level;
  const isInDOM = upgrade.$el.isConnected;
  const shouldHide =
    (shouldHideUnaffordable && !isAffordable && !isMaxed) || (shouldHideMaxed && isMaxed);
  if (shouldHide) upgrade.$el.classList.add("hidden");
  else upgrade.$el.classList.remove("hidden");
  return { isResearch, isInDOM, isMaxed };
}

function emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch) {
  game?.emit?.("upgradesAffordabilityChanged", {
    hasAnyUpgrade,
    hasVisibleAffordableUpgrade,
    hasAnyResearch,
    hasVisibleAffordableResearch,
  });
}

export function runCheckAffordability(upgradeset, game) {
  if (!game) return;
  const settings = getAffordabilitySettings();
  let hasVisibleAffordableUpgrade = false;
  let hasVisibleAffordableResearch = false;
  let hasAnyUpgrade = false;
  let hasAnyResearch = false;

  upgradeset.upgradesArray.forEach((upgrade) => {
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) {
      handleUnavailableUpgrade(upgrade, settings.hideOtherDoctrine);
      return;
    }

    if (upgrade.$el) upgrade.$el.classList.remove("doctrine-locked");

    const isAffordable = computeAffordable(upgrade, upgradeset, game);
    upgrade.setAffordable(isAffordable);
    upgrade.setAffordProgress(computeAffordProgress(upgrade, game, isAffordable));

    const { isResearch, isInDOM, isMaxed } = applyUpgradeVisibility(upgrade, isAffordable, settings);
    if (isInDOM) {
      if (isResearch) {
        hasAnyResearch = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableResearch = true;
      } else {
        hasAnyUpgrade = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableUpgrade = true;
      }
    }
  });

  emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch);
}

function getUpgradeContainerIdForSection(upgrade) {
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
      const containerId = getUpgradeContainerIdForSection(upgrade);
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

function isUpgradeDoctrineLocked(upgradeset, upgradeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions) return false;
  if (!upgradeset.restrictedUpgrades.has(upgradeId)) return false;
  if (!upgradeset.game.tech_tree) return false;
  const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
  if (!allowedTrees || allowedTrees.has(upgradeset.game.tech_tree)) return false;
  if (isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId)) return false;
  return true;
}

function isUpgradeAvailable(upgradeset, upgradeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions) return true;
  if (isUpgradeDoctrineLocked(upgradeset, upgradeId)) return false;
  if (!upgradeset.restrictedUpgrades.has(upgradeId)) return true;
  const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
  if (allowedTrees && allowedTrees.has(upgradeset.game.tech_tree)) return true;
  if (isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId)) return true;
  return false;
}

function getExclusiveUpgradeIdsForTree(upgradeset, treeId) {
  if (!treeId) return [];
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

function runPurchaseUpgrade(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: Upgrade '${upgradeId}' not found.`);
    return false;
  }
  if (!upgradeset.isUpgradeAvailable(upgradeId)) {
    return false;
  }
  if (!upgrade.affordable) {
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

  if (upgradeset.game.isSandbox) {
    purchased = true;
  } else if (ecost.gt(0)) {
    if (toDecimal(upgradeset.game.state.current_exotic_particles).gte(ecost)) {
      updateDecimal(upgradeset.game.state, "current_exotic_particles", (d) => d.sub(ecost));
      upgradeset.game.ui?.stateManager?.setVar("current_exotic_particles", upgradeset.game.state.current_exotic_particles);
      purchased = true;
    }
  } else {
    if (toDecimal(upgradeset.game.state.current_money).gte(cost)) {
      updateDecimal(upgradeset.game.state, "current_money", (d) => d.sub(cost));
      upgradeset.game.ui?.stateManager?.setVar("current_money", upgradeset.game.state.current_money);
      purchased = true;
    }
  }

  if (purchased) {
    upgrade.setLevel(upgrade.level + 1);
    upgradeset.game.emit?.("upgradePurchased", { upgrade });
    upgradeset.game.debugHistory.add("upgrades", "Upgrade purchased", { id: upgradeId, level: upgrade.level });
    if (upgrade.upgrade.type === "experimental_parts") {
      upgradeset.game.epart_onclick(upgrade);
    }
    upgradeset.updateSectionCounts();
    if (!upgradeset.game.isSandbox) void upgradeset.game.saveManager.autoSave();
  }

  return purchased;
}

function runPurchaseUpgradeToMax(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.game.isSandbox) return 0;
  if (!upgradeset.isUpgradeAvailable(upgradeId)) return 0;
  let count = 0;
  while (upgrade.level < upgrade.max_level && runPurchaseUpgrade(upgradeset, upgradeId)) {
    count++;
  }
  return count;
}

function runPurchaseAllUpgrades(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => (u.base_ecost.eq ? u.base_ecost.eq(0) : !u.base_ecost) && upgradeset.isUpgradeAvailable(u.id);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runPurchaseUpgradeToMax(upgradeset, u.id));
}

function runPurchaseAllResearch(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.gt && u.base_ecost.gt(0) && upgradeset.isUpgradeAvailable(u.id);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runPurchaseUpgradeToMax(upgradeset, u.id));
}

function runClearAllUpgrades(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.eq ? u.base_ecost.eq(0) : !u.base_ecost;
  upgradeset.upgradesArray.filter(filter).forEach((u) => runResetUpgradeLevel(upgradeset, u.id));
}

function runClearAllResearch(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.gt && u.base_ecost.gt(0);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runResetUpgradeLevel(upgradeset, u.id));
}

function runResetUpgradeLevel(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.game.isSandbox) return;
  if (upgrade.level === 0) return;
  upgrade.setLevel(0);
  upgradeset.updateSectionCounts();
}

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
    return runPurchaseUpgrade(this, upgradeId);
  }

  purchaseUpgradeToMax(upgradeId) {
    return runPurchaseUpgradeToMax(this, upgradeId);
  }

  purchaseAllUpgrades() {
    runPurchaseAllUpgrades(this);
  }

  purchaseAllResearch() {
    runPurchaseAllResearch(this);
  }

  clearAllUpgrades() {
    runClearAllUpgrades(this);
  }

  clearAllResearch() {
    runClearAllResearch(this);
  }

  resetUpgradeLevel(upgradeId) {
    runResetUpgradeLevel(this, upgradeId);
  }

  check_affordability(game) {
    runCheckAffordability(this, game);
  }

  isUpgradeAvailable(upgradeId) {
    return isUpgradeAvailable(this, upgradeId);
  }

  isUpgradeDoctrineLocked(upgradeId) {
    return isUpgradeDoctrineLocked(this, upgradeId);
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
