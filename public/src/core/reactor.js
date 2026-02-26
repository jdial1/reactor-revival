import { toDecimal } from "../utils/decimal.js";
import { setDecimal } from "./store.js";
import { logger } from "../utils/logger.js";
import { HEAT_EPSILON } from "./heatCalculations.js";
import {
  TICKS_FULL_CYCLE, TICKS_10PCT, CRITICAL_HEAT_RATIO, REFERENCE_POWER, OVERRIDE_DURATION_MS,
  BASE_MAX_HEAT, BASE_MAX_POWER,
  CLASSIFICATION_HISTORY_MAX, MARK_II_E_THRESHOLD_CYCLES, MAX_SUBCLASS_CYCLES,
} from "./constants.js";
import { calculateStats, applyStatsToReactor, syncStatsToUI } from "./reactor/reactorStatsCalculator.js";
import { shouldMeltdown, executeMeltdown, clearMeltdown, clearHeatVisualStates as clearHeatVisualStatesFromModule } from "./reactor/reactorMeltdownHandler.js";

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
    return val != null ? val : toDecimal(0);
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
    return val != null ? val : toDecimal(0);
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
    clearHeatVisualStatesFromModule(this);
  }
}
