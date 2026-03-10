import { html } from "lit-html";
import { classMap, styleMap, repeat } from "../../utils/litHelpers.js";
import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";

const VENTING_ANIM_MS = 400;

export class InfoBarUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('InfoBar', this);
    this._unmount = null;
    this._infoBarAbortController = null;
  }

  setupInfoBarButtons() {
    const root = document.getElementById("info_bar_root");
    if (!root || !this.ui.game?.state) return;

    this.teardown();
    this._infoBarAbortController = new AbortController();
    const signal = this._infoBarAbortController.signal;

    const subscriptions = [{
      state: this.ui.game.state,
      keys: ["current_power", "max_power", "current_heat", "max_heat", "current_money", "current_exotic_particles", "active_buffs", "melting_down"],
    }];
    this._unmount = ReactiveLitComponent.mountMulti(subscriptions, () => this._infoBarTemplate(this.ui.game.state), root);

    document.getElementById("control_deck_build_fab")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.ui.partsPanelUI.togglePartsPanelForBuildButton();
    }, { signal });
  }

  setupHeatPowerListeners() {
  }

  teardown() {
    if (this._unmount) {
      this._unmount();
      this._unmount = null;
    }
    if (this._infoBarAbortController) {
      this._infoBarAbortController.abort();
      this._infoBarAbortController = null;
    }
  }

  _handleSellPower(powerBtn) {
    const ui = this.ui;
    if (!ui.game) return;
    const moneyBefore = ui.game.state.current_money;
    ui.game.sell_action();
    const moneyAfter = ui.game.state.current_money;
    const moneyGained = moneyAfter?.sub ? moneyAfter.sub(moneyBefore).toNumber() : Number(moneyAfter) - Number(moneyBefore);
    if (moneyGained <= 0) return;
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    const moneyDisplay = document.getElementById("control_deck_money");
    const moneyTarget = isMobile
      ? document.getElementById("mobile_passive_money_value")?.closest(".passive-top-money") ?? document.getElementById("mobile_passive_top_bar")
      : moneyDisplay;
    if (moneyDisplay) ui.particleEffectsUI.showFloatingText(moneyDisplay, moneyGained);
    if (moneyTarget) {
      ui.particleEffectsUI.createBoltParticle(powerBtn, moneyTarget);
      ui.particleEffectsUI.createSellSparks(powerBtn, moneyTarget);
    }
  }

  _handleHeat(heatBtn, venting = false) {
    const ui = this.ui;
    if (!ui.game) return;
    const maxH = ui.stateManager.getVar("max_heat") || 0;
    const curH = ui.stateManager.getVar("current_heat") || 0;
    const heatRatio = maxH > 0 ? curH / maxH : 0;
    ui.game.manual_reduce_heat_action();
    ui.particleEffectsUI.createSteamParticles(heatBtn, heatRatio);
    if (venting) {
      heatBtn.classList.add("venting");
      setTimeout(() => heatBtn.classList.remove("venting"), VENTING_ANIM_MS);
    }
  }

  _infoBarTemplate(state) {
    const power = toNumber(state.current_power);
    const heat = toNumber(state.current_heat);
    const maxP = toNumber(state.max_power) || 1;
    const maxH = toNumber(state.max_heat) || 1;

    const powerPct = Math.min(100, Math.max(0, (power / maxP) * 100));
    const heatPct = Math.min(100, Math.max(0, (heat / maxH) * 100));

    const meltdown = !!state.melting_down;
    const powerClass = classMap({ "info-item": true, power: true, full: powerPct >= 100, meltdown });
    const heatClass = classMap({ "info-item": true, heat: true, full: heatPct >= 100, meltdown });
    const moneyDisplay = meltdown ? "☢️" : `$${fmt(state.current_money, 2)}`;
    const moneyDisplayMobile = meltdown ? "☢️" : fmt(state.current_money, 0);

    const onSell = (e) => this._handleSellPower(e.currentTarget);
    const onVent = (e) => this._handleHeat(e.currentTarget);
    const onVentMobile = (e) => this._handleHeat(e.currentTarget, true);

    const buffIcons = (buff) => html`
      <div class="buff-icon active" title=${buff.title} aria-label=${buff.title}>
        <img src=${buff.icon} alt=${buff.title} />
      </div>
    `;
    const activeBuffs = state.active_buffs ?? [];

    const epVisible = toNumber(state.current_exotic_particles) > 0;
    const epContentStyle = styleMap({ display: epVisible ? "flex" : "none" });

    return html`
      <div class="info-bar-desktop">
        <button class=${powerClass} id="info_bar_power_btn_desktop" type="button" tabindex="0" aria-label="Sell Power" style=${styleMap({ "--fill-height": `${powerPct}%` })} @click=${onSell}>
          <img src="img/ui/icons/icon_power.png" class="icon" alt="Power" />
          <span class="value" id="info_power_desktop">${fmt(power, 2)}</span>
          <span class="denom" id="info_power_denom_desktop">/${fmt(maxP, 2)}</span>
        </button>
        <span class="info-item money">
          <img src="img/ui/icons/icon_cash.png" class="icon" alt="Cash" />
          <span class="value" id="info_money_desktop">${moneyDisplay}</span>
        </span>
        <span class="info-item ep" id="info_ep_desktop">
          <span class="ep-content" style=${epContentStyle}>
            <span class="icon">🧬</span>
            <span class="value" id="info_ep_value_desktop">${fmt(state.current_exotic_particles)}</span>
          </span>
        </span>
        <div class="info-item buffs">${repeat(activeBuffs, (b) => b.id, buffIcons)}</div>
        <button class=${heatClass} id="info_bar_heat_btn_desktop" type="button" tabindex="0" aria-label="Reduce Heat" style=${styleMap({ "--fill-height": `${heatPct}%` })} @click=${onVent}>
          <img src="img/ui/icons/icon_heat.png" class="icon" alt="Heat" />
          <span class="value" id="info_heat_desktop">${fmt(heat, 2)}</span>
          <span class="denom" id="info_heat_denom_desktop">/${fmt(maxH, 2)}</span>
        </button>
      </div>
      <div class="info-bar-mobile" style="display: none;">
        <div class="info-row info-main">
          <button class=${powerClass} id="info_bar_power_btn" type="button" tabindex="0" aria-label="Sell Power" style=${styleMap({ "--fill-height": `${powerPct}%` })} @click=${onSell}>
            <img src="img/ui/icons/icon_power.png" class="icon" alt="Power" />
            <span class="value" id="info_power">${fmt(power, 0)}</span>
          </button>
          <span class="info-item money">
            <img src="img/ui/icons/icon_cash.png" class="icon" alt="Cash" />
            <span class="value" id="info_money">${moneyDisplayMobile}</span>
          </span>
          <button class=${heatClass} id="info_bar_heat_btn" type="button" tabindex="0" aria-label="Reduce Heat" style=${styleMap({ "--fill-height": `${heatPct}%` })} @click=${onVentMobile}>
            <img src="img/ui/icons/icon_heat.png" class="icon" alt="Heat" />
            <span class="value" id="info_heat">${fmt(heat, 0)}</span>
          </button>
        </div>
        <div class="info-row info-denom">
          <span class="info-item power"><span class="denom" id="info_power_denom">/${fmt(maxP)}</span></span>
          <div class="info-item center-content">
            <span class="info-item ep" id="info_ep">
              <span class="ep-content" style=${epContentStyle}>
                <span class="icon">🧬</span>
                <span class="value" id="info_ep_value">${fmt(state.current_exotic_particles)}</span>
              </span>
            </span>
            <div class="info-item buffs">${repeat(activeBuffs, (b) => b.id, buffIcons)}</div>
          </div>
          <span class="info-item heat"><span class="denom" id="info_heat_denom">/${fmt(maxH)}</span></span>
        </div>
      </div>
    `;
  }

}
