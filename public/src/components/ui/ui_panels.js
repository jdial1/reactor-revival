import { html, render } from "lit-html";
import { repeat, styleMap, numFormat as fmt, logger, classMap, formatTime, toNumber } from "../../utils/utils_constants.js";
import { MODAL_IDS } from "../ui_modals.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";
import { PartButton } from "../buttonFactory.js";
import { MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR } from "../../utils/utils_constants.js";
import { leaderboardService } from "../../services/services_cloud.js";
import { BaseComponent } from "../../core/reactor_state.js";

const VENTING_ANIM_MS = 400;

class InfoBarUI {
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

const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

class MobileInfoBarUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('MobileInfoBar', this);
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
          <span class="control-deck-value" id="control_deck_money_value">${state.melting_down ? "☢️" : fmt(state.current_money ?? 0, 0)}</span>
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
        <span id="mobile_passive_money_value">${state.melting_down ? "☢️" : fmt(state.current_money ?? 0, 0)}</span>
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
      keys: ["max_power", "max_heat", "current_power", "current_heat", "power_net_change", "heat_net_change", "auto_sell", "auto_sell_multiplier", "heat_controlled", "vent_multiplier_eff", "current_money", "melting_down"],
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
      keys: ["current_exotic_particles", "current_money", "pause", "melting_down"],
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


class PageSetupUI {
  constructor(ui) {
    this.ui = ui;
    this._lastIsMobileForTopBar = null;
    this._mobileTopBarResizeListenerAdded = false;
  }

  setupLeaderboardPage() {
    const ui = this.ui;
    const container = document.getElementById("leaderboard_rows");
    const sortButtons = document.querySelectorAll(".leaderboard-sort");

    const showColumn = (sortBy) => {
      const table = container?.closest('.leaderboard-table');
      if (!table) return;
      const allPowerCells = table.querySelectorAll('.leaderboard-col-power');
      const allHeatCells = table.querySelectorAll('.leaderboard-col-heat');
      const allMoneyCells = table.querySelectorAll('.leaderboard-col-money');
      allPowerCells.forEach((el) => {
        if (sortBy === 'power') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
      allHeatCells.forEach((el) => {
        if (sortBy === 'heat') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
      allMoneyCells.forEach((el) => {
        if (sortBy === 'money') { el.classList.remove('hidden'); el.style.display = ''; }
        else el.classList.add('hidden');
      });
    };

    if (!ui.game) {
      if (container) render(html`<tr><td colspan="7" style="text-align: center;">Game not initialized</td></tr>`, container);
      return;
    }

    const formatRecordDate = (run) => {
      let date = 'N/A';
      try {
        const timestamp = typeof run.timestamp === 'string' ? parseInt(run.timestamp, 10) : run.timestamp;
        if (timestamp && !isNaN(timestamp) && timestamp > 0) {
          const dateObj = new Date(timestamp);
          if (!isNaN(dateObj.getTime())) {
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            const year = String(dateObj.getFullYear()).slice(-2);
            date = `${month}/${day}/${year}`;
          }
        }
      } catch (e) {
        logger.warn('Error formatting date:', e);
      }
      return date;
    };

    const leaderboardRowTemplate = (run, index) => {
      const date = formatRecordDate(run);
      const timeStr = formatTime(run.time_played ?? 0);
      const hasLayout = !!run.layout;
      const onView = () => {
        if (run.layout) {
          ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, {
            layoutJson: run.layout,
            stats: {
              money: run.money || 0,
              ep: run.exotic_particles || 0,
              heat: run.heat || 0,
              power: run.power || 0,
            },
          });
        }
      };
      return html`
        <tr>
          <td>${index + 1}</td>
          <td>${date}</td>
          <td class="leaderboard-col-power">${fmt(run.power)}</td>
          <td class="leaderboard-col-heat">${fmt(run.heat)}</td>
          <td class="leaderboard-col-money">$${fmt(run.money)}</td>
          <td class="leaderboard-col-time" style="display: none;">${timeStr}</td>
          <td>
            ${hasLayout ? html`<button class="pixel-btn layout-view-btn" style="padding: 2px 6px; font-size: 0.6em;" @click=${onView}>View</button>` : html`<span style="opacity: 0.5;">-</span>`}
          </td>
        </tr>
      `;
    };

    const leaderboardTemplate = (records, status) => {
      if (status === "loading") {
        return html`<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>`;
      }
      if (records.length === 0) {
        return html`<tr><td colspan="7" style="text-align: center;">No records found yet. Play to save scores!</td></tr>`;
      }
      return repeat(records, (r, i) => `${r.timestamp}-${i}`, (run, index) => leaderboardRowTemplate(run, index));
    };

    const loadRecords = async (sortBy) => {
      if (!container) return;
      render(leaderboardTemplate([], "loading"), container);
      await leaderboardService.init();
      const records = await leaderboardService.getTopRuns(sortBy, 20);
      render(leaderboardTemplate(records, "loaded"), container);
      showColumn(sortBy);
    };

    const activeButton = document.querySelector('.leaderboard-sort.active');
    const initialSort = activeButton ? activeButton.dataset.sort : 'power';
    sortButtons.forEach(btn => {
      btn.onclick = () => {
        sortButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        loadRecords(btn.dataset.sort);
      };
    });
    return loadRecords(initialSort);
  }

  setupAffordabilityBanners(bannerId) {
    const ui = this.ui;
    if (!ui?.uiState) return;
    const flag = bannerId === "upgrades_no_affordable_banner" ? "_affordabilityBannerMountedUpgrades" : "_affordabilityBannerMountedResearch";
    if (ui[flag]) return;
    const container = document.getElementById(bannerId);
    if (!container?.isConnected) return;
    ui[flag] = true;
    const isUpgrades = bannerId === "upgrades_no_affordable_banner";
    const key = isUpgrades ? "upgradesHidden" : "researchHidden";
    const message = isUpgrades ? "No affordable upgrades available" : "No affordable research available";
    const unmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["upgrades_banner_visibility"] }],
      () => {
        const visibility = ui.uiState?.upgrades_banner_visibility ?? { upgradesHidden: true, researchHidden: true };
        const hidden = visibility[key];
        return html`
          <div class="affordability-banner ${hidden ? "hidden" : ""}">
            <article>${message}</article>
          </div>
        `;
      },
      container
    );
    if (ui._affordabilityBannerUnmounts) ui._affordabilityBannerUnmounts.push(unmount);
    else ui._affordabilityBannerUnmounts = [unmount];
  }

  setupSoundboardPage() {
    const ui = this.ui;
    if (!ui.game?.audio) return;
    const page = ui.DOMElements.soundboard_section || document.getElementById("soundboard_section");
    if (!page) return;

    const warningSlider = ui.DOMElements.sound_warning_intensity || document.getElementById("sound_warning_intensity");
    const warningValue = ui.DOMElements.sound_warning_value || document.getElementById("sound_warning_value");
    if (warningSlider && ui.uiState) {
      const initial = Number(warningSlider.value) || 50;
      ui.uiState.sound_warning_value = initial;
      warningSlider.oninput = () => {
        if (ui.uiState) ui.uiState.sound_warning_value = Number(warningSlider.value) || 50;
      };
    }
    if (warningValue && ui.uiState) {
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["sound_warning_value"] }],
        () => html`${ui.uiState?.sound_warning_value ?? 50}%`,
        warningValue
      );
    }

    const playSound = (button) => {
      const sound = button.dataset.sound;
      if (!sound) return;
      if (sound === "warning") {
        const intensity = warningSlider ? Number(warningSlider.value) / 100 : 0.5;
        ui.game.audio.play("warning", intensity);
        return;
      }
      if (sound === "explosion") {
        if (button.dataset.variant === "meltdown") ui.game.audio.play("explosion", "meltdown");
        else ui.game.audio.play("explosion");
        return;
      }
      const subtype = button.dataset.subtype || null;
      ui.game.audio.play(sound, subtype);
    };

    page.querySelectorAll("button.sound-btn").forEach((button) => {
      button.onclick = () => playSound(button);
    });
  }

  setupMobileTopBar() {
    const ui = this.ui;
    try {
      const mobileTopBar = document.getElementById("mobile_top_bar");
      const stats = document.getElementById("reactor_stats");
      const topNav = document.getElementById("main_top_nav");
      const reactorWrapper = document.getElementById("reactor_wrapper");
      const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
      if (!mobileTopBar || !stats) return;

      const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;

      if (isMobile) {
        mobileTopBar.classList.add("active");
        mobileTopBar.setAttribute("aria-hidden", "false");
        let statsWrap = mobileTopBar.querySelector(".mobile-top-stats");
        if (!statsWrap) {
          statsWrap = document.createElement("div");
          statsWrap.className = "mobile-top-stats";
          mobileTopBar.appendChild(statsWrap);
        }
        if (stats && stats.parentElement !== statsWrap) statsWrap.appendChild(stats);
        if (copyPasteBtns && reactorWrapper && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      } else {
        mobileTopBar.classList.remove("active");
        mobileTopBar.setAttribute("aria-hidden", "true");
        if (topNav && stats) {
          const engineUl = topNav.querySelector("#engine_status");
          if (engineUl) topNav.insertBefore(stats, engineUl);
          else topNav.appendChild(stats);
        }
        if (reactorWrapper && copyPasteBtns && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      }

      this._lastIsMobileForTopBar = isMobile;
    } catch (err) {
      logger.warn("[UI] setupMobileTopBar error:", err);
    }
  }

  setupMobileTopBarResizeListener() {
    const ui = this.ui;
    if (this._mobileTopBarResizeListenerAdded) return;
    this._mobileTopBarResizeListenerAdded = true;
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile !== this._lastIsMobileForTopBar) {
        this.setupMobileTopBar();
      }
    });
  }
}


const CATEGORY_MAP = {
  power: ["cell", "reflector", "capacitor", "particle_accelerator"],
  heat: ["vent", "heat_exchanger", "heat_inlet", "heat_outlet", "coolant_cell", "reactor_plating", "valve"],
};

const CATEGORY_TO_CONTAINER = {
  coolant_cell: "coolantCells",
  reactor_plating: "reactorPlatings",
  heat_exchanger: "heatExchangers",
  heat_inlet: "heatInlets",
  heat_outlet: "heatOutlets",
  particle_accelerator: "particleAccelerators",
};

function getContainerKey(part) {
  if (CATEGORY_TO_CONTAINER[part.category]) return CATEGORY_TO_CONTAINER[part.category];
  if (part.category === "valve" && part.valve_group) return part.valve_group + "Valves";
  return part.category + "s";
}

function getPartsByContainer(partset, tabId, unlockManager) {
  const categories = CATEGORY_MAP[tabId] || [];
  const byContainer = new Map();
  for (const cat of categories) {
    const parts = partset.getPartsByCategory(cat);
    for (const part of parts) {
      if (unlockManager && !unlockManager.shouldShowPart(part)) continue;
      const key = getContainerKey(part);
      if (!byContainer.has(key)) byContainer.set(key, []);
      byContainer.get(key).push(part);
    }
  }
  return byContainer;
}

class PartsPanelUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('PartsPanel', this);
    this._partsPanelUnmount = null;
  }

  getPartsSection() {
    return this.ui.coreLoopUI?.getElement?.("parts_section") ?? this.ui.DOMElements?.parts_section ?? document.getElementById("parts_section");
  }

  unlockAllPartsForTesting() {
    const ui = this.ui;
    if (!ui.game?.partset?.partsArray) return;
    const typeLevelCombos = new Set();
    ui.game.partset.partsArray.forEach(part => {
      if (part.type && part.level) {
        typeLevelCombos.add(`${part.type}:${part.level}`);
      }
    });
    typeLevelCombos.forEach(combo => {
      ui.game.placedCounts[combo] = 10;
    });
    ui.game.partset.check_affordability(ui.game);
    this.refreshPartsPanel();
  }

  populateActiveTab() {
    this.refreshPartsPanel();
  }

  refreshPartsPanel() {
    const ui = this.ui;
    if (ui.game?.state && typeof ui.game.state.parts_panel_version === "number") {
      ui.game.state.parts_panel_version++;
    }
  }

  onActiveTabChanged(_tabId) {
    this.refreshPartsPanel();
  }

  _partsPanelTemplate(uiState) {
    const ui = this.ui;
    const game = ui.game;
    const partset = game?.partset;
    const unlockManager = game?.unlockManager;
    const activeTab = uiState?.active_parts_tab ?? "power";
    const switchTab = (tabId) => { if (ui.uiState) ui.uiState.active_parts_tab = tabId; };
    const onHelpToggle = () => {
      ui.help_mode_active = !ui.help_mode_active;
      document.body.classList.toggle("help-mode-active", ui.help_mode_active);
      if (ui.help_mode_active) ui.stateManager.setClickedPart(null);
      this.refreshPartsPanel();
    };
    const powerActive = activeTab === "power";
    const heatActive = activeTab === "heat";

    let tabContent;
    if (!partset) {
      tabContent = html`
        <div id="parts_tab_power" class="parts_tab_content active"><div id="cells" class="item-grid"></div><div id="reflectors" class="item-grid"></div><div id="capacitors" class="item-grid"></div><div id="particleAccelerators" class="item-grid"></div></div>
        <div id="parts_tab_heat" class="parts_tab_content"><div id="vents" class="item-grid"></div><div id="heatExchangers" class="item-grid"></div><div id="heatInlets" class="item-grid"></div><div id="heatOutlets" class="item-grid"></div><div id="coolantCells" class="item-grid"></div><div id="reactorPlatings" class="item-grid"></div><div id="overflowValves" class="item-grid"></div><div id="topupValves" class="item-grid"></div><div id="checkValves" class="item-grid"></div></div>
      `;
    } else {
      const byContainer = getPartsByContainer(partset, activeTab, unlockManager);
      const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
      const partHandlers = (part) => {
        const onClick = () => {
          if (ui.help_mode_active) {
            if (game?.tooltip_manager) game.tooltip_manager.show(part, null, true);
            return;
          }
          if (part.affordable) {
            game?.emit?.("partClicked", { part });
            ui.stateManager.setClickedPart(part);
          } else if (game?.tooltip_manager) {
            game.tooltip_manager.show(part, null, true);
          }
        };
        const onMouseEnter = () => {
          if (ui.help_mode_active && game?.tooltip_manager) game.tooltip_manager.show(part, null, false);
        };
        const onMouseLeave = () => {
          if (ui.help_mode_active && game?.tooltip_manager) game.tooltip_manager.hide();
        };
        const unlocked = !unlockManager || unlockManager.isPartUnlocked(part);
        const opts = {
          locked: !unlocked,
          doctrineLocked: !unlocked && partset?.isPartDoctrineLocked?.(part),
          tierProgress: !unlocked ? `${Math.min(unlockManager?.getPreviousTierCount(part) ?? 0, 10)}/10` : "",
          partActive: part.id === selectedPartId,
        };
        return PartButton(part, onClick, onMouseEnter, onMouseLeave, opts);
      };
      const grid = (id) => html`<div id=${id} class="item-grid">${repeat(byContainer.get(id) ?? [], (p) => p.id, partHandlers)}</div>`;
      tabContent = html`
        <div id="parts_tab_power" class="parts_tab_content ${powerActive ? "active" : ""}">
          <hgroup><h4>Cells</h4><h6>Generate power and heat.</h6></hgroup>
          ${grid("cells")}
          <hgroup><h4>Reflectors</h4><h6>Boost adjacent cell output.</h6></hgroup>
          ${grid("reflectors")}
          <hgroup><h4>Capacitors</h4><h6>Increase reactor power capacity.</h6></hgroup>
          ${grid("capacitors")}
          <hgroup><h4>Particle Accelerators</h4><h6>Generate Exotic Particles from heat.</h6></hgroup>
          ${grid("particleAccelerators")}
        </div>
        <div id="parts_tab_heat" class="parts_tab_content ${heatActive ? "active" : ""}">
          <hgroup><h4>Vents</h4><h6>Actively cool components.</h6></hgroup>
          ${grid("vents")}
          <hgroup><h4>Heat Exchangers</h4><h6>Distribute heat between components.</h6></hgroup>
          ${grid("heatExchangers")}
          <hgroup><h4>Heat Inlets</h4><h6>Move heat into the reactor core.</h6></hgroup>
          ${grid("heatInlets")}
          <hgroup><h4>Heat Outlets</h4><h6>Move heat out of the reactor core.</h6></hgroup>
          ${grid("heatOutlets")}
          <hgroup><h4>Coolant Cells</h4><h6>Absorb and contain heat.</h6></hgroup>
          ${grid("coolantCells")}
          <hgroup><h4>Reactor Plating</h4><h6>Increase reactor heat capacity.</h6></hgroup>
          ${grid("reactorPlatings")}
          <hgroup><h4>Overflow Valves</h4><h6>Transfer heat when input exceeds 80% containment.</h6></hgroup>
          ${grid("overflowValves")}
          <hgroup><h4>Top-up Valves</h4><h6>Transfer heat when output drops below 20% containment.</h6></hgroup>
          ${grid("topupValves")}
          <hgroup><h4>Check Valves</h4><h6>Transfer heat in one direction only.</h6></hgroup>
          ${grid("checkValves")}
        </div>
      `;
    }

    return html`
      <div class="parts_header">
        <div class="parts_tabs parts_categories_carousel">
          <button
            class="parts_tab ${powerActive ? "active" : ""}"
            @click=${() => switchTab("power")}
            title="Power Creation"
            aria-label="Power Creation"
          >
            <img src="img/ui/icons/icon_power.png" alt="Power" />
            <span class="parts_tab_label">Power</span>
          </button>
          <button
            class="parts_tab ${heatActive ? "active" : ""}"
            @click=${() => switchTab("heat")}
            title="Heat Management"
            aria-label="Heat Management"
          >
            <img src="img/ui/icons/icon_heat.png" alt="Heat" />
            <span class="parts_tab_label">Heat</span>
          </button>
          <button
            id="parts_help_toggle"
            class="parts_help_btn ${ui.help_mode_active ? "active" : ""}"
            title="Toggle help mode - click to show part information instead of placing parts"
            aria-label="Toggle help mode"
            @click=${onHelpToggle}
          >
            ?
          </button>
        </div>
      </div>
      <div id="parts_tab_contents">
        ${tabContent}
      </div>
    `;
  }

  setupPartsTabs() {
    const ui = this.ui;
    const root = document.getElementById("parts_panel_reactive_root");
    if (!root || !ui.uiState) return;
    const subscriptions = [
      { state: ui.game?.state, keys: ["current_money", "current_exotic_particles", "parts_panel_version"] },
      { state: ui.uiState, keys: ["active_parts_tab", "parts_panel_collapsed"] },
    ].filter((s) => s.state != null);
    if (subscriptions.length === 0) return;
    const renderFn = () => this._partsPanelTemplate(ui.uiState);
    this._partsPanelUnmount = ReactiveLitComponent.mountMulti(subscriptions, renderFn, root);
    ui.updateCollapsedControlsNav();
  }

  updateQuickSelectSlots() {
    const ui = this.ui;
    ui.stateManager.normalizeQuickSelectSlotsForUnlock();
    const slots = ui.stateManager.getQuickSelectSlots();
    const partset = ui.game?.partset;
    const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
    const root = document.getElementById("quick_select_slots_root");
    if (!root) return;
    const slotTemplate = (slot, i) => {
      const { partId, locked } = slot || { partId: null, locked: false };
      const part = partId && partset ? partset.getPartById(partId) : null;
      const slotClass = classMap({
        "quick-select-slot": true,
        locked: !!locked,
        unaffordable: !!(part && !part.affordable),
        "is-selected": partId !== null && partId === selectedPartId,
      });
      const ariaLabel = part ? (locked ? `Unlock ${part.title}` : `Select ${part.title}`) : `Recent part ${i + 1}`;
      const costText = part ? (part.erequires ? `${fmt(part.cost)} EP` : `$${fmt(part.cost)}`) : "";
      const iconStyle = part?.getImagePath ? styleMap({ backgroundImage: `url('${part.getImagePath()}')` }) : {};
      return html`
        <button type="button" class=${slotClass} data-index=${i} aria-label=${ariaLabel}>
          ${part?.getImagePath ? html`<div class="quick-select-icon" style=${iconStyle}></div>` : ""}
          ${part ? html`<div class="quick-select-cost">${costText}</div>` : ""}
        </button>
      `;
    };
    const template = html`${repeat(slots, (_, i) => i, slotTemplate)}`;
    try {
      render(template, root);
    } catch (err) {
      const msg = err?.message ?? "";
      if (msg.includes("ChildPart") && msg.includes("parentNode")) {
        render(html``, root);
        render(template, root);
      } else {
        throw err;
      }
    }
  }

  updatePartsPanelBodyClass() {
    const partsSection = this.getPartsSection();
    const collapsed = this.ui.uiState?.parts_panel_collapsed ?? partsSection?.classList.contains("collapsed");
    document.body.classList.toggle("parts-panel-open", !!(partsSection && !collapsed));
    document.body.classList.toggle("parts-panel-right", !!partsSection?.classList.contains("right-side"));

    logger.log('debug', 'ui', '[updatePartsPanelBodyClass] Panel collapsed:', collapsed, "Body classes:", document.body.className);
  }

  togglePartsPanelForBuildButton() {
    const ui = this.ui;
    ui.deviceFeatures.lightVibration();
    const partsSection = this.getPartsSection();
    if (partsSection && ui.uiState) {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile) {
        ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
        this.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      } else {
        ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
        this.updatePartsPanelBodyClass();
      }
    } else if (partsSection) {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile) {
        partsSection.classList.toggle("collapsed");
        this.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      }
    }
  }

  initializePartsPanel() {
    const ui = this.ui;
    const panel = this.getPartsSection();
    if (!panel) return;

    if (this._resizeHandler) window.removeEventListener("resize", this._resizeHandler);
    this._resizeHandler = () => {
      const isCurrentlyMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (ui.uiState) ui.uiState.parts_panel_collapsed = isCurrentlyMobile;
      else panel.classList.toggle("collapsed", isCurrentlyMobile);
      this.updatePartsPanelBodyClass();
    };
    window.addEventListener("resize", this._resizeHandler);

    const isMobileOnLoad = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (ui.uiState) ui.uiState.parts_panel_collapsed = isMobileOnLoad;
    panel.classList.toggle("collapsed", ui.uiState?.parts_panel_collapsed ?? isMobileOnLoad);
    logger.log('debug', 'ui', '[Parts Panel Init]', isMobileOnLoad ? "Mobile detected - added collapsed class" : "Desktop detected - removed collapsed class");
    logger.log('debug', 'ui', '[Parts Panel Init] Final state - collapsed:', panel.classList.contains("collapsed"));
    this.updatePartsPanelBodyClass();

    const closeBtn = document.getElementById("parts_close_btn");
    if (closeBtn && !closeBtn.hasAttribute("data-listener-attached")) {
      closeBtn.setAttribute("data-listener-attached", "true");
      closeBtn.addEventListener("click", () => {
        if (ui.uiState) ui.uiState.parts_panel_collapsed = true;
        else panel.classList.add("collapsed");
        this.updatePartsPanelBodyClass();
      });
    }

    ui.stateManager.updatePartsPanelToggleIcon(null);
  }
}


class ControlDeckUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('ControlDeck', this);
    this.toggle_buttons_config = {
      auto_sell: { id: "auto_sell_toggle", stateProperty: "auto_sell" },
      auto_buy: { id: "auto_buy_toggle", stateProperty: "auto_buy" },
      time_flux: { id: "time_flux_toggle", stateProperty: "time_flux" },
      heat_control: {
        id: "heat_control_toggle",
        stateProperty: "heat_control",
      },
      pause: { id: "pause_toggle", stateProperty: "pause" },
    };
  }

  _statsBarTemplate(state) {
    const vent = fmt(state.stats_vent ?? 0, 0);
    const power = fmt(state.stats_power ?? 0, 0);
    const heat = fmt(state.stats_heat_generation ?? 0, 0);
    return html`
      <li><strong title="Total heat venting per tick"><img src="img/ui/icons/icon_vent.png" alt="Vent" class="icon-inline" /><span id="stats_vent">${vent}</span></strong></li>
      <li><strong title="Power per tick"><img src="img/ui/icons/icon_power.png" alt="Power" class="icon-inline" /><span id="stats_power">${power}</span></strong></li>
      <li><strong title="Heat per tick"><img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon-inline" /><span id="stats_heat">${heat}</span></strong></li>
    `;
  }

  _exoticParticlesTemplate(state) {
    return html`
      <div class="grid">
        <div>Current 🧬 EP: <strong><span id="current_exotic_particles">${fmt(state.current_exotic_particles ?? 0)}</span></strong></div>
        <div>Total 🧬 EP: <strong><span id="total_exotic_particles">${fmt(state.total_exotic_particles ?? 0)}</span></strong></div>
      </div>
    `;
  }

  mountExoticParticlesDisplayIfNeeded(ui) {
    if (this._epComponent) return;
    const epRoot = document.getElementById("exotic_particles_display");
    if (!epRoot || !ui.game?.state) return;
    this._epComponent = new ReactiveLitComponent(
      ui.game.state,
      ["current_exotic_particles", "total_exotic_particles"],
      (state) => this._exoticParticlesTemplate(state),
      epRoot
    );
    this._epUnmount = this._epComponent.mount();
  }

  _mountStatsBarReactive(ui) {
    const root = document.getElementById("reactor_stats");
    if (!root || !ui.game?.state) return;
    const renderFn = (state) => this._statsBarTemplate(state);
    this._statsBarComponent = new ReactiveLitComponent(
      ui.game.state,
      ["stats_vent", "stats_power", "stats_heat_generation"],
      renderFn,
      root
    );
    this._statsBarUnmount = this._statsBarComponent.mount();
    this.mountExoticParticlesDisplayIfNeeded(ui);
  }

  _mountEngineStatusReactive(ui) {
    const root = document.getElementById("engine_status_indicator_root");
    if (!root || !ui.game?.state) return;
    const renderFn = (state) => {
      const statusClass = classMap({
        "engine-running": state.engine_status === "running",
        "engine-paused": state.engine_status === "paused",
        "engine-stopped": state.engine_status === "stopped",
        "engine-tick": state.engine_status === "tick",
      });
      return html`<span id="engine_status_indicator" class=${statusClass}></span>`;
    };
    this._engineStatusComponent = new ReactiveLitComponent(
      ui.game.state,
      ["engine_status"],
      renderFn,
      root
    );
    this._engineStatusUnmount = this._engineStatusComponent.mount();
  }

  initVarObjsConfig() {
    const ui = this.ui;

    this._mountStatsBarReactive(ui);
    this._mountEngineStatusReactive(ui);
    ui.var_objs_config = {
      pause: {
        id: "pause_toggle",
        stateProperty: "pause",
        onupdate: (val) => {
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
          if (ui.uiState) ui.uiState.is_paused = !!val;
          if (ui.game && ui.game.engine) {
            if (val) {
              ui.game.engine.stop();
              ui.stateManager.setVar("engine_status", "paused");
            } else {
              ui.game.engine.start();
              ui.stateManager.setVar("engine_status", "running");
            }
          }
          ui.deviceFeatures.updateWakeLockState();
          ui.pauseStateUI?.updatePauseState?.();
        },
      },
      melting_down: {
        onupdate: (val) => {
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
        },
      },
    };
    ui.stateManager?.setupStateSubscriptions?.();
  }

  _controlsNavTemplate(state) {
    const ui = this.ui;
    const queuedTicks = ui.uiState?.time_flux_queued_ticks ?? 0;
    const timeFluxLabel = queuedTicks > 1 ? `Time Flux (${queuedTicks})` : "Time Flux";
    const timeFluxHasQueue = queuedTicks > 1;
    const toggleHandler = (stateProperty) => () => {
      const currentState = state[stateProperty];
      const newState = !currentState;
      logger.log("debug", "ui", `[TOGGLE] Button "${stateProperty}" clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}`);
      if (stateProperty === "time_flux" && ui.game) {
        const accumulator = ui.game.engine?.time_accumulator || 0;
        const queuedTicks = accumulator > 0 ? Math.floor(accumulator / (ui.game.loop_wait || 1000)) : 0;
        logger.log("debug", "ui", `[TIME FLUX] Button clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}, Accumulator: ${accumulator.toFixed(0)}ms, Queued ticks: ${queuedTicks}`);
      }
      ui.stateManager.setVar(stateProperty, newState);
    };
    return html`
      <button id="auto_sell_toggle" class=${classMap({ "pixel-btn": true, on: !!state.auto_sell })} title="Auto Sell" @click=${toggleHandler("auto_sell")}>
        <img src="img/ui/icons/icon_cash.png" alt="Auto Sell" class="control-icon" />
        <span class="control-text">Auto Sell</span>
      </button>
      <button id="auto_buy_toggle" class=${classMap({ "pixel-btn": true, on: !!state.auto_buy })} title="Auto Buy" @click=${toggleHandler("auto_buy")}>
        <img src="img/ui/icons/icon_cash_outline.svg" alt="Auto Buy" class="control-icon" />
        <span class="control-text">Auto Buy</span>
      </button>
      <button id="time_flux_toggle" class=${classMap({ "pixel-btn": true, on: !!state.time_flux, "has-queue": timeFluxHasQueue })} title=${timeFluxLabel} @click=${toggleHandler("time_flux")}>
        <img src="img/ui/icons/icon_time.png" alt="Time Flux" class="control-icon" />
        <span class="control-text">${timeFluxLabel}</span>
      </button>
      <button id="heat_control_toggle" class=${classMap({ "pixel-btn": true, on: !!state.heat_control })} title="Heat Ctrl" @click=${toggleHandler("heat_control")}>
        <img src="img/ui/icons/icon_heat.png" alt="Auto Heat" class="control-icon" />
        <span class="control-text">Auto Heat</span>
      </button>
      <button id="pause_toggle" class=${classMap({ "pixel-btn": true, on: !!state.pause, paused: !!state.pause })} title=${state.pause ? "Resume" : "Pause"} @click=${toggleHandler("pause")}>
        <img src="img/ui/nav/nav_pause.png" alt="Pause" class="control-icon pause-icon" />
        <img src="img/ui/nav/nav_play.png" alt="Resume" class="control-icon play-icon" />
        <span class="control-text">Pause</span>
      </button>
      <button id="user_account_btn_mobile" class="pixel-btn" title=${ui.uiState?.user_account_display?.title ?? "Account"}>
        <span class="control-icon" style="font-size: 1.5em;">${ui.uiState?.user_account_display?.icon ?? "👤"}</span>
        <span class="control-text">Account</span>
      </button>
    `;
  }

  initializeToggleButtons() {
    const ui = this.ui;
    const root = document.getElementById("controls_nav_root");
    if (root && ui.game?.state) {
      const renderFn = () => this._controlsNavTemplate(ui.game.state);
      this._controlsNavUnmount = ReactiveLitComponent.mountMulti(
        [
          { state: ui.game.state, keys: ["auto_sell", "auto_buy", "heat_control", "time_flux", "pause"] },
          ...(ui.uiState ? [{ state: ui.uiState, keys: ["time_flux_queued_ticks", "user_account_display"] }] : []),
        ],
        renderFn,
        root
      );
    } else if (root) {
      render(this._controlsNavTemplate({ auto_sell: false, auto_buy: true, time_flux: true, heat_control: false, pause: false }), root);
    }
  }

  syncToggleStatesFromGame() {
    const ui = this.ui;
    if (!ui.game) {
      logger.log('warn', 'ui', 'syncToggleStatesFromGame called but game is not available');
      return;
    }
    const toggleMappings = {
      auto_sell: () => ui.game.reactor?.auto_sell_enabled ?? false,
      auto_buy: () => ui.game.reactor?.auto_buy_enabled ?? false,
      heat_control: () => ui.game.reactor?.heat_controlled ?? false,
      time_flux: () => ui.game.time_flux ?? true,
      pause: () => ui.game.paused ?? false,
    };
    for (const [stateProperty, getValue] of Object.entries(toggleMappings)) {
      const gameValue = getValue();
      const currentState = ui.stateManager.getVar(stateProperty);
      if (currentState !== gameValue) {
        logger.log('debug', 'ui', `[TOGGLE] Syncing "${stateProperty}" from game: ${currentState} -> ${gameValue}`);
        ui.stateManager.setVar(stateProperty, gameValue);
      }
    }
  }

  updatePercentageBar(currentKey, maxKey, domElement) {
    if (!domElement) return;
    const current = this.ui.stateManager.getVar(currentKey) || 0;
    const max = this.ui.stateManager.getVar(maxKey) || 1;
    domElement.style.width = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
  }
}


class NavIndicatorsUI {
  constructor(ui) {
    this.ui = ui;
    this._leaderboardUnmounts = [];
  }

  updateLeaderboardIcon() {
    if (typeof document === "undefined" || !this.ui.game) return;
    this._mountLeaderboardButtons();
    if (!this.ui.uiState) return;
    const icon = this.ui.game.cheats_used ? "🚷" : "🏆";
    const disabled = !!this.ui.game.cheats_used;
    this.ui.uiState.leaderboard_display = { icon, disabled };
  }

  _mountLeaderboardButtons() {
    const ui = this.ui;
    if (!ui.uiState || this._leaderboardUnmounts.length > 0) return;
    const topBtn = document.querySelector('#main_top_nav button[data-page="leaderboard_section"]');
    const bottomBtn = document.querySelector('#bottom_nav button[data-page="leaderboard_section"]');
    const applyProps = (btn, d) => {
      if (!btn || !d) return;
      btn.disabled = d.disabled;
      btn.style.opacity = d.disabled ? "0.5" : "1";
      btn.style.cursor = d.disabled ? "not-allowed" : "pointer";
      btn.style.pointerEvents = d.disabled ? "none" : "auto";
    };
    const template = () => html`${ui.uiState?.leaderboard_display?.icon ?? "🏆"}`;
    const renderTop = () => {
      const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
      applyProps(topBtn, d);
      return template();
    };
    const renderBottom = () => {
      const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
      applyProps(bottomBtn, d);
      return template();
    };
    if (topBtn) {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      topBtn.textContent = "";
      topBtn.appendChild(span);
      this._leaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["leaderboard_display"] }],
        renderTop,
        span
      ));
    }
    if (bottomBtn && bottomBtn !== topBtn) {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      bottomBtn.textContent = "";
      bottomBtn.appendChild(span);
      this._leaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["leaderboard_display"] }],
        renderBottom,
        span
      ));
    }
  }

  updateNavIndicators() {
    if (typeof document === "undefined" || !this.ui.uiState) return;
    if (this._affordabilityUnmounts?.length) return;
    const ui = this.ui;
    const mountIndicator = (button, key) => {
      if (!button || button.style.position !== "relative") button.style.position = "relative";
      let container = button.querySelector(".nav-indicator-mount");
      if (!container) {
        container = document.createElement("span");
        container.className = "nav-indicator-mount";
        button.appendChild(container);
      }
      const renderFn = () => {
        const visible = !!ui.uiState?.[key];
        return html`<span class="nav-indicator" style="display: ${visible ? "block" : "none"}"></span>`;
      };
      return ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: [key] }],
        renderFn,
        container
      );
    };
    const unmounts = [];
    document.querySelectorAll('[data-page="upgrades_section"]').forEach((btn) => {
      unmounts.push(mountIndicator(btn, "has_affordable_upgrades"));
    });
    document.querySelectorAll('[data-page="experimental_upgrades_section"]').forEach((btn) => {
      unmounts.push(mountIndicator(btn, "has_affordable_research"));
    });
    this._affordabilityUnmounts = unmounts;
  }

  teardownAffordabilityIndicators() {
    if (this._affordabilityUnmounts?.length) {
      this._affordabilityUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
      this._affordabilityUnmounts = [];
    }
  }
}


class TabSetupUI extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this._abortController = null;
  }

  teardown() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  setupBuildTabButton() {
    this.teardown();
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    const buildBtn = document.getElementById("build_tab_btn");
    if (buildBtn) {
      buildBtn.addEventListener("click", () => {
        this.ui.deviceFeatures.lightVibration();
        const partsSection = this.ui.registry?.get?.("PartsPanel")?.getPartsSection?.() ?? this.ui.DOMElements?.parts_section;
        if (partsSection) {
          const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
          const hasSelectedPart = this.ui.stateManager.getClickedPart() !== null;

          const uiState = this.ui.uiState;
          if (isMobile) {
            if (hasSelectedPart && (uiState?.parts_panel_collapsed ?? partsSection.classList.contains("collapsed"))) {
              if (uiState) uiState.parts_panel_collapsed = false;
              else partsSection.classList.remove("collapsed");
            } else if (!hasSelectedPart) {
              if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
              else partsSection.classList.toggle("collapsed");
            }
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
          } else {
            if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
          }
        }
      }, { signal });
    }

    const container = document.getElementById("quick_select_slots_container");
    const longPressMs = 500;
    let longPressTimer = null;
    let didLongPress = false;
    let activeSlotIndex = null;
    const clearTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      activeSlotIndex = null;
    };
    const handlePointerDown = (e) => {
      const slotEl = e.target.closest(".quick-select-slot");
      if (!slotEl) return;
      activeSlotIndex = parseInt(slotEl.getAttribute("data-index"), 10);
      didLongPress = false;
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        didLongPress = true;
        this.ui.deviceFeatures.heavyVibration();
        const slots = this.ui.stateManager.getQuickSelectSlots();
        const locked = slots[activeSlotIndex]?.locked ?? false;
        this.ui.stateManager.setQuickSelectLock(activeSlotIndex, !locked);
      }, longPressMs);
    };
    const handlePointerUp = (e) => {
      const slotEl = e.target.closest(".quick-select-slot");
      if (!slotEl) return;
      clearTimer();
      if (didLongPress) return;
      const i = parseInt(slotEl.getAttribute("data-index"), 10);
      const slots = this.ui.stateManager.getQuickSelectSlots();
      const partId = slots[i]?.partId;
      if (!partId || !this.ui.game?.partset) return;
      const part = this.ui.game.partset.getPartById(partId);
      if (!part || !part.affordable) return;
      this.ui.deviceFeatures.lightVibration();
      document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
      this.ui.stateManager.setClickedPart(part, { skipOpenPanel: true });
      if (part.$el) part.$el.classList.add("part_active");
      this.ui.partsPanelUI.updateQuickSelectSlots();
    };
    if (container) {
      container.addEventListener("pointerdown", handlePointerDown, { signal });
      container.addEventListener("pointerup", handlePointerUp, { signal });
      container.addEventListener("pointercancel", clearTimer, { signal });
      container.addEventListener("pointerleave", clearTimer, { signal });
    }
    this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setupMenuTabButton() {
    if (!this._abortController) this._abortController = new AbortController();
    const { signal } = this._abortController;
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        this.ui.deviceFeatures.lightVibration();
        if (this.ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
          this.ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
        } else {
          const bottomNav = document.getElementById("bottom_nav");
          if (bottomNav) {
            bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
              btn.classList.remove("active");
            });
          }
          menuBtn.classList.add("active");
          this.ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
        }
      }, { signal });
    }
  }
}


export {
  InfoBarUI,
  MobileInfoBarUI,
  PageSetupUI,
  PartsPanelUI,
  ControlDeckUI,
  NavIndicatorsUI,
  TabSetupUI,
};
