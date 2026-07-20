import { toDecimal } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { getActiveBridge, requireActiveBridge } from "../bridge/active.js";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;

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

export function applyCompiledPartFields(part, compiled) {
  if (!part || !compiled) return;
  const fallback = part.part || compiled;
  const def = compiled.definition || fallback.definition || {};

  part.cost = toDecimal(compiled.baseCost ?? fallback.base_cost ?? 0);
  part.base_cost = part.cost;
  part.ecost = toDecimal(compiled.baseEcost ?? fallback.base_ecost ?? 0);
  part.base_ecost = part.ecost;

  part.power = compiled.power ?? compiled.basePower ?? fallback.base_power ?? 0;
  part.base_power = compiled.basePower
    ?? compiled.base_power
    ?? fallback.basePower
    ?? fallback.base_power
    ?? part.power;

  part.heat = compiled.heat ?? compiled.baseHeat ?? fallback.base_heat ?? 0;
  part.base_heat = compiled.baseHeat ?? compiled.base_heat ?? fallback.baseHeat ?? fallback.base_heat ?? part.heat;

  part.ticks = compiled.baseTicks ?? fallback.base_ticks ?? 0;
  part.base_ticks = part.ticks;

  part.containment = compiled.containment
    ?? fallback.base_containment
    ?? (part.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0);
  part.base_containment = part.containment;

  part.vent = compiled.vent ?? fallback.base_vent ?? 0;
  part.base_vent = fallback.baseVent ?? fallback.base_vent ?? fallback.vent ?? part.vent;

  part.transfer = compiled.transfer
    ?? def.baseTransfer
    ?? fallback.base_transfer
    ?? 0;
  part.base_transfer = fallback.baseTransfer ?? fallback.base_transfer ?? fallback.transfer ?? part.transfer;

  part.reactor_power = compiled.reactorPower ?? fallback.base_reactor_power ?? 0;
  part.base_reactor_power = part.reactor_power;
  part.reactor_heat = compiled.reactorHeat ?? fallback.base_reactor_heat ?? 0;
  part.base_reactor_heat = part.reactor_heat;

  part.power_increase = compiled.powerIncrease
    ?? def.powerIncrease
    ?? fallback.base_power_increase
    ?? 0;
  part.base_power_increase = part.power_increase;
  part.heat_increase = compiled.heatIncrease
    ?? def.heatIncrease
    ?? fallback.base_heat_increase
    ?? 0;
  part.base_heat_increase = part.heat_increase;

  part.ep_heat = compiled.epHeat ?? compiled.baseEpHeat ?? fallback.base_ep_heat ?? 0;
  part.base_ep_heat = compiled.baseEpHeat ?? fallback.base_ep_heat ?? part.ep_heat;

  part.range = def.range ?? fallback.range ?? 1;
  part.perpetual = !!compiled.perpetual;
  part.transfer_multiplier = compiled.transferMultiplier
    ?? def.transferMultiplier
    ?? fallback.transfer_multiplier
    ?? null;
  part.neighbor_pulse_value = compiled.neighborPulseValue ?? null;

  part.cell_count = compiled.cellCount ?? fallback.cell_count ?? null;
  part.cell_pack_M = compiled.cellMultiplier ?? fallback.cell_pack_M ?? 1;
  part.cell_count_C = compiled.cellCount ?? fallback.cell_count_C ?? 1;
}

export function refreshPartsFromSession(partset) {
  const bridge = getActiveBridge(partset?.game);
  const list = partset?.partsArray;
  if (!bridge?.session || !list) return;
  for (let i = 0; i < list.length; i++) {
    const part = list[i];
    const compiled = bridge.session.getPart?.(part.id);
    if (compiled) applyCompiledPartFields(part, compiled);
  }
}

export function createPart(part_definition) {
  const def = part_definition.definition || {};
  const part = {
    part: part_definition,
    id: part_definition.id || def.id,
    category: part_definition.category,
    type: part_definition.type,
    title: part_definition.title,
    level: part_definition.level ?? 1,
    experimental: !!part_definition.experimental,
    base_description: part_definition.baseDescription ?? part_definition.base_description,
    erequires: part_definition.erequires ?? null,
    location: part_definition.location ?? def.location ?? null,
    valve_group: part_definition.valveGroup ?? part_definition.valve_group ?? def.valveGroup ?? def.valve_group ?? null,
    activation_threshold: part_definition.activationThreshold ?? part_definition.activation_threshold ?? def.activationThreshold ?? def.activation_threshold ?? null,
    transfer_direction: part_definition.transferDirection ?? part_definition.transfer_direction ?? def.transferDirection ?? def.transfer_direction ?? null,
    vent_consumes_power: !!(part_definition.ventConsumesPower ?? part_definition.vent_consumes_power ?? def.ventConsumesPower),
    outlet_respect_neighbor_cap: !!(part_definition.outletRespectNeighborCap ?? part_definition.outlet_respect_neighbor_cap ?? def.outletRespectNeighborCap),
    capacitor_autosell_heat_ratio: typeof part_definition.capacitorAutosellHeatRatio === "number"
      ? part_definition.capacitorAutosellHeatRatio
      : (typeof def.capacitorAutosellHeatRatio === "number"
        ? def.capacitorAutosellHeatRatio
        : (part_definition.capacitor_autosell_heat_ratio || 0)),
    affordable: false,
  };
  applyCompiledPartFields(part, part_definition);
  return part;
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
    const bridge = requireActiveBridge(this.game, "PartSet.initialize");

    logger.log("info", "game", "Loading part list data...");
    const compiledList = bridge.session.listParts() || [];
    const { categoryTypeOrder, typeOrderIndex } = buildCategoryOrders(compiledList);
    this.categoryTypeOrder = categoryTypeOrder;
    this.typeOrderIndex = typeOrderIndex;

    for (let i = 0; i < compiledList.length; i++) {
      const compiled = compiledList[i];
      if (!compiled?.id) continue;
      const partInstance = createPart(compiled);
      this.parts.set(partInstance.id, partInstance);
      this.partsArray.push(partInstance);
    }

    this.initialized = true;
    refreshPartsFromSession(this);
    return this.partsArray;
  }

  check_affordability(game) {
    if (!game) return;
    refreshPartsFromSession(this);
    const bridge = getActiveBridge(game);
    const economy = bridge?.session?.getEconomySnapshot?.() ?? null;
    const money = toDecimal(game.state?.current_money ?? economy?.money ?? 0);
    const ep = toDecimal(game.state?.current_exotic_particles ?? economy?.currentExoticParticles ?? 0);

    this.partsArray.forEach((part) => {
      if (game.reactor && game.reactor.has_melted_down) {
        part.affordable = false;
        return;
      }
      if (this.isPartDoctrineLocked(part)) {
        part.affordable = false;
        return;
      }

      const isUnlocked = this.game?.unlockManager && typeof this.game.unlockManager.isPartUnlocked === "function"
        ? this.game.unlockManager.isPartUnlocked(part)
        : true;

      let isAffordable = false;
      if (part.erequires) {
        const reqLevel = bridge?.session?.getUpgradeLevel?.(part.erequires)
          ?? game.upgradeset.getUpgrade(part.erequires)?.level
          ?? 0;
        if (reqLevel > 0 && isUnlocked) {
          isAffordable = part.ecost?.gt?.(0) ? ep.gte(part.ecost) : money.gte(part.cost);
        }
      } else if (isUnlocked) {
        isAffordable = money.gte(part.cost);
      }
      part.affordable = isAffordable;
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
