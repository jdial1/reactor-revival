import { toDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../core/numbers.js";
import { logger } from "../core/logger.js";
import { getPartImagePath } from "../core/part-images.js";
import { getUpgradeBonusLines } from "../components/tooltip-stats.js";
import { getActiveBridge, requireActiveBridge } from "../bridge/active.js";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;

const buildPartDescription = (part, fmtFn, tile_context = null) => {
  const bridge = requireActiveBridge(part.game, "buildPartDescription");
  const extras = {
    transfer: tile_context ? (tile_context.getEffectiveTransferValue?.() ?? part.transfer) : part.transfer,
    vent: tile_context ? (tile_context.getEffectiveVentValue?.() ?? part.vent) : part.vent,
    power: part.power,
    heat: part.heat,
    range: part.range,
    fmt: fmtFn,
  };
  return bridge.session.getPartDescription(part.id, {
    template: part.part?.baseDescription ?? part.part?.base_description ?? part.base_description,
    ...extras,
  }).text;
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
    const def = part_definition.definition || {};

    this.id = part_definition.id || def.id;
    this.category = part_definition.category;
    this.type = part_definition.type;

    this.title = part_definition.title;
    this.level = part_definition.level ?? 1;
    this.experimental = !!part_definition.experimental;
    this.base_description = part_definition.baseDescription ?? part_definition.base_description;
    this.erequires = part_definition.erequires ?? null;
    this.location = part_definition.location ?? def.location ?? null;
    this.valve_group = part_definition.valveGroup ?? part_definition.valve_group ?? def.valveGroup ?? def.valve_group ?? null;
    this.activation_threshold = part_definition.activationThreshold ?? part_definition.activation_threshold ?? def.activationThreshold ?? def.activation_threshold ?? null;
    this.transfer_direction = part_definition.transferDirection ?? part_definition.transfer_direction ?? def.transferDirection ?? def.transfer_direction ?? null;
    this.vent_consumes_power = !!(part_definition.ventConsumesPower ?? part_definition.vent_consumes_power ?? def.ventConsumesPower);
    this.outlet_respect_neighbor_cap = !!(part_definition.outletRespectNeighborCap ?? part_definition.outlet_respect_neighbor_cap ?? def.outletRespectNeighborCap);
    this.capacitor_autosell_heat_ratio = typeof part_definition.capacitorAutosellHeatRatio === "number"
      ? part_definition.capacitorAutosellHeatRatio
      : (typeof def.capacitorAutosellHeatRatio === "number"
        ? def.capacitorAutosellHeatRatio
        : (part_definition.capacitor_autosell_heat_ratio || 0));

    this.affordable = false;
    this.$el = null;
    this.className = "";
    this.description = "";
    this._decCache = Object.create(null);
    this._overrides = Object.create(null);

    this.updateDescription();
  }

  _getDef() {
    const bridge = getActiveBridge(this.game);
    if (!bridge) return this.part;
    return bridge.session.getPart?.(this.id) || this.part;
  }

  _ov(key, resolve) {
    if (Object.prototype.hasOwnProperty.call(this._overrides, key)) {
      return this._overrides[key];
    }
    return resolve();
  }

  _setOv(key, value) {
    this._overrides[key] = value;
  }

  _cachedDecimal(key, raw) {
    const entry = this._decCache[key];
    if (entry && entry.raw === raw) return entry.value;
    const value = toDecimal(raw);
    this._decCache[key] = { raw, value };
    return value;
  }

  get cost() {
    return this._ov("cost", () =>
      this._cachedDecimal("cost", this._getDef().baseCost ?? this.part.base_cost ?? 0));
  }
  set cost(v) { this._setOv("cost", toDecimal(v)); }
  get base_cost() { return this._ov("base_cost", () => this.cost); }
  set base_cost(v) { this._setOv("base_cost", toDecimal(v)); this.cost = v; }

  get ecost() {
    return this._ov("ecost", () =>
      this._cachedDecimal("ecost", this._getDef().baseEcost ?? this.part.base_ecost ?? 0));
  }
  set ecost(v) { this._setOv("ecost", toDecimal(v)); }
  get base_ecost() { return this._ov("base_ecost", () => this.ecost); }
  set base_ecost(v) { this._setOv("base_ecost", toDecimal(v)); this.ecost = v; }

  get power() {
    return this._ov("power", () => this._getDef().power ?? this._getDef().basePower ?? this.part.base_power ?? 0);
  }
  set power(v) { this._setOv("power", v); }
  get base_power() {
    return this._ov("base_power", () =>
      this._getDef().basePower
        ?? this._getDef().base_power
        ?? this.part?.basePower
        ?? this.part?.base_power
        ?? this.power);
  }
  set base_power(v) { this._setOv("base_power", v); this.power = v; }

  get heat() {
    return this._ov("heat", () => this._getDef().heat ?? this._getDef().baseHeat ?? this.part.base_heat ?? 0);
  }
  set heat(v) { this._setOv("heat", v); }
  get base_heat() { return this._ov("base_heat", () => this.heat); }
  set base_heat(v) { this._setOv("base_heat", v); this.heat = v; }

  get ticks() {
    return this._ov("ticks", () => this._getDef().baseTicks ?? this.part.base_ticks ?? 0);
  }
  set ticks(v) { this._setOv("ticks", v); }
  get base_ticks() { return this._ov("base_ticks", () => this.ticks); }
  set base_ticks(v) { this._setOv("base_ticks", v); this.ticks = v; }

  get containment() {
    return this._ov("containment", () =>
      this._getDef().containment
        ?? this.part.base_containment
        ?? (this.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0));
  }
  set containment(v) { this._setOv("containment", v); }
  get base_containment() { return this._ov("base_containment", () => this.containment); }
  set base_containment(v) { this._setOv("base_containment", v); this.containment = v; }

  get vent() {
    return this._ov("vent", () => this._getDef().vent ?? this.part.base_vent ?? 0);
  }
  set vent(v) { this._setOv("vent", v); }
  get base_vent() {
    return this._ov("base_vent", () => this.part.base_vent ?? this.part.baseVent ?? this.vent);
  }
  set base_vent(v) { this._setOv("base_vent", v); }

  get transfer() {
    return this._ov("transfer", () =>
      this._getDef().transfer
        ?? this._getDef().definition?.baseTransfer
        ?? this.part.base_transfer
        ?? 0);
  }
  set transfer(v) { this._setOv("transfer", v); }
  get base_transfer() {
    return this._ov("base_transfer", () =>
      this.part.base_transfer ?? this.part.baseTransfer ?? this.transfer);
  }
  set base_transfer(v) { this._setOv("base_transfer", v); }

  get reactor_power() {
    return this._ov("reactor_power", () => this._getDef().reactorPower ?? this.part.base_reactor_power ?? 0);
  }
  set reactor_power(v) { this._setOv("reactor_power", v); }
  get base_reactor_power() { return this._ov("base_reactor_power", () => this.reactor_power); }
  set base_reactor_power(v) { this._setOv("base_reactor_power", v); this.reactor_power = v; }

  get reactor_heat() {
    return this._ov("reactor_heat", () => this._getDef().reactorHeat ?? this.part.base_reactor_heat ?? 0);
  }
  set reactor_heat(v) { this._setOv("reactor_heat", v); }
  get base_reactor_heat() { return this._ov("base_reactor_heat", () => this.reactor_heat); }
  set base_reactor_heat(v) { this._setOv("base_reactor_heat", v); this.reactor_heat = v; }

  get power_increase() {
    return this._ov("power_increase", () =>
      this._getDef().powerIncrease
        ?? this._getDef().definition?.powerIncrease
        ?? this.part.base_power_increase
        ?? 0);
  }
  set power_increase(v) { this._setOv("power_increase", v); }
  get base_power_increase() { return this._ov("base_power_increase", () => this.power_increase); }
  set base_power_increase(v) { this._setOv("base_power_increase", v); this.power_increase = v; }

  get heat_increase() {
    return this._ov("heat_increase", () =>
      this._getDef().heatIncrease
        ?? this._getDef().definition?.heatIncrease
        ?? this.part.base_heat_increase
        ?? 0);
  }
  set heat_increase(v) { this._setOv("heat_increase", v); }
  get base_heat_increase() { return this._ov("base_heat_increase", () => this.heat_increase); }
  set base_heat_increase(v) { this._setOv("base_heat_increase", v); this.heat_increase = v; }

  get ep_heat() {
    return this._ov("ep_heat", () => this._getDef().epHeat ?? this._getDef().baseEpHeat ?? this.part.base_ep_heat ?? 0);
  }
  set ep_heat(v) { this._setOv("ep_heat", v); }
  get base_ep_heat() { return this._ov("base_ep_heat", () => this.ep_heat); }
  set base_ep_heat(v) { this._setOv("base_ep_heat", v); this.ep_heat = v; }

  get range() { return this._ov("range", () => this._getDef().definition?.range ?? this.part.range ?? 1); }
  set range(v) { this._setOv("range", v); }
  get perpetual() { return this._ov("perpetual", () => !!this._getDef().perpetual); }
  set perpetual(v) { this._setOv("perpetual", !!v); }
  get transfer_multiplier() {
    return this._ov("transfer_multiplier", () =>
      this._getDef().transferMultiplier
        ?? this._getDef().definition?.transferMultiplier
        ?? this.part.transfer_multiplier
        ?? null);
  }
  set transfer_multiplier(v) { this._setOv("transfer_multiplier", v); }
  get neighbor_pulse_value() {
    return this._ov("neighbor_pulse_value", () => this._getDef().neighborPulseValue ?? null);
  }
  set neighbor_pulse_value(v) { this._setOv("neighbor_pulse_value", v); }

  get cell_count() {
    return this._ov("cell_count", () => this._getDef().cellCount ?? this.part.cell_count ?? null);
  }
  set cell_count(v) { this._setOv("cell_count", v); }
  get cell_pack_M() {
    return this._ov("cell_pack_M", () => this._getDef().cellMultiplier ?? this.part.cell_pack_M ?? 1);
  }
  set cell_pack_M(v) { this._setOv("cell_pack_M", v); }
  get cell_count_C() {
    return this._ov("cell_count_C", () => this._getDef().cellCount ?? this.part.cell_count_C ?? 1);
  }
  set cell_count_C(v) { this._setOv("cell_count_C", v); }

  recalculate_stats() {
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
    const bridge = requireActiveBridge(this.game, "getAutoReplacementCost");
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
    const bridge = requireActiveBridge(this.game, "PartSet.initialize");

    logger.log("info", "game", "Loading part list data...");
    const compiledList = bridge.session.listParts() || [];
    const { categoryTypeOrder, typeOrderIndex } = buildCategoryOrders(compiledList);
    this.categoryTypeOrder = categoryTypeOrder;
    this.typeOrderIndex = typeOrderIndex;

    for (let i = 0; i < compiledList.length; i++) {
      const compiled = compiledList[i];
      if (!compiled?.id) continue;
      const partInstance = new Part(compiled, this.game);
      this.parts.set(partInstance.id, partInstance);
      this.partsArray.push(partInstance);
    }

    this.initialized = true;
    return this.partsArray;
  }

  updateCellPower() {
    this.partsArray.forEach((part) => {
      if (part.category === "cell") part.updateDescription();
    });
  }

  check_affordability(game) {
    if (!game) return;
    const bridge = getActiveBridge(game);
    const economy = bridge?.session?.getEconomySnapshot?.() ?? null;
    const money = toDecimal(game.state?.current_money ?? economy?.money ?? 0);
    const ep = toDecimal(game.state?.current_exotic_particles ?? economy?.currentExoticParticles ?? 0);

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
        const reqLevel = bridge?.session?.getUpgradeLevel?.(part.erequires)
          ?? game.upgradeset.getUpgrade(part.erequires)?.level
          ?? 0;
        if (reqLevel > 0 && isUnlocked) {
          isAffordable = part.ecost?.gt?.(0) ? ep.gte(part.ecost) : money.gte(part.cost);
        }
      } else if (isUnlocked) {
        isAffordable = money.gte(part.cost);
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
