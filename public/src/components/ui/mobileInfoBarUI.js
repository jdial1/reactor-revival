import { html } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { classMap, styleMap } from "../../utils/litHelpers.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

const VENTING_ANIM_MS = 400;

export class MobileInfoBarUI {
  constructor(ui) {
    this.ui = ui;
    this._unmountControlDeck = null;
    this._unmountPassiveBar = null;

    this._onPauseClick = () => {
      const currentState = this.ui.stateManager.getVar("pause");
      this.ui.stateManager.setVar("pause", !currentState);
    };

    this._onSellPower = (e) => {
      const ui = this.ui;
      if (!ui.game) return;
      const moneyBefore = ui.game.state.current_money;
      ui.game.sell_action();
      const moneyAfter = ui.game.state.current_money;
      const moneyGained = moneyAfter?.sub ? moneyAfter.sub(moneyBefore).toNumber() : Number(moneyAfter) - Number(moneyBefore);
      if (moneyGained <= 0) return;
      const moneyTarget = document.getElementById("mobile_passive_money_value")?.closest(".passive-top-money");
      if (moneyTarget) {
        ui.particleEffectsUI.createBoltParticle(e.currentTarget, moneyTarget);
        ui.particleEffectsUI.createSellSparks(e.currentTarget, moneyTarget);
      }
      const moneyDisplay = document.getElementById("control_deck_money");
      if (moneyDisplay) ui.particleEffectsUI.showFloatingText(moneyDisplay, moneyGained);
    };

    this._onVentHeat = (e) => {
      const ui = this.ui;
      if (!ui.game) return;
      const btn = e.currentTarget;
      if (!btn) return;
      const maxH = ui.stateManager.getVar("max_heat") || 0;
      const curH = ui.stateManager.getVar("current_heat") || 0;
      const heatRatio = maxH > 0 ? curH / maxH : 0;
      ui.game.manual_reduce_heat_action();
      ui.particleEffectsUI.createSteamParticles(btn, heatRatio);
      btn.classList.add("venting");
      setTimeout(() => btn.classList.remove("venting"), VENTING_ANIM_MS);
    };
  }

  _controlDeckTemplate(state) {
    const maxPower = toNumber(state.max_power ?? 0);
    const maxHeat = toNumber(state.max_heat ?? 0);
    const powerCurrent = toNumber(state.current_power ?? 0);
    const heatCurrent = toNumber(state.current_heat ?? 0);

    const powerFillPercent = maxPower > 0 ? Math.min(PERCENT_FULL, Math.max(0, (powerCurrent / maxPower) * PERCENT_FULL)) : 0;
    const heatFillPercent = maxHeat > 0 ? Math.min(PERCENT_FULL, Math.max(0, (heatCurrent / maxHeat) * PERCENT_FULL)) : 0;

    const heatHazard = heatFillPercent >= HAZARD_FILL_PERCENT;
    const heatCritical = heatFillPercent > CRITICAL_FILL_PERCENT;

    const powerDelta = state.power_net_change ?? 0;
    const heatDelta = state.heat_net_change ?? 0;
    const powerRateText = powerDelta === 0 ? "0" : (powerDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(powerDelta), 0);
    const heatRateText = heatDelta === 0 ? "0" : (heatDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(heatDelta), 0);

    const autoSellEnabled = !!state.auto_sell;
    const multiplier = toNumber(state.auto_sell_multiplier ?? 0);
    const showAutoSell = autoSellEnabled && multiplier > 0;
    const autoSellRate = showAutoSell ? Math.floor(maxPower * multiplier) : 0;

    const heatControlEnabled = !!state.heat_controlled;
    const showHeatRate = heatControlEnabled && maxHeat > 0;
    const ventBonus = toNumber(state.vent_multiplier_eff ?? 0);
    const autoHeatRate = showHeatRate ? (maxHeat / REACTOR_HEAT_STANDARD_DIVISOR) * (1 + ventBonus / VENT_BONUS_PERCENT_DIVISOR) : 0;

    const powerFillStyle = styleMap({ "--power-fill-height": `${powerFillPercent}%` });
    const heatFillStyle = styleMap({ "--heat-fill-height": `${heatFillPercent}%` });
    const heatVentClass = classMap({ "control-deck-item": true, "heat-vent": true, hazard: heatHazard, critical: heatCritical });
    const powerCapacitorClass = classMap({ "control-deck-item": true, "power-capacitor": true, "auto-sell-active": autoSellEnabled });

    const autoSellRateContent = showAutoSell ? html`<img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="$">${fmt(autoSellRate, 0)}` : "";
    const autoHeatRateContent = showHeatRate ? html`<img src="img/ui/icons/icon_heat.png" class="icon-inline" alt="heat">\u2193${fmt(Math.round(autoHeatRate), 0)}` : "";
    const autoRateClass = classMap({ "control-deck-auto-rate": true, visible: showAutoSell });
    const autoHeatRateClass = classMap({ "control-deck-auto-rate": true, visible: showHeatRate });

    return html`
      <button class=${powerCapacitorClass} id="control_deck_power_btn" type="button" tabindex="0" aria-label="Sell Power" @click=${this._onSellPower}>
        <div class="control-deck-auto-sell-led" id="control_deck_auto_sell_led" aria-hidden="true"></div>
        <span class="control-deck-rate" id="control_deck_power_rate" aria-hidden="true">${powerRateText}</span>
        <span class=${autoRateClass} id="control_deck_auto_sell_rate" aria-hidden="true">${autoSellRateContent}</span>
        <div class="control-deck-fill power-fill" style=${powerFillStyle}></div>
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_power.png" alt="Power" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_power">${fmt(powerCurrent, 0)}</span>
          <span class="control-deck-denom" id="control_deck_power_denom">/${maxPower ? fmt(maxPower, 0) : ""}</span>
        </div>
      </button>

      <div class="control-deck-item money-scoreboard" id="control_deck_money">
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_cash.png" alt="Cash" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_money_value">${fmt(state.current_money ?? 0, 0)}</span>
        </div>
        <div class="floating-text-container" id="floating_text_container"></div>
      </div>

      <button class=${heatVentClass} id="control_deck_heat_btn" type="button" tabindex="0" aria-label="Vent Heat" @click=${this._onVentHeat}>
        <span class="control-deck-rate" id="control_deck_heat_rate" aria-hidden="true">${heatRateText}</span>
        <span class=${autoHeatRateClass} id="control_deck_auto_heat_rate" aria-hidden="true">${autoHeatRateContent}</span>
        <div class="control-deck-fill heat-fill" style=${heatFillStyle}></div>
        <div class="control-deck-hazard-stripes"></div>
        <div class="control-deck-content">
          <img src="img/ui/icons/icon_heat.png" alt="Heat" class="control-deck-icon" />
          <span class="control-deck-value" id="control_deck_heat">${fmt(heatCurrent, 0)}</span>
          <span class="control-deck-denom" id="control_deck_heat_denom">/${maxHeat ? fmt(maxHeat, 0) : ""}</span>
        </div>
        <div class="steam-particles" id="steam_particles"></div>
      </button>
    `;
  }

  _passiveBarTemplate(state) {
    return html`
      <span class="passive-top-ep">
        <span class="passive-top-icon" aria-hidden="true">&#129516;</span>
        <span id="mobile_passive_ep">${fmt(state.current_exotic_particles ?? 0)}</span>
      </span>
      <span class="passive-top-money">
        <span id="mobile_passive_money_value">${fmt(state.current_money ?? 0, 0)}</span>
      </span>
      <button
        type="button"
        id="mobile_passive_pause_btn"
        class=${classMap({ "passive-top-pause": true, paused: !!state.pause })}
        aria-label=${state.pause ? "Resume" : "Pause"}
        title=${state.pause ? "Resume" : "Pause"}
        @click=${this._onPauseClick}
      >
        <img src="img/ui/nav/nav_pause.png" alt="" class="passive-pause-icon pause-icon" />
        <img src="img/ui/nav/nav_play.png" alt="" class="passive-pause-icon play-icon" />
      </button>
    `;
  }

  updateControlDeckValues() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX || this._unmountControlDeck || !this.ui.game?.state) return;

    const root = document.getElementById("control_deck_root");
    if (!root) return;

    const subscriptions = [{
      state: this.ui.game.state,
      keys: ["max_power", "max_heat", "current_power", "current_heat", "power_net_change", "heat_net_change", "auto_sell", "auto_sell_multiplier", "heat_controlled", "vent_multiplier_eff", "current_money"],
    }];
    this._unmountControlDeck = ReactiveLitComponent.mountMulti(subscriptions, () => this._controlDeckTemplate(this.ui.game.state), root);
    this.updateMobilePassiveTopBar();
  }

  updateMobilePassiveTopBar() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX || this._unmountPassiveBar || !this.ui.game?.state) return;

    const passiveBar = document.getElementById("mobile_passive_top_bar");
    if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
    const root = document.getElementById("mobile_passive_root");
    if (!root) return;

    const subscriptions = [{
      state: this.ui.game.state,
      keys: ["current_exotic_particles", "current_money", "pause"],
    }];
    this._unmountPassiveBar = ReactiveLitComponent.mountMulti(subscriptions, () => this._passiveBarTemplate(this.ui.game.state), root);
  }

  cleanup() {
    if (this._unmountControlDeck) {
      this._unmountControlDeck();
      this._unmountControlDeck = null;
    }
    if (this._unmountPassiveBar) {
      this._unmountPassiveBar();
      this._unmountPassiveBar = null;
    }
  }
}
