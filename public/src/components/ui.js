import { StorageAdapter } from "../storage/index.js";
import { numFormat as fmt } from "../core/numbers.js";
import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { logger } from "../core/logger.js";
import { getAppContext } from "../app-context.js";
import { writeClipboardText, readClipboardText } from "../core/clipboard.js";
import { html, render } from "lit-html";
import { unsafeHTML } from "lit-html/directives/unsafe-html.js";
import { createUIState, initUIStateSubscriptions, preferences } from "../store.js";
import { subscribe } from "valtio/vanilla";
import { PageSetupUI } from "./shell/page-setup-ui.js";
import { resolveAudioService, getValidatedGameData } from "../services/app-services.js";
import { safeCall, teardownAll } from "../core/teardown.js";
import {
  ComponentRenderingUI,
  runPopulateUpgradeSection,
  mountSectionCountsReactive as mountHubSectionCounts,
  mountUpgradeDetailPanels as mountHubUpgradeDetailPanels,
  ensureUpgradeDetailPanelMounted as ensureHubUpgradeDetailPanelMounted,
  updateSectionCountsState as syncSectionCountsState,
  mountExoticParticlesDisplayIfNeeded as mountControlDeckEpDisplay,
  CopyPasteUI,
  UserAccountUI,
  setupBuildTabButton,
  setupMenuTabButton,
  setupDesktopTopNavButtons,
  teardownTabSetupUI,
  updateNavIndicators as paintNavAffordabilityDots,
  teardownAffordabilityIndicators,
  setupNavListeners,
  teardownNavListeners,
  setupResizeListeners,
  teardownResizeListeners,
  PwaDisplayModeUI,
  QuickStartUI,
  mountInfoBar,
  syncMobileControlDeckMounts,
  setupPartsPanel,
  initializeControlDeckToggleButtons,
  initControlDeckVarObjs,
  getUiElement,
  getUpgradeSectionContainer,
  appendUpgradeToSection,
  subscribeToContextModalEvents,
  unsubscribeContextModalEvents,
  updateQuickSelectSlots,
  updateFailurePhaseSensory,
  updatePartsPanelBodyClass,
  refreshPartsPanel,
  getPageReactor,
  snapUiDisplayValuesFromState,
  applyUiStateToDom,
  processUiUpdateQueue,
  updateUiRollingNumbers,
  initializePartsPanel as runInitializePartsPanel,
  teardownPartsPanel,
  syncToggleStatesFromGame as applyToggleStatesFromGame,
  teardownGameLayout as runTeardownGameLayout,
} from "./ui-components.js";
import { createDeviceFeatures } from "./shell/device.js";
import { startRenderLoop } from "./grid/ui-render-loop.js";
import { initializePage as runInitializePage } from "./shell/ui-page-init.js";
export { showStatusNotice } from "./shell/ui-notices.js";
import { setupUiIdleEffects } from "./shell/ui-idle-effects.js";
import { mountUiViewHosts } from "./shell/ui-views.js";
import { teardownGameStateEngineSync } from "./shell/game-state-sync.js";
import { installAppRootIntentDelegation } from "./grid/ui-intents.js";
import { teardownAllUiSubsystems, wireAppSubsystems, wireUiDomSubsystems } from "./shell/ui-app-wiring.js";
import { MY_LAYOUTS_STORAGE_KEY } from "./blueprints/ui-layout-storage.js";

const attachAudioSys = (getAudioService) => {
  const unsub = subscribe(preferences, () => {
    const audio = getAudioService();
    if (audio?._isInitialized && typeof audio._loadVolumeSettings === "function") {
      audio._loadVolumeSettings();
    }
  });
  return () => {
    safeCall(() => { unsub(); });
  };
};

function mountUiViewHostsForLayout(ui) {
  if (typeof ui._uiViewHostsUnmount === "function") {
    safeCall(() => { ui._uiViewHostsUnmount(); });
    ui._uiViewHostsUnmount = null;
  }
  const unmount = mountUiViewHosts(ui.game);
  if (typeof unmount !== "function") return;
  ui._uiViewHostsUnmount = unmount;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(unmount);
}

function isFloatingTextElement(el) {
  return el && typeof el === "object" && el.nodeType === 1 && typeof el.appendChild === "function";
}

function borrowFloatingTextElement(pool) {
  const list = pool?.floatingText;
  if (!Array.isArray(list)) return document.createElement("div");
  while (list.length) {
    const candidate = list.pop();
    if (isFloatingTextElement(candidate)) {
      candidate.className = "floating-text";
      candidate.removeAttribute("style");
      candidate.classList.remove("floating-text--debit", "floating-text--credit");
      return candidate;
    }
  }
  const el = document.createElement("div");
  el.className = "floating-text";
  return el;
}

function initMainLayoutInner(ui) {
  ui.setupEventListeners();
  initializeControlDeckToggleButtons(ui);
  ui.initializeControlDeck();
  setupPartsPanel(ui);
  initControlDeckVarObjs(ui);
  ui.quickStartUI.addHelpButtonToMainPage();
  ui.userAccountUI.setupUserAccountButton();
  setupBuildTabButton(ui);
  setupMenuTabButton(ui);
  setupDesktopTopNavButtons(ui);
  ui.deviceFeatures.updateWakeLockState();
  const basicOverview = getUiElement(ui, "basic_overview_section");
  if (basicOverview && ui.help_text?.basic_overview) {
    render(html`
      <h3>${ui.help_text.basic_overview.title}</h3>
      <p>${unsafeHTML(ui.help_text.basic_overview.content)}</p>
    `, basicOverview);
  }
  const prestigeHelp = document.getElementById("help_prestige_section");
  if (prestigeHelp && ui.help_text?.prestige?.title) {
    render(html`
      <h3>${ui.help_text.prestige.title}</h3>
      <p>${unsafeHTML(ui.help_text.prestige.content)}</p>
    `, prestigeHelp);
  }
  const offlineHelp = document.getElementById("help_offline_section");
  if (offlineHelp && ui.help_text?.controls?.offlineCatchup) {
    render(html`
      <h3>Offline Progress</h3>
      <p>${unsafeHTML(ui.help_text.controls.offlineCatchup)}</p>
    `, offlineHelp);
  }
  const layoutsHelp = document.getElementById("help_layouts_section");
  if (layoutsHelp && ui.help_text?.layouts?.title) {
    render(html`
      <h3>${ui.help_text.layouts.title}</h3>
      <p>${unsafeHTML(ui.help_text.layouts.content)}</p>
    `, layoutsHelp);
  }
  const partsHelp = document.getElementById("help_parts_section");
  if (partsHelp && ui.help_text?.parts?.sellConsequences) {
    render(html`
      <h3>Parts &amp; Selling</h3>
      <p>${ui.help_text.parts.sellConsequences}</p>
    `, partsHelp);
  }
  const controlsHelp = document.getElementById("help_controls_section");
  if (controlsHelp && ui.help_text?.controls) {
    const c = ui.help_text.controls;
    render(html`
      <h3>Save &amp; Backup</h3>
      <p>${c.saveExport ?? ""}<br>${c.saveImport ?? ""}</p>
      ${c.chronometer ? html`<h3>Tick Speed</h3><p>${unsafeHTML(c.chronometer)}</p>` : ""}
    `, controlsHelp);
  }
  if (ui.gridScaler) ui.gridScaler.init();
  if (document.getElementById("reactor_wrapper")) {
    ui.gridScaler?.resize?.();
  }
  requestAnimationFrame((ts) => startRenderLoop(ui, ts));
}

function installUiLifecycleTeardown(ui) {
  if (typeof window === "undefined" || ui._pageLifecycleBound) return;
  ui._pageLifecycleBound = true;
  const flush = (event) => {
    if (event?.persisted) return;
    ui.cleanup();
  };
  window.addEventListener("pagehide", flush);
  ui._unmounts.push(() => window.removeEventListener("pagehide", flush));
}

export class UI {
  constructor() {
    this.game = null;
    this.var_objs_config = {};
    this.last_money = 0;
    this.last_exotic_particles = 0;
    this.uiState = createUIState();
    this._uiStateTeardown = null;
    this.update_interface_interval = 100;
    this.last_interface_update = 0;
    this.update_interface_task = null;
    this._updateLoopRunning = false;
    this.stateManager = null;
    this.inputHandler = null;
    this.modalOrchestrator = null;
    this.gridScaler = null;
    this.help_mode_active = false;
    this.copyPasteUI = new CopyPasteUI(this);
    this.copyPaste = this.copyPasteUI;
    this.userAccountUI = new UserAccountUI(this);
    this.pageSetupUI = new PageSetupUI(this);
    this.objectiveController = null;
    this.achievementController = null;
    this.objectivesUI = null;
    this.heatVisualsUI = null;
    this.gridInteractionUI = null;
    this.meltdownUI = null;
    this.componentRenderingUI = new ComponentRenderingUI(this);
    this.deviceFeatures = createDeviceFeatures(() => this);
    this._deviceServiceTeardown = null;
    this.pwaDisplayModeUI = new PwaDisplayModeUI(this);
    this.quickStartUI = new QuickStartUI(this);
    this.pauseStateUI = null;
    this.clipboardUI = {
      writeToClipboard: writeClipboardText,
      readFromClipboard: readClipboardText,
    };

    this.ctrl9HoldTimer = null;
    this.ctrl9HoldStartTime = null;
    this.ctrl9MoneyInterval = null;

    this._lastUiTime = 0;

    this.displayValues = {
      money: { current: 0, target: 0 },
      heat: { current: 0, target: 0 },
      power: { current: 0, target: 0 },
      ep: { current: 0, target: 0 },
    };

    this._visualPool = { floatingText: [], steamParticle: [], bolt: [] };
    this.detachGameEventListeners = null;
    this.detachGlobalListeners = null;
    this._unmounts = [];
    this._layoutUnmounts = [];
    this._lifecycleEnded = false;
    this._pageLifecycleBound = false;
    this._icons = {
      power: "img/ui/icons/icon_power.png",
      heat: "img/ui/icons/icon_heat.png",
    };
    this.updateQuickSelectSlots = () => updateQuickSelectSlots(this);
    this.updateFailurePhaseSensory = (state) => updateFailurePhaseSensory(this, state);
    this.updatePartsPanelBodyClass = () => updatePartsPanelBodyClass(this);
    this.refreshPartsPanel = () => refreshPartsPanel(this);
    this.getUpgradeContainer = (k) => getUpgradeSectionContainer(this, k);
    this.appendUpgrade = (k, el) => appendUpgradeToSection(this, k, el);
    this.getUiElement = (id) => getUiElement(this, id);
    this.snapUiDisplayValuesFromState = () => snapUiDisplayValuesFromState(this);
    this.applyUiStateToDom = () => applyUiStateToDom(this);
    this.processUiUpdateQueue = () => processUiUpdateQueue(this);
    this.updateUiRollingNumbers = (dt) => updateUiRollingNumbers(this, dt);
    this.startRenderLoop = (ts) => startRenderLoop(this, ts);
  }

  initializePage(pageId) {
    runInitializePage(this, pageId);
  }

  updateSectionCountsState(game = this.game) {
    syncSectionCountsState(this, game);
  }

  initializePartsPanel() {
    runInitializePartsPanel(this);
  }

  teardownGameLayout() {
    runTeardownGameLayout(this);
  }

  syncToggleStatesFromGame() {
    applyToggleStatesFromGame(this);
  }

  mountSectionCountsReactive(wrapperId) {
    return mountHubSectionCounts(this, wrapperId);
  }

  mountUpgradeDetailPanels() {
    return mountHubUpgradeDetailPanels(this);
  }

  ensureUpgradeDetailPanelMounted(panelId) {
    ensureHubUpgradeDetailPanelMounted(this, panelId);
  }

  mountExoticParticlesDisplayIfNeeded() {
    mountControlDeckEpDisplay(this);
  }

  _renderVisualEvents(eventBufferDescriptor) {
    const engine = this.game?.engine;
    const tileset = this.game?.tileset;
    const gi = this.gridInteractionUI;
    if (!engine || !eventBufferDescriptor || !tileset || !gi) return;
    const { buffer, head, tail, max } = eventBufferDescriptor;
    let pos = tail;
    while (pos !== head) {
      const idx = pos * 2;
      const packed = buffer[idx];
      const typeId = (packed >> 12) & 0xF;
      const row = (packed >> 6) & 0x3F;
      const col = packed & 0x3F;
      const t = tileset.getTile(row, col);
      if (t) {
        if (typeId === 1) gi.spawnTileIcon("power", t, null);
        else if (typeId === 2 && t.part?.category === "vent") gi.blinkVent(t);
      }
      pos = (pos + 1) % max;
    }
    engine.ackEvents(head);
  }

  showFloatingText(container, amount) {
    if (!container || amount <= 0) return;
    const parent = container.querySelector?.(".floating-text-container");
    if (!parent || parent.nodeType !== 1) return;
    const pool = this._visualPool;
    const textEl = borrowFloatingTextElement(pool);
    textEl.textContent = `+$${fmt(amount)}`;
    parent.appendChild(textEl);
    setTimeout(() => {
      textEl.remove();
      pool.floatingText.push(textEl);
    }, 1000);
  }

  showFloatingTextAtTile(tile, amountOrText, options = {}) {
    if (!tile) return;
    try {
      const overlay = this.heatVisualsUI?._ensureOverlay?.();
      if (!overlay || overlay.nodeType !== 1) return;
      const pos = this.heatVisualsUI._tileCenterToOverlayPosition(tile.row, tile.col);
      const pool = this._visualPool;
      const textEl = borrowFloatingTextElement(pool);
      const variant = options.variant ?? (typeof amountOrText === "number" && amountOrText < 0 ? "debit" : "credit");
      if (typeof amountOrText === "number") {
        const n = amountOrText;
        textEl.textContent = n >= 0 ? `+$${fmt(n)}` : `-$${fmt(Math.abs(n))}`;
      } else {
        textEl.textContent = String(amountOrText ?? "");
      }
      textEl.classList.toggle("floating-text--debit", variant === "debit");
      textEl.classList.toggle("floating-text--credit", variant === "credit");
      textEl.style.left = `${pos.x}px`;
      textEl.style.top = `${pos.y}px`;
      overlay.appendChild(textEl);
      setTimeout(() => {
        textEl.remove();
        textEl.classList.remove("floating-text--debit", "floating-text--credit");
        pool.floatingText.push(textEl);
      }, 1000);
    } catch (err) {
      logger.log("warn", "ui", "Floating text render skipped", err);
    }
  }

  initParticleCanvas() {}

  resizeParticleCanvas() {}

  createSteamParticles() {}

  createBoltParticle() {}

  createSellSparks() {}

  _cleanupVentRotor(tile) {
    this.gridInteractionUI._cleanupVentRotor(tile);
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
    this.gridScaler?.resize?.();
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
    const wrappers = [
      document.getElementById("upgrades_content_wrapper"),
      document.getElementById("experimental_upgrades_content_wrapper"),
    ].filter(Boolean);
    wrappers.forEach((el) => el.addEventListener("mouseover", onMouseOver));
    this._unmounts.push(() => {
      wrappers.forEach((el) => el.removeEventListener("mouseover", onMouseOver));
      this._upgradeBuzzSetup = false;
    });
  }

  initMainLayout() {
    runTeardownGameLayout(this);
    if (typeof this._uiStateTeardown === "function") {
      this._uiStateTeardown();
      this._uiStateTeardown = null;
    }
    initMainLayoutInner(this);
    this._uiStateTeardown = initUIStateSubscriptions(this.uiState, this);
  }

  async init(game) {
    const { helpText } = getValidatedGameData();
    this.help_text = helpText?.default || helpText;
    this.game = game;
    if (game?.upgradeset?.setPopulateSectionFn) {
      game.upgradeset.setPopulateSectionFn(runPopulateUpgradeSection);
    }
    subscribeToContextModalEvents(this, game);
    const audioUnmount = attachAudioSys(() => resolveAudioService(this.game?.audio), () => this.game);
    if (typeof audioUnmount === "function") this._unmounts.push(audioUnmount);
    mountUiViewHostsForLayout(this);
    const idleUnmount = setupUiIdleEffects();
    if (typeof idleUnmount === "function") this._unmounts.push(idleUnmount);
    installUiLifecycleTeardown(this);
    wireUiDomSubsystems(this);
    wireAppSubsystems(this, game);
    return true;
  }

  forceReactorRealignment() {
    const reactor = getPageReactor(this);
    if (!this.game || !reactor) return;
    const originalDisplay = reactor.style.display;
    reactor.style.display = "none";
    reactor.offsetHeight;
    reactor.style.display = originalDisplay;
    this.gridScaler?.resize?.();
  }

  setupEventListeners() {
    setupNavListeners(this);
    setupResizeListeners(this);
    mountInfoBar(this);
    mountUiViewHostsForLayout(this);
    this.copyPaste.setupCopyStateButton();
    this.objectivesUI?.setupObjectivesListeners?.();
    this.achievementController?.mount?.();
    if (this.game) {
      if (typeof this._teardownIntentDelegation === "function") {
        this._teardownIntentDelegation();
        this._teardownIntentDelegation = null;
      }
      this._teardownIntentDelegation = installAppRootIntentDelegation(this.game);
    }
  }

  static get MY_LAYOUTS_STORAGE_KEY() { return MY_LAYOUTS_STORAGE_KEY; }

  initializeControlDeck() {
    if (window.innerWidth > MOBILE_BREAKPOINT_PX) return;
    syncMobileControlDeckMounts(this);
  }

  async resetReactor() {
    logger.log("debug", "game", "resetReactor: clearing save and returning to splash");
    const ctx = getAppContext() ?? { game: this.game, ui: this, pageRouter: this.game?.router };
    if (typeof ctx.returnToSplashScreen === "function") {
      await ctx.returnToSplashScreen(ctx, { clearSaves: true });
      return;
    }
    try {
      await StorageAdapter.remove("reactorGameSave");
    } catch (error) {
      logger.log("error", "game", "Error deleting save file:", error);
    }
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
    if (this._lifecycleEnded) return;
    this._lifecycleEnded = true;
    runTeardownGameLayout(this);
    if (this.update_interface_task) {
      cancelAnimationFrame(this.update_interface_task);
      this.update_interface_task = null;
    }
    teardownAll(this._unmounts);
    this._unmounts = [];
    this._sectionCountsMountedUpgrades = false;
    this._sectionCountsMountedResearch = false;
    teardownAllUiSubsystems(this, this.game);
    if (typeof this.copyPasteUI?.teardownBlueprintPlanner === "function") {
      this.copyPasteUI.teardownBlueprintPlanner();
    }
    if (this._affordabilityBannerUnmounts?.length) {
      teardownAll(this._affordabilityBannerUnmounts);
      this._affordabilityBannerUnmounts = [];
    }
    this._affordabilityBannerMountedUpgrades = false;
    this._affordabilityBannerMountedResearch = false;
    this._versionDisplayMounted = false;
    teardownAffordabilityIndicators(this);
    teardownTabSetupUI(this);
    teardownNavListeners(this);
    teardownResizeListeners(this);
    teardownPartsPanel(this);
    this.userAccountUI?.teardownUserAccountButton?.();
    if (this.game) unsubscribeContextModalEvents(this, this.game);
    if (typeof this.detachGameEventListeners === "function") {
      this.detachGameEventListeners();
      this.detachGameEventListeners = null;
    }
    if (typeof this.detachGlobalListeners === "function") {
      this.detachGlobalListeners();
      this.detachGlobalListeners = null;
    }
    teardownGameStateEngineSync(this.game);
    if (typeof this._teardownIntentDelegation === "function") {
      this._teardownIntentDelegation();
      this._teardownIntentDelegation = null;
    }
    if (typeof this._uiStateTeardown === "function") {
      this._uiStateTeardown();
      this._uiStateTeardown = null;
    }
  }
}
