import { toDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { getPartImagePath } from "../core/part-images.js";
import { getUpgradeBonusLines } from "../logic-tooltip-stats.js";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;

const applyCompiledCatalogPart = (part, compiled) => {

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
  if (compiled.neighborPulseValue != null) part.neighbor_pulse_value = compiled.neighborPulseValue;
  if (compiled.transferMultiplier != null) part.transfer_multiplier = compiled.transferMultiplier;
  part.ecost = part.base_ecost;
  return true;
};

const recalculatePartStats = (part) => {
  const bridge = part.game?.coreBridge;
  if (!bridge?.isActive || !bridge.session) {
    throw new Error("recalculatePartStats requires an active core session");
  }
  bridge.syncReactorScalarsFromGame?.();
  const compiled = bridge.session.getPart?.(part.id);
  if (!compiled) throw new Error(`Part catalog missing id: ${part.id}`);
  applyCompiledCatalogPart(part, compiled);
};

const buildPartDescription = (part, fmtFn, tile_context = null) => {
  const bridge = part.game?.coreBridge;
  if (!bridge?.isActive || !bridge.session?.getPartDescription) {
    throw new Error("buildPartDescription requires an active core session");
  }
  const extras = {
    transfer: tile_context ? (tile_context.getEffectiveTransferValue?.() ?? part.transfer) : part.transfer,
    vent: tile_context ? (tile_context.getEffectiveVentValue?.() ?? part.vent) : part.vent,
    power: part.power,
    heat: part.heat,
    range: part.range,
    fmt: fmtFn,
  };
  return bridge.session.getPartDescription(part.id, {
    template: part.part?.base_description ?? part.base_description,
    ...extras,
  }).text;
};

const partShellFromCompiled = (compiled) => {
  const def = compiled.definition || {};
  return {
    id: compiled.id,
    title: compiled.title,
    category: compiled.category,
    type: compiled.type,
    level: compiled.level ?? 1,
    experimental: !!compiled.experimental,
    base_power: compiled.basePower ?? 0,
    base_heat: compiled.baseHeat ?? 0,
    base_ticks: compiled.baseTicks ?? 0,
    base_containment: compiled.containment ?? (compiled.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0),
    base_vent: compiled.vent ?? 0,
    base_reactor_power: compiled.reactorPower ?? 0,
    base_reactor_heat: compiled.reactorHeat ?? 0,
    base_transfer: def.baseTransfer ?? compiled.transfer ?? 0,
    base_ep_heat: compiled.baseEpHeat ?? compiled.epHeat ?? 0,
    base_power_increase: compiled.powerIncrease ?? 0,
    base_heat_increase: compiled.heatIncrease ?? 0,
    base_ecost: toDecimal(0),
    base_cost: toDecimal(compiled.baseCost ?? 0),
    base_description: compiled.baseDescription ?? null,
    erequires: compiled.erequires ?? null,
    cell_count: compiled.cellCount ?? null,
    cell_pack_M: compiled.cellMultiplier ?? 1,
    cell_count_C: compiled.cellCount ?? 1,
    location: def.location ?? null,
    valve_group: def.valveGroup ?? def.valve_group ?? null,
    activation_threshold: def.activationThreshold ?? def.activation_threshold ?? null,
    transfer_direction: def.transferDirection ?? def.transfer_direction ?? null,
    vent_consumes_power: !!def.ventConsumesPower,
    outlet_respect_neighbor_cap: !!def.outletRespectNeighborCap,
    capacitor_autosell_heat_ratio: typeof def.capacitorAutosellHeatRatio === "number" ? def.capacitorAutosellHeatRatio : 0,
    range: def.range ?? 1,
    transfer_multiplier: compiled.transferMultiplier ?? def.transferMultiplier ?? def.transfer_multiplier ?? null,
    neighbor_pulse_value: compiled.neighborPulseValue ?? null,
  };
};

const buildCategoryOrders = (compiledList) => {
  const categoryTypeOrder = new Map();
  const typeOrderIndex = new Map();
  for (let i = 0; i < compiledList.length; i++) {
    const c = compiledList[i];
    if (!c?.category || !c?.type) continue;
    const arr = categoryTypeOrder.get(c.category) || [];
    if (!arr.includes(c.type)) {
      arr.push(c.type);
      categoryTypeOrder.set(c.category, arr);
      typeOrderIndex.set(`${c.category}:${c.type}`, arr.length - 1);
    }
  }
  return { categoryTypeOrder, typeOrderIndex };
};

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
    this.range = part_definition.range ?? 1;
    this.recalculate_stats();
    this.updateDescription();
  }

  recalculate_stats() {
    recalculatePartStats(this);
    this.updateDescription();
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
    if (!bridge?.isActive || !bridge.session) {
      throw new Error("getAutoReplacementCost requires an active core session");
    }
    return toDecimal(bridge.session.partAutoReplaceCost(this.id));
  }
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
    if (this.initialized) return this.partsArray;

    const session = this.game?.coreBridge?.session;
    if (!session?.listParts) {
      throw new Error("PartSet.initialize requires an active core session");
    }

    logger.log("info", "game", "Loading part list data...");
    const compiledList = session.listParts() || [];
    const { categoryTypeOrder, typeOrderIndex } = buildCategoryOrders(compiledList);
    this.categoryTypeOrder = categoryTypeOrder;
    this.typeOrderIndex = typeOrderIndex;

    logger.log("debug", "game", "Part list data loaded:", {
      count: compiledList.length,
      categories: [...new Set(compiledList.map((p) => p.category))],
    });

    for (let i = 0; i < compiledList.length; i++) {
      const compiled = compiledList[i];
      if (!compiled?.id) continue;
      const partInstance = new Part(partShellFromCompiled(compiled), this.game);
      this.parts.set(partInstance.id, partInstance);
      this.partsArray.push(partInstance);
    }

    this.initialized = true;
    return this.partsArray;
  }

  updateCellPower() {
    this.partsArray.forEach((part) => {
      if (part.category === "cell") part.recalculate_stats();
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
      const isUnlocked = this.game?.unlockManager && typeof this.game.unlockManager.isPartUnlocked === "function"
        ? this.game.unlockManager.isPartUnlocked(part)
        : true;
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
}
