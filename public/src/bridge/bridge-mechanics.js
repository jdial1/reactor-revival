import { MOBILE_BREAKPOINT_PX, RESIZE_DELAY_MS } from "../constants/ui-constants.js";
import { toNumber } from "../simUtils.js";
import { refreshPartsFromSession } from "../domain/part.js";

export function syncHostSellOverridesToSession(bridge) {
  if (!bridge.session || !bridge.game?.reactor) return;
  const reactor = bridge.game.reactor;
  const mult = toNumber(reactor.auto_sell_multiplier);
  const altered = toNumber(reactor.altered_max_power);
  const powerMultiplier = toNumber(reactor.power_multiplier);
  const overflowRatio = toNumber(
    reactor.power_overflow_to_heat_ratio ?? bridge.game.state?.power_overflow_to_heat_ratio,
  );
  const prev = bridge.session.mechanicsOverrides || {};
  const next = { ...prev };
  let changed = false;
  if (mult > 0) {
    next.autoSellPercent = mult * 100;
    changed = true;
  }
  if (altered > 0) {
    if (toNumber(next.alteredMaxPower) !== altered) {
      next.alteredMaxPower = altered;
      changed = true;
    }
  } else if ("alteredMaxPower" in next) {
    delete next.alteredMaxPower;
    changed = true;
  }
  if (powerMultiplier > 1 && powerMultiplier !== toNumber(prev.powerMultiplier)) {
    next.powerMultiplier = powerMultiplier;
    changed = true;
  } else if (powerMultiplier <= 1 && "powerMultiplier" in next) {
    delete next.powerMultiplier;
    changed = true;
  }
  if (Number.isFinite(overflowRatio) && toNumber(next.powerOverflowToHeatRatio) !== overflowRatio) {
    next.powerOverflowToHeatRatio = overflowRatio;
    changed = true;
  }
  if (changed) bridge.session.mechanicsOverrides = next;
}

function projectSessionModifiers(game) {
  const session = game.coreBridge?.session;
  const mods = session?.projectModifiers?.();
  if (!mods) return null;
  const baseMhr = game.base_manual_heat_reduce ?? 1;
  return {
    ...mods,
    gridRows: game.base_rows + (mods.grid_rows_bonus || 0),
    gridCols: game.base_cols + (mods.grid_cols_bonus || 0),
    manual_heat_reduce: baseMhr * (mods.manual_vent_multiplier || 1),
    perpetual_capacitors: !!mods.perpetual_categories?.capacitor,
    perpetual_reflectors: !!mods.perpetual_categories?.reflector,
  };
}

export function applyComputedModifiers(game, opts = {}) {
  if (!game?.reactor) return;
  const skipGrid = opts.skipGrid === true;
  const m = projectSessionModifiers(game);
  if (!m) return;
  const r = game.reactor;
  r.sessionModifiers = m;
  refreshPartsFromSession(game.partset);
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

  r.heat_controlled = m.heat_controlled;
  if (typeof m.auto_sell_percent === "number" && m.auto_sell_percent > 0) {
    r.auto_sell_multiplier = m.auto_sell_percent / 100;
  }
  r.manual_heat_reduce = m.manual_heat_reduce;
  if (game.state) {
    game.state.manual_heat_reduce = toNumber(m.manual_heat_reduce);
    game.state.auto_sell_multiplier = toNumber(r.auto_sell_multiplier ?? 0);
  }

  if (!!game.state?.auto_sell !== m.auto_sell_from_upgrade) {
    game.onToggleStateChange?.("auto_sell", m.auto_sell_from_upgrade);
  }
  if (!!game.state?.auto_buy !== m.auto_buy_from_upgrade) {
    game.onToggleStateChange?.("auto_buy", m.auto_buy_from_upgrade);
  }
  game.onToggleStateChange?.("heat_control", m.heat_controlled);
}
