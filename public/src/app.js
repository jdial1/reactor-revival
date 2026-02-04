import { Game } from "./core/game.js";
import { ObjectiveManager } from "./core/objective.js";
import { TooltipManager } from "./components/tooltip.js";
import { on, escapeHtml, safeGetItem, safeSetItem, safeRemoveItem } from "./utils/util.js";
import { UI } from "./components/ui.js";
import { Engine } from "./core/engine.js";
import "./services/pwa.js";
import { PageRouter } from "./components/pageRouter.js";
import { GoogleDriveSave } from "./services/GoogleDriveSave.js";
import { SupabaseAuth } from "./services/SupabaseAuth.js";
import { SupabaseSave } from "./services/SupabaseSave.js";
import { AudioService } from "./services/audioService.js";
import { settingsModal } from "./components/settingsModal.js";
// Background/PWA helpers
import "./services/pwa.js";

async function initializeApp(game, ui, pageRouter) {
  if (window.splashManager) {
    await window.splashManager.readyPromise;
    window.splashManager.setStep("init");
  }

  if (window.templateLoader) {
    await window.templateLoader.loadTemplates();
  }

  ui.init(game);

  if (window.splashManager) await window.splashManager.setStep("parts");
  game.tileset.initialize();
  await game.partset.initialize();

  if (window.splashManager) await window.splashManager.setStep("upgrades");
  await game.upgradeset.initialize();
  await game.set_defaults();
}

async function handleUserSession(game, pageRouter, ui) {
  const isNewGamePending = safeGetItem("reactorNewGamePending") === "1";
  const loadSlot = safeGetItem("reactorLoadSlot");

  // Check if there are any existing saves (old format or new slot format)
  let hasAnySave = false;
  if (!isNewGamePending) {
    // Check old format first
    const oldSave = safeGetItem("reactorGameSave");
    if (oldSave) {
      hasAnySave = true;
    } else {
      // Check new slot format
      for (let i = 1; i <= 3; i++) {
        const slotSave = safeGetItem(`reactorGameSave_${i}`);
        if (slotSave) {
          hasAnySave = true;
          break;
        }
      }
    }
  }

  // If a New Game is pending, skip loading any existing save to avoid applying old upgrades
  let savedGame = false;
  if (!isNewGamePending) {
    if (loadSlot) {
      // Load from specific slot
      console.log(`[DEBUG] Loading from slot: ${loadSlot}`);
      savedGame = await game.loadGame(parseInt(loadSlot));
      console.log(`[DEBUG] Load result: ${savedGame}`);
      safeRemoveItem("reactorLoadSlot"); // Clear the load slot flag
    } else {
      // Load from most recent save (backward compatibility)
      console.log("[DEBUG] Loading from most recent save");
      savedGame = await game.loadGame();
      console.log(`[DEBUG] Load result: ${savedGame}`);
    }
  }

  const hash = window.location.hash.substring(1);
  const pageInfo = pageRouter.pages[hash];
  const shouldAutoStart = savedGame && !isNewGamePending && pageInfo;

  console.log(`[DEBUG] Auto-start check: savedGame=${savedGame}, isNewGamePending=${isNewGamePending}, hash="${hash}", pageInfo=${!!pageInfo}, shouldAutoStart=${shouldAutoStart}`);

  if (shouldAutoStart) {
    console.log(
      `[DEBUG] Saved game and deep link found (${hash}). Auto-starting...`
    );

    // For stateless pages, just hide splash and load the page
    if (pageInfo && pageInfo.stateless) {
      console.log(`[DEBUG] Auto-starting to stateless page: ${hash}`);
      if (window.splashManager) {
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600)); // Allow time for splash to hide
      await pageRouter.loadPage(hash);
    } else {
      // For game pages, start the full game
      if (window.splashManager) {
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600)); // Allow time for splash to hide
      await startGame(pageRouter, ui, game);
    }
  } else if (window.splashManager) {
    await window.splashManager.setStep("ready");
    await window.splashManager.showStartOptions(true); // Always show load game option
  } else {
    createFallbackStartInterface(pageRouter, ui, game);
  }
}

function clearAllGameDataForNewGame(game) {
  safeRemoveItem("reactorGameSave");
  for (let i = 1; i <= 3; i++) {
    safeRemoveItem(`reactorGameSave_${i}`);
  }
  safeRemoveItem("reactorCurrentSaveSlot");
  safeRemoveItem("reactorGameQuickStartShown");
  safeRemoveItem("google_drive_save_file_id");
  safeSetItem("reactorNewGamePending", "1");
  if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
    delete game._saved_objective_index;
  }
}

function setupButtonHandlers(pageRouter, ui, game) {
  const newGameBtn = document.getElementById("splash-new-game-btn");
  if (newGameBtn) {
    newGameBtn.onclick = async () => {
      console.log("[TECH-TREE] splash-new-game-btn clicked in app.js");
      if (window.showTechTreeSelection && window.splashManager) {
        console.log("[TECH-TREE] Using tech tree selection flow");
        try {
          await window.showTechTreeSelection(game, pageRouter, ui, window.splashManager);
        } catch (error) {
          console.error("[TECH-TREE] Error in tech tree selection, falling back to direct start:", error);
          if (window.splashManager) {
            window.splashManager.hide();
          }
          await new Promise((resolve) => setTimeout(resolve, 600));
          clearAllGameDataForNewGame(game);
          await game.initialize_new_game_state();
          await startGame(pageRouter, ui, game);
          safeRemoveItem("reactorNewGamePending");
        }
      } else {
        console.log("[TECH-TREE] Tech tree selection not available, using direct start");
        if (window.splashManager) {
          window.splashManager.hide();
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
        clearAllGameDataForNewGame(game);
        await game.initialize_new_game_state();
        await startGame(pageRouter, ui, game);
        safeRemoveItem("reactorNewGamePending");
      }
    };
  }

  const loadGameBtn = document.getElementById("splash-load-game-btn");
  if (loadGameBtn) {
    loadGameBtn.onclick = async () => {
      if (window.splashManager) {
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
      await startGame(pageRouter, ui, game);
    };
  }

  const loadGameUploadRow = document.getElementById("splash-load-game-upload-row");
  if (loadGameUploadRow) {
    const loadBtn = loadGameUploadRow.querySelector("#splash-load-game-btn");
    const uploadBtn = loadGameUploadRow.querySelector("#splash-upload-option-btn");

    if (loadBtn) {
      loadBtn.onclick = async () => {
        if (window.splashManager) {
          window.splashManager.hide();
        }
        await new Promise((resolve) => setTimeout(resolve, 600));
        await startGame(pageRouter, ui, game);
      };
    }

    if (uploadBtn) {
      uploadBtn.onclick = async () => {
        if (window.googleDriveSave) {
          await window.googleDriveSave.uploadSave();
        }
      };
    }
  }

  const loadFromCloudBtn = document.getElementById("splash-load-cloud-btn");
  if (loadFromCloudBtn) {
    loadFromCloudBtn.onclick = async () => {
      if (window.googleDriveSave) {
        await window.googleDriveSave.downloadSave();
      }
    };
  }

}

/**
 * Show update toast notification
 */
function showUpdateToast(newVersion, currentVersion) {
  // Remove any existing toast
  const existingToast = document.querySelector('.update-toast');
  if (existingToast) {
    existingToast.remove();
  }

  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.innerHTML = `
    <div class="update-toast-content">
      <div class="update-toast-message">
        <span class="update-toast-icon">🚀</span>
        <span class="update-toast-text">A new version is available!</span>
      </div>
      <button id="refresh-button" class="update-toast-button">Refresh</button>
      <button class="update-toast-close" onclick="this.closest('.update-toast').remove()">×</button>
    </div>
  `;

  // Add toast styles if not already present
  if (!document.querySelector('#update-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'update-toast-styles';
    style.textContent = `
      .update-toast {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #2a2a2a;
        border: 2px solid #4CAF50;
        border-radius: 8px;
        padding: 0;
        z-index: 10000;
        font-family: 'Minecraft', monospace;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        animation: toast-slide-up 0.3s ease-out;
        max-width: 400px;
        width: 90%;
      }

      .update-toast-content {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        gap: 12px;
      }

      .update-toast-message {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        color: #fff;
      }

      .update-toast-icon {
        font-size: 1.2em;
      }

      .update-toast-text {
        font-size: 0.9em;
        font-weight: 500;
      }

      .update-toast-button {
        background: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 16px;
        font-family: 'Minecraft', monospace;
        font-size: 0.8em;
        cursor: pointer;
        transition: background-color 0.2s;
        white-space: nowrap;
      }

      .update-toast-button:hover {
        background: #45a049;
      }

      .update-toast-close {
        background: transparent;
        color: #ccc;
        border: none;
        font-size: 1.2em;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
        transition: color 0.2s;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .update-toast-close:hover {
        color: #fff;
      }

      @keyframes toast-slide-up {
        from {
          transform: translateX(-50%) translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateX(-50%) translateY(0);
          opacity: 1;
        }
      }

      @media (max-width: 480px) {
        .update-toast {
          bottom: 10px;
          left: 10px;
          right: 10px;
          transform: none;
          max-width: none;
          width: auto;
        }

        .update-toast-content {
          padding: 10px 12px;
          gap: 8px;
        }

        .update-toast-text {
          font-size: 0.8em;
        }

        .update-toast-button {
          padding: 6px 12px;
          font-size: 0.75em;
        }
      }
    `;
    document.head.appendChild(style);
  }

  // Add toast to page
  document.body.appendChild(toast);

  // Set up refresh button click handler
  const refreshButton = toast.querySelector('#refresh-button');
  refreshButton.addEventListener('click', () => {
    // Send message to service worker to skip waiting and activate new version
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    // Reload the page to apply the update
    window.location.reload();
  });

  // Auto-remove toast after 10 seconds
  setTimeout(() => {
    if (document.body.contains(toast)) {
      toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.remove();
        }
      }, 300);
    }
  }, 10000);
}

async function main() {
  "use strict";

  window.googleDriveSave = new GoogleDriveSave();
  
  window.supabaseAuth = new SupabaseAuth();
  
  const urlParams = new URLSearchParams(window.location.search);
  const tokenHash = urlParams.get('token_hash');
  const type = urlParams.get('type');
  if (tokenHash && type) {
      await window.supabaseAuth.handleEmailConfirmation(tokenHash, type);
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token_hash');
      cleanUrl.searchParams.delete('type');
      cleanUrl.searchParams.delete('next');
      window.history.replaceState({}, document.title, cleanUrl.toString());
  }

  await window.googleDriveSave.checkAuth(true);
  if (window.supabaseAuth.refreshToken && !window.supabaseAuth.isSignedIn()) {
      await window.supabaseAuth.refreshAccessToken();
  }

  const ui = new UI();
  const game = new Game(ui);
  game.audio = new AudioService();
  game.audio.init();
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;

  // Make objects available globally for PWA manager
  window.pageRouter = pageRouter;
  window.ui = ui;
  window.game = game;

  await initializeApp(game, ui, pageRouter);
  await handleUserSession(game, pageRouter, ui);
  setupButtonHandlers(pageRouter, ui, game);
  setupGlobalListeners(game);

  // Listen for service worker update notifications and show toast
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (event && event.data && event.data.type === "NEW_VERSION_AVAILABLE") {
        showUpdateToast(event.data.version, event.data.currentVersion);
      }
    });
  }

  // Register background capabilities (best-effort, feature-detected inside functions)
  if (typeof window !== "undefined") {
    if (typeof registerPeriodicSync === "function") registerPeriodicSync();
    if (typeof registerOneOffSync === "function") registerOneOffSync();
  }

}

async function startGame(pageRouter, ui, game) {
  console.log("[DEBUG] startGame called");

  const hash = window.location.hash.substring(1);
  const initialPage = hash in pageRouter.pages ? hash : "reactor_section";
  const pageDef = pageRouter.pages[initialPage];

  if (pageDef?.stateless) {
    console.log(`[DEBUG] Loading stateless page: ${initialPage}`);
    await pageRouter.loadPage(initialPage);
    return;
  }

  console.log("[DEBUG] Loading game layout...");
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  console.log("[DEBUG] Main layout initialized");

  await pageRouter.loadPage(initialPage);

  console.log("[DEBUG] Creating engine and managers...");
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);
  game.engine = new Engine(game);

  console.log("[DEBUG] Starting session...");
  await game.startSession();

  // Initialize parts panel position after game loads
  ui.initializePartsPanel();

  const finalizeGameStart = async () => {
    console.log(`[DEBUG] Finalizing game start. Initial paused state: ${game.paused}`);
    
    // Sync all toggle states from game properties to stateManager
    if (ui.syncToggleStatesFromGame) {
      ui.syncToggleStatesFromGame();
    } else {
      // Fallback: manually set initial toggle states
      try {
        ui.stateManager.setVar("pause", game.paused ?? false);
        ui.stateManager.setVar("auto_sell", game.reactor?.auto_sell_enabled ?? false);
        ui.stateManager.setVar("auto_buy", game.reactor?.auto_buy_enabled ?? false);
        ui.stateManager.setVar("heat_control", game.reactor?.heat_controlled ?? false);
        ui.stateManager.setVar("time_flux", game.time_flux ?? true);
      } catch (_) { /* no-op */ }
    }
    
    game.engine.start();

    ui.stateManager.setVar("current_money", game.current_money);
    ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    ui.stateManager.setVar("current_power", game.reactor.current_power);
    ui.stateManager.setVar("max_heat", game.reactor.max_heat);
    ui.stateManager.setVar("max_power", game.reactor.max_power);
    if (ui.updateHeatVisuals) {
      ui.updateHeatVisuals();
    }

    // Clear any New Game pending flag after a session begins
    safeRemoveItem("reactorNewGamePending");

    setTimeout(() => {
      console.log("[DEBUG] Forcing reactor stats update post-load...");
      game.reactor.updateStats();

      // Update objectives display after everything is loaded
      if (ui.updateObjectiveDisplay) {
        ui.updateObjectiveDisplay();
      }
    }, 100);

    if (!safeGetItem("reactorGameQuickStartShown")) {
      try {
        await showQuickStartModal();
      } catch (error) {
        console.warn("Failed to show quick start modal:", error);
      }
    }
    console.log("[DEBUG] startGame completed successfully");
  };

  if (game._pendingToggleStates) {
    Object.entries(game._pendingToggleStates).forEach(([key, value]) => {
      game.ui.stateManager.setVar(key, value);
    });
    delete game._pendingToggleStates;
  }

  if (game._saved_objective_index !== undefined) {
    let savedIndex = game._saved_objective_index;
    delete game._saved_objective_index;

    const restoreAndFinalize = async () => {
      const maxValidIndex = game.objectives_manager.objectives_data.length - 2; // Exclude "All objectives completed!"
      if (savedIndex < 0) {
        savedIndex = 0;
      }
      if (savedIndex > maxValidIndex) {
        console.warn(`[DEBUG] Saved objective index ${savedIndex} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`);
        savedIndex = maxValidIndex;
      }
      game.objectives_manager.current_objective_index = savedIndex;
      console.log(`[DEBUG] Restored objectives_manager.current_objective_index to: ${savedIndex}`);
      game.objectives_manager.set_objective(savedIndex, true);
      // Start the objective manager after setting the objective
      game.objectives_manager.start();
      await finalizeGameStart();
    };

    if (!game.objectives_manager?.objectives_data?.length) {
      const checkReady = async () => {
        if (game.objectives_manager?.objectives_data?.length) {
          await restoreAndFinalize();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    } else {
      await restoreAndFinalize();
    }
  } else {
    game.objectives_manager.start();
    await finalizeGameStart();
  }
}

window.startGame = startGame;
window.clearAllGameDataForNewGame = clearAllGameDataForNewGame;

function setupGlobalListeners(game) {
  on(document, "[data-page]", "click", async (e) => {
    e.preventDefault();
    const pageBtn = e.target.closest("[data-page]");
    if (pageBtn) {
      settingsModal.hide();
      await game.router.loadPage(pageBtn.dataset.page);
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      if (game.tooltip_manager && game.tooltip_manager.isLocked) {
        const tooltipEl = document.getElementById("tooltip");
        if (
          tooltipEl &&
          !tooltipEl.contains(e.target) &&
          !e.target.closest(".upgrade, .part") &&
          !e.target.closest("#tooltip_actions")
        ) {
          game.tooltip_manager.closeView();
        }
      }
    },
    true
  );

  window.addEventListener("beforeunload", () => {
    // If a New Game is pending (e.g., triggered via splash), do not overwrite the cleared save
    try {
      if (safeGetItem("reactorNewGamePending") === "1") {
        return;
      }
    } catch (_) { /* no-op */ }
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      game.saveGame();
      if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
        window.googleDriveSave.flushPendingSave().catch(console.error);
      }
    }
  });
}

async function showQuickStartModal() {
  console.log("showQuickStartModal");
  try {
    const response = await fetch("pages/quick-start-modal.html");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const html = await response.text();
    const modal = document.createElement("div");
    modal.id = "quick-start-modal";
    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById("quick-start-more-details").onclick = () => {
      document.getElementById("quick-start-page-1").classList.add("hidden");
      document.getElementById("quick-start-page-2").classList.remove("hidden");
    };

    document.getElementById("quick-start-back").onclick = () => {
      document.getElementById("quick-start-page-2").classList.add("hidden");
      document.getElementById("quick-start-page-1").classList.remove("hidden");
    };

    const closeModal = () => {
      modal.remove();
      safeSetItem("reactorGameQuickStartShown", "1");
    };

    document.getElementById("quick-start-close").onclick = closeModal;
    document.getElementById("quick-start-close-2").onclick = closeModal;
  } catch (error) {
    console.error("Failed to load quick start modal:", error);
  }
}

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
      await startGame(pageRouter, ui, game);
    };
  } catch (error) {
    console.error("Could not load fallback start interface", error);
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


document.addEventListener("DOMContentLoaded", () => {
  try {
    main().catch((error) => {
      console.error("Critical startup error:", error);
      showCriticalError(error);
    });
  } catch (error) {
    console.error("Critical startup error:", error);
    showCriticalError(error);
  }
});

window.addEventListener("error", (event) => {
  if (event.error && !document.getElementById("critical-error-overlay")) {
    console.error("Uncaught error:", event.error);
    showCriticalError(event.error);
  }
});

window.addEventListener("unhandledrejection", (event) => {
  if (event.reason && !document.getElementById("critical-error-overlay")) {
    console.error("Unhandled promise rejection:", event.reason);
    showCriticalError(event.reason);
  }
});
