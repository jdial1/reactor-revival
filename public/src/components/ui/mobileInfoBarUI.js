import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, MOBILE_BREAKPOINT_PX } from "../../core/constants.js";

const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

export class MobileInfoBarUI {
  constructor(ui) {
    this.ui = ui;
  }

  updateMobilePassiveTopBar() {
    const { ui } = this;
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    const epEl = document.getElementById("mobile_passive_ep");
    const moneyEl = document.getElementById("mobile_passive_money_value");
    const pauseBtn = document.getElementById("mobile_passive_pause_btn");
    const passiveBar = document.getElementById("mobile_passive_top_bar");
    if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
    if (epEl && ui.stateManager) {
      const ep = ui.stateManager.getVar("current_exotic_particles") ?? ui.stateManager.getVar("exotic_particles") ?? 0;
      epEl.textContent = fmt(ep);
    }
    if (moneyEl && ui.stateManager) {
      moneyEl.textContent = fmt(ui.stateManager.getVar("current_money") ?? 0, 0);
    }
    if (pauseBtn) {
      const paused = ui.stateManager.getVar("pause") === true;
      pauseBtn.classList.toggle("paused", paused);
      pauseBtn.setAttribute("aria-label", paused ? "Resume" : "Pause");
      pauseBtn.setAttribute("title", paused ? "Resume" : "Pause");
    }
  }

  updateControlDeckValues() {
    const { ui } = this;
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    const sm = ui.stateManager;
    if (!sm) return;

    const maxPower = sm.getVar("max_power") || 0;
    const maxHeat = sm.getVar("max_heat") || 0;

    const el = (id) => document.getElementById(id);
    if (el("control_deck_power")) el("control_deck_power").textContent = fmt(sm.getVar("current_power") || 0, 0);
    if (el("control_deck_power_denom") && maxPower) el("control_deck_power_denom").textContent = `/${fmt(maxPower, 0)}`;
    if (el("control_deck_money_value")) el("control_deck_money_value").textContent = fmt(sm.getVar("current_money") || 0);
    if (el("control_deck_heat")) el("control_deck_heat").textContent = fmt(sm.getVar("current_heat") || 0, 0);
    if (el("control_deck_heat_denom") && maxHeat) el("control_deck_heat_denom").textContent = `/${fmt(maxHeat, 0)}`;

    const powerDelta = ui.getPowerNetChange();
    const heatDelta = ui.getHeatNetChange();
    const powerRateEl = el("control_deck_power_rate");
    const heatRateEl = el("control_deck_heat_rate");
    if (powerRateEl) {
      const d = Math.round(powerDelta);
      powerRateEl.textContent = d === 0 ? "0" : (d > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(d), 0);
    }
    if (heatRateEl) {
      const d = Math.round(heatDelta);
      heatRateEl.textContent = d === 0 ? "0" : (d > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(d), 0);
    }

    const autoSellRateEl = el("control_deck_auto_sell_rate");
    if (autoSellRateEl) {
      const autoSellEnabled = sm.getVar("auto_sell");
      const multiplier = sm.getVar("auto_sell_multiplier") || 0;
      const showAutoSell = autoSellEnabled && multiplier > 0;
      if (showAutoSell) {
        const rate = Math.floor(maxPower * multiplier);
        autoSellRateEl.innerHTML = "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='$'>" + fmt(rate, 0);
      }
      autoSellRateEl.classList.toggle("visible", !!showAutoSell);
    }

    const autoHeatRateEl = el("control_deck_auto_heat_rate");
    if (autoHeatRateEl) {
      const heatControlEnabled = sm.getVar("heat_controlled");
      const showHeatRate = heatControlEnabled && maxHeat > 0;
      if (showHeatRate) {
        const ventBonus = sm.getVar("vent_multiplier_eff") || 0;
        const rate = (maxHeat / REACTOR_HEAT_STANDARD_DIVISOR) * (1 + ventBonus / VENT_BONUS_PERCENT_DIVISOR);
        autoHeatRateEl.innerHTML = "<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>\u2193" + fmt(Math.round(rate), 0);
      }
      autoHeatRateEl.classList.toggle("visible", !!showHeatRate);
    }

    const powerFill = document.querySelector(".power-fill");
    const heatFill = document.querySelector(".heat-fill");
    const heatVent = document.querySelector(".heat-vent");
    const powerCapacitor = el("control_deck_power_btn");

    if (powerFill && maxPower > 0) {
      const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (toNumber(ui.displayValues.power.current) / maxPower) * PERCENT_FULL));
      powerFill.style.setProperty("--power-fill-height", `${fillPercent}%`);
    }
    if (heatFill && maxHeat > 0) {
      const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (toNumber(ui.displayValues.heat.current) / maxHeat) * PERCENT_FULL));
      heatFill.style.setProperty("--heat-fill-height", `${fillPercent}%`);
      if (heatVent) {
        heatVent.classList.remove("hazard", "critical");
        if (fillPercent >= HAZARD_FILL_PERCENT) heatVent.classList.add("hazard", "critical");
        else if (fillPercent > CRITICAL_FILL_PERCENT) heatVent.classList.add("critical");
      }
    }
    if (powerCapacitor) powerCapacitor.classList.toggle("auto-sell-active", !!sm.getVar("auto_sell"));

    this.updateMobilePassiveTopBar();
  }
}
