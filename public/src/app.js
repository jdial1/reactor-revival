import { Game, Engine, resetHeatThresholdSignalState } from "./logic.js";
import { StorageUtils, StorageAdapter, isTestEnv, migrateLocalStorageToIndexedDB, setFormatPreferencesGetter, logger, classMap, setSlot1FromBackupAsync, UPDATE_TOAST_STYLES, FOUNDATIONAL_TICK_MS, MAX_ACCUMULATOR_MULTIPLIER, BASE_MAX_HEAT, BASE_MAX_POWER } from "./utils.js";
import { html, render } from "lit-html";
import { UI } from "./components/ui.js";
import { MODAL_IDS } from "./components/ui-modals.js";
import {
  updateSectionCountsState,
  getCompactLayout,
  syncToggleStatesFromGame as applyControlDeckToggleSync,
  initializePartsPanel,
} from "./components/ui-components.js";
import { AudioService, createSplashManager, getValidatedGameData } from "./services.js";
import {
  getValidatedPreferences,
  initPreferencesStore,
  preferences,
  showLoadBackupModal,
  actions,
  patchGameState,
  setDecimal,
} from "./store.js";
import { TooltipManager, createTutorialManager } from "./components/ui-tooltips-tutorial.js";
import { ReactiveLitComponent } from "./components/reactive-lit-component.js";
import {
  renderSplashTemplate,
  gameSetupTemplate,
  updateToastTemplate,
  fallbackStartTemplate,
  criticalErrorTemplate,
} from "./templates/appTemplates.js";
import { PageRouter } from "./page-router.js";

export { PageRouter };

setFormatPreferencesGetter(getValidatedPreferences);
if (typeof console !== "undefined" && typeof document !== "undefined") {
  console.log("[ReactorBoot] app.js evaluated (static imports finished)");
}

if (typeof window !== "undefined") {
  window.splashManager ??= createSplashManager();
  window.showLoadBackupModal = showLoadBackupModal;
  window.setSlot1FromBackup = () => setSlot1FromBackupAsync();
}

let _appRootSplashMuteUnmount = null;

function renderSplashSection(hasSession, game, ui) {
  if (hasSession) return null;
  const isMuted = !!preferences.mute;
  const handleMuteClick = (e) => {
    e.stopPropagation();
    if (ui?.uiState) ui.uiState.audio_muted = !ui.uiState.audio_muted;
    else {
      preferences.mute = !preferences.mute;
      game?.audio?.toggleMute(preferences.mute);
    }
  };
  const onHideMenuClick = (e) => {
    e.stopPropagation();
    const panel = e.currentTarget.closest(".splash-menu-panel");
    if (panel) panel.classList.add("splash-menu-fade-full");
  };
  return renderSplashTemplate(isMuted, handleMuteClick, onHideMenuClick);
}

function renderAppRoot(container, game, ui) {
  if (!container) return;
  const hasSession = !!game?.lifecycleManager?.session_start_time;
  console.log("[ReactorBoot] renderAppRoot", { hasSession, container: true });
  const template = html`
    ${renderSplashSection(hasSession, game, ui)}
    <div id="wrapper" class=${classMap({ hidden: !hasSession })}></div>
    <dialog id="modal-root" class="game-modal-host"></dialog>
  `;
  try {
    render(template, container);
    console.log("[ReactorBoot] app root lit render committed");
  } catch (err) {
    console.error("[ReactorBoot] app root lit render threw", err);
    throw err;
  }
  if (!hasSession) {
    const iconEl = container.querySelector(".splash-mute-icon");
    if (iconEl) {
      _appRootSplashMuteUnmount = ReactiveLitComponent.mountMulti(
        [{ state: preferences, keys: ["mute"] }],
        () => html`<span class="splash-mute-led" data-muted=${preferences.mute ? "1" : "0"}></span>`,
        iconEl
      );
    }
  } else if (_appRootSplashMuteUnmount) {
    _appRootSplashMuteUnmount();
    _appRootSplashMuteUnmount = null;
  }
}

async function bootstrapGame(game, ui) {
  getValidatedGameData();
  console.log("[ReactorBoot] bootstrap: ui.init …");
  await ui.init(game);
  const appRootEl = document.getElementById("app_root");
  renderAppRoot(appRootEl, game, ui);
  if (typeof ui.detachGameEventListeners === "function") {
    ui.detachGameEventListeners();
  }
  ui.detachGameEventListeners = attachGameEventListeners(game, ui);
  console.log("[ReactorBoot] bootstrap: tileset / partset / upgradeset …");
  game.tileset.initialize();
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  console.log("[ReactorBoot] bootstrap: complete");
}

let _requestWakeLock = () => {};

function ensureGameSetupOverlay() {
  let overlay = document.getElementById("game-setup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "game-setup-overlay";
    overlay.className = "game-setup-overlay bios-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
}


let _showTechTreeInProgress = false;

export async function showTechTreeSelection(game, pageRouter, ui, splashManager) {
  const overlay = ensureGameSetupOverlay();
  let selectedDifficulty = null;
  let difficultyPresets;

  try {
    difficultyPresets = getValidatedGameData().difficulty;
  } catch (err) {
    logger.log('error', 'game', 'Failed to load difficulty curves:', err);
    return;
  }

  const renderSetup = () => {
    render(gameSetupTemplate(
      [],
      null,
      selectedDifficulty,
      () => {},
      (diff) => { selectedDifficulty = diff; renderSetup(); },
      () => {
        overlay.classList.add("hidden");
        setTimeout(() => overlay.remove(), 300);
      },
      async () => {
        const preset = difficultyPresets[selectedDifficulty];
        if (!preset) return;

        game.base_money = Number(preset.base_money);
        game.base_loop_wait = Number(preset.base_loop_wait);
        game.base_manual_heat_reduce = Number(preset.base_manual_heat_reduce);
        game.reactor.base_max_heat = BASE_MAX_HEAT;
        game.reactor.base_max_power = BASE_MAX_POWER;
        game.reactor.power_overflow_to_heat_ratio = Number(preset.power_overflow_to_heat_pct) / 100;
        overlay.classList.add("hidden");
        setTimeout(() => overlay.remove(), 300);

          try {
            await startNewGameFlow(game, pageRouter, ui, splashManager, null);
          } catch (error) {
            logger.log('error', 'game', 'Failed to start game:', error);
          }
        }
      ), overlay);
    };

    renderSetup();
    overlay.classList.remove("hidden");
  
}

const SPLASH_HIDE_DELAY_MS_GAME = 600;

function hideSplashForNewGame(splashManager) {
  if (splashManager) splashManager.hide();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSplashHide() {
  await delay(SPLASH_HIDE_DELAY_MS_GAME);
}

async function clearStorageForNewGameFlow(game) {
  if (typeof window.clearAllGameDataForNewGame === "function") {
    await window.clearAllGameDataForNewGame(game);
  } else {
    try {
      await StorageAdapter.remove("reactorGameSave");
      for (let i = 1; i <= 3; i++) await StorageAdapter.remove(`reactorGameSave_${i}`);
      await StorageAdapter.remove("reactorGameSave_Previous");
      await StorageAdapter.remove("reactorGameSave_Backup");
      await StorageAdapter.remove("reactorCurrentSaveSlot");
      StorageUtils.remove("reactorGameQuickStartShown");
      StorageUtils.remove("google_drive_save_file_id");
      StorageUtils.set("reactorNewGamePending", 1);
    } catch (_) { }
    delete game._saved_objective_index;
  }
}

async function initializeGameState(game) {
  try {
    await game.initialize_new_game_state();
  } catch (error) {
    logger.log('warn', 'game', 'Error during game initialization (non-fatal):', error);
  }
}

async function launchGame(pageRouter, ui, game) {
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
  } else {
    await pageRouter.loadGameLayout();
    ui.initMainLayout();
    await pageRouter.loadPage("reactor_section");
    game.startSession();
    game.engine.start();
  }
}

export async function startNewGameFlow(game, pageRouter, ui, splashManager, techTreeId) {
  try {
    hideSplashForNewGame(splashManager);
    await waitForSplashHide();
    await clearStorageForNewGameFlow(game);
    await initializeGameState(game);
    ui.stateManager?.setClickedPart?.(null);
    ui.setHelpModeActive?.(true);
    await launchGame(pageRouter, ui, game);
    StorageUtils.remove("reactorNewGamePending");
  } catch (error) {
    logger.log('error', 'game', 'Error in startNewGameFlow:', error);
    logger.log('error', 'game', 'Error stack:', error.stack);
    throw error;
  }
}

window.showTechTreeSelection = showTechTreeSelection;

let _toastContainer = null;

function removeExistingUpdateToast() {
  const existing = document.querySelector(".update-toast");
  if (existing) existing.remove();
  if (_toastContainer?.parentNode) _toastContainer.remove();
  _toastContainer = null;
}

const UPDATE_TOAST_AUTO_REMOVE_MS = 10000;
const TOAST_ANIMATION_MS = 300;


function showUpdateToast(newVersion, currentVersion) {
  removeExistingUpdateToast();
  _toastContainer = document.createElement("div");
  document.body.appendChild(_toastContainer);

  const onRefresh = () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };
  const onClose = () => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  };

  render(updateToastTemplate(onRefresh, onClose), _toastContainer);

  setTimeout(() => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast && document.body.contains(toast)) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  }, UPDATE_TOAST_AUTO_REMOVE_MS);
}

let _swMessageHandler = null;

function registerServiceWorkerUpdateListener() {
  if (!("serviceWorker" in navigator)) return;
  _swMessageHandler = (event) => {
    if (event?.data?.type === "NEW_VERSION_AVAILABLE") {
      showUpdateToast(event.data.version, event.data.currentVersion);
    }
  };
  navigator.serviceWorker.addEventListener("message", _swMessageHandler);
}

let _pageClickHandler = null;
let _tooltipCloseHandler = null;
let _beforeUnloadHandler = null;

function attachPageClickListeners(game) {
  _pageClickHandler = async (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (!pageBtn) return;
    e.preventDefault();
    game.ui?.modalOrchestrator?.hideModal(MODAL_IDS.SETTINGS);
    await game.router.loadPage(pageBtn.dataset.page);
  };
  document.addEventListener("click", _pageClickHandler);
}

function attachTooltipCloseListener(game) {
  _tooltipCloseHandler = (e) => {
    if (!game.tooltip_manager?.isLocked) return;
    const tooltipEl = document.getElementById("tooltip");
    if (
      tooltipEl &&
      !tooltipEl.contains(e.target) &&
      !e.target.closest(".upgrade, .part") &&
      !e.target.closest("#tooltip_actions")
    ) {
      game.tooltip_manager.closeView();
    }
  };
  document.addEventListener("click", _tooltipCloseHandler, true);
}

function attachBeforeUnloadListener(game) {
  _beforeUnloadHandler = () => {
    try {
      if (StorageUtils.get("reactorNewGamePending") === 1) return;
    } catch (_) {}
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      void game.saveManager.autoSave();
    }
  };
  window.addEventListener("beforeunload", _beforeUnloadHandler);
}

function setupGlobalListeners(game) {
  attachPageClickListeners(game);
  attachTooltipCloseListener(game);
  attachBeforeUnloadListener(game);
}

function applyStatePatch(ui, patch) {
  const game = ui?.game;
  if (!game || !patch || typeof patch !== "object") return;
  patchGameState(game, patch);
}

function handleObjectiveLoaded(ui, payload) {
  if (!payload?.objective) return;
  ui.stateManager.handleObjectiveLoaded(payload.objective, payload.objectiveIndex);
}

function handleObjectiveCompleted(ui) {
  ui.stateManager.handleObjectiveCompleted();
}

function handleObjectiveUnloaded(ui) {
  ui.stateManager.handleObjectiveUnloaded();
}

export function attachGameEventListeners(game, ui) {
  if (!game || !ui) return () => {};

  const subscriptions = [];
  const on = (eventName, handler) => {
    game.on(eventName, handler);
    subscriptions.push(() => game.off(eventName, handler));
  };

  on("statePatch", (patch) => applyStatePatch(ui, patch));
  on("toggleStateChanged", ({ toggleName, value }) => {
    if (!ui?.game?.state) return;
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "heat_control"];
    if (!toggleKeys.includes(toggleName)) return;
    const coerced = Boolean(value);
    if (ui.game.state[toggleName] !== coerced) {
      ui.game.onToggleStateChange?.(toggleName, coerced);
    }
  });
  on("quickSelectSlotsChanged", ({ slots }) => ui.stateManager.setQuickSelectSlots(slots));
  on("reactorTick", (payload) => {
    applyStatePatch(ui, payload);
  });
  on("exoticParticleEmitted", ({ tile }) => {
    if (ui.gridController?.emitEP && tile) ui.gridController.emitEP(tile);
  });
  on("partClicked", ({ part }) => {
    if (part && ui.stateManager?.setClickedPart) ui.stateManager.setClickedPart(part);
  });
  on("gridResized", () => ui.resizeReactor?.());
  on("vibrationRequest", ({ type }) => {
    const patterns = { heavy: 50, meltdown: 200, doublePulse: [30, 80, 30] };
    const pattern = patterns[type];
    if (pattern != null) actions.enqueueEffect(game, { kind: "haptic", pattern });
  });
  on("heatWarningCleared", () => {
    if (ui.heatVisualsUI?.clearHeatWarningClasses) ui.heatVisualsUI.clearHeatWarningClasses();
    if (ui.gridInteractionUI) ui.gridInteractionUI.clearSegmentHighlight();
  });
  on("chapterCelebration", () => {});
  on("welcomeBackOffline", ({ deltaTime, offlineMs, tickEquivalent }) => {
    const ms = offlineMs ?? deltaTime;
    const te = tickEquivalent ?? Math.floor(ms / FOUNDATIONAL_TICK_MS);
    if (ui.modalOrchestrator?.showModal) ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: ms, tickEquivalent: te });
  });
  on("gameLoopWorkerFatal", ({ detail }) => {
    logger.log("error", "engine", "Game loop worker fatal:", detail);
  });
  on("simulationHardwareError", ({ message }) => {
    if (!ui.game?.state) return;
    ui.game.state.engine_status = "simulation_error";
    ui.game.state.simulation_error_message = message ?? "";
  });
  on("upgradeAdded", ({ upgrade, game: g }) => {
    if (ui.stateManager?.handleUpgradeAdded && upgrade) ui.stateManager.handleUpgradeAdded(g, upgrade);
  });
  on("upgradePurchased", ({ upgrade }) => {
    if (upgrade?.$el) {
      upgrade.$el.classList.remove("upgrade-purchase-success");
      void upgrade.$el.offsetWidth;
      upgrade.$el.classList.add("upgrade-purchase-success");
    }
  });
  on("upgradesChanged", () => updateSectionCountsState(ui, game));
  on("upgradesAffordabilityChanged", ({ hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch }) => {
    if (!ui?.uiState) return;
    ui.uiState.upgrades_banner_visibility = {
      upgradesHidden: !(hasAnyUpgrade && !hasVisibleAffordableUpgrade),
      researchHidden: !(hasAnyResearch && !hasVisibleAffordableResearch),
    };
  });
  on("saveLoaded", ({ toggles, quick_select_slots }) => {
    if (toggles && ui.game) {
      patchGameState(ui.game, toggles);
    }
    if (quick_select_slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(quick_select_slots);
    resetHeatThresholdSignalState(game);
  });
  on("meltdown", () => {
    if (ui.game?.state) ui.game.state.melting_down = true;
  });
  on("meltdownResolved", () => {
    if (ui.game?.state) ui.game.state.melting_down = false;
  });
  on("meltdownStateChanged", () => {
    if (ui.meltdownUI?.updateMeltdownState) ui.meltdownUI.updateMeltdownState();
  });
  on("meltdownStarted", () => {
    if (ui.meltdownUI?.startMeltdownBuildup) {
      ui.meltdownUI.startMeltdownBuildup(() => ui.meltdownUI?.explodeAllPartsSequentially?.());
    } else if (ui.meltdownUI?.explodeAllPartsSequentially) {
      ui.meltdownUI.explodeAllPartsSequentially();
    }
  });
  on("visualEventsReady", (eventBuffer) => {
    if (ui._renderVisualEvents && eventBuffer) ui._renderVisualEvents(eventBuffer);
  });
  on("tileCleared", ({ tile }) => {
    if (game.tooltip_manager?.current_tile_context === tile) game.tooltip_manager.hide();
  });
  on("clearAnimations", () => {
    if (ui.gridInteractionUI?.clearAllActiveAnimations) ui.gridInteractionUI.clearAllActiveAnimations();
  });
  on("clearImageCache", () => {
    if (ui.gridCanvasRenderer?.clearImageCache) ui.gridCanvasRenderer.clearImageCache();
  });
  on("partsPanelRefresh", () => {
    ui.refreshPartsPanel?.();
  });
  on("markTileDirty", ({ row, col }) => {
    if (ui.gridCanvasRenderer?.markTileDirty) ui.gridCanvasRenderer.markTileDirty(row, col);
  });
  on("markStaticDirty", () => {
    if (ui.gridCanvasRenderer?.markStaticDirty) ui.gridCanvasRenderer.markStaticDirty();
  });
  on("showFloatingText", ({ tile, value }) => {
    if (tile) ui.showFloatingTextAtTile(tile, value);
  });
  on("objectiveLoaded", (payload) => handleObjectiveLoaded(ui, payload));
  on("objectiveCompleted", () => handleObjectiveCompleted(ui));
  on("objectiveUnloaded", () => handleObjectiveUnloaded(ui));

  return () => {
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        subscriptions[i]();
      } catch (_) {}
    }
    subscriptions.length = 0;
  };
}

const OFFLINE_WELCOME_BACK_MS = 30000;
const OBJECTIVE_CHECK_READY_MS = 100;
const SYNC_UI_DELAY_MS = 100;

function getInitialPage(pageRouter) {
  const hash = window.location.hash.substring(1);
  return hash in pageRouter.pages ? hash : "reactor_section";
}

async function tryLoadStatelessPage(pageRouter, initialPage) {
  const pageDef = pageRouter.pages[initialPage];
  if (pageDef?.stateless) {
    await pageRouter.loadPage(initialPage);
    return true;
  }
  return false;
}

function initGameComponents(game) {
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);
  game.engine = new Engine(game);
  game.engine.setForceNoSAB(preferences.forceNoSAB === true);
  game.tutorialManager = createTutorialManager(game);
}

async function applyOfflineWelcomeBack(game, ui) {
  const offlineMs = Date.now() - (game.lifecycleManager.last_save_time || 0);
  if (offlineMs <= OFFLINE_WELCOME_BACK_MS || !game.tileset.active_tiles_list.length) return;
  const maxMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(offlineMs, maxMs);
  game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  await ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: span, tickEquivalent });
}

function syncToggleStatesFromGame(game, ui) {
  applyControlDeckToggleSync(ui);
}

function startEngine(game) {
  game.engine.start();
  _requestWakeLock();
}

function syncUIAfterEngineStart(game, ui) {
  setDecimal(game.state, "current_heat", game.reactor.current_heat);
  setDecimal(game.state, "current_power", game.reactor.current_power);
  game.state.max_heat = game.reactor.max_heat;
  game.state.max_power = game.reactor.max_power;
  if (ui.heatVisualsUI && game.state) {
    const hr = game.state.heat_ratio;
    const ratio = typeof hr === "number" && Number.isFinite(hr) ? hr : 0;
    ui.heatVisualsUI._applyHeatFromRatio(ratio);
  }
  StorageUtils.remove("reactorNewGamePending");
  game.objectives_manager?._syncActiveObjectiveToState?.();
  ui.pauseStateUI?.updatePauseState?.();
  setTimeout(() => {
    game.reactor.updateStats();
  }, SYNC_UI_DELAY_MS);
}

function initializeEngineViaPauseToggle(game) {
  game.onToggleStateChange?.("pause", false);
  game.onToggleStateChange?.("pause", true);
}

async function finalizeGameStart(game, ui) {
  game.pause();
  await applyOfflineWelcomeBack(game, ui);
  syncToggleStatesFromGame(game, ui);
  startEngine(game);
  initializeEngineViaPauseToggle(game);
  syncUIAfterEngineStart(game, ui);
  if (!StorageUtils.get("reactorGameQuickStartShown")) {
    try {
      await ui.modalOrchestrator.showModal(MODAL_IDS.QUICK_START, { game });
    } catch (error) {
      logger.log('warn', 'game', 'Failed to show quick start modal:', error);
    }
  }
}

function applyPendingToggleStates(game) {
  if (!game._pendingToggleStates) return;
  patchGameState(game, game._pendingToggleStates);
  delete game._pendingToggleStates;
}

function restoreObjectiveState(game, savedIndex) {
  const maxValidIndex = game.objectives_manager.objectives_data.length - 2;
  let index = savedIndex;
  if (index < 0) index = 0;
  if (index > maxValidIndex) index = maxValidIndex;
  game.objectives_manager.current_objective_index = index;
  game.objectives_manager.set_objective(index, true);
  game.objectives_manager.start();
}

async function runObjectiveRestoreFlow(game, ui) {
  const savedIndex = game._saved_objective_index;
  delete game._saved_objective_index;
  const finishObjectiveRestoreFlow = async () => {
    restoreObjectiveState(game, savedIndex);
    await finalizeGameStart(game, ui);
  };
  if (!game.objectives_manager?.objectives_data?.length) {
    const checkReady = async () => {
      if (game.objectives_manager?.objectives_data?.length) {
        await finishObjectiveRestoreFlow();
      } else {
        setTimeout(checkReady, OBJECTIVE_CHECK_READY_MS);
      }
    };
    checkReady();
  } else {
    await finishObjectiveRestoreFlow();
  }
}

async function startGame(appContext) {
  const { pageRouter, ui, game } = appContext;
  const initialPage = getInitialPage(pageRouter);
  if (await tryLoadStatelessPage(pageRouter, initialPage)) return;
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage(initialPage);
  initGameComponents(game);
  await game.startSession();
  if (typeof window !== "undefined" && window.appRoot) window.appRoot.render();
  if (initialPage === "reactor_section" && ui.resizeReactor) {
    ui.resizeReactor();
    requestAnimationFrame(() => ui.resizeReactor());
    setTimeout(() => ui.resizeReactor(), 50);
    setTimeout(() => ui.resizeReactor(), 150);
  }
  initializePartsPanel(ui);
  applyPendingToggleStates(game);
  if (game._saved_objective_index !== undefined) {
    await runObjectiveRestoreFlow(game, ui);
  } else {
    game.objectives_manager.start();
    await finalizeGameStart(game, ui);
  }
}

const SAVE_SLOT_COUNT = 3;
const SPLASH_HIDE_DELAY_MS = 600;

function hasAnyExistingSave(isNewGamePending) {
  if (isNewGamePending) return false;
  if (StorageUtils.getRaw("reactorGameSave")) return true;
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    if (StorageUtils.getRaw(`reactorGameSave_${i}`)) return true;
  }
  return false;
}

async function resolveBackupIfRequested(game, savedGame, loadSlot) {
  if (!savedGame || typeof savedGame !== "object" || !savedGame.backupAvailable || !window.showLoadBackupModal || !window.setSlot1FromBackup) return savedGame;
  const useBackup = await window.showLoadBackupModal();
  if (!useBackup) return false;
  await window.setSlot1FromBackup();
  return game.saveManager.loadGame(loadSlot ? parseInt(loadSlot) : null);
}

async function loadSavedGame(game, loadSlot, isNewGamePending) {
  if (isNewGamePending) return { resolved: false, shouldPause: false };
  try {
    const savedGame = loadSlot ? await game.saveManager.loadGame(parseInt(loadSlot)) : await game.saveManager.loadGame();
    if (loadSlot) StorageUtils.remove("reactorLoadSlot");
    const resolved = await resolveBackupIfRequested(game, savedGame, loadSlot);
    return { resolved, shouldPause: resolved === true };
  } catch (err) {
    logger.log('error', 'game', 'Error loading saved game:', err);
    return { resolved: false, shouldPause: false };
  }
}

function shouldAutoStart(savedGame, isNewGamePending, pageInfo) {
  return !!savedGame && !isNewGamePending && !!pageInfo;
}

async function performAutoStart(hash, pageInfo, ctx) {
  if (pageInfo && pageInfo.stateless) {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await ctx.pageRouter.loadPage(hash);
    return;
  }
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
  await startGame(ctx);
}

async function handleNoAutoStart(ctx) {
  if (window.splashManager) {
    await window.splashManager.setStep("ready");
    await window.splashManager.showStartOptions(true);
    return;
  }
  createFallbackStartInterface(ctx.pageRouter, ctx.ui, ctx.game);
}

async function handleUserSession(ctx) {
  const isNewGamePending = StorageUtils.get("reactorNewGamePending") === 1;
  const loadSlot = StorageUtils.get("reactorLoadSlot");
  const { resolved: savedGame, shouldPause } = await loadSavedGame(ctx.game, loadSlot, isNewGamePending);
  if (shouldPause) {
    ctx.game.paused = true;
    if (ctx.game.state) ctx.game.state.pause = true;
  }
  const hash = window.location.hash.substring(1);
  const pageInfo = ctx.pageRouter.pages[hash];
  const autoStart = shouldAutoStart(savedGame, isNewGamePending, pageInfo);
  if (autoStart) await performAutoStart(hash, pageInfo, ctx);
  else await handleNoAutoStart(ctx);
}

async function clearAllGameDataForNewGame(game) {
  await StorageAdapter.remove("reactorGameSave");
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    await StorageAdapter.remove(`reactorGameSave_${i}`);
  }
  await StorageAdapter.remove("reactorGameSave_Previous");
  await StorageAdapter.remove("reactorGameSave_Backup");
  await StorageAdapter.remove("reactorCurrentSaveSlot");
  StorageUtils.remove("reactorGameQuickStartShown");
  StorageUtils.remove("google_drive_save_file_id");
  StorageUtils.set("reactorNewGamePending", 1);
  if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
    delete game._saved_objective_index;
  }
}

function bindLoadGameButton(ctx) {
  const btn = document.getElementById("splash-load-game-btn");
  if (!btn) return;
  btn.onclick = async () => {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await startGame(ctx);
  };
}

function bindLoadGameUploadRow(ctx) {
  const loadBtn =
    document.querySelector("#splash-load-game-upload-row #splash-load-game-btn") ??
    document.getElementById("splash-load-game-btn");
  if (!loadBtn) return;
  loadBtn.onclick = async () => {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await startGame(ctx);
  };
}

function setupButtonHandlers(ctx) {
  bindLoadGameButton(ctx);
  bindLoadGameUploadRow(ctx);
}

function createAppInstances() {
  const ui = new UI();
  const game = new Game(ui, getCompactLayout);
  game.audio = new AudioService();
  const initAudioOnGesture = () => game.audio.init();
  document.addEventListener("click", initAudioOnGesture, { once: true });
  document.addEventListener("keydown", initAudioOnGesture, { once: true });
  document.addEventListener("touchstart", initAudioOnGesture, { once: true });
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;
  return { ui, game, pageRouter };
}

async function main() {
  "use strict";
  console.log("[ReactorBoot] main() start");
  const pwaModule = await import("./services.js");
  console.log("[ReactorBoot] services.js loaded");
  _requestWakeLock = pwaModule.requestWakeLock;
  pwaModule.initializePwa();
  initPreferencesStore();
  const { ui, game, pageRouter } = createAppInstances();
  console.log("[ReactorBoot] createAppInstances ok");
  const appRootEl = document.getElementById("app_root");
  console.log("[ReactorBoot] #app_root", appRootEl ? "found" : "MISSING");
  renderAppRoot(appRootEl, game, ui);
  if (!isTestEnv()) {
    window.pageRouter = pageRouter;
    window.ui = ui;
    window.game = game;
    window.appRoot = { render: () => renderAppRoot(appRootEl, game, ui) };
  }
  console.log("[ReactorBoot] migrateLocalStorageToIndexedDB …");
  await migrateLocalStorageToIndexedDB();
  const ctx = { game, pageRouter, ui };
  if (window.splashManager) window.splashManager.setAppContext(ctx);
  await bootstrapGame(game, ui);
  console.log("[ReactorBoot] handleUserSession …");
  await handleUserSession(ctx);
  setupButtonHandlers(ctx);
  setupGlobalListeners(game);
  registerServiceWorkerUpdateListener();
  if (typeof window !== "undefined") {
    if (typeof registerPeriodicSync === "function") registerPeriodicSync();
    if (typeof registerOneOffSync === "function") registerOneOffSync();
  }
  setupLaunchQueueHandler(game);
  console.log("[ReactorBoot] main() finished");
}

function setupLaunchQueueHandler(game) {
  if (!('launchQueue' in window) || !('files' in LaunchParams.prototype)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files.length) return;

    const fileHandle = launchParams.files[0];
    const file = await fileHandle.getFile();
    const text = await file.text();

    try {
      const validated = game?.saveManager?.validateSaveData(text);

      if (game.engine?.running) game.pause();

      const confirmLoad = confirm(
        `Load save "${file.name}"?\n(Current unsaved progress will be lost)`
      );

      if (confirmLoad && validated) {
        await game.applySaveState(validated);
        game.activeFileHandle = fileHandle;
      }
    } catch (e) {
      logger.log('error', 'game', '[PWA] Error handling launch file', e);
    }
  });
}

window.startGame = startGame;
window.clearAllGameDataForNewGame = clearAllGameDataForNewGame;

async function createFallbackStartInterface(pageRouter, ui, game) {
  try {
    const container = document.createElement("div");
    container.id = "fallback-start-interface";
    document.body.appendChild(container);
    const onStart = async () => {
      container.remove();
      await startGame({ pageRouter, ui, game });
    };
    render(fallbackStartTemplate(onStart), container);
  } catch (error) {
    logger.log('error', 'game', 'Could not load fallback start interface', error);
  }
}

function showCriticalError(error) {
  console.error("[ReactorBoot] showCriticalError", error);
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  const errorStack = error?.stack || "";
  const errorOverlay = document.createElement("div");
  errorOverlay.id = "critical-error-overlay";
  errorOverlay.className = "critical-error-overlay";
  render(criticalErrorTemplate(errorMessage, errorStack, () => window.location.reload()), errorOverlay);
  document.body.appendChild(errorOverlay);
  document.body.style.overflow = "hidden";
}


let _windowErrorHandler = null;
let _unhandledRejectionHandler = null;

function scheduleMain() {
  const run = () => {
    console.log("[ReactorBoot] DOM ready → main()", document.readyState);
    try {
      main().catch((error) => {
        console.error("[ReactorBoot] main() rejected", error);
        logger.log('error', 'game', 'Critical startup error:', error);
        showCriticalError(error);
      });
    } catch (error) {
      console.error("[ReactorBoot] main() sync throw", error);
      logger.error("Critical startup error:", error);
      showCriticalError(error);
    }
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
}
scheduleMain();

_windowErrorHandler = (event) => {
  if (event.error && !document.getElementById("critical-error-overlay")) {
    console.error("[ReactorBoot] window error event", event.error);
    logger.log('error', 'game', 'Uncaught error:', event.error);
    showCriticalError(event.error);
  }
};
window.addEventListener("error", _windowErrorHandler);

_unhandledRejectionHandler = (event) => {
  if (event.reason && !document.getElementById("critical-error-overlay")) {
    console.error("[ReactorBoot] unhandledrejection", event.reason);
    logger.log('error', 'game', 'Unhandled promise rejection:', event.reason);
    showCriticalError(event.reason);
  }
};
window.addEventListener("unhandledrejection", _unhandledRejectionHandler);

export function teardownAppErrorHandlers() {
  if (_windowErrorHandler) {
    window.removeEventListener("error", _windowErrorHandler);
    _windowErrorHandler = null;
  }
  if (_unhandledRejectionHandler) {
    window.removeEventListener("unhandledrejection", _unhandledRejectionHandler);
    _unhandledRejectionHandler = null;
  }
}
