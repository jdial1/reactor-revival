import { Part } from "./part.js";
import part_list_data from "../data/part_list.js";

const SINGLE_CELL_DESC_TPL =
  "Produces %power power and %heat heat for %ticks ticks.";
const MULTI_CELL_DESC_TPL =
  "Acts as %count %type cells. Produces %power power and %heat heat for %ticks ticks.";
const CELL_POWER_MULTIPLIERS = [1, 2, 4];
const CELL_HEAT_MULTIPLIERS = [1, 2, 4];
const CELL_COUNTS = [1, 2, 4];
const PART_TITLE_PREFIXES = [
  "Basic ",
  "Advanced ",
  "Super ",
  "Wonderous ",
  "Ultimate ",
];
const CELL_TITLE_PREFIXES = ["", "Dual ", "Quad "];

export class PartSet {
  constructor(game) {
    this.game = game;
    this.parts = new Map();
    this.partsArray = [];
  }

  reset() {
    this.parts.clear();
    this.partsArray = [];
  }

  initialize() {
    // Clear existing parts to prevent duplication
    this.parts.clear();
    this.partsArray = [];

    part_list_data.forEach((template) => {
      const levels = template.levels || 1;
      for (let i = 0; i < levels; i++) {
        const level = template.levels ? i + 1 : template.level;
        const partDef = this.generatePartDefinition(template, level);
        const part_obj = new Part(partDef, this.game);
        this.parts.set(part_obj.id, part_obj);
        this.partsArray.push(part_obj);

        if (template.levels) {
          // Remove the break condition that was preventing the highest level from being created
        } else {
          // a single-level template is processed once
          break;
        }
      }
    });
    return this.partsArray;
  }

  generatePartDefinition(template, level) {
    const part_def = { ...template, level };

    // Generate ID
    if (part_def.category === "cell") {
      part_def.id = `${template.type}${level}`;
    } else {
      part_def.id = `${template.type}${level}`; // Use type instead of category
    }

    part_def.base_cost =
      template.base_cost * Math.pow(template.cost_multi || 1, level - 1);

    if (part_def.category === "cell") {
      part_def.title = `${CELL_TITLE_PREFIXES[level - 1] || ""}${
        template.title
      }`;
      part_def.base_description =
        part_def.base_description ||
        (level > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL);
      part_def.base_power =
        template.base_power * (CELL_POWER_MULTIPLIERS[level - 1] || 1);
      part_def.base_heat =
        template.base_heat * (CELL_HEAT_MULTIPLIERS[level - 1] || 1);
      part_def.cell_count = CELL_COUNTS[level - 1] || 1;
    } else {
      part_def.title = template.experimental
        ? `${template.title}`
        : `${PART_TITLE_PREFIXES[level - 1] || ""}${template.title}`;

      if (template.base_ticks && template.ticks_multiplier)
        part_def.base_ticks =
          template.base_ticks * Math.pow(template.ticks_multiplier, level - 1);
      if (template.base_containment && template.containment_multi)
        part_def.base_containment =
          template.base_containment *
          Math.pow(template.containment_multi, level - 1);
      if (template.base_reactor_power && template.reactor_power_multi)
        part_def.base_reactor_power =
          template.base_reactor_power *
          Math.pow(template.reactor_power_multi, level - 1);
      if (template.base_reactor_heat && template.reactor_heat_multiplier)
        part_def.base_reactor_heat =
          template.base_reactor_heat *
          Math.pow(template.reactor_heat_multiplier, level - 1);
      if (template.base_transfer && template.transfer_multiplier)
        part_def.base_transfer =
          template.base_transfer *
          Math.pow(template.transfer_multiplier, level - 1);
      if (template.base_vent && template.vent_multiplier)
        part_def.base_vent =
          template.base_vent * Math.pow(template.vent_multiplier, level - 1);
      if (template.base_ep_heat && template.ep_heat_multiplier)
        part_def.base_ep_heat =
          template.base_ep_heat *
          Math.pow(template.ep_heat_multiplier, level - 1);
      if (template.base_power_increase && template.power_increase_add)
        part_def.base_power_increase =
          template.base_power_increase +
          template.power_increase_add * (level - 1);
    }

    return part_def;
  }

  updateCellPower() {
    this.partsArray.forEach((part_obj) => {
      if (part_obj.category === "cell") {
        part_obj.recalculate_stats();
      }
    });
  }

  check_affordability(game) {
    if (!game) return;
    this.partsArray.forEach((part) => {
      let affordable = false;
      if (part.erequires) {
        const required_upgrade = game.upgradeset.getUpgrade(part.erequires);
        if (required_upgrade && required_upgrade.level > 0) {
          affordable =
            Number(game.current_exotic_particles) >= Number(part.cost);
        }
      } else {
        affordable = Number(game.current_money) >= Number(part.cost);
      }
      part.setAffordable(affordable);
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
    // Tier is an alias for level in this system
    return this.partsArray.filter((part) => part.level === tier);
  }
}
