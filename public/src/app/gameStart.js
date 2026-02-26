import { TooltipManager } from "../components/tooltip.js";
import { TutorialManager } from "../components/tutorialManager.js";
import { Engine } from "../core/engine.js";
import { requestWakeLock } from "../services/pwa.js";
import { StorageUtils } from "../utils/util.js";
import { preferences } from "../core/preferencesStore.js";
import { logger } from "../utils/logger.js";
import { MODAL_IDS } from "../components/ModalManager.js";

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
  game.tutorialManager = new TutorialManager(game);
}

async function applyOfflineWelcomeBack(game, ui) {
  const offlineMs = Date.now() - (game.lifecycleManager.last_save_time || 0);
  if (offlineMs <= OFFLINE_WELCOME_BACK_MS || !game.tileset.active_tiles_list.length || !game.time_flux) return;
  const targetTickDuration = game.loop_wait;
  const maxAccumulator = 100 * targetTickDuration;
  game.engine.time_accumulator = Math.min(offlineMs, maxAccumulator);
  const queuedTicks = Math.floor(game.engine.time_accumulator / targetTickDuration);
  await ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs, queuedTicks });
}

function syncToggleStatesFromGame(game, ui) {
  if (ui.controlDeckUI?.syncToggleStatesFromGame) {
    ui.controlDeckUI.syncToggleStatesFromGame();
    return;
  }
  try {
    ui.stateManager.setVar("pause", game.paused ?? false);
    ui.stateManager.setVar("auto_sell", game.reactor?.auto_sell_enabled ?? false);
    ui.stateManager.setVar("auto_buy", game.reactor?.auto_buy_enabled ?? false);
    ui.stateManager.setVar("heat_control", game.reactor?.heat_controlled ?? false);
    ui.stateManager.setVar("time_flux", game.time_flux ?? true);
  } catch (_) {}
}

function startEngine(game) {
  game.engine.start();
  requestWakeLock();
}

function syncUIAfterEngineStart(game, ui) {
  ui.stateManager.setVar("current_heat", game.reactor.current_heat);
  ui.stateManager.setVar("current_power", game.reactor.current_power);
  ui.stateManager.setVar("max_heat", game.reactor.max_heat);
  ui.stateManager.setVar("max_power", game.reactor.max_power);
  if (ui.heatVisualsUI) ui.heatVisualsUI.updateHeatVisuals();
  StorageUtils.remove("reactorNewGamePending");
  game.objectives_manager?._syncActiveObjectiveToState?.();
  ui.pauseStateUI?.updatePauseState?.();
  setTimeout(() => {
    game.reactor.updateStats();
    if (ui.objectivesUI?.updateObjectiveDisplayFromState) ui.objectivesUI.updateObjectiveDisplayFromState();
  }, SYNC_UI_DELAY_MS);
}

async function finalizeGameStart(game, ui) {
  game.pause();
  ui.stateManager.setVar("pause", true);
  await applyOfflineWelcomeBack(game, ui);
  syncToggleStatesFromGame(game, ui);
  startEngine(game);
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
  Object.entries(game._pendingToggleStates).forEach(([key, value]) => {
    game.ui.stateManager.setVar(key, value);
  });
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

export async function startGame(appContext) {
  const { pageRouter, ui, game } = appContext;
  const initialPage = getInitialPage(pageRouter);
  if (await tryLoadStatelessPage(pageRouter, initialPage)) return;
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage(initialPage);
  initGameComponents(game);
  await game.startSession();
  ui.partsPanelUI.initializePartsPanel();
  applyPendingToggleStates(game);
  if (game._saved_objective_index !== undefined) {
    await runObjectiveRestoreFlow(game, ui);
  } else {
    game.objectives_manager.start();
    await finalizeGameStart(game, ui);
  }
}
