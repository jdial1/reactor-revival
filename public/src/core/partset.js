import { Part } from "./part.js";
import dataService from "../services/dataService.js";

// Load part data
let part_list_data = [];
let dataLoaded = false;

async function ensureDataLoaded() {
  if (!dataLoaded) {
    try {
      console.log("Loading part list data...");
      part_list_data = await dataService.loadPartList();
      console.log("Part list data loaded:", {
        type: typeof part_list_data,
        hasDefault: part_list_data && typeof part_list_data === 'object' && 'default' in part_list_data,
        defaultType: part_list_data?.default ? typeof part_list_data.default : 'undefined',
        defaultIsArray: Array.isArray(part_list_data?.default),
        keys: part_list_data ? Object.keys(part_list_data) : []
      });
      dataLoaded = true;
    } catch (error) {
      console.warn("Failed to load part list:", error);
      part_list_data = [];
      dataLoaded = true;
    }
  }
  return part_list_data;
}

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
    await ensureDataLoaded();
    this.reset();
    console.log("part_list_data type:", typeof part_list_data, "length:", part_list_data?.length, "isArray:", Array.isArray(part_list_data));

    // Handle ES module format - the dataService returns the entire JSON object
    let data = part_list_data;
    if (part_list_data && typeof part_list_data === 'object' && part_list_data.default) {
      data = part_list_data.default;
    }

    if (!Array.isArray(data)) {
      console.error("part_list_data is not an array:", data);
      console.error("part_list_data structure:", Object.keys(part_list_data || {}));
      return;
    }

    data.forEach((template) => {
      // Build type order per category (skip experimental entries)
      if (template.category && !template.experimental) {
        const arr = this.categoryTypeOrder.get(template.category) || [];
        if (!arr.includes(template.type)) {
          arr.push(template.type);
          this.categoryTypeOrder.set(template.category, arr);
          this.typeOrderIndex.set(`${template.category}:${template.type}`, arr.length - 1);
        }
      }
      const levels = template.levels || 1;
      for (let i = 0; i < levels; i++) {
        const level = template.levels ? i + 1 : template.level;
        const partDef = this.generatePartDefinition(template, level);
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

    partDef.id = `${template.type}${level}`;
    partDef.base_cost = template.base_cost * Math.pow(template.cost_multi || 1, level - 1);

    if (partDef.category === "cell") {
      this._applyCellProperties(partDef, template, level);
    } else {
      this._applyGenericPartProperties(partDef, template, level);
    }

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
    partDef.title = template.experimental ? template.title : `${PART_TITLE_PREFIXES[level - 1] || ""}${template.title}`;

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
      let isAffordable = false;
      // Gating: a part must be unlocked to be affordable/selectable
      const isUnlocked = typeof game.isPartUnlocked === 'function' ? game.isPartUnlocked(part) : true;
      if (part.erequires) {
        const requiredUpgrade = game.upgradeset.getUpgrade(part.erequires);
        if (requiredUpgrade && requiredUpgrade.level > 0 && isUnlocked) {
          isAffordable = Number(game.current_exotic_particles) >= Number(part.cost);
        }
      } else {
        if (isUnlocked) {
          isAffordable = Number(game.current_money) >= Number(part.cost);
        }
      }
      part.setAffordable(isAffordable);
    });
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
