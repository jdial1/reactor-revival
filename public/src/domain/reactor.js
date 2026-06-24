import { HEAT_EPSILON, MELTDOWN_HEAT_MULTIPLIER } from "../constants/sim.js";
import { deriveReactorStats } from "./reactor-stats.js";
import { setDecimal, updateDecimal, syncReactorToUIState } from "../state/decimal-sync.js";
import { recordSimEvent } from "./sim-events.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { saveRecoveredBlueprint } from "../components/ui-layout-storage.js";
import { toDecimal, toNumber } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { getCompactLayout } from "../layout/reactor-codec.js";
import {
  OVERRIDE_DURATION_MS,
  TICKS_FULL_CYCLE,
  TICKS_10PCT,
  REFERENCE_POWER,
  CLASSIFICATION_HISTORY_MAX,
  MARK_II_E_THRESHOLD_CYCLES,
  MAX_SUBCLASS_CYCLES,
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
} from "../constants/balance.js";
import { CRITICAL_HEAT_RATIO, VALVE_OVERFLOW_THRESHOLD } from "../constants/sim.js";

function applyStatsToReactor(reactor, stats) {
  reactor.stats_power = stats.stats_power;
  reactor.stats_cell_power = stats.stats_cell_power ?? stats.stats_power;
  reactor.stats_stirling_power = stats.stats_stirling_power ?? 0;
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
    if (heatPercent > VALVE_OVERFLOW_THRESHOLD && (toNumber(state.current_power ?? 0) || 0) > 0) {
      buffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitor_4.png", title: "Electro-Thermal Conversion" });
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
    state.stats_cell_power = reactor.stats_cell_power ?? reactor.stats_power;
    state.stats_stirling_power = reactor.stats_stirling_power ?? 0;
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
    state.auto_sell_multiplier = reactor.auto_sell_multiplier;
    state.heat_controlled = reactor.heat_controlled;
    state.vent_multiplier_eff = reactor.vent_multiplier_eff;
    state.power_overflow_to_heat_ratio = reactor.power_overflow_to_heat_ratio ?? 1;
    state.manual_heat_reduce = toNumber(reactor.manual_heat_reduce ?? reactor.game?.base_manual_heat_reduce ?? 1);
    state.active_buffs = computeActiveBuffs(state);
  }
}

function shouldMeltdown(reactor) {
  if (reactor.has_melted_down) return true;
  if (reactor.game.grace_period_ticks > 0) {
    reactor.game.grace_period_ticks--;
    return false;
  }

  const heat = reactor.current_heat;
  const max = reactor.max_heat;
  const state = reactor.game.state;

  if (heat.lt(max)) {
    if (state) {
      state.failure_state = "nominal";
      state.hull_integrity = 100;
    }
    return false;
  }

  if (state && heat.gte(max) && heat.lt(max.mul(1.1))) {
    state.failure_state = "saturation";
  }
  if (state && heat.gte(max.mul(1.1)) && state.hull_integrity > 0) {
    state.failure_state = "repulsion";
    const overpressure = heat.sub(max.mul(1.1)).div(max).toNumber();
    state.hull_integrity = Math.max(0, state.hull_integrity - overpressure * 5);
  }
  if (state && state.hull_integrity <= 0 && heat.lt(max.mul(MELTDOWN_HEAT_MULTIPLIER))) {
    state.failure_state = "fragmentation";
  }
  if (heat.gt(max.mul(MELTDOWN_HEAT_MULTIPLIER))) {
    if (state) state.failure_state = "criticality";
    return true;
  }
  return false;
}

function executeMeltdown(reactor) {
  const game = reactor.game;
  logger.log("warn", "engine", "[MELTDOWN] Condition met! Initiating meltdown sequence.");
  logger.log("debug", "reactor", "Meltdown triggered", { heat: reactor.current_heat, max_heat: reactor.max_heat });

  if (game.state) {
    game.state.melting_down = true;
    game.state.meltdown_seq = (game.state.meltdown_seq | 0) + 1;
    game.state.failure_state = "criticality";
    game.state.hull_integrity = 0;
  }
  recordSimEvent(game, { type: "MELTDOWN_HAPTIC", pattern: 200 });
  drainGameEffects(game, () => game?.ui);

  if (game.engine) game.engine.stop();

  const layout = getCompactLayout(game);
  if (layout?.parts?.length) {
    saveRecoveredBlueprint(layout);
  }

  if (!game.ui?.meltdownUI) {
    game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.part) tile.clearPart();
    });
  }

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

function clearMeltdown(reactor) {
  const game = reactor.game;
  if (game.state) {
    game.state.melting_down = false;
    game.state.failure_state = "nominal";
    game.state.hull_integrity = 100;
  }
  // Use centralized sync to ensure UI state matches reactor state
  syncReactorToUIState(game);
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
    if (this.game?.state) {
      this.game.state.max_heat = this._max_heat;
    }

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
    this.manual_override_mult = 0;
    this.override_end_time = 0;
    this.convective_boost = 0;
    this.power_to_heat_ratio = 0;
    this.catalyst_reduction = 0;
    this.thermal_feedback_rate = 0;
    this.volatile_tuning_max = 0;
    this.plating_heat_bonus = 0;
    this.hull_heat_doctrine_mult = 1;

    if (this.game?.state) this.game.state.melting_down = false;
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
  }
  get current_power() {
    const val = this.game?.state?.current_power;
    return (val != null && typeof val.gt === "function") ? val : toDecimal(val ?? 0);
  }
  set current_power(v) {
    const val = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) setDecimal(this.game.state, "current_power", val);
  }
  get max_heat() { return this._max_heat; }
  set max_heat(v) {
    this._max_heat = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) {
      this.game.state.max_heat = this._max_heat;
    }
  }
  get max_power() { return this._max_power; }
  set max_power(v) { this._max_power = (v != null && typeof v.gt === 'function') ? v : toDecimal(v); }

  get has_melted_down() {
    return !!this.game?.state?.melting_down;
  }
  set has_melted_down(v) {
    if (this.game?.state) this.game.state.melting_down = !!v;
  }

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
    const stats = deriveReactorStats(this.game.tileset, this);
    applyStatsToReactor(this, stats);
    syncStatsToUI(this, this.game.ui?.stateManager);
    if (this.game.tileset && this.game.tileset.active_tiles_list) {
      for (let i = 0; i < this.game.tileset.active_tiles_list.length; i++) {
        const t = this.game.tileset.active_tiles_list[i];
        if (t && t.part && typeof t.recalculateEffectiveValues === "function") {
          t.recalculateEffectiveValues();
        }
      }
    }
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

      this.updateStats();
    }
  }

  sellPower() {
    if (this.current_power.gt(0)) {
      const soldAmt = this.current_power;
      const value = soldAmt.mul(this.sell_price_multiplier || 1);
      if (this.game.state) {
        updateDecimal(this.game.state, "session_power_sold", (d) => d.add(soldAmt));
      }
      this.game.addMoney(value);
      this.current_power = toDecimal(0);
      this.game.sold_power = true;

      if (this.manual_override_mult > 0) {
        this.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
        this.updateStats();
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

