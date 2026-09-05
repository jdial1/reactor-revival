import { render } from "lit-html";
import { logger } from "../../core/logger.js";
import { getAppContext } from "../../app-context.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";
import { fetchResolvedSaves } from "../../state/save-query.js";
import { splashStartOptionsTemplate } from "../../templates/splashTemplates.js";

export class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || getAppContext() || {});
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  renderTo(container, state) {
    const { hasSave, saveSlots, mostRecentSave } = state;

    const onResume = async () => {
      try {
        getAppContext()?.splashManager?.hide();
        await new Promise((resolve) => setTimeout(resolve, 600));

        const game = this.ctx?.game ?? getAppContext()?.game;
        if (game) {
          const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);
          const loadedOk = loadSuccess === true;

          const pageRouter = this.ctx?.pageRouter ?? getAppContext()?.pageRouter;
          const ui = this.ctx?.ui ?? getAppContext()?.ui;

          if (loadedOk && pageRouter && ui) {
            if (typeof getAppContext()?.startGame === "function") {
              await getAppContext().startGame({ pageRouter, ui, game });
            } else {
              await pageRouter.loadGameLayout();
              ui.initMainLayout();
              await pageRouter.loadPage("reactor_section");

              const { wireTooltipManager } = await import("../ui-tooltips-tutorial.js");
              wireTooltipManager(ui, game);
              game.engine = new (await import("../../domain/engine.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten."))
        return;
      const game = this.ctx?.game ?? getAppContext()?.game;
      const pageRouter = this.ctx?.pageRouter ?? getAppContext()?.pageRouter;
      const ui = this.ctx?.ui ?? getAppContext()?.ui;
      try {
        const showTechTree = getAppContext()?.showTechTreeSelection;
        if (game && typeof showTechTree === "function") await showTechTree(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = splashStartOptionsTemplate({
      mostRecentSave,
      onResume,
      onNewRun,
      onShowLoad: () => this.splashManager.showSaveSlotSelection(saveSlots),
      onShowSettings: () => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS),
    });

    render(template, container);
  }
}
