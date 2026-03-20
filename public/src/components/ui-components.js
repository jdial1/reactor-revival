import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import { BlueprintSchema, LegacyGridSchema, setDecimal, preferences } from "../state.js";
import { repeat, styleMap, numFormat as fmt, logger, classMap, StorageUtils, serializeSave, escapeHtml, unsafeHTML, toNumber, formatTime, getPartImagePath, toDecimal, MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, BaseComponent, when } from "../utils.js";
import { runCheckAffordability, calculateSectionCounts, BlueprintService } from "../logic.js";
import { UpgradeCard, CloseButton, PartButton } from "./buttonFactory.js";
import { MODAL_IDS } from "./ui_modals.js";
import { ReactiveLitComponent } from "./ReactiveLitComponent.js";
import { leaderboardService, requestWakeLock, releaseWakeLock } from "../services.js";
import {
  infoBarTemplate,
  mobileControlDeckTemplate,
  mobilePassiveBarTemplate,
  partsPanelLayoutTemplate,
  partsPanelEmptyTabContentTemplate,
  partsPanelTabContentTemplate,
  controlDeckStatsBarTemplate,
  controlDeckExoticParticlesTemplate,
  controlDeckControlsNavTemplate,
  debugVariablesSectionTemplate,
  debugVariablesTemplate,
  emptyLayoutsListTemplate,
  layoutsListTemplate as myLayoutsListTemplate,
  myLayoutsModalTemplate,
  copyPasteNoPartsTemplate,
  copyPasteCostDisplayTemplate,
  copyPasteSellOptionTemplate,
  copyPasteModalCostContentTemplate,
  copyPasteStatusMessageTemplate,
  copyPasteRenderedContentTemplate,
  copyPasteSelectedPartsCostTemplate,
  myLayoutsTableRowTemplate,
  componentSummaryEmptyTemplate,
  componentSummaryTemplate,
  leaderboardStatusRowTemplate,
  leaderboardRowTemplate as leaderboardRowTemplateView,
  layoutViewModalTemplate,
  quickStartTemplate as quickStartOverlayTemplate,
  affordabilityBannerTemplate,
  soundWarningValueTemplate,
  engineStatusIndicatorTemplate,
  navIndicatorTemplate,
  upgradeLevelTextTemplate,
  upgradeCostTextTemplate,
  sectionCountTextTemplate,
  plainTextTemplate,
  quickSelectSlotTemplate,
  decompressionSavedToastTemplate,
  timeFluxSimulationTemplate,
} from "../templates/uiComponentsTemplates.js";

const VENTING_ANIM_MS = 400;
const WAVE_SAMPLE_INTERVAL_MS = 120;
const WAVE_HISTORY_CAP = 300;
const WAVE_LONG_PRESS_MS = 500;
const WAVE_TRACE_POINTS = 120;

const waveformDiagnosticsState = {
  lastSampleAt: 0,
  history: [],
  render: {
    power: { currentPoints: "", previousPoints: "" },
    heat: { currentPoints: "", previousPoints: "" },
  },
};

function clampWave(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function sampleReactorDiagnostics(ui, state) {
  const now = Date.now();
  if (now - waveformDiagnosticsState.lastSampleAt < WAVE_SAMPLE_INTERVAL_MS) return;
  waveformDiagnosticsState.lastSampleAt = now;
  const maxPower = toNumber(state.max_power) || 1;
  const maxHeat = toNumber(state.max_heat) || 1;
  const powerLevel = clampWave((toNumber(state.current_power) || 0) / maxPower);
  const heatLevel = clampWave((toNumber(state.current_heat) || 0) / maxHeat);
  const powerNet = toNumber(state.stats_power ?? state.power_net_change ?? 0);
  const heatNet = toNumber(state.stats_net_heat ?? state.heat_net_change ?? 0);
  const ventEff = toNumber(state.vent_multiplier_eff ?? 0);
  const overflowRatio = toNumber(state.power_overflow_to_heat_ratio ?? 0.5);
  waveformDiagnosticsState.history.push({ t: now, powerLevel, heatLevel, powerNet, heatNet, ventEff, overflowRatio });
  console.log("[waveform-tick]", {
    t: now,
    power_per_tick: powerNet,
    heat_per_tick: heatNet,
    stats_power: toNumber(state.stats_power ?? 0),
    stats_net_heat: toNumber(state.stats_net_heat ?? 0),
    heat_net_change: toNumber(state.heat_net_change ?? 0),
    current_heat: toNumber(state.current_heat ?? 0),
    max_heat: toNumber(state.max_heat ?? 0),
  });
  if (waveformDiagnosticsState.history.length > WAVE_HISTORY_CAP) {
    waveformDiagnosticsState.history.splice(0, waveformDiagnosticsState.history.length - WAVE_HISTORY_CAP);
  }
}

function getTickSeries(ui, state, channel) {
  if (channel === "heat") {
    const fromSamples = waveformDiagnosticsState.history
      .slice(-WAVE_TRACE_POINTS)
      .map((item) => toNumber(item?.heatNet ?? 0));
    if (fromSamples.length) {
      const liveValue = toNumber(state.stats_net_heat ?? state.heat_net_change ?? 0);
      fromSamples.push(liveValue);
      return fromSamples;
    }
  }
  const reactorHistory = ui?.game?.reactor?._classificationStatsHistory;
  const key = channel === "power" ? "power" : "netHeat";
  if (Array.isArray(reactorHistory) && reactorHistory.length > 1) {
    const series = reactorHistory.slice(-WAVE_TRACE_POINTS).map((item) => toNumber(item?.[key] ?? 0));
    const liveValue = toNumber(channel === "power"
      ? state.stats_power ?? state.power_net_change
      : state.stats_net_heat ?? state.heat_net_change);
    series.push(liveValue);
    return series;
  }
  const fallbackKey = channel === "power" ? "powerNet" : "heatNet";
  return waveformDiagnosticsState.history.slice(-WAVE_TRACE_POINTS).map((item) => toNumber(item?.[fallbackKey] ?? 0));
}

function getRumbleState(game) {
  const tiles = game?.tileset?.active_tiles_list;
  if (!Array.isArray(tiles) || tiles.length === 0) return false;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const part = tile?.part;
    if (!part) continue;
    const maxTicks = toNumber(part.ticks ?? 0);
    if (maxTicks > 0 && toNumber(tile.ticks ?? 0) / maxTicks < 0.05) return true;
    const containment = toNumber(part.containment ?? 0);
    if (containment > 0 && toNumber(tile.heat_contained ?? 0) / containment >= 0.95) return true;
  }
  return false;
}

function createWaveformVisualState(ui, state, channel) {
  const net = toNumber(channel === "power"
    ? state.stats_power ?? state.power_net_change
    : state.stats_net_heat ?? state.heat_net_change);
  const isRumbling = getRumbleState(ui?.game);
  const series = getTickSeries(ui, state, channel);
  const source = series.length ? series : [net, net];
  const absValues = source.map((value) => Math.abs(toNumber(value)));
  const avgAbs = absValues.reduce((sum, value) => sum + value, 0) / Math.max(1, absValues.length);
  const scale = channel === "heat"
    ? Math.max(0.25, avgAbs * 1.2)
    : Math.max(1, avgAbs * 2);
  const points = source
    .map((value, index, arr) => {
      const x = arr.length <= 1 ? 100 : (index / (arr.length - 1)) * 100;
      const raw = toNumber(value) / scale;
      const negativeBoost = channel === "heat" && raw < 0 ? 1.6 : 1;
      const normalized = Math.tanh(raw * negativeBoost);
      const zeroBaseline = channel === "heat" ? 50 : 90;
      const positiveSpan = channel === "heat" ? 42 : 80;
      const negativeSpan = channel === "heat" ? 42 : 8;
      const y = normalized >= 0
        ? zeroBaseline - normalized * positiveSpan
        : zeroBaseline - normalized * negativeSpan;
      const clampedY = Math.max(2, Math.min(98, y));
      return `${x.toFixed(2)},${clampedY.toFixed(2)}`;
    })
    .join(" ");
  const renderState = waveformDiagnosticsState.render[channel];
  if (renderState.currentPoints !== points) {
    renderState.previousPoints = renderState.currentPoints || points;
    renderState.currentPoints = points;
  }
  const highBandCrossed = source.some((value) => Math.tanh(toNumber(value) / scale) >= 0.8);
  return {
    className: classMap({
      "info-waveform": true,
      [`wave-${channel}`]: true,
      rumble: isRumbling,
      rising: net > 0,
      falling: net < 0,
      glitch: highBandCrossed,
    }),
    style: styleMap({}),
    points,
    trailPoints: renderState.previousPoints || points,
    isRumbling,
  };
}

function buildHarmonicHealth(state) {
  const history = waveformDiagnosticsState.history;
  if (!history.length) return "Stable";
  const span = history.slice(-40);
  let powerFlux = 0;
  let heatFlux = 0;
  for (let i = 1; i < span.length; i++) {
    powerFlux += Math.abs(span[i].powerLevel - span[i - 1].powerLevel);
    heatFlux += Math.abs(span[i].heatLevel - span[i - 1].heatLevel);
  }
  const netHeat = toNumber(state.heat_net_change ?? 0);
  const ventEff = toNumber(state.vent_multiplier_eff ?? 0);
  const leakBias = Math.max(0, netHeat) + Math.max(0, toNumber(state.power_overflow_to_heat_ratio ?? 0.5) * 0.2);
  const turbulence = powerFlux + heatFlux + leakBias - ventEff * 0.01;
  if (turbulence >= 10) return "Critical";
  if (turbulence >= 6) return "Unstable";
  if (turbulence >= 3) return "Watch";
  return "Stable";
}

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
      keys: ["current_power", "max_power", "current_heat", "max_heat", "current_money", "current_exotic_particles", "active_buffs", "melting_down", "power_net_change", "heat_net_change", "stats_power", "stats_net_heat"],
    }];
    this._unmount = ReactiveLitComponent.mountMulti(subscriptions, () => this._infoBarTemplate(this.ui.game.state), root);

    document.getElementById("control_deck_build_fab")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.ui.partsPanelUI.togglePartsPanelForBuildButton();
    }, { signal });
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
    sampleReactorDiagnostics(this.ui, state);
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

    const activeBuffs = state.active_buffs ?? [];
    const powerWave = createWaveformVisualState(this.ui, state, "power");
    const heatWave = createWaveformVisualState(this.ui, state, "heat");

    const epVisible = toNumber(state.current_exotic_particles) > 0;
    const epContentStyle = styleMap({ display: epVisible ? "flex" : "none" });

    return infoBarTemplate({
      powerClass,
      heatClass,
      powerPct,
      heatPct,
      powerWaveStyle: powerWave.style,
      heatWaveStyle: heatWave.style,
      powerWaveClass: powerWave.className,
      heatWaveClass: heatWave.className,
      powerWavePoints: powerWave.points,
      powerWaveTrailPoints: powerWave.trailPoints,
      heatWavePoints: heatWave.points,
      heatWaveTrailPoints: heatWave.trailPoints,
      powerTextDesktop: fmt(power, 2),
      powerTextMobile: fmt(power, 0),
      maxPowerDesktop: fmt(maxP, 2),
      maxPowerMobile: fmt(maxP),
      moneyDisplayDesktop: moneyDisplay,
      moneyDisplayMobile,
      heatTextDesktop: fmt(heat, 2),
      heatTextMobile: fmt(heat, 0),
      maxHeatDesktop: fmt(maxH, 2),
      maxHeatMobile: fmt(maxH),
      epContentStyle,
      epValueDesktop: fmt(state.current_exotic_particles),
      epValueMobile: fmt(state.current_exotic_particles),
      activeBuffs,
      onSell,
      onVent,
      onVentMobile,
    });
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
    this._waveLongPressTimer = null;
    this._waveDidLongPress = false;
    this._openDiagnostics = (waveType) => {
      this.ui.modalOrchestrator?.showModal(MODAL_IDS.HARMONIC_DIAGNOSTICS, {
        waveType,
        healthLabel: buildHarmonicHealth(this.ui.game?.state ?? {}),
        history: waveformDiagnosticsState.history.slice(-80),
      });
    };
    this._handleWavePointerDown = (waveType) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._waveDidLongPress = false;
      if (this._waveLongPressTimer) clearTimeout(this._waveLongPressTimer);
      this._waveLongPressTimer = setTimeout(() => {
        this._waveLongPressTimer = null;
        this._waveDidLongPress = true;
        this.ui.deviceFeatures.heavyVibration();
        this._openDiagnostics(waveType);
      }, WAVE_LONG_PRESS_MS);
    };
    this._handleWavePointerCancel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waveLongPressTimer) {
        clearTimeout(this._waveLongPressTimer);
        this._waveLongPressTimer = null;
      }
    };
    this._handleWavePointerUp = (actionHandler) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._waveLongPressTimer) {
        clearTimeout(this._waveLongPressTimer);
        this._waveLongPressTimer = null;
      }
      if (this._waveDidLongPress) {
        this._waveDidLongPress = false;
        return;
      }
      actionHandler(e);
    };
  }

  _controlDeckTemplate(state) {
    sampleReactorDiagnostics(this.ui, state);
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
    const powerWave = createWaveformVisualState(this.ui, state, "power");
    const heatWave = createWaveformVisualState(this.ui, state, "heat");

    return mobileControlDeckTemplate({
      powerCapacitorClass,
      heatVentClass,
      powerRateText,
      heatRateText,
      autoRateClass,
      autoHeatRateClass,
      autoSellRateContent,
      autoHeatRateContent,
      powerFillStyle,
      heatFillStyle,
      powerWaveStyle: powerWave.style,
      heatWaveStyle: heatWave.style,
      powerWaveClass: powerWave.className,
      heatWaveClass: heatWave.className,
      powerWavePoints: powerWave.points,
      powerWaveTrailPoints: powerWave.trailPoints,
      heatWavePoints: heatWave.points,
      heatWaveTrailPoints: heatWave.trailPoints,
      powerCurrentText: fmt(powerCurrent, 0),
      heatCurrentText: fmt(heatCurrent, 0),
      maxPowerText: maxPower ? fmt(maxPower, 0) : "",
      maxHeatText: maxHeat ? fmt(maxHeat, 0) : "",
      moneyValueText: state.melting_down ? "☢️" : fmt(state.current_money ?? 0, 0),
      onSellPower: this._onSellPower,
      onVentHeat: this._onVentHeat,
      onPowerWavePointerDown: this._handleWavePointerDown("power"),
      onPowerWavePointerUp: this._handleWavePointerUp(this._onSellPower),
      onPowerWavePointerCancel: this._handleWavePointerCancel,
      onHeatWavePointerDown: this._handleWavePointerDown("heat"),
      onHeatWavePointerUp: this._handleWavePointerUp(this._onVentHeat),
      onHeatWavePointerCancel: this._handleWavePointerCancel,
    });
  }

  _passiveBarTemplate(state) {
    return mobilePassiveBarTemplate({
      epText: fmt(state.current_exotic_particles ?? 0),
      moneyText: state.melting_down ? "☢️" : fmt(state.current_money ?? 0, 0),
      pauseClass: classMap({ "passive-top-pause": true, paused: !!state.pause }),
      pauseAriaLabel: state.pause ? "Resume" : "Pause",
      pauseTitle: state.pause ? "Resume" : "Pause",
      onPauseClick: this._onPauseClick,
    });
  }

  updateControlDeckValues() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX || this._unmountControlDeck || !this.ui.game?.state) return;

    const root = document.getElementById("control_deck_root");
    if (!root) return;

    const subscriptions = [{
      state: this.ui.game.state,
      keys: ["max_power", "max_heat", "current_power", "current_heat", "power_net_change", "heat_net_change", "stats_power", "stats_net_heat", "auto_sell", "auto_sell_multiplier", "heat_controlled", "vent_multiplier_eff", "current_money", "melting_down"],
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
    if (this._waveLongPressTimer) {
      clearTimeout(this._waveLongPressTimer);
      this._waveLongPressTimer = null;
    }
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

    if (!ui.game) {
      if (container) render(leaderboardStatusRowTemplate({ text: "Game not initialized" }), container);
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

    const leaderboardRowTemplate = (run, index, sortBy) => {
      const date = formatRecordDate(run);
      const timeStr = formatTime(run.time_played ?? 0);
      const hasLayout = !!run.layout;
      const powerClass = classMap({ "leaderboard-col-power": true, hidden: sortBy !== "power" });
      const heatClass = classMap({ "leaderboard-col-heat": true, hidden: sortBy !== "heat" });
      const moneyClass = classMap({ "leaderboard-col-money": true, hidden: sortBy !== "money" });
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
      const viewCellContent = when(
        hasLayout,
        () => html`<button class="pixel-btn layout-view-btn" style="padding: 2px 6px; font-size: 0.6em;" @click=${onView}>View</button>`,
        () => html`<span style="opacity: 0.5;">-</span>`
      );
      return leaderboardRowTemplateView({
        rank: index + 1,
        date,
        powerClass,
        heatClass,
        moneyClass,
        powerText: fmt(run.power),
        heatText: fmt(run.heat),
        moneyText: `$${fmt(run.money)}`,
        timeText: timeStr,
        viewCellContent,
      });
    };

    const leaderboardTemplate = (records, status, sortBy) => {
      if (status === "loading") {
        return leaderboardStatusRowTemplate({ text: "Loading..." });
      }
      if (records.length === 0) {
        return leaderboardStatusRowTemplate({ text: "No records found yet. Play to save scores!" });
      }
      return repeat(records, (r, i) => `${r.timestamp}-${i}`, (run, index) => leaderboardRowTemplate(run, index, sortBy));
    };

    const loadRecords = async (sortBy) => {
      if (!container) return;
      render(leaderboardTemplate([], "loading", sortBy), container);
      await leaderboardService.init();
      const records = await leaderboardService.getTopRuns(sortBy, 20);
      render(leaderboardTemplate(records, "loaded", sortBy), container);
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
        return affordabilityBannerTemplate({ hidden, message });
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
        () => soundWarningValueTemplate({ value: ui.uiState?.sound_warning_value ?? 50 }),
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

  _createPartTemplateHandlers(partset, unlockManager, selectedPartId) {
    const ui = this.ui;
    const game = ui.game;
    return (part) => {
      const onClick = () => {
        if (part.affordable) {
          if (ui.help_mode_active && game?.tooltip_manager) game.tooltip_manager.show(part, null, true);
          game?.emit?.("partClicked", { part });
          ui.stateManager.setClickedPart(part);
        } else if (game?.tooltip_manager) {
          game.tooltip_manager.show(part, null, true);
        }
      };
      const unlocked = !unlockManager || unlockManager.isPartUnlocked(part);
      const opts = {
        locked: !unlocked,
        doctrineLocked: !unlocked && partset?.isPartDoctrineLocked?.(part),
        tierProgress: !unlocked ? `${Math.min(unlockManager?.getPreviousTierCount(part) ?? 0, 10)}/10` : "",
        partActive: part.id === selectedPartId,
      };
      return PartButton(part, onClick, opts);
    };
  }

  _buildPartsTabContent(partset, unlockManager, activeTab, powerActive, heatActive) {
    if (!partset) return partsPanelEmptyTabContentTemplate();
    const byContainer = getPartsByContainer(partset, activeTab, unlockManager);
    const selectedPartId = this.ui.stateManager.getClickedPart()?.id ?? null;
    const partTemplate = this._createPartTemplateHandlers(partset, unlockManager, selectedPartId);
    const grid = (id) => html`<div id=${id} class="item-grid">${repeat(byContainer.get(id) ?? [], (p) => p.id, partTemplate)}</div>`;
    return partsPanelTabContentTemplate({ powerActive, heatActive, grid });
  }

  _partsPanelTemplate(uiState) {
    const ui = this.ui;
    const game = ui.game;
    const partset = game?.partset;
    const unlockManager = game?.unlockManager;
    const activeTab = uiState?.active_parts_tab ?? "power";
    const switchTab = (tabId) => { if (ui.uiState) ui.uiState.active_parts_tab = tabId; };
    const onHelpToggle = () => {
      ui.setHelpModeActive(!ui.help_mode_active);
      this.refreshPartsPanel();
    };
    const powerActive = activeTab === "power";
    const heatActive = activeTab === "heat";
    const tabContent = this._buildPartsTabContent(partset, unlockManager, activeTab, powerActive, heatActive);

    return partsPanelLayoutTemplate({
      powerActive,
      heatActive,
      helpModeActive: ui.help_mode_active,
      onSwitchPower: () => switchTab("power"),
      onSwitchHeat: () => switchTab("heat"),
      onHelpToggle,
      tabContent,
    });
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
      return quickSelectSlotTemplate({
        slotClass,
        index: i,
        ariaLabel,
        hasIcon: !!part?.getImagePath,
        iconStyle,
        hasPart: !!part,
        costText,
      });
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

  closePartsPanel() {
    const panel = this.getPartsSection();
    if (!panel) return;
    if (this.ui.uiState) this.ui.uiState.parts_panel_collapsed = true;
    else panel.classList.add("collapsed");
    this.updatePartsPanelBodyClass();
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
        this.closePartsPanel();
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
    return controlDeckStatsBarTemplate({ vent, power, heat });
  }

  _exoticParticlesTemplate(state) {
    return controlDeckExoticParticlesTemplate({
      currentEp: fmt(state.current_exotic_particles ?? 0),
      totalEp: fmt(state.total_exotic_particles ?? 0),
    });
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
      return engineStatusIndicatorTemplate({ statusClass });
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
    return controlDeckControlsNavTemplate({
      autoSellClass: classMap({ "pixel-btn": true, on: !!state.auto_sell }),
      autoBuyClass: classMap({ "pixel-btn": true, on: !!state.auto_buy }),
      timeFluxClass: classMap({ "pixel-btn": true, on: !!state.time_flux, "has-queue": timeFluxHasQueue }),
      heatControlClass: classMap({ "pixel-btn": true, on: !!state.heat_control }),
      pauseClass: classMap({ "pixel-btn": true, on: !!state.pause, paused: !!state.pause }),
      timeFluxLabel,
      pauseTitle: state.pause ? "Resume" : "Pause",
      accountTitle: ui.uiState?.user_account_display?.title ?? "Account",
      accountIcon: ui.uiState?.user_account_display?.icon ?? "👤",
      onToggleAutoSell: toggleHandler("auto_sell"),
      onToggleAutoBuy: toggleHandler("auto_buy"),
      onToggleTimeFlux: toggleHandler("time_flux"),
      onToggleHeatControl: toggleHandler("heat_control"),
      onTogglePause: toggleHandler("pause"),
    });
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
        return navIndicatorTemplate({ visible });
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
          if (this.ui.game?.router?.currentPageId === "reactor_section") this.ui.partsPanelUI?.closePartsPanel?.();
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
class ClipboardUI {
  constructor(ui) {
    this.ui = ui;
  }
  async writeToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return { success: true, method: 'clipboard-api' };
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Clipboard API failed:', error);
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      if (successful) return { success: true, method: 'exec-command' };
    } catch (error) {
      logger.warn("execCommand fallback failed:", error);
    }
    return { success: false, error: 'No clipboard method available' };
  }
  async readFromClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return { success: true, data: text, method: 'clipboard-api' };
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Clipboard API read failed:', error);
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'permission-denied', message: 'Clipboard access denied. Please manually paste your data.' };
      }
    }
    return { success: false, error: 'no-clipboard-api', message: 'Clipboard reading not supported. Please manually paste your data.' };
  }
}

class MeltdownUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('Meltdown', this);
    this._meltdownBuildupRafId = null;
    this._meltdownHandler = null;
    this._meltdownResolvedHandler = null;
  }

  subscribeToMeltdownEvents(game) {
    if (!game?.on || !game?.off) return;
    this._meltdownHandler = () => this.updateMeltdownState();
    this._meltdownResolvedHandler = () => this.updateMeltdownState();
    game.on("meltdown", this._meltdownHandler);
    game.on("meltdownResolved", this._meltdownResolvedHandler);
    this.updateMeltdownState();
  }

  cleanup() {
    if (this.ui?.game?.off && this._meltdownHandler) {
      this.ui.game.off("meltdown", this._meltdownHandler);
      this.ui.game.off("meltdownResolved", this._meltdownResolvedHandler);
    }
    this._meltdownHandler = null;
    this._meltdownResolvedHandler = null;
    if (this._meltdownBuildupRafId != null) {
      cancelAnimationFrame(this._meltdownBuildupRafId);
      this._meltdownBuildupRafId = null;
    }
  }

  updateMeltdownState() {
    const ui = this.ui;
    if (!ui.game || !ui.game.reactor) return;
    const hasMeltedDown = ui.game.reactor.has_melted_down;
    if (ui.uiState) ui.uiState.is_melting_down = hasMeltedDown;
    const doc = (typeof globalThis !== "undefined" && globalThis.document) || (typeof document !== "undefined" && document);
    if (doc?.body) {
      doc.body.classList.toggle("reactor-meltdown", !!hasMeltedDown);
      const banner = doc.getElementById("meltdown_banner");
      if (banner) banner.classList.toggle("hidden", !hasMeltedDown);
    }
    if (!hasMeltedDown) {
      if (this._meltdownBuildupRafId != null) {
        cancelAnimationFrame(this._meltdownBuildupRafId);
        this._meltdownBuildupRafId = null;
      }
      const wrapper = ui.registry?.get?.("PageInit")?.getReactorWrapper?.() ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
      if (wrapper) wrapper.style.transform = "";
      const vignetteEl = document.getElementById("meltdown_vignette");
      if (vignetteEl) {
        vignetteEl.style.opacity = "0";
        vignetteEl.style.display = "none";
      }
      const strobeEl = document.getElementById("meltdown_strobe");
      if (strobeEl) {
        strobeEl.style.opacity = "0";
        strobeEl.style.display = "none";
      }
    }

    this.updateProgressBarMeltdownState(hasMeltedDown);

    if (hasMeltedDown) {
      const resetReactorBtn = document.getElementById("reset_reactor_btn");
      const clearHeatSandboxBtn = document.getElementById("clear_heat_sandbox_btn");
      const isSandbox = ui.game.isSandbox;

      if (isSandbox && clearHeatSandboxBtn) {
        if (!clearHeatSandboxBtn.hasAttribute("data-listener-added")) {
          clearHeatSandboxBtn.addEventListener("click", () => this.clearHeatAndMeltdownSandbox());
          clearHeatSandboxBtn.setAttribute("data-listener-added", "true");
        }
      } else if (resetReactorBtn && !resetReactorBtn.hasAttribute("data-listener-added")) {
        resetReactorBtn.addEventListener("click", async () => await ui.resetReactor());
        resetReactorBtn.setAttribute("data-listener-added", "true");
      }
    }
  }

  clearHeatAndMeltdownSandbox() {
    const ui = this.ui;
    if (!ui.game?.isSandbox || !ui.game.reactor) return;
    ui.game.reactor.current_heat = 0;
    ui.game.reactor.current_power = 0;
    ui.stateManager.setVar("current_heat", 0);
    ui.stateManager.setVar("current_power", 0);
    ui.game.reactor.clearMeltdownState();
    if (ui.game.engine) ui.game.engine.start();
  }

  startMeltdownBuildup(onComplete) {
    const ui = this.ui;
    const BUILDUP_MS = 2500;
    const wrapper = ui.registry?.get?.("PageInit")?.getReactorWrapper?.() ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
    const section = document.getElementById("reactor_section");
    if (ui.particleSystem && wrapper) {
      const rect = wrapper.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      ui.particleSystem.createCriticalBuildupEmbers(cx, cy);
    }
    let vignetteEl = document.getElementById("meltdown_vignette");
    if (!vignetteEl && section) {
      vignetteEl = document.createElement("div");
      vignetteEl.id = "meltdown_vignette";
      vignetteEl.setAttribute("aria-hidden", "true");
      section.appendChild(vignetteEl);
    }
    if (vignetteEl) vignetteEl.style.display = "block";
    let strobeEl = document.getElementById("meltdown_strobe");
    if (!strobeEl && section) {
      strobeEl = document.createElement("div");
      strobeEl.id = "meltdown_strobe";
      strobeEl.setAttribute("aria-hidden", "true");
      strobeEl.style.cssText =
        "position:absolute;inset:0;z-index:26;pointer-events:none;border-radius:8px;background:rgba(255,0,0,0.4);mix-blend-mode:overlay;opacity:0;";
      section.appendChild(strobeEl);
    }
    if (strobeEl) strobeEl.style.display = "block";
    const start = typeof performance !== "undefined" ? performance.now() : Date.now();
    const tick = () => {
      const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - start;
      const t = Math.min(1, elapsed / BUILDUP_MS);
      const intensity = t * 8;
      const shakeX = (Math.random() - 0.5) * 2 * intensity;
      const shakeY = (Math.random() - 0.5) * 2 * intensity;
      if (wrapper) wrapper.style.transform = `translate(${shakeX}px, ${shakeY}px)`;
      if (vignetteEl) vignetteEl.style.opacity = String(t * 0.9);
      if (strobeEl) {
        const pulseIntervalMs = Math.max(40, 220 - 180 * t);
        const strobePhase = (elapsed / pulseIntervalMs) % 1;
        strobeEl.style.opacity = strobePhase < 0.5 ? "0.38" : "0";
      }
      if (t < 1) {
        this._meltdownBuildupRafId = requestAnimationFrame(tick);
      } else {
        if (wrapper) wrapper.style.transform = "";
        if (vignetteEl) {
          vignetteEl.style.opacity = "0";
          vignetteEl.style.display = "none";
        }
        if (strobeEl) {
          strobeEl.style.opacity = "0";
          strobeEl.style.display = "none";
        }
        this._meltdownBuildupRafId = null;
        if (typeof onComplete === "function") onComplete();
      }
    };
    this._meltdownBuildupRafId = requestAnimationFrame(tick);
  }

  explodeAllPartsSequentially(forceAnimate = false) {
    const ui = this.ui;
    const tilesWithParts = ui.game.tileset.active_tiles_list.filter((tile) => tile.part);
    if (tilesWithParts.length === 0) return;

    if (
      !forceAnimate &&
      typeof process !== "undefined" &&
      (process.env.NODE_ENV === "test" || process.env.VITEST === "true")
    ) {
      tilesWithParts.forEach((tile) => {
        if (tile.part) tile.clearPart();
      });
      logger.log('debug', 'ui', 'All parts exploded!');
      return;
    }

    const shuffledTiles = [...tilesWithParts].sort(() => Math.random() - 0.5);
    shuffledTiles.forEach((tile, index) => {
      setTimeout(() => {
        if (tile.part && ui.game.engine) ui.game.engine.handleComponentExplosion(tile);
      }, index * 150);
    });

    const totalExplosionTime = (shuffledTiles.length - 1) * 150 + 600;
    setTimeout(() => {
      logger.log('debug', 'ui', 'All parts exploded!');
      const r = ui.game.reactor;
      if (r.decompression_enabled && r.current_heat <= 2 * r.max_heat && r.has_melted_down) {
        r.clearMeltdownState();
        ui.stateManager.setVar("current_heat", r.current_heat);
        if (ui.heatVisualsUI) ui.heatVisualsUI.updateHeatVisuals();
        if (ui.game.engine) ui.game.engine.start();
        this._showDecompressionSavedToast();
      }
    }, totalExplosionTime);
  }

  _showDecompressionSavedToast() {
    const existing = document.querySelector(".decompression-saved-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "decompression-saved-toast";
    toast.setAttribute("role", "status");
    render(decompressionSavedToastTemplate(), toast);
    document.body.appendChild(toast);
    const inner = toast.querySelector("#decompression_inner");
    requestAnimationFrame(() => {
      if (inner) inner.style.opacity = "1";
    });
    setTimeout(() => {
      if (toast.parentNode) {
        if (inner) inner.style.opacity = "0";
        setTimeout(() => toast.remove(), 220);
      }
    }, 3500);
  }

  updateProgressBarMeltdownState(_isMeltdown) {
  }
}

export { ClipboardUI, MeltdownUI };
export { InputHandler } from "./InputManager.js";
export function mergeComponents(summary, checkedTypes) {
  const merged = {};
  summary.forEach(item => {
    const key = `${item.type}_${item.lvl}`;
    if (!merged[key]) {
      merged[key] = { ...item, count: 0, ids: [] };
    }
    merged[key].count += item.count ?? 1;
    merged[key].ids.push(item.id);
  });
  return merged;
}

export function renderComponentIcons(summary, options = {}, onSlotClick) {
  const { showCheckboxes = false, checkedTypes = {} } = options;
  const mergedComponents = mergeComponents(summary, checkedTypes);
  const items = Object.values(mergedComponents);
  if (items.length === 0) {
    return componentSummaryEmptyTemplate();
  }
  return componentSummaryTemplate({
    items,
    checkedTypes,
    showCheckboxes,
    onSlotClick,
    getImagePath: getPartImagePath,
  });
}

export class ComponentRenderingUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(container, summary, options = {}, onSlotClick) {
    const template = renderComponentIcons(summary, options, onSlotClick);
    render(template, container);
  }
}

const EXPAND_UPGRADE_IDS = ["expand_reactor_rows", "expand_reactor_cols"];

function getUpgradeContainerId(upgrade) {
  if (upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0)) {
    return upgrade.upgrade.type;
  }
  const map = {
    cell_power: "cell_power_upgrades",
    cell_tick: "cell_tick_upgrades",
    cell_perpetual: "cell_perpetual_upgrades",
    exchangers: "exchanger_upgrades",
    vents: "vent_upgrades",
    other: "other_upgrades",
  };
  const key = upgrade.upgrade?.type;
  return key?.endsWith("_upgrades") ? key : (map[key] || key);
}

function shouldSkipCellUpgrade(upgrade, upgradeset) {
  try {
    const upgType = upgrade?.upgrade?.type || "";
    const basePart = upgrade?.upgrade?.part;
    const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
    if (isCellUpgrade && basePart && basePart.category === "cell") {
      const show =
        upgradeset.game?.unlockManager && typeof upgradeset.game.unlockManager.isPartUnlocked === "function"
          ? upgradeset.game.unlockManager.isPartUnlocked(basePart)
          : true;
      return !show;
    }
  } catch (_) {}
  return false;
}

function buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, useReactiveLevelAndCost) {
  const onBuyClick = (e) => {
    e.stopPropagation();
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) return;
    if (!upgradeset.purchaseUpgrade(upgrade.id)) {
      if (upgradeset.game?.audio) upgradeset.game.audio.play("error");
      return;
    }
    if (upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
  };
  const onBuyMaxClick = (e) => {
    e.stopPropagation();
    if (!upgradeset.game?.isSandbox) return;
    if (upgradeset.isUpgradeAvailable(upgrade.id)) {
      const count = upgradeset.purchaseUpgradeToMax(upgrade.id);
      if (count > 0 && upgradeset.game?.audio) upgradeset.game.audio.play("upgrade");
    }
  };
  const onResetClick = (e) => {
    e.stopPropagation();
    if (upgradeset.game?.isSandbox) upgradeset.resetUpgradeLevel(upgrade.id);
  };
  return UpgradeCard(upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick, useReactiveLevelAndCost });
}

function renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, useReactiveLevelAndCost, container) {
  const cards = upgrades.map((upgrade) => buildUpgradeCardTemplate(upgradeset, upgrade, doctrineSource, useReactiveLevelAndCost));
  try {
    render(html`${cards}`, container);
  } catch (err) {
    const msg = String(err?.message ?? "");
    if (msg.includes("nextSibling") || msg.includes("parentNode")) return;
    throw err;
  }
}

function mountUpgradeReactiveDisplay(upgrade, display) {
  const levelContainer = upgrade.$el.querySelector(".upgrade-level-info");
  const costContainer = upgrade.$el.querySelector(".cost-display");
  if (levelContainer) {
    levelContainer.replaceChildren();
    const levelRenderFn = () => {
      const d = display[upgrade.id] ?? upgrade;
      const lvl = d.level ?? upgrade.level;
      const header = lvl >= upgrade.max_level ? "MAX" : `Level ${lvl}/${upgrade.max_level}`;
      return upgradeLevelTextTemplate({ header });
    };
    ReactiveLitComponent.mountMulti(
      [{ state: display, keys: [upgrade.id] }],
      levelRenderFn,
      levelContainer
    );
  }
  if (costContainer) {
    costContainer.replaceChildren();
    const costRenderFn = () => {
      const d = display[upgrade.id] ?? upgrade;
      return upgradeCostTextTemplate({ value: d.display_cost ?? upgrade.display_cost });
    };
    ReactiveLitComponent.mountMulti(
      [{ state: display, keys: [upgrade.id] }],
      costRenderFn,
      costContainer
    );
  }
}

export function runPopulateUpgradeSection(upgradeset, wrapperId, filterFn) {
  if (typeof document === "undefined") return;
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return;

  const filtered = upgradeset.upgradesArray
    .filter(filterFn)
    .filter((u) => !EXPAND_UPGRADE_IDS.includes(u.upgrade?.id))
    .filter((u) => !(upgradeset.isUpgradeAvailable(u.id) && shouldSkipCellUpgrade(u, upgradeset)));

  const byContainer = new Map();
  filtered.forEach((upgrade) => {
    const cid = getUpgradeContainerId(upgrade);
    if (!byContainer.has(cid)) byContainer.set(cid, []);
    byContainer.get(cid).push(upgrade);
  });

  const doctrineSource = (id) => upgradeset.game?.upgradeset?.getDoctrineForUpgrade(id);
  const state = upgradeset.game?.state;
  const useReactiveLevelAndCost = !!state?.upgrade_display;

  byContainer.forEach((upgrades, containerId) => {
    const container = document.getElementById(containerId);
    if (!container?.isConnected) return;
    renderUpgradeContainerCards(upgrades, upgradeset, doctrineSource, useReactiveLevelAndCost, container);
  });

  const game = upgradeset.game;
  filtered.forEach((upgrade) => {
    const container = document.getElementById(getUpgradeContainerId(upgrade));
    if (!container?.isConnected) return;
    upgrade.$el = container?.querySelector(`[data-id="${upgrade.id}"]`);
    if (upgrade.$el) {
      upgrade.updateDisplayCost();
      const display = state?.upgrade_display;
      if (display) {
        if (!display[upgrade.id]) display[upgrade.id] = { level: upgrade.level, display_cost: upgrade.display_cost };
        mountUpgradeReactiveDisplay(upgrade, display);
      }
    }
  });

  if (game) runCheckAffordability(upgradeset, game);
}

export function updateSectionCountsState(ui, game) {
  if (!ui?.uiState || !game?.upgradeset) return;
  const sections = calculateSectionCounts(game.upgradeset);
  const counts = {};
  sections.forEach((s) => {
    counts[s.name] = { researched: s.researched, total: s.total };
  });
  ui.uiState.section_counts = counts;
}

function mountSectionCountsForWrapper(ui, wrapperId) {
  if (typeof document === "undefined") return [];
  const wrapper = document.getElementById(wrapperId);
  if (!wrapper?.isConnected) return [];
  const h2s = wrapper.querySelectorAll("h2[data-section-name]");
  const unmounts = [];
  h2s.forEach((h2) => {
    const sectionName = h2.getAttribute("data-section-name");
    if (!sectionName) return;
    let countSpan = h2.querySelector(".section-count");
    if (!countSpan) {
      countSpan = document.createElement("span");
      countSpan.className = "section-count";
      h2.appendChild(countSpan);
    }
    const renderFn = () => {
      const section = ui.uiState?.section_counts?.[sectionName] ?? { researched: 0, total: 0 };
      return sectionCountTextTemplate({ researched: section.researched, total: section.total });
    };
    unmounts.push(
      ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["section_counts"] }],
        renderFn,
        countSpan
      )
    );
  });
  return unmounts;
}

export function mountSectionCountsReactive(ui, wrapperId) {
  if (!ui?.uiState) return () => {};
  const ids = wrapperId
    ? [wrapperId]
    : ["upgrades_content_wrapper", "experimental_upgrades_content_wrapper"];
  const unmounts = ids.flatMap((id) => mountSectionCountsForWrapper(ui, id));
  return () => unmounts.forEach((fn) => { try { fn(); } catch (_) {} });
}

export class UpgradesUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('Upgrades', this);
  }

  getUpgradeContainer(locationKey) {
    return this.ui.DOMElements?.[locationKey] ?? this.ui.coreLoopUI?.getElement?.(locationKey) ?? document.getElementById(locationKey);
  }

  appendUpgrade(locationKey, upgradeEl) {
    const container = this.getUpgradeContainer(locationKey);
    if (container && upgradeEl) {
      container.appendChild(upgradeEl);
    }
  }

  showDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.remove("hidden");
      debugToggleBtn.textContent = "Hide Debug Info";
      this.updateDebugVariables();
    }
  }

  hideDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.add("hidden");
      debugToggleBtn.textContent = "Show Debug Info";
    }
  }

  updateDebugVariables() {
    const ui = this.ui;
    const debugVariables = ui.coreLoopUI?.getElement?.("debug_variables") ?? ui.DOMElements?.debug_variables;
    if (!ui.game || !debugVariables) return;
    const gameVars = this.collectGameVariables();
    const sectionTemplate = ([fileName, variables]) => {
      const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
      return debugVariablesSectionTemplate({
        fileName,
        sortedEntries,
        escapeKey: escapeHtml,
        renderValue: (value) => unsafeHTML(this.formatDebugValue(value)),
      });
    };
    const entries = Object.entries(gameVars);
    const template = debugVariablesTemplate({ entries, renderSection: sectionTemplate });
    render(template, debugVariables);
  }

  collectGameVariables() {
    const ui = this.ui;
    const vars = {
      "Game (game.js)": {},
      "Reactor (reactor.js)": {},
      "State Manager": {},
      "UI State": {},
      Performance: {},
      Tileset: {},
      Engine: {},
    };
    if (!ui.game) return vars;
    const game = ui.game;
    vars["Game (game.js)"]["version"] = game.version;
    vars["Game (game.js)"]["base_cols"] = game.base_cols;
    vars["Game (game.js)"]["base_rows"] = game.base_rows;
    vars["Game (game.js)"]["max_cols"] = game.max_cols;
    vars["Game (game.js)"]["max_rows"] = game.max_rows;
    vars["Game (game.js)"]["rows"] = game.rows;
    vars["Game (game.js)"]["cols"] = game.cols;
    vars["Game (game.js)"]["base_loop_wait"] = game.base_loop_wait;
    vars["Game (game.js)"]["base_manual_heat_reduce"] = game.base_manual_heat_reduce;
    vars["Game (game.js)"]["upgrade_max_level"] = game.upgrade_max_level;
    vars["Game (game.js)"]["base_money"] = game.base_money;
    vars["Game (game.js)"]["current_money"] = game.state.current_money;
    vars["Game (game.js)"]["protium_particles"] = game.protium_particles;
    vars["Game (game.js)"]["total_exotic_particles"] = game.state.total_exotic_particles;
    vars["Game (game.js)"]["exotic_particles"] = game.exoticParticleManager.exotic_particles;
    vars["Game (game.js)"]["current_exotic_particles"] = game.state.current_exotic_particles;
    vars["Game (game.js)"]["loop_wait"] = game.loop_wait;
    vars["Game (game.js)"]["paused"] = game.paused;
    vars["Game (game.js)"]["autoSellEnabled"] = game.autoSellEnabled;
    vars["Game (game.js)"]["isAutoBuyEnabled"] = game.isAutoBuyEnabled;
    vars["Game (game.js)"]["time_flux"] = game.time_flux;
    vars["Game (game.js)"]["sold_power"] = game.sold_power;
    vars["Game (game.js)"]["sold_heat"] = game.sold_heat;

    if (game.reactor) {
      const reactor = game.reactor;
      vars["Reactor (reactor.js)"]["base_max_heat"] = reactor.base_max_heat;
      vars["Reactor (reactor.js)"]["base_max_power"] = reactor.base_max_power;
      vars["Reactor (reactor.js)"]["current_heat"] = reactor.current_heat;
      vars["Reactor (reactor.js)"]["current_power"] = reactor.current_power;
      vars["Reactor (reactor.js)"]["max_heat"] = reactor.max_heat;
      vars["Reactor (reactor.js)"]["altered_max_heat"] = reactor.altered_max_heat;
      vars["Reactor (reactor.js)"]["max_power"] = reactor.max_power;
      vars["Reactor (reactor.js)"]["altered_max_power"] = reactor.altered_max_power;
      vars["Reactor (reactor.js)"]["auto_sell_multiplier"] = reactor.auto_sell_multiplier;
      vars["Reactor (reactor.js)"]["heat_power_multiplier"] = reactor.heat_power_multiplier;
      vars["Reactor (reactor.js)"]["heat_controlled"] = reactor.heat_controlled;
      vars["Reactor (reactor.js)"]["heat_outlet_controlled"] = reactor.heat_outlet_controlled;
      vars["Reactor (reactor.js)"]["vent_capacitor_multiplier"] = reactor.vent_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["vent_plating_multiplier"] = reactor.vent_plating_multiplier;
      vars["Reactor (reactor.js)"]["transfer_capacitor_multiplier"] = reactor.transfer_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["transfer_plating_multiplier"] = reactor.transfer_plating_multiplier;
      vars["Reactor (reactor.js)"]["has_melted_down"] = reactor.has_melted_down;
      vars["Reactor (reactor.js)"]["stats_power"] = reactor.stats_power;
      vars["Reactor (reactor.js)"]["stats_heat_generation"] = reactor.stats_heat_generation;
      vars["Reactor (reactor.js)"]["stats_vent"] = reactor.stats_vent;
      vars["Reactor (reactor.js)"]["stats_inlet"] = reactor.stats_inlet;
      vars["Reactor (reactor.js)"]["stats_outlet"] = reactor.stats_outlet;
      vars["Reactor (reactor.js)"]["stats_total_part_heat"] = reactor.stats_total_part_heat;
      vars["Reactor (reactor.js)"]["vent_multiplier_eff"] = reactor.vent_multiplier_eff;
      vars["Reactor (reactor.js)"]["transfer_multiplier_eff"] = reactor.transfer_multiplier_eff;
    }

    if (game.tileset) {
      const tileset = game.tileset;
      vars["Tileset"]["max_rows"] = tileset.max_rows;
      vars["Tileset"]["max_cols"] = tileset.max_cols;
      vars["Tileset"]["rows"] = tileset.rows;
      vars["Tileset"]["cols"] = tileset.cols;
      vars["Tileset"]["tiles_list_length"] = tileset.tiles_list?.length || 0;
      vars["Tileset"]["active_tiles_list_length"] = tileset.active_tiles_list?.length || 0;
      vars["Tileset"]["tiles_with_parts"] = tileset.tiles_list?.filter((t) => t.part)?.length || 0;
    }

    if (game.engine) {
      const engine = game.engine;
      vars["Engine"]["running"] = engine.running;
      vars["Engine"]["tick_count"] = engine.tick_count;
      vars["Engine"]["last_tick_time"] = engine.last_tick_time;
      vars["Engine"]["tick_interval"] = engine.tick_interval;
    }

    if (ui.stateManager) {
      const stateVars = ui.stateManager.getAllVars();
      Object.entries(stateVars).forEach(([key, value]) => {
        vars["State Manager"][key] = value;
      });
    }

    vars["UI State"]["update_interface_interval"] = ui.update_interface_interval;
    vars["UI State"]["isDragging"] = ui.inputHandler?.isDragging ?? false;
    vars["UI State"]["lastTileModified"] = ui.inputHandler?.lastTileModified ? "Tile Object" : null;
    vars["UI State"]["longPressTimer"] = ui.inputHandler?.longPressTimer ? "Active" : null;
    vars["UI State"]["longPressDuration"] = ui.inputHandler?.longPressDuration ?? 500;
    vars["UI State"]["last_money"] = ui.last_money;
    vars["UI State"]["last_exotic_particles"] = ui.last_exotic_particles;
    vars["UI State"]["ctrl9HoldTimer"] = ui.ctrl9HoldTimer ? "Active" : null;
    vars["UI State"]["ctrl9HoldStartTime"] = ui.ctrl9HoldStartTime;
    vars["UI State"]["ctrl9MoneyInterval"] = ui.ctrl9MoneyInterval ? "Active" : null;
    vars["UI State"]["ctrl9BaseAmount"] = ui.ctrl9BaseAmount;
    vars["UI State"]["ctrl9ExponentialRate"] = ui.ctrl9ExponentialRate;
    vars["UI State"]["ctrl9IntervalMs"] = ui.ctrl9IntervalMs;
    if (ui.ctrl9HoldStartTime) {
      const holdDuration = Date.now() - ui.ctrl9HoldStartTime;
      const secondsHeld = holdDuration / 1000;
      vars["UI State"]["ctrl9SecondsHeld"] = secondsHeld.toFixed(2);
      vars["UI State"]["ctrl9CurrentAmount"] = Math.floor(
        ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, secondsHeld)
      );
    }
    vars["UI State"]["screen_resolution"] = `${window.innerWidth}x${window.innerHeight}`;
    vars["UI State"]["device_pixel_ratio"] = window.devicePixelRatio;

    if (game.performance) {
      const perf = game.performance;
      vars["Performance"]["enabled"] = perf.enabled;
      vars["Performance"]["marks"] = Object.keys(perf.marks || {}).length;
      vars["Performance"]["measures"] = Object.keys(perf.measures || {}).length;
    }

    return vars;
  }

  formatDebugValue(value) {
    if (value === null || value === undefined) {
      return "<span class='debug-null'>null</span>";
    }
    if (typeof value === "boolean") {
      return `<span class='debug-boolean'>${value}</span>`;
    }
    if (typeof value === "number") {
      return `<span class='debug-number'>${value}</span>`;
    }
    if (typeof value === "string") {
      return `<span class='debug-string'>"${escapeHtml(value)}"</span>`;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return `<span class='debug-array'>[${value.length} items]</span>`;
      }
      return `<span class='debug-object'>{${Object.keys(value).length} keys}</span>`;
    }
    return `<span class='debug-other'>${escapeHtml(String(value))}</span>`;
  }
}

function resourceGte(a, b) {
  return a != null && typeof a.gte === "function" ? a.gte(b) : Number(a) >= b;
}

function resourceSub(a, b) {
  return a != null && typeof a.sub === "function" ? a.sub(b) : a - b;
}

function normalizeMoney(game, sellCredit) {
  let money = game.state.current_money;
  if (money != null && typeof money.add === "function") return sellCredit > 0 ? money.add(sellCredit) : money;
  return Number(money?.toNumber?.() ?? money ?? 0) + sellCredit;
}

function normalizeEp(game) {
  const ep = game.state.current_exotic_particles ?? 0;
  if (ep && typeof ep.toNumber === "function") return ep.toNumber();
  return Number(ep ?? 0);
}

function getNormalizedResources(game, sellCredit) {
  return { money: normalizeMoney(game, sellCredit), ep: normalizeEp(game) };
}

function getPartCost(part, cell) {
  const cost = part.cost != null && part.cost.gte ? part.cost.mul(cell.lvl || 1) : (part.cost ?? 0) * (cell.lvl || 1);
  const costNum = typeof cost === "number" ? cost : (cost?.toNumber?.() ?? Number(cost));
  return { cost, costNum };
}

function allocateIfAffordable(money, ep, part, cost, costNum, gte, sub) {
  if (part.erequires) {
    if (gte(ep, costNum)) return { newMoney: money, newEp: typeof ep === "number" ? ep - costNum : sub(ep, cost), allocated: true };
    return { newMoney: money, newEp: ep, allocated: false };
  }
  if (gte(money, costNum)) return { newMoney: typeof money === "number" ? money - costNum : sub(money, cost), newEp: ep, allocated: true };
  return { newMoney: money, newEp: ep, allocated: false };
}

function getCellCostNumber(part, cell) {
  if (typeof part.cost === "undefined" || part.cost == null) return 0;
  const amount = part.cost.gte ? part.cost.mul(cell.lvl || 1) : part.cost * (cell.lvl || 1);
  return amount != null && amount.gte != null ? amount.toNumber?.() ?? Number(amount) : Number(amount);
}

function addCellCostToBreakdown(out, part, num) {
  if (part.erequires) out.ep += num;
  else out.money += num;
}

export function calculateLayoutCostBreakdown(partset, layout) {
  const out = { money: 0, ep: 0 };
  if (!layout || !partset) return out;
  const cells = layout.flatMap((row) => row || []);
  cells
    .filter((cell) => cell?.id)
    .forEach((cell) => {
      const part = partset.parts.get(cell.id);
      if (part) addCellCostToBreakdown(out, part, getCellCostNumber(part, cell));
    });
  return out;
}

export function calculateLayoutCost(partset, layout) {
  if (!layout || !partset) return 0;
  return layout.flatMap((row) => row || []).filter((cell) => cell && cell.id).reduce((cost, cell) => {
    const part = partset.parts.get(cell.id);
    return cost + (part ? getCellCostNumber(part, cell) : 0);
  }, 0);
}

const PREVIEW_MAX_WIDTH = 160;
const PREVIEW_MAX_HEIGHT = 120;
const PREVIEW_MIN_TILE_SIZE = 2;
const GHOST_ALPHA = 0.35;

function getPreviewDimensions(rows, cols) {
  const tileSize = Math.max(PREVIEW_MIN_TILE_SIZE, Math.min(Math.floor(PREVIEW_MAX_WIDTH / cols), Math.floor(PREVIEW_MAX_HEIGHT / rows)));
  return { tileSize, w: cols * tileSize, h: rows * tileSize };
}

function drawPreviewTileBackground(ctx, x, y, tileSize) {
  ctx.fillStyle = "rgb(20 20 20)";
  ctx.strokeStyle = "rgb(40 40 40)";
  ctx.fillRect(x, y, tileSize, tileSize);
  ctx.strokeRect(x, y, tileSize, tileSize);
}

function drawPreviewTilePart(ctx, img, x, y, tileSize, ghost) {
  if (!img || !img.complete || !img.naturalWidth) return;
  if (ghost) ctx.globalAlpha = GHOST_ALPHA;
  ctx.drawImage(img, x, y, tileSize, tileSize);
  if (ghost) ctx.globalAlpha = 1;
}

function createImageLoader() {
  const imgCache = new Map();
  return (path) => {
    if (imgCache.has(path)) return imgCache.get(path);
    if (typeof Image !== "function" || typeof document === "undefined") {
      imgCache.set(path, null);
      return null;
    }
    try {
      const img = new Image();
      img.src = path;
      imgCache.set(path, img);
      return img;
    } catch (_) {
      imgCache.set(path, null);
      return null;
    }
  };
}

function drawPreviewCell(ctx, opts) {
  const { layout, r, c, partset, loadImg, tileSize, affordableSet } = opts;
  const x = c * tileSize;
  const y = r * tileSize;
  drawPreviewTileBackground(ctx, x, y, tileSize);
  const cell = layout[r]?.[c];
  if (!cell?.id) return;
  const part = partset.getPartById(cell.id);
  if (!part) return;
  const path = typeof part.getImagePath === "function" ? part.getImagePath() : null;
  if (!path) return;
  const key = `${r},${c}`;
  const ghost = affordableSet != null && !affordableSet.has(key);
  drawPreviewTilePart(ctx, loadImg(path), x, y, tileSize, ghost);
}

export function renderLayoutPreview(partset, layout, canvasEl, affordableSet) {
  if (!layout?.length || !canvasEl || !partset) return;
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  if (cols === 0) return;
  const { tileSize, w, h } = getPreviewDimensions(rows, cols);
  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return;
  const loadImg = createImageLoader();
  const indices = Array.from({ length: rows * cols }, (_, i) => ({ r: Math.floor(i / cols), c: i % cols }));
  indices.forEach(({ r, c }) => drawPreviewCell(ctx, { layout, r, c, partset, loadImg, tileSize, affordableSet }));
}

export function buildPartSummary(partset, layout) {
  if (!partset || !layout) return [];
  const cells = layout.flatMap((row) => row || []).filter((cell) => cell && cell.id);
  const summary = cells.reduce((acc, cell) => {
    const key = `${cell.id}|${cell.lvl || 1}`;
    if (!acc[key]) {
      const part = partset.parts.get(cell.id);
      acc[key] = {
        id: cell.id,
        type: cell.t,
        lvl: cell.lvl || 1,
        title: part ? part.title : cell.id,
        unitPrice: part ? part.cost : 0,
        count: 0,
        total: 0,
      };
    }
    acc[key].count++;
    acc[key].total += acc[key].unitPrice;
    return acc;
  }, {});
  return Object.values(summary);
}

export function buildAffordableSet(affordableLayout) {
  if (!affordableLayout) return new Set();
  const keys = affordableLayout.flatMap((row, r) => (row || []).map((cell, c) => cell ? `${r},${c}` : null).filter(Boolean));
  return new Set(keys);
}

export function getCompactLayout(game) {
  if (!game.tileset || !game.tileset.tiles_list) return null;
  const rows = game.rows;
  const cols = game.cols;
  const parts = [];
  game.tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) {
      parts.push({
        r: tile.row,
        c: tile.col,
        t: tile.part.type,
        id: tile.part.id,
        lvl: tile.part.level || 1,
      });
    }
  });
  return { size: { rows, cols }, parts };
}

function countPlacedParts(game, type, level) {
  if (!game.tileset || !game.tileset.tiles_list) return 0;
  let count = 0;
  for (const tile of game.tileset.tiles_list) {
    const tilePart = tile.part;
    if (tilePart && tilePart.type === type && tilePart.level === level) {
      count++;
    }
  }
  return count;
}

export function serializeReactor(game) {
  const layout = getCompactLayout(game);
  if (!layout) return "";
  return JSON.stringify(layout, null, 2);
}

function buildEmptyLayout(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function populateLayoutFromParts(layout, parts, rows, cols) {
  parts.forEach((part) => {
    if (part.r >= 0 && part.r < rows && part.c >= 0 && part.c < cols) {
      layout[part.r][part.c] = { t: part.t, id: part.id, lvl: part.lvl };
    }
  });
}

function parseLayoutFromBlueprint(parsed) {
  const { rows, cols } = parsed.size;
  const layout = buildEmptyLayout(rows, cols);
  populateLayoutFromParts(layout, parsed.parts, rows, cols);
  return layout;
}

export function deserializeReactor(str) {
  try {
    const data = JSON.parse(str);
    const bpResult = BlueprintSchema.safeParse(data);
    if (bpResult.success) return parseLayoutFromBlueprint(bpResult.data);
    const legacyResult = LegacyGridSchema.safeParse(data);
    if (legacyResult.success) return legacyResult.data;
    return null;
  } catch {
    return null;
  }
}

const SELL_VALUE_MULTIPLIER = 0.5;

export function filterLayoutByCheckedTypes(layout, checkedTypes) {
  return layout.map(row => row.map(cell => (cell && checkedTypes[cell.id] !== false) ? cell : null));
}

export function clipToGrid(layout, rows, cols) {
  return layout.slice(0, rows).map(row => (row || []).slice(0, cols));
}

export function calculateCurrentSellValue(tileset) {
  if (!tileset?.tiles_list) return 0;
  let sellValue = 0;
  tileset.tiles_list.forEach(tile => {
    if (tile.enabled && tile.part) {
      sellValue += (tile.part.cost * (tile.part.level || 1)) * SELL_VALUE_MULTIPLIER;
    }
  });
  return Math.floor(sellValue);
}

export function buildAffordableLayout(filteredLayout, sellCredit, gameRows, gameCols, game) {
  if (!filteredLayout || !game?.partset) return null;
  let { money, ep } = getNormalizedResources(game, sellCredit);
  const rows = Math.min(gameRows, filteredLayout.length);
  const cols = Math.min(gameCols, filteredLayout[0]?.length ?? 0);
  const result = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  const cellsInOrder = filteredLayout.flatMap((row, r) =>
    (row || []).map((cell, c) => (cell && cell.id ? { r, c, cell } : null)).filter(Boolean)
  );
  cellsInOrder.forEach(({ r, c, cell }) => {
    const part = game.partset.getPartById(cell.id);
    if (!part) return;
    const { cost, costNum } = getPartCost(part, cell);
    const { newMoney, newEp, allocated } = allocateIfAffordable(money, ep, part, cost, costNum, resourceGte, resourceSub);
    money = newMoney;
    ep = newEp;
    if (allocated) result[r][c] = cell;
  });
  return result;
}

function calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum) {
  const netMoney = breakdown.money - sellCredit;
  const canAffordMoney = netMoney <= currentMoneyNum;
  const canAffordEp = breakdown.ep <= currentEpNum;
  const canPaste = (breakdown.money > 0 || breakdown.ep > 0) && canAffordMoney && canAffordEp;
  return { canAffordMoney, canAffordEp, canPaste };
}

export function buildPasteState(layout, checkedTypes, game, tileset, sellCheckboxChecked) {
  if (!layout) return { valid: false, invalidMessage: "Invalid layout data" };

  const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
  const breakdown = calculateLayoutCostBreakdown(game?.partset, filteredLayout);
  const sellCredit = sellCheckboxChecked ? calculateCurrentSellValue(tileset) : 0;

  const currentMoney = game.state.current_money;
  const currentEp = game.state.current_exotic_particles;
  const currentMoneyNum = typeof currentMoney?.toNumber === "function"
    ? currentMoney.toNumber()
    : Number(currentMoney ?? 0);
  const currentEpNum = typeof currentEp?.toNumber === "function"
    ? currentEp.toNumber()
    : Number(currentEp ?? 0);

  const finances = calculateFinances(breakdown, sellCredit, currentMoneyNum, currentEpNum);
  const affordableLayout = buildAffordableLayout(filteredLayout, sellCredit, game.rows, game.cols, game);
  const hasPartial = affordableLayout ? affordableLayout.some(row => row?.some(cell => cell != null)) : false;

  return {
    valid: true,
    filteredLayout,
    breakdown,
    ...finances,
    affordableLayout,
    currentMoneyNum,
    currentEpNum,
    hasPartial,
  };
}

export function validatePasteResources(breakdown, sellCredit, currentMoney, currentEp) {
  const netMoney = breakdown.money - sellCredit;
  if (breakdown.money <= 0 && breakdown.ep <= 0) return { valid: false, reason: "no_parts" };
  if (!resourceGte(currentMoney, netMoney) || !resourceGte(currentEp, breakdown.ep)) return { valid: false, reason: "insufficient_resources" };
  return { valid: true };
}

export function getCostBreakdown(layout, partset) {
  if (!layout || !partset) return { money: 0, ep: 0 };
  return layout.flatMap(row => row || []).filter(cell => cell?.id).reduce((out, cell) => {
    const part = partset.parts.get(cell.id);
    if (!part) return out;
    const n = (part.cost?.toNumber?.() ?? Number(part.cost ?? 0)) * (cell.lvl || 1);
    if (part.erequires) out.ep += n;
    else out.money += n;
    return out;
  }, { money: 0, ep: 0 });
}

function getLayoutCost(entryData, ui, fmtFn) {
  try {
    const parsed = typeof entryData === "string" ? JSON.parse(entryData) : entryData;
    const layout2D = ui.sandboxUI.compactTo2DLayout(parsed);
    if (!layout2D || !ui.game?.partset) return "-";
    const cost = layout2D.flatMap((row) => row || []).filter((cell) => cell?.id).reduce((sum, cell) => {
      const part = ui.game.partset.parts.get(cell.id);
      return sum + (part ? part.cost * (cell.lvl || 1) : 0);
    }, 0);
    return cost > 0 ? fmtFn(cost) : "-";
  } catch {
    return "-";
  }
}

const MODAL_HIDE_DELAY_MS = 1000;
const MODAL_COST_MARGIN_TOP_PX = 10;
const MODAL_SECTION_MARGIN_TOP_PX = 15;
const MODAL_BORDER_RADIUS_PX = 4;
const CONFIRM_BTN_BG = "#236090";
const MODAL_GAP_PX = 4;
const MODAL_PADDING_PX = 10;
const MODAL_INNER_GAP_PX = 8;
const JSON_INDENT_SPACES = 2;
const MODAL_BORDER_COLOR = "rgb(68 68 68)";
const MODAL_BG_DARK = "rgb(42 42 42)";
const COLOR_GOLD = "rgb(255 215 0)";
const COLOR_SUCCESS = "rgb(76 175 80)";
const COLOR_ERROR = "rgb(255 107 107)";
const COLOR_AFFORD = "#4caf50";
const COLOR_CANNOT_AFFORD = "#ff6b6b";
const OPACITY_VISIBLE = "1";
const OPACITY_HIDDEN = "0";
const Z_INDEX_VISIBLE = "1";
const HEIGHT_COLLAPSED = "0";

const pasteState = proxy({
  textareaData: "",
  checkedTypes: {},
  sellExisting: false,
});

function setModalTextareaVisibility(modalText, isPaste) {
  if (isPaste) {
    modalText.classList.remove("hidden");
    modalText.style.display = "block";
    modalText.style.visibility = "visible";
    modalText.style.opacity = OPACITY_VISIBLE;
    modalText.style.position = "relative";
    modalText.style.zIndex = Z_INDEX_VISIBLE;
  } else {
    modalText.classList.add("hidden");
    modalText.style.display = "none";
    modalText.style.visibility = "hidden";
    modalText.style.opacity = OPACITY_HIDDEN;
    modalText.style.height = HEIGHT_COLLAPSED;
    modalText.style.overflow = "hidden";
  }
}

function CostDisplay({ breakdown, affordability }) {
  const { money: costMoney, ep: costEp } = breakdown;
  if (costMoney <= 0 && costEp <= 0) {
    return copyPasteNoPartsTemplate({
      messageStyle: styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_ERROR, fontWeight: "bold" }),
    });
  }
  const moneyColor = affordability.canAffordMoney ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const epColor = affordability.canAffordEp ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const containerStyle = styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, display: "flex", flexDirection: "column", gap: `${MODAL_GAP_PX}px` });
  return copyPasteCostDisplayTemplate({
    containerStyle,
    showMoney: costMoney > 0,
    moneyStyle: styleMap({ color: moneyColor, fontWeight: "bold" }),
    moneyText: `Money: $${fmt(costMoney)} needed (you have $${fmt(affordability.currentMoneyNum)})`,
    showEp: costEp > 0,
    epStyle: styleMap({ color: epColor, fontWeight: "bold" }),
    epText: `EP: ${fmt(costEp)} needed (you have ${fmt(affordability.currentEpNum)})`,
  });
}

function SellOption({ currentSellValue, checked, onSellChange }) {
  const boxStyle = styleMap({
    padding: `${MODAL_PADDING_PX}px`,
    border: `1px solid ${MODAL_BORDER_COLOR}`,
    borderRadius: `${MODAL_BORDER_RADIUS_PX}px`,
    marginTop: `${MODAL_SECTION_MARGIN_TOP_PX}px`,
    backgroundColor: MODAL_BG_DARK,
  });
  const labelStyle = styleMap({ display: "flex", alignItems: "center", cursor: "pointer", gap: `${MODAL_INNER_GAP_PX}px` });
  return copyPasteSellOptionTemplate({
    boxStyle,
    labelStyle,
    inputStyle: styleMap({ margin: 0 }),
    checked,
    onSellChange,
    textStyle: styleMap({ color: COLOR_GOLD }),
    text: `Sell existing grid for $${fmt(currentSellValue)}`,
  });
}

function renderModalCostContent(modalCost, cost, summary, ui, options, onSlotClick) {
  const componentTemplate = summary.length ? renderComponentIcons(summary, options, onSlotClick) : html``;
  const costTemplate = cost > 0 ? html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Total Cost: $${fmt(cost)}</div>` : html``;
  render(copyPasteModalCostContentTemplate({ componentTemplate, costTemplate }), modalCost);
}

function showModal(ui, refs, opts) {
  const { modal, modalTitle, modalText, modalCost, confirmBtn } = refs;
  const { title, data, cost, action, canPaste = false, summary = [], ...options } = opts;
  const confirmLabel = action === "copy" ? "Copy" : "Paste";
  ui._copyPasteModalReactiveUnmount?.();
  ui.uiState.copy_paste_modal_display = { title, confirmLabel };
  const titleUnmount = ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["copy_paste_modal_display"] }],
    () => plainTextTemplate({ text: ui.uiState?.copy_paste_modal_display?.title ?? "" }),
    modalTitle
  );
  const btnUnmount = ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["copy_paste_modal_display"] }],
    () => plainTextTemplate({ text: ui.uiState?.copy_paste_modal_display?.confirmLabel ?? "" }),
    confirmBtn
  );
  ui._copyPasteModalReactiveUnmount = () => { titleUnmount(); btnUnmount(); };
  modalText.value = data;
  setModalTextareaVisibility(modalText, action === "paste");
  const wasPaused = ui.stateManager.getVar("pause");
  ui.stateManager.setVar("pause", true);
  renderModalCostContent(modalCost, cost, summary, ui, options);
  if (action === "copy") {
    modalText.readOnly = true;
    modalText.placeholder = "Reactor layout data (read-only)";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = false;
  } else if (action === "paste") {
    modalText.readOnly = false;
    modalText.placeholder = (data && data.trim()) ? "Paste reactor layout JSON data here..." : "Enter reactor layout JSON data manually...";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = !canPaste;
  }
  modal.classList.remove("hidden");
  const previewWrap = document.getElementById("reactor_copy_paste_preview_wrap");
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
  if (previewWrap) previewWrap.classList.toggle("hidden", action !== "paste");
  if (partialBtn) partialBtn.classList.toggle("hidden", action !== "paste");
  modal.dataset.previousPauseState = wasPaused;
  modal.onclick = (e) => {
    if (e.target === modal) {
      ui.modalOrchestrationUI.hideModal();
      modal.onclick = null;
    }
  };
}

export function setupCopyAction(ui, bp, refs) {
  const { copyBtn, modalCost, confirmBtn } = refs;

  copyBtn.onclick = () => {
    const data = bp().serialize();
    const layout = bp().deserialize(data);
    const cost = bp().getTotalCost(layout);
    const summary = bp().getPartSummary(layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = (layout, summary, checkedTypes) => {
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateCopySummary(layout, summary, checkedTypes);
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const filteredLayout = bp().filterByTypes(layout, checkedTypes);
      const filteredCost = bp().getTotalCost(filteredLayout);
      const costTemplate = copyPasteSelectedPartsCostTemplate({
        costStyle: styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" }),
        text: `Selected Parts Cost: $${fmt(filteredCost)}`,
      });
      render(html`${componentTemplate}${costTemplate}`, modalCost);
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
    };

    updateCopySummary(layout, summary, checkedTypes);

    confirmBtn.onclick = async () => {
      if (!ui.game) return;
      const filteredLayout = bp().filterByTypes(layout, checkedTypes);
      const rows = ui.game.rows;
      const cols = ui.game.cols;
      const parts = filteredLayout.flatMap((row, r) => (row || []).map((cell, c) => (cell && cell.id) ? { r, c, t: cell.t, id: cell.id, lvl: cell.lvl || 1 } : null).filter(Boolean));
      const compactLayout = { size: { rows, cols }, parts };
      const filteredData = JSON.stringify(compactLayout, null, JSON_INDENT_SPACES);
      const result = await ui.clipboardUI.writeToClipboard(filteredData);
      const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
      if (result.success) {
        ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, filteredData);
        ui.uiState.copy_paste_modal_display = { ...ui.uiState.copy_paste_modal_display, confirmLabel: "Copied!" };
      } else {
        ui.uiState.copy_paste_modal_display = { ...ui.uiState.copy_paste_modal_display, confirmLabel: "Failed to Copy" };
      }
      setTimeout(() => ui.modalOrchestrationUI.hideModal(), MODAL_HIDE_DELAY_MS);
    };

    confirmBtn.disabled = false;
    confirmBtn.classList.remove("hidden");
    confirmBtn.style.backgroundColor = CONFIRM_BTN_BG;
    confirmBtn.style.cursor = "pointer";
  };
}

function clearExistingPartsForSell(ui) {
  ui.game.tileset.tiles_list.forEach(tile => {
    if (tile.enabled && tile.part) tile.sellPart();
  });
  ui.game.reactor.updateStats();
}

function handleConfirmPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) {
    logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
    return;
  }
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  const breakdown = bp().getCostBreakdown(filtered);
  const sellCredit = pasteState.sellExisting ? bp().getCurrentSellValue() : 0;
  const validation = bp().validateResources(breakdown, sellCredit);

  if (!validation.valid) {
    logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
    return;
  }
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  ui.copyPaste.pasteReactorLayout(bp().clipToGrid(filtered));
  ui.modalOrchestrationUI.hideModal();
}

function handlePartialPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) return;
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  const affordable = bp().buildAffordableLayout(filtered, 0);
  if (affordable) ui.copyPaste.pasteReactorLayout(affordable);
  ui.modalOrchestrationUI.hideModal();
}

function renderPasteModalContent(ui, bp, refs) {
  const parsed = bp().deserialize(pasteState.textareaData);
  if (!parsed) {
    const msg = !pasteState.textareaData ? "Enter reactor layout JSON data in the text area above" : "Invalid layout data - please check the JSON format";
    render(copyPasteStatusMessageTemplate({ message: msg }), refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const originalSummary = bp().getPartSummary(parsed);
  originalSummary.forEach(item => {
    if (pasteState.checkedTypes[item.id] === undefined) {
      pasteState.checkedTypes[item.id] = true;
    }
  });

  const validationState = bp().buildPasteState(parsed, pasteState.checkedTypes, pasteState.sellExisting);
  if (!validationState.valid) {
    render(copyPasteStatusMessageTemplate({ message: validationState.invalidMessage }), refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const onSlotClick = (ids, checked) => ids.forEach(id => { pasteState.checkedTypes[id] = !checked; });
  const onSellChange = (e) => { pasteState.sellExisting = e.target.checked; };

  const componentTemplate = renderComponentIcons(originalSummary, { showCheckboxes: true, checkedTypes: pasteState.checkedTypes }, onSlotClick);
  const hasSellOption = refs.modal.dataset.hasSellOption === "true";
  const totalSellValue = Number(refs.modal.dataset.sellValue || 0);

  const sellOptionTemplate = hasSellOption
    ? SellOption({ currentSellValue: totalSellValue, checked: pasteState.sellExisting, onSellChange })
    : html``;

  const costTemplate = CostDisplay({
    breakdown: validationState.breakdown,
    affordability: {
      canAffordMoney: validationState.canAffordMoney,
      canAffordEp: validationState.canAffordEp,
      currentMoneyNum: validationState.currentMoneyNum,
      currentEpNum: validationState.currentEpNum,
    },
  });

  render(
    copyPasteRenderedContentTemplate({
      componentTemplate,
      sellOptionTemplate,
      costTemplate,
    }),
    refs.modalCost
  );

  refs.confirmBtn.disabled = !validationState.canPaste;
  const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
  if (partialBtnRef) {
    partialBtnRef.disabled = !validationState.hasPartial;
  }

  const previewCanvas = document.getElementById("reactor_copy_paste_preview");
  if (previewCanvas) {
    const affordableSet = bp().getAffordableSet(validationState.affordableLayout);
    bp().renderPreview(parsed, previewCanvas, affordableSet);
  }
}

export function setupPasteAction(ui, bp, refs) {
  const { pasteBtn, modal, modalText, confirmBtn } = refs;
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");

  if (!modal._hasValtioSub) {
    modal._hasValtioSub = true;
    subscribe(pasteState, () => renderPasteModalContent(ui, bp, refs));
  }

  modalText.oninput = (e) => {
    pasteState.textareaData = e.target.value.trim();
    pasteState.checkedTypes = {};
  };

  confirmBtn.onclick = () => handleConfirmPaste(ui, bp);
  if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui, bp);

  ui._showPasteModalWithData = (data) => {
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = bp().deserialize(data);
    const summary = bp().getPartSummary(layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = bp().getCurrentSellValue();
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);

    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    renderPasteModalContent(ui, bp, refs);
  };

  pasteBtn.onclick = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    ui._showPasteModalWithData(result.success ? result.data : "");
  };
}

function layoutsListTemplate(ui, list, fmtFn, onAfterDelete) {
  if (list.length === 0) {
    return emptyLayoutsListTemplate();
  }
  return myLayoutsListTemplate({
    list,
    renderRow: (entry) => {
      const costStr = getLayoutCost(entry.data, ui, fmtFn);
      return myLayoutsTableRowTemplate({
        entryId: entry.id,
        name: entry.name,
        costStr,
        onView: () => ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, { layoutJson: entry.data, stats: {} }),
        onLoad: () => {
          ui.modalOrchestrator.hideModal(MODAL_IDS.MY_LAYOUTS);
          ui._showPasteModalWithData(entry.data);
        },
        onDelete: () => {
          ui.layoutStorageUI.removeFromMyLayouts(entry.id);
          if (typeof onAfterDelete === "function") onAfterDelete();
        },
      });
    },
  });
}

export function myLayoutsTemplate(ui, list, fmtFn, onClose) {
  const onSaveFromClipboard = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    const data = result.success ? result.data : "";
    const bpService = new BlueprintService(ui.game);
    const layout = bpService.deserialize(data);
    if (!layout) return;

    const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
    ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, data);
    ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  };

  return myLayoutsModalTemplate({
    onClose,
    onSaveFromClipboard,
    listContent: layoutsListTemplate(ui, list, fmtFn, () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS)),
  });
}
class HeatVisualsUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('HeatVisuals', this);
    this._overlay = null;
    this._heatFlowOverlay = null;
    this._timeFluxSimOverlay = null;
  }

  _ensureOverlay() {
    const ui = this.ui;
    if (this._overlay && this._overlay.parentElement) return this._overlay;
    const reactorWrapper = ui.registry?.get?.("PageInit")?.getReactorWrapper?.() ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById('reactor_wrapper');
    if (!reactorWrapper) {
      return null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'reactor-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    reactorWrapper.style.position = reactorWrapper.style.position || 'relative';
    reactorWrapper.appendChild(overlay);
    this._overlay = overlay;
    return overlay;
  }

  _ensureHeatFlowOverlay() {
    const overlay = this._ensureOverlay();
    if (!overlay) return null;
    if (this._heatFlowOverlay && this._heatFlowOverlay.parentElement) return this._heatFlowOverlay;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "heat-flow-overlay");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    overlay.appendChild(svg);
    this._heatFlowOverlay = svg;
    return svg;
  }

  _ensureTimeFluxSimulationOverlay() {
    if (this._timeFluxSimOverlay && this._timeFluxSimOverlay.parentElement) return this._timeFluxSimOverlay;
    if (typeof document === "undefined" || !document.body) return null;
    const overlay = document.createElement("div");
    overlay.className = "time-flux-sim-overlay";
    document.body.appendChild(overlay);
    this._timeFluxSimOverlay = overlay;
    this.updateTimeFluxSimulation(0, false);
    return overlay;
  }

  updateTimeFluxSimulation(progressPercent, active) {
    const overlay = this._ensureTimeFluxSimulationOverlay();
    if (!overlay) return;
    if (!active) {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "flex";
    const pct = Math.max(0, Math.min(100, Math.round(progressPercent || 0)));
    render(timeFluxSimulationTemplate({ pct }), overlay);
  }

  _tileCenterToOverlayPosition(row, col) {
    const ui = this.ui;
    const overlay = this._ensureOverlay();
    if (!overlay) return { x: 0, y: 0 };
    const reactorEl = (ui.gridCanvasRenderer?.getCanvas() || ui.registry?.get?.("PageInit")?.getReactor?.()) ?? ui.DOMElements?.reactor;
    const tileSize = ui.gridCanvasRenderer?.getTileSize() ?? (parseInt(getComputedStyle(reactorEl || document.body).getPropertyValue('--tile-size'), 10) || 48);
    if (!reactorEl) return { x: 0, y: 0 };
    const reactorRect = reactorEl.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const x = reactorRect.left - overlayRect.left + (col + 0.5) * tileSize;
    const y = reactorRect.top - overlayRect.top + (row + 0.5) * tileSize;
    return { x, y };
  }

  getHeatFlowVisible() {
    return preferences.heatFlowVisible !== false;
  }

  getHeatMapVisible() {
    return preferences.heatMapVisible === true;
  }

  getDebugOverlayVisible() {
    return preferences.debugOverlay === true;
  }

  drawHeatFlowOverlay() {
    const ui = this.ui;
    if (ui.gridCanvasRenderer) return;
    const enabled = this.getHeatFlowVisible();
    const overlay = this._ensureOverlay();
    if (!overlay) return;
    const svg = this._ensureHeatFlowOverlay();
    if (!svg) return;
    if (!enabled) {
      svg.style.display = "none";
      return;
    }
    svg.style.display = "";
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = "";
    const engine = ui.game?.engine;
    if (!engine || typeof engine.getLastHeatFlowVectors !== "function") return;
    const vectors = engine.getLastHeatFlowVectors();
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      const from = this._tileCenterToOverlayPosition(v.fromRow, v.fromCol);
      const to = this._tileCenterToOverlayPosition(v.toRow, v.toCol);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const headLen = 8;
      const endX = to.x - ux * headLen;
      const endY = to.y - uy * headLen;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", endX);
      line.setAttribute("y2", endY);
      line.setAttribute("stroke", "rgba(255,120,40,0.9)");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);
      const ax = ux * headLen;
      const ay = uy * headLen;
      const perp = 4;
      const px = -uy * perp;
      const py = ux * perp;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", `${to.x},${to.y} ${to.x - ax + px},${to.y - ay + py} ${to.x - ax - px},${to.y - ay - py}`);
      poly.setAttribute("fill", "rgba(255,120,40,0.9)");
      svg.appendChild(poly);
    }
  }

  clearHeatWarningClasses() {
    const bg = this.ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? this.ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
    if (bg) bg.classList.remove("heat-warning", "heat-critical");
  }

  updateHeatVisuals() {
    const ui = this.ui;
    const stateHeat = ui.stateManager.getVar("current_heat");
    const current = stateHeat ?? 0;
    const max = ui.stateManager.getVar("max_heat") || 1;
    const background = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background;
    if (!background) return;

    const heatRatio = current / max;

    background.classList.remove("heat-warning", "heat-critical");

    if (heatRatio <= 0.5) {
      background.style.backgroundColor = "transparent";
    } else if (heatRatio <= 1.0) {
      const intensity = (heatRatio - 0.5) * 2;
      const alpha = Math.min(intensity * 0.2, 0.2);
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      if (heatRatio >= 0.8) {
        background.classList.add("heat-warning");
      }
    } else if (heatRatio <= 1.5) {
      const intensity = (heatRatio - 1.0) * 2;
      const alpha = 0.2 + (intensity * 0.3);
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      background.classList.add("heat-warning");

      if (heatRatio >= 1.3) {
        background.classList.add("heat-critical");
      }
    } else {
      background.style.backgroundColor = "rgba(255, 0, 0, 0.5)";

      background.classList.add("heat-critical");
    }
  }
}

class GridInteractionUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('GridInteraction', this);
    this._activeVentRotors = new Map();
    this._activeTileIcons = new Map();
    this.highlightedSegment = null;
  }

  clearSegmentHighlight() {
    this.highlightedSegment = null;
  }

  getHighlightedTiles() {
    return this.highlightedSegment?.components ?? [];
  }

  getSellingTile() {
    return this.ui.inputHandler?.getSellingTile() ?? null;
  }

  getHoveredTile() {
    return this.ui.inputHandler?.getHoveredTile() ?? null;
  }

  getInteractionState() {
    return this.ui?.uiState?.interaction ?? null;
  }

  handleGridInteraction(tile, event) {
    return this.ui.gridController?.handleGridInteraction?.(tile, event);
  }

  spawnTileIcon(kind, fromTile, toTile = null) {
    const ui = this.ui;
    try {
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
      if (typeof document === "undefined" || !fromTile || !container) return;
      if (!container || !ui.gridCanvasRenderer) return;
      let animationKey = `${fromTile.row}-${fromTile.col}-${kind}`;
      if (toTile) animationKey += `-to-${toTile.row}-${toTile.col}`;
      if (this._activeTileIcons.has(animationKey)) return;
      const iconSrcMap = { power: "img/ui/icons/icon_power.png", heat: "img/ui/icons/icon_heat.png", vent: "img/ui/icons/icon_vent.png" };
      const src = iconSrcMap[kind];
      if (!src) return;
      const containerRect = container.getBoundingClientRect();
      const fromRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, containerRect);
      const tileSizePx = ui.gridCanvasRenderer.getTileSize();
      const iconSize = Math.max(12, Math.min(18, (tileSizePx / 3) | 0));
      const startOffset = (kind === 'power') ? { x: 6, y: -6 } : (kind === 'heat') ? { x: -6, y: 6 } : { x: 0, y: 0 };
      const img = document.createElement("img");
      img.src = src;
      img.alt = kind;
      img.className = `tile-fx fx-${kind}`;
      img.style.width = `${iconSize}px`;
      img.style.height = `${iconSize}px`;
      img.style.left = `${fromRect.centerX - iconSize / 2 + startOffset.x}px`;
      img.style.top = `${fromRect.centerY - iconSize / 2 + startOffset.y}px`;
      this._activeTileIcons.set(animationKey, img);
      container.appendChild(img);
      requestAnimationFrame(() => {
        if (toTile && ui.gridCanvasRenderer) {
          const endRect = ui.gridCanvasRenderer.getTileRectInContainer(toTile.row, toTile.col, containerRect);
          img.style.left = `${endRect.centerX - iconSize / 2}px`;
          img.style.top = `${endRect.centerY - iconSize / 2}px`;
          if (kind === "heat") img.style.opacity = "0.75";
        } else {
          img.classList.add("fx-fade-out");
        }
        setTimeout(() => {
          if (img?.parentNode) img.parentNode.removeChild(img);
          this._activeTileIcons.delete(animationKey);
        }, 300);
      });
    } catch (_) {}
  }

  blinkVent(tile) {
    const ui = this.ui;
    try {
      if (typeof document === "undefined" || !tile || !ui.gridCanvasRenderer) return;
      if (this._activeVentRotors.has(tile)) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      const rect = ui.gridCanvasRenderer.getTileRectInContainer(tile.row, tile.col, containerRect);
      const inset = 0.2;
      const size = 0.6;
      const rotorW = rect.width * size;
      const rotorH = rect.height * size;
      const rotorLeft = rect.left + rect.width * inset;
      const rotorTop = rect.top + rect.height * inset;
      const rotor = document.createElement("span");
      rotor.className = "vent-rotor";
      rotor.style.position = "absolute";
      rotor.style.left = `${rotorLeft}px`;
      rotor.style.top = `${rotorTop}px`;
      rotor.style.width = `${rotorW}px`;
      rotor.style.height = `${rotorH}px`;
      rotor.style.pointerEvents = "none";
      if (tile?.part && typeof tile.part.getImagePath === 'function') {
        const sprite = tile.part.getImagePath();
        if (sprite) rotor.style.backgroundImage = `url('${sprite}')`;
      }
      rotor.style.backgroundSize = "166.66% 166.66%";
      rotor.style.backgroundPosition = "center";
      rotor.style.backgroundRepeat = "no-repeat";
      rotor.style.imageRendering = "pixelated";
      this._activeVentRotors.set(tile, rotor);
      container.appendChild(rotor);
      rotor.classList.remove("spin");
      void rotor.offsetWidth;
      rotor.classList.add("spin");
      setTimeout(() => {
        if (rotor?.parentNode) {
          rotor.classList.remove("spin");
          rotor.parentNode.removeChild(rotor);
        }
        this._activeVentRotors.delete(tile);
      }, 300);
    } catch (_) {}
  }

  _cleanupVentRotor(tile) {
    try {
      const rotor = this._activeVentRotors.get(tile);
      if (rotor?.parentNode) rotor.parentNode.removeChild(rotor);
      this._activeVentRotors.delete(tile);
    } catch (_) {}
  }

  clearAllActiveAnimations() {
    this._activeVentRotors.forEach((rotor) => {
      if (rotor?.parentNode) rotor.parentNode.removeChild(rotor);
    });
    this._activeVentRotors.clear();
    this._activeTileIcons.forEach((icon) => {
      if (icon?.parentElement) icon.parentElement.removeChild(icon);
    });
    this._activeTileIcons.clear();
  }

  getAnimationStatus() {
    return {
      activeVentRotors: this._activeVentRotors.size,
      activeTileIcons: this._activeTileIcons.size,
      totalActiveAnimations: this._activeVentRotors.size + this._activeTileIcons.size
    };
  }

  clearReactorHeat() {
    const ui = this.ui;
    if (!ui.game || !ui.game.reactor) return;

    try {
      ui.game.reactor.current_heat = 0;

      if (ui.game.tileset && ui.game.tileset.active_tiles_list) {
        ui.game.tileset.active_tiles_list.forEach(tile => {
          if (tile.heat_contained !== undefined) {
            tile.heat_contained = 0;
          }
          if (tile.heat !== undefined) {
            tile.heat = 0;
          }
          if (tile.display_heat !== undefined) {
            tile.display_heat = 0;
          }
        });
      }

      if (ui.stateManager) {
        ui.stateManager.setVar("current_heat", 0);
        ui.stateManager.setVar("total_heat", 0);
      }

      this.clearAllActiveAnimations();

      logger.log('debug', 'ui', 'Reactor heat cleared!');
    } catch (error) {
      logger.log('error', 'ui', 'Error clearing reactor heat:', error);
    }
  }

  pulseReflector(fromTile, toTile) {
    const ui = this.ui;
    try {
      if (!fromTile || !toTile || !ui.gridCanvasRenderer) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const fromRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const toRect = ui.gridCanvasRenderer.getTileRectInContainer(toTile.row, toTile.col, cRect);
      const x1 = fromRect.centerX;
      const y1 = fromRect.centerY;
      const x2 = toRect.centerX;
      const y2 = toRect.centerY;
      const size = 12;
      const aura = document.createElement('div');
      aura.className = 'reflector-aura';
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      aura.style.left = `${x1 - size / 2}px`;
      aura.style.top = `${y1 - size / 2}px`;
      aura.style.width = `${size}px`;
      aura.style.height = `${size}px`;
      aura.style.transform = `rotate(${angle}deg)`;
      container.appendChild(aura);
      requestAnimationFrame(() => aura.classList.add('active'));
      setTimeout(() => aura.remove(), 450);
    } catch (_) {}
  }

  emitEP(fromTile) {
    const ui = this.ui;
    try {
      if (!fromTile || !ui.gridCanvasRenderer) return;
      const container = ui.registry?.get?.("PageInit")?.getReactorBackground?.() ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const startRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const src = 'img/ui/icons/icon_power.png';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'ep';
      img.className = 'tile-fx fx-ep';
      const size = 14;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      const startLeft = startRect.centerX - size / 2;
      const startTop = startRect.centerY - size / 2;
      img.style.left = `${startLeft}px`;
      img.style.top = `${startTop}px`;
      container.appendChild(img);
      const epEl = document.getElementById('info_ep_desktop') || document.getElementById('info_ep');
      const valueEl = document.getElementById('info_ep_value_desktop') || document.getElementById('info_ep_value');
      const targetEl = valueEl || epEl;
      requestAnimationFrame(() => {
        if (targetEl) {
          const tRect = targetEl.getBoundingClientRect();
          const endLeft = tRect.left - cRect.left + tRect.width / 2 - size / 2;
          const endTop = tRect.top - cRect.top + tRect.height / 2 - size / 2;
          img.style.left = `${endLeft}px`;
          img.style.top = `${endTop}px`;
          img.style.opacity = '0.2';
        } else {
          img.classList.add('fx-fade-out');
        }
        setTimeout(() => img.remove(), 550);
      });
    } catch (_) {}
  }
}

export class CopyPasteUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register("CopyPaste", this);
    this._blueprint = null;
  }

  _getBlueprint() {
    if (!this._blueprint && this.ui.game) this._blueprint = new BlueprintService(this.ui.game);
    return this._blueprint;
  }

  init() {
    const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
    const toggleBtn = document.getElementById("reactor_copy_paste_toggle");
    const copyBtn = document.getElementById("reactor_copy_btn");
    const pasteBtn = document.getElementById("reactor_paste_btn");
    const deselectBtn = document.getElementById("reactor_deselect_btn");
    const dropperBtn = document.getElementById("reactor_dropper_btn");
    const modal = document.getElementById("reactor_copy_paste_modal");
    const modalTitle = document.getElementById("reactor_copy_paste_modal_title");
    const modalText = document.getElementById("reactor_copy_paste_text");
    const modalCost = document.getElementById("reactor_copy_paste_cost");
    const closeBtn = document.getElementById("reactor_copy_paste_close_btn");
    const confirmBtn = document.getElementById("reactor_copy_paste_confirm_btn");

    if (toggleBtn && copyPasteBtns) {
      toggleBtn.onclick = () => {
        const uiState = this.ui.uiState;
        if (uiState) uiState.copy_paste_collapsed = !uiState.copy_paste_collapsed;
        else copyPasteBtns.classList.toggle("collapsed");
        if (copyPasteBtns) StorageUtils.set("reactor_copy_paste_collapsed", copyPasteBtns.classList.contains("collapsed"));
      };
    }

    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) return;

    if (deselectBtn) {
      deselectBtn.onclick = () => {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.ui.stateManager.setClickedPart(null);
      };
    }

    if (closeBtn) closeBtn.onclick = () => this.ui.modalOrchestrationUI.hideModal();

    if (dropperBtn) {
      dropperBtn.onclick = () => {
        this.ui._dropperModeActive = !this.ui._dropperModeActive;
        dropperBtn.classList.toggle("on", this.ui._dropperModeActive);
      };
    }

    const refs = { copyBtn, pasteBtn, modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
    const bp = () => this._getBlueprint();
    setupCopyAction(this.ui, bp, refs);
    setupPasteAction(this.ui, bp, refs);
  }

  open(data) {
    if (typeof this.ui._showPasteModalWithData === "function") this.ui._showPasteModalWithData(data ?? "");
  }

  setupCopyStateButton() {
    const ui = this.ui;
    const copyStateBtn = document.getElementById("copy_state_btn");
    if (!copyStateBtn || !ui.uiState || !ui.game?.saveManager) return;
    copyStateBtn.onclick = async () => {
      try {
        const gameStateObject = await ui.game.saveManager.getSaveState();
        const gameStateString = serializeSave(gameStateObject);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(gameStateString);
        ui.uiState.copy_state_feedback = "Copied!";
      } catch (_) {
        ui.uiState.copy_state_feedback = "Error!";
      }
      setTimeout(() => {
        if (ui.uiState) ui.uiState.copy_state_feedback = null;
      }, 2000);
    };
  }

  pasteReactorLayout(layout, options = {}) {
    const ui = this.ui;
    if (!layout || !ui.game || !ui.game.tileset || !ui.game.partset) return;
    ui.game.action_pasteLayout(layout, options);
    ui.gridCanvasRenderer?.markStaticDirty?.();
    ui.coreLoopUI?.runUpdateInterfaceLoop?.();
  }
}

export class SandboxUI {
  constructor(ui) {
    this.ui = ui;
  }

  toggleSandbox() {
    const ui = this.ui;
    if (!ui.game) return;
    ui.game.isSandbox = !ui.game.isSandbox;
    if (ui.game.isSandbox) document.body.classList.add("reactor-sandbox");
    else document.body.classList.remove("reactor-sandbox");
    ui.coreLoopUI?.runUpdateInterfaceLoop?.();
  }

  initializeSandboxUpgradeButtons() {}
}

function getAuthStateForUI() {
  const googleSignedIn = !!(window.googleDriveSave && window.googleDriveSave.isSignedIn);
  const supabaseSignedIn = !!(window.supabaseAuth && window.supabaseAuth.isSignedIn());
  return { googleSignedIn, supabaseSignedIn, isSignedIn: googleSignedIn || supabaseSignedIn };
}

export class UserAccountUI {
  constructor(ui) {
    this.ui = ui;
    this._buttonAbortController = null;
  }

  setupUserAccountButton() {
    const ui = this.ui;
    if (!ui.uiState) return;
    const root = document.getElementById("user_account_btn_root");
    if (!root) return;
    this._buttonAbortController?.abort?.();
    this._buttonAbortController = new AbortController();
    const btn = document.getElementById("user_account_btn");
    if (btn) {
      btn.onclick = () => {
        const { isSignedIn } = getAuthStateForUI();
        if (isSignedIn) ui.modalOrchestrationUI?.showProfileModal?.();
        else ui.modalOrchestrator?.showModal?.(MODAL_IDS.LOGIN);
      };
    }

    const { isSignedIn } = getAuthStateForUI();
    ui.uiState.user_account_display = isSignedIn ? { icon: "👤", title: "Account (Signed In)" } : { icon: "🔐", title: "Sign In" };
  }

  showProfileModal() {}
}

export class PerformanceUI {
  constructor(ui) {
    this.ui = ui;
    this._fpsHistory = [];
    this._tpsHistory = [];
    this._lastFrameTime = performance.now();
    this._lastTickTime = performance.now();
    this._frameCount = 0;
    this._tickCount = 0;
  }

  recordFrame() {
    this._frameCount++;
    const now = performance.now();
    if (now - this._lastFrameTime < 1000) return;
    this._fpsHistory.push(this._frameCount);
    if (this._fpsHistory.length > 10) this._fpsHistory.shift();
    this._frameCount = 0;
    this._lastFrameTime = now;
  }

  recordTick() {
    this._tickCount++;
    const now = performance.now();
    if (now - this._lastTickTime < 1000) return;
    this._tpsHistory.push(this._tickCount);
    if (this._tpsHistory.length > 10) this._tpsHistory.shift();
    this._tickCount = 0;
    this._lastTickTime = now;
  }
}

export class ModalOrchestrationUI {
  constructor(ui) {
    this.ui = ui;
    this._contextModalHandler = null;
  }

  subscribeToContextModalEvents(game) {
    if (!game?.on) return;
    this._contextModalHandler = (payload) => this.ui.modalOrchestrator?.showModal?.(MODAL_IDS.CONTEXT, payload);
    game.on("showContextModal", this._contextModalHandler);
  }

  showChapterCelebration() {}

  hideModal() {
    const ui = this.ui;
    const modal = document.getElementById("reactor_copy_paste_modal");
    if (typeof ui._copyPasteModalReactiveUnmount === "function") {
      try {
        ui._copyPasteModalReactiveUnmount();
      } catch (_) {}
      ui._copyPasteModalReactiveUnmount = null;
    }
    if (modal) modal.classList.add("hidden");

    const prevPauseState = modal?.dataset?.previousPauseState;
    if (prevPauseState != null && ui.stateManager) ui.stateManager.setVar("pause", prevPauseState === "true");
  }
}

export class CoreLoopUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register("CoreLoop", this);
  }

  processUpdateQueue() {
    this._syncDisplayValuesFromState();
    this.applyStateToDom();
  }

  _syncDisplayValuesFromState() {
    const ui = this.ui;
    const game = ui.game;
    if (!game?.state || !ui.displayValues) return;
    const s = game.state;
    const d = ui.displayValues;
    const toNum = (v) => (v != null && typeof v.toNumber === "function" ? v.toNumber() : Number(v ?? 0));
    if (d.money) d.money.target = toNum(s.current_money);
    if (d.heat) d.heat.target = toNum(s.current_heat);
    if (d.power) d.power.target = toNum(s.current_power);
    if (d.ep) d.ep.target = toNum(game.exoticParticleManager?.exotic_particles ?? s.current_exotic_particles ?? 0);
  }

  updateRollingNumbers(dt) {
    const ui = this.ui;
    if (!ui.displayValues) return;
    const lerp = (obj, epsilon = 0.06) => {
      if (!obj || typeof obj.current !== "number" || typeof obj.target !== "number") return;
      const diff = obj.target - obj.current;
      if (Math.abs(diff) < epsilon) obj.current = obj.target;
      else obj.current += diff * Math.min(1, (dt / 1000) * 8);
    };
    lerp(ui.displayValues.money);
    lerp(ui.displayValues.heat);
    lerp(ui.displayValues.power, 0.02);
    lerp(ui.displayValues.ep);
  }

  cacheDOMElements() {
    return true;
  }

  getElement(id) {
    const ui = this.ui;
    if (ui.DOMElements?.[id]) return ui.DOMElements[id];
    const el = document.getElementById(id);
    if (!el) return null;
    ui.DOMElements[id] = el;
    const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    ui.DOMElements[camelCaseKey] = el;
    return el;
  }

  initVarObjsConfig() {
    this.ui.controlDeckUI?.initVarObjsConfig?.();
  }

  getDisplayValue(game, configKey) {
    if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
    return game?.state?.[configKey];
  }

  applyStateToDom() {
    const ui = this.ui;
    const game = ui.game;
    const config = ui.var_objs_config;
    if (!config || !game?.state) return;
    for (const configKey of Object.keys(config)) {
      const val = this.getDisplayValue(game, configKey);
      if (val === undefined) continue;
      const cfg = config[configKey];
      cfg?.onupdate?.(val);
    }
  }

  applyStateToDomForKeys(keys) {
    const ui = this.ui;
    const game = ui.game;
    const config = ui.var_objs_config;
    if (!config || !game) return;
    for (const configKey of keys) {
      const cfg = config[configKey];
      if (!cfg) continue;
      const val = this.getDisplayValue(game, configKey);
      if (val === undefined) continue;
      cfg.onupdate?.(val);
    }
  }

  runUpdateInterfaceLoop(timestamp = 0) {
    const ui = this.ui;
    if (ui._updateLoopStopped) return;
    if (typeof document === "undefined" || !document) return;
    if (typeof document.getElementById !== "function") return;
    if (!ui._lastUiTime) ui._lastUiTime = timestamp;
    const dt = timestamp - ui._lastUiTime;
    ui._lastUiTime = timestamp;

    ui._firstFrameSyncDone = true;

    if (timestamp - ui.last_interface_update > ui.update_interface_interval) {
      ui.last_interface_update = timestamp;
      ui.performanceUI?.recordFrame?.();
      if (ui.gridCanvasRenderer && ui.game) ui.gridCanvasRenderer.render(ui.game);
      ui.navIndicatorsUI?.updateLeaderboardIcon?.();
      ui.heatVisualsUI?.drawHeatFlowOverlay?.();
    }

    ui.update_interface_task = requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  }
}

export function setupKeyboardShortcuts(ui) {
  document.addEventListener("keydown", (e) => {
    if (!ui?.game || !ui.stateManager) return;
    if (!e.ctrlKey) return;
    const k = String(e.key ?? "").toLowerCase();
    if (k !== "e") return;
    e.preventDefault();
    ui.game.markCheatsUsed?.();
    ui.game.grantCheatExoticParticle?.(1);
    const g = ui.game;
    ui.stateManager.setVar("exotic_particles", g.exoticParticleManager?.exotic_particles ?? g.exotic_particles);
    ui.stateManager.setVar("total_exotic_particles", g.state?.total_exotic_particles ?? g.total_exotic_particles);
    ui.stateManager.setVar("current_exotic_particles", g.state?.current_exotic_particles ?? g.current_exotic_particles);
    ui.stateManager?.setVar?.("exotic_particles", g.exoticParticleManager?.exotic_particles ?? g.exotic_particles);
    ui.game.upgradeset?.check_affordability?.(ui.game);
  });
}

export function setupCtrl9Handlers(ui) {
  document.addEventListener("keydown", (e) => {
    if (!ui?.game) return;
    if (!e.ctrlKey) return;
    if (String(e.key ?? "") !== "9") return;
    e.preventDefault();
    ui.startCtrl9MoneyIncrease();
  });
  document.addEventListener("keyup", (e) => {
    if (!ui?.game) return;
    if (!e.ctrlKey) return;
    if (String(e.key ?? "") !== "9") return;
    e.preventDefault();
    ui.stopCtrl9MoneyIncrease();
  });
}

export function startCtrl9MoneyIncrease(ui) {
  if (!ui?.game || ui.ctrl9MoneyInterval) return;
  if (globalThis.__VITEST__) return;
  ui.ctrl9HoldStartTime = Date.now();
  ui.ctrl9HoldTimer = true;
  ui.ctrl9LastTotalAdded = 0;
  ui.ctrl9MoneyInterval = setInterval(() => {
    const elapsedSeconds = (Date.now() - ui.ctrl9HoldStartTime) / 1000;
    const totalAdded = Math.floor(ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, elapsedSeconds));
    const delta = totalAdded - ui.ctrl9LastTotalAdded;
    if (delta > 0) {
      ui.ctrl9LastTotalAdded = totalAdded;
      ui.game.addMoney?.(delta);
      ui.stateManager?.setVar?.("current_money", ui.game.state?.current_money ?? ui.game.current_money);
    }
  }, ui.ctrl9IntervalMs ?? 100);
}

export function stopCtrl9MoneyIncrease(ui) {
  if (ui?.ctrl9MoneyInterval) {
    clearInterval(ui.ctrl9MoneyInterval);
    ui.ctrl9MoneyInterval = null;
  }
  ui.ctrl9HoldTimer = false;
  ui.ctrl9HoldStartTime = null;
  ui.ctrl9LastTotalAdded = 0;
}

export function setupNavListeners(ui) {
  if (!ui?.game) return;
  const handler = (event) => {
    const btn = event.target?.closest?.("[data-page]");
    const pageId = btn?.dataset?.page;
    if (pageId) ui.game.router?.loadPage?.(pageId);
  };
  document.addEventListener("click", handler);
}

export function setupResizeListeners(ui) {
  if (!ui) return;
  window.addEventListener("resize", () => {
    try {
      ui.gridScaler?.resize?.();
      ui.game?.updateBaseDimensions?.();
    } catch (_) {}
  });
}

export const layoutViewTemplate = (layoutJson, stats, game, onClose) => {
  let parsed = null;
  try {
    parsed = typeof layoutJson === "string" ? JSON.parse(layoutJson) : layoutJson;
  } catch (_) {}
  const jsonText = parsed ? JSON.stringify(parsed, null, 2) : "Invalid layout format";
  return layoutViewModalTemplate({ onClose, jsonText, stats });
};

export const quickStartTemplate = (page, onClose, onMoreDetails, onBack) =>
  quickStartOverlayTemplate({ page, onClose, onMoreDetails, onBack });

export class PwaDisplayModeUI {
  constructor(ui) {
    this.ui = ui;
  }
}

export class QuickStartUI {
  constructor(ui) {
    this.ui = ui;
  }

  addHelpButtonToMainPage() {
    const mainTopNav = document.getElementById("main_top_nav");
    if (!mainTopNav) return;
    if (mainTopNav.querySelector("#quick_start_help_button")) return;
    const btn = document.createElement("button");
    btn.id = "quick_start_help_button";
    btn.type = "button";
    btn.className = "hidden";
    btn.title = "Getting Started Guide";
    btn.textContent = "?";
    btn.onclick = () => this.ui.modalOrchestrator?.showModal?.(MODAL_IDS.DETAILED_QUICK_START);
    mainTopNav.appendChild(btn);
  }
}

export class DeviceFeaturesUI {
  constructor(ui) {
    this.ui = ui;
  }

  updateWakeLockState() {}

  toggleFullscreen() {
    if (!document) return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch?.(() => {});
    } else {
      document.exitFullscreen?.().catch?.(() => {});
    }
  }

  updateFullscreenButtonState() {
    const ui = this.ui;
    const btn = ui.coreLoopUI?.getElement?.("fullscreen_toggle") ?? document.getElementById("fullscreen_toggle");
    if (!btn || !ui.uiState) return;
    const title = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
    ui.uiState.fullscreen_display = { icon: "⛶", title };
    btn.title = title;
    btn.textContent = "⛶";
  }

  vibrate(pattern) {
    if (!navigator?.vibrate) return;
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }

  lightVibration() {
    this.vibrate(10);
  }

  heavyVibration() {
    this.vibrate(50);
  }

  doublePulseVibration() {
    this.vibrate([30, 80, 30]);
  }

  meltdownVibration() {
    this.vibrate(200);
  }

  heatRumbleVibration() {
    this.vibrate([80, 40, 80, 40, 80]);
  }
}

export { HeatVisualsUI, GridInteractionUI };
export { ParticleEffectsUI, VisualEventRendererUI } from "./VisualEffectsManager.js";
 

