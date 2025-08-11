import { Game } from "./core/game.js";
import { ObjectiveManager } from "./core/objective.js";
import { TooltipManager } from "./components/tooltip.js";
import { on } from "./utils/util.js";
import { UI } from "./components/ui.js";
import { Engine } from "./core/engine.js";
import "./services/pwa.js";
import { PageRouter } from "./components/pageRouter.js";
import { GoogleDriveSave } from "./services/GoogleDriveSave.js";

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

async function handleUserSession(game, pageRouter) {
  const savedGame = await game.loadGame();
  const isNewGamePending = localStorage.getItem("reactorNewGamePending") === "1";
  const hash = window.location.hash.substring(1);
  const pageInfo = pageRouter.pages[hash];
  const shouldAutoStart = savedGame && !isNewGamePending && pageInfo;

  if (shouldAutoStart) {
    console.log(
      `[DEBUG] Saved game and deep link found (${hash}). Auto-starting...`
    );

    // For stateless pages, just hide splash and load the page
    if (pageInfo.stateless) {
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
    await window.splashManager.showStartOptions(
      !!savedGame && !isNewGamePending
    );
  } else {
    createFallbackStartInterface(pageRouter, ui, game);
  }
}

function setupButtonHandlers(pageRouter, ui, game) {
  const newGameBtn = document.getElementById("splash-new-game-btn");
  if (newGameBtn) {
    newGameBtn.onclick = async () => {
      if (window.splashManager) {
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
      await game.set_defaults();
      localStorage.removeItem("reactorGameQuickStartShown");
      await startGame(pageRouter, ui, game);
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

  const googleSignInBtn = document.getElementById("splash-google-signin-btn");
  if (googleSignInBtn) {
    googleSignInBtn.onclick = async () => {
      if (window.googleDriveSave) {
        await window.googleDriveSave.signIn();
      }
    };
  }

  const googleSignOutBtn = document.getElementById("splash-google-signout-btn");
  if (googleSignOutBtn) {
    googleSignOutBtn.onclick = async () => {
      if (window.googleDriveSave) {
        await window.googleDriveSave.signOut();
      }
    };
  }
}

async function main() {
  "use strict";

  window.googleDriveSave = new GoogleDriveSave();
  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;

  // Make objects available globally for PWA manager
  window.pageRouter = pageRouter;
  window.ui = ui;
  window.game = game;

  await initializeApp(game, ui, pageRouter);
  await handleUserSession(game, pageRouter);
  setupButtonHandlers(pageRouter, ui, game);
  setupGlobalListeners(game);
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
  game.startSession();

  const finalizeGameStart = () => {
    console.log(`[DEBUG] Finalizing game start. Initial paused state: ${game.paused}`);
    game.engine.start();

    ui.stateManager.setVar("current_money", game.current_money);
    ui.stateManager.setVar("current_heat", game.reactor.current_heat);
    ui.stateManager.setVar("current_power", game.reactor.current_power);
    ui.stateManager.setVar("max_heat", game.reactor.max_heat);
    ui.stateManager.setVar("max_power", game.reactor.max_power);
    if (ui.updateHeatVisuals) {
      ui.updateHeatVisuals();
    }

    setTimeout(() => {
      console.log("[DEBUG] Forcing reactor stats update post-load...");
      game.reactor.updateStats();
    }, 100);

    if (!localStorage.getItem("reactorGameQuickStartShown")) {
      showQuickStartModal();
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

    const restoreAndFinalize = () => {
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
      game.objectives_manager.start();
      finalizeGameStart();
    };

    if (!game.objectives_manager?.objectives_data?.length) {
      const checkReady = () => {
        if (game.objectives_manager?.objectives_data?.length) {
          restoreAndFinalize();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    } else {
      restoreAndFinalize();
    }
  } else {
    game.objectives_manager.start();
    finalizeGameStart();
  }
}

// Make startGame available globally for PWA manager
window.startGame = startGame;

function setupGlobalListeners(game) {
  on(document, "[data-page]", "click", async (e) => {
    e.preventDefault();
    const pageBtn = e.target.closest("[data-page]");
    if (pageBtn) {
      await game.router.loadPage(pageBtn.dataset.page);
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      if (game.tooltip_manager.isLocked) {
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
      localStorage.setItem("reactorGameQuickStartShown", "1");
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

document.addEventListener("DOMContentLoaded", main);
