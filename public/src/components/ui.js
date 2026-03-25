import { numFormat as fmt, on, StorageUtils, StorageAdapter, toNumber } from "../utils.js";
import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { StateManager, createUIState, initUIStateSubscriptions } from "../state.js";
import { InputHandler } from "./InputManager.js";
import { ModalOrchestrator } from "./ui_modals.js";
import { GridScaler, GridCanvasRenderer } from "./ui_grid.js";
import { ParticleSystem, ParticleEffectsUI, VisualEventRendererUI } from "./VisualEffectsManager.js";
import { leaderboardService } from "../services.js";
import { logger } from "../utils.js";
import { UpgradesUI, ComponentRenderingUI, runPopulateUpgradeSection, mountSectionCountsReactive, updateSectionCountsState } from "./ui-components.js";
import {
  CopyPasteUI,
  UserAccountUI,
  InfoBarUI,
  MobileInfoBarUI,
  PageSetupUI,
  PartsPanelUI,
  HeatVisualsUI,
  GridInteractionUI,
  ControlDeckUI,
  PerformanceUI,
  MeltdownUI,
  ModalOrchestrationUI,
  SandboxUI,
  CoreLoopUI,
  DeviceFeaturesUI,
  setupKeyboardShortcuts,
  setupCtrl9Handlers,
  startCtrl9MoneyIncrease,
  stopCtrl9MoneyIncrease,
  setupNavListeners,
  setupResizeListeners,
  PwaDisplayModeUI,
  QuickStartUI,
  NavIndicatorsUI,
  TabSetupUI,
  ClipboardUI,
} from "./ui-components.js";
import { ReactiveLitComponent } from "./ReactiveLitComponent.js";
import dataService from "../services.js";
import { ComponentRegistry } from "../utils.js";
import { MOBILE_BREAKPOINT_PX } from "../utils.js";
import { ObjectiveController, checkObjectiveTextScrolling as applyObjectiveToastTitle } from "../logic.js";
import { GridController, AudioController } from "./controllers/controllers.js";

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

class PageInitUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('PageInit', this);
  }

  clearReactor() {
    const reactor = this.getReactor();
    if (reactor) reactor.innerHTML = "";
  }

  getReactor() {
    return this.ui.coreLoopUI?.getElement?.("reactor") ?? this.ui.DOMElements?.reactor ?? document.getElementById("reactor");
  }

  getReactorWrapper() {
    return this.ui.coreLoopUI?.getElement?.("reactor_wrapper") ?? this.ui.DOMElements?.reactor_wrapper ?? document.getElementById("reactor_wrapper");
  }

  getReactorBackground() {
    return this.ui.coreLoopUI?.getElement?.("reactor_background") ?? this.ui.DOMElements?.reactor_background ?? document.getElementById("reactor_background");
  }

  setGridContainer(container) {
    if (this.ui.gridCanvasRenderer) this.ui.gridCanvasRenderer.setContainer(container);
  }

  setReactorVisibility(visible) {
    const reactor = this.getReactor();
    if (reactor) reactor.style.visibility = visible ? "visible" : "hidden";
  }

  initializePage(pageId) {
    const game = this.ui.game;
    this.ui.coreLoopUI.cacheDOMElements(pageId);

    if (pageId === "reactor_section") {
      this.ui.coreLoopUI.initVarObjsConfig();
      const pauseCfg = this.ui.var_objs_config?.pause;
      const paused = !!this.ui.stateManager?.getVar("pause");
      if (pauseCfg?.onupdate) pauseCfg.onupdate(paused);
    }

    switch (pageId) {
      case "reactor_section":
        const reactor = this.getReactor();
        logger.log('debug', 'ui', '[PageInit] reactor_section init start', {
          hasGridScaler: !!this.ui.gridScaler,
          hasWrapper: !!this.ui.gridScaler?.wrapper,
          hasReactor: !!reactor,
          hasGridRenderer: !!this.ui.gridCanvasRenderer,
          hasGame: !!this.ui.game,
          hasTileset: !!this.ui.game?.tileset
        });
        if (this.ui.gridScaler && !this.ui.gridScaler.wrapper) {
          this.ui.gridScaler.init();
        }
        if (reactor) {
          this.clearReactor();
          if (this.ui.gridCanvasRenderer) {
            this.ui.gridCanvasRenderer.init(reactor);
          }
        }

        this.ui.inputHandler.setupReactorEventListeners();
        this.ui.inputHandler.setupSegmentHighlight();
        this.ui.gridScaler.resize();
        const container = this.getReactorWrapper() || this.getReactorBackground();
        this.setGridContainer(container);
        if (this.ui.game?.tileset) {
          this.ui.game.tileset.updateActiveTiles();
        }
        if (this.ui.gridCanvasRenderer && this.ui.game) {
          this.ui.gridCanvasRenderer.render(this.ui.game);
        }
        logger.log('debug', 'ui', '[PageInit] reactor_section init done');
        this.ui.initializeCopyPasteUI();
        this.ui.pageSetupUI.setupMobileTopBar();
        this.ui.pageSetupUI.setupMobileTopBarResizeListener();
        break;
      case "upgrades_section":
        this.ui.pageSetupUI.setupAffordabilityBanners("upgrades_no_affordable_banner");
        if (!this.ui._sectionCountsMountedUpgrades && document.getElementById("upgrades_content_wrapper")) {
          this.ui._sectionCountsUnmountUpgrades = mountSectionCountsReactive(this.ui, "upgrades_content_wrapper");
          this.ui._sectionCountsMountedUpgrades = true;
        }
        if (game?.upgradeset) updateSectionCountsState(this.ui, game);
        requestAnimationFrame(() => {
          if (
            game.upgradeset &&
            typeof game.upgradeset.populateUpgrades === "function"
          ) {
            game.upgradeset.populateUpgrades();
          } else {
            logger.log('warn', 'ui', 'upgradeset.populateUpgrades is not a function or upgradeset missing');
          }
          this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        });
        break;
      case "experimental_upgrades_section":
        this.ui.controlDeckUI.mountExoticParticlesDisplayIfNeeded(this.ui);
        this.ui.pageSetupUI.setupAffordabilityBanners("research_no_affordable_banner");
        if (!this.ui._sectionCountsMountedResearch && document.getElementById("experimental_upgrades_content_wrapper")) {
          this.ui._sectionCountsUnmountResearch = mountSectionCountsReactive(this.ui, "experimental_upgrades_content_wrapper");
          this.ui._sectionCountsMountedResearch = true;
        }
        if (game?.upgradeset) updateSectionCountsState(this.ui, game);
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateExperimentalUpgrades === "function"
        ) {
          game.upgradeset.populateExperimentalUpgrades();
        } else {
          logger.log('warn', 'ui', 'upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing');
        }
        this.setupResearchCollapsibleSections();
        this.ui.sandboxUI.initializeSandboxUpgradeButtons();
        this.loadAndSetVersion();
        this.ui.setupUpgradeCardHoverBuzz();
        break;
      case "about_section":
        this.setupVersionDisplay();
        if (!this.ui.uiState?.version_display?.app) this.loadAndSetVersion();
        break;
      case "leaderboard_section":
        this.ui.pageSetupUI.setupLeaderboardPage();
        break;
      case "soundboard_section":
        this.ui.pageSetupUI.setupSoundboardPage();
        break;
      default:
        break;
    }

    this.ui.objectivesUI.showObjectivesForPage(pageId);
  }

  setupResearchCollapsibleSections() {
    if (this._researchCollapsibleSetup) return;
    this._researchCollapsibleSetup = true;
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
    const orchestrator = this.ui.modalOrchestrator;
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

  setupVersionDisplay() {
    const ui = this.ui;
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

  async loadAndSetVersion() {
    const ui = this.ui;
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

      if (ui?.uiState) {
        ui.uiState.version_display = { ...ui.uiState.version_display, app: version, about: version };
      }
    } catch (error) {
      if (!error.message || !error.message.includes("Expected JSON")) {
        logger.log('warn', 'ui', 'Could not load version info:', error.message || error);
      }
      if (ui?.uiState) {
        ui.uiState.version_display = { ...ui.uiState.version_display, app: "Unknown", about: "Unknown" };
      }
    }
  }
}

function getPowerNetChangeFromStats(ui) {
  const fromState = ui.game?.state?.power_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const statsPower = toNumber(ui.stateManager.getVar("stats_power") || 0);
  const autoSellEnabled = ui.stateManager.getVar("auto_sell") || false;
  const autoSellMultiplier = toNumber(ui.game?.reactor?.auto_sell_multiplier || 0);
  if (autoSellEnabled && autoSellMultiplier > 0) {
    return statsPower - statsPower * autoSellMultiplier;
  }
  return statsPower;
}

function getHeatNetChangeFromStats(ui) {
  const fromState = ui.game?.state?.heat_net_change;
  if (fromState !== undefined && typeof fromState === "number" && !isNaN(fromState)) return fromState;
  const statsNetHeat = ui.stateManager.getVar("stats_net_heat");
  let baseNetHeat;
  if (typeof statsNetHeat === "number" && !isNaN(statsNetHeat)) {
    baseNetHeat = statsNetHeat;
  } else {
    const totalHeat = toNumber(ui.stateManager.getVar("total_heat") || 0);
    const statsVent = toNumber(ui.stateManager.getVar("stats_vent") || 0);
    const statsOutlet = toNumber(ui.stateManager.getVar("stats_outlet") || 0);
    baseNetHeat = totalHeat - statsVent - statsOutlet;
  }
  const currentPower = toNumber(ui.stateManager.getVar("current_power") || 0);
  const statsPower = toNumber(ui.stateManager.getVar("stats_power") || 0);
  const maxPower = toNumber(ui.stateManager.getVar("max_power") || 0);
  const potentialPower = currentPower + statsPower;
  const excessPower = Math.max(0, potentialPower - maxPower);
  const overflowToHeat = ui.game?.reactor?.power_overflow_to_heat_ratio ?? 0.5;
  const overflowHeat = excessPower * overflowToHeat;
  const manualReduce = toNumber(ui.game?.reactor?.manual_heat_reduce || ui.game?.base_manual_heat_reduce || 1);
  return baseNetHeat + overflowHeat - manualReduce;
}

function initMainLayoutInner(ui) {
  ui.setupEventListeners();
  ui.controlDeckUI.initializeToggleButtons();
  ui.initializeControlDeck();
  ui.partsPanelUI.setupPartsTabs();
  ui.partsPanelUI.initializePartsPanel();
  ui.coreLoopUI.cacheDOMElements();
  ui.coreLoopUI.initVarObjsConfig();
  ui.quickStartUI.addHelpButtonToMainPage();
  ui.userAccountUI.setupUserAccountButton();
  ui.tabSetupUI.setupBuildTabButton();
  ui.tabSetupUI.setupMenuTabButton();
  ui.deviceFeatures.updateWakeLockState();
  const basicOverview = ui.coreLoopUI?.getElement?.("basic_overview_section") ?? ui.DOMElements?.basic_overview_section;
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
  ui.particleEffectsUI.initParticleCanvas();
  requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  if (ui.game && ui.game.engine) {
    const status = ui.game.paused ? "paused" : (ui.game.engine.running ? "running" : "stopped");
    ui.stateManager.setVar("engine_status", status);
  }
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
    this.ui.registry.register('Objectives', this);
    this.controller = controller;
  }
  checkTextScrolling() {
    const toastTitleEl = this.ui.coreLoopUI?.getElement?.("objectives_toast_title") ?? document.getElementById("objectives_toast_title");
    if (!toastTitleEl) return;
    applyObjectiveToastTitle({ objectives_toast_title: toastTitleEl });
  }
  markComplete() {
    const toastBtn = this.ui.coreLoopUI?.getElement?.("objectives_toast_btn") ?? document.getElementById("objectives_toast_btn");
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
    if (this.ui?.uiState) this.ui.uiState.active_page = pageId;
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
    if (!this.ui.stateManager) return;
    const statePaused = this.ui.stateManager.getVar("pause");
    const isPaused = statePaused === undefined ? !!this.ui.game?.paused : !!statePaused;
    if (this.ui.uiState) this.ui.uiState.is_paused = !!isPaused;
    const doc = (typeof globalThis !== "undefined" && globalThis.document) || (typeof document !== "undefined" && document);
    if (doc?.body) doc.body.classList.toggle("game-paused", !!isPaused);
    if (isPaused) {
      const unpauseBtn = document.getElementById("unpause_btn");
      if (unpauseBtn && !unpauseBtn.hasAttribute("data-listener-added")) {
        unpauseBtn.addEventListener("click", () => {
          this.ui.stateManager.setVar("pause", false);
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
    this.registry = new ComponentRegistry();
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
    this.modalOrchestrator = new ModalOrchestrator();
    this.gridScaler = new GridScaler(this);
    this.gridCanvasRenderer = new GridCanvasRenderer(this);
    this.help_mode_active = false;
    this.copyPasteUI = new CopyPasteUI(this);
    this.copyPaste = this.copyPasteUI;
    this.userAccountUI = new UserAccountUI(this);
    this.infoBarUI = new InfoBarUI(this);
    this.mobileInfoBarUI = new MobileInfoBarUI(this);
    this.pageSetupUI = new PageSetupUI(this);
    this.partsPanelUI = new PartsPanelUI(this);
    this.objectiveController = new ObjectiveController({
      getGame: () => this.game,
      getUI: () => this,
      getStateManager: () => this.stateManager,
      cacheDOMElements: () => this.coreLoopUI.cacheDOMElements(),
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
  this.controlDeckUI = new ControlDeckUI(this);
    this.upgradesUI = new UpgradesUI(this);
    this.performanceUI = new PerformanceUI(this);
    this.meltdownUI = new MeltdownUI(this);
    this.modalOrchestrationUI = new ModalOrchestrationUI(this);
    this.sandboxUI = new SandboxUI(this);
    this.coreLoopUI = new CoreLoopUI(this);
    this.layoutStorageUI = new LayoutStorageUI(this);
    this.pageInitUI = new PageInitUI(this);
    this.particleEffectsUI = new ParticleEffectsUI(this);
    this.componentRenderingUI = new ComponentRenderingUI(this);
    this.deviceFeatures = new DeviceFeaturesUI(this);
    this.pwaDisplayModeUI = new PwaDisplayModeUI(this);
    this.quickStartUI = new QuickStartUI(this);
    this.navIndicatorsUI = new NavIndicatorsUI(this);
    this.pauseStateUI = new PauseStateUI(this);
    this.clipboardUI = new ClipboardUI(this);
    this.tabSetupUI = new TabSetupUI(this);
    this.visualEventRendererUI = new VisualEventRendererUI(this);

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
    this._particleCanvas = null;
    this._particleCtx = null;
    this.particleSystem = null;
    this.detachGameEventListeners = null;
    this._icons = {
      power: "img/ui/icons/icon_power.png",
      heat: "img/ui/icons/icon_heat.png",
    };
  }

  _renderVisualEvents(eventBufferDescriptor) {
    this.visualEventRendererUI.render(eventBufferDescriptor);
  }

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

  _initParticleCanvas() {
    this.particleEffectsUI.initParticleCanvas();
  }

  _resizeParticleCanvas() {
    this.particleEffectsUI.resizeParticleCanvas();
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
    initMainLayoutInner(this);
    this._uiStateTeardown = initUIStateSubscriptions(this.uiState, this);
  }

  startCtrl9MoneyIncrease() {
    startCtrl9MoneyIncrease(this);
  }

  stopCtrl9MoneyIncrease() {
    stopCtrl9MoneyIncrease(this);
  }

  async init(game) {
    const { helpText } = await dataService.ensureAllGameDataLoaded();
    this.help_text = helpText?.default || helpText;
    this.game = game;
    if (game?.upgradeset?.setPopulateSectionFn) {
      game.upgradeset.setPopulateSectionFn(runPopulateUpgradeSection);
    }
    this.stateManager = new StateManager(this);
    this.stateManager.setGame(game);
    game.on("tickRecorded", () => this.performanceUI?.recordTick?.());
    this.meltdownUI.subscribeToMeltdownEvents(game);
    this.modalOrchestrationUI.subscribeToContextModalEvents(game);
    this.audioController.attach(game);
    this.inputHandler.setup();
    this.modalOrchestrator.init(this);
    this.gridInteractionUI.clearAllActiveAnimations();
    return true;
  }

  forceReactorRealignment() {
    const reactor = this.pageInitUI?.getReactor?.() ?? this.DOMElements?.reactor;
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
    this.infoBarUI.setupInfoBarButtons();
    this.copyPaste.setupCopyStateButton();
    this.objectivesUI.setupObjectivesListeners();
  }

  static get MY_LAYOUTS_STORAGE_KEY() { return LayoutStorageUI.MY_LAYOUTS_STORAGE_KEY; }

  initializeControlDeck() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    this.mobileInfoBarUI.updateControlDeckValues();
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
      getRegistry: () => this.registry,
    };
  }

  cleanup() {
    if (this.update_interface_task) {
      cancelAnimationFrame(this.update_interface_task);
      this.update_interface_task = null;
    }
    if (typeof this.controlDeckUI?._controlsNavUnmount === "function") {
      this.controlDeckUI._controlsNavUnmount();
      this.controlDeckUI._controlsNavUnmount = null;
    }
    if (typeof this.controlDeckUI?._statsBarUnmount === "function") {
      this.controlDeckUI._statsBarUnmount();
      this.controlDeckUI._statsBarUnmount = null;
    }
    if (typeof this.controlDeckUI?._epUnmount === "function") {
      this.controlDeckUI._epUnmount();
      this.controlDeckUI._epUnmount = null;
    }
    if (typeof this.controlDeckUI?._engineStatusUnmount === "function") {
      this.controlDeckUI._engineStatusUnmount();
      this.controlDeckUI._engineStatusUnmount = null;
    }
    if (this.objectiveController?.unmount) this.objectiveController.unmount();
    if (typeof this.partsPanelUI?._partsPanelUnmount === "function") {
      this.partsPanelUI._partsPanelUnmount();
      this.partsPanelUI._partsPanelUnmount = null;
    }
    this.meltdownUI.cleanup();
    this.mobileInfoBarUI?.cleanup?.();
    if (typeof this.copyPasteUI?._sandboxUnmount === "function") {
      this.copyPasteUI._sandboxUnmount();
      this.copyPasteUI._sandboxUnmount = null;
    }
    if (typeof this.copyPasteUI?._copyStateUnmount === "function") {
      this.copyPasteUI._copyStateUnmount();
      this.copyPasteUI._copyStateUnmount = null;
    }
    if (typeof this._sectionCountsUnmountUpgrades === "function") {
      this._sectionCountsUnmountUpgrades();
      this._sectionCountsUnmountUpgrades = null;
    }
    this._sectionCountsMountedUpgrades = false;
    if (typeof this._sectionCountsUnmountResearch === "function") {
      this._sectionCountsUnmountResearch();
      this._sectionCountsUnmountResearch = null;
    }
    this._sectionCountsMountedResearch = false;
    if (this._affordabilityBannerUnmounts?.length) {
      this._affordabilityBannerUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
      this._affordabilityBannerUnmounts = [];
    }
    this._affordabilityBannerMountedUpgrades = false;
    this._affordabilityBannerMountedResearch = false;
    this._versionDisplayMounted = false;
    this.navIndicatorsUI?.teardownAffordabilityIndicators?.();
    this.infoBarUI?.teardown?.();
    this.userAccountUI?.teardownUserAccountButton?.();
    if (this.game && this.modalOrchestrationUI.unsubscribeContextModal) this.modalOrchestrationUI.unsubscribeContextModal(this.game);
    if (typeof this.detachGameEventListeners === "function") {
      this.detachGameEventListeners();
      this.detachGameEventListeners = null;
    }
    if (this.stateManager?.teardown) this.stateManager.teardown();
    if (typeof this._uiStateTeardown === "function") {
      this._uiStateTeardown();
      this._uiStateTeardown = null;
    }
    if (this.game?.tooltip_manager?.teardown) this.game.tooltip_manager.teardown();
  }
}
