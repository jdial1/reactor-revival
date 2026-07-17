import { safeCall, teardownAll } from "../core/teardown.js";
import { render } from "lit-html";
import { classMap, styleMap } from "../dom/lit.js";
import { toNumber } from "../simUtils.js";
import { numFormat as fmt, formatNumberCompactIntl } from "../core/numbers.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { getUiElement } from "./shell/page-dom.js";
import { getBarVisuals } from "./shell/ui-control-deck.js";
import { teardownAffordabilityIndicators } from "./shell/ui-nav.js";
import { togglePartsPanelForBuildButton } from "./shell/ui-parts-panel.js";
import { renderComponentIcons } from "./blueprints/ui-blueprint-helpers.js";
import { infoBarTemplate } from "../templates/uiComponentsTemplates.js";

export {
  getBarVisuals,
  formatSimulationTickLine,
  mountMobilePassiveBar,
  syncMobileControlDeckMounts,
  updateFailurePhaseSensory,
  setPageReactorVisibility,
  mountExoticParticlesDisplayIfNeeded,
  initControlDeckVarObjs,
  initializeControlDeckToggleButtons,
  syncToggleStatesFromGame,
  updateControlDeckPercentageBar,
} from "./shell/ui-control-deck.js";

export {
  updateLeaderboardIcon,
  updateNavIndicators,
  teardownAffordabilityIndicators,
  teardownTabSetupUI,
  setupBuildTabButton,
  setupMenuTabButton,
  setupDesktopTopNavButtons,
  setupNavListeners,
  teardownNavListeners,
  setupResizeListeners,
  teardownResizeListeners,
} from "./shell/ui-nav.js";

export {
  getUiConfigDisplayValue,
  snapUiDisplayValuesFromState,
  syncUiDisplayValueTargetsFromState,
  applyUiStateToDom,
  applyUiStateToDomForKeys,
  processUiUpdateQueue,
  updateUiRollingNumbers,
  startRenderLoop,
} from "./grid/ui-render-loop.js";
const VENTING_ANIM_MS = 400;
const INFO_BAR_CATHODE_IDS = ["info_money_desktop", "info_money", "info_ep_value_desktop", "info_ep_value"];


export {
  getUiElement,
  getPageReactor,
  getPageReactorWrapper,
  getPageReactorBackground,
  isLitRenderContainer,
  dedupeReactorStatsDom,
} from "./shell/page-dom.js";

export { HeatVisualsUI, GridInteractionUI } from "./grid/ui-heat-visuals.js";
export { myLayoutsTemplate, layoutViewTemplate } from "./blueprints/ui-layout-templates.js";


function resetInfoBarCathodeState(ui) {
  ui._cathodeInfoBarFirst = Object.fromEntries(INFO_BAR_CATHODE_IDS.map((id) => [id, true]));
  ui._cathodeInfoBarLast = {};
  ui._cathodeInfoBarTargets = null;
}

function resolveInfoBarCathodeEl(ui, id) {
  const root = ui._infoBarRoot;
  if (!root) return null;
  let el = ui._infoBarCathodeEls?.[id];
  if (!el?.isConnected) {
    el = root.querySelector(`#${id}`);
    if (!ui._infoBarCathodeEls) ui._infoBarCathodeEls = {};
    ui._infoBarCathodeEls[id] = el;
  }
  return el;
}

function infoBarCathodeAfterRender(ui) {
  const targets = ui._cathodeInfoBarTargets;
  if (!targets) return;
  for (const id of INFO_BAR_CATHODE_IDS) {
    const el = resolveInfoBarCathodeEl(ui, id);
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
    el.textContent = text;
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
    safeCall(() => { ui._infoBarUnmount(); });
    ui._infoBarUnmount = null;
  }
  ui._infoBarRoot = null;
  ui._infoBarCathodeEls = null;
  if (ui._infoBarAbortController) {
    ui._infoBarAbortController.abort();
    ui._infoBarAbortController = null;
  }
}

export function mountInfoBar(ui) {
  const root = getUiElement(ui, "info_bar_root");
  if (!root || !ui.game?.state) return;

  teardownInfoBar(ui);
  ui._infoBarRoot = root;
  resetInfoBarCathodeState(ui);
  ui._infoBarAbortController = new AbortController();
  const signal = ui._infoBarAbortController.signal;

  const subscriptions = [{
    state: ui.game.state,
    keys: ["current_power", "max_power", "current_heat", "max_heat", "current_money", "current_exotic_particles", "active_buffs", "melting_down", "power_net_change", "heat_net_change", "stats_power", "stats_net_heat"],
  }];
  ui._infoBarUnmount = bindLitRenderMulti(
    subscriptions,
    () => buildInfoBarTemplate(ui, ui.game.state),
    root,
    () => infoBarCathodeAfterRender(ui)
  );

  getUiElement(ui, "control_deck_build_fab")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePartsPanelForBuildButton(ui);
  }, { signal });

  ui._unmounts.push(() => teardownInfoBar(ui));
}

export function teardownGameLayout(ui) {
  if (!ui) return;

  teardownInfoBar(ui);
  teardownAffordabilityIndicators(ui);

  if (ui._affordabilityBannerUnmounts?.length) {
    teardownAll(ui._affordabilityBannerUnmounts);
    ui._affordabilityBannerUnmounts = [];
  }
  ui._affordabilityBannerMountedUpgrades = false;
  ui._affordabilityBannerMountedResearch = false;

  if (ui._navLeaderboardUnmounts?.length) {
    teardownAll(ui._navLeaderboardUnmounts);
    ui._navLeaderboardUnmounts = [];
  }

  if (typeof ui._statsBarUnmount === "function") {
    safeCall(() => { ui._statsBarUnmount(); });
    ui._statsBarUnmount = null;
  }
  ui._statsBarReactiveMounted = false;

  if (ui._engineStatusComponent) {
    ui._engineStatusComponent.unmount();
    ui._engineStatusComponent = null;
  }

  if (ui._controlDeckEpComponent) {
    ui._controlDeckEpComponent.unmount();
    ui._controlDeckEpComponent = null;
  }

  if (typeof ui._controlsNavUnmount === "function") {
    safeCall(() => { ui._controlsNavUnmount(); });
    ui._controlsNavUnmount = null;
  }
  ui._controlsNavReactiveMounted = false;

  if (typeof ui._partsPanelReactiveUnmount === "function") {
    safeCall(() => { ui._partsPanelReactiveUnmount(); });
    ui._partsPanelReactiveUnmount = null;
  }

  if (typeof ui._tickCadenceNavUnmount === "function") {
    ui._tickCadenceNavUnmount();
    ui._tickCadenceNavUnmount = null;
  }
  ui._tickCadenceNavListenersAttached = false;

  ui.inputHandler?.teardownAllListeners?.();

  if (ui._layoutUnmounts?.length) {
    teardownAll(ui._layoutUnmounts);
    ui._layoutUnmounts = [];
  }
  ui._uiViewHostsUnmount = null;

  ui._mobileControlDeckReactiveMounted = false;
  ui._mobilePassiveBarMounted = false;
  ui._sectionCountsMountedUpgrades = false;
  ui._sectionCountsMountedResearch = false;
  ui._versionDisplayMounted = false;
  ui._upgradeBuzzSetup = false;

  ui.heatVisualsUI?.resetOverlays?.();
  if (ui._visualPool) {
    ui._visualPool.floatingText = [];
    ui._visualPool.steamParticle = [];
    ui._visualPool.bolt = [];
  }
}

export {
  updatePartsPanelBodyClass,
  togglePartsPanelForBuildButton,
  unlockAllPartsForTesting,
  refreshPartsPanel,
  onPartsPanelActiveTabChanged,
  setupPartsTabs,
  setupMacroToolbar,
  updateMacroToolbar,
  updateQuickSelectSlots,
  closePartsPanel,
  initializePartsPanel,
  teardownPartsPanel,
  setupPartsPanel,
} from "./shell/ui-parts-panel.js";

export { InputHandler } from "./shell/input-manager.js";
export {
  runPopulateUpgradeSection,
  updateSectionCountsState,
  mountSectionCountsReactive,
  mountUpgradeDetailPanels,
  ensureUpgradeDetailPanelMounted,
  getUpgradeSectionContainer,
  appendUpgradeToSection,
  showUpgradeDebugPanel,
  hideUpgradeDebugPanel,
  updateUpgradeDebugVariables,
  collectUpgradeDebugGameVariables,
} from "./upgrades/ui-upgrade-hub.js";
export {
  UserAccountUI,
  PwaDisplayModeUI,
  QuickStartUI,
  bindDeviceFeatures,
  initPwaDisplayMode,
  subscribeToContextModalEvents,
  unsubscribeContextModalEvents,
  quickStartTemplate,
} from "./shell/ui-device-shell.js";

export class ComponentRenderingUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(container, summary, options = {}, onSlotClick) {
    const template = renderComponentIcons(summary, options, onSlotClick);
    render(template, container);
  }
}


export {
  clipToGrid,
  calculateLayoutCostBreakdown,
  computeBlueprintDiff,
  applyBlueprintLayoutDiff,
  calculateLayoutCost,
  deserializeReactor,
  deserializeReactorInput,
  filterLayoutByCheckedTypes,
  calculateCurrentSellValue,
  buildAffordableLayout,
  buildPasteState,
  validatePasteResources,
  calculateLayoutDiffBreakdown,
} from "../domain/blueprint.js";
export { renderComponentIcons } from "./blueprints/ui-blueprint-helpers.js";
export { encodeLayoutShare, decodeLayoutShare, isLayoutShareCode } from "../core/layoutShareCodec.js";





export {
  renderLayoutPreview,
  buildPartSummary,
  buildAffordableSet,
} from "./grid/ui-reactor-layout.js";
export { getCompactLayout, serializeReactor } from "../domain/reactor-codec.js";
export {
  CopyPasteUI,
  hideCopyPasteModal,
  setupCopyAction,
  setupPasteAction,
} from "./blueprints/ui-copy-paste.js";

export {
  initializePage,
  loadAndSetVersionForPage,
  clearPageReactor,
  setPageGridContainer,
  setupUpgradeHubCollapsibleSections,
  setupAboutScrollHint,
  setupResearchCollapsibleSections,
  setupVersionDisplayForPage,
} from "./shell/ui-page-init.js";
export { MeltdownUI } from "./shell/ui-meltdown.js";

