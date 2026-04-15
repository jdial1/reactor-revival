import { numFormat as fmt, on, StorageUtils, StorageAdapter, toNumber } from "../utils.js";
import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { StateManager, createUIState, initUIStateSubscriptions, subscribeKey } from "../store.js";
import { InputHandler } from "./input-manager.js";
import { createModalOrchestrator } from "./ui-modals.js";
import { GridScaler, GridCanvasRenderer } from "./ui-grid.js";
import { leaderboardService } from "../services.js";
import { logger } from "../utils.js";
import {
  ComponentRenderingUI,
  runPopulateUpgradeSection,
  mountSectionCountsReactive,
  updateSectionCountsState,
  CopyPasteUI,
  UserAccountUI,
  PageSetupUI,
  HeatVisualsUI,
  GridInteractionUI,
  PerformanceUI,
  MeltdownUI,
  bindDeviceFeatures,
  setupBuildTabButton,
  setupMenuTabButton,
  setupDesktopTopNavButtons,
  teardownTabSetupUI,
  updateNavIndicators as paintNavAffordabilityDots,
  teardownAffordabilityIndicators,
  setupKeyboardShortcuts,
  setupCtrl9Handlers,
  startCtrl9MoneyIncrease,
  stopCtrl9MoneyIncrease,
  setupNavListeners,
  setupResizeListeners,
  PwaDisplayModeUI,
  QuickStartUI,
  ClipboardUI,
  mountInfoBar,
  syncMobileControlDeckMounts,
  setupPartsPanel,
  initializeControlDeckToggleButtons,
  initControlDeckVarObjs,
  cacheDomElements,
  startRenderLoop,
  getUiElement,
  initializePage,
  getUpgradeSectionContainer,
  appendUpgradeToSection,
  subscribeToContextModalEvents,
  unsubscribeContextModalEvents,
  updateQuickSelectSlots,
  updatePartsPanelBodyClass,
  refreshPartsPanel,
  getPageReactor,
  snapUiDisplayValuesFromState,
  applyUiStateToDom,
  processUiUpdateQueue,
  updateUiRollingNumbers,
} from "./ui-components.js";
import { ReactiveLitComponent } from "./reactive-lit-component.js";
import { getValidatedGameData } from "../services.js";
import { MOBILE_BREAKPOINT_PX } from "../utils.js";
import { ObjectiveController, checkObjectiveTextScrolling as applyObjectiveToastTitle } from "../logic.js";
import { GridController, AudioController } from "./controllers/controllers.js";
import { attachAudioSys } from "../audio.sys.js";
import { mountHeatRatioStrip, mountEngineStatusChip, mountMuteIndicator } from "../ui.views.js";

export function getRoot(selector) {
  return document.querySelector(selector);
}

export function getSplashContainer() {
  return getRoot("#splash-container");
}

export function getWrapper() {
  return getRoot("#wrapper");
}

export function getReactor() {
  return getRoot("#reactor");
}

let _domMapperInitPromise = null;

export async function init() {
  if (_domMapperInitPromise) return _domMapperInitPromise;
  if (document.readyState === "loading") {
    _domMapperInitPromise = new Promise((resolve) => {
      document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  } else {
    _domMapperInitPromise = Promise.resolve();
  }
  return _domMapperInitPromise;
}

if (typeof window !== "undefined") {
  window.domMapper = { getRoot, getSplashContainer, getWrapper, getReactor, init };
}

export const domMapper = typeof window !== "undefined" ? window.domMapper : null;
export default domMapper;

const MY_LAYOUTS_STORAGE_KEY = 'reactor_my_layouts';

function getPowerNetChangeFromStats(ui) {
  const fromState = ui.game?.state?.power_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const st = ui.game?.state;
  const statsPower = toNumber(st?.stats_power || 0);
  const autoSellEnabled = st?.auto_sell || false;
  const autoSellMultiplier = toNumber(ui.game?.reactor?.auto_sell_multiplier || 0);
  if (autoSellEnabled && autoSellMultiplier > 0) {
    return statsPower - statsPower * autoSellMultiplier;
  }
  return statsPower;
}

function getHeatNetChangeFromStats(ui) {
  const fromState = ui.game?.state?.heat_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const st = ui.game?.state;
  const statsNetHeat = st?.stats_net_heat;
  let baseNetHeat;
  if (typeof statsNetHeat === "number" && !isNaN(statsNetHeat)) {
    baseNetHeat = statsNetHeat;
  } else {
    const totalHeat = toNumber(st?.stats_heat_generation || 0);
    const statsVent = toNumber(st?.stats_vent || 0);
    const statsOutlet = toNumber(st?.stats_outlet || 0);
    baseNetHeat = totalHeat - statsVent - statsOutlet;
  }
  const currentPower = toNumber(st?.current_power || 0);
  const statsPower = toNumber(st?.stats_power || 0);
  const maxPower = toNumber(st?.max_power || 0);
  const potentialPower = currentPower + statsPower;
  const excessPower = Math.max(0, potentialPower - maxPower);
  const overflowToHeat = ui.game?.reactor?.power_overflow_to_heat_ratio ?? 1;
  const overflowHeat = excessPower * overflowToHeat;
  const manualReduce = toNumber(ui.game?.reactor?.manual_heat_reduce || ui.game?.base_manual_heat_reduce || 1);
  return baseNetHeat + overflowHeat - manualReduce;
}

function initMainLayoutInner(ui) {
  ui.setupEventListeners();
  initializeControlDeckToggleButtons(ui);
  ui.initializeControlDeck();
  setupPartsPanel(ui);
  cacheDomElements(ui);
  initControlDeckVarObjs(ui);
  ui.quickStartUI.addHelpButtonToMainPage();
  ui.userAccountUI.setupUserAccountButton();
  setupBuildTabButton(ui);
  setupMenuTabButton(ui);
  setupDesktopTopNavButtons(ui);
  ui.deviceFeatures.updateWakeLockState();
  const basicOverview = getUiElement(ui, "basic_overview_section") ?? ui.DOMElements?.basic_overview_section;
  if (basicOverview && ui.help_text?.basic_overview) {
    render(html`
      <h3>${ui.help_text.basic_overview.title}</h3>
      <p>${unsafeHTML(ui.help_text.basic_overview.content)}</p>
    `, basicOverview);
  }
  if (ui.gridScaler) ui.gridScaler.init();
  if (document.getElementById("reactor_wrapper")) {
    ui.gridScaler.resize();
  }
  requestAnimationFrame((ts) => startRenderLoop(ui, ts));
  if (ui.game && ui.game.engine && ui.game.state) {
    const status = ui.game.paused ? "paused" : (ui.game.engine.running ? "running" : "stopped");
    ui.game.state.engine_status = status;
  }
}

function installGameStateEngineSync(ui) {
  const game = ui.game;
  if (!game?.state) return () => {};
  const sync = () => {
    const s = game.state;
    const r = game.reactor;
    if (r) {
      r.auto_sell_enabled = !!s.auto_sell;
      r.auto_buy_enabled = !!s.auto_buy;
      r.heat_controlled = !!s.heat_control;
    }
    const p = !!s.pause;
    if (game.paused !== p) {
      game.paused = p;
      const eng = game.engine;
      if (eng) {
        if (p) eng.stop();
        else eng.start();
      }
    }
  };
  const keys = ["pause", "auto_sell", "auto_buy", "heat_control"];
  const unsubs = keys.map((k) => subscribeKey(game.state, k, sync));
  sync();
  return () => unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
}

export function dispatchUiIntent(game, ui, intent, e) {
  if (!game || !ui) return;
  const btn = e?.currentTarget;
  
  game.state.intent_queue.push({
    action: intent,
    timestamp: Date.now(),
    payload: { sourceId: btn?.id }
  });
}

export function bindIntentDelegation(game, ui, root) {
  if (!root || root._intentDelegationBound) return;
  const handler = (ev) => {
    const t = ev.target.closest("[data-intent]");
    if (!t || !root.contains(t)) return;
    const id = t.getAttribute("data-intent");
    if (!id) return;
    dispatchUiIntent(game, ui, id, { currentTarget: t, target: ev.target });
  };
  root.addEventListener("click", handler);
  root._intentDelegationBound = true;
  return () => {
    root.removeEventListener("click", handler);
    root._intentDelegationBound = false;
  };
}

export function installAppRootIntentDelegation(game, ui) {
  const root = getWrapper();
  const teardown = bindIntentDelegation(game, ui, root);
  return typeof teardown === "function" ? teardown : () => {};
}

class LayoutStorageUI {
  constructor(ui) {
    this.ui = ui;
  }
  static get MY_LAYOUTS_STORAGE_KEY() {
    return MY_LAYOUTS_STORAGE_KEY;
  }
  getMyLayouts() {
    try {
      const arr = StorageUtils.get(MY_LAYOUTS_STORAGE_KEY);
      if (!arr) return [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  saveMyLayouts(layouts) {
    StorageUtils.set(MY_LAYOUTS_STORAGE_KEY, layouts);
  }
  addToMyLayouts(name, data) {
    const list = this.getMyLayouts();
    list.unshift({
      id: String(Date.now()),
      name: name || `Layout ${list.length + 1}`,
      data,
      createdAt: Date.now()
    });
    this.saveMyLayouts(list);
  }
  removeFromMyLayouts(id) {
    const list = this.getMyLayouts().filter((e) => e.id !== id);
    this.saveMyLayouts(list);
  }
}

class ObjectivesUI {
  constructor(ui, controller = null) {
    this.ui = ui;
    this.controller = controller;
  }
  checkTextScrolling() {
    const toastTitleEl = getUiElement(this.ui, "objectives_toast_title") ?? document.getElementById("objectives_toast_title");
    if (!toastTitleEl) return;
    applyObjectiveToastTitle({ objectives_toast_title: toastTitleEl });
  }
  markComplete() {
    const toastBtn = getUiElement(this.ui, "objectives_toast_btn") ?? document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("is-complete");
    if (typeof this.animateObjectiveCompletion === "function") this.animateObjectiveCompletion();
  }
  updateObjectiveDisplay() {
    if (this.controller) return this.controller.updateDisplay();
  }
  updateObjectiveDisplayFromState() {
    if (this.controller) return this.controller.updateDisplayFromState();
  }
  animateObjectiveCompletion() {
    if (this.controller) return this.controller.animateCompletion();
  }
  showObjectivesForPage(pageId) {
    if (this.ui?.uiState) {
      this.ui.uiState.active_page = pageId;
      this.ui.uiState.active_route = pageId;
    }
    if (this.controller) return this.controller.showForPage(pageId);
  }
  setupObjectivesListeners() {
    if (this.controller) return this.controller.setupListeners();
  }
}

class PauseStateUI {
  constructor(ui) {
    this.ui = ui;
  }
  updatePauseState() {
    if (!this.ui.game?.state) return;
    const statePaused = this.ui.game.state.pause;
    const isPaused = statePaused === undefined ? !!this.ui.game?.paused : !!statePaused;
    if (this.ui.uiState) this.ui.uiState.is_paused = !!isPaused;
    const doc = (typeof globalThis !== "undefined" && globalThis.document) || (typeof document !== "undefined" && document);
    if (doc?.body) doc.body.classList.toggle("game-paused", !!isPaused);
    if (isPaused) {
      const unpauseBtn = document.getElementById("unpause_btn");
      if (unpauseBtn && !unpauseBtn.hasAttribute("data-listener-added")) {
        unpauseBtn.addEventListener("click", () => {
          this.ui.game.onToggleStateChange?.("pause", false);
        });
        unpauseBtn.setAttribute("data-listener-added", "true");
      }
    }
  }
}

export { getPowerNetChangeFromStats as getPowerNetChange, getHeatNetChangeFromStats as getHeatNetChange };

export class UI {
  constructor() {
    this.game = null;
    this.DOMElements = {};
    this.var_objs_config = {};
    this.last_money = 0;
    this.last_exotic_particles = 0;
    this.uiState = createUIState();
    this._uiStateTeardown = null;
    this.update_interface_interval = 100;
    this.last_interface_update = 0;
    this.update_interface_task = null;
    this._updateLoopRunning = false;
    this.stateManager = new StateManager(this);
    this.inputHandler = new InputHandler(this);
    this.modalOrchestrator = createModalOrchestrator();
    this.gridScaler = new GridScaler(this);
    this.gridCanvasRenderer = new GridCanvasRenderer(this);
    this.help_mode_active = false;
    this.copyPasteUI = new CopyPasteUI(this);
    this.copyPaste = this.copyPasteUI;
    this.userAccountUI = new UserAccountUI(this);
    this.pageSetupUI = new PageSetupUI(this);
    this.objectiveController = new ObjectiveController({
      getGame: () => this.game,
      getUI: () => this,
      getStateManager: () => this.stateManager,
      cacheDOMElements: () => cacheDomElements(this),
      lightVibration: () => this.deviceFeatures?.lightVibration?.(),
    });
    this.objectivesUI = new ObjectivesUI(this, this.objectiveController);
    this.heatVisualsUI = new HeatVisualsUI(this);
    this.gridInteractionUI = new GridInteractionUI(this);
    this.gridController = new GridController({
      getHighlightedSegment: () => this.gridInteractionUI.highlightedSegment,
      getInputManager: () => this.inputHandler,
      getGame: () => this.game,
      getUI: () => this,
      spawnTileIcon: (k, from, to) => this.gridInteractionUI.spawnTileIcon(k, from, to),
      blinkVent: (t) => this.gridInteractionUI.blinkVent(t),
      clearAllActiveAnimations: () => this.gridInteractionUI.clearAllActiveAnimations(),
      getAnimationStatus: () => this.gridInteractionUI.getAnimationStatus(),
      clearReactorHeat: () => this.gridInteractionUI.clearReactorHeat(),
    pulseReflector: (a, b) => this.gridInteractionUI.pulseReflector(a, b),
    emitEP: (t) => this.gridInteractionUI.emitEP(t),
  });
  this.audioController = new AudioController({ getAudioService: () => this.game?.audio, getUI: () => this });
    this.performanceUI = new PerformanceUI(this);
    this.meltdownUI = new MeltdownUI(this);
    this.layoutStorageUI = new LayoutStorageUI(this);
    this.componentRenderingUI = new ComponentRenderingUI(this);
    this.deviceFeatures = bindDeviceFeatures(this);
    this.pwaDisplayModeUI = new PwaDisplayModeUI(this);
    this.quickStartUI = new QuickStartUI(this);
    this.pauseStateUI = new PauseStateUI(this);
    this.clipboardUI = new ClipboardUI(this);

    this.ctrl9HoldTimer = null;
    this.ctrl9HoldStartTime = null;
    this.ctrl9MoneyInterval = null;
    this.ctrl9BaseAmount = 1000000000;
    this.ctrl9ExponentialRate = 5;
    this.ctrl9IntervalMs = 100;

    this._lastUiTime = 0;

    this.displayValues = {
      money: { current: 0, target: 0 },
      heat: { current: 0, target: 0 },
      power: { current: 0, target: 0 },
      ep: { current: 0, target: 0 },
    };

    this._visualPool = { floatingText: [], steamParticle: [], bolt: [] };
    this.detachGameEventListeners = null;
    this._unmounts = [];
    this._icons = {
      power: "img/ui/icons/icon_power.png",
      heat: "img/ui/icons/icon_heat.png",
    };
    this.updateQuickSelectSlots = () => updateQuickSelectSlots(this);
    this.updatePartsPanelBodyClass = () => updatePartsPanelBodyClass(this);
    this.refreshPartsPanel = () => refreshPartsPanel(this);
    this.getUpgradeContainer = (k) => getUpgradeSectionContainer(this, k);
    this.appendUpgrade = (k, el) => appendUpgradeToSection(this, k, el);
    this.cacheDomElements = (pageId) => cacheDomElements(this, pageId);
    this.getUiElement = (id) => getUiElement(this, id);
    this.snapUiDisplayValuesFromState = () => snapUiDisplayValuesFromState(this);
    this.applyUiStateToDom = () => applyUiStateToDom(this);
    this.processUiUpdateQueue = () => processUiUpdateQueue(this);
    this.updateUiRollingNumbers = (dt) => updateUiRollingNumbers(this, dt);
    this.startRenderLoop = (ts) => startRenderLoop(this, ts);
  }

  _renderVisualEvents(eventBufferDescriptor) {
    if (!eventBufferDescriptor || eventBufferDescriptor.head === eventBufferDescriptor.tail) return;
    const { buffer, head, tail, max } = eventBufferDescriptor;
    const tileset = this.game?.tileset;
    if (!tileset || !buffer) return;
    let pos = tail;
    while (pos !== head) {
      const idx = pos * 4;
      const typeId = buffer[idx];
      const row = buffer[idx + 1];
      const col = buffer[idx + 2];
      const t = tileset.getTile(row, col);
      if (t) {
        if (typeId === 1) {
          this.gridController.spawnTileIcon("power", t, null);
        } else if (typeId === 2 && t.part?.category === "vent") {
          this.gridController.blinkVent(t);
        }
      }
      pos = (pos + 1) % max;
    }
    if (this.game?.engine && typeof this.game.engine.ackEvents === "function") {
      this.game.engine.ackEvents(head);
    }
  }

  showFloatingText(container, amount) {
    if (!container || amount <= 0) return;
    const parent = container.querySelector(".floating-text-container");
    if (!parent) return;
    const pool = this._visualPool;
    const textEl = pool.floatingText.pop() || Object.assign(document.createElement("div"), { className: "floating-text" });
    textEl.textContent = `+$${fmt(amount)}`;
    parent.appendChild(textEl);
    setTimeout(() => {
      textEl.remove();
      pool.floatingText.push(textEl);
    }, 1000);
  }

  showFloatingTextAtTile(tile, amount) {
    if (!tile || amount <= 0) return;
    const overlay = this.heatVisualsUI._ensureOverlay();
    if (!overlay) return;
    const pos = this.heatVisualsUI._tileCenterToOverlayPosition(tile.row, tile.col);
    const pool = this._visualPool;
    const textEl = pool.floatingText.pop() || Object.assign(document.createElement("div"), { className: "floating-text" });
    textEl.textContent = `+$${fmt(amount)}`;
    textEl.style.left = `${pos.x}px`;
    textEl.style.top = `${pos.y}px`;
    overlay.appendChild(textEl);
    setTimeout(() => {
      textEl.remove();
      pool.floatingText.push(textEl);
    }, 1000);
  }

  initParticleCanvas() {}

  resizeParticleCanvas() {}

  createSteamParticles() {}

  createBoltParticle() {}

  createSellSparks() {}

  _cleanupVentRotor(tile) {
    this.gridInteractionUI._cleanupVentRotor(tile);
  }

  getPowerNetChange() {
    return getPowerNetChangeFromStats(this);
  }

  getHeatNetChange() {
    return getHeatNetChangeFromStats(this);
  }

  getSellingTile() {
    return this.gridInteractionUI?.getSellingTile?.() ?? null;
  }

  getHoveredTile() {
    return this.gridInteractionUI?.getHoveredTile?.() ?? null;
  }

  getHighlightedTiles() {
    return this.gridInteractionUI?.getHighlightedTiles?.() ?? [];
  }

  setHelpModeActive(active) {
    this.help_mode_active = !!active;
    document.body?.classList.toggle("help-mode-active", this.help_mode_active);
  }

  resizeReactor() {
    this.gridScaler.resize();
  }

  initializeCopyPasteUI() {
    this.copyPaste.init();
  }

  setupUpgradeCardHoverBuzz() {
    if (this._upgradeBuzzSetup) return;
    this._upgradeBuzzSetup = true;
    const onMouseOver = (e) => {
      const card = e.target.closest(".upgrade-card");
      if (!card) return;
      const prev = e.relatedTarget;
      if (prev && card.contains(prev)) return;
      this.deviceFeatures?.upgradeCardHoverBuzz?.();
    };
    document.getElementById("upgrades_content_wrapper")?.addEventListener("mouseover", onMouseOver);
    document.getElementById("experimental_upgrades_content_wrapper")?.addEventListener("mouseover", onMouseOver);
  }

  initMainLayout() {
    if (typeof this._gameStateSyncTeardown === "function") {
      this._gameStateSyncTeardown();
      this._gameStateSyncTeardown = null;
    }
    initMainLayoutInner(this);
    if (this.game?.state) {
      this._gameStateSyncTeardown = installGameStateEngineSync(this);
    }
    this._uiStateTeardown = initUIStateSubscriptions(this.uiState, this);
  }

  startCtrl9MoneyIncrease() {
    startCtrl9MoneyIncrease(this);
  }

  stopCtrl9MoneyIncrease() {
    stopCtrl9MoneyIncrease(this);
  }

  async init(game) {
    const { helpText } = getValidatedGameData();
    this.help_text = helpText?.default || helpText;
    this.game = game;
    if (game?.upgradeset?.setPopulateSectionFn) {
      game.upgradeset.setPopulateSectionFn(runPopulateUpgradeSection);
    }
    this.stateManager = new StateManager(this);
    this.stateManager.setGame(game);
    game.on("tickRecorded", () => this.performanceUI?.recordTick?.());
    this.meltdownUI.subscribeToMeltdownEvents(game);
    subscribeToContextModalEvents(this, game);
    this.audioController.attach(game);
    const audioUnmount = attachAudioSys(() => this.game?.audio, () => this.game);
    if (typeof audioUnmount === "function") this._unmounts.push(audioUnmount);
    const heatStripHost = typeof document !== "undefined" ? document.getElementById("info_bar") : null;
    if (heatStripHost && !document.getElementById("ui_views_heat_strip_host")) {
      const h = document.createElement("div");
      h.id = "ui_views_heat_strip_host";
      h.className = "ui-views-heat-strip-host";
      heatStripHost.insertBefore(h, heatStripHost.firstChild);
      const heatUnmount = mountHeatRatioStrip(game, h);
      if (typeof heatUnmount === "function") this._unmounts.push(heatUnmount);
    }
    if (heatStripHost && !document.getElementById("ui_views_engine_chip_host")) {
      const ec = document.createElement("div");
      ec.id = "ui_views_engine_chip_host";
      ec.className = "ui-views-engine-chip-host";
      const afterHeat = document.getElementById("ui_views_heat_strip_host");
      if (afterHeat?.parentNode) {
        afterHeat.after(ec);
      } else {
        heatStripHost.insertBefore(ec, heatStripHost.firstChild);
      }
      const engineUnmount = mountEngineStatusChip(game, ec);
      if (typeof engineUnmount === "function") this._unmounts.push(engineUnmount);
    }
    if (heatStripHost && !document.getElementById("ui_views_mute_host")) {
      const mh = document.createElement("div");
      mh.id = "ui_views_mute_host";
      mh.className = "ui-views-mute-host";
      const afterEngine = document.getElementById("ui_views_engine_chip_host");
      const afterHeat = document.getElementById("ui_views_heat_strip_host");
      if (afterEngine?.parentNode) {
        afterEngine.after(mh);
      } else if (afterHeat?.parentNode) {
        afterHeat.after(mh);
      } else {
        heatStripHost.insertBefore(mh, heatStripHost.firstChild);
      }
      const muteUnmount = mountMuteIndicator(mh);
      if (typeof muteUnmount === "function") this._unmounts.push(muteUnmount);
    }
    this.inputHandler.setup();
    this.modalOrchestrator.init(this);
    this.gridInteractionUI.clearAllActiveAnimations();
    return true;
  }

  forceReactorRealignment() {
    const reactor = getPageReactor(this) ?? this.DOMElements?.reactor;
    if (!this.game || !reactor) return;
    const originalDisplay = reactor.style.display;
    reactor.style.display = "none";
    reactor.offsetHeight;
    reactor.style.display = originalDisplay;
    this.gridScaler.resize();
  }

  setupEventListeners() {
    setupNavListeners(this);
    setupKeyboardShortcuts(this);
    setupCtrl9Handlers(this);
    setupResizeListeners(this);
    mountInfoBar(this);
    this.copyPaste.setupCopyStateButton();
    this.objectivesUI.setupObjectivesListeners();
    if (this.game) {
      if (typeof this._teardownIntentDelegation === "function") {
        this._teardownIntentDelegation();
        this._teardownIntentDelegation = null;
      }
      this._teardownIntentDelegation = installAppRootIntentDelegation(this.game, this);
    }
  }

  static get MY_LAYOUTS_STORAGE_KEY() { return LayoutStorageUI.MY_LAYOUTS_STORAGE_KEY; }

  initializeControlDeck() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    syncMobileControlDeckMounts(this);
  }

  async resetReactor() {
    logger.log('debug', 'game', 'resetReactor method called - deleting save and returning to splash');
    try {
      await StorageAdapter.remove("reactorGameSave");
      logger.debug("Save file deleted from localStorage");
    } catch (error) {
      logger.log('error', 'game', 'Error deleting save file:', error);
    }
    logger.log('debug', 'game', 'Navigating to splash page');
    window.location.href = window.location.origin + window.location.pathname;
  }

  getApi() {
    return {
      getGame: () => this.game,
      getUI: () => this,
      getStateManager: () => this.stateManager,
    };
  }

  updateNavIndicators() {
    paintNavAffordabilityDots(this);
  }

  cleanup() {
    if (this.update_interface_task) {
      cancelAnimationFrame(this.update_interface_task);
      this.update_interface_task = null;
    }
    this._unmounts.forEach((fn) => { try { fn(); } catch (_) {} });
    this._unmounts = [];
    this._sectionCountsMountedUpgrades = false;
    this._sectionCountsMountedResearch = false;
    if (this.objectiveController?.unmount) this.objectiveController.unmount();
    this.meltdownUI.cleanup();
    if (typeof this.copyPasteUI?.teardownBlueprintPlanner === "function") {
      this.copyPasteUI.teardownBlueprintPlanner();
    }
    if (this._affordabilityBannerUnmounts?.length) {
      this._affordabilityBannerUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
      this._affordabilityBannerUnmounts = [];
    }
    this._affordabilityBannerMountedUpgrades = false;
    this._affordabilityBannerMountedResearch = false;
    this._versionDisplayMounted = false;
    teardownAffordabilityIndicators(this);
    teardownTabSetupUI(this);
    this.userAccountUI?.teardownUserAccountButton?.();
    if (this.game) unsubscribeContextModalEvents(this, this.game);
    if (typeof this.detachGameEventListeners === "function") {
      this.detachGameEventListeners();
      this.detachGameEventListeners = null;
    }
    if (this.stateManager?.teardown) this.stateManager.teardown();
    if (typeof this._teardownIntentDelegation === "function") {
      this._teardownIntentDelegation();
      this._teardownIntentDelegation = null;
    }
    if (typeof this._gameStateSyncTeardown === "function") {
      this._gameStateSyncTeardown();
      this._gameStateSyncTeardown = null;
    }
    if (typeof this._uiStateTeardown === "function") {
      this._uiStateTeardown();
      this._uiStateTeardown = null;
    }
    if (this.game?.tooltip_manager?.teardown) this.game.tooltip_manager.teardown();
    document.getElementById("ui_views_mute_host")?.remove();
    document.getElementById("ui_views_engine_chip_host")?.remove();
    document.getElementById("ui_views_heat_strip_host")?.remove();
  }
}
