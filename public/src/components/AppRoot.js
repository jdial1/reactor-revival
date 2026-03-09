import { html, render } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { preferences } from "../core/preferencesStore.js";

export class AppRoot {
  constructor(container, game, ui) {
    this.container = container;
    this.game = game;
    this.ui = ui;
  }

  render() {
    const hasSession = !!this.game?.lifecycleManager?.session_start_time;

    const template = html`
      ${this.renderSplash(hasSession)}
      <div id="wrapper" class=${classMap({ hidden: !hasSession })}></div>
      <div id="modal-root"></div>
    `;

    render(template, this.container);
  }

  renderSplash(hasSession) {
    if (hasSession) return null;

    const isMuted = !!preferences.mute;
    const handleMuteClick = (e) => {
      e.stopPropagation();
      preferences.mute = !preferences.mute;
      this.game?.audio?.toggleMute(preferences.mute);
      const icon = e.currentTarget.querySelector(".splash-mute-icon");
      if (icon) icon.textContent = preferences.mute ? "🔇" : "🔊";
    };
    return html`
      <div id="splash-container">
        <main id="splash-screen">
          <button type="button" class="splash-mute-btn" title=${isMuted ? "Unmute" : "Mute"} aria-label=${isMuted ? "Unmute" : "Mute"} @click=${handleMuteClick}>
            <span class="splash-mute-icon">${isMuted ? "🔇" : "🔊"}</span>
          </button>
          <div class="splash-loading">
            <div class="splash-spinner hidden splash-element-hidden"></div>
            <p id="splash-status" class="hidden splash-element-hidden">Ready!</p>
          </div>
          <div class="splash-menu-panel splash-control-deck">
            <div class="splash-menu-inner">
            <header class="splash-panel-header">
              <h1 class="splash-title">REACTOR REVIVAL</h1>
              <button type="button" class="splash-menu-hide-btn" title="Hide menu" aria-label="Hide menu" @click=${(e) => {
                e.stopPropagation();
                const panel = e.currentTarget.closest(".splash-menu-panel");
                if (panel) panel.classList.add("splash-menu-fade-full");
              }}>−</button>
            </header>
            <div id="splash-start-options" class="splash-start-options"></div>
            <footer class="splash-panel-footer">
              <div id="splash-auth-in-footer" class="splash-auth-in-footer"></div>
              <span id="splash-version-text" class="splash-version-text"></span>
              <span id="splash-user-count" class="splash-user-count-inline">
                <span id="user-count-text">-</span>
              </span>
            </footer>
            </div>
          </div>
        </main>
      </div>
    `;
  }

  teardown() {}
}
