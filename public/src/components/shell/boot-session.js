import { Engine, prepareOfflineCatchup } from "../../domain/engine.js";
import { ensureGameStateEngineSync, teardownGameStateEngineSync } from "./game-state-sync.js";
import { teardownAppSubsystems } from "./ui-app-wiring.js";
import { attachGameEventListeners } from "./game-event-wiring.js";
import { createPerformanceUIService } from "./performance-ui-service.js";
import { bindEngineOfflineVisibility } from "./engine-offline-visibility.js";
import { StorageUtils, StorageAdapter, setSlot1FromBackupAsync, AUTOSAVE_SLOT_KEY, STORAGE_KEYS } from "../../storage/index.js";
import { logger } from "../../core/logger.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";
import { BASE_MAX_HEAT, BASE_MAX_POWER } from "../../constants/balance.js";
import { patchGameState, setDecimal, showLoadBackupModal } from "../../store.js";
import { getAppContext } from "../../app-context.js";
import { wireTooltipManager, createTutorialManager } from "../ui-tooltips-tutorial.js";
import { attachCoreBridge } from "../../bridge/revival-session-bridge.js";
import { enqueueClearAnimations } from "../../state/game-effects.js";
import { getValidatedGameData } from "../../services/app-services.js";
import { safeCall, teardownAll } from "../../core/teardown.js";
import { render } from "lit-html";
import {
  gameSetupTemplate,
  fallbackStartTemplate,
} from "../../templates/appTemplates.js";
import { syncActiveObjectiveToState } from "../../domain/objectives.js";

const OBJECTIVE_CHECK_READY_MS = 100;
const SYNC_UI_DELAY_MS = 100;
const SPLASH_HIDE_DELAY_MS = 600;
const SAVE_SLOT_COUNT = 3;

let _requestWakeLock = () => {};
let _performanceService = null;

export function setBootWakeLock(fn) {
  _requestWakeLock = typeof fn === "function" ? fn : () => {};
}

function getSplashManager() {
  return getAppContext()?.splashManager ?? null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

let _tooltipTeardown = null;

async function initGameComponents(game, ui) {
  if (_tooltipTeardown) _tooltipTeardown();
  _tooltipTeardown = wireTooltipManager(ui, game);
  await attachCoreBridge(game);
  game.engine = new Engine(game);
  bindEngineOfflineVisibility(game.engine);
  game.tutorialManager = createTutorialManager(game);
}

async function applyOfflineWelcomeBack(game, ui) {
  const snapSlots = game.coreBridge?.getSnapshot?.()?.grid?.slots ?? [];
  const hasParts =
    (game.tileset?.active_tiles_list?.length ?? 0) > 0 ||
    snapSlots.some((s) => {
      if (!s) return false;
      if (typeof s === "string") return s.length > 0;
      return !!(s.id || s.partId);
    });
  if (!hasParts) return;
  const lastSave = Number(game.lifecycleManager.last_save_time || 0);
  const offlineMs = Date.now() - lastSave;
  const prepared = prepareOfflineCatchup(game, offlineMs);
  if (!prepared) return;
  await ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, {
    offlineMs: prepared.offlineMs,
    tickEquivalent: prepared.tickEquivalent,
  });
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
  StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
  syncActiveObjectiveToState(game.objectives_manager);
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
  ui.syncToggleStatesFromGame();
  startEngine(game);
  initializeEngineViaPauseToggle(game);
  syncUIAfterEngineStart(game, ui);
  if (!StorageUtils.get(STORAGE_KEYS.QUICK_START_SHOWN)) {
    try {
      await ui.modalOrchestrator.showModal(MODAL_IDS.QUICK_START, { game });
    } catch (error) {
      logger.log("warn", "game", "Failed to show quick start modal:", error);
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
  game.achievement_manager?.start?.();
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

export async function startGame(appContext) {
  const { pageRouter, ui, game } = appContext;
  const initialPage = getInitialPage(pageRouter);
  if (await tryLoadStatelessPage(pageRouter, initialPage)) return;
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  ensureGameStateEngineSync(game);
  await pageRouter.loadPage(initialPage);
  await initGameComponents(game, ui);
  await game.startSession();
  getAppContext()?.appRoot?.render?.();
  if (initialPage === "reactor_section" && ui.resizeReactor) {
    ui.resizeReactor();
    requestAnimationFrame(() => ui.resizeReactor());
    setTimeout(() => ui.resizeReactor(), 50);
    setTimeout(() => ui.resizeReactor(), 150);
  }
  ui.initializePartsPanel();
  applyPendingToggleStates(game);
  if (game._saved_objective_index !== undefined) {
    await runObjectiveRestoreFlow(game, ui);
  } else {
    game.objectives_manager.start();
    game.achievement_manager?.start?.();
    await finalizeGameStart(game, ui);
  }
}

function startPerformanceService(game) {
  _performanceService?.stop?.();
  _performanceService = createPerformanceUIService(() => game);
  _performanceService.start();
  return () => {
    _performanceService?.stop?.();
    _performanceService = null;
  };
}

export async function bootstrapGame(game, ui, renderRoot) {
  getValidatedGameData();
  await ui.init(game);
  if (typeof renderRoot === "function") renderRoot();
  else getAppContext()?.appRoot?.render?.();
  if (typeof ui.detachGameEventListeners === "function") {
    ui.detachGameEventListeners();
  }
  ui.detachGameEventListeners = attachGameEventListeners(game, ui);
  const stopPerf = startPerformanceService(game);
  game.tileset.initialize();
  await attachCoreBridge(game);
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  if (!game._subsystems) {
    game._subsystems = {
      stateManager: ui.stateManager,
      inputHandler: ui.inputHandler,
      audioController: ui.audioController,
      objectiveController: ui.objectiveController,
      achievementController: ui.achievementController,
      objectivesUI: ui.objectivesUI,
      pauseStateUI: ui.pauseStateUI,
      registry: game.subsystemRegistry,
    };
  }
  return stopPerf;
}

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

async function initializeGameState(game) {
  try {
    await game.initialize_new_game_state();
  } catch (error) {
    logger.log("warn", "game", "Error during game initialization (non-fatal):", error);
  }
}

async function launchGame(pageRouter, ui, game) {
  const ctx = getAppContext();
  if (typeof ctx?.startGame === "function") {
    await ctx.startGame({ pageRouter, ui, game });
  } else {
    await pageRouter.loadGameLayout();
    ui.initMainLayout();
    ensureGameStateEngineSync(game);
    await pageRouter.loadPage("reactor_section");
    game.startSession();
    game.engine.start();
  }
}

export async function startNewGameFlow(game, pageRouter, ui, splashManager) {
  try {
    if (splashManager) splashManager.hide();
    await delay(SPLASH_HIDE_DELAY_MS);
    await clearAllGameDataForNewGame(game);
    await initializeGameState(game);
    ui.stateManager?.setClickedPart?.(null);
    ui.setHelpModeActive?.(true);
    await launchGame(pageRouter, ui, game);
    StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
  } catch (error) {
    logger.log("error", "game", "Error in startNewGameFlow:", error);
    logger.log("error", "game", "Error stack:", error.stack);
    throw error;
  }
}

export async function showTechTreeSelection(game, pageRouter, ui, splashManager) {
  const overlay = ensureGameSetupOverlay();
  let selectedDifficulty = null;
  let difficultyPresets;

  try {
    difficultyPresets = getValidatedGameData().difficulty;
  } catch (err) {
    logger.log("error", "game", "Failed to load difficulty curves:", err);
    return;
  }

  const dismissOverlay = () => {
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 300);
  };

  const renderSetup = () => {
    render(gameSetupTemplate(
      selectedDifficulty,
      (diff) => { selectedDifficulty = diff; renderSetup(); },
      dismissOverlay,
      async () => {
        const preset = difficultyPresets[selectedDifficulty];
        if (!preset) return;

        game.base_money = Number(preset.base_money);
        game.base_loop_wait = Number(preset.base_loop_wait);
        game.base_manual_heat_reduce = Number(preset.base_manual_heat_reduce);
        game.reactor.base_max_heat = BASE_MAX_HEAT;
        game.reactor.base_max_power = BASE_MAX_POWER;
        game.reactor.power_overflow_to_heat_ratio = Number(preset.power_overflow_to_heat_pct) / 100;
        dismissOverlay();

        try {
          await startNewGameFlow(game, pageRouter, ui, splashManager);
        } catch (error) {
          logger.log("error", "game", "Failed to start game:", error);
        }
      },
      difficultyPresets
    ), overlay);
  };

  renderSetup();
  overlay.classList.remove("hidden");
}

async function resolveBackupIfRequested(game, savedGame, loadSlot) {
  if (!savedGame || typeof savedGame !== "object" || !savedGame.backupAvailable) return savedGame;
  const useBackup = await showLoadBackupModal();
  if (!useBackup) return false;
  await setSlot1FromBackupAsync();
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
    logger.log("error", "game", "Error loading saved game:", err);
    return { resolved: false, shouldPause: false };
  }
}

function shouldAutoStart(savedGame, isNewGamePending, pageInfo) {
  return !!savedGame && !isNewGamePending && !!pageInfo;
}

async function performAutoStart(hash, pageInfo, ctx) {
  if (pageInfo && pageInfo.stateless) {
    getSplashManager()?.hide();
    await delay(SPLASH_HIDE_DELAY_MS);
    await ctx.pageRouter.loadPage(hash);
    return;
  }
  getSplashManager()?.hide();
  await delay(SPLASH_HIDE_DELAY_MS);
  await startGame(ctx);
}

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
    logger.log("error", "game", "Could not load fallback start interface", error);
  }
}

async function handleNoAutoStart(ctx) {
  const sm = getSplashManager();
  if (sm) {
    await sm.setStep("ready");
    await sm.showStartOptions(true);
    return;
  }
  createFallbackStartInterface(ctx.pageRouter, ctx.ui, ctx.game);
}

export async function handleUserSession(ctx) {
  const isNewGamePending = StorageUtils.get(STORAGE_KEYS.NEW_GAME_PENDING) === 1;
  const loadSlot = StorageUtils.get("reactorLoadSlot");
  const { resolved: savedGame, shouldPause } = await loadSavedGame(ctx.game, loadSlot, isNewGamePending);
  if (shouldPause) {
    ctx.game.onToggleStateChange?.("pause", true);
  }
  const hash = window.location.hash.substring(1);
  const pageInfo = ctx.pageRouter.pages[hash];
  if (shouldAutoStart(savedGame, isNewGamePending, pageInfo)) {
    await performAutoStart(hash, pageInfo, ctx);
  } else {
    await handleNoAutoStart(ctx);
  }
}

export async function clearAllSaveDataForSplashReturn(game) {
  await StorageAdapter.remove(STORAGE_KEYS.GAME_SAVE);
  await StorageAdapter.remove(AUTOSAVE_SLOT_KEY);
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    await StorageAdapter.remove(`${STORAGE_KEYS.GAME_SAVE}_${i}`);
  }
  await StorageAdapter.remove("reactorGameSave_Previous");
  await StorageAdapter.remove("reactorGameSave_Backup");
  await StorageAdapter.remove(STORAGE_KEYS.CURRENT_SLOT);
  StorageUtils.remove(STORAGE_KEYS.QUICK_START_SHOWN);
  StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
  StorageUtils.remove("reactorLoadSlot");
  if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
    delete game._saved_objective_index;
  }
}

export async function clearAllGameDataForNewGame(game) {
  await clearAllSaveDataForSplashReturn(game);
  StorageUtils.set(STORAGE_KEYS.NEW_GAME_PENDING, 1);
}

function rebindSplashDom(splashManager) {
  if (!splashManager) return;
  splashManager.splashScreen = document.querySelector("#splash-screen");
  splashManager.statusElement =
    splashManager.splashScreen?.querySelector("#splash-status") ?? document.querySelector("#splash-status");
  splashManager.uiManager.setRefs({
    statusElement: splashManager.statusElement,
    splashScreen: splashManager.splashScreen,
  });
}

export async function returnToSplashScreen(ctx, { clearSaves = true } = {}) {
  const { game, ui, pageRouter } = ctx ?? {};
  if (game?.engine?.running) game.engine.stop();
  teardownGameStateEngineSync(game);
  teardownAppSubsystems(ui, game);
  if (clearSaves) await clearAllSaveDataForSplashReturn(game);
  if (game?.lifecycleManager) game.lifecycleManager.session_start_time = null;
  game?.reactor?.clearMeltdownState?.();
  enqueueClearAnimations(game);
  ui?.modalOrchestrator?.hideModal?.(MODAL_IDS.SETTINGS);
  ui.teardownGameLayout();
  pageRouter?.resetForSplashReturn?.();
  getAppContext()?.appRoot?.render?.();
  const splashManager = getSplashManager();
  if (!splashManager) return;
  rebindSplashDom(splashManager);
  splashManager.isReady = false;
  splashManager.show();
  await splashManager.setStep("ready");
  await splashManager.showStartOptions(false);
}

export function setupSplashLoadButton(ctx) {
  const loadBtn =
    document.querySelector("#splash-load-game-upload-row #splash-load-game-btn") ??
    document.getElementById("splash-load-game-btn");
  if (!loadBtn) return;
  loadBtn.onclick = async () => {
    getSplashManager()?.hide();
    await delay(SPLASH_HIDE_DELAY_MS);
    await startGame(ctx);
  };
}

let _pageClickHandler = null;
let _tooltipCloseHandler = null;
let _beforeUnloadHandler = null;

function attachPageClickListeners(game, unsubs) {
  _pageClickHandler = async (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (!pageBtn) return;
    e.preventDefault();
    game.ui?.modalOrchestrator?.hideModal(MODAL_IDS.SETTINGS);
    await game.router.loadPage(pageBtn.dataset.page);
  };
  document.addEventListener("click", _pageClickHandler);
  unsubs.push(() => {
    if (_pageClickHandler) {
      document.removeEventListener("click", _pageClickHandler);
      _pageClickHandler = null;
    }
  });
}

function attachTooltipCloseListener(ui, unsubs) {
  _tooltipCloseHandler = (e) => {
    if (!ui.tooltipManager?.isLocked) return;
    const tooltipEl = document.getElementById("tooltip");
    if (
      tooltipEl &&
      !tooltipEl.contains(e.target) &&
      !e.target.closest(".upgrade, .part") &&
      !e.target.closest("#tooltip_actions")
    ) {
      ui.tooltipManager.closeView();
    }
  };
  document.addEventListener("click", _tooltipCloseHandler, true);
  unsubs.push(() => {
    if (_tooltipCloseHandler) {
      document.removeEventListener("click", _tooltipCloseHandler, true);
      _tooltipCloseHandler = null;
    }
  });
}

function attachBeforeUnloadListener(game, unsubs) {
  _beforeUnloadHandler = () => {
    safeCall(() => { if (StorageUtils.get(STORAGE_KEYS.NEW_GAME_PENDING) === 1) return; });
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      void game.saveManager.autoSave();
    }
  };
  window.addEventListener("beforeunload", _beforeUnloadHandler);
  unsubs.push(() => {
    if (_beforeUnloadHandler) {
      window.removeEventListener("beforeunload", _beforeUnloadHandler);
      _beforeUnloadHandler = null;
    }
  });
}

export function setupGlobalListeners(game, ui) {
  const unsubs = [];
  attachPageClickListeners(game, unsubs);
  attachTooltipCloseListener(ui, unsubs);
  attachBeforeUnloadListener(game, unsubs);
  return () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };
}
