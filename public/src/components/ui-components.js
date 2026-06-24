import { REACTOR_HEAT_STANDARD_DIVISOR } from "../constants/sim.js";
import { VENT_BONUS_PERCENT_DIVISOR } from "../simUtils.js";
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
  actions,
  pwaState,
} from "../store.js";
import { getAppContext } from "../app-context.js";
import { StorageUtils } from "../storage/index.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { toNumber, toDecimal } from "../simUtils.js";
import { getPartImagePath } from "../core/part-images.js";
import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { vuQuantizePercent, vuLitFromPercent, vuHeatRedWidthPercent } from "../core/math-helpers.js";
import { readThemeColor } from "../theme-colors.js";
import { getCompactLayout, serializeReactor } from "../layout/reactor-codec.js";
import { formatNumberCompactIntl } from "../format/numbers.js";
import { calculateSectionCounts, findTopAffordableInSection } from "../logic-upgrade-sections.js";
import { UpgradeCard, CloseButton, PartButton, partsModuleInfoCardTemplate } from "./button-factory.js";
import { MODAL_IDS } from "../modalIds.js";
import { bindLitRenderMulti, bindLitRenderKeyed } from "../dom/lit-reactive.js";
import { leaderboardService } from "../services-leaderboard.js";
import { requestWakeLock, releaseWakeLock } from "../services-pwa.js";
import {
  clipToGrid,
  getCostBreakdown,
  applyBlueprintLayout,
  deserializeReactor,
  filterLayoutByCheckedTypes,
  calculateCurrentSellValue,
  buildAffordableLayout,
  buildPasteState,
  validatePasteResources,
  calculateLayoutCostBreakdown,
} from "../domain/blueprint.js";
import {
  mergeComponents,
  renderComponentIcons,
} from "./ui-blueprint-helpers.js";
import {
  getUiElement,
  getPageReactor,
  getPageReactorWrapper,
  getPageReactorBackground,
  isLitRenderContainer,
  dedupeReactorStatsDom,
} from "./page-dom.js";
import { dispatchToggleIntent } from "./ui-intents.js";
import {
  setupMacroToolbar,
  updateQuickSelectSlots,
  closePartsPanel,
  updatePartsPanelBodyClass,
  togglePartsPanelForBuildButton,
} from "./ui-parts-panel.js";
import { getBarVisuals } from "./ui-control-deck.js";
import { teardownAffordabilityIndicators } from "./ui-nav.js";

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
} from "./ui-control-deck.js";

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
} from "./ui-nav.js";

export {
  getUiConfigDisplayValue,
  snapUiDisplayValuesFromState,
  syncUiDisplayValueTargetsFromState,
  applyUiStateToDom,
  applyUiStateToDomForKeys,
  processUiUpdateQueue,
  updateUiRollingNumbers,
  startRenderLoop,
} from "./ui-render-loop.js";
import { syncGameTogglesFromState } from "../logic/game-state-sync.js";
import { compileTraitBitmask } from "../traits.js";
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
  layoutViewModalTemplate,
  quickStartTemplate as quickStartOverlayTemplate,
  engineStatusIndicatorTemplate,
  navIndicatorTemplate,
  sectionHubMetaTemplate,
  plainTextTemplate,
  quickSelectSlotTemplate,
} from "../templates/uiComponentsTemplates.js";
import { classMap, styleMap, repeat, unsafeHTML, resolveDomElement, BaseComponent, escapeHtml } from "../dom/lit.js";
import {
  updateToastTemplate,
  changelogModalTemplate,
  versionCheckToastTemplate,
} from "../templates/servicesTemplates.js";

const VENTING_ANIM_MS = 400;
const INFO_BAR_CATHODE_IDS = ["info_money_desktop", "info_money", "info_ep_value_desktop", "info_ep_value"];


export {
  getUiElement,
  getPageReactor,
  getPageReactorWrapper,
  getPageReactorBackground,
  isLitRenderContainer,
  dedupeReactorStatsDom,
} from "./page-dom.js";

export { HeatVisualsUI, GridInteractionUI } from "./ui-heat-visuals.js";
export { myLayoutsTemplate, layoutViewTemplate } from "./ui-layout-templates.js";


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
    try { ui._infoBarUnmount(); } catch (_) {}
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
    ui._affordabilityBannerUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
    ui._affordabilityBannerUnmounts = [];
  }
  ui._affordabilityBannerMountedUpgrades = false;
  ui._affordabilityBannerMountedResearch = false;

  if (ui._navLeaderboardUnmounts?.length) {
    ui._navLeaderboardUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
    ui._navLeaderboardUnmounts = [];
  }

  if (typeof ui._statsBarUnmount === "function") {
    try { ui._statsBarUnmount(); } catch (_) {}
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
    try { ui._controlsNavUnmount(); } catch (_) {}
    ui._controlsNavUnmount = null;
  }
  ui._controlsNavReactiveMounted = false;

  if (typeof ui._partsPanelReactiveUnmount === "function") {
    try { ui._partsPanelReactiveUnmount(); } catch (_) {}
    ui._partsPanelReactiveUnmount = null;
  }

  if (typeof ui._tickCadenceNavUnmount === "function") {
    ui._tickCadenceNavUnmount();
    ui._tickCadenceNavUnmount = null;
  }
  ui._tickCadenceNavListenersAttached = false;

  if (ui._layoutUnmounts?.length) {
    ui._layoutUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
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
} from "./ui-parts-panel.js";

export { InputHandler } from "./input-manager.js";
export {
  runPopulateUpgradeSection,
  updateSectionCountsState,
  mountSectionCountsReactive,
  getUpgradeSectionContainer,
  appendUpgradeToSection,
  showUpgradeDebugPanel,
  hideUpgradeDebugPanel,
  updateUpgradeDebugVariables,
  collectUpgradeDebugGameVariables,
} from "./ui-upgrade-hub.js";
export {
  UserAccountUI,
  PwaDisplayModeUI,
  QuickStartUI,
  bindDeviceFeatures,
  initPwaDisplayMode,
  subscribeToContextModalEvents,
  unsubscribeContextModalEvents,
  quickStartTemplate,
} from "./ui-device-shell.js";

export class ComponentRenderingUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(container, summary, options = {}, onSlotClick) {
    const template = renderComponentIcons(summary, options, onSlotClick);
    render(template, container);
  }
}


export { clipToGrid, getCostBreakdown, applyBlueprintLayout, computeBlueprintDiff, applyBlueprintLayoutDiff, calculateLayoutCost } from "../domain/blueprint.js";
export { mergeComponents, renderComponentIcons } from "./ui-blueprint-helpers.js";
export {
  deserializeReactor,
  deserializeReactorInput,
  filterLayoutByCheckedTypes,
  calculateCurrentSellValue,
  buildAffordableLayout,
  buildPasteState,
  validatePasteResources,
  calculateLayoutCostBreakdown,
  calculateLayoutDiffBreakdown,
} from "../domain/blueprint.js";
export { encodeLayoutShare, decodeLayoutShare, isLayoutShareCode } from "../core/layoutShareCodec.js";





export {
  renderLayoutPreview,
  buildPartSummary,
  buildAffordableSet,
} from "./ui-reactor-layout.js";
export { getCompactLayout, serializeReactor } from "../layout/reactor-codec.js";
export {
  CopyPasteUI,
  hideCopyPasteModal,
  setupCopyAction,
  setupPasteAction,
} from "./ui-copy-paste.js";

export { ClipboardUI } from "./ui-clipboard.js";
export {
  initializePage,
  loadAndSetVersionForPage,
  clearPageReactor,
  setPageGridContainer,
  setupUpgradeHubCollapsibleSections,
  setupAboutScrollHint,
  setupResearchCollapsibleSections,
  setupVersionDisplayForPage,
} from "./ui-page-init.js";
export { MeltdownUI } from "./ui-meltdown.js";

