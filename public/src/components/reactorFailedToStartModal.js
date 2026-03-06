import { html, render } from "lit-html";

class ReactorFailedToStartModal {
  constructor() {
    this.overlay = null;
    this._game = null;
  }

  show(game) {
    if (this.overlay) return;
    this._game = game;
    this._createDOM();
    document.body.appendChild(this.overlay);
  }

  hide(pauseGame = false) {
    if (!this.overlay) return;
    if (pauseGame && this._game) {
      this._game.pause();
      this._game.ui?.stateManager?.setVar?.("pause", true);
    }
    this.overlay.remove();
    this.overlay = null;
    this._game = null;
  }

  _onTryAgain() {
    if (this._game?.engine) this._game.engine.start();
    this.hide(false);
  }

  _onDismiss() {
    this.hide(true);
  }

  _createDOM() {
    this.overlay = document.createElement("div");
    this.overlay.className = "reactor-failed-modal-overlay";
    render(html`
      <div class="reactor-failed-modal pixel-panel">
        <h2 class="reactor-failed-title">Reactor Failed to Start</h2>
        <p class="reactor-failed-message">The game engine stopped unexpectedly. Try restarting or refresh the page.</p>
        <div class="reactor-failed-actions">
          <button type="button" class="pixel-btn" @click=${() => this._onTryAgain()}>Try Again</button>
          <button type="button" class="pixel-btn secondary" @click=${() => this._onDismiss()}>Dismiss (Pause)</button>
        </div>
      </div>
    `, this.overlay);
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide(true);
    });
  }
}

export const reactorFailedToStartModal = new ReactorFailedToStartModal();
