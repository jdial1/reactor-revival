import { safeCall, teardownAll } from "../../core/teardown.js";
import { html, render } from "lit-html";
import { classMap, styleMap } from "../../dom/lit.js";
import { VENT_BONUS_PERCENT_DIVISOR, toNumber, isAllPowerOverflowingToHeat } from "../../simUtils.js";
import { REACTOR_HEAT_STANDARD_DIVISOR } from "../../constants/sim.js";
import { numFormat as fmt, formatNumberCompactIntl } from "../../core/numbers.js";
import { logger } from "../../core/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../../constants/ui-constants.js";
import { vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent } from "../../core/math-helpers.js";
import { subscribeKey } from "../../store.js";
import { enqueueWarningLoop, enqueueWarningStop } from "../../state/game-effects.js";
import { bindLitRenderMulti, bindLitRenderKeyed } from "../../dom/lit-reactive.js";
import { dispatchToggleIntent } from "../grid/ui-intents.js";
import { syncGameTogglesFromState } from "./game-state-sync.js";
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
  const autoSellRate = showAutoSell ? Math.floor(maxPower * multiplier) : 0;

  const hasHeatControlUpgrade = ui.game?.upgradeset?.getUpgrade("heat_control_operator")?.level > 0;
  const heatControlEnabled = !!state.heat_controlled && hasHeatControlUpgrade;
  const showHeatRate = heatControlEnabled && maxHeat > 0;
  const ventBonus = toNumber(state.vent_multiplier_eff ?? 0);
  const autoHeatRate = showHeatRate ? (maxHeat / REACTOR_HEAT_STANDARD_DIVISOR) * (1 + ventBonus / VENT_BONUS_PERCENT_DIVISOR) : 0;

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
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobilePassiveBarMounted || !ui.game?.state) return;

  const passiveBar = document.getElementById("mobile_passive_top_bar");
  if (passiveBar) passiveBar.setAttribute("aria-hidden", "false");
  const root = document.getElementById("mobile_passive_root");
  if (!root) return;

  const subscriptions = [{
    state: ui.game.state,
    keys: ["current_exotic_particles", "current_money", "pause", "melting_down"],
  }];
  const unmountPassive = bindLitRenderMulti(subscriptions, () => buildMobilePassiveBarTemplate(ui.game.state), root);
  ui._mobilePassiveBarMounted = true;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(() => {
    unmountPassive();
    ui._mobilePassiveBarMounted = false;
  });
}

export function syncMobileControlDeckMounts(ui) {
  if (window.innerWidth > MOBILE_BREAKPOINT_PX || ui._mobileControlDeckReactiveMounted || !ui.game?.state) return;

  const root = getUiElement(ui, "control_deck_root");
  if (!root) return;

  const subscriptions = [{
    state: ui.game.state,
    keys: [
      "max_power", "max_heat", "current_power", "current_heat",
      "power_net_change", "heat_net_change", "stats_power", "stats_net_heat",
      "stats_heat_generation", "stats_vent", "power_overflow_to_heat_ratio",
      "auto_sell", "auto_sell_multiplier", "heat_controlled", "vent_multiplier_eff",
      "current_money", "melting_down",
    ],
  }];
  const innerUnmount = bindLitRenderMulti(subscriptions, () => buildMobileControlDeckTemplate(ui, ui.game.state), root);
  const onLoopWaitPatch = (patch) => {
    if (!patch || !Object.prototype.hasOwnProperty.call(patch, "loop_wait")) return;
    const el = root.querySelector(".control-deck-architect-metrics");
    if (el && ui.game?.state) el.textContent = formatArchitectMetricsLine(ui.game.state, ui.game);
  };
  if (!ui._mobileControlDeckPatchAttached && ui.game?.on) {
    ui._mobileControlDeckPatchAttached = true;
    ui.game.on("statePatch", onLoopWaitPatch);
  }
  ui._mobileControlDeckReactiveMounted = true;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(() => {
    innerUnmount();
    if (ui._mobileControlDeckPatchAttached && ui.game?.off) {
      ui.game.off("statePatch", onLoopWaitPatch);
      ui._mobileControlDeckPatchAttached = false;
    }
    ui._mobileControlDeckReactiveMounted = false;
  });
  mountMobilePassiveBar(ui);
}

const FAILURE_PHASE_INTENSITY = {
  saturation: 0.35,
  repulsion: 0.55,
  fragmentation: 0.75,
  criticality: 0.95,
};

export function updateFailurePhaseSensory(ui, state) {
  if (!ui) return;
  const section = document.getElementById("reactor_section");
  const wrapper = getPageReactorWrapper(ui);
  const phases = ["saturation", "repulsion", "fragmentation", "criticality"];
  if (section) {
    for (let i = 0; i < phases.length; i++) section.classList.remove(`failure-${phases[i]}`);
    if (state && state !== "nominal" && state !== "meltdown" && phases.includes(state)) {
      section.classList.add(`failure-${state}`);
    }
  }
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

function controlDeckExoticParticlesRenderTemplate(state) {
  return controlDeckExoticParticlesTemplate({
    currentEp: fmt(state.current_exotic_particles ?? 0),
    totalEp: fmt(state.total_exotic_particles ?? 0),
  });
}

export function mountExoticParticlesDisplayIfNeeded(ui) {
  if (ui._controlDeckEpUnmount) {
    const epRoot = document.getElementById("exotic_particles_display");
    if (epRoot?.isConnected) return;
    ui._controlDeckEpUnmount();
    ui._controlDeckEpUnmount = null;
  }
  const epRoot = document.getElementById("exotic_particles_display");
  if (!epRoot || !ui.game?.state) return;
  ui._controlDeckEpUnmount = bindLitRenderKeyed(
    ui.game.state,
    ["current_exotic_particles", "total_exotic_particles"],
    controlDeckExoticParticlesRenderTemplate,
    epRoot
  );
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(ui._controlDeckEpUnmount);
}

function appendControlDeckStatRow(root, { statClass, icon, alt, title, valueId, labelText }) {
  const li = document.createElement("li");
  li.className = statClass;
  const strong = document.createElement("strong");
  strong.title = title;
  if (labelText) {
    const label = document.createElement("span");
    label.className = "stats-inline-label";
    label.textContent = labelText;
    strong.append(label, document.createTextNode(" "));
  }
  if (icon) {
    const img = document.createElement("img");
    img.src = icon;
    img.alt = alt;
    img.className = "icon-inline";
    strong.append(img);
  }
  const value = document.createElement("span");
  value.id = valueId;
  value.className = "cathode-readout";
  strong.append(value);
  li.append(strong);
  root.append(li);
}

function ensureControlDeckStatsBarDom(root) {
  if (root.querySelector("#stats_vent")) return;
  appendControlDeckStatRow(root, {
    statClass: "reactor-stat reactor-stat--vent",
    icon: "img/ui/icons/icon_vent.png",
    alt: "Vent",
    title: "Total heat venting per tick",
    valueId: "stats_vent",
  });
  appendControlDeckStatRow(root, {
    statClass: "reactor-stat reactor-stat--power",
    icon: "img/ui/icons/icon_power.png",
    alt: "Power",
    title: "Total power per tick (cells + Stirling)",
    valueId: "stats_power",
  });
  appendControlDeckStatRow(root, {
    statClass: "reactor-stat reactor-stat--heat",
    icon: "img/ui/icons/icon_heat.png",
    alt: "Heat",
    title: "Heat per tick",
    valueId: "stats_heat",
  });
  appendControlDeckStatRow(root, {
    statClass: "reactor-stat reactor-stat--hull",
    icon: null,
    alt: "",
    title: "Reactor hull fill",
    valueId: "stats_hull",
    labelText: "Hull",
  });
}

function getStatsBarMount(ui) {
  const isMobile = !!ui?.uiState?.is_mobile_viewport;
  if (isMobile) {
    return document.getElementById("reactor_stats_mobile") ?? document.getElementById("reactor_stats");
  }
  return document.getElementById("reactor_stats");
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
  if (!isLitRenderContainer(root) || !ui.game?.state) return;
  const state = ui.game.state;
  if (!root.querySelector("#stats_vent")) {
    try {
      render(controlDeckStatsBarTemplate(), root);
    } catch (err) {
      logger.log("warn", "ui", "Stats bar lit render failed; using DOM fallback", err);
      ensureControlDeckStatsBarDom(root);
    }
  }
  const ventEl = root.querySelector("#stats_vent");
  const powerEl = root.querySelector("#stats_power");
  const heatEl = root.querySelector("#stats_heat");
  const hullEl = root.querySelector("#stats_hull");
  const hullDesktopEl = getUiElement(ui, "info_hull_desktop");
  const hullItem = document.querySelector(".info-item-hull");
  const last = { vent: null, power: null, heat: null, hull: null, hullDesktop: null };
  const first = { vent: true, power: true, heat: true, hull: true, hullDesktop: true };
  const sync = () => {
    const v = fmt(state.stats_vent ?? 0, 0);
    const stirling = Number(state.stats_stirling_power ?? 0);
    const cellPower = Number(state.stats_cell_power ?? state.stats_power ?? 0);
    const p = fmt(state.stats_power ?? 0, 0);
    const h = fmt(state.stats_heat_generation ?? 0, 0);
    const powerTitle = stirling > 0
      ? `Power: ${fmt(cellPower, 0)} (Cells) + ${fmt(stirling, 0)} (Stirling)`
      : "Total power per tick";
    if (powerEl?.parentElement) powerEl.parentElement.title = powerTitle;
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
      el.textContent = text;
    };
    apply(ventEl, "vent", v);
    apply(powerEl, "power", p);
    apply(heatEl, "heat", h);
    apply(hullEl, "hull", hullText);
    apply(hullDesktopEl, "hullDesktop", hullText);
    const hullEmpty = (() => {
      const pct = parseFloat(String(hullText).replace("%", ""));
      return !Number.isNaN(pct) && pct <= 0;
    })();
    [hullEl, hullDesktopEl].forEach((el) => {
      if (!el) return;
      el.classList.toggle("hull-readout-empty", hullEmpty);
    });
    if (hullItem?.isConnected) hullItem.classList.toggle("hull-empty-state", hullEmpty);
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
  const unsubs = [];
  unsubs.push(subscribeKey(state, "stats_vent", schedule));
  unsubs.push(subscribeKey(state, "stats_power", schedule));
  unsubs.push(subscribeKey(state, "stats_cell_power", schedule));
  unsubs.push(subscribeKey(state, "stats_stirling_power", schedule));
  unsubs.push(subscribeKey(state, "stats_heat_generation", schedule));
  unsubs.push(subscribeKey(state, "current_heat", schedule));
  unsubs.push(subscribeKey(state, "max_heat", schedule));
  sync();
  ui._statsBarUnmount = () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };
  if (!ui._unmounts) ui._unmounts = [];
  ui._unmounts.push(ui._statsBarUnmount);
  mountExoticParticlesDisplayIfNeeded(ui);
  ui._statsBarReactiveMounted = true;
}

function mountEngineStatusReactive(ui) {
  if (ui._engineStatusUnmount) {
    const existing = document.getElementById("engine_status_indicator_root");
    if (existing?.isConnected) return;
    ui._engineStatusUnmount();
    ui._engineStatusUnmount = null;
  }
  const root = document.getElementById("engine_status_indicator_root");
  if (!isLitRenderContainer(root) || !ui.game?.state) return;
  const renderFn = (state) => {
    const statusClass = classMap({
      "engine-running": state.engine_status === EngineStatus.RUNNING,
      "engine-paused": state.engine_status === EngineStatus.PAUSED,
      "engine-stopped": state.engine_status === EngineStatus.STOPPED,
      "engine-tick": state.engine_status === EngineStatus.TICK,
      "engine-simulation-error": state.engine_status === EngineStatus.SIMULATION_ERROR,
    });
    return engineStatusIndicatorTemplate({ statusClass });
  };
  ui._engineStatusUnmount = bindLitRenderKeyed(
    ui.game.state,
    ["engine_status", "simulation_error_message"],
    renderFn,
    root
  );
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(ui._engineStatusUnmount);
}

function mountTickCadenceNav(ui) {
  if (ui._tickCadenceNavListenersAttached) return;
  const el = getUiElement(ui, "tps_display");
  if (!el || !ui.game?.state) return;
  const update = () => {
    el.textContent = formatSimulationTickLine(ui.game);
  };
  update();
  const onPatch = (patch) => {
    if (patch && Object.prototype.hasOwnProperty.call(patch, "loop_wait")) update();
  };
  ui.game.on("statePatch", onPatch);
  ui._tickCadenceNavUnmount = () => {
    ui.game.off("statePatch", onPatch);
  };
  ui._tickCadenceNavListenersAttached = true;
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
    accountTitle: ui.uiState?.user_account_display?.title ?? "Account",
    onToggleAutoSell: hasAutoSellUpgrade ? toggleHandler("auto_sell") : null,
    onToggleAutoBuy: hasAutoBuyUpgrade ? toggleHandler("auto_buy") : null,
    onToggleHeatControl: hasHeatControlUpgrade ? toggleHandler("heat_control") : null,
    onTogglePause: toggleHandler("pause"),
  });
}

export function initializeControlDeckToggleButtons(ui) {
  if (ui._controlsNavReactiveMounted) {
    const root = document.getElementById("controls_nav_root");
    if (root?.isConnected) return;
    if (typeof ui._controlsNavUnmount === "function") {
      safeCall(() => { ui._controlsNavUnmount(); });
      ui._controlsNavUnmount = null;
    }
    ui._controlsNavReactiveMounted = false;
  }
  const root = document.getElementById("controls_nav_root");
  if (root && ui.game?.state) {
    const renderFn = () => buildControlsNavTemplate(ui, ui.game.state);
    ui._controlsNavUnmount = bindLitRenderMulti(
      [
        { state: ui.game.state, keys: ["auto_sell", "auto_buy", "heat_control", "pause"] },
        ...(ui.uiState ? [{ state: ui.uiState, keys: ["user_account_display"] }] : []),
      ],
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

export function updateControlDeckPercentageBar(ui, currentKey, maxKey, domElement) {
  if (!domElement) return;
  const st = ui.game?.state;
  const current = toNumber(st?.[currentKey] ?? 0);
  const max = toNumber(st?.[maxKey] ?? 1) || 1;
  domElement.style.width = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
}


