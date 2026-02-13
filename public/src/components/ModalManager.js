import { settingsModal } from "./settingsModal.js";
import { welcomeBackModal } from "./welcomeBackModal.js";
import { escapeHtml } from "../utils/util.js";

export class ModalManager {
  constructor() {
    this.ui = null;
  }

  init(ui) {
    this.ui = ui;
  }

  showSettings() {
    settingsModal.show();
  }

  showWelcomeBackModal(offlineMs, queuedTicks) {
    if (!this.ui?.game) return Promise.resolve();
    this.ui.game.pause();
    this.ui.stateManager.setVar("pause", true);
    return welcomeBackModal.show(offlineMs, queuedTicks, this.ui.game);
  }

  showPrestigeModal(mode) {
    if (!this.ui) return;
    this.ui._prestigeModalMode = mode;
    const modal = this.ui.DOMElements.prestige_modal;
    const titleEl = this.ui.DOMElements.prestige_modal_title;
    const carriedEl = this.ui.DOMElements.prestige_carried_over;
    const multEl = this.ui.DOMElements.prestige_multiplier_line;
    const confirmRefund = this.ui.DOMElements.prestige_modal_confirm_refund;
    const confirmPrestige = this.ui.DOMElements.prestige_modal_confirm_prestige;
    if (!modal) return;
    const game = this.ui.game;
    const fmt = (n) =>
      typeof n === "number" && !Number.isFinite(n)
        ? "∞"
        : n >= 1e9
          ? (n / 1e9).toFixed(2) + "B"
          : n >= 1e6
            ? (n / 1e6).toFixed(2) + "M"
            : n >= 1e3
              ? (n / 1e3).toFixed(2) + "K"
              : String(Math.floor(n));
    if (mode === "refund") {
      if (titleEl) titleEl.textContent = "Full Refund";
      if (carriedEl)
        carriedEl.innerHTML =
          "You will reset: all Exotic Particles, all progress, reactor, and money.";
      if (multEl) multEl.textContent = "";
      if (confirmRefund) confirmRefund.style.display = "";
      if (confirmPrestige) confirmPrestige.style.display = "none";
    } else {
      if (titleEl) titleEl.textContent = "Prestige";
      const totalEp = game.total_exotic_particles || 0;
      const preserved = game.upgradeset
        .getAllUpgrades()
        .filter((u) => u.base_ecost && u.level > 0).length;
      if (carriedEl)
        carriedEl.innerHTML = `You will keep: <strong>${fmt(totalEp)} Total EP</strong>, <strong>${preserved} Research</strong>. Reactor and money reset.`;
      const mult = game.getPrestigeMultiplier
        ? game.getPrestigeMultiplier()
        : 1;
      if (multEl)
        multEl.textContent = `Money multiplier: ×${mult.toFixed(2)} (from Total EP)`;
      if (confirmRefund) confirmRefund.style.display = "none";
      if (confirmPrestige) confirmPrestige.style.display = "";
    }
    modal.classList.remove("hidden");
  }

  hidePrestigeModal() {
    if (!this.ui) return;
    this.ui._prestigeModalMode = null;
    const modal = this.ui.DOMElements.prestige_modal;
    if (modal) modal.classList.add("hidden");
  }

  showContextModal(tile) {
    if (!this.ui || !tile?.part) return;
    const modal = document.getElementById("context_modal");
    const titleEl = document.getElementById("context_modal_title");
    const bodyEl = document.getElementById("context_modal_body");
    const sellBtn = document.getElementById("context_modal_sell");
    const closeBtn = document.getElementById("context_modal_close");
    if (!modal || !titleEl || !bodyEl || !sellBtn) return;

    titleEl.textContent = tile.part.title || "Part";
    const stats = [];
    if (tile.part.power) stats.push(`Power: ${tile.part.power}`);
    if (tile.part.heat) stats.push(`Heat: ${tile.part.heat}`);
    if (tile.part.ticks) stats.push(`Ticks: ${tile.part.ticks}`);
    bodyEl.innerHTML =
      stats.length > 0
        ? `<div>${stats.map((s) => escapeHtml(s)).join("<br>")}</div>`
        : "<div>No stats available</div>";

    sellBtn.onclick = () => {
      this.ui.heavyVibration?.();
      if (this.ui.game && tile.part) {
        this.ui.game.sellPart(tile);
        this.hideContextModal();
      }
    };
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.ui.lightVibration?.();
        this.hideContextModal();
      };
    }
    modal.classList.remove("hidden");
    this.ui.lightVibration?.();
  }

  hideContextModal() {
    const modal = document.getElementById("context_modal");
    if (modal) modal.classList.add("hidden");
  }

  hideCopyPasteModal() {
    const modal = document.getElementById("reactor_copy_paste_modal");
    if (!modal) return;
    modal.classList.add("hidden");
    const previousPauseState = modal.dataset.previousPauseState === "true";
    if (this.ui?.stateManager) {
      this.ui.stateManager.setVar("pause", previousPauseState);
    }
  }
}
