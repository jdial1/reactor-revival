import { rules } from "./gameEventRules.js";

export class GameEventRouter {
  constructor() {
    this._lastEmitTick = new Map();
  }

  evaluate(facts, game) {
    if (!game?.emit) return;
    if (facts.isSandbox || facts.isPaused) return;

    for (const rule of rules) {
      if (!rule.predicate(facts)) continue;

      if (rule.oneShot) {
        const key = rule.oneShotKey ?? `_${rule.event}Fired`;
        if (game.state?.[key]) continue;
        game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
        if (game.state && typeof game.state === "object") game.state[key] = true;
        continue;
      }

      const lastTick = this._lastEmitTick.get(rule.event) ?? -Infinity;
      const throttle = rule.throttleTicks ?? 0;
      if (facts.tickCount - lastTick < throttle) continue;

      game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
      this._lastEmitTick.set(rule.event, facts.tickCount);
    }
  }

  resetThrottles() {
    this._lastEmitTick.clear();
  }

  clearState(game) {
    this.resetThrottles();
    if (!game?.state || typeof game.state !== "object") return;
    for (const rule of rules) {
      if (rule.oneShotKey) game.state[rule.oneShotKey] = false;
    }
  }
}
