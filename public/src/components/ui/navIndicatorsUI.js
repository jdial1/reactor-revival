import { html } from "lit-html";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export class NavIndicatorsUI {
  constructor(ui) {
    this.ui = ui;
    this._leaderboardUnmounts = [];
  }

  updateLeaderboardIcon() {
    if (typeof document === "undefined" || !this.ui.game) return;
    this._mountLeaderboardButtons();
    if (!this.ui.uiState) return;
    const icon = this.ui.game.cheats_used ? "🚷" : "🏆";
    const disabled = !!this.ui.game.cheats_used;
    this.ui.uiState.leaderboard_display = { icon, disabled };
  }

  _mountLeaderboardButtons() {
    const ui = this.ui;
    if (!ui.uiState || this._leaderboardUnmounts.length > 0) return;
    const topBtn = document.querySelector('#main_top_nav button[data-page="leaderboard_section"]');
    const bottomBtn = document.querySelector('#bottom_nav button[data-page="leaderboard_section"]');
    const applyProps = (btn, d) => {
      if (!btn || !d) return;
      btn.disabled = d.disabled;
      btn.style.opacity = d.disabled ? "0.5" : "1";
      btn.style.cursor = d.disabled ? "not-allowed" : "pointer";
      btn.style.pointerEvents = d.disabled ? "none" : "auto";
    };
    const template = () => html`${ui.uiState?.leaderboard_display?.icon ?? "🏆"}`;
    const renderTop = () => {
      const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
      applyProps(topBtn, d);
      return template();
    };
    const renderBottom = () => {
      const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
      applyProps(bottomBtn, d);
      return template();
    };
    if (topBtn) {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      topBtn.textContent = "";
      topBtn.appendChild(span);
      this._leaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["leaderboard_display"] }],
        renderTop,
        span
      ));
    }
    if (bottomBtn && bottomBtn !== topBtn) {
      const span = document.createElement("span");
      span.setAttribute("aria-hidden", "true");
      bottomBtn.textContent = "";
      bottomBtn.appendChild(span);
      this._leaderboardUnmounts.push(ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: ["leaderboard_display"] }],
        renderBottom,
        span
      ));
    }
  }

  updateNavIndicators() {
    if (typeof document === "undefined" || !this.ui.uiState) return;
    if (this._affordabilityUnmounts?.length) return;
    const ui = this.ui;
    const mountIndicator = (button, key) => {
      if (!button || button.style.position !== "relative") button.style.position = "relative";
      let container = button.querySelector(".nav-indicator-mount");
      if (!container) {
        container = document.createElement("span");
        container.className = "nav-indicator-mount";
        button.appendChild(container);
      }
      const renderFn = () => {
        const visible = !!ui.uiState?.[key];
        return html`<span class="nav-indicator" style="display: ${visible ? "block" : "none"}"></span>`;
      };
      return ReactiveLitComponent.mountMulti(
        [{ state: ui.uiState, keys: [key] }],
        renderFn,
        container
      );
    };
    const unmounts = [];
    document.querySelectorAll('[data-page="upgrades_section"]').forEach((btn) => {
      unmounts.push(mountIndicator(btn, "has_affordable_upgrades"));
    });
    document.querySelectorAll('[data-page="experimental_upgrades_section"]').forEach((btn) => {
      unmounts.push(mountIndicator(btn, "has_affordable_research"));
    });
    this._affordabilityUnmounts = unmounts;
  }

  teardownAffordabilityIndicators() {
    if (this._affordabilityUnmounts?.length) {
      this._affordabilityUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
      this._affordabilityUnmounts = [];
    }
  }
}
