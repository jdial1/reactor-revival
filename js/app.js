import { Game } from "./game.js";
import { ObjectiveManager } from "./objective.js";
import { TooltipManager } from "./tooltip.js";
import { on } from "./util.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";
import "./pwa.js";
import help_text from "../data/help_text.js";
import { PageRouter } from "./pageRouter.js";

async function main() {
  "use strict";

  if (window.splashManager) {
    window.splashManager.setStep("init");
  }

  // --- 1. Core Object Initialization ---
  const ui = new UI();
  const game = new Game(ui);
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter; // Make router accessible to other game modules

  // This minimal init does not depend on the main layout
  ui.init(game);

  // --- 2. Load Static Game Data ---
  if (window.splashManager) window.splashManager.setStep("parts");
  game.tileset.initialize();
  game.partset.initialize();

  if (window.splashManager) window.splashManager.setStep("upgrades");
  game.upgradeset.initialize();

  game.set_defaults();
  game.objectives_manager = new ObjectiveManager(game);
  game.engine = new Engine(game);

  // --- 3. Determine Game Start Flow (New Game vs. Load Game) ---
  const savedGame = game.loadGame();

  if (!savedGame || localStorage.getItem("reactorNewGamePending") === "1") {
    localStorage.removeItem("reactorNewGamePending");
    game.initialize_new_game_state();
    // Show faction selection for a new game
    if (window.splashManager) {
      window.splashManager.setStep("ready");
      window.splashManager.showStartOptions(false); // Show only "New Game"
      const factionPanel = document.getElementById("faction-select-panel");
      const splashScreen = document.getElementById("splash-screen");
      factionPanel.style.display = "flex";
      splashScreen.classList.add("hidden");

      factionPanel.querySelectorAll(".faction-card").forEach((card) => {
        card.onclick = async () => {
          factionPanel.style.display = "none";
          const faction = card.getAttribute("data-faction");
          localStorage.setItem("reactorFaction", faction);
          await startGame(pageRouter, ui, game);
        };
      });
    } else {
      await startGame(pageRouter, ui, game);
    }
  } else {
    // Load existing game
    if (window.splashManager) {
      window.splashManager.setStep("ready");
      window.splashManager.showStartOptions(true);
      const loadGameBtn = document.getElementById("splash-load-game-btn");
      if (loadGameBtn) {
        loadGameBtn.onclick = async () => {
          window.splashManager.hide();
          await startGame(pageRouter, ui, game);
        };
      }
      const newGameBtn = document.getElementById("splash-new-game-btn");
      if (newGameBtn) {
        newGameBtn.onclick = () => {
          localStorage.setItem("reactorNewGamePending", "1");
          window.location.reload();
        };
      }
    } else {
      await startGame(pageRouter, ui, game);
    }
  }
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

  // Start game systems
  game.objectives_manager.start();
  game.engine.start();
  ui.stateManager.setVar("max_heat", game.reactor.max_heat, true);
  ui.stateManager.setVar("max_power", game.reactor.max_power, true);

  // Setup global listeners
  setupGlobalListeners(game);

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
          !e.target.closest(".upgrade, .part")
        ) {
          game.tooltip_manager.closeView();
        }
      }
    },
    true
  );
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

document.addEventListener("DOMContentLoaded", main);
