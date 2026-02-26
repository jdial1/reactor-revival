import { html, render } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { classMap } from "../../utils/litHelpers.js";
import { styleMap } from "../../utils/litHelpers.js";

const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

const VENTING_ANIM_MS = 400;

export class MobileInfoBarUI {
  constructor(ui) {
    this.ui = ui;
    this._onPauseClick = () => {
      const currentState = this.ui.stateManager.getVar("pause");
      this.ui.stateManager.setVar("pause", !currentState);
    };
    this._onSellPower = (e) => {
      const ui = this.ui;
      if (!ui.game) return;
      const powerBtn = e.currentTarget;
      const moneyBefore = ui.game.state.current_money;
      ui.game.sell_action();
      const moneyAfter = ui.game.state.current_money;
      const moneyGained = moneyAfter?.sub ? moneyAfter.sub(moneyBefore).toNumber() : Number(moneyAfter) - Number(moneyBefore);
      if (moneyGained <= 0) return;
      const moneyDisplay = document.getElementById("control_deck_money");
      const moneyTarget = document.getElementById("mobile_passive_money_value")?.closest(".passive-top-money") ?? document.getElementById("mobile_passive_top_bar");
      if (moneyDisplay) ui.particleEffectsUI.showFloatingText(moneyDisplay, moneyGained);
      if (moneyTarget) {
        ui.particleEffectsUI.createBoltParticle(powerBtn, moneyTarget);
        ui.particleEffectsUI.createSellSparks(powerBtn, moneyTarget);
      }
    };
    this._onVentHeat = (e) => {
      const ui = this.ui;
      if (!ui.game) return;
      const heatBtn = e.currentTarget;
      const maxH = ui.stateManager.getVar("max_heat") || 0;
      const curH = ui.stateManager.getVar("current_heat") || 0;
      const heatRatio = maxH > 0 ? curH / maxH : 0;
      ui.game.manual_reduce_heat_action();
      ui.particleEffectsUI.createSteamParticles(heatBtn, heatRatio);
      heatBtn.classList.add("venting");
      setTimeout(() => heatBtn.classList.remove("venting"), VENTING_ANIM_MS);
    };
  }

  _renderMobilePassive(state) {
    const root = document.getElementById("mobile_passive_root");
    if (!root) return;
    const template = html`
      <span class="passive-top-ep">
        <span class="passive-top-icon" aria-hidden="true">&#129516;</span>
        <span id="mobile_passive_ep">${fmt(state.ep)}</span>
      </span>
      <span class="passive-top-money">
        <span id="mobile_passive_money_value">${fmt(state.money, 0)}</span>
      </span>
      <button
        type="button"
        id="mobile_passive_pause_btn"
        class=${classMap({ "passive-top-pause": true, paused: state.paused })}
        aria-label=${state.paused ? "Resume" : "Pause"}
        title=${state.paused ? "Resume" : "Pause"}
        @click=${this._onPauseClick}
      >
        <img src="img/ui/nav/nav_pause.png" alt="" class="passive-pause-icon pause-icon" />
        <img src="img/ui/nav/nav_play.png" alt="" class="passive-pause-icon play-icon" />
      </button>
    `;
    render(template, root);
  }

  _renderControlDeck(state) {
    const root = document.getElementById("control_deck_root");
    if (!root) return;
    const powerFillStyle = styleMap({ "--power-fill-height": `${state.powerFillPercent}%` });
    const heatFillStyle = styleMap({ "--heat-fill-height": `${state.heatFillPercent}%` });
    const heatVentClass = classMap({ "control-deck-item": true, "heat-vent": true, hazard: state.heatHazard, critical: state.heatCritical });
    const powerCapacitorClass = classMap({ "control-deck-item": true, "power-capacitor": true, "auto-sell-active": state.autoSell });
    const autoSellRateContent = state.showAutoSell
      ? html`<img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="$">${fmt(state.autoSellRate, 0)}`
      : "";
    const autoHeatRateContent = state.showHeatRate
      ? html`<img src="img/ui/icons/icon_heat.png" class="icon-inline" alt="heat">\u2193${fmt(Math.round(state.autoHeatRate), 0)}`
      : "";
    const autoRateClass = classMap({ "control-deck-auto-rate": true, visible: state.showAutoSell });
    const autoHeatRateClass = classMap({ "control-deck-auto-rate": true, visible: state.showHeatRate });

    const template = html`
      <button
        class=${powerCapacitorClass}
        id="control_deck_power_btn"
        type="button"
        tabindex="0"
        aria-label="Sell Power"
        @click=${this._onSellPower}
      >
        <div class="control-deck-auto-sell-led" id="control_deck_auto_sell_led" aria-hidden="true"></div>
        <span class="control-deck-rate" id="control_deck_power_rate" aria-hidden="true">${state.powerRateText}</span>
        <span class=${autoRateClass} id="control_deck_auto_sell_rate" aria-hidden="true">${autoSellRateContent}</span>
        <div class="control-deck-fill power-fill" style=${powerFillStyle}></div>
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_power.png" alt="Power" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_power">${state.power}</span>
          <span class="control-deck-denom" id="control_deck_power_denom">/${state.maxPower ? fmt(state.maxPower, 0) : ""}</span>
        </div>
      </button>

      <div class="control-deck-item money-scoreboard" id="control_deck_money">
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_cash.png" alt="Cash" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_money_value">${state.money}</span>
        </div>
        <div class="floating-text-container" id="floating_text_container"></div>
      </div>

      <button
        class=${heatVentClass}
        id="control_deck_heat_btn"
        type="button"
        tabindex="0"
        aria-label="Vent Heat"
        @click=${this._onVentHeat}
      >
        <span class="control-deck-rate" id="control_deck_heat_rate" aria-hidden="true">${state.heatRateText}</span>
        <span class=${autoHeatRateClass} id="control_deck_auto_heat_rate" aria-hidden="true">${autoHeatRateContent}</span>
        <div class="control-deck-fill heat-fill" style=${heatFillStyle}></div>
        <div class="control-deck-hazard-stripes"></div>
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_heat.png" alt="Heat" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_heat">${state.heat}</span>
          <span class="control-deck-denom" id="control_deck_heat_denom">/${state.maxHeat ? fmt(state.maxHeat, 0) : ""}</span>
        </div>
        <div class="steam-particles" id="steam_particles"></div>
      </button>
    `;
    render(template, root);
  }

  _getRenderState() {
    const { ui } = this;
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return null;
    const sm = ui.stateManager;
    if (!sm) return null;

    const maxPower = toNumber(sm.getVar("max_power") ?? 0);
    const maxHeat = toNumber(sm.getVar("max_heat") ?? 0);
    const powerCurrent = toNumber(ui.displayValues?.power?.current ?? 0);
    const heatCurrent = toNumber(ui.displayValues?.heat?.current ?? 0);
    const powerFillPercent = maxPower > 0 ? Math.min(PERCENT_FULL, Math.max(0, (powerCurrent / maxPower) * PERCENT_FULL)) : 0;
    const heatFillPercent = maxHeat > 0 ? Math.min(PERCENT_FULL, Math.max(0, (heatCurrent / maxHeat) * PERCENT_FULL)) : 0;
    const heatHazard = heatFillPercent >= HAZARD_FILL_PERCENT;
    const heatCritical = heatFillPercent > CRITICAL_FILL_PERCENT;

    const powerDelta = ui.getPowerNetChange();
    const heatDelta = ui.getHeatNetChange();
    const powerRateText = powerDelta === 0 ? "0" : (powerDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(powerDelta), 0);
    const heatRateText = heatDelta === 0 ? "0" : (heatDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(heatDelta), 0);

    const autoSellEnabled = sm.getVar("auto_sell");
    const multiplier = sm.getVar("auto_sell_multiplier") || 0;
    const showAutoSell = autoSellEnabled && multiplier > 0;
    const autoSellRate = showAutoSell ? Math.floor(maxPower * multiplier) : 0;

    const heatControlEnabled = sm.getVar("heat_controlled");
    const showHeatRate = heatControlEnabled && maxHeat > 0;
    const ventBonus = sm.getVar("vent_multiplier_eff") || 0;
    const autoHeatRate = showHeatRate ? (maxHeat / REACTOR_HEAT_STANDARD_DIVISOR) * (1 + ventBonus / VENT_BONUS_PERCENT_DIVISOR) : 0;

    return {
      ep: sm.getVar("current_exotic_particles") ?? sm.getVar("exotic_particles") ?? 0,
      money: fmt(sm.getVar("current_money") ?? 0, 0),
      paused: sm.getVar("pause") === true,
      power: fmt(sm.getVar("current_power") ?? 0, 0),
      heat: fmt(sm.getVar("current_heat") ?? 0, 0),
      maxPower,
      maxHeat,
      powerFillPercent,
      heatFillPercent,
      heatHazard,
      heatCritical,
      powerRateText,
      heatRateText,
      autoSell: !!autoSellEnabled,
      showAutoSell,
      autoSellRate,
      showHeatRate,
      autoHeatRate,
    };
  }

  updateMobilePassiveTopBar() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    const passiveBar = document.getElementById("mobile_passive_top_bar");
    if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
    const state = this._getRenderState();
    if (state) this._renderMobilePassive(state);
  }

  updateControlDeckValues() {
    const state = this._getRenderState();
    if (!state) return;
    this._renderControlDeck(state);
    this.updateMobilePassiveTopBar();
  }
}
