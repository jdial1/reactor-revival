import { Format } from "../utils/formatUtils.js";
import { BaseComponent } from "./BaseComponent.js";

class WelcomeBackModal extends BaseComponent {
  constructor() {
    super();
    this.overlay = null;
    this._resolve = null;
    this._queuedTicks = 0;
    this._offlineMs = 0;
    this._game = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  show(offlineMs, queuedTicks, game) {
    if (this.isVisible) return Promise.resolve("dismissed");
    this._offlineMs = offlineMs;
    this._queuedTicks = queuedTicks;
    this._game = game;
    this.isVisible = true;
    this.createDOM();
    document.addEventListener("keydown", this.handleKeyDown);
    return new Promise((resolve) => { this._resolve = resolve; });
  }

  hide(mode) {
    if (!this.isVisible) return;
    const game = this._game;
    if (mode === "instant" && game?.engine) {
      game.engine.runInstantCatchup();
    } else if (mode === "fast-forward" && game?.engine) {
      game.engine._welcomeBackFastForward = true;
    }
    if (game) {
      game.paused = false;
      game.ui?.stateManager?.setVar("pause", false);
    }
    this.isVisible = false;
    this._game = null;
    document.removeEventListener("keydown", this.handleKeyDown);
    this.overlay = this.removeOverlay(this.overlay);
    if (this._resolve) {
      this._resolve(mode);
      this._resolve = null;
    }
  }

  handleKeyDown(e) {
    if (e.key === "Escape") {
      this.hide("fast-forward");
    }
  }

  createDOM() {
    if (this.overlay) return;
    const durationStr = Format.time(this._offlineMs, false);
    const tickStr = this._queuedTicks.toLocaleString();
    this.overlay = document.createElement("div");
    this.overlay.className = "welcome-back-modal-overlay";
    this.overlay.innerHTML = `
<div class="welcome-back-modal pixel-panel">
  <h2 class="welcome-back-title">Welcome Back!</h2>
  <p class="welcome-back-message">You were away for <strong>${durationStr}</strong> (~${tickStr} ticks).</p>
  <p class="welcome-back-sub">Choose how to catch up:</p>
  <div class="welcome-back-actions">
    <button type="button" class="pixel-btn welcome-back-instant" data-mode="instant">Instant Catch-up</button>
    <button type="button" class="pixel-btn welcome-back-ff" data-mode="fast-forward">Fast-Forward</button>
  </div>
  <p class="welcome-back-hint">Instant: apply average income/heat immediately (analytical solve for long durations). Fast-Forward: process 100 ticks per frame until caught up.</p>
</div>`;
    this.overlay.querySelector(".welcome-back-instant").onclick = () => this.hide("instant");
    this.overlay.querySelector(".welcome-back-ff").onclick = () => this.hide("fast-forward");
    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) this.hide("fast-forward");
    });
    document.body.appendChild(this.overlay);
  }
}

export const welcomeBackModal = new WelcomeBackModal();
