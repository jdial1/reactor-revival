import { toDecimal } from "../../utils/decimal.js";
import { setDecimal } from "../store.js";
import { initLeaderboardSafe } from "./leaderboardInit.js";

export class LifecycleManager {
  constructor(game) {
    this.game = game;
    this.session_start_time = null;
    this.last_save_time = null;
    this.total_played_time = 0;
  }

  async initialize_new_game_state() {
    this.game.debugHistory.clear();
    await this.game.set_defaults();
    this.game.run_id = crypto.randomUUID();
    this.game.cheats_used = false;
    this.game.reactor.clearMeltdownState();
    initLeaderboardSafe();
    this.game.emit?.("clearAnimations");
    setDecimal(this.game.state, "current_money", this.game.base_money);
    this.game.state.stats_cash = this.game.state.current_money;
    this.game.emit("toggleStateChanged", { toggleName: "auto_sell", value: false });
    this.game.emit("toggleStateChanged", { toggleName: "auto_buy", value: false });
    this.game.emit("toggleStateChanged", { toggleName: "time_flux", value: false });
    const defaultQuickSelectIds = ["uranium1", "vent1", "heat_exchanger1", "heat_outlet1", "capacitor1"];
    const slots = defaultQuickSelectIds.map((partId) => ({ partId, locked: false }));
    this.game.emit("quickSelectSlotsChanged", { slots });
  }

  async startSession() {
    this.session_start_time = Date.now();
    if (!this.last_save_time) this.last_save_time = Date.now();
    initLeaderboardSafe();
    await this.game.objectives_manager.initialize();
    if (this.game._saved_objective_index === undefined) {
      this.game.objectives_manager.set_objective(0, true);
    }
    this.game.reactor.updateStats();
    this.game.upgradeset.check_affordability(this.game);
  }

  updateSessionTime() {
    this.game.timeKeeper.updateSessionTime();
  }

  getFormattedTotalPlayedTime() {
    return this.game.timeKeeper.getFormattedTotalPlayedTime();
  }
}
