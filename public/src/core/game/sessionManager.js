export class SessionManager {
  constructor(game) {
    this.game = game;
  }

  pause() {
    this.game.onToggleStateChange?.("pause", true);
  }

  resume() {
    this.game.onToggleStateChange?.("pause", false);
  }

  togglePause() {
    if (this.game.paused) this.resume();
    else this.pause();
  }
}
