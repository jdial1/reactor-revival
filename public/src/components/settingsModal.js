import { html } from "lit-html";
import { StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, setSlot1FromBackupAsync } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import {
  createVolumeSection,
  createVisualSection,
  createSystemSection,
  createDataSection,
} from "./settingsmodal/sectionBuilders.js";
import { bindSettingsEvents, getAbortSignal, abortSettingsListeners } from "./settingsmodal/eventBindings.js";

export const settingsModalTemplate = (settingsState, onTabClick, onClose) => {
  const activeTab = settingsState?.activeTab ?? "audio";
  const volumeTemplate = createVolumeSection();
  const visualTemplate = createVisualSection();
  const systemTemplate = createSystemSection(settingsState?.notificationPermission ?? "default");
  const dataTemplate = createDataSection();

  return html`
    <div class="settings-modal-overlay" @click=${(e) => {
      if (e.target === e.currentTarget || e.target.closest(".modal-close-btn")) onClose();
    }}>
      <div class="settings-modal pixel-panel" style="padding: 0; display: flex; flex-direction: column;">
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="settings-header" style="background: rgb(35, 39, 35); border-bottom: 4px solid var(--bevel-dark); padding: 12px 16px;">
          <h2 style="margin: 0; color: var(--game-success-color, rgb(143, 214, 148)); font-size: 1rem; text-shadow: 2px 2px 0px rgba(0,0,0,0.8);">[ DIAGNOSTIC TERMINAL ]</h2>
          <button class="close-btn modal-close-btn" aria-label="Close" @click=${onClose}>✖</button>
        </div>

        <div class="settings-tabs" role="tablist">
          <button class="settings-tab ${activeTab === "audio" ? "active" : ""}" role="tab" aria-selected=${activeTab === "audio"} aria-controls="settings_tab_audio" data-tab="audio" id="settings_tab_audio_btn" @click=${() => onTabClick("audio")}>AUDIO</button>
          <button class="settings-tab ${activeTab === "visuals" ? "active" : ""}" role="tab" aria-selected=${activeTab === "visuals"} aria-controls="settings_tab_visuals" data-tab="visuals" id="settings_tab_visuals_btn" @click=${() => onTabClick("visuals")}>VISUALS</button>
          <button class="settings-tab ${activeTab === "system" ? "active" : ""}" role="tab" aria-selected=${activeTab === "system"} aria-controls="settings_tab_system" data-tab="system" id="settings_tab_system_btn" @click=${() => onTabClick("system")}>SYS</button>
          <button class="settings-tab ${activeTab === "data" ? "active" : ""}" role="tab" aria-selected=${activeTab === "data"} aria-controls="settings_tab_data" data-tab="data" id="settings_tab_data_btn" @click=${() => onTabClick("data")}>DATA</button>
        </div>

        <div class="settings-content pixel-panel is-inset">
          <div id="settings_tab_audio" class="settings_tab_content ${activeTab === "audio" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_audio_btn" aria-hidden=${activeTab !== "audio"}>
            ${volumeTemplate}
          </div>
          <div id="settings_tab_visuals" class="settings_tab_content ${activeTab === "visuals" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_visuals_btn" aria-hidden=${activeTab !== "visuals"}>
            ${visualTemplate}
          </div>
          <div id="settings_tab_system" class="settings_tab_content ${activeTab === "system" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_system_btn" aria-hidden=${activeTab !== "system"}>
            ${systemTemplate}
          </div>
          <div id="settings_tab_data" class="settings_tab_content ${activeTab === "data" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_data_btn" aria-hidden=${activeTab !== "data"}>
            ${dataTemplate}
          </div>
        </div>
      </div>
    </div>
  `;
};

export function createSettingsContext(ui, modal) {
  const getGame = () => ui?.game ?? window.game;
  const getUi = () => ui ?? window.ui;
  const playClick = () => {
    const game = getGame();
    if (game?.audio) game.audio.play("click");
  };

  const saveToHandle = async (handle) => {
    const game = getGame();
    if (!handle || !game?.saveManager) return;
    try {
      const writable = await handle.createWritable();
      const data = serializeSave(await game.saveManager.getSaveState());
      await writable.write(data);
      await writable.close();
    } catch (e) {
      logger.log("warn", "ui", "[PWA] Lost permission to file handle", e);
      game.activeFileHandle = null;
    }
  };

  const _handleExportClick = async () => {
    const game = getGame();
    if (!game?.saveManager) return;
    if ("showSaveFilePicker" in window) {
      try {
        const opts = {
          types: [{ description: "Reactor Save File", accept: { "application/json": [".reactor"] } }],
          suggestedName: `reactor-save-${new Date().toISOString().split("T")[0]}.reactor`,
        };
        const handle = await window.showSaveFilePicker(opts);
        game.activeFileHandle = handle;
        await saveToHandle(handle);
      } catch (err) {
        if (err.name !== "AbortError") logger.log("warn", "ui", "[PWA] Save picker error:", err);
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
  };

  const _applyImportedSaveData = async (saveData) => {
    if (!saveData) return;
    await rotateSlot1ToBackupAsync(saveData);
    const game = getGame();
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
  };

  const _handleImportFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await _applyImportedSaveData(event.target.result);
      } catch (error) {
        logger.log("error", "ui", "Failed to import save:", error);
      }
    };
    reader.readAsText(file);
  };

  const updateNotificationPermission = () => {
    if (modal?._settingsState && typeof Notification !== "undefined") {
      modal._settingsState.notificationPermission = Notification.permission;
    }
  };

  const _handleNotificationSwitch = async (checked, notifCheckbox) => {
    if (!checked) {
      logger.log("warn", "ui", "To disable notifications completely, you must reset permissions in your browser settings.");
      updateNotificationPermission();
      return;
    }
    const result = await Notification.requestPermission();
    if (result !== "granted") {
      updateNotificationPermission();
      logger.log("warn", "ui", "Notifications blocked. Please enable them in your browser settings.");
      return;
    }
    updateNotificationPermission();
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg.periodicSync) {
          await reg.periodicSync.register("reactor-periodic-sync", { minInterval: 60 * 60 * 1000 });
        }
      } catch (err) {
        logger.log("warn", "ui", "[Settings] Periodic sync registration failed:", err);
      }
    }
  };

  return {
    getGame,
    getUi,
    playClick,
    saveToHandle,
    _handleExportClick,
    _handleImportFile,
    _handleNotificationSwitch,
  };
}

export { bindSettingsEvents, getAbortSignal, abortSettingsListeners };
