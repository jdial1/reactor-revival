import { html, render } from "lit-html";
import { StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, setSlot1FromBackupAsync } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import {
  createVolumeSection as createVolumeSectionFromModule,
  createVisualSection as createVisualSectionFromModule,
  createSystemSection as createSystemSectionFromModule,
  createDataSection as createDataSectionFromModule
} from "./settingsmodal/sectionBuilders.js";
import {
  bindSettingsEvents,
  getAbortSignal,
  abortSettingsListeners
} from "./settingsmodal/eventBindings.js";
import { BaseComponent } from "./BaseComponent.js";

class SettingsModal extends BaseComponent {
  constructor() {
    super();
    this.overlay = null;
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this._overlayClickClose = null;
    this._tabClickHandler = null;
    this._appContext = null;
    this.activeTab = "audio";
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  getGame() {
    return this._appContext?.game ?? window.game;
  }

  getUi() {
    return this._appContext?.ui ?? window.ui;
  }

  show() {
    if (this.isVisible) return;
    this.isVisible = true;
    this.createDOM();
    document.addEventListener("keydown", this.handleKeyDown);
  }

  hide() {
    if (!this.isVisible) return;
    this.isVisible = false;
    abortSettingsListeners();
    document.removeEventListener("keydown", this.handleKeyDown);
    const game = this.getGame();
    if (game?.audio) {
      game.audio.stopTestSound();
      game.audio.warningManager.stopWarningLoop();
    }
    if (this.overlay) {
      if (this._overlayClickClose) {
        this.overlay.removeEventListener("click", this._overlayClickClose);
        this._overlayClickClose = null;
      }
      if (this._tabClickHandler) {
        this.overlay.removeEventListener("click", this._tabClickHandler);
        this._tabClickHandler = null;
      }
      this.overlay = this.removeOverlay(this.overlay);
    }
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) menuBtn.classList.remove("active");
    const currentPageId = this.getGame()?.router?.currentPageId;
    if (currentPageId) {
      const bottomNav = document.getElementById("bottom_nav");
      if (bottomNav) {
        const pageBtn = bottomNav.querySelector(`button[data-page="${currentPageId}"]`);
        if (pageBtn) pageBtn.classList.add("active");
      }
    }
  }

  handleKeyDown(e) {
    if (e.key === "Escape") this.hide();
  }

  async _handleExportClick() {
    const game = this.getGame();
    if (!game?.saveManager) return;
    if ('showSaveFilePicker' in window) {
      try {
        const opts = {
          types: [{ description: 'Reactor Save File', accept: { 'application/json': ['.reactor'] } }],
          suggestedName: `reactor-save-${new Date().toISOString().split("T")[0]}.reactor`
        };
        const handle = await window.showSaveFilePicker(opts);
        game.activeFileHandle = handle;
        await this.saveToHandle(handle);
      } catch (err) {
        if (err.name !== 'AbortError') logger.log('warn', 'ui', '[PWA] Save picker error:', err);
      }
      return;
    }
    await game.saveManager.autoSave();
    const slot = Number(await StorageUtilsAsync.get("reactorCurrentSaveSlot", 1));
    const saveData = await StorageUtilsAsync.getRaw(`reactorGameSave_${slot}`) || await StorageUtilsAsync.getRaw("reactorGameSave");
    if (!saveData) return;
    const blob = new Blob([saveData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reactor-save-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async _applyImportedSaveData(saveData) {
    if (!saveData) return;
    await rotateSlot1ToBackupAsync(saveData);
    const game = this.getGame();
    if (!game?.saveManager) return;
    let result = await game.saveManager.loadGame(1);
    const hasBackup = result && typeof result === "object" && result.backupAvailable && window.showLoadBackupModal;
    if (hasBackup) {
      const useBackup = await window.showLoadBackupModal();
      if (useBackup) {
        await setSlot1FromBackupAsync();
        result = await game.saveManager.loadGame(1);
      }
    }
    if (result === true) window.location.reload();
  }

  _handleImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await this._applyImportedSaveData(event.target.result);
      } catch (error) {
        logger.error("Failed to import save:", error);
      }
    };
    reader.readAsText(file);
  }

  async _handleNotificationSwitch(checked, notifCheckbox, syncMechSwitch) {
    if (!checked) {
      logger.log('warn', 'ui', 'To disable notifications completely, you must reset permissions in your browser settings.');
      notifCheckbox.checked = Notification.permission === 'granted';
      syncMechSwitch("setting-notifications", notifCheckbox.checked);
      return;
    }
    const result = await Notification.requestPermission();
    if (result !== 'granted') {
      notifCheckbox.checked = false;
      syncMechSwitch("setting-notifications", false);
      logger.log('warn', 'ui', 'Notifications blocked. Please enable them in your browser settings.');
      return;
    }
    notifCheckbox.checked = true;
    syncMechSwitch("setting-notifications", true);
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.periodicSync) {
          await reg.periodicSync.register('reactor-periodic-sync', { minInterval: 60 * 60 * 1000 });
        }
      } catch (err) {
        logger.log('warn', 'ui', '[Settings] Periodic sync registration failed:', err);
      }
    }
  }

  async saveToHandle(handle) {
    const game = this.getGame();
    if (!handle || !game?.saveManager) return;
    try {
      const writable = await handle.createWritable();
      const data = serializeSave(await game.saveManager.getSaveState());
      await writable.write(data);
      await writable.close();
    } catch (e) {
      logger.log('warn', 'ui', '[PWA] Lost permission to file handle', e);
      game.activeFileHandle = null;
    }
  }

  playClick() {
    const game = this.getGame();
    if (game?.audio) game.audio.play("click");
  }

  createVolumeSection() {
    return createVolumeSectionFromModule();
  }

  createVisualSection() {
    return createVisualSectionFromModule();
  }

  createSystemSection() {
    return createSystemSectionFromModule();
  }

  createDataSection() {
    return createDataSectionFromModule();
  }

  createDOM() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.className = "settings-modal-overlay";
    document.body.appendChild(this.overlay);
    const volumeTemplate = this.createVolumeSection();
    const visualTemplate = this.createVisualSection();
    const systemTemplate = this.createSystemSection();
    const dataTemplate = this.createDataSection();
    const modalTemplate = html`
      <div class="settings-modal pixel-panel" style="padding: 0; display: flex; flex-direction: column;">
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="settings-header" style="background: rgb(35, 39, 35); border-bottom: 4px solid var(--bevel-dark); padding: 12px 16px;">
          <h2 style="margin: 0; color: var(--game-success-color, rgb(143, 214, 148)); font-size: 1rem; text-shadow: 2px 2px 0px rgba(0,0,0,0.8);">[ DIAGNOSTIC TERMINAL ]</h2>
          <button class="close-btn modal-close-btn" aria-label="Close">✖</button>
        </div>

        <div class="settings-tabs" role="tablist">
          <button class="settings-tab ${this.activeTab === 'audio' ? 'active' : ''}" role="tab" aria-selected=${this.activeTab === 'audio'} aria-controls="settings_tab_audio" data-tab="audio" id="settings_tab_audio_btn">AUDIO</button>
          <button class="settings-tab ${this.activeTab === 'visuals' ? 'active' : ''}" role="tab" aria-selected=${this.activeTab === 'visuals'} aria-controls="settings_tab_visuals" data-tab="visuals" id="settings_tab_visuals_btn">VISUALS</button>
          <button class="settings-tab ${this.activeTab === 'system' ? 'active' : ''}" role="tab" aria-selected=${this.activeTab === 'system'} aria-controls="settings_tab_system" data-tab="system" id="settings_tab_system_btn">SYS</button>
          <button class="settings-tab ${this.activeTab === 'data' ? 'active' : ''}" role="tab" aria-selected=${this.activeTab === 'data'} aria-controls="settings_tab_data" data-tab="data" id="settings_tab_data_btn">DATA</button>
        </div>

        <div class="settings-content pixel-panel is-inset">
          <div id="settings_tab_audio" class="settings_tab_content ${this.activeTab === 'audio' ? 'active' : ''}" role="tabpanel" aria-labelledby="settings_tab_audio_btn" aria-hidden=${this.activeTab !== 'audio'}>
            ${volumeTemplate}
          </div>
          <div id="settings_tab_visuals" class="settings_tab_content ${this.activeTab === 'visuals' ? 'active' : ''}" role="tabpanel" aria-labelledby="settings_tab_visuals_btn" aria-hidden=${this.activeTab !== 'visuals'}>
            ${visualTemplate}
          </div>
          <div id="settings_tab_system" class="settings_tab_content ${this.activeTab === 'system' ? 'active' : ''}" role="tabpanel" aria-labelledby="settings_tab_system_btn" aria-hidden=${this.activeTab !== 'system'}>
            ${systemTemplate}
          </div>
          <div id="settings_tab_data" class="settings_tab_content ${this.activeTab === 'data' ? 'active' : ''}" role="tabpanel" aria-labelledby="settings_tab_data_btn" aria-hidden=${this.activeTab !== 'data'}>
            ${dataTemplate}
          </div>
        </div>
      </div>
    `;
    render(modalTemplate, this.overlay);
    this._overlayClickClose = (e) => {
      if (e.target === this.overlay || e.target.closest(".modal-close-btn")) this.hide();
    };
    this._tabClickHandler = (e) => {
      const tab = e.target.closest(".settings-tab");
      if (tab) {
        e.preventDefault();
        const tabId = tab.dataset.tab;
        if (this.activeTab === tabId) return;
        this.activeTab = tabId;
        this.overlay.querySelectorAll(".settings-tab").forEach((t) => {
          t.classList.remove("active");
          t.setAttribute("aria-selected", "false");
        });
        tab.classList.add("active");
        tab.setAttribute("aria-selected", "true");
        this.overlay.querySelectorAll(".settings_tab_content").forEach((c) => {
          c.classList.remove("active");
          c.setAttribute("aria-hidden", "true");
        });
        const content = this.overlay.querySelector(`#settings_tab_${tabId}`);
        if (content) {
          content.classList.add("active");
          content.setAttribute("aria-hidden", "false");
          const container = this.overlay.querySelector(".settings-content");
          if (container) container.scrollTop = 0;
        }
        this.playClick();
      }
    };
    this.overlay.addEventListener("click", this._overlayClickClose);
    this.overlay.addEventListener("click", this._tabClickHandler);
    const header = this.overlay.querySelector(".settings-header");
    if (header) {
      let startY = 0;
      header.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
      header.addEventListener("touchend", (e) => {
        if (e.changedTouches[0].clientY - startY > 60) this.hide();
      }, { passive: true });
    }
    const signal = getAbortSignal();
    bindSettingsEvents(this.overlay, this, signal);
  }
}

export const settingsModal = new SettingsModal();
