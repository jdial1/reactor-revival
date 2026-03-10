import { subscribeKey } from "../core/store.js";
import { html, render } from "lit-html";
import { classMap } from "lit-html/directives/class-map.js";
import { preferences } from "../core/preferencesStore.js";
import { ReactiveLitComponent } from "./ReactiveLitComponent.js";

export class AppRoot {
  constructor(container, game, ui) {
    this.container = container;
    this.game = game;
    this.ui = ui;
    this._bodyClassUnmount = null;
  }

  _setupBodyClassObserver() {
    if (!this.ui?.uiState || this._bodyClassUnmount) return;
    const syncBodyClasses = () => {
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("game-paused", !!this.ui.uiState.is_paused);
        document.body.classList.toggle("reactor-meltdown", !!this.ui.uiState.is_melting_down);
      }
      const banner = typeof document !== "undefined" ? document.getElementById("meltdown_banner") : null;
      if (banner) banner.classList.toggle("hidden", !this.ui.uiState.is_melting_down);
    };
    syncBodyClasses();
    const unsub1 = subscribeKey(this.ui.uiState, "is_paused", syncBodyClasses);
    const unsub2 = subscribeKey(this.ui.uiState, "is_melting_down", syncBodyClasses);
    this._bodyClassUnmount = () => { try { unsub1(); } catch (_) {} try { unsub2(); } catch (_) {} };
  }

  render() {
    const hasSession = !!this.game?.lifecycleManager?.session_start_time;

    const template = html`
      ${this.renderSplash(hasSession)}
      <div id="wrapper" class=${classMap({ hidden: !hasSession })}></div>
      <div id="modal-root"></div>
    `;

    render(template, this.container);
    if (!hasSession) {
      const iconEl = this.container.querySelector(".splash-mute-icon");
      if (iconEl) {
        this._splashMuteUnmount = ReactiveLitComponent.mountMulti(
          [{ state: preferences, keys: ["mute"] }],
          () => html`${preferences.mute ? "🔇" : "🔊"}`,
          iconEl
        );
      }
    } else if (this._splashMuteUnmount) {
      this._splashMuteUnmount();
      this._splashMuteUnmount = null;
    }
  }

  renderSplash(hasSession) {
    if (hasSession) return null;

    const isMuted = !!preferences.mute;
    const handleMuteClick = (e) => {
      e.stopPropagation();
      if (this.ui?.uiState) this.ui.uiState.audio_muted = !this.ui.uiState.audio_muted;
      else {
        preferences.mute = !preferences.mute;
        this.game?.audio?.toggleMute(preferences.mute);
      }
    };
    return html`
      <div id="splash-container">
        <main id="splash-screen">
          <button type="button" class="splash-mute-btn" title=${isMuted ? "Unmute" : "Mute"} aria-label=${isMuted ? "Unmute" : "Mute"} @click=${handleMuteClick}>
            <span class="splash-mute-icon"></span>
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

  teardown() {
    if (this._bodyClassUnmount) {
      this._bodyClassUnmount();
      this._bodyClassUnmount = null;
    }
  }
}
