import { html, render } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { logger } from "../../utils/logger.js";
import { FLUX_ACCUMULATOR_POWER_RATIO_MIN, MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { BaseComponent } from "../BaseComponent.js";
import { classMap } from "../../utils/litHelpers.js";
import { styleMap } from "../../utils/litHelpers.js";
import { repeat } from "../../utils/litHelpers.js";

const MS_PER_FRAME_60FPS = 16.667;
const LERP_FACTOR = 0.15;
const LERP_EPSILON = 0.1;
const MIN_SPEED_FACTOR = 0.05;
const FORMAT_ABBREV_THRESHOLD = 1000;
const LOG10_STEP = 3;
const DECIMAL_PLACES_SHORT = 2;
const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;
const VENTING_ANIM_MS = 400;

function formatDisplayValue(key, val, obj, isDesktop) {
  if (isDesktop && (key === "heat" || key === "power" || key === "money")) {
    const num = toNumber(val);
    if (!Number.isNaN(num)) {
      const absNum = Math.abs(num);
      if (absNum >= FORMAT_ABBREV_THRESHOLD) {
        const pow = Math.floor(Math.log10(absNum) / LOG10_STEP) * LOG10_STEP;
        const mantissa = num / Math.pow(10, pow);
        const suffix = ["K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc", "No", "Dc"][pow / 3 - 1] || "";
        return mantissa.toFixed(DECIMAL_PLACES_SHORT) + suffix;
      }
      return num.toFixed(DECIMAL_PLACES_SHORT);
    }
    return fmt(val, DECIMAL_PLACES_SHORT, true);
  }
  return fmt(val, obj.format0 ? (isDesktop ? DECIMAL_PLACES_SHORT : 0) : null);
}

function collectActiveBuffs(sm) {
  const activeBuffs = [];
  if ((sm.getVar("manual_override_mult") || 0) > 0 && Date.now() < (sm.getVar("override_end_time") || 0)) {
    activeBuffs.push({ id: "manual_override", icon: "img/ui/nav/nav_play.png", title: "Manual Override" });
  }
  if ((sm.getVar("power_to_heat_ratio") || 0) > 0) {
    const maxHeat = sm.getVar("max_heat") || 0;
    const currentHeat = sm.getVar("current_heat") || 0;
    const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
    if (heatPercent > CRITICAL_FILL_PERCENT / PERCENT_FULL && (sm.getVar("current_power") || 0) > 0) {
      activeBuffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitors/capacitor_4.png", title: "Electro-Thermal Conversion" });
    }
  }
  const maxPower = sm.getVar("max_power") || 0;
  if ((sm.getVar("flux_accumulator_level") || 0) > 0 && maxPower > 0) {
    const powerRatio = (sm.getVar("current_power") || 0) / maxPower;
    if (powerRatio >= FLUX_ACCUMULATOR_POWER_RATIO_MIN) {
      activeBuffs.push({ id: "flux_accumulators", icon: "img/parts/capacitors/capacitor_6.png", title: "Flux Accumulators" });
    }
  }
  return activeBuffs;
}

export class InfoBarUI extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this._infoBarAbortController = null;
    this._onSellPowerDesktop = (e) => this._handleSellPower(e.currentTarget);
    this._onHeatDesktop = (e) => this._handleHeat(e.currentTarget);
    this._onSellPowerMobile = (e) => this._handleSellPower(e.currentTarget);
    this._onHeatMobile = (e) => this._handleHeat(e.currentTarget, true);
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

  teardown() {
    if (this._infoBarAbortController) {
      this._infoBarAbortController.abort();
      this._infoBarAbortController = null;
    }
  }

  _render(state) {
    const root = document.getElementById("info_bar_root");
    if (!root) return;
    const ui = this.ui;
    const isDesktop = window.innerWidth > MOBILE_BREAKPOINT_PX;
    const powerFillPercent = state.maxPower > 0 ? Math.min(PERCENT_FULL, Math.max(0, (toNumber(state.powerCurrent) / state.maxPower) * PERCENT_FULL)) : 0;
    const heatFillPercent = state.maxHeat > 0 ? Math.min(PERCENT_FULL, Math.max(0, (toNumber(state.heatCurrent) / state.maxHeat) * PERCENT_FULL)) : 0;
    const isPowerFull = powerFillPercent >= 100;
    const isHeatFull = heatFillPercent >= 100;
    const heatHazard = heatFillPercent >= HAZARD_FILL_PERCENT;
    const heatCritical = heatFillPercent > CRITICAL_FILL_PERCENT;

    const powerItemStyle = styleMap({ "--fill-height": `${powerFillPercent}%` });
    const heatItemStyle = styleMap({ "--fill-height": `${heatFillPercent}%` });
    const powerItemClass = classMap({ "info-item": true, power: true, full: isPowerFull });
    const heatItemClass = classMap({ "info-item": true, heat: true, full: isHeatFull });

    const buffIcons = (buff) => html`
      <div class="buff-icon active" title=${buff.title} aria-label=${buff.title}>
        <img src=${buff.icon} alt=${buff.title} />
      </div>
    `;

    const desktopPowerDenom = html`
      /${fmt(state.maxPower, 2, true)}
      <span class="tick-change ${state.powerNetChange >= 0 ? "positive" : "negative"}">${state.powerNetChange >= 0 ? "↑" : "↓"} ${fmt(Math.abs(state.powerNetChange), 2, true)}</span>
    `;
    const desktopHeatDenom = html`
      /${fmt(state.maxHeat, 2, true)}
      <span class="tick-change ${state.heatNetChange >= 0 ? "positive" : "negative"}">${state.heatNetChange >= 0 ? "↑" : "↓"} ${fmt(Math.abs(state.heatNetChange), 2, true)}</span>
    `;
    const mobilePowerDenom = html`
      /${fmt(state.maxPower)}
      <span class="tick-change ${state.powerNetChange >= 0 ? "positive" : "negative"}">${state.powerNetChange >= 0 ? "↑" : "↓"} ${fmt(Math.abs(state.powerNetChange))}</span>
    `;
    const mobileHeatDenom = html`
      /${fmt(state.maxHeat)}
      <span class="tick-change ${state.heatNetChange >= 0 ? "positive" : "negative"}">${state.heatNetChange >= 0 ? "↑" : "↓"} ${fmt(Math.abs(state.heatNetChange))}</span>
    `;

    const template = html`
      <div class="info-bar-desktop">
        <button class=${powerItemClass} id="info_bar_power_btn_desktop" type="button" tabindex="0" aria-label="Sell Power" style=${powerItemStyle} @click=${this._onSellPowerDesktop}>
          <img src="img/ui/icons/icon_power.png" alt="Power" class="icon" />
          <span class="value" id="info_power_desktop">${state.powerFormatted}</span>
          <span class="denom" id="info_power_denom_desktop">${desktopPowerDenom}</span>
        </button>
        <span class="info-item money">
          <img src="img/ui/icons/icon_cash.png" alt="Cash" class="icon" />
          <span class="value" id="info_money_desktop">${state.moneyFormatted}</span>
        </span>
        <span class="info-item ep" id="info_ep_desktop">
          <span class="ep-content" style="display: ${state.epVisible ? "flex" : "none"}">
            <span class="icon">🧬</span>
            <span class="value" id="info_ep_value_desktop">${state.epFormatted}</span>
          </span>
        </span>
        <button class=${heatItemClass} id="info_bar_heat_btn_desktop" type="button" tabindex="0" aria-label="Reduce Heat" style=${heatItemStyle} @click=${this._onHeatDesktop}>
          <img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon" />
          <span class="value" id="info_heat_desktop">${state.heatFormatted}</span>
          <span class="denom" id="info_heat_denom_desktop">${desktopHeatDenom}</span>
        </button>
        <div class="info-item buffs" id="info_bar_buffs_desktop">${repeat(state.activeBuffs, (b) => b.id, buffIcons)}</div>
      </div>
      <div class="info-bar-mobile" style="display: none;">
        <div class="info-row info-main">
          <button class=${powerItemClass} id="info_bar_power_btn" type="button" tabindex="0" aria-label="Sell Power" style=${powerItemStyle} @click=${this._onSellPowerMobile}>
            <img src="img/ui/icons/icon_power.png" alt="Power" class="icon" />
            <span class="value" id="info_power">${state.powerFormattedMobile}</span>
          </button>
          <span class="info-item money">
            <img src="img/ui/icons/icon_cash.png" alt="Cash" class="icon" />
            <span class="value" id="info_money">${state.moneyFormattedMobile}</span>
          </span>
          <button class=${heatItemClass} id="info_bar_heat_btn" type="button" tabindex="0" aria-label="Reduce Heat" style=${heatItemStyle} @click=${this._onHeatMobile}>
            <img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon" />
            <span class="value" id="info_heat">${state.heatFormattedMobile}</span>
          </button>
        </div>
        <div class="info-row info-denom">
          <span class="info-item power"><span class="denom" id="info_power_denom">${mobilePowerDenom}</span></span>
          <div class="info-item center-content">
            <span class="info-item ep" id="info_ep">
              <span class="ep-content" style="display: ${state.epVisible ? "flex" : "none"}">
                <span class="icon">🧬</span>
                <span class="value" id="info_ep_value">${state.epFormatted}</span>
              </span>
            </span>
            <div class="info-item buffs" id="info_bar_buffs">${repeat(state.activeBuffs, (b) => b.id, buffIcons)}</div>
          </div>
          <span class="info-item heat"><span class="denom" id="info_heat_denom">${mobileHeatDenom}</span></span>
        </div>
      </div>
    `;
    render(template, root);
  }

  _getRenderState() {
    const ui = this.ui;
    if (!ui.displayValues || !ui.stateManager) return null;
    const isDesktop = window.innerWidth > MOBILE_BREAKPOINT_PX;
    const dv = ui.displayValues;
    const powerFormatted = formatDisplayValue("power", dv.power?.current ?? 0, dv.power ?? {}, isDesktop);
    const heatFormatted = formatDisplayValue("heat", dv.heat?.current ?? 0, dv.heat ?? {}, isDesktop);
    const moneyFormatted = formatDisplayValue("money", dv.money?.current ?? 0, dv.money ?? {}, isDesktop);
    const epFormatted = fmt(dv.ep?.current ?? 0);
    const powerFormattedMobile = fmt(dv.power?.current ?? 0, 0);
    const heatFormattedMobile = fmt(dv.heat?.current ?? 0, 0);
    const moneyFormattedMobile = fmt(dv.money?.current ?? 0, 0);
    const maxPower = toNumber(ui.stateManager.getVar("max_power") ?? 0);
    const maxHeat = toNumber(ui.stateManager.getVar("max_heat") ?? 0);
    const epVisible = toNumber(dv.ep?.current ?? 0) > 0;
    return {
      powerFormatted,
      heatFormatted,
      moneyFormatted,
      epFormatted,
      powerFormattedMobile,
      heatFormattedMobile,
      moneyFormattedMobile,
      maxPower,
      maxHeat,
      powerCurrent: dv.power?.current ?? 0,
      heatCurrent: dv.heat?.current ?? 0,
      powerNetChange: ui.getPowerNetChange(),
      heatNetChange: ui.getHeatNetChange(),
      epVisible,
      activeBuffs: ui.game?.state?.active_buffs ?? collectActiveBuffs(ui.stateManager),
    };
  }

  updateRollingNumbers(dt) {
    const ui = this.ui;
    if (typeof document === "undefined" || !document || typeof document.getElementById !== "function") return;
    const timeScale = dt / MS_PER_FRAME_60FPS;
    const lerpFactor = LERP_FACTOR * timeScale;
    const epsilon = LERP_EPSILON;
    for (const key in ui.displayValues) {
      const obj = ui.displayValues[key];
      const targetNum = toNumber(obj.target);
      const currentNum = toNumber(obj.current);
      const diff = targetNum - currentNum;
      if (Math.abs(diff) > 0) {
        if (Math.abs(diff) < epsilon && targetNum !== 0) {
          obj.current = obj.target;
        } else {
          const minSpeed = Math.max(1, Math.abs(diff) * MIN_SPEED_FACTOR);
          const change = diff * lerpFactor;
          if (Math.abs(change) < minSpeed * timeScale) {
            obj.current = currentNum + Math.sign(diff) * minSpeed * timeScale;
          } else {
            obj.current = currentNum + change;
          }
          const newCurrent = obj.current;
          if ((diff > 0 && newCurrent >= targetNum) || (diff < 0 && newCurrent <= targetNum) || Math.abs(targetNum - newCurrent) < epsilon) {
            obj.current = obj.target;
          }
        }
      }
    }
    const state = this._getRenderState();
    if (state) this._render(state);

    if (window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      const powerFill = document.querySelector(".power-fill");
      const heatFill = document.querySelector(".heat-fill");
      const heatVent = document.querySelector(".heat-vent");
      const maxP = toNumber(ui.stateManager.getVar("max_power") ?? 0);
      const maxH = toNumber(ui.stateManager.getVar("max_heat") ?? 0);
      const powerCurrent = ui.displayValues.power ? toNumber(ui.displayValues.power.current) : 0;
      const heatCurrent = ui.displayValues.heat ? toNumber(ui.displayValues.heat.current) : 0;
      if (powerFill && maxP > 0) {
        const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (powerCurrent / maxP) * PERCENT_FULL));
        powerFill.style.setProperty("--power-fill-height", `${fillPercent}%`);
      }
      if (heatFill && maxH > 0) {
        const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (heatCurrent / maxH) * PERCENT_FULL));
        heatFill.style.setProperty("--heat-fill-height", `${fillPercent}%`);
        if (heatVent) {
          heatVent.classList.remove("hazard", "critical");
          if (fillPercent >= HAZARD_FILL_PERCENT) heatVent.classList.add("hazard", "critical");
          else if (fillPercent > CRITICAL_FILL_PERCENT) heatVent.classList.add("critical");
        }
      }
    }
  }

  updatePowerDenom() {
    const state = this._getRenderState();
    if (state) this._render(state);
  }

  updateHeatDenom() {
    const state = this._getRenderState();
    if (state) this._render(state);
  }

  updateInfoBarFillIndicator() {
    const state = this._getRenderState();
    if (state) this._render(state);
  }

  updateActiveBuffs() {
    const state = this._getRenderState();
    if (state) this._render(state);
  }

  updateTimeFluxButton(count) {
    const ui = this.ui;
    const btn = ui.DOMElements.time_flux_toggle;
    if (!btn) return;
    const label = btn.querySelector(".control-text");
    if (label) {
      const previousText = label.textContent;
      const previousHasQueue = btn.classList.contains("has-queue");
      const timeFluxEnabled = ui.game && ui.game.time_flux;
      const hasQueue = count > 1;
      label.textContent = hasQueue ? `Time Flux (${count})` : `Time Flux`;
      btn.classList.toggle("has-queue", hasQueue);
      const hasQueueChanged = previousHasQueue !== btn.classList.contains("has-queue");
      if (ui.game && (previousText !== label.textContent || hasQueueChanged)) {
        logger.log("debug", "ui", `[TIME FLUX UI] Button state: "${label.textContent}", Queued ticks: ${count}, Time Flux: ${timeFluxEnabled ? "ON" : "OFF"}, Has queue class: ${btn.classList.contains("has-queue")}`);
      }
    }
  }

  setupInfoBarButtons() {
    this.teardown();
    this._infoBarAbortController = new AbortController();
    const signal = this._infoBarAbortController.signal;
    const ui = this.ui;

    const handleSellAction = (powerBtn) => {
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
    };

    const handleHeatAction = (heatBtn, venting = false) => {
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
    };

    document.getElementById("control_deck_build_fab")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      ui.partsPanelUI.togglePartsPanelForBuildButton();
    }, { signal });
  }

  setupHeatPowerListeners() {
    const ui = this.ui;
    document.getElementById("info_bar")?.addEventListener("click", (e) => {
      const heatBtn = e.target.closest(".info-item.heat");
      const powerBtn = e.target.closest(".info-item.power");
      if (heatBtn && ui.game) ui.game.manual_reduce_heat_action();
      if (powerBtn && ui.game) ui.game.sell_action();
    });
  }
}
