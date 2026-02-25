import { numFormat as fmt } from "../../utils/util.js";
import { toNumber } from "../../utils/decimal.js";
import { logger } from "../../utils/logger.js";
import { FLUX_ACCUMULATOR_POWER_RATIO_MIN, MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { BaseComponent } from "../BaseComponent.js";

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

export class InfoBarUI extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this._infoBarAbortController = null;
  }

  teardown() {
    if (this._infoBarAbortController) {
      this._infoBarAbortController.abort();
      this._infoBarAbortController = null;
    }
  }

  updateRollingNumbers(dt) {
    const ui = this.ui;
    if (typeof document === 'undefined' || !document || typeof document.getElementById !== 'function') return;
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
        const val = obj.current;
        const isDesktop = window.innerWidth > MOBILE_BREAKPOINT_PX;
        let formatted;
        if (isDesktop && (key === 'heat' || key === 'power' || key === 'money')) {
          const num = toNumber(val);
          if (!Number.isNaN(num)) {
            const absNum = Math.abs(num);
            if (absNum >= FORMAT_ABBREV_THRESHOLD) {
              const pow = Math.floor(Math.log10(absNum) / LOG10_STEP) * LOG10_STEP;
              const mantissa = num / Math.pow(10, pow);
              const suffix = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'][(pow / 3) - 1] || '';
              formatted = mantissa.toFixed(DECIMAL_PLACES_SHORT) + suffix;
            } else {
              formatted = num.toFixed(DECIMAL_PLACES_SHORT);
            }
          } else {
            formatted = fmt(val, DECIMAL_PLACES_SHORT, true);
          }
        } else {
          formatted = fmt(val, obj.format0 ? (isDesktop ? DECIMAL_PLACES_SHORT : 0) : null);
        }

        obj.domId.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.textContent !== formatted) el.textContent = formatted;
        });
      }
    }

    const maxPowerRaw = ui.stateManager.getVar("max_power");
    const maxHeatRaw = ui.stateManager.getVar("max_heat");
    const maxPower = toNumber(maxPowerRaw);
    const maxHeat = toNumber(maxHeatRaw);
    const powerCurrent = ui.displayValues.power ? toNumber(ui.displayValues.power.current) : 0;
    const heatCurrent = ui.displayValues.heat ? toNumber(ui.displayValues.heat.current) : 0;
    this.updateInfoBarFillIndicator("power", powerCurrent, maxPower);
    this.updateInfoBarFillIndicator("heat", heatCurrent, maxHeat);

    if (window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      const powerFill = document.querySelector(".power-fill");
      const heatFill = document.querySelector(".heat-fill");
      const heatVent = document.querySelector(".heat-vent");
      const maxP = maxPower;
      const maxH = maxHeat;
      if (powerFill && maxP > 0) {
        const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (toNumber(powerCurrent) / maxP) * PERCENT_FULL));
        powerFill.style.setProperty("--power-fill-height", `${fillPercent}%`);
      }
      if (heatFill && maxH > 0) {
        const fillPercent = Math.min(PERCENT_FULL, Math.max(0, (toNumber(heatCurrent) / maxH) * PERCENT_FULL));
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
    const ui = this.ui;
    const maxPower = ui.stateManager.getVar("max_power") || 0;
    const netChange = ui.getPowerNetChange();
    const mobileDenom = document.getElementById("info_power_denom");
    const desktopDenom = document.getElementById("info_power_denom_desktop");
    const arrow = netChange >= 0 ? "↑" : "↓";
    const isPositive = netChange >= 0;
    const mobileText = `/${fmt(maxPower)} <span class="tick-change ${isPositive ? 'positive' : 'negative'}">${arrow} ${fmt(Math.abs(netChange))}</span>`;
    const desktopText = `/${fmt(maxPower, 2, true)} <span class="tick-change ${isPositive ? 'positive' : 'negative'}">${arrow} ${fmt(Math.abs(netChange), 2, true)}</span>`;
    if (mobileDenom) {
      mobileDenom.innerHTML = mobileText;
      mobileDenom.style.textAlign = "right";
    }
    if (desktopDenom) {
      desktopDenom.innerHTML = desktopText;
      desktopDenom.style.textAlign = "right";
    }
  }

  updateHeatDenom() {
    const ui = this.ui;
    const maxHeat = ui.stateManager.getVar("max_heat") || 0;
    const netChange = ui.getHeatNetChange();
    const mobileDenom = document.getElementById("info_heat_denom");
    const desktopDenom = document.getElementById("info_heat_denom_desktop");
    const arrow = netChange >= 0 ? "↑" : "↓";
    const isPositive = netChange >= 0;
    const mobileText = `/${fmt(maxHeat)} <span class="tick-change ${isPositive ? 'positive' : 'negative'}">${arrow} ${fmt(Math.abs(netChange))}</span>`;
    const desktopText = `/${fmt(maxHeat, 2, true)} <span class="tick-change ${isPositive ? 'positive' : 'negative'}">${arrow} ${fmt(Math.abs(netChange), 2, true)}</span>`;
    if (mobileDenom) {
      mobileDenom.innerHTML = mobileText;
      mobileDenom.style.textAlign = "right";
    }
    if (desktopDenom) {
      desktopDenom.innerHTML = desktopText;
      desktopDenom.style.textAlign = "right";
    }
  }

  updateInfoBarFillIndicator(type, current, max) {
    const percentage = max > 0 ? Math.min(PERCENT_FULL, Math.max(0, (current / max) * PERCENT_FULL)) : 0;
    const isFull = percentage >= 100;
    const desktopElement = document.querySelector(`.info-bar-desktop .info-item.${type}`);
    const mobileElement = document.querySelector(`#info_bar .info-row.info-main .info-item.${type}`);
    if (desktopElement) {
      desktopElement.style.setProperty('--fill-height', `${percentage}%`);
      desktopElement.classList.toggle('full', isFull);
    }
    if (mobileElement) {
      mobileElement.style.setProperty('--fill-height', `${percentage}%`);
      mobileElement.classList.toggle('full', isFull);
    }
  }

  updateActiveBuffs() {
    const ui = this.ui;
    if (!ui.stateManager) return;
    const desktopContainer = document.getElementById('info_bar_buffs_desktop');
    const mobileContainer = document.getElementById('info_bar_buffs');
    const activeBuffs = [];
    const sm = ui.stateManager;

    if ((sm.getVar("manual_override_mult") || 0) > 0 && Date.now() < (sm.getVar("override_end_time") || 0)) {
      activeBuffs.push({ id: 'manual_override', icon: 'img/ui/nav/nav_play.png', title: 'Manual Override' });
    }
    if ((sm.getVar("power_to_heat_ratio") || 0) > 0) {
      const maxHeat = sm.getVar("max_heat") || 0;
      const currentHeat = sm.getVar("current_heat") || 0;
      const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
      if (heatPercent > CRITICAL_FILL_PERCENT / PERCENT_FULL && (sm.getVar("current_power") || 0) > 0) {
        activeBuffs.push({ id: 'electro_thermal_conversion', icon: 'img/parts/capacitors/capacitor_4.png', title: 'Electro-Thermal Conversion' });
      }
    }
    const maxPower = sm.getVar("max_power") || 0;
    if ((sm.getVar("flux_accumulator_level") || 0) > 0 && maxPower > 0) {
      const powerRatio = (sm.getVar("current_power") || 0) / maxPower;
      if (powerRatio >= FLUX_ACCUMULATOR_POWER_RATIO_MIN) {
        activeBuffs.push({ id: 'flux_accumulators', icon: 'img/parts/capacitors/capacitor_6.png', title: 'Flux Accumulators' });
      }
    }

    const updateContainer = (container) => {
      if (!container) return;
      container.innerHTML = '';
      activeBuffs.forEach(buff => {
        const buffIcon = document.createElement('div');
        buffIcon.className = 'buff-icon active';
        buffIcon.setAttribute('title', buff.title);
        buffIcon.setAttribute('aria-label', buff.title);
        const img = document.createElement('img');
        img.src = buff.icon;
        img.alt = buff.title;
        buffIcon.appendChild(img);
        container.appendChild(buffIcon);
      });
    };
    updateContainer(desktopContainer);
    updateContainer(mobileContainer);
  }

  updateTimeFluxButton(count) {
    const ui = this.ui;
    const btn = ui.DOMElements.time_flux_toggle;
    if (!btn) return;
    const label = btn.querySelector('.control-text');
    if (label) {
      const previousText = label.textContent;
      const previousHasQueue = btn.classList.contains('has-queue');
      const timeFluxEnabled = ui.game && ui.game.time_flux;
      const hasQueue = count > 1;
      label.textContent = hasQueue ? `Time Flux (${count})` : `Time Flux`;
      btn.classList.toggle('has-queue', hasQueue);
      const hasQueueChanged = previousHasQueue !== btn.classList.contains('has-queue');
      if (ui.game && (previousText !== label.textContent || hasQueueChanged)) {
        logger.log('debug', 'ui', `[TIME FLUX UI] Button state: "${label.textContent}", Queued ticks: ${count}, Time Flux: ${timeFluxEnabled ? 'ON' : 'OFF'}, Has queue class: ${btn.classList.contains('has-queue')}`);
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
      const moneyGained = moneyAfter?.sub
        ? moneyAfter.sub(moneyBefore).toNumber()
        : (Number(moneyAfter) - Number(moneyBefore));
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

    document.getElementById("control_deck_power_btn")
      ?.addEventListener("click", (e) => handleSellAction(e.currentTarget), { signal });

    document.getElementById("control_deck_heat_btn")
      ?.addEventListener("click", (e) => handleHeatAction(e.currentTarget, true), { signal });

    document.getElementById("mobile_passive_pause_btn")
      ?.addEventListener("click", () => {
        const currentState = ui.stateManager.getVar("pause");
        ui.stateManager.setVar("pause", !currentState);
      }, { signal });

    document.getElementById("control_deck_build_fab")
      ?.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.partsPanelUI.togglePartsPanelForBuildButton();
      }, { signal });

    const powerBtnDesktop = document.getElementById("info_bar_power_btn_desktop");
    if (powerBtnDesktop) {
      powerBtnDesktop.addEventListener("click", () => {
        if (!ui.game) return;
        const moneyBefore = ui.game.state.current_money;
        ui.game.sell_action();
        const moneyAfter = ui.game.state.current_money;
        const moneyGained = moneyAfter?.sub
          ? moneyAfter.sub(moneyBefore).toNumber()
          : (Number(moneyAfter) - Number(moneyBefore));
        if (moneyGained <= 0) return;
        const moneyTargetDesktop = document.querySelector(".info-bar-desktop .info-item.money") || document.getElementById("info_money_desktop")?.closest(".info-item");
        if (moneyTargetDesktop) {
          ui.particleEffectsUI.showFloatingText(moneyTargetDesktop, moneyGained);
          ui.particleEffectsUI.createBoltParticle(powerBtnDesktop, moneyTargetDesktop);
          ui.particleEffectsUI.createSellSparks(powerBtnDesktop, moneyTargetDesktop);
        }
      }, { signal });
    }

    document.getElementById("info_bar_heat_btn_desktop")
      ?.addEventListener("click", (e) => handleHeatAction(e.currentTarget), { signal });
  }

  setupHeatPowerListeners() {
    const ui = this.ui;
    const heatItems = document.querySelectorAll(".info-item.heat");
    heatItems.forEach(heatItem => {
      heatItem.onclick = () => {
        if (ui.game) ui.game.manual_reduce_heat_action();
      };
    });

    const powerItems = document.querySelectorAll(".info-item.power");
    powerItems.forEach(powerItem => {
      powerItem.onclick = () => {
        if (ui.game) ui.game.sell_action();
      };
    });

    const heatBtnIds = ["info_bar_heat_btn", "info_bar_heat_btn_desktop"];
    const powerBtnIds = ["info_bar_power_btn", "info_bar_power_btn_desktop"];
    heatBtnIds.forEach(btnId => {
      document.getElementById(btnId)?.addEventListener("click", function () {
        if (ui.game) ui.game.manual_reduce_heat_action();
      });
    });
    powerBtnIds.forEach(btnId => {
      document.getElementById(btnId)?.addEventListener("click", function () {
        if (ui.game) ui.game.sell_action();
      });
    });
  }
}
