import { Part } from "./part.js";
import dataService from "../services/dataService.js";
import { logger } from "../utils/logger.js";

export const PART_DEFINITION_TOUCH_POINTS = [
  "dataService/part_list.json",
  "core/part/partStatsRecalculator.js",
  "components/ui/componentRenderingUI.js",
  "core/engine.js",
  "core/partset.js",
  "core/tile.js",
];

// --- Constants for Part Generation ---

const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks.";

// Legacy multipliers restored as per user request
const CELL_POWER_MULTIPLIERS = [1, 4, 12];
const CELL_HEAT_MULTIPLIERS = [1, 8, 36];
const CELL_COUNTS = [1, 2, 4];

const PART_TITLE_PREFIXES = ["Basic ", "Advanced ", "Super ", "Wonderous ", "Ultimate "];
const CELL_TITLE_PREFIXES = ["", "Dual ", "Quad "];

export class PartSet {
  constructor(game) {
    this.game = game;
    this.parts = new Map();
    this.partsArray = [];
    this.initialized = false;
    // Order of types within each category based on part_list.json appearance
    this.categoryTypeOrder = new Map(); // category -> [type]
    this.typeOrderIndex = new Map(); // `${category}:${type}` -> index
  }

  reset() {
    this.parts.clear();
    this.partsArray = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return this.partsArray;
    }

    const { parts } = await dataService.ensureAllGameDataLoaded();

    logger.log('info', 'game', 'Loading part list data...');
    logger.log('debug', 'game', 'Part list data loaded:', {
      count: parts.length,
      categories: [...new Set(parts.map((p) => p.category))]
    });

    parts.forEach((template) => {
      // Build type order per category (skip experimental entries)
      if (template.category && !template.experimental) {
        const arr = this.categoryTypeOrder.get(template.category) || [];
        if (!arr.includes(template.type)) {
          arr.push(template.type);
          this.categoryTypeOrder.set(template.category, arr);
          this.typeOrderIndex.set(`${template.category}:${template.type}`, arr.length - 1);
        }
      }
      if (template.levels) {
        // Multi-level parts (like cells, reflectors, etc.)
        for (let i = 0; i < template.levels; i++) {
          const level = i + 1;
          const partDef = this.generatePartDefinition(template, level);
          const partInstance = new Part(partDef, this.game);
          this.parts.set(partInstance.id, partInstance);
          this.partsArray.push(partInstance);
        }
      } else {
        // Single-level parts (like valves, experimental parts)
        const partDef = this.generatePartDefinition(template, template.level);
        const partInstance = new Part(partDef, this.game);
        this.parts.set(partInstance.id, partInstance);
        this.partsArray.push(partInstance);
      }
    });

    this.initialized = true;
    return this.partsArray;
  }


  generatePartDefinition(template, level) {
    const partDef = { ...template, level };

    // For multi-level parts, always append the level number to the ID
    if (template.levels) {
      partDef.id = `${template.type}${level}`;
    } else {
      // For single-level parts, use the template ID if it exists, otherwise generate one
      if (template.id) {
        partDef.id = template.id;
      } else {
        partDef.id = `${template.type}${level}`;
      }
    }

    if (template.levels) {
      partDef.base_cost = template.base_cost.mul(Math.pow(template.cost_multi, level - 1));
    } else {
      partDef.base_cost = template.base_cost;
    }

    if (partDef.category === "cell") {
      this._applyCellProperties(partDef, template, level);
      return partDef;
    }
    this._applyGenericPartProperties(partDef, template, level);
    return partDef;
  }


  _applyCellProperties(partDef, template, level) {
    partDef.title = `${CELL_TITLE_PREFIXES[level - 1] || ""}${template.title}`;
    partDef.base_description = template.base_description || (level > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL);
    partDef.base_power = template.base_power * (CELL_POWER_MULTIPLIERS[level - 1] || 1);
    partDef.base_heat = template.base_heat * (CELL_HEAT_MULTIPLIERS[level - 1] || 1);
    partDef.cell_count = CELL_COUNTS[level - 1] || 1;
  }


  _applyGenericPartProperties(partDef, template, level) {
    // If the template has an explicit title, preserve it; otherwise apply prefixes
    if (template.title && !template.experimental) {
      partDef.title = template.title;
    } else {
      partDef.title = template.experimental ? template.title : `${PART_TITLE_PREFIXES[level - 1] || ""}${template.title || template.type}`;
    }

    // Only apply multipliers for multi-level parts
    if (template.levels) {
      const applyMultiplier = (baseKey, multiplierKey) => {
        if (template[baseKey] && template[multiplierKey]) {
          partDef[baseKey] = template[baseKey] * Math.pow(template[multiplierKey], level - 1);
        }
      };

      applyMultiplier("base_ticks", "ticks_multiplier");
      applyMultiplier("base_containment", "containment_multi");
      applyMultiplier("base_reactor_power", "reactor_power_multi");
      applyMultiplier("base_reactor_heat", "reactor_heat_multiplier");
      applyMultiplier("base_ep_heat", "ep_heat_multiplier");

      // Correctly use the multipliers from the part definition
      if (template.base_transfer && template.transfer_multiplier) {
        partDef.base_transfer = template.base_transfer * Math.pow(template.transfer_multiplier, level - 1);
      }

      if (template.base_vent && template.vent_multiplier) {
        partDef.base_vent = template.base_vent * Math.pow(template.vent_multiplier, level - 1);
      }

      if (template.base_power_increase && template.power_increase_add) {
        partDef.base_power_increase = template.base_power_increase + (template.power_increase_add * (level - 1));
      }
    } else {
      // For single-level parts, copy values directly without multipliers
      if (template.base_transfer) partDef.base_transfer = template.base_transfer;
      if (template.base_vent) partDef.base_vent = template.base_vent;
      if (template.base_power_increase) partDef.base_power_increase = template.base_power_increase;
      if (template.base_ticks) partDef.base_ticks = template.base_ticks;
      if (template.base_containment) partDef.base_containment = template.base_containment;
      if (template.base_reactor_power) partDef.base_reactor_power = template.base_reactor_power;
      if (template.base_reactor_heat) partDef.base_reactor_heat = template.base_reactor_heat;
      if (template.base_ep_heat) partDef.base_ep_heat = template.base_ep_heat;
    }
  }

  updateCellPower() {
    this.partsArray.forEach((part) => {
      if (part.category === "cell") {
        part.recalculate_stats();
      }
    });
  }

  check_affordability(game) {
    if (!game) return;
    this.partsArray.forEach((part) => {
      if (game.isSandbox) {
        part.setAffordable(true);
        return;
      }
      if (game.reactor && game.reactor.has_melted_down) {
        part.setAffordable(false);
        return;
      }
      if (this.isPartDoctrineLocked(part)) {
        part.setAffordable(false);
        return;
      }
      const isUnlocked = this.game?.unlockManager && typeof this.game.unlockManager.isPartUnlocked === "function" ? this.game.unlockManager.isPartUnlocked(part) : true;
      let isAffordable = false;
      if (part.erequires) {
        const requiredUpgrade = game.upgradeset.getUpgrade(part.erequires);
        if (requiredUpgrade?.level > 0 && isUnlocked) {
          isAffordable = part.ecost?.gt?.(0)
            ? game.state.current_exotic_particles.gte(part.ecost)
            : game.state.current_money.gte(part.cost);
        }
      } else if (isUnlocked) {
        isAffordable = game.state.current_money.gte(part.cost);
      }
      part.setAffordable(isAffordable);
    });
  }

  isPartDoctrineLocked(part) {
    if (!part?.erequires) return false;
    if (this.game.bypass_tech_tree_restrictions) return false;
    if (!this.game.tech_tree || !this.game.upgradeset) return false;
    return !this.game.upgradeset.isUpgradeAvailable(part.erequires);
  }

  getPartById(id) {
    return this.parts.get(id);
  }

  getAllParts() {
    return this.partsArray;
  }

  getPartsByCategory(category) {
    return this.partsArray.filter((part) => part.category === category);
  }

  getPartsByType(type) {
    return this.partsArray.filter((part) => part.type === type);
  }

  getPartsByLevel(level) {
    return this.partsArray.filter((part) => part.level === level);
  }

  getPartsByTier(tier) {
    return this.getPartsByLevel(tier);
  }
}
