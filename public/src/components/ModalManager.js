import { html, render, nothing } from "lit-html";
import { renderComponentIcons } from "./ui/componentRenderingUI.js";
import { settingsModal } from "./settingsModal.js";
import { welcomeBackModal } from "./welcomeBackModal.js";
import { escapeHtml } from "../utils/stringUtils.js";
import { Format, numFormat as fmt } from "../utils/util.js";
import { StorageUtils } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import { showCloudVsLocalConflictModal as showCloudConflictModal } from "../services/saveModals.js";
import { reactorFailedToStartModal } from "./reactorFailedToStartModal.js";

function contextModalTemplate(tile, onSell, onClose) {
  const part = tile?.part;
  if (!part) return nothing;
  const stats = [];
  if (part.power) stats.push(`Power: ${part.power}`);
  if (part.heat) stats.push(`Heat: ${part.heat}`);
  if (part.ticks) stats.push(`Ticks: ${part.ticks}`);
  const bodyContent = stats.length > 0
    ? html`<div>${stats.map((s, i) => html`${escapeHtml(s)}${i < stats.length - 1 ? html`<br>` : nothing}`)}</div>`
    : html`<div>No stats available</div>`;
  return html`
    <div id="context_modal" class="context-modal" role="dialog" aria-modal="true">
      <div class="context-modal-handle"></div>
      <div class="context-modal-content">
        <div class="context-modal-header">
          <h3 class="context-modal-title">${part.title || "Part"}</h3>
          <button class="context-modal-close" aria-label="Close" @click=${onClose}>×</button>
        </div>
        <div class="context-modal-body">${bodyContent}</div>
        <div class="context-modal-actions">
          <button class="context-modal-sell-btn" @click=${onSell}>Sell/Destroy</button>
        </div>
      </div>
    </div>
  `;
}

export const MODAL_IDS = {
  CONTEXT: "context",
  PRESTIGE: "prestige",
  COPY_PASTE: "copyPaste",
  WELCOME_BACK: "welcomeBack",
  QUICK_START: "quickStart",
  DETAILED_QUICK_START: "detailedQuickStart",
  REACTOR_FAILED_TO_START: "reactorFailedToStart",
  LOGIN: "login",
  PROFILE: "profile",
  LOGOUT: "logout",
  CLOUD_VS_LOCAL_CONFLICT: "cloudVsLocalConflict",
  SETTINGS: "settings",
};

const formatPrestigeNumber = (n) => Format.number(n, { places: 2, infinitySymbol: "∞" });

export class ModalOrchestrator {
  constructor() {
    this.ui = null;
    this._handlers = new Map();
    this._activeContextTile = null;
    this._modalRoot = null;
  }

  init(ui) {
    this.ui = ui;
    this._registerHandlers();
  }

  _registerHandlers() {
    const ui = this.ui;
    this._handlers.set(MODAL_IDS.CONTEXT, {
      show: (p) => this._showContextModal(p?.tile),
      hide: () => this._hideContextModal(),
    });
    this._handlers.set(MODAL_IDS.PRESTIGE, {
      show: (p) => this._showPrestigeModal(p?.mode),
      hide: () => this._hidePrestigeModal(),
    });
    this._handlers.set(MODAL_IDS.COPY_PASTE, {
      show: (p) => this._showCopyPasteModal(p),
      hide: () => this._hideCopyPasteModal(),
    });
    this._handlers.set(MODAL_IDS.WELCOME_BACK, {
      show: (p) => this._showWelcomeBackModal(p?.offlineMs, p?.queuedTicks),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.QUICK_START, {
      show: (p) => this._showQuickStartModal(p?.game),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.DETAILED_QUICK_START, {
      show: () => ui?.quickStartUI?.showDetailedQuickStart?.(),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.REACTOR_FAILED_TO_START, {
      show: (p) => reactorFailedToStartModal.show(p?.game),
      hide: () => reactorFailedToStartModal.hide(),
    });
    this._handlers.set(MODAL_IDS.LOGIN, {
      show: () => ui?.userAccountUI?.showLoginModal?.(),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.PROFILE, {
      show: () => ui?.userAccountUI?.showProfileModal?.(),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.LOGOUT, {
      show: () => ui?.userAccountUI?.showLogoutModal?.(),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.CLOUD_VS_LOCAL_CONFLICT, {
      show: (p) => showCloudConflictModal(p?.cloudSaveData),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.SETTINGS, {
      show: () => settingsModal.show(),
      hide: () => settingsModal.hide(),
    });
  }

  showModal(modalId, payload = {}) {
    const handler = this._handlers.get(modalId);
    if (!handler?.show) return undefined;
    return handler.show(payload);
  }

  hideModal(modalId) {
    const handler = this._handlers.get(modalId);
    if (!handler?.hide) return;
    handler.hide();
  }

  _renderContextModal() {
    if (!this._modalRoot) return;
    const tile = this._activeContextTile;
    const onSell = () => {
      this.ui?.deviceFeatures?.heavyVibration?.();
      if (this.ui?.game && tile?.part) {
        this.ui.game.sellPart(tile);
        this.hideModal(MODAL_IDS.CONTEXT);
      }
    };
    const onClose = () => {
      this.ui?.deviceFeatures?.lightVibration?.();
      this.hideModal(MODAL_IDS.CONTEXT);
    };
    render(tile ? contextModalTemplate(tile, onSell, onClose) : nothing, this._modalRoot);
  }

  _showContextModal(tile) {
    if (!this.ui || !tile?.part) return;
    this._activeContextTile = tile;
    this._renderContextModal();
    this.ui.deviceFeatures?.lightVibration?.();
    const handle = this._modalRoot?.querySelector(".context-modal-handle");
    if (handle) {
      let startY = 0;
      const onEnd = (e) => {
        if (e.changedTouches[0].clientY - startY > 60) this.hideModal(MODAL_IDS.CONTEXT);
      };
      handle.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
      handle.addEventListener("touchend", onEnd, { passive: true });
    }
  }

  _hideContextModal() {
    this._activeContextTile = null;
    this._renderContextModal();
  }

  _showPrestigeModal(mode) {
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
    const formatNum = formatPrestigeNumber;
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
      const totalEp = game.state.total_exotic_particles || 0;
      const preserved = game.upgradeset
        .getAllUpgrades()
        .filter((u) => u.base_ecost && u.level > 0).length;
      if (carriedEl)
        carriedEl.innerHTML = `You will keep: <strong>${formatNum(totalEp)} Total EP</strong>, <strong>${preserved} Research</strong>. Reactor and money reset.`;
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

  _hidePrestigeModal() {
    if (!this.ui) return;
    this.ui._prestigeModalMode = null;
    const modal = this.ui.DOMElements.prestige_modal;
    if (modal) modal.classList.add("hidden");
  }

  _showCopyPasteModal(payload) {
    if (payload?.action === "sell") {
      this._showSellModal(payload);
    }
  }

  _showSellModal(payload) {
    const ui = this.ui;
    const { summary = [], checkedTypes = {}, previousPauseState = false } = payload || {};
    const modal = document.getElementById("reactor_copy_paste_modal");
    const modalTitle = document.getElementById("reactor_copy_paste_modal_title");
    const modalText = document.getElementById("reactor_copy_paste_text");
    const modalCost = document.getElementById("reactor_copy_paste_cost");
    const confirmBtn = document.getElementById("reactor_copy_paste_confirm_btn");
    const closeBtn = document.getElementById("reactor_copy_paste_close_btn");

    if (!modal || !modalTitle || !modalCost || !confirmBtn || !closeBtn) return;

    modalTitle.textContent = "Sell Reactor Parts";

    if (modalText) {
      modalText.classList.add("hidden");
      modalText.style.display = "none";
      modalText.style.visibility = "hidden";
      modalText.style.opacity = "0";
      modalText.style.height = "0";
      modalText.style.overflow = "hidden";
    }

    modal.classList.remove("hidden");
    modal.dataset.previousPauseState = previousPauseState;

    const updateSellSummary = () => {
      const filteredSummary = summary.filter(item => checkedTypes[item.id] !== false);
      const totalSellValue = filteredSummary.reduce((sum, item) => sum + item.total, 0);
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateSellSummary();
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const costTemplate = totalSellValue > 0
        ? html`<div style="margin-top: 10px; color: rgb(76 175 80); font-weight: bold;">Total Sell Value: $${fmt(totalSellValue)}</div>`
        : html`<div style="margin-top: 10px; color: rgb(255 107 107); font-weight: bold;">No parts selected</div>`;
      render(html`${componentTemplate}${costTemplate}`, modalCost);
      confirmBtn.disabled = totalSellValue === 0;
    };

    confirmBtn.textContent = "Sell Selected";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = false;
    confirmBtn.style.backgroundColor = '#e74c3c';
    confirmBtn.onclick = () => {
      const tilesToSell = [];
      ui.game.tileset.tiles_list.forEach(tile => {
        if (tile.enabled && tile.part && checkedTypes[tile.part.id] !== false) {
          tilesToSell.push(tile);
        }
      });
      const totalSellValue = tilesToSell.reduce((sum, tile) => sum + (tile.calculateSellValue?.() ?? tile.part.cost), 0);
      tilesToSell.forEach(tile => {
        tile.sellPart();
      });
      ui.game.reactor.updateStats();
      confirmBtn.textContent = `Sold $${fmt(totalSellValue)}`;
      confirmBtn.style.backgroundColor = '#27ae60';
      setTimeout(() => {
        this.hideModal(MODAL_IDS.COPY_PASTE);
        confirmBtn.style.backgroundColor = '#4a9eff';
      }, 1500);
    };

    closeBtn.onclick = () => this.hideModal(MODAL_IDS.COPY_PASTE);

    if (modal._sellModalOutsideClick) modal.removeEventListener("click", modal._sellModalOutsideClick);
    modal._sellModalOutsideClick = (e) => {
      if (e.target === modal) this.hideModal(MODAL_IDS.COPY_PASTE);
    };
    modal.addEventListener("click", modal._sellModalOutsideClick);
    updateSellSummary();
  }

  _hideCopyPasteModal() {
    const modal = document.getElementById("reactor_copy_paste_modal");
    if (!modal) return;
    if (modal._sellModalOutsideClick) {
      modal.removeEventListener("click", modal._sellModalOutsideClick);
      modal._sellModalOutsideClick = null;
    }
    modal.classList.add("hidden");
    const previousPauseState = modal.dataset.previousPauseState === "true";
    if (this.ui?.stateManager) {
      this.ui.stateManager.setVar("pause", previousPauseState);
    }
  }

  _showWelcomeBackModal(offlineMs, queuedTicks) {
    if (!this.ui?.game) return Promise.resolve();
    this.ui.game.pause();
    this.ui.stateManager.setVar("pause", true);
    return welcomeBackModal.show(offlineMs, queuedTicks, this.ui.game);
  }

  async _showQuickStartModal(game) {
    try {
      const response = await fetch("pages/quick-start-modal.html");
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const html = await response.text();
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = html;
      document.body.appendChild(modal);

      document.getElementById("quick-start-more-details").onclick = () => {
        document.getElementById("quick-start-page-1").classList.add("hidden");
        document.getElementById("quick-start-page-2").classList.remove("hidden");
      };

      document.getElementById("quick-start-back").onclick = () => {
        document.getElementById("quick-start-page-2").classList.add("hidden");
        document.getElementById("quick-start-page-1").classList.remove("hidden");
      };

      const closeModal = () => {
        modal.remove();
        StorageUtils.set("reactorGameQuickStartShown", 1);
        if (game?.tutorialManager && !StorageUtils.get("reactorTutorialCompleted")) {
          game.tutorialManager.start();
        }
      };

      document.getElementById("quick-start-close").onclick = closeModal;
      document.getElementById("quick-start-close-2").onclick = closeModal;

      const attachSwipeToDismiss = (el, onDismiss) => {
        if (!el || !onDismiss) return;
        let startY = 0;
        const threshold = 60;
        el.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
        el.addEventListener("touchend", (e) => {
          const endY = e.changedTouches[0].clientY;
          if (endY - startY > threshold) onDismiss();
        }, { passive: true });
      };
      const overlay = modal.querySelector(".quick-start-overlay");
      if (overlay) attachSwipeToDismiss(overlay, closeModal);

      const bindAccordions = (container) => {
        container?.querySelectorAll(".qs-accordion").forEach((section) => {
          const head = section.querySelector(".qs-accordion-head");
          if (head) {
            head.addEventListener("click", () => section.classList.toggle("qs-accordion-expanded"));
            head.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); section.classList.toggle("qs-accordion-expanded"); } });
          }
        });
      };
      bindAccordions(document.getElementById("quick-start-page-1"));
      bindAccordions(document.getElementById("quick-start-page-2"));
    } catch (error) {
      logger.log('error', 'ui', 'Failed to load quick start modal:', error);
    }
  }

  showSettings() {
    settingsModal.show();
  }

  showWelcomeBackModal(offlineMs, queuedTicks) {
    return this.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs, queuedTicks });
  }

  showPrestigeModal(mode) {
    this.showModal(MODAL_IDS.PRESTIGE, { mode });
  }

  hidePrestigeModal() {
    this.hideModal(MODAL_IDS.PRESTIGE);
  }

  showContextModal(tile) {
    this.showModal(MODAL_IDS.CONTEXT, { tile });
  }

  hideContextModal() {
    this.hideModal(MODAL_IDS.CONTEXT);
  }

  hideCopyPasteModal() {
    this.hideModal(MODAL_IDS.COPY_PASTE);
  }
}
