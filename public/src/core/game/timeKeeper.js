import { Formatter } from "../../utils/formatUtils.js";

export class TimeKeeper {
  constructor(game) {
    this.game = game;
  }

  updateSessionTime() {
    const lm = this.game.lifecycleManager;
    if (lm.session_start_time) {
      const sessionTime = Date.now() - lm.session_start_time;
      lm.total_played_time = lm.total_played_time + sessionTime;
      lm.session_start_time = Date.now();
    }
    if (this.game.reactor) {
      if (this.game.reactor.current_power > this.game.peak_power) this.game.peak_power = this.game.reactor.current_power;
      if (this.game.reactor.current_heat > this.game.peak_heat) this.game.peak_heat = this.game.reactor.current_heat;
    }
  }

  getFormattedTotalPlayedTime() {
    const lm = this.game.lifecycleManager;
    let totalTime = lm.total_played_time;
    if (lm.session_start_time) {
      totalTime += Date.now() - lm.session_start_time;
    }
    return Formatter.time(totalTime, true);
  }
}
