import { calculateWeaveEp } from "reactor-core";
import { toNumber } from "../../simUtils.js";
import { VALVE_OVERFLOW_THRESHOLD } from "../../constants/sim.js";
import { WEAVE_QUANTUM } from "../../constants/balance.js";
import { isHeatNetBalanced } from "../../domain/heat-signals.js";
import { EngineStatus } from "../../schema/stateSchemas.js";

export function resolveSessionSnapshot(game) {
  return game?.coreBridge?.getSnapshot?.() ?? null;
}

function buffContextFromGame(game) {
  const mods = game?.reactor?.sessionModifiers;
  return {
    manual_override_mult: toNumber(mods?.manual_override_mult ?? 0),
    override_end_time: game?.reactor?.override_end_time ?? 0,
    power_to_heat_ratio: toNumber(mods?.power_to_heat_ratio ?? 0),
  };
}

export function computeActiveBuffs(view) {
  const buffs = [];
  const manualOverride = (view.manual_override_mult || 0) > 0 && Date.now() < (view.override_end_time || 0);
  if (manualOverride) {
    buffs.push({ id: "manual_override", icon: "img/ui/nav/nav_play.png", title: "Manual Override" });
  }
  if ((view.power_to_heat_ratio || 0) > 0) {
    const maxHeat = toNumber(view.max_heat ?? 0);
    const currentHeat = toNumber(view.current_heat ?? 0);
    const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
    if (heatPercent > VALVE_OVERFLOW_THRESHOLD && (toNumber(view.current_power ?? 0) || 0) > 0) {
      buffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitor_4.png", title: "Electro-Thermal Conversion" });
    }
  }
  return buffs;
}

function heatRatioFromView(view) {
  const ch = toNumber(view.current_heat ?? 0);
  const mh = Math.max(1e-12, toNumber(view.max_heat ?? 1));
  return ch / mh;
}

export function hudViewFromSnapshot(snap, game = null) {
  const buffCtx = buffContextFromGame(game);
  if (!snap) {
    const empty = {
      current_power: 0,
      current_heat: 0,
      max_power: 1,
      max_heat: 1,
      current_money: 0,
      current_exotic_particles: 0,
      total_exotic_particles: 0,
      melting_down: false,
      pause: false,
      auto_buy: false,
      heat_control: false,
      power_net_change: 0,
      heat_net_change: 0,
      stats_power: 0,
      stats_cell_power: 0,
      stats_stirling_power: 0,
      stats_net_heat: 0,
      stats_heat_generation: 0,
      stats_vent: 0,
      stats_cash: 0,
      auto_sell: false,
      auto_sell_multiplier: 0,
      heat_controlled: false,
      manual_heat_reduce: 0,
      power_overflow_to_heat_ratio: 1,
      session_ep_weave: 0,
      heat_ratio: 0,
      heat_balanced: false,
      engine_status: EngineStatus.STOPPED,
      ...buffCtx,
    };
    empty.active_buffs = computeActiveBuffs(empty);
    return empty;
  }
  const grid = snap.grid ?? {};
  const economy = snap.economy ?? {};
  const stats = snap.stats ?? {};
  const toggles = snap.toggles ?? {};
  const paused = !!snap.paused;
  const view = {
    current_power: toNumber(grid.currentPower ?? 0),
    current_heat: toNumber(grid.currentHeat ?? 0),
    max_power: toNumber(grid.maxPower ?? 0) || 1,
    max_heat: toNumber(grid.maxHeat ?? 0) || 1,
    current_money: economy.money ?? 0,
    current_exotic_particles: economy.currentExoticParticles ?? 0,
    total_exotic_particles: economy.totalExoticParticles ?? 0,
    melting_down: !!snap.hasMeltedDown,
    pause: paused,
    auto_buy: !!toggles.auto_buy,
    heat_control: !!toggles.heat_control,
    power_net_change: snap.powerNetChange ?? stats.powerNetChange ?? 0,
    heat_net_change: snap.heatNetChange ?? stats.heatNetChange ?? 0,
    stats_power: stats.power ?? 0,
    stats_cell_power: stats.cellPower ?? stats.power ?? 0,
    stats_stirling_power: stats.stirlingPower ?? 0,
    stats_net_heat: stats.netHeat ?? 0,
    stats_heat_generation: stats.heatGeneration ?? 0,
    stats_vent: stats.vent ?? 0,
    stats_cash: stats.cash ?? 0,
    auto_sell: !!toggles.auto_sell,
    auto_sell_multiplier: economy.autoSellMultiplier ?? 0,
    heat_controlled: !!toggles.heat_control,
    manual_heat_reduce: stats.manualHeatReduce ?? 0,
    power_overflow_to_heat_ratio: stats.powerOverflowToHeatRatio ?? 1,
    session_ep_weave: calculateWeaveEp(
      economy.sessionPowerProduced ?? 0,
      economy.sessionHeatDissipated ?? 0,
      WEAVE_QUANTUM,
    ),
    ...buffCtx,
  };
  view.heat_ratio = typeof snap.heatRatio === "number" ? snap.heatRatio : heatRatioFromView(view);
  view.heat_balanced = isHeatNetBalanced(view.stats_net_heat, view.stats_heat_generation);
  view.engine_status = paused
    ? EngineStatus.PAUSED
    : (game?.engine?.running ? EngineStatus.RUNNING : EngineStatus.STOPPED);
  view.active_buffs = computeActiveBuffs(view);
  return view;
}
