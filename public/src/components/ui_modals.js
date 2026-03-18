import { html, render, nothing } from "lit-html";
import { proxy } from "valtio/vanilla";
import { styleMap, StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, setSlot1FromBackupAsync, logger, bindEvents, escapeHtml, Format, numFormat as fmt, StorageUtils, formatPrestigeNumber } from "../utils/utils_constants.js";
import { getValidatedPreferences, preferences } from "../core/store.js";
import { supabaseSave } from "../services/services_cloud.js";
import { createSupabaseProvider, createGoogleDriveProvider, showCloudVsLocalConflictModal as showCloudConflictModal } from "../core/save_system.js";
import dataService from "../services/dataService.js";
import { ReactiveLitComponent } from "./ReactiveLitComponent.js";
import { renderComponentIcons, layoutViewTemplate, myLayoutsTemplate, quickStartTemplate } from "./ui/uiModule.js";

const HIDDEN_STYLE = { display: "none" };
const SECTION_HEAD = "margin-top: 0; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";
const SECTION_HEAD_MARGIN = "margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";

function volToStep(v) {
  return Math.min(10, Math.round(v * 10));
}

function volumeStepper(key, value) {
  const step = volToStep(value);
  return html`
    <div class="volume-stepper" data-volume-key=${key}>
      <div class="volume-blocks" role="slider" aria-valuemin="0" aria-valuemax="10" aria-valuenow=${step} tabindex="0">
        ${Array.from({ length: 11 }, (_, i) => html`
          <button type="button" class="volume-block" data-step=${i} aria-label="${i * 10}%" ?data-active=${i <= step}></button>
        `)}
      </div>
      <span class="volume-stepper-val">${step * 10}%</span>
    </div>
  `;
}

function mechSwitch(id, checked) {
  return html`
    <button type="button" class="mech-switch ${checked ? "mech-switch-on-active" : ""}" role="switch" aria-checked=${checked} data-checkbox-id=${id} tabindex="0">
      <span class="mech-switch-off">OFF</span>
      <span class="mech-switch-track"><span class="mech-switch-thumb"></span></span>
      <span class="mech-switch-on">ON</span>
    </button>
  `;
}

function helpIcon(settingKey) {
  return html`
    <button type="button" class="setting-help-icon" data-setting-key=${settingKey} aria-label="Explain this setting">?</button>
  `;
}

function switchRow(id, label, checked, helpKey) {
  const key = helpKey ?? id.replace("setting-", "");
  return html`
    <tr class="settings-option-row" data-checkbox-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(key)}
      </td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" id=${id} ?checked=${checked} style=${styleMap(HIDDEN_STYLE)}>
          ${mechSwitch(id, checked)}
        </label>
      </td>
    </tr>
  `;
}

function selectRow(id, label, helpKey, content) {
  return html`
    <tr class="settings-option-row settings-option-select" data-select-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(helpKey)}
      </td>
      <td class="settings-visuals-control">${content}</td>
    </tr>
  `;
}

function createVolumeSection() {
  const vol = getValidatedPreferences();
  const isMuted = vol.mute;
  return html`
    <div class="settings-section">
      <label class="setting-row mute-toggle settings-option-row" style="margin-bottom: 1.5rem;" role="button" tabindex="0">
        <span>Master Mute</span>
        <button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
          <span class="mute-icon">${isMuted ? "🔇" : "🔊"}</span>
        </button>
        <input type="checkbox" id="setting-mute" ?checked=${isMuted} style=${styleMap(HIDDEN_STYLE)}>
      </label>
      <div class="volume-setting"><label class="volume-label">Master Volume</label>${volumeStepper("master", vol.volumeMaster)}</div>
      <div class="volume-setting"><label class="volume-label">Effects Volume</label>${volumeStepper("effects", vol.volumeEffects)}</div>
      <div class="volume-setting"><label class="volume-label">Alerts Volume</label>${volumeStepper("alerts", vol.volumeAlerts)}</div>
      <div class="volume-setting"><label class="volume-label">System Volume</label>${volumeStepper("system", vol.volumeSystem)}</div>
      <div class="volume-setting" style="margin-bottom: 0;"><label class="volume-label">Background Volume</label>${volumeStepper("ambience", vol.volumeAmbience)}</div>
    </div>
  `;
}

function createVisualSection() {
  const prefs = getValidatedPreferences();
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ACCESSIBILITY</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-motion", "Reduced Motion", prefs.reducedMotion, "reducedMotion")}
        ${selectRow("setting-number-format", "Number format", "numberFormat", html`
          <select id="setting-number-format" class="pixel-select settings-select" style="background: rgb(60,60,60); color: white; border: 2px solid var(--bevel-dark); padding: 4px;">
            <option value="default" ?selected=${prefs.numberFormat === "default"}>1,234 K</option>
            <option value="scientific" ?selected=${prefs.numberFormat === "scientific"}>1.23e3</option>
          </select>
        `)}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>UPGRADE PANEL</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-hide-upgrades", "Hide Unaffordable Upgrades", prefs.hideUnaffordableUpgrades, "hideUnaffordableUpgrades")}
        ${switchRow("setting-hide-research", "Hide Unaffordable Research", prefs.hideUnaffordableResearch, "hideUnaffordableResearch")}
        ${switchRow("setting-hide-max-upgrades", "Hide Max Upgrades", prefs.hideMaxUpgrades, "hideMaxUpgrades")}
        ${switchRow("setting-hide-max-research", "Hide Max Research", prefs.hideMaxResearch, "hideMaxResearch")}
        ${switchRow("setting-hide-other-doctrine", "Hide Other Doctrine Upgrades", prefs.hideOtherDoctrineUpgrades, "hideOtherDoctrineUpgrades")}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>REACTOR VIEW</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-heat-flow", "Heat flow arrows", prefs.heatFlowVisible, "heatFlowVisible")}
        ${switchRow("setting-heat-map", "Heat map", prefs.heatMapVisible, "heatMapVisible")}
        ${switchRow("setting-debug-overlay", "Debug overlay (flow arrows)", prefs.debugOverlay, "debugOverlay")}
      </table>
    </div>
  `;
}

function createSystemSection(notificationPermission = "default") {
  const prefs = getValidatedPreferences();
  const notificationsChecked = notificationPermission === "granted";
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ENGINE & NOTIFICATIONS</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-force-no-sab", "Force No-SAB", prefs.forceNoSAB, "forceNoSAB")}
        ${switchRow("setting-notifications", "Update Notifications", notificationsChecked, "notifications")}
      </table>

      <h4 style="margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-warning-color, rgb(255, 160, 0)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;">POWER CYCLING</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="research_back_to_splash_btn" style="border-color: rgb(209, 107, 107) rgb(80, 30, 30) rgb(80, 30, 30) rgb(209, 107, 107); background: rgb(171, 63, 63);">QUIT TO TITLE</button>
      </div>

      <h4 style=${SECTION_HEAD_MARGIN}>SYSTEM INFO</h4>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Version: <span id="app_version" style="color: white;">Loading...</span></p>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Display Mode: <span id="app_display_mode" style="color: white;">Detecting...</span></p>

      <h4 style=${SECTION_HEAD_MARGIN}>LEGAL</h4>
      <div class="settings-legal-links" style="display: flex; flex-direction: column; gap: 0.5rem;">
        <a href="pages/about.html" class="settings-legal-link">About</a>
        <a href="pages/privacy-policy.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        <a href="pages/terms-of-service.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      </div>
    </div>
  `;
}

function createDataSection() {
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>LOCAL STORAGE</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="setting-export">Export</button>
        <button class="pixel-btn" id="setting-import">Import</button>
        <input type="file" id="setting-import-input" accept=".json" style=${styleMap(HIDDEN_STYLE)}>
      </div>

      <div id="setting-cloud-saves" class="settings-cloud-saves" style=${styleMap({ display: "none", marginTop: "2rem" })}>
        <h4 class="settings-cloud-heading" style=${SECTION_HEAD}>CLOUD UPLINK</h4>
        <div class="cloud-slot-list">
          ${[1, 2, 3].map(slot => html`
            <div class="cloud-slot-row" data-slot=${slot}>
              <div class="cloud-slot-info">
                <span class="cloud-slot-label">Slot ${slot}</span>
                <span class="cloud-slot-meta">—</span>
              </div>
              <div class="cloud-slot-actions">
                <button type="button" class="pixel-btn pixel-btn-small setting-cloud-save" data-slot=${slot}>Save</button>
                <button type="button" class="pixel-btn pixel-btn-small setting-cloud-load" data-slot=${slot} disabled>Load</button>
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

let _activeAbortController = null;

export function getAbortSignal() {
  if (_activeAbortController) _activeAbortController.abort();
  _activeAbortController = new AbortController();
  return _activeAbortController.signal;
}

export function abortSettingsListeners() {
  if (_activeAbortController) {
    _activeAbortController.abort();
    _activeAbortController = null;
  }
}

function getCloudSaveProvider() {
  if (typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.()) {
    return createSupabaseProvider(supabaseSave);
  }
  if (typeof window !== "undefined" && window.googleDriveSave?.isSignedIn) {
    return createGoogleDriveProvider(window.googleDriveSave);
  }
  return null;
}

const SAVED_BUTTON_RESET_MS = 1500;
const ERROR_BUTTON_RESET_MS = 2000;

const VOLUME_PREF_KEYS = {
  master: "volumeMaster",
  effects: "volumeEffects",
  alerts: "volumeAlerts",
  system: "volumeSystem",
  ambience: "volumeAmbience",
};

function stepToVal(s) {
  return s / 10;
}

const VOLUME_STEP_MIN = 0;
const VOLUME_STEP_MAX = 10;

function applyStepperState(key, step, modal) {
  const value = stepToVal(step);
  const prefKey = VOLUME_PREF_KEYS[key];
  if (prefKey) preferences[prefKey] = value;
  const ui = modal?.getUi?.();
  if (ui?.uiState) {
    const uiKey = { master: "volume_master", effects: "volume_effects", alerts: "volume_alerts", system: "volume_system", ambience: "volume_ambience" }[key];
    if (uiKey) ui.uiState[uiKey] = value;
  }
}

function handleVolumeKeydown(e, blocks, updateStepper, modal) {
  const blocksContainer = blocks.closest(".volume-stepper");
  const key = blocksContainer?.dataset?.volumeKey;
  const prefKey = key ? VOLUME_PREF_KEYS[key] : null;
  const step = prefKey ? Math.round((preferences[prefKey] ?? 0) * 10) : 0;
  const isDecrease = e.key === "ArrowLeft" || e.key === "ArrowDown";
  const isIncrease = e.key === "ArrowRight" || e.key === "ArrowUp";
  if (isDecrease && step > VOLUME_STEP_MIN) {
    e.preventDefault();
    updateStepper(step - 1);
    modal.playClick();
  } else if (isIncrease && step < VOLUME_STEP_MAX) {
    e.preventDefault();
    updateStepper(step + 1);
    modal.playClick();
  }
}

function setupVolumeSteppers(overlay, modal, signal) {
  overlay.querySelectorAll(".volume-stepper").forEach((stepper) => {
    const key = stepper.dataset.volumeKey;
    const blocks = stepper.querySelector(".volume-blocks");
    if (!blocks) return;
    const updateStepper = (step) => applyStepperState(key, step, modal);
    blocks.querySelectorAll(".volume-block").forEach((block) => {
      block.addEventListener("click", (e) => {
        e.stopPropagation();
        updateStepper(parseInt(block.dataset.step, 10));
        modal.playClick();
      }, { signal });
    });
    blocks.addEventListener("keydown", (e) => handleVolumeKeydown(e, blocks, updateStepper, modal), { signal });
  });
}

function handleToggleRowClick(e, overlay, modal) {
  if (e.target.closest(".setting-help-icon")) return;
  e.preventDefault();
  const tr = e.target.closest("tr");
  const id = tr?.dataset.checkboxId;
  if (!id) return;
  const switchEl = overlay.querySelector(`.mech-switch[data-checkbox-id="${id}"]`);
  if (switchEl) {
    switchEl.click();
    modal.playClick();
  }
}

function handleSelectRowClick(e, overlay, modal) {
  if (e.target.closest(".setting-help-icon") || e.target.closest("select")) return;
  e.preventDefault();
  const tr = e.target.closest("tr");
  const id = tr?.dataset.selectId;
  if (id) {
    const select = overlay.querySelector(`#${id}`);
    if (select) {
          select.focus();
          if (typeof select.showPicker === "function") select.showPicker();
          else select.click();
          modal.playClick();
        }
  }
}

function createSetupMechSwitch(overlay, modal, signal) {
  return (checkboxId, onChange) => {
    const checkbox = overlay.querySelector(`#${checkboxId}`);
    const btn = overlay.querySelector(`.mech-switch[data-checkbox-id="${checkboxId}"]`);
    if (!checkbox || !btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      checkbox.checked = !checkbox.checked;
      modal.playClick();
      onChange(checkbox.checked);
    }, { signal });
  };
}

function setupMechSwitches(overlay, modal, signal) {
  const setupMechSwitch = createSetupMechSwitch(overlay, modal, signal);
  const game = modal.getGame?.();
  const affordPrefMap = {
    "setting-hide-upgrades": "hideUnaffordableUpgrades",
    "setting-hide-research": "hideUnaffordableResearch",
    "setting-hide-max-upgrades": "hideMaxUpgrades",
    "setting-hide-max-research": "hideMaxResearch",
    "setting-hide-other-doctrine": "hideOtherDoctrineUpgrades",
  };
  Object.entries(affordPrefMap).forEach(([id, prefKey]) => {
    setupMechSwitch(id, () => {
      preferences[prefKey] = overlay.querySelector(`#${id}`).checked;
      if (game?.upgradeset) game.upgradeset.check_affordability(game);
    });
  });
  setupMechSwitch("setting-motion", (checked) => {
    preferences.reducedMotion = checked;
    document.documentElement.style.setProperty("--prefers-reduced-motion", checked ? "reduce" : "no-preference");
  });
  setupMechSwitch("setting-heat-flow", (checked) => { preferences.heatFlowVisible = checked; });
  setupMechSwitch("setting-heat-map", (checked) => { preferences.heatMapVisible = checked; });
  setupMechSwitch("setting-debug-overlay", (checked) => { preferences.debugOverlay = checked; });
  setupMechSwitch("setting-force-no-sab", (checked) => {
    preferences.forceNoSAB = checked;
    if (game?.engine && typeof game.engine.setForceNoSAB === "function") {
      game.engine.setForceNoSAB(checked);
    }
  });
  const numberFormatSelect = overlay.querySelector("#setting-number-format");
  if (numberFormatSelect) {
    numberFormatSelect.addEventListener("change", () => {
      preferences.numberFormat = numberFormatSelect.value;
      if (game?.ui?.coreLoopUI?.runUpdateInterfaceLoop) game.ui.coreLoopUI.runUpdateInterfaceLoop();
    }, { signal });
  }
  bindEvents(overlay, {
    ".mech-switch-row span": (e) => {
      e.preventDefault();
      e.target.closest(".mech-switch-row")?.querySelector(".mech-switch")?.click();
    },
    "tr.settings-option-row[data-checkbox-id]": {
      click: (e) => handleToggleRowClick(e, overlay, modal),
      keydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleToggleRowClick(e, overlay, modal);
        }
      }
    },
    "tr.settings-option-row.settings-option-select[data-select-id]": {
      click: (e) => handleSelectRowClick(e, overlay, modal),
      keydown: (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelectRowClick(e, overlay, modal);
        }
      }
    },
    ".setting-row.mute-toggle": (e) => {
      if (e.target.closest("#setting-mute-btn")) return;
      e.preventDefault();
      const btn = overlay.querySelector("#setting-mute-btn");
      if (btn) btn.click();
    }
  }, { signal });
  setupSettingsHelpModal(overlay, modal, signal);
  const notifCheckbox = overlay.querySelector("#setting-notifications");
  if (notifCheckbox && "Notification" in window) {
    setupMechSwitch("setting-notifications", (checked) => modal._handleNotificationSwitch(checked));
  }
  if (notifCheckbox && !("Notification" in window)) {
    const row = notifCheckbox.closest(".setting-row");
    if (row) row.style.display = "none";
  }
}

function formatCloudDate(ts) {
  if (!ts) return "—";
  const date = new Date(Number(ts));
  const diffMs = Date.now() - date;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return "Just now";
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

const CLOUD_SLOT_IDS = [1, 2, 3];

function createRefreshCloudSlots(overlay) {
  return async () => {
    const provider = getCloudSaveProvider();
    if (!provider) return;
    let list = [];
    try {
      list = await provider.getSaves();
    } catch (e) {
      return;
    }
    const bySlot = new Map(list.map((s) => [s.slot_id, s]));
    CLOUD_SLOT_IDS.forEach((slotId) => {
      const row = overlay.querySelector(`.cloud-slot-row[data-slot="${slotId}"]`);
      if (!row) return;
      const meta = row.querySelector(".cloud-slot-meta");
      const loadBtn = row.querySelector(`.setting-cloud-load[data-slot="${slotId}"]`);
      const slotData = bySlot.get(slotId);
      if (meta) meta.textContent = slotData ? formatCloudDate(slotData.timestamp) : "—";
      if (loadBtn) loadBtn.disabled = !slotData;
    });
  };
}

function setupCloudSaves(overlay, modal, signal) {
  if (!getCloudSaveProvider()) return;
  const cloudSection = overlay.querySelector("#setting-cloud-saves");
  if (!cloudSection) return;
  cloudSection.style.display = "block";
  const refreshCloudSlots = createRefreshCloudSlots(overlay);
  refreshCloudSlots();
  const handleCloudSave = async (e) => {
    const btn = e.currentTarget;
    const slotId = parseInt(btn.dataset.slot, 10);
    const game = modal.getGame?.();
    if (!game?.saveManager) return;
    const label = btn.textContent;
    btn.textContent = "Saving...";
    btn.disabled = true;
    try {
      const provider = getCloudSaveProvider();
      if (!provider) return;
      await provider.saveGame(slotId, await game.saveManager.getSaveState());
      btn.textContent = "Saved";
      await refreshCloudSlots();
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, SAVED_BUTTON_RESET_MS);
    } catch (e) {
      btn.textContent = "Error";
      setTimeout(() => {
        btn.textContent = label;
        btn.disabled = false;
      }, ERROR_BUTTON_RESET_MS);
    }
    modal.playClick();
  };
  const handleCloudLoad = async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    const slotId = parseInt(btn.dataset.slot, 10);
    const provider = getCloudSaveProvider();
    if (!provider) return;
    let list = [];
    try {
      list = await provider.getSaves();
    } catch (e) {
      return;
    }
    const slotData = list.find((s) => s.slot_id === slotId);
    if (!slotData?.save_data) return;
    await StorageUtilsAsync.setRaw(`reactorGameSave_${slotId}`, slotData.save_data);
    const game = modal.getGame?.();
    try {
      const loaded = game?.saveManager ? await game.saveManager.loadGame(slotId) : false;
      if (loaded) window.location.reload();
    } catch (err) {
      logger.log('error', 'ui', 'Failed to load cloud save:', err);
    }
    modal.playClick();
  };
  bindEvents(overlay, {
    ".setting-cloud-save": handleCloudSave,
    ".setting-cloud-load": handleCloudLoad
  }, { signal });
}

function setupSettingsHelpModal(overlay, modal, signal) {
  let helpEl = overlay.querySelector(".settings-help-modal");
  if (!helpEl) {
    helpEl = document.createElement("div");
    helpEl.className = "settings-help-modal hidden";
    helpEl.innerHTML = `
      <div class="settings-help-backdrop"></div>
      <div class="settings-help-content pixel-panel">
        <div class="settings-help-body"></div>
        <button type="button" class="settings-help-close" aria-label="Close">×</button>
      </div>
    `;
    overlay.appendChild(helpEl);
  }
  const backdrop = helpEl.querySelector(".settings-help-backdrop");
  const body = helpEl.querySelector(".settings-help-body");
  const closeBtn = helpEl.querySelector(".settings-help-close");

  let escapeHandler = null;
  const hide = () => {
    helpEl.classList.add("hidden");
    if (escapeHandler) {
      document.removeEventListener("keydown", escapeHandler);
      escapeHandler = null;
    }
  };

  const escapeHtml = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const show = (title, content) => {
    body.innerHTML = `<h4 class="settings-help-title">${escapeHtml(title)}</h4><p class="settings-help-text">${escapeHtml(content)}</p>`;
    helpEl.classList.remove("hidden");
    escapeHandler = (e) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", escapeHandler, { signal });
  };

  backdrop.addEventListener("click", hide, { signal });
  closeBtn.addEventListener("click", hide, { signal });

  overlay.addEventListener("click", async (e) => {
    const btn = e.target.closest(".setting-help-icon");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const key = btn.dataset.settingKey;
    if (!key) return;
    modal.playClick();
    let data = {};
    try {
      data = await dataService.loadSettingsHelp();
    } catch (err) {}
    const text = data[key] || "No description available.";
    const row = btn.closest("tr");
    const labelSpan = row?.querySelector(".settings-visuals-label span");
    const title = labelSpan?.textContent?.trim() || key;
    show(title, text);
  }, { signal });
}

function setupNavAndAbout(overlay) {
  const versionSpan = overlay.querySelector("#app_version");
  if (versionSpan) {
    const cached = window.ui?.pageInitUI?._cachedVersion;
    if (cached) {
      versionSpan.textContent = cached;
    } else {
      fetch("version.json")
        .then((res) => res.json())
        .then((data) => { versionSpan.textContent = data.version || "Unknown"; })
        .catch(() => { versionSpan.textContent = "Unknown"; });
    }
  }
  const displayModeSpan = overlay.querySelector("#app_display_mode");
  if (displayModeSpan) {
    const modes = ["standalone", "minimal-ui", "browser"];
    const activeMode = modes.find((m) => window.matchMedia(`(display-mode: ${m})`).matches) || "browser";
    displayModeSpan.textContent = activeMode;
  }
}

export function bindSettingsEvents(overlay, modal, signal) {
  const muteBtn = overlay.querySelector("#setting-mute-btn");
  const muteCheckbox = overlay.querySelector("#setting-mute");
  const importInput = overlay.querySelector("#setting-import-input");
  bindEvents(overlay, {
    "#setting-mute-btn": () => {
      if (!muteCheckbox || !muteBtn) return;
      const ui = modal.getUi?.();
      if (ui?.uiState) {
        ui.uiState.audio_muted = !ui.uiState.audio_muted;
      } else {
        muteCheckbox.checked = !muteCheckbox.checked;
        preferences.mute = muteCheckbox.checked;
        const game = modal.getGame?.();
        if (game?.audio) game.audio.toggleMute(muteCheckbox.checked);
      }
      modal.playClick();
    },
    "#setting-export": () => modal._handleExportClick(),
    "#setting-import": () => importInput?.click(),
    "#setting-import-input": { change: (e) => modal._handleImportFile(e.target.files[0]) },
    "#research_back_to_splash_btn": () => { window.location.href = window.location.origin + window.location.pathname; }
  }, { signal });
  setupVolumeSteppers(overlay, modal, signal);
  setupMechSwitches(overlay, modal, signal);
  setupNavAndAbout(overlay);
  setupCloudSaves(overlay, modal, signal);
}

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

const REACTOR_FAILED_DEFAULT_MESSAGE = "The game engine stopped unexpectedly. Try restarting or refresh the page.";
function reactorFailedToStartTemplate({ errorMessage, onTryAgain, onDismiss }) {
  return html`
  <div class="reactor-failed-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
    <div class="reactor-failed-modal pixel-panel">
      <h2 class="reactor-failed-title">Reactor Failed to Start</h2>
      <p class="reactor-failed-message">${errorMessage ?? REACTOR_FAILED_DEFAULT_MESSAGE}</p>
      <div class="reactor-failed-actions">
        <button type="button" class="pixel-btn" @click=${onTryAgain}>Try Again</button>
        <button type="button" class="pixel-btn secondary" @click=${onDismiss}>Dismiss (Pause)</button>
      </div>
    </div>
  </div>
`;
}

function welcomeBackModalTemplate(payload, onInstant, onFastForward, onDismiss) {
  const { offlineMs = 0, queuedTicks = 0 } = payload ?? {};
  const durationStr = Format.time(offlineMs, false);
  const tickStr = queuedTicks.toLocaleString();
  return html`
    <div class="welcome-back-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="welcome-back-modal pixel-panel">
        <h2 class="welcome-back-title">Welcome Back!</h2>
        <p class="welcome-back-message">You were away for <strong>${durationStr}</strong> (~${tickStr} ticks).</p>
        <p class="welcome-back-sub">Choose how to catch up:</p>
        <div class="welcome-back-actions">
          <button type="button" class="pixel-btn welcome-back-instant" @click=${onInstant}>Instant Catch-up</button>
          <button type="button" class="pixel-btn welcome-back-ff" @click=${onFastForward}>Fast-Forward</button>
        </div>
        <p class="welcome-back-hint">Instant: apply average income/heat immediately (analytical solve for long durations). Fast-Forward: process 100 ticks per frame until caught up.</p>
      </div>
    </div>
  `;
}

function prestigeModalTemplate(payload, onConfirm, onCancel) {
  const { mode, totalEp, preservedUpgrades, prestigeMultiplier } = payload;
  const title = mode === "refund" ? "Full Refund" : "Prestige";
  const body = mode === "refund"
    ? html`You will reset: all Exotic Particles, all progress, reactor, and money.`
    : html`
      <div>You will keep: <strong>${formatPrestigeNumber(totalEp)} Total EP</strong>, <strong>${preservedUpgrades} Research</strong>. Reactor and money reset.</div>
      <div style="margin-top: 0.75rem;">Money multiplier: ×${prestigeMultiplier.toFixed(2)} (from Total EP)</div>
    `;
  return html`
    <div class="prestige-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="prestige-modal pixel-panel">
        <h2 id="prestige_modal_title">${title}</h2>
        <div id="prestige_modal_body">${body}</div>
        <div class="prestige-modal-actions">
          <button id="prestige_modal_cancel" class="pixel-btn nav-btn" type="button" @click=${onCancel}>Cancel</button>
          ${mode === "refund"
            ? html`<button id="prestige_modal_confirm_refund" class="pixel-btn nav-btn" type="button" @click=${() => onConfirm("refund")}>Confirm Refund</button>`
            : html`<button id="prestige_modal_confirm_prestige" class="pixel-btn nav-btn btn-start" type="button" @click=${() => onConfirm("prestige")}>Confirm Prestige</button>`
          }
        </div>
      </div>
    </div>
  `;
}

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
