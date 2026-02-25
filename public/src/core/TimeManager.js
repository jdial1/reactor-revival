export class TimeManager {
  constructor(engine) {
    this._engine = engine;
    this.time_accumulator = 0;
    this._frameTimeAccumulator = 0;
    this._timeFluxCatchupTotalTicks = 0;
    this._timeFluxCatchupRemainingTicks = 0;
    this._timeFluxFastForward = false;
    this._welcomeBackFastForward = false;
  }

  get game() {
    return this._engine.game;
  }

  addTimeTicks(tickCount) {
    const targetTickDuration = this.game.loop_wait;
    this.time_accumulator += tickCount * targetTickDuration;
    const queuedTicks = Math.floor(this.time_accumulator / targetTickDuration);
    this.game.emit?.("timeFluxButtonUpdate", { queuedTicks });
  }

  getQueuedTicks() {
    return Math.floor(this.time_accumulator / this.game.loop_wait);
  }

  get isFastForwarding() {
    return this._timeFluxFastForward;
  }

  set isFastForwarding(val) {
    this._timeFluxFastForward = val;
  }

  resetCatchupState() {
    this._timeFluxCatchupTotalTicks = 0;
    this._timeFluxCatchupRemainingTicks = 0;
    this._welcomeBackFastForward = false;
  }
}
