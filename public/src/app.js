import { classMap, styleMap } from "./dom/lit.js";
import { Game } from "./domain/game.js";
import "./components/upgrades/presentation.js";
import { wireUiDomSubsystems } from "./components/shell/ui-app-wiring.js";
import { migrateLocalStorageToIndexedDB } from "./storage/index.js";
import { isTestEnv } from "./simUtils.js";
import { setFormatPreferencesGetter } from "./core/numbers.js";
import { logger } from "./core/logger.js";
import { getCompactLayout } from "./domain/reactor-codec.js";
import { readThemeColor } from "./components/shell/theme-colors.js";
import { html, render } from "lit-html";
import { UI } from "./components/ui.js";
import { AudioService, createSplashManager, resolveAudioService } from "./services/app-services.js";
import { safeCall, teardownAll } from "./core/teardown.js";
import {
  getValidatedPreferences,
  initPreferencesStore,
  modalUi,
  pwaState,
  buildShellClassMap,
  buildShellStyleMap,
  shellHeatRatioAttr,
  preferences,
} from "./store.js";
import { createGameSaveManager } from "./domain/game-save.js";
import { initPwaDisplayMode } from "./components/ui-components.js";
import {
  startGame,
  setBootWakeLock,
  bootstrapGame,
  handleUserSession,
  returnToSplashScreen,
  clearAllGameDataForNewGame,
  showTechTreeSelection,
  setupSplashLoadButton,
  setupGlobalListeners,
} from "./components/shell/boot-session.js";
import {
  updateToastTemplate,
  changelogModalTemplate,
  versionCheckToastTemplate,
} from "./templates/servicesTemplates.js";
import {
  renderSplashTemplate,
  criticalErrorTemplate,
} from "./templates/appTemplates.js";
import { PageRouter } from "./page-router.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { setAppContext, getAppContext } from "./app-context.js";

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
if (typeof document !== "undefined") {
  logger.log("info", "boot", "app.js evaluated (static imports finished)");
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
    for (const key of ["is_paused", "is_melting_down", "meltdown_buildup", "parts_panel_collapsed", "parts_panel_right_side", "copy_paste_collapsed", "tutorial_claim_step", "active_page", "heat_critical", "snapshot_rev"]) {
      unsubs.push(subscribeKey(uiState, key, schedule));
    }
    unsubs.push(subscribeKey(uiState.copy_paste_display, "blueprintPlannerActive", schedule));
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
  const heatRatioAttr = shellHeatRatioAttr(game);
  const template = html`
    ${renderSplashSection(hasSession, game, ui)}
    <div id="wrapper" class=${classMap(shellClassMap)} style=${styleMap(shellStyle)} data-heat-ratio=${heatRatioAttr}></div>
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
    logger.log("error", "boot", "app root lit render threw", err);
    throw err;
  }
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

function showCriticalError(error) {
  logger.log("error", "boot", "showCriticalError", error);
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  const errorStack = error?.stack || "";
  const errorOverlay = document.createElement("div");
  errorOverlay.id = "critical-error-overlay";
  errorOverlay.className = "critical-error-overlay";
  render(criticalErrorTemplate(errorMessage, errorStack, () => window.location.reload()), errorOverlay);
  document.body.appendChild(errorOverlay);
  document.body.style.overflow = "hidden";
}

async function main() {
  "use strict";
  logger.log("info", "boot", "main() start");
  const pwaModule = await import("./services/app-services.js");
  logger.log("info", "boot", "services.js loaded");
  setBootWakeLock(pwaModule.requestWakeLock);
  pwaModule.initializePwa();
  initPwaDisplayMode();
  initPreferencesStore();
  const { ui, game, pageRouter } = createAppInstances();
  logger.log("info", "boot", "createAppInstances ok");
  const appRootEl = document.getElementById("app_root");
  logger.log("info", "boot", "#app_root", appRootEl ? "found" : "MISSING");
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
  logger.log("info", "boot", "migrateLocalStorageToIndexedDB");
  await migrateLocalStorageToIndexedDB();
  const stopPerf = await bootstrapGame(game, ui, () => renderAppRoot(appRootEl, game, ui));
  if (typeof stopPerf === "function") pushAppUnsub(stopPerf);
  logger.log("info", "boot", "handleUserSession");
  await handleUserSession(ctx);
  setupSplashLoadButton(ctx);
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
  logger.log("info", "boot", "main() finished");
}

let _windowErrorHandler = null;
let _unhandledRejectionHandler = null;

function scheduleMain() {
  const run = () => {
    logger.log("info", "boot", "DOM ready → main()", document.readyState);
    try {
      main().catch((error) => {
        logger.log("error", "game", "Critical startup error:", error);
        showCriticalError(error);
      });
    } catch (error) {
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
