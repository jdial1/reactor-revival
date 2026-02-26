import { formatTime } from "../../utils/util.js";
import {
  createNewGameButton,
  createLoadGameButtonFullWidth,
} from "../../components/buttonFactory.js";
import { showTechTreeSelection } from "../gameSetupFlow.js";
import { settingsModal } from "../../components/settingsModal.js";
import { MODAL_IDS } from "../../components/ModalManager.js";
import { fetchResolvedSaves } from "../savesQuery.js";

export class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], cloudSaveOnly: false, cloudSaveData: null, mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  buildContinueButton(mostRecentSave) {
    if (!mostRecentSave) return null;
    const playedTimeStr = formatTime(mostRecentSave.totalPlayedTime || 0);
    const continueButton = createLoadGameButtonFullWidth(
      mostRecentSave.data,
      playedTimeStr,
      false,
      async () => {
        try {
          if (window.splashManager) {
            window.splashManager.hide();
          }
          await new Promise((resolve) => setTimeout(resolve, 600));

          const game = this.ctx?.game ?? window.game;
          if (game) {
            const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);
            const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
            const ui = this.ctx?.ui ?? window.ui;
            if (loadSuccess && pageRouter && ui) {
              if (typeof window.startGame === "function") {
                await window.startGame({ pageRouter, ui, game });
              } else {
                await pageRouter.loadGameLayout();
                ui.initMainLayout();
                await pageRouter.loadPage("reactor_section");
                game.tooltip_manager = new (
                  await import("../../components/tooltip.js")
                ).TooltipManager("#main", "#tooltip", game);
                game.engine = new (
                  await import("../../core/engine.js")
                ).Engine(game);
                await game.startSession();
                game.engine.start();
              }
            }
          }
        } catch (error) {
          logger.log('error', 'splash', 'Error loading game:', error);
        }
      }
    );
    if (continueButton) {
      continueButton.classList.add("splash-btn-continue");
      const header = continueButton.querySelector(".load-game-header span");
      if (header) header.textContent = "Continue";
      const detailsElement = continueButton.querySelector(".load-game-details");
      if (detailsElement) detailsElement.remove();
    }
    return continueButton;
  }

  buildCloudContinueButton(cloudSaveData) {
    if (!cloudSaveData) return null;
    const playedTimeStr = formatTime(cloudSaveData.total_played_time || 0);
    const cloudLoadButton = createLoadGameButtonFullWidth(
      cloudSaveData,
      playedTimeStr,
      true,
      () => this.splashManager.hide()
    );
    if (cloudLoadButton) {
      cloudLoadButton.classList.add("splash-btn-continue");
      const syncedLabel = cloudLoadButton.querySelector('.synced-label');
      if (syncedLabel) syncedLabel.remove();
      const header = cloudLoadButton.querySelector(".load-game-header span");
      if (header) header.textContent = "Continue from Cloud";
      const detailsElement = cloudLoadButton.querySelector(".load-game-details");
      if (detailsElement) detailsElement.remove();
      const labelElement = document.createElement("div");
      labelElement.className = "continue-label";
      labelElement.textContent = "";
      cloudLoadButton.appendChild(labelElement);
    }
    return cloudLoadButton;
  }

  buildNewGameButton(hasSave) {
    const game = this.ctx?.game ?? window.game;
    const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
    const ui = this.ctx?.ui ?? window.ui;
    const newGameButton = createNewGameButton(async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten.")) {
        return;
      }
      try {
        if (game) {
          await showTechTreeSelection(game, pageRouter, ui, this.splashManager);
        }
      } catch (error) {
        logger.log('error', 'game', 'Error showing tech tree selection:', error);
      }
    });
    if (newGameButton) {
      newGameButton.textContent = "New Game";
    }
    return newGameButton;
  }

  buildLoadGameButton(saveSlots) {
    const loadGameButton = document.createElement("button");
    loadGameButton.className = "splash-btn splash-btn-load";
    loadGameButton.innerHTML = `
        <div class="load-game-header">
          <span>Load Game</span>
        </div>
      `;
    loadGameButton.onclick = () => this.splashManager.showSaveSlotSelection(saveSlots);
    return loadGameButton;
  }

  buildStandardButtons() {
    const fragment = document.createDocumentFragment();

    const sandboxButton = document.createElement("button");
    sandboxButton.id = "splash-sandbox-btn";
    sandboxButton.className = "splash-btn splash-btn-sandbox";
    sandboxButton.textContent = "Sandbox";
    fragment.appendChild(sandboxButton);

    const settingsButton = document.createElement("button");
    settingsButton.className = "splash-btn";
    settingsButton.textContent = "Settings";
    settingsButton.onclick = () => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS) ?? settingsModal.show();
    fragment.appendChild(settingsButton);

    const exitButton = document.createElement("button");
    exitButton.className = "splash-btn splash-btn-exit";
    exitButton.textContent = "Exit";
    exitButton.onclick = () => {
      if (confirm("Are you sure you want to exit?")) {
        window.close();
        if (window.opener) {
          window.opener.focus();
        } else {
          window.location.href = 'about:blank';
        }
      }
    };
    fragment.appendChild(exitButton);

    return fragment;
  }

  buildSpacer() {
    const spacer = document.createElement("div");
    spacer.className = "splash-spacer";
    spacer.style.height = "1rem";
    return spacer;
  }

  buildSabWarning() {
    const sabDisabled = typeof SharedArrayBuffer === "undefined" || typeof globalThis.crossOriginIsolated === "undefined" || globalThis.crossOriginIsolated !== true;
    if (!sabDisabled) return null;
    const sabWarning = document.createElement("div");
    sabWarning.className = "splash-sab-warning";
    sabWarning.setAttribute("role", "status");
    sabWarning.textContent = "High-Performance mode is disabled (missing COOP/COEP headers). Heat simulation may be slower on large grids.";
    return sabWarning;
  }

  buildAuthArea() {
    const supabaseAuthArea = document.createElement("div");
    supabaseAuthArea.id = "splash-supabase-auth";
    this.splashManager.setupSupabaseAuth(supabaseAuthArea);
    return supabaseAuthArea;
  }
}
