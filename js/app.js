import { Game } from "./game.js";
import { ObjectiveManager } from "./objective.js";
import { TooltipManager } from "./tooltip.js";
import { on } from "./util.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";
import "./pwa.js";
import help_text from "../data/help_text.js";
import { PageRouter } from "./pageRouter.js";
import faction_data from "../data/faction_data.js";
import { GoogleDriveSave } from "./GoogleDriveSave.js";

async function main() {
  "use strict";

  // Wait for splash manager to be ready before proceeding
  if (window.splashManager) {
    await window.splashManager.readyPromise;
    window.splashManager.setStep("init");
  }

  // Initialize Google Drive Save module and attach to window for global access
  window.googleDriveSave = new GoogleDriveSave();

  // --- 1. Core Object Initialization ---
  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter; // Make router accessible to other game modules

  // This minimal init does not depend on the main layout
  ui.init(game);

  // Populate the faction selector panel before it's needed
  populateFactionSelector();

  // --- 2. Load Static Game Data ---
  if (window.splashManager) await window.splashManager.setStep("parts");
  game.tileset.initialize();
  game.partset.initialize();

  if (window.splashManager) await window.splashManager.setStep("upgrades");
  game.upgradeset.initialize();

  game.set_defaults();
  game.objectives_manager = new ObjectiveManager(game);
  // Note: Engine creation moved to startGame() to prevent background execution

  // --- 3. Determine Game Start Flow (New Game vs. Load Game) ---
  const savedGame = game.loadGame();
  const isNewGamePending =
    localStorage.getItem("reactorNewGamePending") === "1";

  if (window.splashManager) {
    await window.splashManager.setStep("ready");
    // Show start options. If there's no saved game, only show "New Game".
    await window.splashManager.showStartOptions(
      !!savedGame && !isNewGamePending
    );
  } else {
    // Fallback for when splash manager isn't available
    createFallbackStartInterface(pageRouter, ui, game);
  }

  // --- 4. Add Event Handlers for Splash Screen Buttons ---
  const newGameBtn = document.getElementById("splash-new-game-btn");
  if (newGameBtn) {
    newGameBtn.onclick = async () => {
      // Show the faction selection panel
      const factionPanel = document.getElementById("faction-select-panel");
      if (factionPanel) {
        document.getElementById("splash-screen").style.display = "none";
        factionPanel.style.display = "flex";
      }
    };
  }

  const factionPanel = document.getElementById("faction-select-panel");
  if (factionPanel) {
    factionPanel.querySelectorAll(".faction-card").forEach((card) => {
      card.onclick = async () => {
        factionPanel.style.display = "none";
        const faction = card.getAttribute("data-faction");
        localStorage.setItem("reactorFaction", faction);
        game.set_defaults();
        await startGame(pageRouter, ui, game);
      };
    });
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

  // Event handlers for splash screen buttons are now set inside showStartOptions
  // and will handle the rest of the flow.
}

/**
 * Loads the main layout, initializes UI components, and starts the game.
 */
async function startGame(pageRouter, ui, game) {
  await pageRouter.loadGameLayout();

  // Now that the layout is loaded, initialize the UI components that depend on it
  ui.initMainLayout();

  // Load the initial page
  await pageRouter.loadPage("reactor_section");

  // Create tooltip manager before setting up global listeners
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);

  // Create and start game systems (moved here from main() to prevent splash screen background execution)
  game.engine = new Engine(game);

  // Start session tracking now that the game is actually starting
  game.startSession();

  // Restore any pending toggle states from loaded save (after engine is created)
  let startEngine = true; // Default: start the engine
  if (game._pendingToggleStates) {
    for (const [key, value] of Object.entries(game._pendingToggleStates)) {
      game.ui.stateManager.setVar(key, value);
      if (key === "pause" && value === true) {
        startEngine = false; // Don't start if game was paused
      }
    }
    delete game._pendingToggleStates; // Clean up
  }

  // Restore saved objective index if available
  if (game._saved_objective_index !== undefined) {
    game.objectives_manager.current_objective_index =
      game._saved_objective_index;
    delete game._saved_objective_index; // Clean up
  }

  game.objectives_manager.start();
  if (startEngine) {
    game.engine.start();
  }

  // Initialize UI state with current game values
  ui.stateManager.setVar("current_money", game.current_money);
  ui.stateManager.setVar("current_heat", game.reactor.current_heat);
  ui.stateManager.setVar("current_power", game.reactor.current_power);
  ui.stateManager.setVar("max_heat", game.reactor.max_heat);
  ui.stateManager.setVar("max_power", game.reactor.max_power);

  // Setup global listeners
  setupGlobalListeners(game);

  // Debug: Force reactor stats update after a short delay to ensure DOM is ready
  setTimeout(() => {
    console.log("[DEBUG] Forcing reactor stats update...");
    game.reactor.updateStats();
  }, 1000);

  if (!localStorage.getItem("reactorGameQuickStartShown")) {
    await showQuickStartModal();
  }
}

function setupGlobalListeners(game) {
  on(document, "[data-page]", "click", async (e) => {
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

  // Save session time when page is unloaded
  window.addEventListener("beforeunload", () => {
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      game.saveGame();

      // Flush any pending Google Drive saves
      if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
        window.googleDriveSave.flushPendingSave().catch(console.error);
      }
    }
  });
}

async function showQuickStartModal() {
  console.log("showQuickStartModal");
  // if (localStorage.getItem("reactorGameQuickStartShown")) return;

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

    // Add event listeners for navigation
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
    // Fallback to a simple modal if loading fails
    const modal = document.createElement("div");
    modal.id = "quick-start-modal";
    modal.innerHTML = `
      <div class="quick-start-overlay">
        <div class="quick-start-content pixel-panel">
          <h2>Welcome to Reactor!</h2>
          <p>Follow the objectives at the top to continue the tutorial!</p>
          <button id="quick-start-close-fallback" class="pixel-btn btn-start">Got it!</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("quick-start-close-fallback").onclick = () => {
      modal.remove();
      localStorage.setItem("reactorGameQuickStartShown", "1");
    };
  }
}

function createFallbackStartInterface(pageRouter, ui, game) {
  // Create a minimal start interface even without splash manager
  const fallbackDiv = document.createElement("div");
  fallbackDiv.id = "fallback-start-interface";
  fallbackDiv.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    color: white;
    font-family: monospace;
  `;

  fallbackDiv.innerHTML = `
    <div style="text-align: center;">
      <h1>Reactor Game</h1>
      <p>Click to start the game</p>
      <button id="fallback-start-btn" style="padding: 10px 20px; font-size: 16px;">Start Game</button>
    </div>
  `;

  document.body.appendChild(fallbackDiv);

  document.getElementById("fallback-start-btn").onclick = async () => {
    fallbackDiv.remove();
    await startGame(pageRouter, ui, game);
  };
}

function populateFactionSelector() {
  const cardsRow = document.querySelector(
    "#faction-select-panel .faction-cards-row"
  );
  if (!cardsRow) return;

  cardsRow.innerHTML = "";

  faction_data.forEach((faction) => {
    const card = document.createElement("div");
    card.className = `faction-card faction-${faction.id}`;
    card.dataset.faction = faction.id;
    card.tabIndex = 0;

    let cardBodyHtml = "";
    faction.traits.forEach((trait) => {
      const boxClass = trait.type === "feature" ? "feature-box" : "penalty-box";
      const iconHtml = trait.icon
        ? `<span class="icon">${trait.icon}</span>`
        : "";
      cardBodyHtml += `<div class="${boxClass}">${iconHtml} ${trait.text}</div>`;
    });

    card.innerHTML = `
      <div class="card-header">
        <span class="flag">${faction.flag}</span> <span class="faction-name">${faction.name}</span>
      </div>
      <div class="card-body">
        <div class="traits-header">Faction Traits</div>
        ${cardBodyHtml}
      </div>
    `;
    cardsRow.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", main);
