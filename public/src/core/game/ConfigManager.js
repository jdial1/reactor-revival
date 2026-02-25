import { DEFAULT_AUTOSAVE_INTERVAL_MS } from "../constants.js";

export class ConfigManager {
  constructor(game) {
    this.game = game;
    this._config = {};
  }

  getConfiguration() {
    return {
      gameSpeed: this.game.loop_wait,
      autoSave: this._config?.autoSave ?? true,
      soundEnabled: this._config?.soundEnabled ?? true,
      autoSaveInterval: this._config?.autoSaveInterval ?? DEFAULT_AUTOSAVE_INTERVAL_MS
    };
  }

  setConfiguration(config) {
    if (config.gameSpeed !== undefined) {
      this.game.loop_wait = config.gameSpeed;
    }
    this._config = { ...this._config, ...config };
  }

  onToggleStateChange(toggleName, value) {
    if (this.game.state && this.game.state[toggleName] !== value) this.game.state[toggleName] = value;
    switch (toggleName) {
      case "auto_sell":
        if (this.game.reactor) this.game.reactor.auto_sell_enabled = value;
        break;
      case "auto_buy":
        if (this.game.reactor) this.game.reactor.auto_buy_enabled = value;
        break;
      case "heat_control":
        if (this.game.reactor) this.game.reactor.heat_controlled = value;
        break;
      case "time_flux":
        this.game.time_flux = value;
        break;
      case "pause":
        this.game.paused = value;
        if (this.game.router?.navigationPaused && !this.game.router.isNavigating) {
          this.game.router.navigationPaused = false;
        }
        if (this.game.engine) {
          if (value) this.game.engine.stop();
          else this.game.engine.start();
        }
        break;
      default:
        break;
    }
    this.game.emit?.("toggleStateChanged", { toggleName, value });
  }
}
