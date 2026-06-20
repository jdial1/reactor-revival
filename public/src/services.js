export { queryClient, queryKeys } from "./services-query.js";
export {
  getValidatedGameData,
  AUDIO_RUNTIME_DEFAULTS,
  handleAudioEvent,
  processSensoryMask,
  resolveAudioService,
  loadSampleBuffers,
  AudioAmbienceManager,
  AudioWarningManager,
  AudioIndustrialManager,
  AudioService,
} from "./services-audio.js";
export { default } from "./services-audio.js";
export {
  initializePwa,
  getDeferredPrompt,
  clearDeferredPrompt,
  requestWakeLock,
  releaseWakeLock,
  VersionChecker,
  getCriticalUiIconAssets,
  getPartImagesByTier,
  getMaxTier,
  warmImageCache,
  preloadTierImages,
  preloadAllPartImages,
} from "./services-pwa.js";
export { LeaderboardService, leaderboardService, getLocalBestRun } from "./services-leaderboard.js";

import { html, render } from "lit-html";
import {
  SaveDataSchema,
  VersionSchema,
  fetchResolvedSaves,
  showLoadBackupModal,
} from "./state.js";
import {
  logger,
  StorageUtils,
  StorageAdapter,
  serializeSave,
  deserializeSave,
  getResourceUrl,
  isTestEnv,
  setSlot1FromBackupAsync,
  classMap,
  formatNumber,
  formatPlaytimeLog,
  runCathodeScramble,
  rotateSlot1ToBackup,
  BaseComponent,
  LEADERBOARD_CONFIG,
} from "./utils.js";
import {
  splashStartOptionsTemplate,
  saveSlotRowTemplate,
  saveSlotMainTemplate,
} from "./templates/servicesTemplates.js";
import { MODAL_IDS } from "./components/ui-modals.js";
import { ReactiveLitComponent } from "./components/reactive-lit-component.js";
import { getValidatedGameData } from "./services-audio.js";
import {
  VersionChecker,
  warmImageCache,
  getCriticalUiIconAssets,
  preloadAllPartImages,
} from "./services-pwa.js";

const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  panel.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  slightTimerRef.current = setTimeout(() => {
    panel.classList.add(FADE_CLASS_SLIGHT);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    panel.classList.remove(FADE_CLASS_SLIGHT);
    panel.classList.add(FADE_CLASS_FULL);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, handlers) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove" });
    handlers.push({ event: ev, handler: h });
  });
}

function unbindWakeListeners(handlers) {
  handlers.forEach(({ event, handler }) => {
    document.removeEventListener(event, handler, { capture: true });
  });
  handlers.length = 0;
}

function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const handlers = [];
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, handlers);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    unbindWakeListeners(handlers);
    panelElement.classList.remove(FADE_CLASS_SLIGHT, FADE_CLASS_FULL);
  };
}

async function fetchVersionFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseVersionFromResponse(text) {
  try {
    const data = JSON.parse(text);
    const parsed = VersionSchema.safeParse(data);
    return parsed.success ? parsed.data.version : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function tryPrimaryVersionUrl() {
  const versionUrl = getResourceUrl("version.json");
  try {
    return await fetchVersionFromUrl(versionUrl);
  } catch (urlError) {
    logger.log("warn", "splash", "Primary URL failed, trying direct path:", urlError);
    return await fetchVersionFromUrl("/version.json");
  }
}

async function tryDirectOrAbsolutePath() {
  try {
    const directResponse = await fetch("./version.json");
    if (directResponse.ok) return parseVersionFromResponse(await directResponse.text());
  } catch (directError) {
    logger.warn("Could not load direct local version:", directError);
  }
  try {
    const absoluteResponse = await fetch("/version.json");
    if (absoluteResponse.ok) return parseVersionFromResponse(await absoluteResponse.text());
  } catch (absoluteError) {
    logger.log("warn", "splash", "Could not load absolute path version:", absoluteError);
  }
  return null;
}

async function tryLocalVersionFallback(versionChecker) {
  const localVersion = await versionChecker.getLocalVersion();
  if (localVersion) return localVersion;
  return await tryDirectOrAbsolutePath();
}

async function fetchVersionForSplash(versionChecker) {
  try {
    const responseText = await tryPrimaryVersionUrl();
    return parseVersionFromResponse(responseText);
  } catch (error) {
    logger.warn("Could not load version info:", error);
    try {
      const fallback = await tryLocalVersionFallback(versionChecker);
      return fallback ?? "Unknown";
    } catch (localError) {
      logger.log("warn", "splash", "Could not load local version:", localError);
      return "Unknown";
    }
  }
}

function mountSplashUserCountReactive(splashScreen, ui) {
  const userCountEl = splashScreen?.querySelector("#user-count-text");
  if (!userCountEl || !ui?.uiState) return;
  ReactiveLitComponent.mountMulti(
    [{ state: ui.uiState, keys: ["user_count"] }],
    () => html`${ui.uiState?.user_count ?? 0}`,
    userCountEl
  );
}

function addSplashStats(splashScreen, version, versionChecker, ui) {
  const versionText = splashScreen.querySelector("#splash-version-text");
  if (!versionText) return;
  versionText.title = "Click to check for updates";
  versionText.style.cursor = "pointer";
  versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  if (ui?.uiState) {
    ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["version"] }],
      () => html`v.${ui.uiState?.version ?? ""}`,
      versionText
    );
  } else {
    versionText.textContent = `v.${version}`;
  }
}

class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message) {
    if (!this.statusElement) {
      logger.log("warn", "splash", "Status element not ready, skipping update:", message);
      return;
    }
    this.statusElement.textContent = message;
    this.statusElement.classList.add("splash-element-visible");
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    this.splashScreen.classList.add("fade-out");
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      this.splashScreen.classList.remove("fade-out");
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      this.splashScreen.classList.add("fade-out");
      this.setElementVisible(this.splashScreen, false);
    }
  }
}

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    manager.splashScreen = document.querySelector("#splash-screen") ?? await waitForSplashElement("#splash-screen");
    manager.statusElement =
      document.querySelector("#splash-status") ?? manager.splashScreen?.querySelector("#splash-status");
    if (!manager.splashScreen) throw new Error("Splash screen not found (AppRoot must render first)");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) =>
        logger.log("warn", "splash", "[PWA] Background part image preloading failed:", error)
      );
    } catch (e) {
      logger.log("warn", "splash", "[PWA] Failed to warm image cache:", e);
    }
    return true;
  } catch (error) {
    logger.log("error", "splash", "Error loading splash screen:", error);
    return false;
  }
}

function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = step.message;
  }
}

function runSetSubStep(manager, message) {
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = message;
  }
}

const SPLASH_HIDE_DELAY_MS = 600;

async function loadFromDataImpl(splashManager, saveData, ctx) {
  const str = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await rotateSlot1ToBackup(str);
  await loadFromSaveSlotImpl(splashManager, 1, ctx);
}

async function teardownSplashAndWait() {
  const saveSlotEl = document.getElementById("save-slot-screen");
  if (saveSlotEl) saveSlotEl.remove();
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
}

async function handleBackupLoadFlow(ctx, slot) {
  if (!ctx?.game?.saveManager) return null;
  let loadSuccess = await ctx.game.saveManager.loadGame(slot);
  if (loadSuccess && typeof loadSuccess === "object" && loadSuccess.backupAvailable) {
    const useBackup = await showLoadBackupModal();
    if (!useBackup) return null;
    await setSlot1FromBackupAsync();
    loadSuccess = await ctx.game.saveManager.loadGame(1);
  }
  return loadSuccess;
}

async function startGameOrFallback(ctx) {
  if (!ctx?.game || !ctx?.ui || !ctx?.pageRouter) return;
  if (typeof window.startGame === "function") {
    await window.startGame(ctx);
    return;
  }
  logger.log("error", "splash", "startGame function not available globally");
  await ctx.pageRouter.loadGameLayout();
  ctx.ui.initMainLayout();
  await ctx.pageRouter.loadPage("reactor_section");
  ctx.game.tooltip_manager = new (await import("./components/ui-tooltips-tutorial.js")).TooltipManager(
    "#main",
    "#tooltip",
    ctx.game
  );
  ctx.game.engine = new (await import("./logic.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

async function loadFromSaveSlotImpl(splashManager, slot, ctx) {
  try {
    await teardownSplashAndWait();
    const appCtx =
      ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
    if (!appCtx.game) {
      logger.log("error", "splash", "Game instance not available");
      return;
    }
    const loadSuccess = await handleBackupLoadFlow(appCtx, slot);
    if (loadSuccess !== true || !appCtx.pageRouter || !appCtx.ui) {
      logger.log("error", "splash", "Failed to load game or missing dependencies");
      return;
    }
    await startGameOrFallback(appCtx);
  } catch (error) {
    logger.log("error", "splash", "Error loading from save slot:", error);
  }
}

class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], cloudSaveOnly: false, cloudSaveData: null, mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  renderTo(container, state) {
    const { hasSave, saveSlots, mostRecentSave } = state;

    const onResume = async () => {
      try {
        if (window.splashManager) window.splashManager.hide();
        await new Promise((resolve) => setTimeout(resolve, 600));

        const game = this.ctx?.game ?? window.game;
        if (game) {
          const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);

          const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
          const ui = this.ctx?.ui ?? window.ui;

          if (loadSuccess && pageRouter && ui) {
            if (typeof window.startGame === "function") {
              await window.startGame({ pageRouter, ui, game });
            } else {
              await pageRouter.loadGameLayout();
              ui.initMainLayout();
              await pageRouter.loadPage("reactor_section");

              game.tooltip_manager = new (await import("./components/ui-tooltips-tutorial.js")).TooltipManager(
                "#main",
                "#tooltip",
                game
              );
              game.engine = new (await import("./logic.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten."))
        return;
      const game = this.ctx?.game ?? window.game;
      const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
      const ui = this.ctx?.ui ?? window.ui;
      try {
        if (game && typeof window.showTechTreeSelection === "function") await window.showTechTreeSelection(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = splashStartOptionsTemplate({
      mostRecentSave,
      hasSave,
      onResume,
      onNewRun,
      onShowLoad: () => this.splashManager.showSaveSlotSelection(saveSlots),
      onShowSettings: () => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS),
    });

    render(template, container);
  }
}

const formatSlotNumber = (n) => formatNumber(n, { places: 1 });

class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      selectedSlot: null,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i) {
    const isEmpty = !slotData || !slotData.exists;
    const logId = `LOG ${String(i).padStart(2, "0")}`;
    const swipeKey = `l_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isEmpty,
      swiped: isSwiped,
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      selected: isSelected,
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && now - this._lastTap < 400;
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find((s) => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return saveSlotRowTemplate({
      rowClasses,
      btnClasses,
      i,
      isCloud: false,
      isEmpty,
      logId,
      isSelected,
      slotData,
      onSwipeStart,
      onSwipeEnd,
      onSlotClick,
      onDeleteClick,
      formatPlaytimeLog,
      formatSlotNumber,
    });
  }

  _mainTemplate() {
    const localSlots = [1, 2, 3].map((i) => this.state.localSaveSlots.find((s) => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const saveData = event.target.result;
          const parsed = typeof saveData === "string" ? deserializeSave(saveData) : saveData;
          const result = SaveDataSchema.safeParse(parsed);
          if (!result.success) throw new Error("Save corrupted: validation failed");
          const validated = result.data;
          await rotateSlot1ToBackup(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      this.container.querySelector("#load-from-file-input")?.click();
    };

    return saveSlotMainTemplate({
      isCloudAvailable: false,
      cloudSlots: [],
      localSlots,
      selectedSlot: this.state.selectedSlot,
      onHeaderTouchStart: (e) => {
        this._headerStartY = e.touches[0].clientY;
      },
      onHeaderTouchEnd: (e) => {
        if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
      },
      onClose: () => this._close(),
      onFileChange,
      onRestore: () => this._handleRestore(),
      onImportBackup: triggerFileInput,
      renderSlot: (slot, idx) => this._slotTemplate(slot, idx),
    });
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const logId = `LOG ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;
    await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      selectedSlot: null,
      swipedSlots: new Set(),
    };

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const firstFilled = this.state.localSaveSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
    }

    this.render();
  }
}

const LOADING_STEPS = [
  { id: "init", message: "Initializing reactor systems..." },
  { id: "ui", message: "Calibrating control panels..." },
  { id: "game", message: "Spinning up nuclear protocols..." },
  { id: "parts", message: "Installing reactor components..." },
  { id: "upgrades", message: "Analyzing technological blueprints..." },
  { id: "objectives", message: "Briefing mission parameters..." },
  { id: "engine", message: "Achieving critical mass..." },
  { id: "ready", message: "Reactor online - All systems nominal!" },
];

class SplashFlowController {
  constructor() {
    this.loadingSteps = LOADING_STEPS;
    this.currentStep = 0;
  }
  nextStep(onUpdateStatus) {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      onUpdateStatus?.(step.message);
    }
  }
}

let flavorMessages = null;
function getFlavorMessages() {
  if (!flavorMessages) {
    try {
      flavorMessages = getValidatedGameData().flavorText;
    } catch (error) {
      logger.log("warn", "splash", "Flavor text init fallback used", error);
      flavorMessages = ["Reactor online"];
    }
  }
  return flavorMessages;
}

class SplashScreenManager extends BaseComponent {
  constructor() {
    super();
    this.splashScreen = null;
    this.statusElement = null;
    this._appContext = null;

    this.flowController = new SplashFlowController();
    this.loadingSteps = this.flowController.loadingSteps;
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.uiManager = new SplashUIManager({ statusElement: null, splashScreen: null });
    this.versionChecker = new VersionChecker(this);
    this.saveSlotUI = new SplashSaveSlotUI(this);

    if (!StorageUtils.get("reactor_user_id")) {
      StorageUtils.set("reactor_user_id", "local_architect");
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;
    this._signalJumpEnabled = false;
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    this._vholdBootTimeout = null;
    this._resumeGlowHandlers = [];

    if (!isTestEnv()) {
      this.initSocketConnection();
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }
  }

  async initSocketConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    if (typeof io === "undefined") return null;
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalhost) return null;
    try {
      const apiUrl = LEADERBOARD_CONFIG.API_URL;
      const socket = io(apiUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 3,
      });
      this.socket = socket;
      socket.on("connect", () => {});
      socket.on("userCount", (count) => {
        this.userCount = count;
        this.updateUserCountDisplay();
      });
      socket.on("disconnect", () => {});
      socket.on("connect_error", (error) => {
        logger.log("debug", "splash", "Socket.IO connection error:", error);
      });
      return socket;
    } catch (error) {
      logger.log("debug", "splash", "Failed to initialize Socket.IO:", error);
      return null;
    }
  }

  updateUserCountDisplay() {
    const ui = this._appContext?.ui;
    if (ui?.uiState) ui.uiState.user_count = this.userCount;
  }

  async waitForDOMAndLoad() {
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }
    return this.loadSplashScreen();
  }

  async loadSplashScreen() {
    return runLoadSplashScreen(this);
  }

  async initializeSplashStats() {
    if (!this.splashScreen) return;
    const version = await fetchVersionForSplash(this.versionChecker);
    const ui = this._appContext?.ui;
    if (ui?.uiState) {
      ui.uiState.version = version;
      ui.uiState.user_count = this.userCount;
    }
    addSplashStats(this.splashScreen, version, this.versionChecker, ui);
    mountSplashUserCountReactive(this.splashScreen, ui);
    this.versionChecker.startVersionChecking();
  }

  async showSaveSlotSelection(localSaveSlots) {
    await this.saveSlotUI.showSaveSlotSelection(localSaveSlots);
  }

  async loadFromData(saveData) {
    await loadFromDataImpl(this, saveData, this._appContext);
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  async loadFromSaveSlot(slot) {
    await loadFromSaveSlotImpl(this, slot, this._appContext);
  }

  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.updateStatus(message);
  }

  stopFlavorText() {
    this.uiManager.stopFlavorText();
  }

  nextStep() {
    this.flowController.nextStep((msg) => this.updateStatus(msg));
    this.currentStep = this.flowController.currentStep;
  }

  async setStep(stepId) {
    await this.ensureReady();
    runSetStep(this, stepId);
  }

  async setSubStep(message) {
    await this.ensureReady();
    runSetSubStep(this, message);
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (!this.splashScreen || this.isReady) return;

    const splashScreen = this.splashScreen;
    splashScreen.classList.remove("splash-vhold-booting");
    void splashScreen.offsetHeight;
    splashScreen.classList.add("splash-vhold-booting");
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = setTimeout(() => splashScreen.classList.remove("splash-vhold-booting"), 900);
    const audio = this._appContext?.game?.audio ?? window.game?.audio;
    audio?.play?.("crt_whine");

    const versionEl = splashScreen.querySelector("#splash-version-text");
    const userCountEl = splashScreen.querySelector("#user-count-text");
    runCathodeScramble(versionEl, versionEl?.textContent ?? "", { durationMs: 200 });
    runCathodeScramble(userCountEl, userCountEl?.textContent ?? "", { durationMs: 220 });

    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    const panelEl = splashScreen.querySelector(".splash-menu-panel");
    panelEl?.classList.remove("splash-signal-jump");

    this._signalJumpEnabled = true;
    const jumpOnce = () => {
      if (!this._signalJumpEnabled) return;
      const panel = splashScreen.querySelector(".splash-menu-panel");
      if (panel) {
        const amp = 2 + Math.random();
        const dir = Math.random() < 0.5 ? -1 : 1;
        panel.style.setProperty("--splash-jump-y", `${dir * amp}px`);
        panel.classList.remove("splash-signal-jump");
        void panel.offsetHeight;
        panel.classList.add("splash-signal-jump");
        if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
        this._signalJumpResetTimeout = setTimeout(() => panel.classList.remove("splash-signal-jump"), 230);
      }
      const nextDelayMs = 1200 + Math.random() * 2600;
      this._signalJumpLoopTimeout = setTimeout(jumpOnce, nextDelayMs);
    };
    const initialDelayMs = 1100 + Math.random() * 1500;
    this._signalJumpLoopTimeout = setTimeout(jumpOnce, initialDelayMs);

    this.stopFlavorText();
    const spinner = this.splashScreen?.querySelector(".splash-spinner");
    if (spinner) spinner.classList.add("splash-element-hidden");
    if (this.statusElement) this.statusElement.classList.add("splash-element-hidden");

    let startOptionsSection = this.splashScreen?.querySelector(".splash-start-options");
    if (!startOptionsSection) {
      startOptionsSection = document.createElement("div");
      startOptionsSection.id = "splash-start-options";
      startOptionsSection.className = "splash-start-options";
      const inner = this.splashScreen.querySelector(".splash-menu-inner");
      (inner ?? this.splashScreen.querySelector(".splash-menu-panel"))?.appendChild(startOptionsSection);
    }

    const builder = new SplashStartOptionsBuilder(this, this._appContext);
    const state = await builder.buildSaveSlotList(canLoadGame);
    builder.renderTo(startOptionsSection, state);

    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;
    const splashRoot = splashScreen;
    const active = new Set();
    const updateGlow = () => {
      if (active.size > 0) splashRoot.classList.add("splash-bezel-glow-hot");
      else splashRoot.classList.remove("splash-bezel-glow-hot");
    };
    const resumeButtons = splashRoot?.querySelectorAll(".splash-btn-resume-primary") ?? [];
    const onEnter = (e) => {
      active.add(e.currentTarget);
      updateGlow();
    };
    const onLeave = (e) => {
      active.delete(e.currentTarget);
      updateGlow();
    };
    resumeButtons.forEach((btn) => {
      btn.addEventListener("pointerenter", onEnter);
      btn.addEventListener("pointerleave", onLeave);
      btn.addEventListener("focus", onEnter);
      btn.addEventListener("blur", onLeave);
      if (btn.matches(":hover")) active.add(btn);
      this._resumeGlowHandlers.push({ el: btn, onEnter, onLeave });
    });
    updateGlow();

    startOptionsSection.classList.add("visible");
    setTimeout(() => startOptionsSection.classList.add("show"), 100);

    this.teardownIdleFade?.();
    const panel = this.splashScreen?.querySelector(".splash-menu-panel");
    if (panel) this.teardownIdleFade = initSplashMenuIdleFade(panel);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;

    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = null;
    this.splashScreen.classList.remove("splash-vhold-booting");
    this.splashScreen?.querySelector(".splash-menu-panel")?.classList.remove("splash-signal-jump");
    this.splashScreen.classList.remove("splash-bezel-glow-hot");
    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;

    this.teardownIdleFade?.();
    this.teardownIdleFade = null;
    this.stopFlavorText();
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.hide(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SPLASH_HIDDEN" });
      }
    });
  }

  show() {
    if (this.splashScreen) {
      this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
      this.uiManager.show();
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);
    if (autoHide) {
      this.errorTimeout = setTimeout(() => {
        this.hide();
      }, 3000);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.uiManager.forceHide();
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }
    }
  }

  async refreshSaveOptions() {
    await this.showStartOptions(!!(await StorageAdapter.getRaw("reactorGameSave")));
  }
}

export function createSplashManager() {
  return new SplashScreenManager();
}

export { SplashScreenManager };
