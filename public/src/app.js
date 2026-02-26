import "./config/superjsonSetup.js";
import { Game } from "./core/game.js";
import { escapeHtml } from "./utils/stringUtils.js";
import { StorageUtils, StorageUtilsAsync, isTestEnv, migrateLocalStorageToIndexedDB } from "./utils/util.js";
import { UI } from "./components/ui.js";
import "./services/pwa.js";
import { PageRouter } from "./components/pageRouter.js";
import { GoogleDriveSave } from "./services/GoogleDriveSave.js";
import { SupabaseAuth } from "./services/SupabaseAuth.js";
import { SupabaseSave } from "./services/SupabaseSave.js";
import { AudioService } from "./services/audioService.js";
import { requestWakeLock } from "./services/pwa.js";
import { logger } from "./utils/logger.js";
import { registerServiceWorkerUpdateListener } from "./app/updateToast.js";
import { startGame } from "./app/gameStart.js";
import { setupGlobalListeners } from "./app/globalListeners.js";
import { GameBootstrapper } from "./app/GameBootstrapper.js";
import { settingsModal } from "./components/settingsModal.js";
import { initPreferencesStore } from "./core/preferencesStore.js";
import { initCloudSyncQueue } from "./services/saveMutations.js";

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
  if (shouldPause) ctx.game.paused = true;
  const hash = window.location.hash.substring(1);
  const pageInfo = ctx.pageRouter.pages[hash];
  const autoStart = shouldAutoStart(savedGame, isNewGamePending, pageInfo);
  if (autoStart) await performAutoStart(hash, pageInfo, ctx);
  else await handleNoAutoStart(ctx);
}

async function clearAllGameDataForNewGame(game) {
  await StorageUtilsAsync.remove("reactorGameSave");
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    await StorageUtilsAsync.remove(`reactorGameSave_${i}`);
  }
  await StorageUtilsAsync.remove("reactorGameSave_Previous");
  await StorageUtilsAsync.remove("reactorGameSave_Backup");
  await StorageUtilsAsync.remove("reactorCurrentSaveSlot");
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
  const row = document.getElementById("splash-load-game-upload-row");
  if (!row) return;
  const loadBtn = row.querySelector("#splash-load-game-btn");
  const uploadBtn = row.querySelector("#splash-upload-option-btn");
  if (loadBtn) {
    loadBtn.onclick = async () => {
      if (window.splashManager) window.splashManager.hide();
      await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
      await startGame(ctx);
    };
  }
  if (uploadBtn) {
    uploadBtn.onclick = async () => {
      if (ctx.googleDriveSave) await ctx.googleDriveSave.uploadSave();
    };
  }
}

function bindLoadFromCloudButton(ctx) {
  const btn = document.getElementById("splash-load-cloud-btn");
  if (!btn) return;
  btn.onclick = async () => {
    if (ctx.googleDriveSave) await ctx.googleDriveSave.downloadSave();
  };
}

function bindSandboxButton(ctx) {
  const btn = document.getElementById("splash-sandbox-btn");
  if (!btn) return;
  btn.onclick = async () => {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await clearAllGameDataForNewGame(ctx.game);
    StorageUtils.set("reactorGameQuickStartShown", 1);
    await ctx.game.initialize_new_game_state();
    await startGame(ctx);
    StorageUtils.remove("reactorNewGamePending");
    ctx.ui.sandboxUI.enterSandbox();
  };
}

function setupButtonHandlers(ctx) {
  bindLoadGameButton(ctx);
  bindLoadGameUploadRow(ctx);
  bindLoadFromCloudButton(ctx);
  bindSandboxButton(ctx);
}

async function handleEmailConfirmationFromUrl(supabaseAuth) {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenHash = urlParams.get("token_hash");
  const type = urlParams.get("type");
  if (!tokenHash || !type) return;
  await supabaseAuth.handleEmailConfirmation(tokenHash, type);
  const cleanUrl = new URL(window.location.href);
  cleanUrl.searchParams.delete("token_hash");
  cleanUrl.searchParams.delete("type");
  cleanUrl.searchParams.delete("next");
  window.history.replaceState({}, document.title, cleanUrl.toString());
}

async function ensureAuthReady(googleDriveSave, supabaseAuth) {
  await googleDriveSave.checkAuth(true);
  if (supabaseAuth.refreshToken && !supabaseAuth.isSignedIn()) {
    await supabaseAuth.refreshAccessToken();
  }
}

function createAppInstances() {
  const ui = new UI();
  const game = new Game(ui);
  game.audio = new AudioService();
  game.audio.init();
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;
  return { ui, game, pageRouter };
}

async function main() {
  "use strict";
  await migrateLocalStorageToIndexedDB();
  initPreferencesStore();
  const googleDriveSave = new GoogleDriveSave();
  const supabaseAuth = new SupabaseAuth();
  window.googleDriveSave = googleDriveSave;
  window.supabaseAuth = supabaseAuth;
  await handleEmailConfirmationFromUrl(supabaseAuth);
  await ensureAuthReady(googleDriveSave, supabaseAuth);
  initCloudSyncQueue();
  const { ui, game, pageRouter } = createAppInstances();
  if (!isTestEnv()) {
    window.pageRouter = pageRouter;
    window.ui = ui;
    window.game = game;
  }
  const ctx = { game, pageRouter, ui, googleDriveSave, supabaseAuth };
  if (window.splashManager) window.splashManager.setAppContext(ctx);
  settingsModal.setAppContext(ctx);
  const bootstrapper = new GameBootstrapper({ game, ui, pageRouter, splashManager: window.splashManager });
  await bootstrapper.bootstrap();
  await handleUserSession(ctx);
  setupButtonHandlers(ctx);
  setupGlobalListeners(game);
  registerServiceWorkerUpdateListener();
  if (typeof window !== "undefined") {
    if (typeof registerPeriodicSync === "function") registerPeriodicSync();
    if (typeof registerOneOffSync === "function") registerOneOffSync();
  }
  setupLaunchQueueHandler(game);
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
    const response = await fetch("pages/fallback-start.html");
    const html = await response.text();
    const container = document.createElement("div");
    container.innerHTML = html;
    const fallbackDiv = container.firstChild;
    document.body.appendChild(fallbackDiv);

    document.getElementById("fallback-start-btn").onclick = async () => {
      fallbackDiv.remove();
      await startGame({ pageRouter, ui, game });
    };
  } catch (error) {
    logger.log('error', 'game', 'Could not load fallback start interface', error);
  }
}

function showCriticalError(error) {
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  const errorStack = error?.stack || "";
  
  const errorOverlay = document.createElement("div");
  errorOverlay.id = "critical-error-overlay";
  errorOverlay.className = "critical-error-overlay";
  errorOverlay.innerHTML = `
    <div class="critical-error-content pixel-panel">
      <h1 class="critical-error-title">REACTOR FAILED TO START</h1>
      <div class="critical-error-message">
        <p class="error-text">${escapeHtml(errorMessage)}</p>
        ${errorStack ? `<details class="error-details"><summary>Error Details</summary><pre class="error-stack">${escapeHtml(errorStack)}</pre></details>` : ""}
      </div>
      <button id="critical-error-reload" class="pixel-btn btn-start">Reload Page</button>
    </div>
  `;
  
  document.body.appendChild(errorOverlay);
  
  document.getElementById("critical-error-reload").onclick = () => {
    window.location.reload();
  };
  
  document.body.style.overflow = "hidden";
}


let _windowErrorHandler = null;
let _unhandledRejectionHandler = null;

document.addEventListener("DOMContentLoaded", () => {
  try {
    main().catch((error) => {
      logger.log('error', 'game', 'Critical startup error:', error);
      showCriticalError(error);
    });
  } catch (error) {
    logger.error("Critical startup error:", error);
    showCriticalError(error);
  }
});

_windowErrorHandler = (event) => {
  if (event.error && !document.getElementById("critical-error-overlay")) {
    logger.log('error', 'game', 'Uncaught error:', event.error);
    showCriticalError(event.error);
  }
};
window.addEventListener("error", _windowErrorHandler);

_unhandledRejectionHandler = (event) => {
  if (event.reason && !document.getElementById("critical-error-overlay")) {
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
