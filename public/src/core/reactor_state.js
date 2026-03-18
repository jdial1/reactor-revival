import { toDecimal, toNumber, logger } from "../utils/utils_constants.js";
import {
  MOBILE_BREAKPOINT_PX,
  HEAT_EPSILON,
  TICKS_FULL_CYCLE,
  TICKS_10PCT,
  CRITICAL_HEAT_RATIO,
  REFERENCE_POWER,
  OVERRIDE_DURATION_MS,
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
  CLASSIFICATION_HISTORY_MAX,
  MARK_II_E_THRESHOLD_CYCLES,
  MAX_SUBCLASS_CYCLES,
  REFLECTOR_COOLING_MIN_MULTIPLIER,
  HEAT_POWER_LOG_CAP,
  HEAT_POWER_LOG_BASE,
  PERCENT_DIVISOR,
  MELTDOWN_HEAT_MULTIPLIER,
  FLUX_ACCUMULATOR_POWER_RATIO_MIN,
} from "../utils/utils_constants.js";
import { setDecimal, subscribeKey } from "./store.js";
import { addPartIconsToTitle as addPartIconsToTitleHelper, getObjectiveScrollDuration as getObjectiveScrollDurationHelper, checkObjectiveTextScrolling as checkObjectiveTextScrollingHelper } from "./objective_system.js";

function applyReflectorEffects(tile, reactor, onReflectorPulse) {
  let reflector_power_bonus = 0;
  let reflector_heat_bonus = 0;
  let reflector_count = 0;
  tile.reflectorNeighborTiles.forEach((r_tile) => {
    if (r_tile.ticks > 0) {
      reflector_count++;
      reflector_power_bonus += r_tile.part.power_increase || 0;
      reflector_heat_bonus += r_tile.part.heat_increase || 0;
      if (onReflectorPulse) {
        try {
          onReflectorPulse(r_tile, tile);
        } catch (_) {}
      }
    }
  });
  if (typeof tile.power === "number" && !isNaN(tile.power)) {
    tile.power *= Math.max(0, 1 + reflector_power_bonus / PERCENT_DIVISOR);
  }
  if (typeof tile.heat === "number" && !isNaN(tile.heat)) {
    let heatMult = Math.max(0, 1 + reflector_heat_bonus / PERCENT_DIVISOR);
    if (reactor.reflector_cooling_factor > 0 && reflector_count > 0) {
      const coolingReduction = reflector_count * reactor.reflector_cooling_factor;
      heatMult *= Math.max(REFLECTOR_COOLING_MIN_MULTIPLIER, 1 - coolingReduction);
    }
    tile.heat *= heatMult;
  }
}

function applyCellMultipliers(tile, reactor) {
  if (reactor.heat_power_multiplier > 0 && reactor.current_heat.gt(HEAT_POWER_LOG_BASE)) {
    const heatForLog = Math.min(reactor.current_heat.toNumber(), HEAT_POWER_LOG_CAP);
    tile.power *= 1 + (reactor.heat_power_multiplier * (Math.log(heatForLog) / Math.log(HEAT_POWER_LOG_BASE) / PERCENT_DIVISOR));
    if (!Number.isFinite(tile.power)) {
      tile.power = (tile.part && Number.isFinite(tile.part.base_power)) ? tile.part.base_power : 0;
    }
  }
  if (reactor.manual_override_mult > 0 && Date.now() < reactor.override_end_time) {
    tile.power *= (1 + reactor.manual_override_mult);
  }
  if (reactor.thermal_feedback_rate > 0) {
    let feedbackBonus = 0;
    tile.containmentNeighborTiles.forEach((neighbor) => {
      if (neighbor.part && neighbor.part.category === "coolant_cell") {
        const ratio = neighbor.heat_contained / neighbor.part.containment;
        if (ratio > 0) feedbackBonus += (ratio * PERCENT_DIVISOR) * reactor.thermal_feedback_rate;
      }
    });
    if (feedbackBonus > 0) tile.power *= (1 + (feedbackBonus / PERCENT_DIVISOR));
  }
  if (reactor.volatile_tuning_max > 0) {
    const maxTicks = tile.part.ticks;
    if (maxTicks > 0 && tile.ticks >= 0) {
      const degradation = 1 - (tile.ticks / maxTicks);
      const bonus = reactor.volatile_tuning_max * degradation;
      if (bonus > 0 && typeof tile.power === "number" && !isNaN(tile.power)) tile.power *= (1 + bonus);
    }
  }
}

function computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum) {
  if (tile.part.category === "cell" && tile.ticks > 0) {
    accum.stats_power += tile.power || 0;
    accum.stats_heat_generation += tile.heat || 0;
  }
  if (tile.heat_contained > 0) accum.stats_total_part_heat += tile.heat_contained;
  if (!maxPowerSetExternally) {
    if (tile.part.reactor_power) accum.current_max_power = accum.current_max_power.add(tile.part.reactor_power);
    if (tile.part.id === "reactor_plating6") accum.current_max_power = accum.current_max_power.add(tile.part.reactor_heat);
  }
  if (!maxHeatSetExternally && tile.part.reactor_heat) {
    accum.current_max_heat = accum.current_max_heat.add(tile.part.reactor_heat);
  }
  if (tile.part.category === "capacitor") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_capacitor_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_capacitor_multiplier;
  } else if (tile.part.category === "reactor_plating") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_plating_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_plating_multiplier;
  }
}

function calculateStats(reactor, tileset, ui) {
  const maxPowerSetExternally =
    reactor.max_power.neq(reactor._last_calculated_max_power) &&
    reactor.max_power.neq(reactor.base_max_power);
  const maxHeatSetExternally =
    reactor.max_heat.neq(reactor._last_calculated_max_heat) &&
    reactor.max_heat.neq(reactor.base_max_heat);
  const alteredMaxPowerSet = toDecimal(reactor.altered_max_power).neq(reactor.base_max_power);
  const alteredMaxHeatSet = toDecimal(reactor.altered_max_heat).neq(reactor.base_max_heat);

  const accum = {
    stats_power: 0,
    stats_heat_generation: 0,
    stats_total_part_heat: 0,
    stats_vent: 0,
    stats_inlet: 0,
    stats_outlet: 0,
    current_max_power: maxPowerSetExternally
      ? reactor.max_power
      : (alteredMaxPowerSet ? toDecimal(reactor.altered_max_power) : toDecimal(reactor.base_max_power)),
    current_max_heat: maxHeatSetExternally
      ? reactor.max_heat
      : (alteredMaxHeatSet ? toDecimal(reactor.altered_max_heat) : toDecimal(reactor.base_max_heat)),
    temp_transfer_multiplier: 0,
    temp_vent_multiplier: 0,
  };

  const onReflectorPulse = (r_tile, tile) => {
    reactor.game?.emit?.("reflectorPulse", { r_tile, tile });
  };

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.powerOutput = 0;
      tile.heatOutput = 0;
      tile.display_power = 0;
      tile.display_heat = 0;
      const p = tile.part;
      if (p.category === "cell" && tile.ticks > 0) {
        tile.power = (typeof p.power === "number" && !isNaN(p.power) && isFinite(p.power)) ? p.power : p.base_power || 0;
        tile.heat = (typeof p.heat === "number" && !isNaN(p.heat) && isFinite(p.heat)) ? p.heat : p.base_heat || 0;
      }
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      if (tile.part.category === "cell" && tile.ticks > 0) {
        applyReflectorEffects(tile, reactor, onReflectorPulse);
        applyCellMultipliers(tile, reactor);
      }
      computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum);
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (!tile.part) return;
    accum.stats_vent += tile.getEffectiveVentValue();
    if (tile.part.category === "heat_inlet") accum.stats_inlet += tile.getEffectiveTransferValue();
    if (tile.part.category === "heat_outlet") accum.stats_outlet += tile.getEffectiveTransferValue();
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.display_power = tile.power || 0;
      tile.display_heat = tile.heat || 0;
    }
  });

  accum.stats_power = Number(accum.stats_power || 0);
  accum.stats_heat_generation = Number(accum.stats_heat_generation || 0);
  accum.stats_total_part_heat = Number(accum.stats_total_part_heat || 0);
  if (!isFinite(accum.stats_power) || isNaN(accum.stats_power)) accum.stats_power = 0;
  accum.stats_net_heat = accum.stats_heat_generation - accum.stats_vent - accum.stats_outlet;
  accum.stats_cash = accum.current_max_power.mul(reactor.auto_sell_multiplier);

  return accum;
}

function applyStatsToReactor(reactor, stats) {
  reactor.stats_power = stats.stats_power;
  reactor.stats_heat_generation = stats.stats_heat_generation;
  reactor.stats_total_part_heat = stats.stats_total_part_heat;
  reactor.stats_vent = stats.stats_vent;
  reactor.stats_inlet = stats.stats_inlet;
  reactor.stats_outlet = stats.stats_outlet;
  reactor.stats_net_heat = stats.stats_net_heat;
  reactor.stats_cash = stats.stats_cash;
  reactor.vent_multiplier_eff = stats.temp_vent_multiplier;
  reactor.transfer_multiplier_eff = stats.temp_transfer_multiplier;
  reactor.max_power = stats.current_max_power;
  reactor.max_heat = stats.current_max_heat;
  reactor._last_calculated_max_power = reactor.max_power;
  reactor._last_calculated_max_heat = reactor.max_heat;
}

function computeActiveBuffs(state) {
  const buffs = [];
  const manualOverride = (state.manual_override_mult || 0) > 0 && Date.now() < (state.override_end_time || 0);
  if (manualOverride) {
    buffs.push({ id: "manual_override", icon: "img/ui/nav/nav_play.png", title: "Manual Override" });
  }
  if ((state.power_to_heat_ratio || 0) > 0) {
    const maxHeat = toNumber(state.max_heat ?? 0);
    const currentHeat = toNumber(state.current_heat ?? 0);
    const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
    if (heatPercent > 0.8 && (toNumber(state.current_power ?? 0) || 0) > 0) {
      buffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitors/capacitor_4.png", title: "Electro-Thermal Conversion" });
    }
  }
  const maxPower = toNumber(state.max_power ?? 0);
  if ((state.flux_accumulator_level || 0) > 0 && maxPower > 0) {
    const powerRatio = toNumber(state.current_power ?? 0) / maxPower;
    if (powerRatio >= FLUX_ACCUMULATOR_POWER_RATIO_MIN) {
      buffs.push({ id: "flux_accumulators", icon: "img/parts/capacitors/capacitor_6.png", title: "Flux Accumulators" });
    }
  }
  return buffs;
}

function syncStatsToUI(reactor, _stateManager) {
  const state = reactor.game?.state;
  if (state) {
    state.max_power = reactor.max_power;
    state.max_heat = reactor.max_heat;
    state.stats_power = reactor.stats_power;
    state.stats_heat_generation = reactor.stats_heat_generation;
    state.stats_vent = reactor.stats_vent;
    state.stats_inlet = reactor.stats_inlet;
    state.stats_outlet = reactor.stats_outlet;
    state.stats_net_heat = reactor.stats_net_heat;
    state.stats_cash = reactor.stats_cash;
    state.stats_total_part_heat = reactor.stats_total_part_heat;
    state.manual_override_mult = reactor.manual_override_mult;
    state.override_end_time = reactor.override_end_time;
    state.power_to_heat_ratio = reactor.power_to_heat_ratio;
    state.flux_accumulator_level = reactor.flux_accumulator_level;
    state.auto_sell_multiplier = reactor.auto_sell_multiplier;
    state.heat_controlled = reactor.heat_controlled;
    state.vent_multiplier_eff = reactor.vent_multiplier_eff;
    state.power_overflow_to_heat_ratio = reactor.power_overflow_to_heat_ratio ?? 0.5;
    state.manual_heat_reduce = toNumber(reactor.manual_heat_reduce ?? reactor.game?.base_manual_heat_reduce ?? 1);
    state.active_buffs.length = 0;
    state.active_buffs.push(...computeActiveBuffs(state));
  }
}

function shouldMeltdown(reactor) {
  if (reactor.has_melted_down) return false;
  if (reactor.game.grace_period_ticks > 0) {
    reactor.game.grace_period_ticks--;
    return false;
  }
  return reactor.current_heat.gt(reactor.max_heat.mul(MELTDOWN_HEAT_MULTIPLIER));
}

function executeMeltdown(reactor) {
  const game = reactor.game;
  logger.log('warn', 'engine', '[MELTDOWN] Condition met! Initiating meltdown sequence.');
  game.debugHistory.add('reactor', 'Meltdown triggered', { heat: reactor.current_heat, max_heat: reactor.max_heat });
  reactor.has_melted_down = true;

  if (game.emit) game.emit("meltdown", { hasMeltedDown: true });
  game.emit?.("vibrationRequest", { type: "meltdown" });
  if (game.tooltip_manager) game.tooltip_manager.hide();

  if (game.state) game.state.melting_down = true;

  if (game.engine) game.engine.stop();

  if (!game.isSandbox) {
    game.emit?.("meltdownStarted", {});
  }
  if (!game.isSandbox && !game.ui?.meltdownUI) {
    game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.part) tile.clearPart();
    });
  }

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

function clearMeltdown(reactor) {
  const game = reactor.game;
  reactor.has_melted_down = false;
  if (game.emit) game.emit("meltdownResolved", { hasMeltedDown: false });
  if (game.state) game.state.melting_down = false;
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  clearHeatVisualStates(reactor);
}

function clearHeatVisualStates(reactor) {
  const game = reactor.game;
  if (game.tileset && game.tileset.active_tiles_list) {
    game.tileset.active_tiles_list.forEach((tile) => { tile.exploding = false; });
  }
  game.emit?.("heatWarningCleared");
  if (game.engine && game.engine.heatManager) {
    game.engine.heatManager.segments.clear();
    game.engine.heatManager.tileSegmentMap.clear();
    game.engine.heatManager.markSegmentsAsDirty();
  }
}

export class Reactor {
  constructor(game) {
    "use strict";
    this.game = game;
    this.base_max_heat = BASE_MAX_HEAT;
    this.base_max_power = BASE_MAX_POWER;
    this.setDefaults();
  }

  setDefaults() {
    const zero = toDecimal(0);
    if (this.game?.state) {
      setDecimal(this.game.state, "current_heat", zero);
      setDecimal(this.game.state, "current_power", zero);
    }
    this._max_heat = toDecimal(this.base_max_heat);
    this.altered_max_heat = toDecimal(this.base_max_heat);
    this._max_power = toDecimal(this.base_max_power);
    this.altered_max_power = toDecimal(this.base_max_power);

    this.auto_sell_multiplier = 0;
    this.heat_power_multiplier = 0;
    this.heat_controlled = false;
    this.heat_outlet_controlled = false;
    this.vent_capacitor_multiplier = 0;
    this.vent_plating_multiplier = 0;
    this.transfer_capacitor_multiplier = 0;
    this.transfer_plating_multiplier = 0;

    this.stirling_multiplier = 0;
    this.sell_price_multiplier = 1;
    this.manual_vent_percent = 0;
    this.reflector_cooling_factor = 0;
    this.insurance_percentage = 0;
    this.manual_override_mult = 0;
    this.override_end_time = 0;
    this.convective_boost = 0;
    this.power_to_heat_ratio = 0;
    this.catalyst_reduction = 0;
    this.flux_accumulator_level = 0;
    this.thermal_feedback_rate = 0;
    this.auto_repair_rate = 0;
    this.volatile_tuning_max = 0;
    this.decompression_enabled = false;
    this.plating_transfer_rate = 0;

    this.has_melted_down = false;
    this.game.sold_power = false;
    this.game.sold_heat = false;

    this._last_calculated_max_power = toDecimal(this.base_max_power);
    this._last_calculated_max_heat = toDecimal(this.base_max_heat);
    this._classificationStatsHistory = [];
  }

  get current_heat() {
    const val = this.game?.state?.current_heat;
    return (val != null && typeof val.gt === "function") ? val : toDecimal(val ?? 0);
  }
  set current_heat(v) {
    const val = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) setDecimal(this.game.state, "current_heat", val);
    if (this.game?.emit) {
      this.game.emit("reactorTick", {
        current_heat: this.current_heat,
        current_power: this.current_power,
        max_heat: this.max_heat,
        max_power: this.max_power
      });
    }
  }
  get current_power() {
    const val = this.game?.state?.current_power;
    return (val != null && typeof val.gt === "function") ? val : toDecimal(val ?? 0);
  }
  set current_power(v) {
    const val = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) setDecimal(this.game.state, "current_power", val);
    if (this.game?.emit) {
      this.game.emit("reactorTick", {
        current_heat: this.current_heat,
        current_power: this.current_power,
        max_heat: this.max_heat,
        max_power: this.max_power
      });
    }
  }
  get max_heat() { return this._max_heat; }
  set max_heat(v) { this._max_heat = (v != null && typeof v.gt === 'function') ? v : toDecimal(v); }
  get max_power() { return this._max_power; }
  set max_power(v) { this._max_power = (v != null && typeof v.gt === 'function') ? v : toDecimal(v); }

  recordClassificationStats() {
    const h = this._classificationStatsHistory;
    h.push({
      netHeat: Number(this.stats_net_heat) || 0,
      power: Number(this.stats_power) || 0,
      inlet: Number(this.stats_inlet) || 0,
      outlet: Number(this.stats_outlet) || 0
    });
    if (h.length > CLASSIFICATION_HISTORY_MAX) h.shift();
  }

  getAveragedClassificationStats() {
    const h = this._classificationStatsHistory;
    if (!h.length) return null;
    const n = h.length;
    let netHeat = 0, power = 0, inlet = 0, outlet = 0;
    for (let i = 0; i < n; i++) {
      netHeat += h[i].netHeat;
      power += h[i].power;
      inlet += h[i].inlet;
      outlet += h[i].outlet;
    }
    return {
      netHeat: netHeat / n,
      power: power / n,
      inlet: inlet / n,
      outlet: outlet / n
    };
  }

  getClassification() {
    if (!this.game?.tileset) return null;
    if (typeof this.updateStats === "function") this.updateStats();
    const averaged = this.getAveragedClassificationStats && this.getAveragedClassificationStats();
    const netHeat = averaged ? averaged.netHeat : (Number(this.stats_net_heat) || 0);
    const maxHeat = Number(this.max_heat) || 1;
    const cellCount = this.game.tileset.active_tiles_list.filter((t) => t.part && t.part.category === "cell").length;
    const inletVal = averaged ? averaged.inlet : (Number(this.stats_inlet) || 0);
    const outletVal = averaged ? averaged.outlet : (Number(this.stats_outlet) || 0);
    const hasOutsideCooling = inletVal > 0 || outletVal > 0;
    const statsPower = averaged ? averaged.power : (Number(this.stats_power) || 0);
    let efficiencyNum = cellCount > 0 ? statsPower / (cellCount * REFERENCE_POWER) : 1;
    if (!isFinite(efficiencyNum) || efficiencyNum < 1) efficiencyNum = 1;
    let efficiencyLabel = "EE";
    if (efficiencyNum >= 4) efficiencyLabel = "EA";
    else if (efficiencyNum >= 3) efficiencyLabel = "EB";
    else if (efficiencyNum >= 2) efficiencyLabel = "EC";
    else if (efficiencyNum > 1) efficiencyLabel = "ED";
    const suffixes = [];
    if (hasOutsideCooling && netHeat <= 0) suffixes.push("SUC");
    let markLabel;
    let subClass = "";
    let summary = "";
    if (netHeat <= 0) {
      markLabel = "Mark I";
      subClass = hasOutsideCooling ? "O" : "I";
      summary = "Generates no excess heat; safe to run continuously.";
    } else {
      const heatPerTick = netHeat;
      const criticalHeat = CRITICAL_HEAT_RATIO * maxHeat;
      const ticksToCritical = heatPerTick > 0 ? criticalHeat / heatPerTick : Infinity;
      if (ticksToCritical >= TICKS_FULL_CYCLE) {
        markLabel = "Mark II";
        const fullCycles = Math.floor(ticksToCritical / TICKS_FULL_CYCLE);
        subClass = fullCycles >= MARK_II_E_THRESHOLD_CYCLES ? "E" : String(Math.min(fullCycles, MAX_SUBCLASS_CYCLES));
        summary = fullCycles >= MARK_II_E_THRESHOLD_CYCLES
          ? `Runs ${MARK_II_E_THRESHOLD_CYCLES}+ cycles before critical heat; nearly Mark I.`
          : `Runs ${subClass} full cycle(s) before cooldown needed.`;
      } else if (ticksToCritical >= TICKS_10PCT) {
        markLabel = "Mark III";
        summary = "Cannot complete a full cycle; shutdown mid-cycle required.";
      } else if (ticksToCritical > 0) {
        markLabel = "Mark IV";
        summary = "Reaches critical heat in under 10% of a cycle; component replacement may be needed.";
      } else {
        markLabel = "Mark V";
        summary = "Very short run before cooldown; precise timing required.";
      }
    }
    const mainLabel = subClass ? `${markLabel}-${subClass}` : markLabel;
    const suffixStr = suffixes.length ? " -" + suffixes.join(" -") : "";
    const classification = `${mainLabel} ${efficiencyLabel}${suffixStr}`.trim();
    return { classification, efficiencyLabel, suffixes, summary, markLabel, subClass };
  }

  updateStats() {
    if (!this.game.tileset) return;
    const stats = calculateStats(this, this.game.tileset, this.game?.ui);
    applyStatsToReactor(this, stats);
    syncStatsToUI(this, this.game.ui?.stateManager);
  }

  manualReduceHeat() {
    if (this.current_heat.gt(0)) {
      const previousHeat = this.current_heat;
      let reduction = this.manual_heat_reduce || this.game.base_manual_heat_reduce || 1;
      if (this.manual_vent_percent > 0) {
        reduction += this.max_heat.toNumber() * this.manual_vent_percent;
      }
      this.current_heat = this.current_heat.sub(reduction);
      if (this.current_heat.lt(0)) this.current_heat = toDecimal(0);
      const eps = toDecimal(HEAT_EPSILON);
      if (this.current_heat.lte(eps)) {
        this.current_heat = toDecimal(0);
        if (previousHeat.gt(eps)) this.game.sold_heat = true;
      }
      if (this.game.objectives_manager) {
        this.game.objectives_manager.check_current_objective();
      }

      this.updateStats();
    }
  }

  sellPower() {
    if (this.current_power.gt(0)) {
      const value = this.current_power.mul(this.sell_price_multiplier || 1);
      this.game.addMoney(value);
      this.current_power = toDecimal(0);
      this.game.sold_power = true;
      if (this.game.emit) this.game.emit("powerSold", {});

      if (this.manual_override_mult > 0) {
        this.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
        this.updateStats();
      }

      // Check objectives after power selling
      if (this.game.objectives_manager) {
        this.game.objectives_manager.check_current_objective();
      }
    }
  }

  toSaveState() {
    return {
      current_heat: this.current_heat,
      current_power: this.current_power,
      has_melted_down: this.has_melted_down,
      base_max_heat: this.base_max_heat,
      base_max_power: this.base_max_power,
      altered_max_heat: this.altered_max_heat,
      altered_max_power: this.altered_max_power,
    };
  }

  checkMeltdown() {
    if (this.has_melted_down) {
      logger.log('debug', 'engine', '[MELTDOWN-CHECK] Already in meltdown state.');
      return false;
    }
    const isMeltdown = shouldMeltdown(this);
    logger.log('debug', 'engine', `[MELTDOWN-CHECK] Inside checkMeltdown. isMeltdown condition evaluated to: ${isMeltdown}. (Heat: ${this.current_heat.toFixed(2)} > 2 * Max Heat: ${this.max_heat.toFixed(2)})`);
    if (isMeltdown) {
      executeMeltdown(this);
      return true;
    }
    return false;
  }

  clearMeltdownState() {
    clearMeltdown(this);
  }

  clearHeatVisualStates() {
    clearHeatVisualStates(this);
  }
}

export class BaseComponent {
  constructor() {
    this.isVisible = false;
  }
  teardown() {}
  show() {}
  hide() {}
  setElementVisible(el, visible) {
    if (!el?.classList) return;
    el.classList.toggle("hidden", !visible);
  }
  removeOverlay(el) {
    if (el) el.remove();
    return null;
  }
}

export class StateManager extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.quickSelectSlots = Array.from({ length: 5 }, () => ({ partId: null, locked: false }));
    this._stateUnsubscribes = [];
  }
  teardown() {
    const unsubs = this._stateUnsubscribes;
    if (unsubs.length) {
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      unsubs.length = 0;
    }
  }
  setGame(gameInstance) {
    this.teardown();
    this.game = gameInstance;
    if (this.ui) this.ui._firstFrameSyncDone = false;
    if (!gameInstance?.state) return;
    this.setupStateSubscriptions();
  }

  setupStateSubscriptions() {
    this.teardown();
    const state = this.game?.state;
    const ui = this.ui;
    const config = ui?.var_objs_config;
    if (!state || !config) return;
    const coreLoopUI = ui?.coreLoopUI;
    const getDisplayValue = (key) => coreLoopUI?.getDisplayValue?.(this.game, key);
    const stateKeyMap = {
      total_heat: "stats_heat_generation",
    };
    for (const configKey of Object.keys(config)) {
      const stateKey = stateKeyMap[configKey] ?? configKey;
      if (state[stateKey] === undefined) continue;
      const cfg = config[configKey];
      if (!cfg?.onupdate) continue;
      const unsub = subscribeKey(state, stateKey, () => {
        const val = getDisplayValue(configKey);
        if (val !== undefined) cfg.onupdate(val);
      });
      this._stateUnsubscribes.push(unsub);
    }
    if (state.engine_status !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "engine_status", (val) => {
        if (val === "tick") {
          setTimeout(() => {
            const g = this.game;
            const status = g?.engine?.running ? (g?.paused ? "paused" : "running") : "stopped";
            this.setVar("engine_status", status);
          }, 100);
        }
      }));
    }
    const heatKeys = ["current_heat", "max_heat"];
    for (const key of heatKeys) {
      if (state[key] !== undefined) {
        this._stateUnsubscribes.push(subscribeKey(state, key, () => {
          ui.heatVisualsUI?.updateHeatVisuals?.();
          ui.deviceFeatures?.updateAppBadge?.();
        }));
      }
    }
    if (state.pause !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "pause", () => ui.deviceFeatures?.updateAppBadge?.()));
    }
    ui.deviceFeatures?.updateAppBadge?.();
    const runAffordabilityCascade = () => {
      const g = this.game;
      if (!g) return;
      try {
        const moneyVal = g.state?.current_money;
        const epVal = g.state?.current_exotic_particles;
        if (ui.last_money !== undefined) ui.last_money = moneyVal;
        if (ui.last_exotic_particles !== undefined) ui.last_exotic_particles = epVal;
        g.partset?.check_affordability?.(g);
        g.upgradeset?.check_affordability?.(g);
        if (g.tooltip_manager) g.tooltip_manager.updateUpgradeAffordability?.();
        if (ui.uiState) {
          ui.uiState.has_affordable_upgrades = g.upgradeset?.hasAffordableUpgrades?.() ?? false;
          ui.uiState.has_affordable_research = g.upgradeset?.hasAffordableResearch?.() ?? false;
        }
        ui.navIndicatorsUI?.updateNavIndicators?.();
        if (typeof ui.partsPanelUI?.updateQuickSelectSlots === "function") ui.partsPanelUI.updateQuickSelectSlots();
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };
    if (state.current_money !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_money", runAffordabilityCascade));
    }
    if (state.current_exotic_particles !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_exotic_particles", runAffordabilityCascade));
    }
    runAffordabilityCascade();
  }
  setVar(key, value) {
    if (!this.game?.state) return;
    if (key === "exotic_particles") {
      this.game.exoticParticleManager.exotic_particles = value;
      return;
    }
    if (key === "total_heat") {
      this.game.state.stats_heat_generation = value;
      return;
    }
    const oldValue = this.game.state[key];
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "time_flux", "heat_control"];
    const decimalKeys = ["current_heat", "current_power", "current_money", "current_exotic_particles", "total_exotic_particles", "reality_flux"];
    const isToggle = toggleKeys.includes(key);
    if (isToggle) value = Boolean(value);
    const isDecimalKey = decimalKeys.includes(key);
    if (!isDecimalKey && oldValue === value) return;

    if (isDecimalKey || (value != null && typeof value.gte === "function")) {
      setDecimal(this.game.state, key, value);
    } else {
      this.game.state[key] = value;
    }

    if (isToggle) {
      this.game.onToggleStateChange?.(key, value);
    }
  }
  getVar(key) {
    if (!this.game?.state) return undefined;
    if (key === "exotic_particles") return this.game.exoticParticleManager?.exotic_particles;
    if (key === "total_heat") return this.game.state.stats_heat_generation;
    return this.game.state[key];
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.ui?.uiState?.interaction) {
      this.ui.uiState.interaction.selectedPartId = part?.id ?? null;
    }
    if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
      this.game.state.parts_panel_version++;
    }
    if (this.game?.emit) this.game.emit("partSelected", { part });
    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile && part && !skipOpenPanel) {
      const uiState = this.ui?.uiState;
      if (uiState) uiState.parts_panel_collapsed = false;
      else {
        const partsSection = document.getElementById("parts_section");
        if (partsSection) partsSection.classList.remove("collapsed");
      }
      this.ui.partsPanelUI.updatePartsPanelBodyClass();
      const partsSection = document.getElementById("parts_section");
      if (partsSection) void partsSection.offsetHeight;
    }
    if (part) {
      const inQuickSelect = this.getQuickSelectSlots().some((s) => s.partId === part.id);
      if (!inQuickSelect) this.pushLastUsedPart(part);
    }
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.gridInteractionUI.clearSegmentHighlight();
    }
  }
  getClickedPart() {
    return this.clicked_part;
  }

  pushLastUsedPart(part) {
    const id = part?.id;
    if (!id) return;
    const slots = this.quickSelectSlots;
    const seen = new Set();
    const order = [id, ...slots.map((s) => s.partId).filter(Boolean).filter((pid) => {
      if (pid === id || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    })].slice(0, 5);
    const lockedPartIds = new Set(slots.map((s, i) => slots[i].locked && s.partId).filter(Boolean));
    const available = order.filter((pid) => !lockedPartIds.has(pid));
    for (let i = 0; i < 5; i++) {
      if (slots[i].locked) continue;
      slots[i].partId = available.shift() ?? null;
    }
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  getQuickSelectSlots() {
    return this.quickSelectSlots.map((s) => ({ partId: s.partId, locked: s.locked }));
  }

  normalizeQuickSelectSlotsForUnlock() {
    const unlockManager = this.game?.unlockManager;
    if (!this.game?.partset || !unlockManager) return;
    for (let i = 0; i < this.quickSelectSlots.length; i++) {
      const s = this.quickSelectSlots[i];
      if (!s.partId) continue;
      const part = this.game.partset.getPartById(s.partId);
      if (!part || !unlockManager.isPartUnlocked(part)) {
        this.quickSelectSlots[i] = { partId: null, locked: false };
      }
    }
  }

  setQuickSelectLock(index, locked) {
    if (index < 0 || index > 4) return;
    this.quickSelectSlots[index].locked = locked;
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setQuickSelectSlots(slots) {
    const normalized = Array.from({ length: 5 }, (_, i) => {
      const s = slots?.[i];
      return {
        partId: s?.partId ?? null,
        locked: !!s?.locked,
      };
    });
    this.quickSelectSlots = normalized;
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  updatePartsPanelToggleIcon(_part) {}

  handleObjectiveCompleted() {
    const objectives = this.ui.registry?.get?.("Objectives");
    if (objectives?.markComplete) objectives.markComplete();
  }
  handleUpgradeAdded(game, upgrade_obj) {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    if (expandUpgradeIds.includes(upgrade_obj.upgrade.id)) {
      return;
    }
    const normalizeKey = (key) => {
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
    const locationKey = normalizeKey(upgrade_obj.upgrade.type);
    const upgrades = this.ui.registry?.get?.("Upgrades");
    if (!upgrades?.getUpgradeContainer?.(locationKey)) {
      if (this.debugMode) {
        logger.log('warn', 'game', `Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
      }
      return;
    }
    const upgradeEl = upgrade_obj.createElement();
    if (upgradeEl) {
      upgrade_obj.$el = upgradeEl;
      upgradeEl.upgrade_object = upgrade_obj;
      upgrades.appendUpgrade(locationKey, upgradeEl);
    }
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    tile.tile_index = tile.row * game.max_cols + tile.col;
  }
  game_reset() {
    if (this.game?.state) {
      setDecimal(this.game.state, "current_money", this.game.base_money);
      setDecimal(this.game.state, "current_power", 0);
      setDecimal(this.game.state, "current_heat", 0);
      this.game.state.max_power = this.game.reactor.base_max_power;
      this.game.state.max_heat = this.game.reactor.base_max_heat;
    }
    // Ensure any progress-based gating resets as well
    try {
      if (this.game) {
        this.game.placedCounts = {};
        this.game._suppressPlacementCounting = false;
      }
    } catch (_) { }
  }

  getAllVars() {
    return { ...this.game?.state };
  }

  // Function to add part icons to objective titles
  addPartIconsToTitle(title) {
    return addPartIconsToTitleHelper(this.game, title);
  }

  handleObjectiveLoaded(objective, objectiveIndex = null) {
    const isNewGame = objectiveIndex === 0 && !this.game?._saved_objective_index;
    if (isNewGame && this.ui.uiState) {
      this.ui.uiState.objectives_toast_expanded = true;
    }
    if (!objective?.completed) {
      const toastBtn = this.ui.coreLoopUI?.getElement?.("objectives_toast_btn") ?? (typeof document !== "undefined" ? document.getElementById("objectives_toast_btn") : null);
      if (toastBtn) toastBtn.classList.remove("is-complete", "objective-completed");
    }
    if (objective?.title) {
      setTimeout(() => this.checkObjectiveTextScrolling(), 0);
    }
  }

  handleObjectiveUnloaded() {
    // No-op for now. Could add animation or clearing logic here if desired.
  }

  getObjectiveScrollDuration() {
    return getObjectiveScrollDurationHelper();
  }

  checkObjectiveTextScrolling() {
    const objectives = this.ui.registry?.get?.("Objectives");
    if (objectives?.checkTextScrolling) objectives.checkTextScrolling();
    else checkObjectiveTextScrollingHelper(this.ui.DOMElements);
  }
}
