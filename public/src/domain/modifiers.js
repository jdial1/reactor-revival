import { BALANCE } from "./balance.js";
import { MOBILE_BREAKPOINT_PX, RESIZE_DELAY_MS } from "../constants/ui-constants.js";

function upgradeActionId(upgrade) {
  return upgrade?.actionId || upgrade?.upgrade?.actionId || upgrade?.id || "";
}

const MODIFIER_APPLIERS = {
  expand_reactor_rows: (m, lvl, game) => { m.gridRows = game.base_rows + lvl; },
  expand_reactor_cols: (m, lvl, game) => { m.gridCols = game.base_cols + lvl; },
  forceful_fusion: (m, lvl) => { m.heat_power_multiplier = lvl; },
  heat_control_operator: (m, lvl) => { m.heat_controlled = lvl > 0; },
  heat_outlet_control_operator: (m, lvl) => { m.heat_outlet_controlled = lvl > 0; },
  improved_piping: (m, lvl, game) => {
    m.manual_heat_reduce = (game.base_manual_heat_reduce ?? 1) * (lvl > 0 ? 10 : 1);
  },
  reinforced_heat_exchangers: (m, lvl) => { m.transfer_plating_multiplier = lvl; },
  active_exchangers: (m, lvl) => { m.transfer_capacitor_multiplier = lvl; },
  improved_heatsinks: (m, lvl) => { m.vent_plating_multiplier = lvl; },
  stirling_generators: (m, lvl) => { m.stirling_multiplier = lvl * BALANCE.stirlingMultiplierPerLevel; },
  emergency_coolant: (m, lvl) => { m.manual_vent_percent = Math.min(lvl, 3) * BALANCE.emergencyCoolantMultPerLevel; },
  perpetual_capacitors: (m, lvl) => { m.perpetual_capacitors = lvl > 0; },
  perpetual_reflectors: (m, lvl) => { m.perpetual_reflectors = lvl > 0; },
  manual_override: (m, lvl) => { m.manual_override_mult = lvl * BALANCE.manualOverrideMultPerLevel; },
  convective_airflow: (m, lvl) => { m.convective_boost = lvl * BALANCE.convectiveBoostPerLevel; },
  electro_thermal_conversion: (m, lvl) => {
    m.power_to_heat_ratio = lvl < 1 ? 0 : BALANCE.electroThermalBaseRatio + (lvl - 1) * BALANCE.electroThermalStep;
  },
  sub_atomic_catalysts: (m, lvl) => { m.catalyst_reduction = lvl * BALANCE.catalystReductionPerLevel; },
  thermal_feedback: (m, lvl) => { m.thermal_feedback_rate = lvl * BALANCE.thermalFeedbackRatePerLevel; },
  volatile_tuning: (m, lvl) => { m.volatile_tuning_max = lvl * BALANCE.volatileTuningMaxPerLevel; },
  ceramic_composite: (m, lvl) => { m.plating_heat_bonus = lvl * BALANCE.platingHeatBonusPerLevel; },
  reflector_cooling: (m, lvl) => { m.reflector_cooling_factor = lvl * BALANCE.reflectorCoolingFactorPerLevel; },
  auto_sell_operator: (m, lvl) => { m.auto_sell_from_upgrade = lvl > 0; },
  auto_buy_operator: (m, lvl) => { m.auto_buy_from_upgrade = lvl > 0; },
};

export function computeModifiers(game) {
  const us = game?.upgradeset;
  if (!us) return null;
  const baseMhr = game.base_manual_heat_reduce ?? 1;
  const m = {
    gridRows: game.base_rows,
    gridCols: game.base_cols,
    heat_power_multiplier: 0,
    heat_controlled: false,
    heat_outlet_controlled: false,
    manual_heat_reduce: baseMhr,
    transfer_plating_multiplier: 0,
    transfer_capacitor_multiplier: 0,
    vent_plating_multiplier: 0,
    stirling_multiplier: 0,
    manual_vent_percent: 0,
    perpetual_capacitors: false,
    perpetual_reflectors: false,
    manual_override_mult: 0,
    convective_boost: 0,
    power_to_heat_ratio: 0,
    catalyst_reduction: 0,
    thermal_feedback_rate: 0,
    volatile_tuning_max: 0,
    plating_heat_bonus: 0,
    reflector_cooling_factor: 0,
    auto_sell_from_upgrade: false,
    auto_buy_from_upgrade: false,
  };
  const upgrades = us.getAllUpgrades?.() ?? us.upgradesArray ?? [];
  for (let i = 0; i < upgrades.length; i++) {
    const u = upgrades[i];
    const lvl = u?.level ?? 0;
    if (lvl <= 0) continue;
    const apply = MODIFIER_APPLIERS[upgradeActionId(u)];
    if (apply) apply(m, lvl, game);
  }
  return m;
}

export function applyComputedModifiers(game, opts = {}) {
  if (!game?.upgradeset || !game.reactor) return;
  const skipGrid = opts.skipGrid === true;
  const m = computeModifiers(game);
  if (!m) return;
  const r = game.reactor;
  if (!skipGrid) {
    const rowsChanged = game.rows !== m.gridRows;
    const colsChanged = game.cols !== m.gridCols;
    if (rowsChanged) game.gridManager.setRows(m.gridRows);
    if (colsChanged) game.gridManager.setCols(m.gridCols);
    if (
      (rowsChanged || colsChanged) &&
      typeof window !== "undefined" &&
      window.innerWidth &&
      window.innerWidth <= MOBILE_BREAKPOINT_PX
    ) {
      setTimeout(() => game.ui?.resizeReactor?.(), RESIZE_DELAY_MS);
    }
  }

  const directKeys = [
    "heat_power_multiplier", "heat_outlet_controlled", "transfer_plating_multiplier",
    "transfer_capacitor_multiplier", "vent_plating_multiplier", "stirling_multiplier",
    "manual_vent_percent", "perpetual_capacitors", "perpetual_reflectors", "manual_override_mult",
    "convective_boost", "power_to_heat_ratio", "catalyst_reduction", "thermal_feedback_rate",
    "volatile_tuning_max", "plating_heat_bonus", "reflector_cooling_factor"
  ];
  for (let i = 0; i < directKeys.length; i++) {
    const k = directKeys[i];
    if (typeof m[k] !== "undefined") r[k] = m[k];
  }

  if (r.manual_heat_reduce !== m.manual_heat_reduce) {
    r.manual_heat_reduce = m.manual_heat_reduce;
    game.emit?.("statePatch", { manual_heat_reduce: m.manual_heat_reduce });
  } else {
    r.manual_heat_reduce = m.manual_heat_reduce;
  }

  if (!!r.auto_sell_enabled !== m.auto_sell_from_upgrade) {
    game.onToggleStateChange?.("auto_sell", m.auto_sell_from_upgrade);
  }
  if (!!r.auto_buy_enabled !== m.auto_buy_from_upgrade) {
    game.onToggleStateChange?.("auto_buy", m.auto_buy_from_upgrade);
  }
  if (!!r.heat_controlled !== m.heat_controlled) {
    game.onToggleStateChange?.("heat_control", m.heat_controlled);
  }

  const pa = game.partset?.partsArray;
  if (pa) {
    for (let i = 0; i < pa.length; i++) {
      pa[i].recalculate_stats?.();
    }
  }
}
