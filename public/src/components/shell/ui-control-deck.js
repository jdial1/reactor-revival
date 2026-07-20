import { safeCall } from "../../core/teardown.js";
import { html, render } from "lit-html";
import { classMap, styleMap } from "../../dom/lit.js";
import { toNumber, isAllPowerOverflowingToHeat } from "../../simUtils.js";
import { numFormat as fmt, formatNumberCompactIntl } from "../../core/numbers.js";
import { logger } from "../../core/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../../constants/ui-constants.js";
import { vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent } from "../../core/math-helpers.js";
import { enqueueWarningLoop, enqueueWarningStop } from "../../state/game-effects-flush.js";
import { bindLitRenderMulti } from "../../dom/lit-reactive.js";
import { dispatchToggleIntent } from "../grid/ui-intents.js";
import { syncGameTogglesFromState } from "./game-state-sync.js";
import { resolveSessionSnapshot, hudViewFromSnapshot } from "./hud-from-snapshot.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";
import { FAILURE_PHASE_INTENSITY } from "../../constants/ui-timing.js";
import { EngineStatus } from "../../schema/stateSchemas.js";
import { getUiElement, getPageReactor, getPageReactorWrapper, isLitRenderContainer } from "./page-dom.js";
import {
  mobileControlDeckTemplate,
  mobilePassiveBarTemplate,
  controlDeckStatsBarTemplate,
  controlDeckExoticParticlesTemplate,
  controlDeckControlsNavTemplate,
  engineStatusIndicatorTemplate,
} from "../../templates/uiComponentsTemplates.js";

const HAZARD_FILL_PERCENT = 95;
const CRITICAL_FILL_PERCENT = 80;

export function formatSimulationTickLine(game) {
  if (!game) return "—";
  const period = (game.loop_wait || 1000) / 1000;
  const periodStr = period >= 10 ? period.toFixed(1) : period.toFixed(2);
  return `${periodStr}s`;
}

function formatArchitectMetricsLine(state, game) {
  const p = fmt(toNumber(state.stats_power ?? 0), 0);
  const h = fmt(toNumber(state.stats_heat_generation ?? 0), 0);
  const v = fmt(toNumber(state.stats_vent ?? 0), 0);
  const maxH = toNumber(state.max_heat ?? 0);
  const cur = toNumber(state.current_heat ?? 0);
  const hullPct = maxH > 0 ? (cur / maxH) * 100 : 0;
  const hullStr = `${fmt(hullPct, 1)}%`;
  const period = formatSimulationTickLine(game);
  return `P/t ${p} · H/t ${h} · V ${v} · ${period} · Hull ${hullStr}`;
}

export function getBarVisuals(current, max, cssVarHeight, layer) {
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
  const autoSellRate = showAutoSell ? Math.floor(toNumber(state.stats_cash ?? 0)) : 0;

  const hasHeatControlUpgrade = ui.game?.upgradeset?.getUpgrade("heat_control_operator")?.level > 0;
  const heatControlEnabled = !!state.heat_controlled && hasHeatControlUpgrade;
  const showHeatRate = heatControlEnabled && maxHeat > 0;
  const manualReduce = toNumber(state.manual_heat_reduce ?? ui.game?.reactor?.manual_heat_reduce ?? 0);
  const manualVentPercent = toNumber(ui.game?.reactor?.sessionModifiers?.manual_vent_percent ?? 0);
  const autoHeatRate = showHeatRate ? manualReduce + maxHeat * manualVentPercent : 0;

  const powerOverflowToHeat = isAllPowerOverflowingToHeat(state, ui.game?.reactor);
  const heatVentClass = classMap({
    "control-deck-item": true,
    "heat-vent": true,
    hazard: heatHazard,
    critical: heatCritical,
    "power-overflow-to-heat": powerOverflowToHeat,
  });
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
    architectMetricsText: formatArchitectMetricsLine(state, ui.game),
    powerCurrentText: fmt(powerCurrent, 0),
    heatCurrentText: fmt(heatCurrent, 0),
    maxPowerText: maxPower ? fmt(maxPower, 0) : "",
    maxHeatText: maxHeat ? fmt(maxHeat, 0) : "",
    moneyValueText: state.melting_down ? "\u2622\uFE0F" : formatNumberCompactIntl(state.current_money ?? 0),
    powerOverflowToHeat,
  });
}

function buildMobilePassiveBarTemplate(state) {
  return mobilePassiveBarTemplate({
    epText: formatNumberCompactIntl(state.current_exotic_particles ?? 0),
    moneyText: state.melting_down ? "\u2622\uFE0F" : `$${formatNumberCompactIntl(state.current_money ?? 0)}`,
    pauseClass: classMap({ "passive-top-pause ui-bevel flex-center": true, paused: !!state.pause }),
    pauseAriaLabel: state.pause ? "Resume" : "Pause",
    pauseTitle: state.pause ? "Resume" : "Pause",
  });
}

export function mountMobilePassiveBar(ui) {
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobilePassiveBarMounted || !ui.uiState) return;

  const passiveBar = getUiElement(ui, "mobile_passive_top_bar");
  if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
  const root = getUiElement(ui, "mobile_passive_root");
  if (!root) return;

  const subscriptions = [{
    state: ui.uiState,
    keys: ["snapshot_rev"],
  }];
  const unmountPassive = bindLitRenderMulti(
    subscriptions,
    () => buildMobilePassiveBarTemplate(hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game)),
    root,
  );
  ui._mobilePassiveBarMounted = true;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(() => {
    unmountPassive();
    ui._mobilePassiveBarMounted = false;
  });
}

export function syncMobileControlDeckMounts(ui) {
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobileControlDeckReactiveMounted || !ui.uiState) return;

  const root = getUiElement(ui, "control_deck_root");
  if (!root) return;

  const subscriptions = [{
    state: ui.uiState,
    keys: ["snapshot_rev"],
  }];
  const innerUnmount = bindLitRenderMulti(
    subscriptions,
    () => buildMobileControlDeckTemplate(ui, hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game)),
    root,
  );
  ui._mobileControlDeckReactiveMounted = true;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(() => {
    innerUnmount();
    ui._mobileControlDeckReactiveMounted = false;
  });
  mountMobilePassiveBar(ui);
}

export function updateFailurePhaseSensory(ui, state) {
  if (!ui) return;
  const wrapper = getPageReactorWrapper(ui);
  if (!state || state === "nominal") {
    if (ui.game) enqueueWarningStop(ui.game);
    if (ui._failureShakeRafId) cancelAnimationFrame(ui._failureShakeRafId);
    ui._failureShakeRafId = null;
    if (wrapper) wrapper.style.transform = "";
    return;
  }
  if (state === "meltdown") {
    if (ui._failureShakeRafId) cancelAnimationFrame(ui._failureShakeRafId);
    ui._failureShakeRafId = null;
    return;
  }
  const intensity = FAILURE_PHASE_INTENSITY[state] ?? 0.5;
  if (ui.game) enqueueWarningLoop(ui.game, intensity);
  if (ui._failureShakeRafId) cancelAnimationFrame(ui._failureShakeRafId);
  const tick = () => {
    if (!wrapper?.isConnected) {
      ui._failureShakeRafId = null;
      return;
    }
    const shake = intensity * 2.5;
    wrapper.style.transform = `translate(${(Math.random() - 0.5) * shake}px, ${(Math.random() - 0.5) * shake}px)`;
    ui._failureShakeRafId = requestAnimationFrame(tick);
  };
  ui._failureShakeRafId = requestAnimationFrame(tick);
}

export function setPageReactorVisibility(ui, visible) {
  const reactor = getPageReactor(ui);
  if (reactor) reactor.style.visibility = visible ? "visible" : "hidden";
}

export function mountExoticParticlesDisplayIfNeeded(ui) {
  if (ui._controlDeckEpUnmount) {
    const epRoot = getUiElement(ui, "exotic_particles_display");
    if (epRoot?.isConnected) return;
    ui._controlDeckEpUnmount();
    ui._controlDeckEpUnmount = null;
  }
  const epRoot = getUiElement(ui, "exotic_particles_display");
  if (!epRoot || !ui.uiState) return;
  ui._controlDeckEpUnmount = bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["snapshot_rev"] }],
    () => {
      const state = hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game);
      return controlDeckExoticParticlesTemplate({
        currentEp: fmt(state.current_exotic_particles ?? 0),
        totalEp: fmt(state.total_exotic_particles ?? 0),
      });
    },
    epRoot,
  );
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(ui._controlDeckEpUnmount);
}

function getStatsBarMount(ui) {
  const isMobile = !!ui?.uiState?.is_mobile_viewport;
  if (isMobile) {
    return getUiElement(ui, "reactor_stats_mobile") ?? getUiElement(ui, "reactor_stats");
  }
  return getUiElement(ui, "reactor_stats");
}

function buildStatsBarTemplate(ui) {
  const state = hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game);
  const stirling = Number(state.stats_stirling_power ?? 0);
  const cellPower = Number(state.stats_cell_power ?? state.stats_power ?? 0);
  const maxH = toNumber(state.max_heat ?? 0);
  const cur = toNumber(state.current_heat ?? 0);
  const hullPct = maxH > 0 ? (cur / maxH) * 100 : 0;
  const hullEmpty = hullPct <= 0;
  return controlDeckStatsBarTemplate({
    ventText: fmt(state.stats_vent ?? 0, 0),
    powerText: fmt(state.stats_power ?? 0, 0),
    heatText: fmt(state.stats_heat_generation ?? 0, 0),
    hullText: `${fmt(hullPct, 1)}%`,
    powerTitle: stirling > 0
      ? `Power: ${fmt(cellPower, 0)} (Cells) + ${fmt(stirling, 0)} (Stirling)`
      : "Total power per tick",
    hullReadoutClass: classMap({ "cathode-readout": true, "hull-readout-empty": hullEmpty }),
  });
}

function mountStatsBarReactive(ui) {
  if (ui._statsBarReactiveMounted) {
    const existing = getStatsBarMount(ui);
    if (existing?.isConnected) return;
    if (typeof ui._statsBarUnmount === "function") {
      safeCall(() => { ui._statsBarUnmount(); });
      ui._statsBarUnmount = null;
    }
    ui._statsBarReactiveMounted = false;
  }
  const root = getStatsBarMount(ui);
  if (!isLitRenderContainer(root) || !ui.uiState) return;
  ui._statsBarUnmount = bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["snapshot_rev"] }],
    () => buildStatsBarTemplate(ui),
    root,
  );
  if (!ui._unmounts) ui._unmounts = [];
  ui._unmounts.push(ui._statsBarUnmount);
  mountExoticParticlesDisplayIfNeeded(ui);
  ui._statsBarReactiveMounted = true;
}

function mountEngineStatusReactive(ui) {
  if (ui._engineStatusUnmount) {
    const existing = getUiElement(ui, "engine_status_indicator_root");
    if (existing?.isConnected) return;
    ui._engineStatusUnmount();
    ui._engineStatusUnmount = null;
  }
  const root = getUiElement(ui, "engine_status_indicator_root");
  if (!isLitRenderContainer(root) || !ui.uiState) return;
  const renderFn = () => {
    const state = hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game);
    const statusClass = classMap({
      "engine-running": state.engine_status === EngineStatus.RUNNING,
      "engine-paused": state.engine_status === EngineStatus.PAUSED,
      "engine-stopped": state.engine_status === EngineStatus.STOPPED,
      "engine-tick": state.engine_status === EngineStatus.TICK,
      "engine-simulation-error": ui.game?.state?.engine_status === EngineStatus.SIMULATION_ERROR,
    });
    return engineStatusIndicatorTemplate({ statusClass });
  };
  ui._engineStatusUnmount = bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["snapshot_rev"] }],
    renderFn,
    root
  );
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(ui._engineStatusUnmount);
}

function mountTickCadenceNav(ui) {
  if (ui._tickCadenceNavUnmount) {
    const existing = getUiElement(ui, "tps_display");
    if (existing?.isConnected) return;
    safeCall(() => { ui._tickCadenceNavUnmount(); });
    ui._tickCadenceNavUnmount = null;
  }
  const el = getUiElement(ui, "tps_display");
  if (!isLitRenderContainer(el) || !ui.uiState) return;
  ui._tickCadenceNavUnmount = bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["snapshot_rev"] }],
    () => html`${formatSimulationTickLine(ui.game)}`,
    el,
  );
  if (!ui._unmounts) ui._unmounts = [];
  ui._unmounts.push(ui._tickCadenceNavUnmount);
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
        ui.deviceFeatures.updateWakeLockState();
        ui.pauseStateUI?.updatePauseState?.();
      },
    },
    melting_down: {
      onupdate: (val) => {
        if (val) ui.gridInteractionUI?.clearAllActiveAnimations?.();
      },
    },
  };
  ui.stateManager?.setupStateSubscriptions?.();
}

function buildControlsNavTemplate(ui, state) {
  const toggleHandler = (stateProperty) => () => {
    const live = hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game);
    const currentState = stateProperty === "pause"
      ? !!ui.game?.paused
      : !!(ui.game?.state?.[stateProperty] ?? live[stateProperty]);
    const newState = !currentState;
    logger.log("debug", "ui", `[TOGGLE] Button "${stateProperty}" clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}`);
    dispatchToggleIntent(ui.game, stateProperty, newState);
  };
  const hasAutoSellUpgrade = ui.game?.upgradeset?.getUpgrade("auto_sell_operator")?.level > 0;
  const hasAutoBuyUpgrade = ui.game?.upgradeset?.getUpgrade("auto_buy_operator")?.level > 0;
  const hasHeatControlUpgrade = ui.game?.upgradeset?.getUpgrade("heat_control_operator")?.level > 0;
  return controlDeckControlsNavTemplate({
    autoSellOn: !!state.auto_sell && hasAutoSellUpgrade,
    autoBuyOn: !!state.auto_buy && hasAutoBuyUpgrade,
    heatControlOn: !!state.heat_control && hasHeatControlUpgrade,
    pauseOn: !!state.pause,
    onToggleAutoSell: hasAutoSellUpgrade ? toggleHandler("auto_sell") : null,
    onToggleAutoBuy: hasAutoBuyUpgrade ? toggleHandler("auto_buy") : null,
    onToggleHeatControl: hasHeatControlUpgrade ? toggleHandler("heat_control") : null,
    onTogglePause: toggleHandler("pause"),
    onOpenSaves: () => ui.modalOrchestrator?.showModal?.(MODAL_IDS.SETTINGS),
  });
}

export function initializeControlDeckToggleButtons(ui) {
  if (ui._controlsNavReactiveMounted) {
    const root = getUiElement(ui, "controls_nav_root");
    if (root?.isConnected) return;
    if (typeof ui._controlsNavUnmount === "function") {
      safeCall(() => { ui._controlsNavUnmount(); });
      ui._controlsNavUnmount = null;
    }
    ui._controlsNavReactiveMounted = false;
  }
  const root = getUiElement(ui, "controls_nav_root");
  if (root && ui.uiState) {
    const renderFn = () => buildControlsNavTemplate(ui, hudViewFromSnapshot(resolveSessionSnapshot(ui.game), ui.game));
    ui._controlsNavUnmount = bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["snapshot_rev"] }],
      renderFn,
      root
    );
    ui._controlsNavReactiveMounted = true;
    if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
    ui._layoutUnmounts.push(ui._controlsNavUnmount);
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
  if (!ui.game?.state) {
    logger.log("warn", "ui", "syncToggleStatesFromGame called but game is not available");
    return;
  }
  syncGameTogglesFromState(ui.game);
}

