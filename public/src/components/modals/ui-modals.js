import { html, render, nothing } from "lit-html";
import { proxy } from "valtio/vanilla";
import { StorageAdapter, serializeSave, rotateSlot1ToBackup, setSlot1FromBackupAsync, StorageUtils, STORAGE_KEYS } from "../../storage/index.js";
import { logger } from "../../core/logger.js";
import { formatDuration, numFormat as fmt, formatPrestigeNumber } from "../../core/numbers.js";
import { getValidatedPreferences, preferences, modalUi, syncReducedMotionDOM, actions, showLoadBackupModal } from "../../store.js";
import { getAppContext } from "../../app-context.js";
import { enqueueWarningStop } from "../../state/game-effects.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";
import { hideCopyPasteModal, openCopyPasteDialogHost, getCopyPasteRefs, syncModalDialogOpen } from "../blueprints/ui-copy-paste.js";
import { bindLitRenderMultiStates } from "../../dom/lit-reactive.js";
import { getUiElement } from "../shell/page-dom.js";
import { renderComponentIcons, layoutViewTemplate, myLayoutsTemplate, quickStartTemplate } from "../ui-components.js";
import { styleMap, bindEvents, escapeHtml } from "../../dom/lit.js";
import { getMyLayouts } from "../blueprints/ui-layout-storage.js";
import { WEAVE_QUANTUM } from "../../constants/balance.js";
import { drainGridIntentsAsync } from "../../bridge/bridge-intents.js";
import { dispatchRebootIntent } from "../grid/ui-intents.js";

const HIDDEN_STYLE = { display: "none" };
const SECTION_HEAD = "margin-top: 0; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";
const SECTION_HEAD_MARGIN = "margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";

const SETTINGS_MODAL_TABS = [
  { tab: "audio", label: "AUDIO", panelId: "settings_tab_audio", btnId: "settings_tab_audio_btn" },
  { tab: "visuals", label: "VISUALS", panelId: "settings_tab_visuals", btnId: "settings_tab_visuals_btn" },
  { tab: "system", label: "SYS", panelId: "settings_tab_system", btnId: "settings_tab_system_btn" },
  { tab: "data", label: "DATA", panelId: "settings_tab_data", btnId: "settings_tab_data_btn" },
];

function volumeStepper(key, value) {
  const step = volToStep(value);
  return html`
    <div class="volume-stepper" data-volume-key=${key}>
      <div class="volume-blocks" role="slider" aria-valuemin="0" aria-valuemax="10" aria-valuenow=${step} tabindex="0">
        ${Array.from({ length: 10 }, (_, i) => html`
          <button type="button" class="volume-block" data-step=${i + 1} aria-label="${(i + 1) * 10}%" ?data-active=${i < step}></button>
        `)}
      </div>
      <span class="volume-stepper-val">${step * 10}%</span>
    </div>
  `;
}

function muteSwitch(id, isMuted) {
  return html`
    <button type="button" class="mech-switch ${isMuted ? "mech-switch-on-active" : ""}" role="switch" aria-checked=${isMuted} data-checkbox-id=${id} tabindex="0">
      <span class="mech-switch-off">AUDIO</span>
      <span class="mech-switch-track"><span class="mech-switch-thumb"></span></span>
      <span class="mech-switch-on">MUTE</span>
    </button>
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

function switchRow(id, label, checked) {
  return html`
    <tr class="settings-option-row" data-checkbox-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
      </td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" class="settings-mech-checkbox" id=${id} ?checked=${checked}>
          ${mechSwitch(id, checked)}
        </label>
      </td>
    </tr>
  `;
}

function selectRow(id, label, content) {
  return html`
    <tr class="settings-option-row settings-option-select" data-select-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
      </td>
      <td class="settings-visuals-control">${content}</td>
    </tr>
  `;
}

function volumeSection(isMuted, vol) {
  return html`
    <div class="settings-section">
      <table class="settings-visuals-table" style="margin-bottom: 1.5rem;">
        <tr class="settings-option-row" data-checkbox-id="setting-mute" role="button" tabindex="0">
          <td class="settings-visuals-label"><span>Master Mute</span></td>
          <td class="settings-visuals-control">
            <label class="mech-switch-row">
              <input type="checkbox" class="settings-mech-checkbox" id="setting-mute" ?checked=${isMuted}>
              ${muteSwitch("setting-mute", isMuted)}
            </label>
          </td>
        </tr>
      </table>
      <div class="volume-setting"><label class="volume-label">Master Volume</label>${volumeStepper("master", vol.volumeMaster)}</div>
      <div class="volume-setting"><label class="volume-label">Effects Volume</label>${volumeStepper("effects", vol.volumeEffects)}</div>
      <div class="volume-setting"><label class="volume-label">Alerts Volume</label>${volumeStepper("alerts", vol.volumeAlerts)}</div>
      <div class="volume-setting"><label class="volume-label">System Volume</label>${volumeStepper("system", vol.volumeSystem)}</div>
      <div class="volume-setting" style="margin-bottom: 0;"><label class="volume-label">Background Volume</label>${volumeStepper("ambience", vol.volumeAmbience)}</div>
    </div>
  `;
}

function visualSection(prefs) {
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ACCESSIBILITY</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-motion", "Reduced Motion", prefs.reducedMotion)}
        ${selectRow("setting-number-format", "Number format", html`
          <select id="setting-number-format" class="pixel-select settings-select" style="background: rgb(60 60 60); color: white; border: 2px solid var(--bevel-dark); padding: 4px;">
            <option value="default" ?selected=${prefs.numberFormat === "default"}>1,234 K</option>
            <option value="scientific" ?selected=${prefs.numberFormat === "scientific"}>1.23e3</option>
          </select>
        `)}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>UPGRADE PANEL</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-hide-upgrades", "Hide Unaffordable Upgrades", prefs.hideUnaffordableUpgrades)}
        ${switchRow("setting-hide-research", "Hide Unaffordable Research", prefs.hideUnaffordableResearch)}
        ${switchRow("setting-hide-max-upgrades", "Hide Max Upgrades", prefs.hideMaxUpgrades)}
        ${switchRow("setting-hide-max-research", "Hide Max Research", prefs.hideMaxResearch)}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>REACTOR VIEW</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-heat-flow", "Heat flow arrows", prefs.heatFlowVisible)}
        ${switchRow("setting-heat-map", "Heat map", prefs.heatMapVisible)}
        ${switchRow("setting-debug-overlay", "Debug overlay (flow arrows)", prefs.debugOverlay)}
      </table>
    </div>
  `;
}

function systemSection(prefs, notificationsChecked) {
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ENGINE & NOTIFICATIONS</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-notifications", "Update Notifications", notificationsChecked)}
      </table>

      <h4 style="margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-warning-color, rgb(255 160 0)); font-size: 0.8rem; border-bottom: 2px solid rgb(68 68 68); padding-bottom: 4px;">POWER CYCLING</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="research_back_to_splash_btn" style="border-color: rgb(209 107 107) rgb(80 30 30) rgb(80 30 30) rgb(209 107 107); background: rgb(171 63 63);">QUIT TO TITLE</button>
      </div>

      <h4 style=${SECTION_HEAD_MARGIN}>SYSTEM INFO</h4>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: var(--neutral-200);">Version: <span id="app_version" style="color: var(--text-primary);">Loading...</span></p>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: var(--neutral-200);">Display Mode: <span id="app_display_mode" style="color: var(--text-primary);">Detecting...</span></p>

      <h4 style=${SECTION_HEAD_MARGIN}>LEGAL</h4>
      <div class="settings-legal-links" style="display: flex; flex-direction: column; gap: 0.5rem;">
        <a href="#about_section" data-page="about_section" class="settings-legal-link">About</a>
        <a href="privacy-policy.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        <a href="terms-of-service.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      </div>
    </div>
  `;
}

function dataSection() {
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>LOCAL STORAGE</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="setting-export">Export</button>
        <button class="pixel-btn" id="setting-import">Import</button>
        <button class="pixel-btn" id="setting-changelog" type="button">Recent Changes</button>
        <input type="file" id="setting-import-input" accept=".json" style=${styleMap(HIDDEN_STYLE)}>
      </div>
    </div>
  `;
}

function settingsModalLayout({ activeTab, notificationPermission = "default", onTabClick, onClose }) {
  const vol = getValidatedPreferences();
  const prefs = getValidatedPreferences();
  const notificationsChecked = notificationPermission === "granted";
  const panelByTab = {
    audio: volumeSection(vol.mute, vol),
    visuals: visualSection(prefs),
    system: systemSection(prefs, notificationsChecked),
    data: dataSection(),
  };
  return html`
    <div class="settings-modal pixel-panel modal-drawer-panel" style="padding: 0; display: flex; flex-direction: column;" @click=${(e) => e.stopPropagation()}>
        <div class="modal-drawer-metal-handle" aria-hidden="true"></div>
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="settings-header" style="background: rgb(35 39 35); border-bottom: 4px solid var(--bevel-dark); padding: 12px 16px;">
          <h2 style="margin: 0; color: var(--game-success-color, rgb(143 214 148)); font-size: 1rem; text-shadow: 2px 2px 0 rgb(0 0 0 / 80%);">DIAGNOSTIC TERMINAL</h2>
          <button type="button" class="close-btn modal-close-btn modal-latch-close" aria-label="Close" @click=${onClose}><span class="modal-latch-arm" aria-hidden="true"></span><span class="modal-latch-body"></span></button>
        </div>

        <div class="settings-tabs" role="tablist">
          ${SETTINGS_MODAL_TABS.map(
            ({ tab, label, panelId, btnId }) => html`
              <button
                class="settings-tab ui-bevel flex-center ${activeTab === tab ? "active" : ""}"
                role="tab"
                aria-selected=${activeTab === tab}
                aria-controls=${panelId}
                data-tab=${tab}
                id=${btnId}
                @click=${() => onTabClick(tab)}
              >${label}</button>
            `
          )}
        </div>

        <div class="settings-content pixel-panel is-inset">
          ${SETTINGS_MODAL_TABS.map(
            ({ tab, panelId, btnId }) => html`
              <div
                id=${panelId}
                class="settings_tab_content ${activeTab === tab ? "active" : ""}"
                role="tabpanel"
                aria-labelledby=${btnId}
                aria-hidden=${activeTab !== tab}
              >
                ${panelByTab[tab]}
              </div>
            `
          )}
        </div>
    </div>
  `;
}

function reactorFailedToStartLayout({ errorMessage, defaultMessage, onTryAgain, onDismiss }) {
  return html`
    <div class="reactor-failed-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="reactor-failed-modal pixel-panel">
        <h2 class="reactor-failed-title">Reactor Failed to Start</h2>
        <p class="reactor-failed-message">${errorMessage ?? defaultMessage}</p>
        <div class="reactor-failed-actions">
          <button type="button" class="pixel-btn" @click=${onTryAgain}>Try Again</button>
          <button type="button" class="pixel-btn secondary" @click=${onDismiss}>Dismiss (Pause)</button>
        </div>
      </div>
    </div>
  `;
}

function welcomeBackLayout({ durationStr, tickStr, onFastForward, onDismiss }) {
  return html`
    <div class="welcome-back-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="welcome-back-modal pixel-panel">
        <h2 class="welcome-back-title">Welcome Back!</h2>
        <p class="welcome-back-message">Away for <strong>${durationStr}</strong> (~${tickStr} ticks). Catch up via worker replay:</p>
        <div class="welcome-back-actions">
          <button type="button" class="pixel-btn welcome-back-ff" @click=${onFastForward}>Fast-Forward</button>
        </div>
        <p class="welcome-back-hint"><strong>Fast-Forward</strong> replays offline ticks through the physics worker at ${100} ticks per frame. Unstable layouts can still melt down.</p>
      </div>
    </div>
  `;
}

function prestigeLayout({ mode, title, body, onConfirm, onCancel }) {
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

function contextLayout({ partTitle, bodyContent, onClose, onSell }) {
  return html`
    <div id="context_modal" class="context-modal context-modal-panel" role="document">
      <div class="context-modal-handle"></div>
      <div class="context-modal-content">
        <div class="context-modal-header">
          <h3 class="context-modal-title">${partTitle}</h3>
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

function setModalDrawerOpen(open) {
  modalUi.drawerOpen = !!open;
}

function volToStep(v) {
  return Math.min(10, Math.round(v * 10));
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

function applyStepperState(key, step) {
  const value = stepToVal(step);
  const prefKey = VOLUME_PREF_KEYS[key];
  if (prefKey) preferences[prefKey] = value;
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
  if (e.target.closest("select")) return;
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
      btn.classList.toggle("mech-switch-on-active", checkbox.checked);
      btn.setAttribute("aria-checked", String(checkbox.checked));
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
  };
  Object.entries(affordPrefMap).forEach(([id, prefKey]) => {
    setupMechSwitch(id, () => {
      const el = overlay.querySelector(`#${id}`);
      if (!el) return;
      preferences[prefKey] = el.checked;
      if (game?.upgradeset) game.upgradeset.check_affordability(game);
    });
  });
  setupMechSwitch("setting-motion", (checked) => {
    preferences.reducedMotion = checked;
    syncReducedMotionDOM();
  });
  setupMechSwitch("setting-heat-flow", (checked) => { preferences.heatFlowVisible = checked; });
  setupMechSwitch("setting-heat-map", (checked) => { preferences.heatMapVisible = checked; });
  setupMechSwitch("setting-debug-overlay", (checked) => { preferences.debugOverlay = checked; });
  setupMechSwitch("setting-mute", (checked) => {
    preferences.mute = checked;
    const ui = modal.getUi?.();
    if (ui?.uiState) {
      ui.uiState.audio_muted = checked;
    }
    const gameRef = modal.getGame?.();
    if (gameRef?.audio) gameRef.audio.toggleMute(checked);
  });
  const numberFormatSelect = overlay.querySelector("#setting-number-format");
  if (numberFormatSelect) {
    numberFormatSelect.addEventListener("change", () => {
      preferences.numberFormat = numberFormatSelect.value;
      game?.ui?.startRenderLoop?.(0);
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
    }
  }, { signal });
  const notifCheckbox = overlay.querySelector("#setting-notifications");
  if (notifCheckbox && "Notification" in window) {
    setupMechSwitch("setting-notifications", (checked) => modal._handleNotificationSwitch(checked));
  }
  if (notifCheckbox && !("Notification" in window)) {
    const row = notifCheckbox.closest(".setting-row");
    if (row) row.style.display = "none";
  }
}

function setupCloudSaves() {}

function setupNavAndAbout(overlay) {
  const versionSpan = overlay.querySelector("#app_version");
  if (versionSpan) {
    const cached = getAppContext()?.ui?._cachedVersion;
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
  const importInput = overlay.querySelector("#setting-import-input");
  bindEvents(overlay, {
    "#setting-export": () => modal._handleExportClick(),
    "#setting-import": () => importInput?.click(),
    "#setting-changelog": () => {
      getAppContext()?.splashManager?.versionChecker?.showRecentChangelogModal?.({
        title: "Recent Changes",
        limit: 5,
      });
    },
    "#setting-import-input": { change: (e) => modal._handleImportFile(e.target.files[0]) },
    "#research_back_to_splash_btn": () => { window.location.href = window.location.origin + window.location.pathname; }
  }, { signal });
  setupVolumeSteppers(overlay, modal, signal);
  setupMechSwitches(overlay, modal, signal);
  setupNavAndAbout(overlay);
  setupCloudSaves(overlay, modal, signal);
}

export const settingsModalTemplate = (settingsState, onTabClick, onClose) => settingsModalLayout({
  activeTab: settingsState?.activeTab ?? "audio",
  notificationPermission: settingsState?.notificationPermission ?? "default",
  onTabClick,
  onClose,
});

export function createSettingsContext(ui, modal) {
  const getGame = () => ui?.game ?? getAppContext()?.game;
  const getUi = () => ui ?? getAppContext()?.ui;
  const playClick = () => {
    const game = getGame();
    if (game) actions.enqueueEffect(game, { kind: "sfx", id: "click", context: "global" });
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
    const slot = Number(await StorageAdapter.get(STORAGE_KEYS.CURRENT_SLOT, 1));
    const saveData = await StorageAdapter.getRaw(`${STORAGE_KEYS.GAME_SAVE}_${slot}`) || await StorageAdapter.getRaw(STORAGE_KEYS.GAME_SAVE);
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
    await rotateSlot1ToBackup(saveData);
    const game = getGame();
    if (!game?.saveManager) return;
    let result = await game.saveManager.loadGame(1);
    const hasBackup = result && typeof result === "object" && result.backupAvailable;
    if (hasBackup) {
      const useBackup = await showLoadBackupModal();
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
  return reactorFailedToStartLayout({
    errorMessage,
    defaultMessage: REACTOR_FAILED_DEFAULT_MESSAGE,
    onTryAgain,
    onDismiss,
  });
}

function welcomeBackModalTemplate(payload, onFastForward, onDismiss) {
  const { offlineMs = 0, tickEquivalent = 0, queuedTicks = 0 } = payload ?? {};
  const durationStr = formatDuration(offlineMs, false);
  const tickStr = (tickEquivalent || queuedTicks).toLocaleString();
  return welcomeBackLayout({
    durationStr,
    tickStr,
    onFastForward,
    onDismiss,
  });
}

function prestigeModalTemplate(payload, onConfirm, onCancel) {
  const { mode, totalEp, preservedUpgrades, prestigeMultiplier, epFromWeave } = payload;
  const title = mode === "refund" ? "Full Refund" : "Prestige";
  const body = mode === "refund"
    ? html`You will reset: all Exotic Particles, all progress, reactor, and money.`
    : html`
      <div>You will keep: <strong>${formatPrestigeNumber(totalEp)} Total EP</strong>, <strong>${preservedUpgrades} Research</strong>. Reactor and money reset.</div>
      <div style="margin-top: 0.75rem;">
        EP from this run: <strong>${formatPrestigeNumber(epFromWeave ?? 0)}</strong><br>
        <small style="color: var(--neutral-400);">
          (Min(Power, Heat) / ${WEAVE_QUANTUM.toLocaleString()})
        </small>
      </div>
      <div style="margin-top: 0.75rem;">Money multiplier: ×${prestigeMultiplier.toFixed(2)} (from Total EP)</div>
    `;
  return prestigeLayout({ mode, title, body, onConfirm, onCancel });
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
  return contextLayout({
    partTitle: part.title || "Part",
    bodyContent,
    onClose,
    onSell,
  });
}

export { MODAL_IDS } from "../../constants/modal-ids.js";

class ModalOrchestration {
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
    const root = typeof document !== "undefined" ? document.getElementById("modal-root") : null;
    if (root instanceof HTMLDialogElement && !root.dataset.boundGameCancel) {
      root.dataset.boundGameCancel = "1";
      root.addEventListener("cancel", (e) => {
        e.preventDefault();
        ui?.modalOrchestrator?.hideModal?.(modalUi.activeModal);
      });
    }
    this._registerHandlers();
  }

  _resolveModalRoot() {
    if (!this._modalRoot) {
      this._modalRoot = (this.ui ? getUiElement(this.ui, "modal-root") : null) ?? (typeof document !== "undefined" ? document.getElementById("modal-root") : null);
    }
    return this._modalRoot;
  }

  _openLitModal(template) {
    const root = this._resolveModalRoot();
    if (!root) return;
    render(template, root);
    syncModalDialogOpen(root, true);
  }

  _closeLitModal() {
    const root = this._resolveModalRoot();
    if (!root) return;
    render(nothing, root);
    syncModalDialogOpen(root, false);
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
      hide: () => this._closeLitModal(),
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
    if (modalId !== MODAL_IDS.SETTINGS && modalId !== MODAL_IDS.MY_LAYOUTS) {
      setModalDrawerOpen(false);
    }
    modalUi.activeModal = modalId;
    modalUi.payload = payload ?? null;
    const handler = this._handlers.get(modalId);
    if (!handler?.show) return undefined;
    return handler.show(payload);
  }

  hideModal(modalId) {
    if (modalId == null) return;
    const handler = this._handlers.get(modalId);
    if (!handler?.hide) return;
    handler.hide();
    if (modalUi.activeModal === modalId) {
      modalUi.activeModal = null;
      modalUi.payload = null;
    }
  }

  isModalVisible(modalId) {
    if (modalId === MODAL_IDS.SETTINGS) return this._settingsVisible;
    return modalUi.activeModal === modalId;
  }

  _renderContextModal() {
    if (!this._resolveModalRoot()) return;
    const tile = this._activeContextTile;
    const onSell = async () => {
      this.ui?.deviceFeatures?.heavyVibration?.();
      const game = this.ui?.game;
      if (game && tile?.part) {
        await game.sellPart(tile);
        this.ui?.gridCanvasRenderer?.markTileDirty(tile.row, tile.col);
        this.hideModal(MODAL_IDS.CONTEXT);
      }
    };
    const onClose = () => {
      this.ui?.deviceFeatures?.lightVibration?.();
      this.hideModal(MODAL_IDS.CONTEXT);
    };
    if (tile) this._openLitModal(contextModalTemplate(tile, onSell, onClose));
    else this._closeLitModal();
  }

  _showContextModal(tile) {
    if (!this.ui || !tile?.part) return;
    this._resolveModalRoot();
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

    const game = this.ui.game;
    const totalEp = game.state.total_exotic_particles || 0;
    const epFromWeave = game.state?.session_ep_weave ?? 0;
    const preservedUpgrades = game.upgradeset.getAllUpgrades().filter((u) => u.base_ecost && u.level > 0).length;
    const prestigeMultiplier = game.getPrestigeMultiplier();

    const onCancel = () => this.hideModal(MODAL_IDS.PRESTIGE);
    const onConfirm = (confirmedMode) => {
      this.hideModal(MODAL_IDS.PRESTIGE);
      dispatchRebootIntent(game, { keepEp: confirmedMode !== "refund" });
    };

    this._openLitModal(
      prestigeModalTemplate(
        { mode, totalEp, epFromWeave, preservedUpgrades, prestigeMultiplier },
        onConfirm,
        onCancel
      )
    );
  }

  _hidePrestigeModal() {
    this._closeLitModal();
  }

  _showCopyPasteModal(payload) {
    if (payload?.action === "sell") {
      this._showSellModal(payload);
    }
  }

  _showSellModal(payload) {
    const ui = this.ui;
    const { summary = [], checkedTypes = {}, previousPauseState = false } = payload || {};
    openCopyPasteDialogHost();
    const refs = getCopyPasteRefs();
    if (!refs) return;
    const { modal: modalEl, modalTitle, modalText, modalCost, confirmBtn, closeBtn } = refs;

    modalTitle.textContent = "Sell Reactor Parts";
    confirmBtn.textContent = "Sell Selected";

    if (modalText) {
      modalText.classList.add("hidden");
      modalText.style.display = "none";
      modalText.style.visibility = "hidden";
      modalText.style.opacity = "0";
      modalText.style.height = "0";
      modalText.style.overflow = "hidden";
    }

    modalEl.dataset.previousPauseState = previousPauseState;

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
    confirmBtn.style.backgroundColor = "var(--canvas-confirm-danger)";
    confirmBtn.onclick = async () => {
      const tilesToSell = [];
      ui.game.tileset.tiles_list.forEach(tile => {
        if (tile.enabled && tile.part && checkedTypes[tile.part.id] !== false) {
          tilesToSell.push(tile);
        }
      });
      const totalSellValue = tilesToSell.reduce((sum, tile) => sum + (tile.calculateSellValue?.() ?? tile.part.cost), 0);
      const intents = tilesToSell.map((t) => ({
        action: "SELL_PART",
        payload: { row: t.row, col: t.col },
      }));
      await drainGridIntentsAsync(ui.game, ui.game.engine, intents);
      ui.game.reactor.updateStats();
      confirmBtn.textContent = `Sold $${fmt(totalSellValue)}`;
      confirmBtn.style.backgroundColor = "var(--canvas-confirm-success)";
      setTimeout(() => {
        this.hideModal(MODAL_IDS.COPY_PASTE);
        confirmBtn.style.backgroundColor = "var(--canvas-confirm-action)";
      }, 1500);
    };

    closeBtn.onclick = () => this.hideModal(MODAL_IDS.COPY_PASTE);

    const dialogRoot = this._resolveModalRoot();
    if (dialogRoot && !dialogRoot._sellModalBackdropBound) {
      dialogRoot._sellModalBackdropBound = true;
      dialogRoot.addEventListener("click", (e) => {
        if (e.target === dialogRoot) this.hideModal(MODAL_IDS.COPY_PASTE);
      });
    }
    updateSellSummary();
  }

  _hideCopyPasteModal() {
    hideCopyPasteModal(this.ui);
  }

  _showWelcomeBackModal(payload) {
    if (!this.ui?.game) return Promise.resolve();
    if (!this._resolveModalRoot()) return Promise.resolve();

    const game = this.ui.game;
    game.pause();

    return new Promise((resolve) => {
      const handleClose = (mode) => {
        if (mode === "fast-forward" && game.engine) game.engine.beginFastForwardCatchup();

        if (game) {
          game.onToggleStateChange?.("pause", false);
        }
        this.hideModal(MODAL_IDS.WELCOME_BACK);
        resolve(mode);
      };

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

      this._openLitModal(
        welcomeBackModalTemplate(
          payload,
          () => wrappedClose("fast-forward"),
          () => wrappedClose("fast-forward")
        )
      );
    });
  }

  _renderSettingsModal() {
    if (!this._resolveModalRoot()) return;
    if (this._settingsUnmount) {
      this._settingsUnmount();
      this._settingsUnmount = null;
    }
    const onClose = () => this.hideModal(MODAL_IDS.SETTINGS);
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
    this._settingsUnmount = bindLitRenderMultiStates(
      [preferences, this._settingsState],
      () => settingsModalTemplate(this._settingsState, onTabClick, onClose),
      this._modalRoot,
      onAfterRender
    );
  }

  _showSettingsModal() {
    if (!this.ui) return;
    if (!this._resolveModalRoot()) return;
    this._settingsState.activeTab = "audio";
    this._settingsState.notificationPermission = typeof Notification !== "undefined" ? Notification.permission : "default";
    this._settingsContext = createSettingsContext(this.ui, this);
    const root = this._modalRoot;
    if (root && !root._settingsCancelBound) {
      root._settingsCancelBound = true;
      root.addEventListener("cancel", (e) => {
        e.preventDefault();
        this.hideModal(MODAL_IDS.SETTINGS);
      });
      root.addEventListener("click", (e) => {
        if (e.target === root) this.hideModal(MODAL_IDS.SETTINGS);
      });
    }
    this._settingsVisible = true;
    setModalDrawerOpen(true);
    this._renderSettingsModal();
    syncModalDialogOpen(this._modalRoot, true);
  }

  _hideSettingsModal() {
    this._settingsVisible = false;
    setModalDrawerOpen(false);
    if (this._settingsUnmount) {
      this._settingsUnmount();
      this._settingsUnmount = null;
    }
    abortSettingsListeners();
    if (this._settingsKeyHandler) {
      this._settingsKeyHandler = null;
    }
    const game = this.ui?.game;
    if (game) {
      enqueueWarningStop(game);
      game.audio?.stopTestSound?.();
    }
    this._closeLitModal();
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) menuBtn.classList.remove("active");
    const settingsTopBtn = document.getElementById("settings_btn");
    if (settingsTopBtn) settingsTopBtn.classList.remove("active");
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
    if (!this._resolveModalRoot()) return;

    const errorMessage = payload?.error ?? null;
    if (this.ui?.uiState) this.ui.uiState.reactor_failed_error = errorMessage;

    const onTryAgain = () => {
      if (game.engine) game.engine.start();
      this._hideReactorFailedToStartModal(false);
    };
    const onDismiss = () => this._hideReactorFailedToStartModal(true);
    this._openLitModal(reactorFailedToStartTemplate({ errorMessage, onTryAgain, onDismiss }));
  }

  _showQuickStartModal(game, isDetailed = false) {
    if (!this._resolveModalRoot()) return;

    this._quickStartPage = 1;
    this._quickStartGame = game;

    const onClose = () => {
      StorageUtils.set(STORAGE_KEYS.QUICK_START_SHOWN, 1);
      if (this._quickStartGame?.tutorialManager && !StorageUtils.get("reactorTutorialCompleted")) {
        this._quickStartGame.tutorialManager.start();
      }
      this.hideModal(MODAL_IDS.QUICK_START);
    };
    const onMoreDetails = () => {
      this._quickStartPage = 2;
      this._openLitModal(
        quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack)
      );
    };
    const onBack = () => {
      this._quickStartPage = 1;
      this._openLitModal(
        quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack)
      );
    };

    this._openLitModal(quickStartTemplate(this._quickStartPage, onClose, onMoreDetails, onBack));
  }

  _hideQuickStartModal() {
    this._quickStartGame = null;
    this._closeLitModal();
  }

  showSettings() {
    this.showModal(MODAL_IDS.SETTINGS);
  }

  showWelcomeBackModal(offlineMs, tickEquivalent) {
    return this.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs, tickEquivalent });
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
      game.onToggleStateChange?.("pause", true);
    }
    if (this.ui?.uiState) this.ui.uiState.reactor_failed_error = null;
    this._closeLitModal();
    if (modalUi.activeModal === MODAL_IDS.REACTOR_FAILED_TO_START) {
      modalUi.activeModal = null;
      modalUi.payload = null;
    }
  }

  _showLayoutViewModal(payload) {
    const { layoutJson, stats } = payload ?? {};
    if (!this.ui?.game) return;
    if (!this._resolveModalRoot()) return;

    const onClose = () => this.hideModal(MODAL_IDS.LAYOUT_VIEW);
    this._openLitModal(layoutViewTemplate(layoutJson, stats, this.ui.game, onClose));
  }

  _hideLayoutViewModal() {
    this._closeLitModal();
  }

  _showMyLayoutsModal() {
    if (!this.ui) return;
    if (!this._resolveModalRoot()) return;

    const onClose = () => this.hideModal(MODAL_IDS.MY_LAYOUTS);
    const list = getMyLayouts();
    this._openLitModal(myLayoutsTemplate(this.ui, list, fmt, onClose));
  }

  _hideMyLayoutsModal() {
    setModalDrawerOpen(false);
    this._closeLitModal();
  }
}

export function createModalOrchestrator() {
  return new ModalOrchestration();
}
