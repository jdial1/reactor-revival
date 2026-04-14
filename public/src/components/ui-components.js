import { html, render } from "lit-html";
import {
  proxy,
  subscribe,
  BlueprintSchema,
  LegacyGridSchema,
  setDecimal,
  updateDecimal,
  patchGameState,
  preferences,
  subscribeKey,
  previewBlueprintPlannerStats,
  actions,
} from "../store.js";
import { repeat, styleMap, numFormat as fmt, formatNumberCompactIntl, logger, classMap, StorageUtils, serializeSave, escapeHtml, unsafeHTML, toNumber, formatTime, getPartImagePath, toDecimal, MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, BaseComponent, when, runCathodeScramble, cancelCathodeScramble, vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent } from "../utils.js";
import { runCheckAffordability, calculateSectionCounts } from "../logic.js";
import { UpgradeCard, CloseButton, PartButton, partsModuleInfoCardTemplate } from "./button-factory.js";
import { MODAL_IDS } from "./ui-modals.js";
import { ReactiveLitComponent } from "./reactive-lit-component.js";
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
  sectionCountTextTemplate,
  plainTextTemplate,
  quickSelectSlotTemplate,
  decompressionSavedToastTemplate,
} from "../templates/uiComponentsTemplates.js";

const VENTING_ANIM_MS = 400;
const INFO_BAR_CATHODE_IDS = ["info_money_desktop", "info_money", "info_ep_value_desktop", "info_ep_value"];

function formatSimulationTickLine(game) {
  if (!game) return "—";
  const period = (game.loop_wait || 1000) / 1000;
  const periodStr = period >= 10 ? period.toFixed(1) : period.toFixed(2);
  const n = game.engine?.tick_count ?? 0;
  return `${periodStr}s #${n}`;
}

export function getUiElement(ui, id) {
  if (!ui || typeof document === "undefined") return null;
  if (ui.DOMElements?.[id]) return ui.DOMElements[id];
  const el = document.getElementById(id);
  if (!el) return null;
  if (!ui.DOMElements) ui.DOMElements = {};
  ui.DOMElements[id] = el;
  const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
  ui.DOMElements[camelCaseKey] = el;
  return el;
}

export function cacheDomElements(_ui, _pageId) {
  return true;
}

export function getPageReactor(ui) {
  return getUiElement(ui, "reactor") ?? document.getElementById("reactor");
}

export function getPageReactorWrapper(ui) {
  return getUiElement(ui, "reactor_wrapper") ?? document.getElementById("reactor_wrapper");
}

export function getPageReactorBackground(ui) {
  return getUiElement(ui, "reactor_background") ?? document.getElementById("reactor_background");
}

function formatArchitectMetricsLine(state) {
  const p = fmt(toNumber(state.stats_power ?? 0), 0);
  const h = fmt(toNumber(state.stats_heat_generation ?? 0), 0);
  const v = fmt(toNumber(state.stats_vent ?? 0), 0);
  const maxH = toNumber(state.max_heat ?? 0);
  const cur = toNumber(state.current_heat ?? 0);
  const hullPct = maxH > 0 ? (cur / maxH) * 100 : 0;
  const hullStr = `${fmt(hullPct, 1)}%`;
  return `P/t ${p} · H/t ${h} · V ${v} · Hull ${hullStr}`;
}

function resetInfoBarCathodeState(ui) {
  ui._cathodeInfoBarFirst = Object.fromEntries(INFO_BAR_CATHODE_IDS.map((id) => [id, true]));
  ui._cathodeInfoBarLast = {};
  ui._cathodeInfoBarTargets = null;
}

function infoBarCathodeAfterRender(ui) {
  const targets = ui._cathodeInfoBarTargets;
  if (!targets) return;
  for (const id of INFO_BAR_CATHODE_IDS) {
    const el = document.getElementById(id);
    const text = targets[id];
    if (!el || typeof text !== "string") continue;
    if (ui._cathodeInfoBarFirst[id]) {
      ui._cathodeInfoBarFirst[id] = false;
      el.textContent = text;
      ui._cathodeInfoBarLast[id] = text;
      continue;
    }
    if (ui._cathodeInfoBarLast[id] === text) continue;
    ui._cathodeInfoBarLast[id] = text;
    runCathodeScramble(el, text, { durationMs: 150 });
  }
}

function buildInfoBarTemplate(ui, state) {
  const power = toNumber(state.current_power);
  const heat = toNumber(state.current_heat);
  const maxP = toNumber(state.max_power) || 1;
  const maxH = toNumber(state.max_heat) || 1;

  const pBar = getBarVisuals(power, maxP, "--fill-height", "vu");
  const hBar = getBarVisuals(heat, maxH, "--fill-height", "heatVu");

  const meltdown = !!state.melting_down;
  const powerClass = classMap({ "info-item": true, power: true, full: pBar.isFull, meltdown });
  const heatClass = classMap({ "info-item": true, heat: true, full: hBar.isFull, meltdown, "heat-led-warning": hBar.isWarning });
  const moneyDisplay = meltdown ? "☢️" : `$${formatNumberCompactIntl(state.current_money ?? 0)}`;
  const moneyDisplayMobile = meltdown ? "☢️" : formatNumberCompactIntl(state.current_money ?? 0);

  const activeBuffs = state.active_buffs ?? [];

  const epVisible = toNumber(state.current_exotic_particles) > 0;
  const epContentStyle = styleMap({ display: epVisible ? "flex" : "none" });
  const epText = formatNumberCompactIntl(state.current_exotic_particles ?? 0);
  ui._cathodeInfoBarTargets = {
    info_money_desktop: moneyDisplay,
    info_money: moneyDisplayMobile,
    info_ep_value_desktop: epText,
    info_ep_value: epText,
  };

  return infoBarTemplate({
    powerClass,
    heatClass,
    powerBarStyle: pBar.style,
    heatBarStyle: hBar.style,
    powerTextDesktop: fmt(power, 2),
    powerTextMobile: fmt(power, 0),
    maxPowerDesktop: fmt(maxP, 2),
    maxPowerMobile: fmt(maxP),
    heatTextDesktop: fmt(heat, 2),
    heatTextMobile: fmt(heat, 0),
    maxHeatDesktop: fmt(maxH, 2),
    maxHeatMobile: fmt(maxH),
    epContentStyle,
    epVisible,
    activeBuffs,
  });
}

export function teardownInfoBar(ui) {
  if (ui._infoBarUnmount) {
    INFO_BAR_CATHODE_IDS.forEach((id) => cancelCathodeScramble(document.getElementById(id)));
    try { ui._infoBarUnmount(); } catch (_) {}
    ui._infoBarUnmount = null;
  }
  if (ui._infoBarAbortController) {
    ui._infoBarAbortController.abort();
    ui._infoBarAbortController = null;
  }
}

export function mountInfoBar(ui) {
  const root = document.getElementById("info_bar_root");
  if (!root || !ui.game?.state) return;

  teardownInfoBar(ui);
  resetInfoBarCathodeState(ui);
  ui._infoBarAbortController = new AbortController();
  const signal = ui._infoBarAbortController.signal;

  const subscriptions = [{
    state: ui.game.state,
    keys: ["current_power", "max_power", "current_heat", "max_heat", "current_money", "current_exotic_particles", "active_buffs", "melting_down", "power_net_change", "heat_net_change", "stats_power", "stats_net_heat"],
  }];
  ui._infoBarUnmount = ReactiveLitComponent.mountMulti(
    subscriptions,
    () => buildInfoBarTemplate(ui, ui.game.state),
    root,
    () => infoBarCathodeAfterRender(ui)
  );

  document.getElementById("control_deck_build_fab")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePartsPanelForBuildButton(ui);
  }, { signal });

  ui._unmounts.push(() => teardownInfoBar(ui));
}

function getPartsSectionElement(ui) {
  return getUiElement(ui, "parts_section") ?? document.getElementById("parts_section");
}

export function updatePartsPanelBodyClass(ui) {
  const partsSection = getPartsSectionElement(ui);
  const collapsed = ui.uiState?.parts_panel_collapsed ?? partsSection?.classList.contains("collapsed");
  document.body.classList.toggle("parts-panel-open", !!(partsSection && !collapsed));
  document.body.classList.toggle("parts-panel-right", !!partsSection?.classList.contains("right-side"));
  logger.log("debug", "ui", "[updatePartsPanelBodyClass] Panel collapsed:", collapsed, "Body classes:", document.body.className);
}

export function togglePartsPanelForBuildButton(ui) {
  ui.deviceFeatures?.heavyVibration?.();
  if (ui.game) actions.enqueueEffect(ui.game, { kind: "sfx", id: "metal_clank", a: 0.8, b: -0.7, context: "global" });
  const partsSection = getPartsSectionElement(ui);
  if (partsSection && ui.uiState) {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile) {
      ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
      updatePartsPanelBodyClass(ui);
      void partsSection.offsetHeight;
    } else {
      ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
      updatePartsPanelBodyClass(ui);
    }
  } else if (partsSection) {
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile) {
      partsSection.classList.toggle("collapsed");
      updatePartsPanelBodyClass(ui);
      void partsSection.offsetHeight;
    }
  }
}

const PERCENT_FULL = 100;
const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

function getBarVisuals(current, max, cssVarHeight, layer) {
  const rawPct = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
  const isFull = max > 0 && current >= max;
  const quant = vuQuantizePercent(rawPct, isFull);
  const lit = vuLitFromPercent(rawPct, isFull);
  const ratio = max > 0 ? current / max : 0;
  const isWarning = ratio >= 0.8;
  const styleObj = { [cssVarHeight]: `${quant}%` };
  if (layer === "vu" || layer === "heatVu") {
    styleObj["--vu-lit"] = String(lit);
  }
  if (layer === "heatVu") {
    styleObj["--vu-red-width"] = vuHeatRedWidthPercent(lit, isWarning);
  }
  return { isFull, isWarning, quant, lit, style: styleMap(styleObj) };
}

function buildMobileControlDeckTemplate(ui, state) {
  const maxPower = toNumber(state.max_power ?? 0);
  const maxHeat = toNumber(state.max_heat ?? 0);
  const powerCurrent = toNumber(state.current_power ?? 0);
  const heatCurrent = toNumber(state.current_heat ?? 0);

  const pBar = getBarVisuals(powerCurrent, maxPower, "--power-fill-height", "height");
  const hBar = getBarVisuals(heatCurrent, maxHeat, "--heat-fill-height", "height");

  const heatHazard = hBar.quant >= HAZARD_FILL_PERCENT;
  const heatCritical = hBar.quant > CRITICAL_FILL_PERCENT;

  const powerDelta = state.power_net_change ?? 0;
  const heatDelta = state.heat_net_change ?? 0;
  const powerRateText = powerDelta === 0 ? "0" : (powerDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(powerDelta), 0);
  const heatRateText = heatDelta === 0 ? "0" : (heatDelta > 0 ? "\u2191" : "\u2193") + fmt(Math.abs(heatDelta), 0);

  const autoSellEnabled = !!state.auto_sell;
  const multiplier = toNumber(state.auto_sell_multiplier ?? 0);
  const hasAutoSellUpgrade = ui.game?.upgradeset?.getUpgrade("auto_sell_operator")?.level > 0;
  const showAutoSell = autoSellEnabled && multiplier > 0 && hasAutoSellUpgrade;
  const autoSellRate = showAutoSell ? Math.floor(maxPower * multiplier) : 0;

  const hasHeatControlUpgrade = ui.game?.upgradeset?.getUpgrade("heat_control_operator")?.level > 0;
  const heatControlEnabled = !!state.heat_controlled && hasHeatControlUpgrade;
  const showHeatRate = heatControlEnabled && maxHeat > 0;
  const ventBonus = toNumber(state.vent_multiplier_eff ?? 0);
  const autoHeatRate = showHeatRate ? (maxHeat / REACTOR_HEAT_STANDARD_DIVISOR) * (1 + ventBonus / VENT_BONUS_PERCENT_DIVISOR) : 0;

  const heatVentClass = classMap({ "control-deck-item": true, "heat-vent": true, hazard: heatHazard, critical: heatCritical });
  const powerCapacitorClass = classMap({ "control-deck-item": true, "power-capacitor": true, "auto-sell-active": autoSellEnabled });

  const autoSellRateContent = showAutoSell ? html`<img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="$">${fmt(autoSellRate, 0)}` : "";
  const autoHeatRateContent = showHeatRate ? html`<img src="img/ui/icons/icon_heat.png" class="icon-inline" alt="heat">\u2193${fmt(Math.round(autoHeatRate), 0)}` : "";
  const autoRateClass = classMap({ "control-deck-auto-rate": true, visible: showAutoSell });
  const autoHeatRateClass = classMap({ "control-deck-auto-rate": true, visible: showHeatRate });

  return mobileControlDeckTemplate({
    powerCapacitorClass,
    heatVentClass,
    powerRateText,
    heatRateText,
    autoRateClass,
    autoHeatRateClass,
    autoSellRateContent,
    autoHeatRateContent,
    powerFillStyle: pBar.style,
    heatFillStyle: hBar.style,
    architectMetricsText: formatArchitectMetricsLine(state),
    tickCadenceText: formatSimulationTickLine(ui.game),
    powerCurrentText: fmt(powerCurrent, 0),
    heatCurrentText: fmt(heatCurrent, 0),
    maxPowerText: maxPower ? fmt(maxPower, 0) : "",
    maxHeatText: maxHeat ? fmt(maxHeat, 0) : "",
    moneyValueText: state.melting_down ? "\u2622\uFE0F" : formatNumberCompactIntl(state.current_money ?? 0),
  });
}

function buildMobilePassiveBarTemplate(state) {
  return mobilePassiveBarTemplate({
    epText: formatNumberCompactIntl(state.current_exotic_particles ?? 0),
    moneyText: state.melting_down ? "\u2622\uFE0F" : formatNumberCompactIntl(state.current_money ?? 0),
    pauseClass: classMap({ "passive-top-pause": true, paused: !!state.pause }),
    pauseAriaLabel: state.pause ? "Resume" : "Pause",
    pauseTitle: state.pause ? "Resume" : "Pause",
  });
}

function ensureMobileControlDeckListeners(ui) {
  if (ui._mobileTickLineUpdateControlDeck) return;
  ui._mobileTickLineUpdateControlDeck = () => {
    const el = document.getElementById("control_deck_tick_line");
    const g = ui.game;
    if (el && g) el.textContent = formatSimulationTickLine(g);
  };
  ui._mobileControlDeckStatePatchHandler = (patch) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, "loop_wait")) {
      ui._mobileTickLineUpdateControlDeck();
    }
  };
}

export function mountMobilePassiveBar(ui) {
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobilePassiveBarMounted || !ui.game?.state) return;

  const passiveBar = document.getElementById("mobile_passive_top_bar");
  if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
  const root = document.getElementById("mobile_passive_root");
  if (!root) return;

  const subscriptions = [{
    state: ui.game.state,
    keys: ["current_exotic_particles", "current_money", "pause", "melting_down"],
  }];
  const unmountPassive = ReactiveLitComponent.mountMulti(subscriptions, () => buildMobilePassiveBarTemplate(ui.game.state), root);
  ui._mobilePassiveBarMounted = true;
  ui._unmounts.push(() => {
    unmountPassive();
    ui._mobilePassiveBarMounted = false;
  });
}

export function syncMobileControlDeckMounts(ui) {
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobileControlDeckReactiveMounted || !ui.game?.state) return;

  const root = document.getElementById("control_deck_root");
  if (!root) return;

  ensureMobileControlDeckListeners(ui);

  const subscriptions = [{
    state: ui.game.state,
    keys: [
      "max_power", "max_heat", "current_power", "current_heat",
      "power_net_change", "heat_net_change", "stats_power", "stats_net_heat",
      "stats_heat_generation", "stats_vent",
      "auto_sell", "auto_sell_multiplier", "heat_controlled", "vent_multiplier_eff",
      "current_money", "melting_down",
    ],
  }];
  const innerUnmount = ReactiveLitComponent.mountMulti(subscriptions, () => buildMobileControlDeckTemplate(ui, ui.game.state), root);
  const g = ui.game;
  if (!ui._mobileControlDeckTickListenersAttached && g?.on) {
    ui._mobileControlDeckTickListenersAttached = true;
    g.on("tickRecorded", ui._mobileTickLineUpdateControlDeck);
    g.on("statePatch", ui._mobileControlDeckStatePatchHandler);
  }
  ui._mobileTickLineUpdateControlDeck();
  ui._mobileControlDeckReactiveMounted = true;
  ui._unmounts.push(() => {
    innerUnmount();
    if (ui._mobileControlDeckTickListenersAttached && ui.game?.off) {
      ui.game.off("tickRecorded", ui._mobileTickLineUpdateControlDeck);
      ui.game.off("statePatch", ui._mobileControlDeckStatePatchHandler);
      ui._mobileControlDeckTickListenersAttached = false;
    }
    ui._mobileControlDeckReactiveMounted = false;
  });
  mountMobilePassiveBar(ui);
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
      if (status === "offline") {
        return leaderboardStatusRowTemplate({ text: "Leaderboard unavailable. Try again later." });
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
      const st = leaderboardService.getStatus();
      if (st.state === "open") {
        render(leaderboardTemplate([], "offline", sortBy), container);
        sortButtons.forEach((b) => {
          b.disabled = true;
          b.style.opacity = "0.5";
        });
        return;
      }
      sortButtons.forEach((b) => {
        b.disabled = false;
        b.style.opacity = "";
      });
      const records = await leaderboardService.getTopRuns(sortBy, 20);
      render(leaderboardTemplate(records, "loaded", sortBy), container);
      updateLeaderboardIcon(ui);
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
      if (!sound || !ui.game) return;
      if (sound === "warning") {
        const intensity = warningSlider ? Number(warningSlider.value) / 100 : 0.5;
        actions.enqueueEffect(ui.game, { kind: "sfx", id: "warning", intensity, context: "global" });
        return;
      }
      if (sound === "explosion") {
        const subtype = button.dataset.variant === "meltdown" ? "meltdown" : null;
        actions.enqueueEffect(ui.game, { kind: "sfx", id: "explosion", subtype, pan: 0, context: "global" });
        return;
      }
      const subtype = button.dataset.subtype || null;
      actions.enqueueEffect(ui.game, { kind: "sfx", id: sound, a: subtype, b: undefined, context: "global" });
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
      const reactorSection = document.getElementById("reactor_section");
      const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
      const copyPasteToggle = document.getElementById("reactor_copy_paste_toggle");
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
        if (copyPasteBtns && reactorSection && reactorWrapper && copyPasteBtns.parentElement === reactorWrapper) {
          reactorSection.insertBefore(copyPasteBtns, reactorWrapper);
        }
        const isCollapsed = ui?.uiState?.copy_paste_collapsed === true || copyPasteBtns?.classList.contains("collapsed");
        if (isCollapsed && copyPasteToggle) {
          copyPasteToggle.style.display = "inline-flex";
          copyPasteToggle.style.visibility = "visible";
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
        if (copyPasteToggle) {
          copyPasteToggle.style.removeProperty("display");
          copyPasteToggle.style.removeProperty("visibility");
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

export function unlockAllPartsForTesting(ui) {
  if (!ui.game?.partset?.partsArray) return;
  const typeLevelCombos = new Set();
  ui.game.partset.partsArray.forEach((part) => {
    if (part.type && part.level) {
      typeLevelCombos.add(`${part.type}:${part.level}`);
    }
  });
  typeLevelCombos.forEach((combo) => {
    ui.game.placedCounts[combo] = 10;
  });
  ui.game.partset.check_affordability(ui.game);
  refreshPartsPanel(ui);
}

export function refreshPartsPanel(ui) {
  if (ui.game?.state && typeof ui.game.state.parts_panel_version === "number") {
    ui.game.state.parts_panel_version++;
  }
}

export function onPartsPanelActiveTabChanged(ui, _tabId) {
  refreshPartsPanel(ui);
}

function createPartTemplateHandlers(ui, partset, unlockManager, selectedPartId) {
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

function buildPartsTabContent(ui, partset, unlockManager, activeTab, powerActive, heatActive) {
  if (!partset) return partsPanelEmptyTabContentTemplate();
  const byContainer = getPartsByContainer(partset, activeTab, unlockManager);
  const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
  const partTemplate = createPartTemplateHandlers(ui, partset, unlockManager, selectedPartId);
  const grid = (id) => html`<div id=${id} class="item-grid">${repeat(byContainer.get(id) ?? [], (p) => p.id, partTemplate)}</div>`;
  return partsPanelTabContentTemplate({ powerActive, heatActive, grid });
}

function buildPartsPanelLayoutTemplate(ui, uiState) {
  const game = ui.game;
  const partset = game?.partset;
  const unlockManager = game?.unlockManager;
  const activeTab = uiState?.active_parts_tab ?? "power";
  const switchTab = (tabId) => { if (ui.uiState) ui.uiState.active_parts_tab = tabId; };
  const onHelpToggle = () => {
    ui.setHelpModeActive(!ui.help_mode_active);
    refreshPartsPanel(ui);
  };
  const powerActive = activeTab === "power";
  const heatActive = activeTab === "heat";
  const tabContent = buildPartsTabContent(ui, partset, unlockManager, activeTab, powerActive, heatActive);

  const selectedPartId = uiState?.interaction?.selectedPartId ?? null;
  const selPart = selectedPartId && partset ? partset.getPartById(selectedPartId) : null;
  const moduleInfoContent = selPart
    ? partsModuleInfoCardTemplate(selPart)
    : html`<span class="parts-module-info-empty">— Select a module —</span>`;

  return partsPanelLayoutTemplate({
    powerActive,
    heatActive,
    helpModeActive: ui.help_mode_active,
    onSwitchPower: () => switchTab("power"),
    onSwitchHeat: () => switchTab("heat"),
    onHelpToggle,
    tabContent,
    moduleInfoContent,
  });
}

export function setupPartsTabs(ui) {
  const root = document.getElementById("parts_panel_reactive_root");
  if (!root || !ui.uiState) return;
  const subscriptions = [
    { state: ui.game?.state, keys: ["current_money", "current_exotic_particles", "parts_panel_version"] },
    { state: ui.uiState, keys: ["active_parts_tab", "parts_panel_collapsed"] },
    { state: ui.uiState?.interaction, keys: ["selectedPartId"] },
  ].filter((s) => s.state != null);
  if (subscriptions.length === 0) return;
  const renderFn = () => buildPartsPanelLayoutTemplate(ui, ui.uiState);
  ui._unmounts.push(ReactiveLitComponent.mountMulti(subscriptions, renderFn, root));
}

export function updateQuickSelectSlots(ui) {
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

export function closePartsPanel(ui) {
  const panel = getPartsSectionElement(ui);
  if (!panel) return;
  if (ui.uiState) ui.uiState.parts_panel_collapsed = true;
  else panel.classList.add("collapsed");
  updatePartsPanelBodyClass(ui);
}

export function initializePartsPanel(ui) {
  const panel = getPartsSectionElement(ui);
  if (!panel) return;

  if (ui._partsPanelResizeHandler) window.removeEventListener("resize", ui._partsPanelResizeHandler);
  ui._partsPanelResizeHandler = () => {
    const isCurrentlyMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (ui.uiState) ui.uiState.parts_panel_collapsed = isCurrentlyMobile;
    else panel.classList.toggle("collapsed", isCurrentlyMobile);
    updatePartsPanelBodyClass(ui);
  };
  window.addEventListener("resize", ui._partsPanelResizeHandler);

  const isMobileOnLoad = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  if (ui.uiState) ui.uiState.parts_panel_collapsed = isMobileOnLoad;
  panel.classList.toggle("collapsed", ui.uiState?.parts_panel_collapsed ?? isMobileOnLoad);
  logger.log("debug", "ui", "[Parts Panel Init]", isMobileOnLoad ? "Mobile detected - added collapsed class" : "Desktop detected - removed collapsed class");
  logger.log("debug", "ui", "[Parts Panel Init] Final state - collapsed:", panel.classList.contains("collapsed"));
  updatePartsPanelBodyClass(ui);

  const closeBtn = document.getElementById("parts_close_btn");
  if (closeBtn && !closeBtn.hasAttribute("data-listener-attached")) {
    closeBtn.setAttribute("data-listener-attached", "true");
    closeBtn.addEventListener("click", () => {
      closePartsPanel(ui);
    });
  }

  ui.stateManager.updatePartsPanelToggleIcon(null);
}

export function setupPartsPanel(ui) {
  setupPartsTabs(ui);
  initializePartsPanel(ui);
}


export function clearPageReactor(ui) {
  const reactor = getPageReactor(ui);
  if (reactor) reactor.innerHTML = "";
}

export function setPageGridContainer(ui, container) {
  if (ui.gridCanvasRenderer) ui.gridCanvasRenderer.setContainer(container);
}

export function setPageReactorVisibility(ui, visible) {
  const reactor = getPageReactor(ui);
  if (reactor) reactor.style.visibility = visible ? "visible" : "hidden";
}

export function setupResearchCollapsibleSections(ui) {
  if (ui._researchCollapsibleSetup) return;
  ui._researchCollapsibleSetup = true;
  const section = document.getElementById("experimental_upgrades_section");
  if (!section) return;
  section.addEventListener("click", (e) => {
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    const article = header.closest(".research-collapsible");
    if (!article) return;
    e.preventDefault();
    const collapsed = article.classList.toggle("section-collapsed");
    header.setAttribute("aria-expanded", String(!collapsed));
  });
  section.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const header = e.target.closest(".research-section-header");
    if (!header) return;
    e.preventDefault();
    header.click();
  });
  const coverWrap = document.querySelector(".refund-safety-cover-wrap");
  const coverBtn = document.getElementById("refund_safety_cover");
  if (coverBtn && coverWrap) {
    coverBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      coverWrap.classList.toggle("cover-open");
    });
  }
  const rebootBtn = document.getElementById("reboot_btn");
  const refundBtn = document.getElementById("refund_btn");
  const orchestrator = ui.modalOrchestrator;
  if (rebootBtn) {
    rebootBtn.addEventListener("click", (e) => {
      if (!coverWrap?.classList.contains("cover-open")) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        orchestrator?.showPrestigeModal?.("refund");
      }
    });
  }
  if (refundBtn) {
    refundBtn.addEventListener("click", () => {
      orchestrator?.showPrestigeModal?.("prestige");
    });
  }
}

export function setupVersionDisplayForPage(ui) {
  if (!ui?.uiState || ui._versionDisplayMounted) return;
  const aboutEl = document.getElementById("about_version");
  const appEl = document.getElementById("app_version");
  const renderVersion = (el) => {
    if (!el?.isConnected) return;
    ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["version_display"] }],
      () => html`${ui.uiState?.version_display?.app ?? ui.uiState?.version_display?.about ?? ""}`,
      el
    );
  };
  if (aboutEl) renderVersion(aboutEl);
  if (appEl && appEl !== aboutEl) renderVersion(appEl);
  ui._versionDisplayMounted = true;
}

export async function loadAndSetVersionForPage(ui) {
  try {
    const { getResourceUrl } = await import("../utils.js");
    const response = await fetch(getResourceUrl("version.json"));

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
        throw new Error("HTML response received (likely 404 fallback)");
      }
      throw new Error(`Expected JSON but got ${contentType || "unknown content type"}`);
    }

    const versionData = await response.json();
    const version = versionData.version || "Unknown";
    ui._cachedVersion = version;

    if (ui?.uiState) {
      ui.uiState.version_display = { ...ui.uiState.version_display, app: version, about: version };
    }
  } catch (error) {
    if (!error.message || !error.message.includes("Expected JSON")) {
      logger.log("warn", "ui", "Could not load version info:", error.message || error);
    }
    if (ui?.uiState) {
      ui.uiState.version_display = { ...ui.uiState.version_display, app: "Unknown", about: "Unknown" };
    }
  }
}

export function initializePage(ui, pageId) {
  const game = ui.game;
  cacheDomElements(ui, pageId);

  if (pageId === "reactor_section") {
    initControlDeckVarObjs(ui);
    const pauseCfg = ui.var_objs_config?.pause;
    const paused = !!ui.game?.state?.pause;
    if (pauseCfg?.onupdate) pauseCfg.onupdate(paused);
  }

  switch (pageId) {
    case "reactor_section": {
      const reactor = getPageReactor(ui);
      logger.log("debug", "ui", "[PageInit] reactor_section init start", {
        hasGridScaler: !!ui.gridScaler,
        hasWrapper: !!ui.gridScaler?.wrapper,
        hasReactor: !!reactor,
        hasGridRenderer: !!ui.gridCanvasRenderer,
        hasGame: !!ui.game,
        hasTileset: !!ui.game?.tileset,
      });
      if (ui.gridScaler && !ui.gridScaler.wrapper) {
        ui.gridScaler.init();
      }
      if (reactor) {
        clearPageReactor(ui);
        if (ui.gridCanvasRenderer) {
          ui.gridCanvasRenderer.init(reactor);
        }
      }

      ui.inputHandler.setupReactorEventListeners();
      ui.inputHandler.setupSegmentHighlight();
      ui.gridScaler.resize();
      const container = getPageReactorWrapper(ui) || getPageReactorBackground(ui);
      setPageGridContainer(ui, container);
      if (ui.game?.tileset) {
        ui.game.tileset.updateActiveTiles();
      }
      if (ui.gridCanvasRenderer && ui.game) {
        ui.gridCanvasRenderer.render(ui.game);
      }
      logger.log("debug", "ui", "[PageInit] reactor_section init done");
      ui.initializeCopyPasteUI();
      ui.pageSetupUI.setupMobileTopBar();
      ui.pageSetupUI.setupMobileTopBarResizeListener();
      break;
    }
    case "upgrades_section":
      ui.pageSetupUI.setupAffordabilityBanners("upgrades_no_affordable_banner");
      if (!ui._sectionCountsMountedUpgrades && document.getElementById("upgrades_content_wrapper")) {
        ui._unmounts.push(mountSectionCountsReactive(ui, "upgrades_content_wrapper"));
        ui._sectionCountsMountedUpgrades = true;
      }
      if (game?.upgradeset) updateSectionCountsState(ui, game);
      requestAnimationFrame(() => {
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateUpgrades === "function"
        ) {
          game.upgradeset.populateUpgrades();
        } else {
          logger.log("warn", "ui", "upgradeset.populateUpgrades is not a function or upgradeset missing");
        }
      });
      break;
    case "experimental_upgrades_section":
      mountExoticParticlesDisplayIfNeeded(ui);
      ui.pageSetupUI.setupAffordabilityBanners("research_no_affordable_banner");
      if (!ui._sectionCountsMountedResearch && document.getElementById("experimental_upgrades_content_wrapper")) {
        ui._unmounts.push(mountSectionCountsReactive(ui, "experimental_upgrades_content_wrapper"));
        ui._sectionCountsMountedResearch = true;
      }
      if (game?.upgradeset) updateSectionCountsState(ui, game);
      if (
        game.upgradeset &&
        typeof game.upgradeset.populateExperimentalUpgrades === "function"
      ) {
        game.upgradeset.populateExperimentalUpgrades();
      } else {
        logger.log("warn", "ui", "upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing");
      }
      setupResearchCollapsibleSections(ui);
      void loadAndSetVersionForPage(ui);
      ui.setupUpgradeCardHoverBuzz();
      break;
    case "about_section":
      setupVersionDisplayForPage(ui);
      if (!ui.uiState?.version_display?.app) void loadAndSetVersionForPage(ui);
      break;
    case "leaderboard_section":
      ui.pageSetupUI.setupLeaderboardPage();
      break;
    case "soundboard_section":
      ui.pageSetupUI.setupSoundboardPage();
      break;
    default:
      break;
  }

  ui.objectivesUI.showObjectivesForPage(pageId);
}

function controlDeckExoticParticlesRenderTemplate(state) {
  return controlDeckExoticParticlesTemplate({
    currentEp: fmt(state.current_exotic_particles ?? 0),
    totalEp: fmt(state.total_exotic_particles ?? 0),
  });
}

export function mountExoticParticlesDisplayIfNeeded(ui) {
  if (ui._controlDeckEpComponent) return;
  const epRoot = document.getElementById("exotic_particles_display");
  if (!epRoot || !ui.game?.state) return;
  ui._controlDeckEpComponent = new ReactiveLitComponent(
    ui.game.state,
    ["current_exotic_particles", "total_exotic_particles"],
    (state) => controlDeckExoticParticlesRenderTemplate(state),
    epRoot
  );
  ui._unmounts.push(ui._controlDeckEpComponent.mount());
}

function mountStatsBarReactive(ui) {
  const root = document.getElementById("reactor_stats");
  if (!root || !ui.game?.state) return;
  const state = ui.game.state;
  render(controlDeckStatsBarTemplate(), root);
  const ventEl = document.getElementById("stats_vent");
  const powerEl = document.getElementById("stats_power");
  const heatEl = document.getElementById("stats_heat");
  const hullEl = document.getElementById("stats_hull");
  const last = { vent: null, power: null, heat: null, hull: null };
  const first = { vent: true, power: true, heat: true, hull: true };
  const sync = () => {
    const v = fmt(state.stats_vent ?? 0, 0);
    const p = fmt(state.stats_power ?? 0, 0);
    const h = fmt(state.stats_heat_generation ?? 0, 0);
    const maxH = toNumber(state.max_heat ?? 0);
    const cur = toNumber(state.current_heat ?? 0);
    const hullPct = maxH > 0 ? (cur / maxH) * 100 : 0;
    const hullText = `${fmt(hullPct, 1)}%`;
    const apply = (el, key, text) => {
      if (!el) return;
      if (first[key]) {
        el.textContent = text;
        first[key] = false;
        last[key] = text;
        return;
      }
      if (last[key] === text) return;
      last[key] = text;
      runCathodeScramble(el, text, { durationMs: 150 });
    };
    apply(ventEl, "vent", v);
    apply(powerEl, "power", p);
    apply(heatEl, "heat", h);
    apply(hullEl, "hull", hullText);
  };
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      sync();
    });
  };
  const unsubs = [
    subscribeKey(state, "stats_vent", schedule),
    subscribeKey(state, "stats_power", schedule),
    subscribeKey(state, "stats_heat_generation", schedule),
    subscribeKey(state, "current_heat", schedule),
    subscribeKey(state, "max_heat", schedule),
  ];
  sync();
  ui._unmounts.push(() => {
    unsubs.forEach((u) => { try { u(); } catch (_) {} });
    [ventEl, powerEl, heatEl, hullEl].forEach((el) => cancelCathodeScramble(el));
  });
  mountExoticParticlesDisplayIfNeeded(ui);
}

function mountEngineStatusReactive(ui) {
  const root = document.getElementById("engine_status_indicator_root");
  if (!root || !ui.game?.state) return;
  const renderFn = (state) => {
    const statusClass = classMap({
      "engine-running": state.engine_status === "running",
      "engine-paused": state.engine_status === "paused",
      "engine-stopped": state.engine_status === "stopped",
      "engine-tick": state.engine_status === "tick",
      "engine-simulation-error": state.engine_status === "simulation_error",
    });
    return engineStatusIndicatorTemplate({ statusClass });
  };
  ui._engineStatusComponent = new ReactiveLitComponent(
    ui.game.state,
    ["engine_status", "simulation_error_message"],
    renderFn,
    root
  );
  ui._unmounts.push(ui._engineStatusComponent.mount());
}

function mountTickCadenceNav(ui) {
  if (typeof ui._tickCadenceNavUnmount === "function") {
    ui._tickCadenceNavUnmount();
    ui._tickCadenceNavUnmount = null;
  }
  const el = document.getElementById("tps_display");
  if (!el || !ui.game?.on) return;
  const update = () => {
    el.textContent = formatSimulationTickLine(ui.game);
  };
  update();
  ui.game.on("tickRecorded", update);
  const onPatch = (patch) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, "loop_wait")) update();
  };
  ui.game.on("statePatch", onPatch);
  ui._tickCadenceNavUnmount = () => {
    ui.game.off("tickRecorded", update);
    ui.game.off("statePatch", onPatch);
  };
  if (!ui._tickCadenceNavCleanupRegistered) {
    ui._tickCadenceNavCleanupRegistered = true;
    ui._unmounts.push(() => {
      if (typeof ui._tickCadenceNavUnmount === "function") {
        ui._tickCadenceNavUnmount();
        ui._tickCadenceNavUnmount = null;
      }
    });
  }
}

export function initControlDeckVarObjs(ui) {
  mountStatsBarReactive(ui);
  mountEngineStatusReactive(ui);
  mountTickCadenceNav(ui);
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
            ui.game.state.engine_status = "paused";
          } else {
            ui.game.engine.start();
            ui.game.state.engine_status = "running";
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

function buildControlsNavTemplate(ui, state) {
  const toggleHandler = (stateProperty) => () => {
    const currentState = state[stateProperty];
    const newState = !currentState;
    logger.log("debug", "ui", `[TOGGLE] Button "${stateProperty}" clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}`);
    ui.game.onToggleStateChange?.(stateProperty, newState);
  };
  const hasAutoSellUpgrade = ui.game?.upgradeset?.getUpgrade("auto_sell_operator")?.level > 0;
  const hasAutoBuyUpgrade = ui.game?.upgradeset?.getUpgrade("auto_buy_operator")?.level > 0;
  const hasHeatControlUpgrade = ui.game?.upgradeset?.getUpgrade("heat_control_operator")?.level > 0;
  return controlDeckControlsNavTemplate({
    autoSellOn: !!state.auto_sell && hasAutoSellUpgrade,
    autoBuyOn: !!state.auto_buy && hasAutoBuyUpgrade,
    heatControlOn: !!state.heat_control && hasHeatControlUpgrade,
    pauseOn: !!state.pause,
    accountTitle: ui.uiState?.user_account_display?.title ?? "Account",
    accountIcon: ui.uiState?.user_account_display?.icon ?? "\uD83D\uDC64",
    onToggleAutoSell: hasAutoSellUpgrade ? toggleHandler("auto_sell") : null,
    onToggleAutoBuy: hasAutoBuyUpgrade ? toggleHandler("auto_buy") : null,
    onToggleHeatControl: hasHeatControlUpgrade ? toggleHandler("heat_control") : null,
    onTogglePause: toggleHandler("pause"),
  });
}

export function initializeControlDeckToggleButtons(ui) {
  const root = document.getElementById("controls_nav_root");
  if (root && ui.game?.state) {
    const renderFn = () => buildControlsNavTemplate(ui, ui.game.state);
    ui._unmounts.push(ReactiveLitComponent.mountMulti(
      [
        { state: ui.game.state, keys: ["auto_sell", "auto_buy", "heat_control", "pause"] },
        ...(ui.uiState ? [{ state: ui.uiState, keys: ["user_account_display"] }] : []),
      ],
      renderFn,
      root
    ));
  } else if (root) {
    render(buildControlsNavTemplate(ui, {
      auto_sell: false,
      auto_buy: true,
      heat_control: false,
      pause: false,
    }), root);
  }
}

export function syncToggleStatesFromGame(ui) {
  if (!ui.game) {
    logger.log("warn", "ui", "syncToggleStatesFromGame called but game is not available");
    return;
  }
  const toggleMappings = {
    auto_sell: () => ui.game.reactor?.auto_sell_enabled ?? false,
    auto_buy: () => ui.game.reactor?.auto_buy_enabled ?? false,
    heat_control: () => ui.game.reactor?.heat_controlled ?? false,
    pause: () => ui.game.paused ?? false,
  };
  for (const [stateProperty, getValue] of Object.entries(toggleMappings)) {
    const gameValue = getValue();
    const currentState = ui.game.state[stateProperty];
    if (currentState !== gameValue) {
      logger.log("debug", "ui", `[TOGGLE] Syncing "${stateProperty}" from game: ${currentState} -> ${gameValue}`);
      ui.game.onToggleStateChange?.(stateProperty, gameValue);
    }
  }
}

export function updateControlDeckPercentageBar(ui, currentKey, maxKey, domElement) {
  if (!domElement) return;
  const st = ui.game?.state;
  const current = toNumber(st?.[currentKey] ?? 0);
  const max = toNumber(st?.[maxKey] ?? 1) || 1;
  domElement.style.width = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
}

function mountLeaderboardButtons(ui) {
  if (!ui.uiState || (ui._navLeaderboardUnmounts?.length ?? 0) > 0) return;
  ui._navLeaderboardUnmounts = [];
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
    ui._navLeaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
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
    ui._navLeaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["leaderboard_display"] }],
      renderBottom,
      span
    ));
  }
}

export function updateLeaderboardIcon(ui) {
  if (typeof document === "undefined" || !ui.game) return;
  mountLeaderboardButtons(ui);
  if (!ui.uiState) return;
  const lb = leaderboardService.getStatus();
  const circuitOff = lb.state === "open";
  const icon = ui.game.cheats_used ? "🚷" : circuitOff ? "📴" : "🏆";
  const disabled = !!ui.game.cheats_used || circuitOff;
  ui.uiState.leaderboard_display = { icon, disabled };
}

export function updateNavIndicators(ui) {
  if (typeof document === "undefined" || !ui.uiState) return;
  if (ui._navAffordabilityUnmounts?.length) return;
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
  ui._navAffordabilityUnmounts = unmounts;
}

export function teardownAffordabilityIndicators(ui) {
  if (ui._navAffordabilityUnmounts?.length) {
    ui._navAffordabilityUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
    ui._navAffordabilityUnmounts = [];
  }
}

export function teardownTabSetupUI(ui) {
  if (ui._tabSetupAbortController) {
    ui._tabSetupAbortController.abort();
    ui._tabSetupAbortController = null;
  }
}

export function setupBuildTabButton(ui) {
  teardownTabSetupUI(ui);
  ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;

  const buildBtn = document.getElementById("build_tab_btn");
  if (buildBtn) {
    buildBtn.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      const partsSection = getPartsSectionElement(ui) ?? ui.DOMElements?.parts_section;
      if (partsSection) {
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
        const hasSelectedPart = ui.stateManager.getClickedPart() !== null;

        const uiState = ui.uiState;
        if (isMobile) {
          if (hasSelectedPart && (uiState?.parts_panel_collapsed ?? partsSection.classList.contains("collapsed"))) {
            if (uiState) uiState.parts_panel_collapsed = false;
            else partsSection.classList.remove("collapsed");
          } else if (!hasSelectedPart) {
            if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
            else partsSection.classList.toggle("collapsed");
          }
          updatePartsPanelBodyClass(ui);
        } else {
          if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
          updatePartsPanelBodyClass(ui);
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
      ui.deviceFeatures.heavyVibration();
      const slots = ui.stateManager.getQuickSelectSlots();
      const locked = slots[activeSlotIndex]?.locked ?? false;
      ui.stateManager.setQuickSelectLock(activeSlotIndex, !locked);
    }, longPressMs);
  };
  const handlePointerUp = (e) => {
    const slotEl = e.target.closest(".quick-select-slot");
    if (!slotEl) return;
    clearTimer();
    if (didLongPress) return;
    const i = parseInt(slotEl.getAttribute("data-index"), 10);
    const slots = ui.stateManager.getQuickSelectSlots();
    const partId = slots[i]?.partId;
    if (!partId || !ui.game?.partset) return;
    const part = ui.game.partset.getPartById(partId);
    if (!part || !part.affordable) return;
    ui.deviceFeatures.lightVibration();
    document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
    ui.stateManager.setClickedPart(part, { skipOpenPanel: true });
    if (part.$el) part.$el.classList.add("part_active");
    updateQuickSelectSlots(ui);
  };
  if (container) {
    container.addEventListener("pointerdown", handlePointerDown, { signal });
    container.addEventListener("pointerup", handlePointerUp, { signal });
    container.addEventListener("pointercancel", clearTimer, { signal });
    container.addEventListener("pointerleave", clearTimer, { signal });
  }
  updateQuickSelectSlots(ui);
}

export function setupMenuTabButton(ui) {
  if (!ui._tabSetupAbortController) ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;
  const menuBtn = document.getElementById("menu_tab_btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      if (ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
        ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
      } else {
        if (ui.game?.router?.currentPageId === "reactor_section") closePartsPanel(ui);
        const bottomNav = document.getElementById("bottom_nav");
        if (bottomNav) {
          bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
            btn.classList.remove("active");
          });
        }
        document.getElementById("settings_btn")?.classList.remove("active");
        menuBtn.classList.add("active");
        ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
      }
    }, { signal });
  }
}

export function setupDesktopTopNavButtons(ui) {
  if (!ui._tabSetupAbortController) ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;
  const settingsTop = document.getElementById("settings_btn");
  if (settingsTop) {
    settingsTop.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      if (ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
        ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
      } else {
        if (ui.game?.router?.currentPageId === "reactor_section") closePartsPanel(ui);
        const bottomNav = document.getElementById("bottom_nav");
        if (bottomNav) {
          bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
            btn.classList.remove("active");
          });
        }
        document.getElementById("menu_tab_btn")?.classList.remove("active");
        settingsTop.classList.add("active");
        ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
      }
    }, { signal });
  }
  const fsBtn = document.getElementById("fullscreen_toggle");
  if (fsBtn) {
    fsBtn.addEventListener("click", () => {
      ui.deviceFeatures.toggleFullscreen();
      ui.deviceFeatures.updateFullscreenButtonState();
    }, { signal });
  }
  if (!ui._fullscreenSyncAttached) {
    ui._fullscreenSyncAttached = true;
    document.addEventListener("fullscreenchange", () => {
      ui.deviceFeatures?.updateFullscreenButtonState?.();
    });
  }
  const splashClose = document.getElementById("splash_close_btn");
  if (splashClose) {
    splashClose.addEventListener("click", async () => {
      ui.deviceFeatures.lightVibration();
      const sm = window.splashManager;
      if (!sm) return;
      ui.modalOrchestrator?.hideModal(MODAL_IDS.SETTINGS);
      if (ui.game?.engine?.running) ui.game.engine.stop();
      sm.show();
      await sm.refreshSaveOptions();
    }, { signal });
  }
  ui.deviceFeatures?.updateFullscreenButtonState?.();
}
export { PageSetupUI };
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

  flashExplosionBurst() {
    this._flashExplosionBurst();
  }

  _flashExplosionBurst() {
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc?.body) return;
    const mq = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
    if (mq?.matches) return;
    const el = doc.createElement("div");
    el.className = "explosion-emf-overlay";
    doc.body.appendChild(el);
    requestAnimationFrame(() => {
      el.classList.add("explosion-emf-overlay--on");
    });
    setTimeout(() => {
      el.remove();
    }, 110);
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
      const wrapper = getPageReactorWrapper(ui) ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
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
      if (resetReactorBtn && !resetReactorBtn.hasAttribute("data-listener-added")) {
        resetReactorBtn.addEventListener("click", async () => await ui.resetReactor());
        resetReactorBtn.setAttribute("data-listener-added", "true");
      }
    }
  }

  startMeltdownBuildup(onComplete) {
    const ui = this.ui;
    const BUILDUP_MS = 2500;
    const wrapper =
      getPageReactorWrapper(ui) ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
    const section = document.getElementById("reactor_section");
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
        setDecimal(ui.game.state, "current_heat", r.current_heat);
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
      if (inner) inner.classList.add("decompression-saved-toast__panel--visible");
    });
    setTimeout(() => {
      if (toast.parentNode) {
        if (inner) inner.classList.remove("decompression-saved-toast__panel--visible");
        setTimeout(() => toast.remove(), 220);
      }
    }, 3500);
  }

  updateProgressBarMeltdownState(_isMeltdown) {
  }
}

export { ClipboardUI, MeltdownUI };
export { InputHandler } from "./input-manager.js";
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
      if (upgradeset.game) actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "error", context: "global" });
      return;
    }
    if (upgradeset.game) actions.enqueueEffect(upgradeset.game, { kind: "sfx", id: "upgrade", context: "global" });
  };
  return UpgradeCard(upgrade, doctrineSource, onBuyClick, { useReactiveLevelAndCost });
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
  if (levelContainer) {
    if (typeof upgrade._levelReactiveUnmount === "function") {
      try {
        upgrade._levelReactiveUnmount();
      } catch (_) {}
      upgrade._levelReactiveUnmount = null;
    }
    levelContainer.replaceChildren();
    let lastLevelHeader;
    const levelRenderFn = () => html`<span class="level-text cathode-readout"></span>`;
    const afterLevelReadout = () => {
      const el = levelContainer.querySelector(".cathode-readout");
      const d = display[upgrade.id] ?? upgrade;
      const lvl = d.level ?? upgrade.level;
      const header = lvl >= upgrade.max_level ? "MAX" : `Level ${lvl}/${upgrade.max_level}`;
      if (!el || typeof header !== "string") return;
      if (lastLevelHeader === undefined) {
        el.textContent = header;
        lastLevelHeader = header;
        return;
      }
      if (lastLevelHeader === header) return;
      lastLevelHeader = header;
      runCathodeScramble(el, header, { durationMs: 150 });
    };
    upgrade._levelReactiveUnmount = ReactiveLitComponent.mountMulti(
      [{ state: display, keys: [upgrade.id] }],
      levelRenderFn,
      levelContainer,
      afterLevelReadout
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
        mountUpgradeReactiveDisplay(upgrade, display);
      } else {
        const lr = upgrade.$el.querySelector(".upgrade-level-info .cathode-readout");
        const t = lr?.textContent?.trim();
        if (lr && t) runCathodeScramble(lr, t, { durationMs: 150 });
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

export function getUpgradeSectionContainer(ui, locationKey) {
  return ui.DOMElements?.[locationKey] ?? getUiElement(ui, locationKey) ?? document.getElementById(locationKey);
}

export function appendUpgradeToSection(ui, locationKey, upgradeEl) {
  const container = getUpgradeSectionContainer(ui, locationKey);
  if (container && upgradeEl) {
    container.appendChild(upgradeEl);
  }
}

function formatUpgradeDebugValue(value) {
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

export function showUpgradeDebugPanel(ui) {
  const getEl = (id) => getUiElement(ui, id) ?? ui.DOMElements?.[id];
  const debugSection = getEl("debug_section");
  const debugToggleBtn = getEl("debug_toggle_btn");
  if (debugSection && debugToggleBtn) {
    debugSection.classList.remove("hidden");
    debugToggleBtn.textContent = "Hide Debug Info";
    updateUpgradeDebugVariables(ui);
  }
}

export function hideUpgradeDebugPanel(ui) {
  const getEl = (id) => getUiElement(ui, id) ?? ui.DOMElements?.[id];
  const debugSection = getEl("debug_section");
  const debugToggleBtn = getEl("debug_toggle_btn");
  if (debugSection && debugToggleBtn) {
    debugSection.classList.add("hidden");
    debugToggleBtn.textContent = "Show Debug Info";
  }
}

export function updateUpgradeDebugVariables(ui) {
  const debugVariables = getUiElement(ui, "debug_variables") ?? ui.DOMElements?.debug_variables;
  if (!ui.game || !debugVariables) return;
  const gameVars = collectUpgradeDebugGameVariables(ui);
  const sectionTemplate = ([fileName, variables]) => {
    const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
    return debugVariablesSectionTemplate({
      fileName,
      sortedEntries,
      escapeKey: escapeHtml,
      renderValue: (value) => unsafeHTML(formatUpgradeDebugValue(value)),
    });
  };
  const entries = Object.entries(gameVars);
  const template = debugVariablesTemplate({ entries, renderSection: sectionTemplate });
  render(template, debugVariables);
}

export function collectUpgradeDebugGameVariables(ui) {
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

export function applyBlueprintLayout(game, layout, skipCostDeduction = false) {
  if (!game?.tileset || !game?.partset) return;
  const clipped = clipToGrid(layout, game.rows, game.cols);
  game.tileset.tiles_list.forEach((tile) => {
    if (tile.enabled && tile.part) tile.clearPart();
  });
  clipped.flatMap((row, r) => (row || []).map((cell, c) => (cell?.id ? { r, c, cell } : null)).filter(Boolean))
    .forEach(({ r, c, cell }) => {
      const part = game.partset.getPartById(cell.id);
      if (part) {
        const tile = game.tileset.getTile(r, c);
        if (tile?.enabled) tile.setPart(part);
      }
    });
  if (!skipCostDeduction) {
    const { money: costMoney, ep: costEp } = getCostBreakdown(clipped, game.partset);
    if (costMoney > 0 && game.state.current_money) {
      updateDecimal(game.state, "current_money", (d) => d.sub(costMoney));
    }
    if (costEp > 0 && game.state.current_exotic_particles) {
      updateDecimal(game.state, "current_exotic_particles", (d) => d.sub(costEp));
    }
  }
  return clipped;
}

function getLayoutCost(entryData, game, fmtFn) {
  try {
    const str = typeof entryData === "string" ? entryData : JSON.stringify(entryData);
    const layout2D = deserializeReactor(str);
    if (!layout2D || !game?.partset) return "-";
    const cost = layout2D.flatMap((row) => row || []).filter((cell) => cell?.id).reduce((sum, cell) => {
      const part = game.partset.parts.get(cell.id);
      if (!part) return sum;
      const c = part.cost?.toNumber?.() ?? Number(part.cost ?? 0);
      return sum + c * (cell.lvl || 1);
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
  const wasPaused = !!ui.game.state.pause;
  if (!wasPaused) ui.game.pause();
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
      hideCopyPasteModal(ui);
      modal.onclick = null;
    }
  };
}

export function setupCopyAction(ui, refs) {
  const { copyBtn, modalCost, confirmBtn } = refs;
  const game = ui.game;

  copyBtn.onclick = () => {
    const data = serializeReactor(game);
    const layout = deserializeReactor(data);
    const cost = calculateLayoutCost(game.partset, layout);
    const summary = buildPartSummary(game.partset, layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = (layout, summary, checkedTypes) => {
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateCopySummary(layout, summary, checkedTypes);
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
      const filteredCost = calculateLayoutCost(game.partset, filteredLayout);
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
      if (!game) return;
      const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
      const rows = game.rows;
      const cols = game.cols;
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
      setTimeout(() => hideCopyPasteModal(ui), MODAL_HIDE_DELAY_MS);
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

function handleConfirmPaste(ui) {
  const g = ui.game;
  const layoutToPaste = deserializeReactor(pasteState.textareaData);
  if (!layoutToPaste) {
    logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
    return;
  }
  const filtered = filterLayoutByCheckedTypes(layoutToPaste, pasteState.checkedTypes);
  const breakdown = calculateLayoutCostBreakdown(g.partset, filtered);
  const sellCredit = pasteState.sellExisting ? calculateCurrentSellValue(g.tileset) : 0;
  const validation = validatePasteResources(breakdown, sellCredit, g.state.current_money, g.state.current_exotic_particles ?? 0);

  if (!validation.valid) {
    logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
    return;
  }
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  ui.copyPaste.pasteReactorLayout(clipToGrid(filtered, g.rows, g.cols));
  hideCopyPasteModal(ui);
}

function handlePartialPaste(ui) {
  const g = ui.game;
  const layoutToPaste = deserializeReactor(pasteState.textareaData);
  if (!layoutToPaste) return;
  const filtered = filterLayoutByCheckedTypes(layoutToPaste, pasteState.checkedTypes);
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  const affordable = buildAffordableLayout(filtered, 0, g.rows, g.cols, g);
  if (affordable) ui.copyPaste.pasteReactorLayout(affordable);
  hideCopyPasteModal(ui);
}

function renderPasteModalContent(ui, refs) {
  const g = ui.game;
  const parsed = deserializeReactor(pasteState.textareaData);
  if (!parsed) {
    const msg = !pasteState.textareaData ? "Enter reactor layout JSON data in the text area above" : "Invalid layout data - please check the JSON format";
    render(copyPasteStatusMessageTemplate({ message: msg }), refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const originalSummary = buildPartSummary(g.partset, parsed);
  originalSummary.forEach(item => {
    if (pasteState.checkedTypes[item.id] === undefined) {
      pasteState.checkedTypes[item.id] = true;
    }
  });

  const validationState = buildPasteState(parsed, pasteState.checkedTypes, g, g.tileset, pasteState.sellExisting);
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
    const affordableSet = buildAffordableSet(validationState.affordableLayout);
    renderLayoutPreview(g.partset, parsed, previewCanvas, affordableSet);
  }
}

export function setupPasteAction(ui, refs) {
  const { pasteBtn, modal, modalText, confirmBtn } = refs;
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
  const g = ui.game;

  if (!modal._hasValtioSub) {
    modal._hasValtioSub = true;
    subscribe(pasteState, () => renderPasteModalContent(ui, refs));
  }

  modalText.oninput = (e) => {
    pasteState.textareaData = e.target.value.trim();
    pasteState.checkedTypes = {};
  };

  confirmBtn.onclick = () => handleConfirmPaste(ui);
  if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui);

  ui._showPasteModalWithData = (data) => {
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = deserializeReactor(data);
    const summary = buildPartSummary(g.partset, layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = calculateCurrentSellValue(g.tileset);
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);

    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    renderPasteModalContent(ui, refs);
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
      const costStr = getLayoutCost(entry.data, ui.game, fmtFn);
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
    const layout = deserializeReactor(data);
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
    this._overlay = null;
    this._heatFlowOverlay = null;
    this._voltageOverlaySvg = null;
    const st = ui.game?.state;
    if (st) {
      subscribeKey(st, "heat_ratio", (r) => this._applyHeatFromRatio(typeof r === "number" && isFinite(r) ? r : 0));
    }
  }

  _applyHeatFromRatio(heatRatio) {
    const ui = this.ui;
    const background = getPageReactorBackground(ui) ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
    if (!background) return;
    const root = typeof document !== "undefined" ? document.documentElement : null;
    const cd = Math.min(1.5, Math.max(0, heatRatio));
    if (root) root.style.setProperty("--core-danger", String(cd));
    background.style.setProperty("--heat-ratio", String(cd));
    background.style.setProperty("--core-danger", String(cd));
    let alpha = 0;
    if (heatRatio <= 0.5) alpha = 0;
    else if (heatRatio <= 1.0) alpha = Math.min((heatRatio - 0.5) * 2 * 0.2, 0.2);
    else if (heatRatio <= 1.5) alpha = 0.2 + Math.min((heatRatio - 1.0) * 2 * 0.3, 0.3);
    else alpha = 0.5;
    background.style.setProperty("--heat-bg-alpha", String(alpha));
    if (heatRatio <= 0.5) {
      background.style.backgroundColor = "transparent";
    } else {
      background.style.removeProperty("background-color");
    }
    background.classList.remove("heat-warning", "heat-critical");
    if (heatRatio >= 1.3) background.classList.add("heat-warning", "heat-critical");
    else if (heatRatio >= 0.8) background.classList.add("heat-warning");
    const appRoot = typeof document !== "undefined" ? document.getElementById("app_root") : null;
    if (appRoot) {
      appRoot.style.setProperty("--core-danger", String(cd));
      const heatNorm = Math.min(1, Math.max(0, heatRatio / 1.5));
      appRoot.style.setProperty("--crt-heat", String(heatNorm));
      const dur = 20 - heatNorm * 12;
      appRoot.style.setProperty("--crt-jitter-duration", `${dur}s`);
      appRoot.classList.toggle("crt-heat-tearing", heatRatio >= 1.3);
    }
    const reactorEl = getPageReactor(ui) ?? document.getElementById("reactor");
    if (reactorEl) {
      const hr = Math.round(Math.min(1.5, Math.max(0, heatRatio)) * 1000) / 1000;
      reactorEl.setAttribute("data-heat-ratio", String(hr));
    }
  }

  _ensureOverlay() {
    const ui = this.ui;
    if (this._overlay && this._overlay.parentElement) return this._overlay;
    const reactorWrapper = getPageReactorWrapper(ui) ?? ui.DOMElements?.reactor_wrapper ?? document.getElementById('reactor_wrapper');
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

  _ensureVoltageOverlay() {
    const overlay = this._ensureOverlay();
    if (!overlay) return null;
    if (this._voltageOverlaySvg && this._voltageOverlaySvg.parentElement) return this._voltageOverlaySvg;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "voltage-placement-overlay");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    overlay.appendChild(svg);
    this._voltageOverlaySvg = svg;
    return svg;
  }

  drawVoltagePlacementOverlay() {
    const svg = this._ensureVoltageOverlay();
    if (svg) {
      svg.style.display = "none";
      svg.innerHTML = "";
    }
  }

  _tileCenterToOverlayPosition(row, col) {
    const ui = this.ui;
    const overlay = this._ensureOverlay();
    if (!overlay) return { x: 0, y: 0 };
    const reactorEl = (ui.gridCanvasRenderer?.getCanvas() || getPageReactor(ui)) ?? ui.DOMElements?.reactor;
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
    const bg = getPageReactorBackground(this.ui) ?? this.ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
    if (bg) {
      bg.classList.remove("heat-warning", "heat-critical");
      bg.style.setProperty("--heat-bg-alpha", "0");
      bg.style.setProperty("--heat-ratio", "0");
      bg.style.setProperty("--core-danger", "0");
    }
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (root) root.style.setProperty("--core-danger", "0");
    const appRoot = typeof document !== "undefined" ? document.getElementById("app_root") : null;
    if (appRoot) {
      appRoot.style.setProperty("--core-danger", "0");
      appRoot.style.setProperty("--crt-heat", "0");
      appRoot.style.setProperty("--crt-jitter-duration", "20s");
      appRoot.classList.remove("crt-heat-tearing");
    }
    const reactorEl = getPageReactor(this.ui) ?? document.getElementById("reactor");
    if (reactorEl) reactorEl.setAttribute("data-heat-ratio", "0");
  }

  updateHeatVisuals() {
    const ui = this.ui;
    const r = ui.game?.reactor;
    let heatRatio;
    if (r) {
      const current = toNumber(r.current_heat);
      const max = Math.max(1e-12, toNumber(r.max_heat));
      heatRatio = current / max;
    } else {
      const current = toNumber(ui.game?.state?.current_heat ?? 0);
      const max = Math.max(1e-12, toNumber(ui.game?.state?.max_heat ?? 1));
      heatRatio = current / max;
    }
    this._applyHeatFromRatio(heatRatio);
  }
}

class GridInteractionUI {
  constructor(ui) {
    this.ui = ui;
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
      const container = getPageReactorBackground(ui) ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
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
      const container = getPageReactorBackground(ui) ?? ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
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

      if (ui.game?.state) {
        setDecimal(ui.game.state, "current_heat", 0);
        ui.game.state.stats_heat_generation = 0;
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
      const container = getPageReactorBackground(ui) ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
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
      const container = getPageReactorBackground(ui) ?? ui.DOMElements?.reactor_background ?? document.getElementById('reactor_background');
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

    this.setupBlueprintPlannerControls();

    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) return;

    if (deselectBtn) {
      deselectBtn.onclick = () => {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.ui.stateManager.setClickedPart(null);
      };
    }

    if (closeBtn) closeBtn.onclick = () => hideCopyPasteModal(this.ui);

    if (dropperBtn) {
      dropperBtn.onclick = () => {
        this.ui._dropperModeActive = !this.ui._dropperModeActive;
        dropperBtn.classList.toggle("on", this.ui._dropperModeActive);
      };
    }

    const refs = { copyBtn, pasteBtn, modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
    setupCopyAction(this.ui, refs);
    setupPasteAction(this.ui, refs);
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
    startRenderLoop(ui, 0);
  }

  setupBlueprintPlannerControls() {
    const ui = this.ui;
    const game = ui.game;
    const toggle = document.getElementById("reactor_blueprint_toggle");
    const applyBtn = document.getElementById("blueprint_planner_apply");
    const discardBtn = document.getElementById("blueprint_planner_discard");
    if (!toggle || !game) return;
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
    let blueprintHudTimer = null;
    const syncHud = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = setTimeout(async () => {
        blueprintHudTimer = null;
        const pEl = document.getElementById("blueprint_planner_power");
        const hEl = document.getElementById("blueprint_planner_net_heat");
        const ana = previewBlueprintPlannerStats(game);
        let pwr = ana?.stats_power;
        let net = ana?.stats_net_heat;
        if (typeof game.requestBlueprintProjectionSample === "function") {
          const res = await game.requestBlueprintProjectionSample();
          const sample = res?.projectionPlannerSample;
          if (sample && typeof sample.stats_power === "number") pwr = sample.stats_power;
          if (sample && typeof sample.stats_net_heat === "number") net = sample.stats_net_heat;
        }
        if (pEl) pEl.textContent = ana || pwr != null ? `Pwr ${fmt(pwr ?? 0, 0)}` : "";
        if (hEl) hEl.textContent = ana || net != null ? `ΔHeat ${fmt(net ?? 0, 0)}` : "";
        ui.gridCanvasRenderer?.markStaticDirty?.();
      }, 90);
    };
    const onChanged = () => syncHud();
    if (game.on) game.on("blueprintPlannerChanged", onChanged);
    this._teardownBlueprintPlanner = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = null;
      if (game.off) game.off("blueprintPlannerChanged", onChanged);
      this._teardownBlueprintPlanner = null;
    };
    toggle.onclick = () => {
      game.toggleBlueprintPlanner?.();
      syncHud();
    };
    if (applyBtn) {
      applyBtn.onclick = () => {
        game.applyBlueprintPlannerLayout?.();
        syncHud();
        startRenderLoop(ui, 0);
      };
    }
    if (discardBtn) {
      discardBtn.onclick = () => {
        game.clearBlueprintPlannerSlots?.();
        syncHud();
      };
    }
  }

  teardownBlueprintPlanner() {
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
  }
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
      btn.onclick = null;
    }

    ui.uiState.user_account_display = { icon: "💾", title: "Local saves" };
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

export function subscribeToContextModalEvents(ui, game) {
  if (!game?.on) return;
  if (ui._contextModalHandler) return;
  ui._contextModalHandler = (payload) => ui.modalOrchestrator?.showModal?.(MODAL_IDS.CONTEXT, payload);
  game.on("showContextModal", ui._contextModalHandler);
}

export function unsubscribeContextModalEvents(ui, game) {
  if (!game?.off || !ui._contextModalHandler) return;
  game.off("showContextModal", ui._contextModalHandler);
  ui._contextModalHandler = null;
}

export function hideCopyPasteModal(ui) {
  const modal = document.getElementById("reactor_copy_paste_modal");
  if (typeof ui._copyPasteModalReactiveUnmount === "function") {
    try {
      ui._copyPasteModalReactiveUnmount();
    } catch (_) {}
    ui._copyPasteModalReactiveUnmount = null;
  }
  if (modal) modal.classList.add("hidden");

  const prevPauseState = modal?.dataset?.previousPauseState;
  if (prevPauseState != null && ui.game) {
    ui.game.onToggleStateChange?.("pause", prevPauseState === "true");
  }
}

export function getUiConfigDisplayValue(game, configKey) {
  if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
  return game?.state?.[configKey];
}

export function snapUiDisplayValuesFromState(ui) {
  if (!ui.displayValues) return;
  const d = ui.displayValues;
  ["money", "heat", "power", "ep"].forEach((k) => {
    const o = d[k];
    if (o && typeof o.current === "number" && typeof o.target === "number") o.current = o.target;
  });
}

export function syncUiDisplayValueTargetsFromState(ui) {
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

export function applyUiStateToDom(ui) {
  const game = ui.game;
  const config = ui.var_objs_config;
  if (!config || !game?.state) return;
  for (const configKey of Object.keys(config)) {
    const val = getUiConfigDisplayValue(game, configKey);
    if (val === undefined) continue;
    const cfg = config[configKey];
    cfg?.onupdate?.(val);
  }
}

export function applyUiStateToDomForKeys(ui, keys) {
  const game = ui.game;
  const config = ui.var_objs_config;
  if (!config || !game) return;
  for (const configKey of keys) {
    const cfg = config[configKey];
    if (!cfg) continue;
    const val = getUiConfigDisplayValue(game, configKey);
    if (val === undefined) continue;
    cfg.onupdate?.(val);
  }
}

export function processUiUpdateQueue(ui) {
  syncUiDisplayValueTargetsFromState(ui);
  snapUiDisplayValuesFromState(ui);
  applyUiStateToDom(ui);
}

export function updateUiRollingNumbers(ui, _dt) {
  snapUiDisplayValuesFromState(ui);
}

export function startRenderLoop(ui, timestamp = 0) {
  if (ui._updateLoopStopped) return;
  if (typeof document === "undefined" || !document) return;
  if (typeof document.getElementById !== "function") return;
  if (!ui._lastUiTime) ui._lastUiTime = timestamp;
  ui._lastUiTime = timestamp;

  ui._firstFrameSyncDone = true;

  if (timestamp - ui.last_interface_update > ui.update_interface_interval) {
    ui.last_interface_update = timestamp;
    ui.performanceUI?.recordFrame?.();
    if (ui.gridCanvasRenderer && ui.game) ui.gridCanvasRenderer.render(ui.game);
    updateLeaderboardIcon(ui);
    ui.heatVisualsUI?.drawHeatFlowOverlay?.();
    ui.heatVisualsUI?.drawVoltagePlacementOverlay?.();
  }

  ui.update_interface_task = requestAnimationFrame((ts) => startRenderLoop(ui, ts));
}

export function setupKeyboardShortcuts(ui) {
  document.addEventListener("keydown", (e) => {
    if (!ui?.game) return;
    if (!e.ctrlKey) return;
    const k = String(e.key ?? "").toLowerCase();
    if (k !== "e") return;
    e.preventDefault();
    ui.game.markCheatsUsed?.();
    ui.game.grantCheatExoticParticle?.(1);
    const g = ui.game;
    patchGameState(g, {
      exotic_particles: g.exoticParticleManager?.exotic_particles ?? g.exotic_particles,
      total_exotic_particles: g.state?.total_exotic_particles ?? g.total_exotic_particles,
      current_exotic_particles: g.state?.current_exotic_particles ?? g.current_exotic_particles,
    });
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
      setDecimal(ui.game.state, "current_money", ui.game.state?.current_money ?? ui.game.current_money);
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

function dfVibrate(pattern) {
  if (!navigator?.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (_) {}
}

export function bindDeviceFeatures(ui) {
  const fsIcon = "⛶";
  return {
    updateWakeLockState() {},
    toggleFullscreen() {
      if (!document) return;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch?.(() => {});
      } else {
        document.exitFullscreen?.().catch?.(() => {});
      }
    },
    updateFullscreenButtonState() {
      const btn = getUiElement(ui, "fullscreen_toggle") ?? document.getElementById("fullscreen_toggle");
      if (!btn || !ui.uiState) return;
      const title = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
      ui.uiState.fullscreen_display = { icon: fsIcon, title };
      btn.title = title;
      btn.textContent = fsIcon;
    },
    vibrate: dfVibrate,
    lightVibration() { dfVibrate(10); },
    heavyVibration() { dfVibrate(50); },
    upgradeCardHoverBuzz() { dfVibrate([8, 12, 10]); },
    doublePulseVibration() { dfVibrate([30, 80, 30]); },
    meltdownVibration() { dfVibrate(200); },
    heatRumbleVibration() { dfVibrate([80, 40, 80, 40, 80]); },
    updateAppBadge() {},
  };
}

export { HeatVisualsUI, GridInteractionUI };

