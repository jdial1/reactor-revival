import { html, render } from "lit-html";
import { StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, setSlot1FromBackupAsync } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import {
  createVolumeSection as createVolumeSectionFromModule,
  createToggleSection as createToggleSectionFromModule,
  createExportSection as createExportSectionFromModule,
  createNavAboutSection as createNavAboutSectionFromModule
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
    this._overlayClickGroup = null;
    this._appContext = null;
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
      if (this._overlayClickGroup) {
        this.overlay.removeEventListener("click", this._overlayClickGroup);
        this._overlayClickGroup = null;
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

  createToggleSection() {
    return createToggleSectionFromModule();
  }

  createExportSection() {
    return createExportSectionFromModule();
  }

  createDOM() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.className = "settings-modal-overlay";
    document.body.appendChild(this.overlay);
    const volumeTemplate = this.createVolumeSection();
    const toggleTemplate = this.createToggleSection();
    const exportTemplate = this.createExportSection();
    const navAboutTemplate = createNavAboutSectionFromModule();
    const modalTemplate = html`
      <div class="settings-modal pixel-panel">
        <div class="settings-content">
          ${volumeTemplate}
          ${toggleTemplate}
          ${exportTemplate}
          ${navAboutTemplate}
        </div>
      </div>
    `;
    render(modalTemplate, this.overlay);
    this._overlayClickClose = (e) => {
      if (e.target === this.overlay) this.hide();
    };
    this._overlayClickGroup = (e) => {
      const header = e.target.closest(".settings-group-header");
      if (header) {
        e.preventDefault();
        const group = header.closest(".settings-group");
        if (group) {
          group.classList.toggle("settings-group-collapsed");
          header.setAttribute("aria-expanded", String(!group.classList.contains("settings-group-collapsed")));
          this.playClick();
        }
      }
    };
    this.overlay.addEventListener("click", this._overlayClickClose);
    this.overlay.addEventListener("click", this._overlayClickGroup);
    const signal = getAbortSignal();
    bindSettingsEvents(this.overlay, this, signal);
  }
}

export const settingsModal = new SettingsModal();
