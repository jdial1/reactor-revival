import { z } from "zod";
import { PartDefinitionSchema } from "../schema/index.js";
import { bundledGameData } from "../bundledStaticData.js";
import { compileTraitBitmask, hasTrait } from "../traits.js";
import { toDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { getPartImagePath } from "../core/part-images.js";
import {
  getUpgradeBonusLines,
} from "../logic-tooltip-stats.js";
import { formatPartDescription, compilePartStats } from "reactor-core";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;
const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";

export const CELL_FORM_FACTORS = [
  { titlePrefix: "", cellPackM: 1, cellCount: 1 },
  { titlePrefix: "Dual ", cellPackM: 4, cellCount: 2 },
  { titlePrefix: "Quad ", cellPackM: 12, cellCount: 4 },
];

const PART_TITLE_PREFIXES = ["Basic ", "Advanced ", "Super ", "Wonderous ", "Ultimate "];

export function resolveCellTierPartId(type, level) {
  return `${type}${level}`;
}

function recalculatePartStats(part) {
  const bridge = part.game?.coreBridge;
  const session = bridge?.session;
  if (!session) return;
  if (bridge.isActive) {
    bridge.syncMechanicsOverridesFromGame?.();
    bridge.syncReactorScalarsFromGame?.();
  }
  let compiled = session.getPart?.(part.id);
  if (!compiled) {
    compiled = compilePartStats(part.id, {
      manifest: session.manifest,
      registry: session.registry,
      modifiers: session.modifiers,
      exoticParticles: session.systems?.economy?.currentExoticParticles,
      weaveQuantum: session.systems?.economy?.weaveQuantum,
      currentHeat: session.grid?.currentHeat,
      heatPowerMultiplier: session.mechanicsOverrides?.heatPowerMultiplier,
      protiumParticles: session.systems?.economy?.protiumParticles,
    });
  }
  applyCompiledCatalogPart(part, compiled);
}

export function applyCompiledCatalogPart(part, compiled) {
  if (!part || !compiled) return false;
  const def = compiled.definition;
  part.ticks = compiled.baseTicks ?? part.ticks;
  part.containment = compiled.containment ?? part.containment;
  part.reactor_power = compiled.reactorPower ?? part.reactor_power;
  part.reactor_heat = compiled.reactorHeat ?? part.reactor_heat;
  part.vent = compiled.vent ?? part.vent;
  part.transfer = compiled.transfer ?? part.transfer;
  part.perpetual = !!compiled.perpetual;
  if (compiled.baseCost != null) {
    part.cost = compiled.baseCost;
    part.base_cost = compiled.baseCost;
  }
  part.power = compiled.power ?? compiled.basePower ?? part.power;
  part.heat = compiled.heat ?? compiled.baseHeat ?? part.heat;
  const powerIncrease = compiled.powerIncrease ?? def?.powerIncrease;
  if (powerIncrease != null) part.power_increase = powerIncrease;
  const heatIncrease = compiled.heatIncrease ?? def?.heatIncrease;
  if (heatIncrease != null) part.heat_increase = heatIncrease;
  if (compiled.epHeat != null) part.ep_heat = compiled.epHeat;
  else if (def?.epHeat != null) part.ep_heat = def.epHeat;
  if (def?.range != null) part.range = def.range;
  else if (part.part?.range != null) part.range = part.part.range;
  if (part.category === "reflector") {
    part.neighbor_pulse_value = Math.max(0, 1 + (part.power_increase || 0) / PERCENT_DIVISOR);
  }
  if (part.category === "valve" && part.part?.transfer_multiplier) {
    part.transfer = (compiled.transfer ?? part.base_transfer ?? 0) * part.part.transfer_multiplier;
  }
  part.ecost = part.base_ecost;
  return true;
}

function buildPartDescription(part, fmtFn, tile_context = null) {
  const bridge = part.game?.coreBridge;
  const extras = {
    transfer: tile_context ? (tile_context.getEffectiveTransferValue?.() ?? part.transfer) : part.transfer,
    vent: tile_context ? (tile_context.getEffectiveVentValue?.() ?? part.vent) : part.vent,
    power: part.power,
    heat: part.heat,
    range: part.range,
    fmt: fmtFn,
  };
  if (bridge?.isActive && bridge.session?.getPartDescription) {
    return bridge.session.getPartDescription(part.id, {
      template: part.part?.base_description ?? part.base_description,
      ...extras,
    }).text;
  }
  return formatPartDescription(
    {
      id: part.id,
      title: part.title,
      category: part.category,
      level: part.level,
      baseTicks: part.ticks,
      basePower: part.power,
      baseHeat: part.heat,
      containment: part.containment,
      reactorPower: part.reactor_power,
      reactorHeat: part.reactor_heat,
      vent: part.vent,
      transfer: part.transfer,
      powerIncrease: part.power_increase,
      heatIncrease: part.heat_increase,
      cellCount: part.cell_count,
      epHeat: part.ep_heat,
      baseDescription: part.part?.base_description ?? part.base_description,
      definition: part.part,
    },
    part.part?.base_description ?? part.base_description,
    extras,
  ).text;
}

export class Part {
  constructor(part_definition, game) {
    this.game = game;
    this.part = part_definition;
    this.id = part_definition.id;
    this.title = part_definition.title;
    this.category = part_definition.category;
    this.type = part_definition.type;
    this.level = part_definition.level;
    this.experimental = part_definition.experimental;
    this.base_power = part_definition.base_power;
    this.base_heat = part_definition.base_heat;
    this.base_ticks = part_definition.base_ticks;
    this.base_containment = part_definition.base_containment ?? (this.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0);
    this.base_vent = part_definition.base_vent;
    this.base_reactor_power = part_definition.base_reactor_power;
    this.base_reactor_heat = part_definition.base_reactor_heat;
    this.base_transfer = part_definition.base_transfer;
    this.base_ep_heat = part_definition.base_ep_heat;
    this.base_power_increase = part_definition.base_power_increase;
    this.base_heat_increase = part_definition.base_heat_increase;
    this.base_ecost = part_definition.base_ecost;
    this.base_cost = part_definition.base_cost;

    this.location = part_definition.location ?? null;
    this.base_description = part_definition.base_description;
    this.valve_group = part_definition.valve_group ?? null;
    this.activation_threshold = part_definition.activation_threshold ?? null;
    this.transfer_direction = part_definition.transfer_direction ?? null;

    this.erequires = part_definition.erequires ?? null;
    this.cost = part_definition.base_cost;
    this.perpetual = false;
    this.description = "";
    this.cell_count = part_definition.cell_count;
    this.cell_pack_M = part_definition.cell_pack_M ?? 1;
    this.cell_count_C = part_definition.cell_count_C ?? 1;
    this.affordable = false;
    this.$el = null;
    this.className = "";
    this.vent_consumes_power = !!part_definition.vent_consumes_power;
    this.outlet_respect_neighbor_cap = !!part_definition.outlet_respect_neighbor_cap;
    this.capacitor_autosell_heat_ratio =
      typeof part_definition.capacitor_autosell_heat_ratio === "number" ? part_definition.capacitor_autosell_heat_ratio : 0;
    this.traits = (Array.isArray(part_definition.traits) && part_definition.traits.length > 0) ? part_definition.traits : (this.category === "cell" ? ["FUEL_CELL"] : []);
    this.trait_mask = part_definition.trait_mask || compileTraitBitmask(this.traits);

    this.recalculate_stats();
    this.updateDescription();
  }

  recalculate_stats() {
    recalculatePartStats(this);
    this.updateDescription();
  }

  getCacheKinds(tile) {
    const c = this.category;
    const cells = c === "cell" && tile?.ticks > 0;
    const inlets = c === "heat_inlet";
    const exchangers = c === "heat_exchanger" || c === "valve" || (c === "reactor_plating" && this.transfer > 0);
    const valves = c === "valve";
    const outlets = c === "heat_outlet" && tile?.activated;
    const vents = c === "vent";
    const capacitors = c === "capacitor";
    const vessels = c === "vent" || (this.vent > 0) || c === "particle_accelerator" || (this.containment > 0 && c !== "valve");
    return { cells, inlets, exchangers, valves, outlets, vents, capacitors, vessels };
  }

  getImagePath() {
    return getPartImagePath({ type: this.type, category: this.category, level: this.level, id: this.id });
  }

  updateDescription(tile_context = null) {
    this.description = buildPartDescription(this, fmt, tile_context);
  }

  setAffordable(isAffordable) {
    this.affordable = isAffordable;
  }

  getUpgradeBonusLines() {
    return getUpgradeBonusLines(this, { tile: null, game: this.game });
  }

  getAutoReplacementCost() {
    const bridge = this.game?.coreBridge;
    if (!bridge?.isActive || !bridge.session) return toDecimal(0);
    return toDecimal(bridge.session.partAutoReplaceCost(this.id));
  }
}

function generatePartDefinition(template, level) {
  const partDef = { ...template, level };

  if (template.levels) {
    partDef.id = resolveCellTierPartId(template.type, level);
  } else if (template.id) {
    partDef.id = template.id;
  } else {
    partDef.id = `${template.type}${level}`;
  }

  if (template.levels) {
    partDef.base_cost = template.base_cost.mul(Math.pow(template.cost_multi, level - 1));
  } else {
    partDef.base_cost = template.base_cost;
  }

  if (partDef.category === "cell") {
    applyCellProperties(partDef, template, level);
    return partDef;
  }
  applyGenericPartProperties(partDef, template, level);
  return partDef;
}

function applyCellProperties(partDef, template, level) {
  const form = CELL_FORM_FACTORS[level - 1] || CELL_FORM_FACTORS[0];
  partDef.title = `${form.titlePrefix}${template.title}`;
  partDef.base_description = template.base_description || (level > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL);
  partDef.base_power = template.base_power;
  partDef.base_heat = template.base_heat;
  partDef.cell_pack_M = form.cellPackM;
  partDef.cell_count_C = form.cellCount;
  partDef.cell_count = form.cellCount;
}

function applyGenericPartProperties(partDef, template, level) {
  if (template.title && !template.experimental) {
    partDef.title = template.title;
  } else {
    partDef.title = template.experimental ? template.title : `${PART_TITLE_PREFIXES[level - 1] || ""}${template.title || template.type}`;
  }

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

export function buildPartCatalog(rawParts = bundledGameData.parts) {
  const templates = z.array(PartDefinitionSchema).parse(rawParts);
  const catalog = [];
  const categoryTypeOrder = new Map();
  const typeOrderIndex = new Map();

  templates.forEach((template) => {
    if (template.category) {
      const arr = categoryTypeOrder.get(template.category) || [];
      if (!arr.includes(template.type)) {
        arr.push(template.type);
        categoryTypeOrder.set(template.category, arr);
        typeOrderIndex.set(`${template.category}:${template.type}`, arr.length - 1);
      }
    }
    if (template.levels) {
      for (let i = 0; i < template.levels; i++) {
        catalog.push(generatePartDefinition(template, i + 1));
      }
    } else {
      catalog.push(generatePartDefinition(template, template.level));
    }
  });

  return { catalog, categoryTypeOrder, typeOrderIndex };
}

export class PartSet {
  constructor(game) {
    this.game = game;
    this.parts = new Map();
    this.partsArray = [];
    this.initialized = false;
    this.categoryTypeOrder = new Map();
    this.typeOrderIndex = new Map();
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

    logger.log('info', 'game', 'Loading part list data...');
    const { catalog, categoryTypeOrder, typeOrderIndex } = buildPartCatalog();
    this.categoryTypeOrder = categoryTypeOrder;
    this.typeOrderIndex = typeOrderIndex;
    logger.log('debug', 'game', 'Part list data loaded:', {
      count: catalog.length,
      categories: [...new Set(catalog.map((p) => p.category))]
    });

    catalog.forEach((partDef) => {
      const partInstance = new Part(partDef, this.game);
      this.parts.set(partInstance.id, partInstance);
      this.partsArray.push(partInstance);
    });

    this.initialized = true;
    return this.partsArray;
  }

  generatePartDefinition(template, level) {
    return generatePartDefinition(template, level);
  }

  _applyCellProperties(partDef, template, level) {
    applyCellProperties(partDef, template, level);
  }

  _applyGenericPartProperties(partDef, template, level) {
    applyGenericPartProperties(partDef, template, level);
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
