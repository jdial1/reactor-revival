import { Game } from "./game.js";
import { ObjectiveManager } from "./objective.js";
import { TooltipManager } from "./tooltip.js";
import { on } from "./util.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";
import "./pwa.js";
import { PageRouter } from "./pageRouter.js";
import { GoogleDriveSave } from "./GoogleDriveSave.js";

async function main() {
  "use strict";
  if (window.splashManager) {
    await window.splashManager.readyPromise;
    window.splashManager.setStep("init");
  }

  // Load HTML templates before initializing components
  if (window.templateLoader) {
    await window.templateLoader.loadTemplates();
  }

  window.googleDriveSave = new GoogleDriveSave();
  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;

  // Make objects available globally for PWA manager
  window.pageRouter = pageRouter;
  window.ui = ui;
  window.game = game;

  ui.init(game);
  // Removed: populateFactionSelector();
  // Removed: setupFactionCardHandlers();

  if (window.splashManager) await window.splashManager.setStep("parts");
  game.tileset.initialize();
  game.partset.initialize();

  if (window.splashManager) await window.splashManager.setStep("upgrades");
  game.upgradeset.initialize();
  game.set_defaults();

  game.objectives_manager = new ObjectiveManager(game);

  const savedGame = game.loadGame();
  const isNewGamePending =
    localStorage.getItem("reactorNewGamePending") === "1";
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

  const newGameBtn = document.getElementById("splash-new-game-btn");
  if (newGameBtn) {
    newGameBtn.onclick = async () => {
      // Directly start a new game, skipping faction selection
      if (window.splashManager) {
        window.splashManager.hide();
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
      game.set_defaults();
      // Re-create the ObjectiveManager to ensure a fresh state
      game.objectives_manager = new ObjectiveManager(game);
      await startGame(pageRouter, ui, game);
    };
  }

  const loadGameBtn = document.getElementById("splash-load-game-btn");
  if (loadGameBtn) {
    loadGameBtn.onclick = async () => {
      window.splashManager.hide();
      await new Promise((resolve) => setTimeout(resolve, 600));
      await startGame(pageRouter, ui, game);
    };
  }

  const loadCloudBtn = document.getElementById("splash-load-cloud-btn");
  if (loadCloudBtn) {
    loadCloudBtn.onclick = async () => {
      try {
        if (!window.googleDriveSave.isSignedIn) {
          alert("Please sign in to Google Drive first.");
          return;
        }
        const cloudSaveData = await window.googleDriveSave.load();
        if (cloudSaveData) {
          game.applySaveState(cloudSaveData);
          window.splashManager.hide();
          await new Promise((resolve) => setTimeout(resolve, 600));
          await startGame(pageRouter, ui, game);
        } else {
          alert("Could not find a save file in Google Drive.");
        }
      } catch (error) {
        console.error("Failed to load from Google Drive:", error);
        alert(`Error loading from Google Drive: ${error.message}`);
      }
    };
  }
}

async function startGame(pageRouter, ui, game) {
  console.log("[DEBUG] startGame called");
  console.log("[DEBUG] pageRouter:", !!pageRouter);
  console.log("[DEBUG] ui:", !!ui);
  console.log("[DEBUG] game:", !!game);

  const hash = window.location.hash.substring(1);
  const pageExists = hash in pageRouter.pages;
  const initialPage = pageExists ? hash : "reactor_section";
  const pageDef = pageRouter.pages[initialPage];

  // For stateless pages, only load the page without game initialization
  if (pageDef && pageDef.stateless) {
    console.log(`[DEBUG] Loading stateless page: ${initialPage}`);
    await pageRouter.loadPage(initialPage);
    console.log("[DEBUG] Stateless page loaded successfully");
    return;
  }

  console.log("[DEBUG] Loading game layout...");
  await pageRouter.loadGameLayout();
  console.log("[DEBUG] Game layout loaded");

  console.log("[DEBUG] Initializing main layout...");
  ui.initMainLayout();
  console.log("[DEBUG] Main layout initialized");

  console.log(`[DEBUG] Loading initial page: ${initialPage}`);
  await pageRouter.loadPage(initialPage);

  console.log("[DEBUG] Creating tooltip manager...");
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);
  console.log("[DEBUG] Tooltip manager created");

  console.log("[DEBUG] Creating engine...");
  game.engine = new Engine(game);
  console.log("[DEBUG] Engine created");

  console.log("[DEBUG] Starting session...");
  game.startSession();
  console.log("[DEBUG] Session started");

  let startEngine = true;
  if (game._pendingToggleStates) {
    for (const [key, value] of Object.entries(game._pendingToggleStates)) {
      game.ui.stateManager.setVar(key, value);
      if (key === "pause" && value === true) {
        startEngine = false;
      }
    }
    delete game._pendingToggleStates;
  }

  if (game._saved_objective_index !== undefined) {
    game.objectives_manager.current_objective_index =
      game._saved_objective_index;
    delete game._saved_objective_index;
  }
  game.objectives_manager.start();

  if (startEngine) {
    console.log("[DEBUG] Starting engine...");
    game.engine.start();
    console.log("[DEBUG] Engine started");
  }

  ui.stateManager.setVar("current_money", game.current_money);
  ui.stateManager.setVar("current_heat", game.reactor.current_heat);
  ui.stateManager.setVar("current_power", game.reactor.current_power);
  ui.stateManager.setVar("max_heat", game.reactor.max_heat);
  ui.stateManager.setVar("max_power", game.reactor.max_power);

  setupGlobalListeners(game);

  setTimeout(() => {
    console.log("[DEBUG] Forcing reactor stats update...");
    game.reactor.updateStats();
  }, 1000);

  if (!localStorage.getItem("reactorGameQuickStartShown")) {
    await showQuickStartModal();
  }

  console.log("[DEBUG] startGame completed successfully");
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
      document.getElementById("quick-start-page-1").style.display = "none";
      document.getElementById("quick-start-page-2").style.display = "block";
    };

    document.getElementById("quick-start-back").onclick = () => {
      document.getElementById("quick-start-page-2").style.display = "none";
      document.getElementById("quick-start-page-1").style.display = "block";
    };

    const closeModal = () => {
      modal.remove();
      localStorage.setItem("reactorGameQuickStartShown", "1");
    };

    document.getElementById("quick-start-close").onclick = closeModal;
    document.getElementById("quick-start-close-2").onclick = closeModal;
  } catch (error) {
    console.error("Failed to load quick start modal:", error);
    try {
      const response = await fetch("pages/fallback-quick-start.html");
      const html = await response.text();
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = html;
      document.body.appendChild(modal);
      document.getElementById("quick-start-close-fallback").onclick = () => {
        modal.remove();
        localStorage.setItem("reactorGameQuickStartShown", "1");
      };
    } catch (fallbackError) {
      console.error(
        "Failed to load fallback quick start modal:",
        fallbackError
      );
    }
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
