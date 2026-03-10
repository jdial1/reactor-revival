import { proxy } from "valtio/vanilla";
import { html, render, nothing } from "lit-html";
import { ReactiveLitComponent } from "./ReactiveLitComponent.js";
import { renderComponentIcons } from "./ui/componentRenderingUI.js";
import {
  settingsModalTemplate,
  createSettingsContext,
  bindSettingsEvents,
  getAbortSignal,
  abortSettingsListeners,
} from "./settingsModal.js";
import { preferences } from "../core/preferencesStore.js";
import { prestigeModalTemplate } from "./prestigeModal.js";
import { welcomeBackModalTemplate } from "./welcomeBackModal.js";
import { layoutViewTemplate } from "./ui/layoutModalUI.js";
import { myLayoutsTemplate } from "./ui/copyPaste/myLayoutsListUI.js";
import { quickStartTemplate } from "./ui/quickStartUI.js";
import { escapeHtml } from "../utils/stringUtils.js";
import { Format, numFormat as fmt } from "../utils/util.js";
import { StorageUtils } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import { showCloudVsLocalConflictModal as showCloudConflictModal } from "../services/saveModals.js";
import { reactorFailedToStartTemplate } from "./reactorFailedToStartModal.js";

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
  LAYOUT_VIEW: "layoutView",
  MY_LAYOUTS: "myLayouts",
};

export class ModalOrchestrator {
  constructor() {
    this.ui = null;
    this._handlers = new Map();
    this._activeContextTile = null;
    this._modalRoot = null;
    this._settingsActiveTab = "audio";
    this._settingsState = proxy({ activeTab: "audio", notificationPermission: "default" });
    this._settingsUnmount = null;
    this._quickStartPage = 1;
    this._quickStartGame = null;
    this._settingsVisible = false;
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
      show: (p) => this._showPrestigeModal(p),
      hide: () => this._hidePrestigeModal(),
    });
    this._handlers.set(MODAL_IDS.COPY_PASTE, {
      show: (p) => this._showCopyPasteModal(p),
      hide: () => this._hideCopyPasteModal(),
    });
    this._handlers.set(MODAL_IDS.WELCOME_BACK, {
      show: (p) => this._showWelcomeBackModal(p),
      hide: () => {},
    });
    this._handlers.set(MODAL_IDS.QUICK_START, {
      show: (p) => this._showQuickStartModal(p?.game),
      hide: () => this._hideQuickStartModal(),
    });
    this._handlers.set(MODAL_IDS.DETAILED_QUICK_START, {
      show: () => this._showQuickStartModal(ui?.game, true),
      hide: () => this._hideQuickStartModal(),
    });
    this._handlers.set(MODAL_IDS.REACTOR_FAILED_TO_START, {
      show: (p) => this._showReactorFailedToStartModal(p),
      hide: () => this._hideReactorFailedToStartModal(),
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
      show: () => this._showSettingsModal(),
      hide: () => this._hideSettingsModal(),
    });
    this._handlers.set(MODAL_IDS.LAYOUT_VIEW, {
      show: (p) => this._showLayoutViewModal(p),
      hide: () => this._hideLayoutViewModal(),
    });
    this._handlers.set(MODAL_IDS.MY_LAYOUTS, {
      show: () => this._showMyLayoutsModal(),
      hide: () => this._hideMyLayoutsModal(),
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

  isModalVisible(modalId) {
    if (modalId === MODAL_IDS.SETTINGS) return this._settingsVisible;
    return false;
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
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
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

  _showPrestigeModal(payload) {
    const { mode } = payload ?? {};
    if (!this.ui?.game) return;
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;

    const game = this.ui.game;
    const totalEp = game.state.total_exotic_particles || 0;
    const preservedUpgrades = game.upgradeset.getAllUpgrades().filter((u) => u.base_ecost && u.level > 0).length;
    const prestigeMultiplier = game.getPrestigeMultiplier ? game.getPrestigeMultiplier() : 1;

    const onCancel = () => this._hidePrestigeModal();
    const onConfirm = (confirmedMode) => {
      this._hidePrestigeModal();
      if (confirmedMode === "refund") {
        game.rebootActionDiscardExoticParticles();
      } else {
        game.rebootActionKeepExoticParticles();
      }
    };

    render(
      prestigeModalTemplate(
        { mode, totalEp, preservedUpgrades, prestigeMultiplier },
        onConfirm,
        onCancel
      ),
      this._modalRoot
    );
  }

  _hidePrestigeModal() {
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui?.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (this._modalRoot) render(nothing, this._modalRoot);
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

    this._sellModalReactiveUnmount?.();
    ui.uiState.sell_modal_display = { title: "Sell Reactor Parts", confirmLabel: "Sell Selected" };
    const titleUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["sell_modal_display"] }],
      () => html`${ui.uiState?.sell_modal_display?.title ?? ""}`,
      modalTitle
    );
    const btnUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["sell_modal_display"] }],
      () => html`${ui.uiState?.sell_modal_display?.confirmLabel ?? ""}`,
      confirmBtn
    );
    this._sellModalReactiveUnmount = () => { titleUnmount(); btnUnmount(); };

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
      ui.uiState.sell_modal_display = { ...ui.uiState.sell_modal_display, confirmLabel: `Sold $${fmt(totalSellValue)}` };
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
    this._sellModalReactiveUnmount?.();
    this._sellModalReactiveUnmount = null;
    this.ui?._copyPasteModalReactiveUnmount?.();
    if (this.ui) this.ui._copyPasteModalReactiveUnmount = null;
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

  _showWelcomeBackModal(payload) {
    if (!this.ui?.game) return Promise.resolve();
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return Promise.resolve();

    const game = this.ui.game;
    game.pause();
    this.ui.stateManager.setVar("pause", true);

    return new Promise((resolve) => {
      const handleClose = (mode) => {
        if (mode === "instant" && game.engine) game.engine.runInstantCatchup();
        else if (mode === "fast-forward" && game.engine) game.engine._welcomeBackFastForward = true;

        if (game) {
          game.paused = false;
          this.ui.stateManager.setVar("pause", false);
        }
        render(nothing, this._modalRoot);
        resolve(mode);
      };

      const onInstant = () => handleClose("instant");
      const onFastForward = () => handleClose("fast-forward");
      const onDismiss = () => handleClose("fast-forward");

      const keyHandler = (e) => {
        if (e.key === "Escape") {
          document.removeEventListener("keydown", keyHandler);
          onDismiss();
        }
      };
      document.addEventListener("keydown", keyHandler);

      const wrappedClose = (mode) => {
        document.removeEventListener("keydown", keyHandler);
        handleClose(mode);
      };

      render(
        welcomeBackModalTemplate(
          payload,
          () => wrappedClose("instant"),
          () => wrappedClose("fast-forward"),
          () => wrappedClose("fast-forward")
        ),
        this._modalRoot
      );
    });
  }

  _renderSettingsModal() {
    if (!this._modalRoot) return;
    if (this._settingsUnmount) {
      this._settingsUnmount();
      this._settingsUnmount = null;
    }
    const onClose = () => this._hideSettingsModal();
    const onTabClick = (tabId) => {
      if (this._settingsState.activeTab === tabId) return;
      this._settingsState.activeTab = tabId;
    };
    const onAfterRender = () => {
      abortSettingsListeners();
      const signal = getAbortSignal();
      const overlay = this._modalRoot?.firstElementChild;
      if (overlay) {
        bindSettingsEvents(overlay, this._settingsContext, signal);
        const header = overlay.querySelector(".settings-header");
        if (header) {
          let startY = 0;
          header.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
          header.addEventListener("touchend", (e) => {
            if (e.changedTouches[0].clientY - startY > 60) onClose();
          }, { passive: true });
        }
      }
    };
    this._settingsUnmount = ReactiveLitComponent.mountMultiStates(
      [preferences, this._settingsState],
      () => settingsModalTemplate(this._settingsState, onTabClick, onClose),
      this._modalRoot,
      onAfterRender
    );
  }

  _showSettingsModal() {
    if (!this.ui) return;
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;
    this._settingsState.activeTab = "audio";
    this._settingsState.notificationPermission = typeof Notification !== "undefined" ? Notification.permission : "default";
    this._settingsContext = createSettingsContext(this.ui, this);
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", keyHandler);
        this._hideSettingsModal();
      }
    };
    document.addEventListener("keydown", keyHandler);
    this._settingsKeyHandler = keyHandler;
    this._settingsVisible = true;
    this._renderSettingsModal();
  }

  _hideSettingsModal() {
    this._settingsVisible = false;
    if (this._settingsUnmount) {
      this._settingsUnmount();
      this._settingsUnmount = null;
    }
    abortSettingsListeners();
    if (this._settingsKeyHandler) {
      document.removeEventListener("keydown", this._settingsKeyHandler);
      this._settingsKeyHandler = null;
    }
    const game = this.ui?.game;
    if (game?.audio) {
      game.audio.stopTestSound();
      game.audio.warningManager?.stopWarningLoop?.();
    }
    if (this._modalRoot) render(nothing, this._modalRoot);
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) menuBtn.classList.remove("active");
    const currentPageId = game?.router?.currentPageId;
    if (currentPageId) {
      const bottomNav = document.getElementById("bottom_nav");
      if (bottomNav) {
        const pageBtn = bottomNav.querySelector(`button[data-page="${currentPageId}"]`);
        if (pageBtn) pageBtn.classList.add("active");
      }
    }
  }

  _showReactorFailedToStartModal(payload) {
    const game = payload?.game ?? this.ui?.game;
    if (!game) return;
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;

    const errorMessage = payload?.error ?? null;
    if (this.ui?.uiState) this.ui.uiState.reactor_failed_error = errorMessage;

    const onTryAgain = () => {
      if (game.engine) game.engine.start();
      this._hideReactorFailedToStartModal(false);
    };
    const onDismiss = () => this._hideReactorFailedToStartModal(true);
    render(reactorFailedToStartTemplate({ errorMessage, onTryAgain, onDismiss }), this._modalRoot);
  }

  _showQuickStartModal(game, isDetailed = false) {
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui?.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;

    this._quickStartPage = 1;
    this._quickStartGame = game;

    const onClose = () => {
      StorageUtils.set("reactorGameQuickStartShown", 1);
      if (this._quickStartGame?.tutorialManager && !StorageUtils.get("reactorTutorialCompleted")) {
        this._quickStartGame.tutorialManager.start();
      }
      this._hideQuickStartModal();
    };
    const onMoreDetails = () => {
      this._quickStartPage = 2;
      render(
        quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack),
        this._modalRoot
      );
    };
    const onBack = () => {
      this._quickStartPage = 1;
      render(
        quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack),
        this._modalRoot
      );
    };

    render(quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack), this._modalRoot);
  }

  _hideQuickStartModal() {
    this._quickStartGame = null;
    if (this._modalRoot) render(nothing, this._modalRoot);
  }

  showSettings() {
    this.showModal(MODAL_IDS.SETTINGS);
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

  _hideReactorFailedToStartModal(pauseGame = false) {
    const game = this.ui?.game;
    if (pauseGame && game) {
      game.pause();
      game.ui?.stateManager?.setVar?.("pause", true);
    }
    if (this.ui?.uiState) this.ui.uiState.reactor_failed_error = null;
    if (this._modalRoot) render(nothing, this._modalRoot);
  }

  _showLayoutViewModal(payload) {
    const { layoutJson, stats } = payload ?? {};
    if (!this.ui?.game) return;
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;

    const onClose = () => this._hideLayoutViewModal();
    render(layoutViewTemplate(layoutJson, stats, this.ui.game, onClose), this._modalRoot);
  }

  _hideLayoutViewModal() {
    if (this._modalRoot) render(nothing, this._modalRoot);
  }

  _showMyLayoutsModal() {
    if (!this.ui) return;
    if (!this._modalRoot) this._modalRoot = this.ui.coreLoopUI?.getElement?.("modal-root") ?? this.ui.DOMElements?.modal_root ?? document.getElementById("modal-root");
    if (!this._modalRoot) return;

    const onClose = () => this._hideMyLayoutsModal();
    const list = this.ui.layoutStorageUI.getMyLayouts();
    render(myLayoutsTemplate(this.ui, list, fmt, onClose), this._modalRoot);
  }

  _hideMyLayoutsModal() {
    if (this._modalRoot) render(nothing, this._modalRoot);
  }
}
