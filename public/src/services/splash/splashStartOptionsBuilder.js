import { html, render } from "lit-html";
import { formatTime } from "../../utils/util.js";
import { showTechTreeSelection } from "../gameSetupFlow.js";
import { MODAL_IDS } from "../../components/ModalManager.js";
import { fetchResolvedSaves } from "../savesQuery.js";
import { logger } from "../../utils/logger.js";

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

  renderTo(container, state) {
    const { hasSave, saveSlots, cloudSaveOnly, cloudSaveData, mostRecentSave } = state;

    const onResume = async () => {
      try {
        if (window.splashManager) window.splashManager.hide();
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

              game.tooltip_manager = new (await import("../../components/tooltip.js")).TooltipManager("#main", "#tooltip", game);
              game.engine = new (await import("../../core/engine.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onCloudResume = () => {
      this.splashManager.hide();
      const btn = document.getElementById("splash-load-cloud-btn");
      if (btn) btn.click();
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten.")) return;
      const game = this.ctx?.game ?? window.game;
      const pageRouter = this.ctx?.pageRouter ?? window.pageRouter;
      const ui = this.ctx?.ui ?? window.ui;
      try {
        if (game) await showTechTreeSelection(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = html`
      ${mostRecentSave ? html`
        <button class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue" @click=${onResume}>
          <div class="load-game-header"><span>RESUME</span></div>
        </button>
      ` : ""}

      ${(cloudSaveOnly && cloudSaveData && !hasSave) ? html`
        <button class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue" @click=${onCloudResume}>
          <div class="load-game-header"><span>RESUME</span></div>
          <div class="continue-label"></div>
        </button>
      ` : ""}

      <div class="splash-btn-actions-grid">
        <div class="splash-btn-row-secondary">
          <button id="splash-new-game-btn" class="splash-btn splash-btn-start ${!mostRecentSave ? "splash-btn-resume-primary" : ""}" @click=${onNewRun}>NEW RUN</button>
          <button class="splash-btn splash-btn-load" @click=${() => this.splashManager.showSaveSlotSelection(saveSlots)}>
            <div class="load-game-header"><span>LOAD</span></div>
          </button>
        </div>
        <div class="splash-btn-row-tertiary">
          <button id="splash-sandbox-btn" class="splash-btn splash-btn-sandbox" title="Sandbox">SANDBOX</button>
          <button class="splash-btn splash-btn-config" title="System configuration" @click=${() => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS)}>SYS</button>
        </div>
      </div>

      <div id="splash-auth-in-footer" style="margin-top: 1rem;"></div>
    `;

    render(template, container);

    const authArea = container.querySelector("#splash-auth-in-footer");
    if (authArea) {
      this.splashManager.setupSupabaseAuth(authArea);
    }
  }
}
