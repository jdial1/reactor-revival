import { attachGameEventListeners } from "./gameEventListeners.js";
import dataService from "../services/dataService.js";
import { StorageAdapter } from "../utils/storageAdapter.js";
import { preferences } from "../core/preferencesStore.js";

export class GameBootstrapper {
  constructor({ game, ui, pageRouter, splashManager, appRoot }) {
    this.game = game;
    this.ui = ui;
    this.pageRouter = pageRouter;
    this.splashManager = splashManager;
    this.appRoot = appRoot;
  }

  async bootstrap() {
    await dataService.ensureAllGameDataLoaded();
    if (typeof window !== "undefined" && window.templateLoader) {
      await window.templateLoader.loadTemplates();
    }
    this.ui.init(this.game);

    this.appRoot.render();

    if (typeof this.ui.detachGameEventListeners === "function") {
      this.ui.detachGameEventListeners();
    }
    this.ui.detachGameEventListeners = attachGameEventListeners(this.game, this.ui);

    this.game.tileset.initialize();
    await this.game.partset.initialize();
    await this.game.upgradeset.initialize();
    await this.game.set_defaults();
  }
}
