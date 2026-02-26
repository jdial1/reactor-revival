import { numFormat as fmt, on, StorageUtils, StorageUtilsAsync } from "../utils/util.js";
import { StateManager } from "../core/stateManager.js";
import { createUIState, initUIStateSubscriptions } from "../core/uiStore.js";
import { InputHandler } from "./InputManager.js";
import { ModalOrchestrator } from "./ModalManager.js";
import { GridScaler } from "./gridScaler.js";
import { GridCanvasRenderer } from "./gridCanvasRenderer.js";
import { ParticleSystem } from "./particleSystem.js";
import { leaderboardService } from "../services/leaderboardService.js";
import { logger } from "../utils/logger.js";
import { CopyPasteUI } from "./ui/copyPasteUI.js";
import { UserAccountUI } from "./ui/userAccountUI.js";
import { InfoBarUI } from "./ui/infoBarUI.js";
import { MobileInfoBarUI } from "./ui/mobileInfoBarUI.js";
import { PageSetupUI } from "./ui/pageSetupUI.js";
import { PartsPanelUI } from "./ui/partsPanelUI.js";
import { ObjectivesUI } from "./ui/objectivesUI.js";
import { HeatVisualsUI } from "./ui/heatVisualsUI.js";
import { GridInteractionUI } from "./ui/gridInteractionUI.js";
import { LayoutModalUI } from "./ui/layoutModalUI.js";
import { ControlDeckUI } from "./ui/controlDeckUI.js";
import { UpgradesUI } from "./ui/upgradesUI.js";
import { PerformanceUI } from "./ui/performanceUI.js";
import { MeltdownUI } from "./ui/meltdownUI.js";
import { ModalOrchestrationUI } from "./ui/modalOrchestrationUI.js";
import { SandboxUI } from "./ui/sandboxUI.js";
import { CoreLoopUI } from "./ui/coreLoopUI.js";
import { LayoutStorageUI } from "./ui/layoutStorageUI.js";
import { PageInitUI } from "./ui/pageInitUI.js";
import { ParticleEffectsUI } from "./ui/particleEffectsUI.js";
import { ComponentRenderingUI } from "./ui/componentRenderingUI.js";
import { DeviceFeaturesUI } from "./ui/deviceFeaturesUI.js";
import { setupKeyboardShortcuts, setupCtrl9Handlers, startCtrl9MoneyIncrease, stopCtrl9MoneyIncrease } from "./ui/keyboardShortcutsUI.js";
import { setupNavListeners, setupResizeListeners } from "./ui/navigationListenersUI.js";
import dataService from "../services/dataService.js";
import { PwaDisplayModeUI } from "./ui/pwaDisplayModeUI.js";
import { QuickStartUI } from "./ui/quickStartUI.js";
import { NavIndicatorsUI } from "./ui/navIndicatorsUI.js";
import { PauseStateUI } from "./ui/pauseStateUI.js";
import { ClipboardUI } from "./ui/clipboardUI.js";
import { DOM_IDS } from "./ui/domIdsConfig.js";
import { MOBILE_BREAKPOINT_PX } from "../core/constants.js";
import { runPopulateUpgradeSection } from "./ui/upgrades/domPopulatorUI.js";
import { getPowerNetChange as getPowerNetChangeFromStats, getHeatNetChange as getHeatNetChangeFromStats } from "./ui/statsCalculatorUI.js";
import { TabSetupUI } from "./ui/tabSetupUI.js";
import { VisualEventRendererUI } from "./ui/visualEventRendererUI.js";
import { initMainLayout as initMainLayoutFromModule } from "./ui/mainLayoutInitUI.js";
import { ObjectiveController } from "./controllers/ObjectiveController.js";
import { GridController } from "./controllers/GridController.js";
import { AudioController } from "./controllers/AudioController.js";

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
    this._pendingDomUpdates = [];
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
      getDOMElements: () => this.DOMElements,
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
    this.audioController = new AudioController({ getAudioService: () => this.game?.audio });
    this.layoutModalUI = new LayoutModalUI(this);
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

    this.dom_ids = DOM_IDS;

    this.ctrl9HoldTimer = null;
    this.ctrl9HoldStartTime = null;
    this.ctrl9MoneyInterval = null;
    this.ctrl9BaseAmount = 1000000000;
    this.ctrl9ExponentialRate = 5;
    this.ctrl9IntervalMs = 100;

    this.displayValues = {
      money: { current: 0, target: 0, domId: ['info_money', 'info_money_desktop', 'control_deck_money_value'] },
      heat: { current: 0, target: 0, domId: ['info_heat', 'info_heat_desktop', 'control_deck_heat'], format0: true },
      power: { current: 0, target: 0, domId: ['info_power', 'info_power_desktop', 'control_deck_power'] },
      ep: { current: 0, target: 0, domId: ['info_ep_value', 'info_ep_value_desktop'] }
    };
    this._lastUiTime = 0;

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

  logAnimationStatus() {
    this.gridInteractionUI.logAnimationStatus();
  }

  getPowerNetChange() {
    return getPowerNetChangeFromStats(this);
  }

  getHeatNetChange() {
    return getHeatNetChangeFromStats(this);
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

  initMainLayout() {
    initMainLayoutFromModule(this);
    this._uiStateTeardown = initUIStateSubscriptions(this.uiState, this);
    const btns = document.getElementById("reactor_copy_paste_btns");
    if (btns) btns.classList.toggle("collapsed", !!this.uiState.copy_paste_collapsed);
    const partsSection = document.getElementById("parts_section");
    if (partsSection) partsSection.classList.toggle("collapsed", !!this.uiState.parts_panel_collapsed);
    this.objectivesUI?.updateObjectiveDisplay?.();
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
    if (!this.game || !this.DOMElements.reactor) return;
    const reactor = this.DOMElements.reactor;
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
    this.infoBarUI.setupHeatPowerListeners();
    this.objectivesUI.setupObjectivesListeners();
  }

  updateCollapsedControlsNav() {}

  static get MY_LAYOUTS_STORAGE_KEY() { return LayoutStorageUI.MY_LAYOUTS_STORAGE_KEY; }

  initializeControlDeck() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    this.mobileInfoBarUI.updateControlDeckValues();
  }

  async resetReactor() {
    logger.log('debug', 'game', 'resetReactor method called - deleting save and returning to splash');
    try {
      await StorageUtilsAsync.remove("reactorGameSave");
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
      getDOMElements: () => this.DOMElements,
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
    if (this.objectiveController?.unmount) this.objectiveController.unmount();
    if (typeof this.partsPanelUI?._partsPanelUnmount === "function") {
      this.partsPanelUI._partsPanelUnmount();
      this.partsPanelUI._partsPanelUnmount = null;
    }
    this.meltdownUI.cleanup();
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
