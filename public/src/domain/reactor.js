import {
  syncTilePulseDisplays,
} from "../bridge/core-state-projection.js";
import { requireActiveBridge } from "../bridge/active.js";
import { setDecimal } from "../state/decimal-sync.js";
import { toDecimal, toNumber } from "../simUtils.js";
import {
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
} from "../constants/balance.js";

function clearMeltdown(reactor) {
  const game = reactor.game;
  game._meltdownPresentationDone = false;
  if (game.state) {
    game.state.melting_down = false;
  }
  const session = game.coreBridge?.session;
  session?.systems?.failure?.reset?.();
  if (session?.engine?.meltdown) {
    session.engine.reset();
  }
  game.coreBridge?.projectLiveState?.();
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  game.emit?.("heatWarningCleared");
}

export class Reactor {
  constructor(game) {
    this.game = game;
    this.base_max_heat = BASE_MAX_HEAT;
    this.base_max_power = BASE_MAX_POWER;
    this.setDefaults();
  }

  setDefaults() {
    if (this.game?.state) {
      setDecimal(this.game.state, "current_heat", 0);
      setDecimal(this.game.state, "current_power", 0);
      this.game.state.max_heat = this.base_max_heat;
      this.game.state.max_power = this.base_max_power;
      this.game.state.melting_down = false;
      this.game.state.heat_control = false;
    }
    this.altered_max_heat = toDecimal(this.base_max_heat);
    this.altered_max_power = toDecimal(this.base_max_power);

    this.sessionModifiers = null;
    this.auto_sell_multiplier = 0;
    this.power_multiplier = 1;
    this.sell_price_multiplier = 1;
    this.override_end_time = 0;
    this.game._meltdownPresentationDone = false;
    this.manual_heat_reduce = this.game?.base_manual_heat_reduce ?? 1;

    this.game.sold_power = false;
    this.game.sold_heat = false;
  }

  get current_heat() {
    return toNumber(this.game?.state?.current_heat ?? 0);
  }
  set current_heat(v) {
    if (this.game?.state) setDecimal(this.game.state, "current_heat", v);
  }

  get current_power() {
    return toNumber(this.game?.state?.current_power ?? 0);
  }
  set current_power(v) {
    if (this.game?.state) setDecimal(this.game.state, "current_power", v);
  }

  get max_heat() {
    return toNumber(this.game?.state?.max_heat ?? this.base_max_heat);
  }
  set max_heat(v) {
    if (this.game?.state) this.game.state.max_heat = toNumber(v);
  }

  get max_power() {
    return toNumber(this.game?.state?.max_power ?? this.base_max_power);
  }
  set max_power(v) {
    if (this.game?.state) this.game.state.max_power = toNumber(v);
  }

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
    if (this.game?.state) this.game.state.heat_control = !!v;
  }

  updateStats(opts = {}) {
    if (!this.game.tileset) return;
    const bridge = requireActiveBridge(this.game, "updateStats");
    if (!opts.fromSession) {
      bridge.session?.grid?.recalculateCaps?.();
    }
    const coreStats = bridge.session?.getSnapshot()?.stats;
    if (!coreStats) return;

    const statsPower = coreStats.power;
    const statsCellPower = coreStats.cellPower ?? coreStats.power;
    const statsStirlingPower = coreStats.stirlingPower ?? 0;
    const statsHeatGeneration = coreStats.heatGeneration;
    const statsTotalPartHeat = coreStats.totalPartHeat;
    const statsVent = coreStats.vent;
    const statsInlet = coreStats.inlet;
    const statsOutlet = coreStats.outlet;
    const statsNetHeat = coreStats.netHeat;
    const statsCash = coreStats.cash;
    const ventMult = coreStats.temp_vent_multiplier ?? coreStats.vent_multiplier_add ?? coreStats.ventAdditivePercent ?? 0;
    const transferMult = coreStats.temp_transfer_multiplier ?? coreStats.transfer_multiplier_add ?? coreStats.transferAdditivePercent ?? 0;
    const maxPower = toDecimal(coreStats.maxPower ?? BASE_MAX_POWER);
    const maxHeat = toDecimal(coreStats.maxHeat ?? BASE_MAX_HEAT);

    this.stats_power = statsPower;
    this.stats_cell_power = statsCellPower;
    this.stats_stirling_power = statsStirlingPower;
    this.stats_heat_generation = statsHeatGeneration;
    this.stats_total_part_heat = statsTotalPartHeat;
    this.stats_vent = statsVent;
    this.stats_inlet = statsInlet;
    this.stats_outlet = statsOutlet;
    this.stats_net_heat = statsNetHeat;
    this.stats_cash = statsCash;
    this.vent_multiplier_eff = ventMult;
    this.transfer_multiplier_eff = transferMult;
    this.max_power = maxPower;
    this.max_heat = maxHeat;

    const state = this.game.state;
    if (state) {
      state.stats_power = statsPower;
      state.stats_cell_power = statsCellPower;
      state.stats_stirling_power = statsStirlingPower;
      state.stats_heat_generation = statsHeatGeneration;
      state.stats_total_part_heat = statsTotalPartHeat;
      state.stats_vent = statsVent;
      state.stats_inlet = statsInlet;
      state.stats_outlet = statsOutlet;
      state.stats_net_heat = statsNetHeat;
      state.stats_cash = statsCash;

      state.vent_multiplier_eff = ventMult;
      state.transfer_multiplier_eff = transferMult;

      state.max_power = toNumber(maxPower);
      state.max_heat = toNumber(maxHeat);

      state.auto_sell_multiplier = this.auto_sell_multiplier;
    }

    if (!opts.fromSession) syncTilePulseDisplays(this);
  }

  manualReduceHeat() {
    if (!(this.current_heat > 0)) return;
    this.game?.manual_reduce_heat_action?.();
  }

  sellPower() {
    if (!(this.current_power > 0)) return;
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

  clearMeltdownState() {
    clearMeltdown(this);
  }
}
