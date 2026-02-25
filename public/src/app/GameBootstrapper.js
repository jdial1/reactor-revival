import { attachGameEventListeners } from "./gameEventListeners.js";
import dataService from "../services/dataService.js";

export class GameBootstrapper {
  constructor({ game, ui, pageRouter, splashManager }) {
    this.game = game;
    this.ui = ui;
    this.pageRouter = pageRouter;
    this.splashManager = splashManager;
  }

  async bootstrap() {
    const splashReady = this.splashManager ? this.splashManager.readyPromise : null;
    const templatesLoad = window.templateLoader ? window.templateLoader.loadTemplates() : null;
    await Promise.all([splashReady, templatesLoad].filter(Boolean));
    if (this.splashManager) await this.splashManager.setStep("init");

    await dataService.ensureAllGameDataLoaded();
    this.ui.init(this.game);
    if (typeof this.ui.detachGameEventListeners === "function") this.ui.detachGameEventListeners();
    this.ui.detachGameEventListeners = attachGameEventListeners(this.game, this.ui);

    if (this.splashManager) await this.splashManager.setStep("parts");
    this.game.tileset.initialize();
    await this.game.partset.initialize();

    if (this.splashManager) await this.splashManager.setStep("upgrades");
    await this.game.upgradeset.initialize();
    await this.game.set_defaults();
  }
}
