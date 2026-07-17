import {
  syncTilePulseDisplays,
} from "../bridge/core-state-projection.js";
import { requireActiveBridge } from "../bridge/active.js";
import { setDecimal, syncReactorToUIState } from "../state/decimal-sync.js";
import { recordSimEvent } from "./sim-events.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import { saveRecoveredBlueprint } from "../components/blueprints/ui-layout-storage.js";
import { toDecimal, toNumber } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { getCompactLayout } from "./reactor-codec.js";
import {
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
} from "../constants/balance.js";
import { VALVE_OVERFLOW_THRESHOLD } from "../constants/sim.js";

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
    state.heat_controlled = reactor._heatControlStat;
    state.vent_multiplier_eff = reactor.vent_multiplier_eff;
    state.power_overflow_to_heat_ratio = reactor.power_overflow_to_heat_ratio ?? 1;
    state.manual_heat_reduce = toNumber(reactor.manual_heat_reduce ?? reactor.game?.base_manual_heat_reduce ?? 1);
    state.active_buffs = computeActiveBuffs(state);
  }
}

function executeMeltdown(reactor) {
  const game = reactor.game;
  if (reactor._meltdownPresentationDone) return;
  reactor._meltdownPresentationDone = true;

  logger.log("warn", "engine", "[MELTDOWN] Condition met! Initiating meltdown sequence.");
  logger.log("debug", "reactor", "Meltdown triggered", { heat: reactor.current_heat, max_heat: reactor.max_heat });

  if (game.state) {
    game.state.melting_down = true;
    game.state.meltdown_seq = (game.state.meltdown_seq | 0) + 1;
  }
  reactor.has_melted_down = true;
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
    game.coreBridge?.session?.grid?.clearGrid?.();
    game.coreBridge?.syncGridToGame?.();
  }

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

function clearMeltdown(reactor) {
  const game = reactor.game;
  reactor._meltdownPresentationDone = false;
  if (game.state) {
    game.state.melting_down = false;
  }
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
    this.power_multiplier = 1;
    this.heat_power_multiplier = 0;
    this._meltdownPresentationDone = false;
    this._heatControlStat = false;
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
      this.game.state.max_heat = toNumber(this._max_heat);
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

  get heat_controlled() {
    return !!this.game?.state?.heat_control;
  }
  set heat_controlled(v) {
    this._heatControlStat = !!v;
    if (this.game?.state) this.game.state.heat_control = !!v;
  }

  updateStats(opts = {}) {
    if (!this.game.tileset) return;
    const bridge = requireActiveBridge(this.game, "updateStats");

    if (!opts.fromSession) {
      bridge.syncForStatsRead();
    }

    const coreStats = bridge.session?.getSnapshot()?.stats;
    if (!coreStats) return;

    const stats = {
      stats_power: coreStats.power,
      stats_cell_power: coreStats.cellPower,
      stats_stirling_power: coreStats.stirlingPower,
      stats_heat_generation: coreStats.heatGeneration,
      stats_total_part_heat: coreStats.totalPartHeat,
      stats_vent: coreStats.vent,
      stats_inlet: coreStats.inlet,
      stats_outlet: coreStats.outlet,
      stats_net_heat: coreStats.netHeat,
      stats_cash: coreStats.cash,
      temp_vent_multiplier: coreStats.vent_multiplier_add ?? coreStats.ventAdditivePercent ?? 0,
      temp_transfer_multiplier: coreStats.transfer_multiplier_add ?? coreStats.transferAdditivePercent ?? 0,
      current_max_power: toDecimal(coreStats.maxPower ?? BASE_MAX_POWER),
      current_max_heat: toDecimal(coreStats.maxHeat ?? BASE_MAX_HEAT),
    };
    applyStatsToReactor(this, stats);
    syncStatsToUI(this, this.game.ui?.stateManager);
    if (!opts.fromSession) syncTilePulseDisplays(this);
    if (this.game.tileset.active_tiles_list) {
      for (let i = 0; i < this.game.tileset.active_tiles_list.length; i++) {
        const t = this.game.tileset.active_tiles_list[i];
        if (t && t.part && typeof t.recalculateEffectiveValues === "function") {
          t.recalculateEffectiveValues();
        }
      }
    }
  }

  manualReduceHeat() {
    if (!this.current_heat.gt(0)) return;
    this.game?.manual_reduce_heat_action?.();
  }

  sellPower() {
    if (!this.current_power.gt(0)) return;
    this.game?.sell_action?.();
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
    const already = this.has_melted_down || !!this.game.state?.melting_down
      || !!this.game.coreBridge?.session?.systems?.failure?.hasMeltedDown;
    if (!already) return false;
    executeMeltdown(this);
    return true;
  }

  clearMeltdownState() {
    clearMeltdown(this);
  }

  clearHeatVisualStates() {
    clearHeatVisualStates(this);
  }
}

