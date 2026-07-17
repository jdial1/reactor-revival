import { classMap, styleMap } from "./dom/lit.js";
import { BASE_MAX_HEAT, BASE_MAX_POWER, MAX_ACCUMULATOR_MULTIPLIER } from "./constants/balance.js";
import { Game, Engine, resetHeatThresholdSignalState, queryUpgradeElement } from "./logic.js";
import { ensureGameStateEngineSync, teardownGameStateEngineSync } from "./components/shell/game-state-sync.js";
import { wireUiDomSubsystems, teardownAppSubsystems } from "./components/shell/ui-app-wiring.js";
import { StorageUtils, StorageAdapter, migrateLocalStorageToIndexedDB, setSlot1FromBackupAsync, AUTOSAVE_SLOT_KEY, STORAGE_KEYS } from "./storage/index.js";
import { isTestEnv, BASE_LOOP_WAIT_MS } from "./simUtils.js";
import { setFormatPreferencesGetter } from "./core/numbers.js";
import { logger } from "./core/logger.js";
import { getCompactLayout } from "./domain/reactor-codec.js";
import { readThemeColor } from "./components/shell/theme-colors.js";
import { html, render } from "lit-html";
import { UI, showStatusNotice } from "./components/ui.js";
import { MODAL_IDS } from "./constants/modal-ids.js";
import { AudioService, createSplashManager, getValidatedGameData, resolveAudioService } from "./services/app-services.js";
import { safeCall, teardownAll } from "./core/teardown.js";
import {
  getValidatedPreferences,
  initPreferencesStore,
  showLoadBackupModal,
  actions,
  patchGameState,
  setDecimal,
  modalUi,
  pwaState,
  buildShellClassMap,
  buildShellStyleMap,
  preferences,
} from "./store.js";
import { enqueueClearAnimations } from "./state/game-effects.js";
import { wireTooltipManager, createTutorialManager } from "./components/ui-tooltips-tutorial.js";
import { createGameSaveManager } from "./domain/game-save.js";
import { attachCoreBridge } from "./bridge/revival-session-bridge.js";
import { getGridCanvasRenderer } from "./components/grid/grid-canvas-service.js";
import { initPwaDisplayMode } from "./components/ui-components.js";
import {
  updateToastTemplate,
  changelogModalTemplate,
  versionCheckToastTemplate,
} from "./templates/servicesTemplates.js";
import {
  renderSplashTemplate,
  gameSetupTemplate,
  fallbackStartTemplate,
  criticalErrorTemplate,
} from "./templates/appTemplates.js";
import { PageRouter } from "./page-router.js";
import { loadFailureFlavor, getFailureFlavorMessage } from "./domain/failure-flavor.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { setAppContext, getAppContext } from "./app-context.js";
import { createPerformanceUIService } from "./components/shell/performance-ui-service.js";
import { EngineStatus } from "./schema/stateSchemas.js";

export { PageRouter };

const _appUnsubs = [];

function pushAppUnsub(unsub) {
  _appUnsubs.push(unsub);
}

export function teardownAppErrorHandlers() {
  while (_appUnsubs.length) {
    const fn = _appUnsubs.pop();
    safeCall(fn);
  }
}

setFormatPreferencesGetter(getValidatedPreferences);
if (typeof console !== "undefined" && typeof document !== "undefined") {
  console.log("[ReactorBoot] app.js evaluated (static imports finished)");
}

function getSplashManager() {
  return getAppContext()?.splashManager ?? null;
}


function renderPwaOverlays() {
  const updateBlock = pwaState.updateAvailable
    ? html`<div class="update-toast">${updateToastTemplate(
      () => {
        if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
        }
        window.location.reload();
      },
      () => { pwaState.updateAvailable = false; },
      pwaState.changelogPayload ?? { summary: `Update available: ${pwaState.updateVersion}`, bullets: [] }
    )}</div>`
    : null;
  const changelogBlock = pwaState.changelogOpen
    ? changelogModalTemplate({
      title: pwaState.changelogPayload?.title ?? "Recent Changes",
      entries: pwaState.changelogPayload?.entries ?? [],
      onClose: () => { pwaState.changelogOpen = false; },
      onReload: pwaState.changelogPayload?.onReload,
    })
    : null;
  const versionToast = pwaState.versionCheckToast;
  const versionBlock = versionToast
    ? html`<div class="version-check-toast">${versionCheckToastTemplate(
      versionToast.type === "info"
        ? readThemeColor("--canvas-info")
        : versionToast.type === "warning"
          ? readThemeColor("--canvas-warning")
          : readThemeColor("--canvas-error"),
      versionToast.type === "info" ? "??" : versionToast.type === "warning" ? "??" : "?",
      versionToast.message,
      () => { pwaState.versionCheckToast = null; }
    )}</div>`
    : null;
  return html`
    <div id="pwa-toast-host">${updateBlock}${versionBlock}</div>
    <div id="pwa-changelog-host">${changelogBlock}</div>
  `;
}

function renderSplashSection(hasSession, game, ui) {
  if (hasSession) return null;
  const isMuted = ui?.uiState ? !!ui.uiState.audio_muted : !!preferences.mute;
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

let _appRootRaf = null;
let _appRootUnsub = null;
let _performanceService = null;

function startPerformanceService(game) {
  _performanceService?.stop?.();
  _performanceService = createPerformanceUIService(() => game);
  _performanceService.start();
  pushAppUnsub(() => {
    _performanceService?.stop?.();
    _performanceService = null;
  });
}

function scheduleAppRootRender(container, game, ui) {
  if (_appRootRaf != null) return;
  _appRootRaf = requestAnimationFrame(() => {
    _appRootRaf = null;
    renderAppRoot(container, game, ui);
  });
}

function handleVersionCheckRequest() {
  if (!pwaState.versionCheckRequested) return;
  getAppContext()?.splashManager?.versionChecker?.triggerVersionCheckToast?.();
  pwaState.versionCheckRequested = false;
}

function bindAppRootSubscription(container, game, ui) {
  if (_appRootUnsub) _appRootUnsub();
  const unsubs = [];
  const schedule = () => scheduleAppRootRender(container, game, ui);
  const uiState = ui?.uiState;
  if (uiState) {
    for (const key of ["is_paused", "is_melting_down", "meltdown_buildup", "parts_panel_collapsed", "parts_panel_right_side", "copy_paste_collapsed", "tutorial_claim_step", "active_page"]) {
      unsubs.push(subscribeKey(uiState, key, schedule));
    }
    unsubs.push(subscribeKey(uiState.copy_paste_display, "blueprintPlannerActive", schedule));
  }
  if (game?.state) {
    unsubs.push(subscribeKey(game.state, "heat_balanced", schedule));
    unsubs.push(subscribeKey(game.state, "melting_down", schedule));
    unsubs.push(subscribeKey(game.state, "pause", schedule));
  }
  unsubs.push(subscribeKey(modalUi, "drawerOpen", schedule));
  unsubs.push(subscribeKey(preferences, "mute", schedule));
  for (const key of ["installPromptAvailable", "updateAvailable", "updateVersion", "changelogOpen", "changelogPayload", "versionCheckToast"]) {
    unsubs.push(subscribeKey(pwaState, key, schedule));
  }
  unsubs.push(subscribeKey(pwaState, "versionCheckRequested", handleVersionCheckRequest));
  _appRootUnsub = () => {
    teardownAll(unsubs);
  };
  pushAppUnsub(() => {
    if (_appRootUnsub) _appRootUnsub();
    _appRootUnsub = null;
    if (_appRootRaf != null) cancelAnimationFrame(_appRootRaf);
    _appRootRaf = null;
  });
}

function renderAppRoot(container, game, ui) {
  if (!container) return;
  const hasSession = !!game?.lifecycleManager?.session_start_time;
  const shellClassMap = buildShellClassMap(ui?.uiState, modalUi, { hasSession, game });
  const shellStyle = buildShellStyleMap(ui?.uiState, game);
  const template = html`
    ${renderSplashSection(hasSession, game, ui)}
    <div id="wrapper" class=${classMap(shellClassMap)} style=${styleMap(shellStyle)}></div>
    ${renderPwaOverlays()}
  `;
  try {
    render(template, container);
    let modalRoot = document.getElementById("modal-root");
    if (!modalRoot) {
      modalRoot = document.createElement("dialog");
      modalRoot.id = "modal-root";
      modalRoot.className = "game-modal-host";
      container.appendChild(modalRoot);
    }
    const installBtn = document.getElementById("install_pwa_btn");
    if (installBtn) installBtn.classList.toggle("hidden", !pwaState.installPromptAvailable);
  } catch (err) {
    console.error("[ReactorBoot] app root lit render threw", err);
    throw err;
  }
}

async function bootstrapGame(game, ui) {
  getValidatedGameData();
  console.log("[ReactorBoot] bootstrap: ui.init �");
  await ui.init(game);
  const appRootEl = document.getElementById("app_root");
  renderAppRoot(appRootEl, game, ui);
  if (typeof ui.detachGameEventListeners === "function") {
    ui.detachGameEventListeners();
  }
  ui.detachGameEventListeners = attachGameEventListeners(game, ui);
  startPerformanceService(game);
  console.log("[ReactorBoot] bootstrap: tileset / partset / upgradeset �");
  game.tileset.initialize();
  await attachCoreBridge(game);
  await game.partset.initialize();
  await game.upgradeset.initialize();
  await game.set_defaults();
  game._subsystems = {
    stateManager: ui.stateManager,
    inputHandler: ui.inputHandler,
    audioController: ui.audioController,
    objectiveController: ui.objectiveController,
    achievementController: ui.achievementController,
    objectivesUI: ui.objectivesUI,
    pauseStateUI: ui.pauseStateUI,
  };
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
      selectedDifficulty,
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
        },
      difficultyPresets
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
  await clearAllGameDataForNewGame(game);
}

async function initializeGameState(game) {
  try {
    await game.initialize_new_game_state();
  } catch (error) {
    logger.log('warn', 'game', 'Error during game initialization (non-fatal):', error);
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

export async function startNewGameFlow(game, pageRouter, ui, splashManager, techTreeId) {
  try {
    hideSplashForNewGame(splashManager);
    await waitForSplashHide();
    await clearStorageForNewGameFlow(game);
    await initializeGameState(game);
    ui.stateManager?.setClickedPart?.(null);
    ui.setHelpModeActive?.(true);
    await launchGame(pageRouter, ui, game);
    StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
  } catch (error) {
    logger.log('error', 'game', 'Error in startNewGameFlow:', error);
    logger.log('error', 'game', 'Error stack:', error.stack);
    throw error;
  }
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

function setupGlobalListeners(game, ui) {
  const unsubs = [];
  attachPageClickListeners(game, unsubs);
  attachTooltipCloseListener(ui, unsubs);
  attachBeforeUnloadListener(game, unsubs);
  return () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };
}

function applyStatePatch(ui, patch) {
  const game = ui?.game;
  if (!game || !patch || typeof patch !== "object") return;
  patchGameState(game, patch);
}

function handleObjectiveCompleted(ui, payload) {
  ui.stateManager.handleObjectiveCompleted();
  const flavor = payload?.flavorText?.trim();
  if (flavor && payload?.isChapterCompletion) {
    showStatusNotice({
      tag: "CHAPTER COMPLETE",
      body: flavor,
      durationMs: 5500,
    });
  }
  if (payload?.checkId === "completeChapter1" && !StorageUtils.get("reactor_save_export_hint_seen")) {
    StorageUtils.set("reactor_save_export_hint_seen", true);
    const showSaveHint = () => showStatusNotice({
      tag: "TIP // SAVE BACKUP",
      body: "Export your save from Settings ? Export Save for backup or other devices.",
    });
    if (flavor && payload?.isChapterCompletion) {
      setTimeout(showSaveHint, 5600);
    } else {
      showSaveHint();
    }
  }
}

export function attachGameEventListeners(game, ui) {
  if (!game || !ui) return () => {};

  const unsubs = [];
  let failureFlavorMap = loadFailureFlavor();
  let lastFailureState = game.state?.failure_state ?? "nominal";

  const handleFailureState = (state) => {
    if (!state || state === lastFailureState) return;
    lastFailureState = state;
    const msg = getFailureFlavorMessage(failureFlavorMap ?? {}, state);
    if (msg && state !== "nominal") {
      showStatusNotice({
        tag: `WARN // ${String(state).toUpperCase()}`,
        body: msg,
      });
    }
    ui.updateFailurePhaseSensory?.(state);
  };

  const on = (eventName, handler) => {
    game.on(eventName, handler);
    unsubs.push(() => game.off(eventName, handler));
  };

  on("statePatch", (patch) => {
    applyStatePatch(ui, patch);
  });
  if (game.state) {
    unsubs.push(subscribeKey(game.state, "failure_state", (state) => handleFailureState(state)));
    unsubs.push(subscribeKey(game.state, "quick_select_slots", (slots) => {
      if (slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(slots, { skipStateSync: true });
    }));
  }
  on("exoticParticleEmitted", ({ tile }) => {
    if (ui.gridInteractionUI?.emitEP && tile) ui.gridInteractionUI.emitEP(tile);
  });
  on("partClicked", ({ part }) => {
    if (part && ui.stateManager?.setClickedPart) ui.stateManager.setClickedPart(part);
  });
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
    const te = tickEquivalent ?? Math.floor(ms / BASE_LOOP_WAIT_MS);
    if (ui.modalOrchestrator?.showModal) ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: ms, tickEquivalent: te });
  });
  on("simulationHardwareError", ({ message }) => {
    if (!ui.game?.state) return;
    ui.game.state.engine_status = EngineStatus.SIMULATION_ERROR;
    ui.game.state.simulation_error_message = message ?? "";
  });
  on("upgradeAdded", ({ upgrade, game: g }) => {
    if (ui.stateManager?.handleUpgradeAdded && upgrade) ui.stateManager.handleUpgradeAdded(g, upgrade);
  });
  on("upgradePurchased", ({ upgrade }) => {
    const el = upgrade ? queryUpgradeElement(upgrade) : null;
    if (el) {
      el.classList.remove("upgrade-purchase-success");
      void el.offsetWidth;
      el.classList.add("upgrade-purchase-success");
    }
  });
  on("upgradesChanged", () => ui.updateSectionCountsState(game));
  on("saveLoaded", ({ toggles, quick_select_slots }) => {
    if (toggles && ui.game) {
      patchGameState(ui.game, toggles);
    }
    if (quick_select_slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(quick_select_slots, { skipStateSync: true });
    resetHeatThresholdSignalState(game);
  });
  on("tileCleared", ({ tile }) => {
    const entity = ui.uiState?.hovered_entity;
    if (entity?.tile === tile) ui.uiState.hovered_entity = null;
  });
  on("partsPanelRefresh", () => {
    ui.refreshPartsPanel?.();
  });
  on("markStaticDirty", () => {
    getGridCanvasRenderer()?.markStaticDirty?.();
  });
  if (game.state) {
    unsubs.push(subscribeKey(game.state, "objective_notifications", (notifications) => {
      if (!notifications?.length) return;
      while (notifications.length) {
        const payload = notifications.shift();
        if (!payload) continue;
        if (payload.kind === "completed") handleObjectiveCompleted(ui, payload);
      }
    }));
  }

  ui.updateFailurePhaseSensory?.(game.state?.failure_state ?? "nominal");

  return () => {
    teardownAll(unsubs);
    unsubs.length = 0;
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

let _tooltipTeardown = null;

async function initGameComponents(game, ui) {
  if (_tooltipTeardown) _tooltipTeardown();
  _tooltipTeardown = wireTooltipManager(ui, game);
  await attachCoreBridge(game);
  game.engine = new Engine(game);
  game.tutorialManager = createTutorialManager(game);
}

async function applyOfflineWelcomeBack(game, ui) {
  const offlineMs = Date.now() - (game.lifecycleManager.last_save_time || 0);
  if (offlineMs <= OFFLINE_WELCOME_BACK_MS || !game.tileset.active_tiles_list.length) return;
  const maxMs = MAX_ACCUMULATOR_MULTIPLIER * BASE_LOOP_WAIT_MS;
  const span = Math.min(offlineMs, maxMs);
  game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / BASE_LOOP_WAIT_MS);
  await ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: span, tickEquivalent });
}

function syncToggleStatesFromGame(game, ui) {
  ui.syncToggleStatesFromGame();
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
  StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
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
  if (!StorageUtils.get(STORAGE_KEYS.QUICK_START_SHOWN)) {
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

async function startGame(appContext) {
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

const SAVE_SLOT_COUNT = 3;
const SPLASH_HIDE_DELAY_MS = 600;

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
    logger.log('error', 'game', 'Error loading saved game:', err);
    return { resolved: false, shouldPause: false };
  }
}

function shouldAutoStart(savedGame, isNewGamePending, pageInfo) {
  return !!savedGame && !isNewGamePending && !!pageInfo;
}

async function performAutoStart(hash, pageInfo, ctx) {
  if (pageInfo && pageInfo.stateless) {
    if (getSplashManager()) getSplashManager().hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await ctx.pageRouter.loadPage(hash);
    return;
  }
  if (getSplashManager()) getSplashManager().hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
  await startGame(ctx);
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

async function handleUserSession(ctx) {
  const isNewGamePending = StorageUtils.get(STORAGE_KEYS.NEW_GAME_PENDING) === 1;
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

async function clearAllSaveDataForSplashReturn(game) {
  await StorageAdapter.remove(STORAGE_KEYS.GAME_SAVE);
  await StorageAdapter.remove(AUTOSAVE_SLOT_KEY);
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    await StorageAdapter.remove(`${STORAGE_KEYS.GAME_SAVE}_${i}`);
  }
  await StorageAdapter.remove("reactorGameSave_Previous");
  await StorageAdapter.remove("reactorGameSave_Backup");
  await StorageAdapter.remove(STORAGE_KEYS.CURRENT_SLOT);
  StorageUtils.remove(STORAGE_KEYS.QUICK_START_SHOWN);
  StorageUtils.remove("google_drive_save_file_id");
  StorageUtils.remove(STORAGE_KEYS.NEW_GAME_PENDING);
  StorageUtils.remove("reactorLoadSlot");
  if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
    delete game._saved_objective_index;
  }
}

async function clearAllGameDataForNewGame(game) {
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

async function returnToSplashScreen(ctx, { clearSaves = true } = {}) {
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

function bindLoadGameButton(ctx) {
  const btn = document.getElementById("splash-load-game-btn");
  if (!btn) return;
  btn.onclick = async () => {
    if (getSplashManager()) getSplashManager().hide();
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
    if (getSplashManager()) getSplashManager().hide();
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
  wireUiDomSubsystems(ui);
  const game = new Game(ui, getCompactLayout);
  game.saveManager = createGameSaveManager(game, getCompactLayout);
  game.audio = new AudioService();
  const initAudioOnGesture = () => resolveAudioService(game.audio)?.init();
  for (const type of ["click", "keydown", "touchstart"]) {
    document.addEventListener(type, initAudioOnGesture, { once: true });
    pushAppUnsub(() => document.removeEventListener(type, initAudioOnGesture));
  }
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;
  return { ui, game, pageRouter };
}

async function main() {
  "use strict";
  console.log("[ReactorBoot] main() start");
  const pwaModule = await import("./services/app-services.js");
  console.log("[ReactorBoot] services.js loaded");
  _requestWakeLock = pwaModule.requestWakeLock;
  pwaModule.initializePwa();
  initPwaDisplayMode();
  initPreferencesStore();
  const { ui, game, pageRouter } = createAppInstances();
  console.log("[ReactorBoot] createAppInstances ok");
  const appRootEl = document.getElementById("app_root");
  console.log("[ReactorBoot] #app_root", appRootEl ? "found" : "MISSING");
  renderAppRoot(appRootEl, game, ui);
  const splashManager = createSplashManager();
  if (!isTestEnv()) {
    setAppContext({
      game,
      ui,
      pageRouter,
      subsystems: game._subsystems,
      splashManager,
      startGame,
      returnToSplashScreen,
      clearAllGameDataForNewGame,
      showTechTreeSelection,
      appRoot: { render: () => renderAppRoot(appRootEl, game, ui) },
    });
    const exposeAuditHooks =
      import.meta.env?.DEV ||
      (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("e2e"));
    if (exposeAuditHooks) {
      window.__reactorAudit = {
        get game() { return getAppContext()?.game; },
        get ui() { return getAppContext()?.ui; },
      };
      window.clearAllGameDataForNewGame = clearAllGameDataForNewGame;
      window.returnToSplashScreen = returnToSplashScreen;
    }
    bindAppRootSubscription(appRootEl, game, ui);
  }
  const ctx = { game, pageRouter, ui };
  getAppContext()?.splashManager?.setAppContext(ctx);
  console.log("[ReactorBoot] migrateLocalStorageToIndexedDB �");
  await migrateLocalStorageToIndexedDB();
  await bootstrapGame(game, ui);
  console.log("[ReactorBoot] handleUserSession �");
  await handleUserSession(ctx);
  setupButtonHandlers(ctx);
  if (typeof ui.detachGlobalListeners === "function") {
    ui.detachGlobalListeners();
  }
  ui.detachGlobalListeners = setupGlobalListeners(game, ui);
  if (typeof window !== "undefined") {
    if (typeof registerPeriodicSync === "function") registerPeriodicSync();
    if (typeof registerOneOffSync === "function") registerOneOffSync();
  }
  const { initLaunchQueueHandler } = await import("./services/pwa.js");
  initLaunchQueueHandler({ game });
  console.log("[ReactorBoot] main() finished");
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
    console.log("[ReactorBoot] DOM ready ? main()", document.readyState);
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
    pushAppUnsub(() => document.removeEventListener("DOMContentLoaded", run));
  } else {
    run();
  }
}
scheduleMain();

_windowErrorHandler = (event) => {
  if (!event.error || document.getElementById("critical-error-overlay")) return;
  console.error("[ReactorBoot] window error event", event.error);
  logger.log("error", "game", "Uncaught error:", event.error);
  if (getAppContext()?.game?.lifecycleManager?.session_start_time) return;
  showCriticalError(event.error);
};
window.addEventListener("error", _windowErrorHandler);
pushAppUnsub(() => {
  if (_windowErrorHandler) {
    window.removeEventListener("error", _windowErrorHandler);
    _windowErrorHandler = null;
  }
});

_unhandledRejectionHandler = (event) => {
  if (!event.reason || document.getElementById("critical-error-overlay")) return;
  console.error("[ReactorBoot] unhandledrejection", event.reason);
  logger.log("error", "game", "Unhandled promise rejection:", event.reason);
  if (getAppContext()?.game?.lifecycleManager?.session_start_time) return;
  showCriticalError(event.reason);
};
window.addEventListener("unhandledrejection", _unhandledRejectionHandler);
pushAppUnsub(() => {
  if (_unhandledRejectionHandler) {
    window.removeEventListener("unhandledrejection", _unhandledRejectionHandler);
    _unhandledRejectionHandler = null;
  }
});

