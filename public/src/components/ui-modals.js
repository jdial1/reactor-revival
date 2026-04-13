import { html, render, nothing } from "lit-html";
import { proxy } from "valtio/vanilla";
import { styleMap, StorageUtilsAsync, serializeSave, rotateSlot1ToBackupAsync, setSlot1FromBackupAsync, logger, bindEvents, escapeHtml, formatDuration, numFormat as fmt, StorageUtils, formatPrestigeNumber } from "../utils.js";
import { getValidatedPreferences, preferences, modalUi, syncReducedMotionDOM, enqueueGameEffect } from "../state.js";
import { getValidatedGameData } from "../services.js";
import { ReactiveLitComponent } from "./reactive-lit-component.js";
import { renderComponentIcons, layoutViewTemplate, myLayoutsTemplate, quickStartTemplate } from "./ui-components.js";
import {
  settingsHelpShellTemplate,
  volumeStepperTemplate,
  mechSwitchTemplate,
  helpIconTemplate,
  switchRowTemplate,
  selectRowTemplate,
  volumeSectionTemplate,
  visualSectionTemplate,
  systemSectionTemplate,
  dataSectionTemplate,
  settingsModalTemplate as settingsModalLayoutTemplate,
  reactorFailedToStartTemplate as reactorFailedToStartModalTemplate,
  welcomeBackModalTemplate as welcomeBackLayoutTemplate,
  prestigeModalTemplate as prestigeLayoutTemplate,
  contextModalTemplate as contextLayoutTemplate,
} from "../templates/uiModalTemplates.js";

const HIDDEN_STYLE = { display: "none" };
const DRAWER_BODY_CLASS = "modal-drawer-open";

function setModalDrawerOpen(open) {
  if (typeof document === "undefined") return;
  document.body.classList.toggle(DRAWER_BODY_CLASS, !!open);
}

function syncModalDialogOpen(root, open) {
  if (!root || typeof HTMLDialogElement === "undefined" || !(root instanceof HTMLDialogElement)) return;
  try {
    if (open && !root.open) root.showModal();
    else if (!open && root.open) root.close();
  } catch (_) {}
}
const SECTION_HEAD = "margin-top: 0; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";
const SECTION_HEAD_MARGIN = "margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";

function volToStep(v) {
  return Math.min(10, Math.round(v * 10));
}

function volumeStepper(key, value) {
  const step = volToStep(value);
  return volumeStepperTemplate(key, step);
}

function mechSwitch(id, checked) {
  return mechSwitchTemplate(id, checked);
}

function helpIcon(settingKey) {
  return helpIconTemplate(settingKey);
}

function switchRow(id, label, checked, helpKey) {
  const key = helpKey ?? id.replace("setting-", "");
  return switchRowTemplate(id, label, checked, key, helpIcon, mechSwitch);
}

function selectRow(id, label, helpKey, content) {
  return selectRowTemplate(id, label, helpKey, content, helpIcon);
}

function createVolumeSection() {
  const vol = getValidatedPreferences();
  const isMuted = vol.mute;
  return volumeSectionTemplate(isMuted, vol, volumeStepper);
}

function createVisualSection() {
  const prefs = getValidatedPreferences();
  return visualSectionTemplate(prefs, SECTION_HEAD, SECTION_HEAD_MARGIN, switchRow, selectRow);
}

function createSystemSection(notificationPermission = "default") {
  const prefs = getValidatedPreferences();
  const notificationsChecked = notificationPermission === "granted";
  return systemSectionTemplate(prefs, notificationsChecked, SECTION_HEAD, SECTION_HEAD_MARGIN, switchRow);
}

function createDataSection() {
  return dataSectionTemplate(SECTION_HEAD, HIDDEN_STYLE);
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
  };
  Object.entries(affordPrefMap).forEach(([id, prefKey]) => {
    setupMechSwitch(id, () => {
      preferences[prefKey] = overlay.querySelector(`#${id}`).checked;
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

function setupCloudSaves() {}

function setupSettingsHelpModal(overlay, modal, signal) {
  let helpEl = overlay.querySelector(".settings-help-modal");
  if (!helpEl) {
    helpEl = document.createElement("div");
    helpEl.className = "settings-help-modal hidden";
    helpEl.innerHTML = settingsHelpShellTemplate;
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

  const show = (title, content) => {
    render(html`
      <h4 class="settings-help-title">${title}</h4>
      <p class="settings-help-text">${content}</p>
    `, body);
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
      data = getValidatedGameData().settingsHelp;
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
  return settingsModalLayoutTemplate({
    activeTab,
    volumeTemplate,
    visualTemplate,
    systemTemplate,
    dataTemplate,
    onTabClick,
    onClose,
  });
};

export function createSettingsContext(ui, modal) {
  const getGame = () => ui?.game ?? window.game;
  const getUi = () => ui ?? window.ui;
  const playClick = () => {
    const game = getGame();
    if (game) enqueueGameEffect(game, { kind: "sfx", id: "click", context: "global" });
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
  return reactorFailedToStartModalTemplate({
    errorMessage,
    defaultMessage: REACTOR_FAILED_DEFAULT_MESSAGE,
    onTryAgain,
    onDismiss,
  });
}

function welcomeBackModalTemplate(payload, onInstant, onFastForward, onDismiss) {
  const { offlineMs = 0, tickEquivalent = 0, queuedTicks = 0 } = payload ?? {};
  const durationStr = formatDuration(offlineMs, false);
  const tickStr = (tickEquivalent || queuedTicks).toLocaleString();
  return welcomeBackLayoutTemplate({
    durationStr,
    tickStr,
    onInstant,
    onFastForward,
    onDismiss,
  });
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
  return prestigeLayoutTemplate({ mode, title, body, onConfirm, onCancel });
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
  return contextLayoutTemplate({
    partTitle: part.title || "Part",
    bodyContent,
    onClose,
    onSell,
  });
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
  SETTINGS: "settings",
  LAYOUT_VIEW: "layoutView",
  MY_LAYOUTS: "myLayouts",
};

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
      this._modalRoot = this.ui?.coreLoopUI?.getElement?.("modal-root") ?? this.ui?.DOMElements?.modal_root ?? (typeof document !== "undefined" ? document.getElementById("modal-root") : null);
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
    const preservedUpgrades = game.upgradeset.getAllUpgrades().filter((u) => u.base_ecost && u.level > 0).length;
    const prestigeMultiplier = game.getPrestigeMultiplier ? game.getPrestigeMultiplier() : 1;

    const onCancel = () => this.hideModal(MODAL_IDS.PRESTIGE);
    const onConfirm = (confirmedMode) => {
      this.hideModal(MODAL_IDS.PRESTIGE);
      if (confirmedMode === "refund") {
        game.rebootActionDiscardExoticParticles();
      } else {
        game.rebootActionKeepExoticParticles();
      }
    };

    this._openLitModal(
      prestigeModalTemplate(
        { mode, totalEp, preservedUpgrades, prestigeMultiplier },
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
    if (!this._resolveModalRoot()) return Promise.resolve();

    const game = this.ui.game;
    game.pause();
    this.ui.stateManager.setVar("pause", true);

    return new Promise((resolve) => {
      const handleClose = (mode) => {
        if ((mode === "instant" || mode === "fast-forward") && game.engine) game.engine.runInstantCatchup();

        if (game) {
          game.paused = false;
          this.ui.stateManager.setVar("pause", false);
        }
        this.hideModal(MODAL_IDS.WELCOME_BACK);
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

      this._openLitModal(
        welcomeBackModalTemplate(
          payload,
          () => wrappedClose("instant"),
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
    this._settingsUnmount = ReactiveLitComponent.mountMultiStates(
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
    const keyHandler = (e) => {
      if (e.key === "Escape") {
        document.removeEventListener("keydown", keyHandler);
        this.hideModal(MODAL_IDS.SETTINGS);
      }
    };
    document.addEventListener("keydown", keyHandler);
    this._settingsKeyHandler = keyHandler;
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
      document.removeEventListener("keydown", this._settingsKeyHandler);
      this._settingsKeyHandler = null;
    }
    const game = this.ui?.game;
    if (game?.audio) {
      game.audio.stopTestSound();
      game.audio.warningManager?.stopWarningLoop?.();
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
      StorageUtils.set("reactorGameQuickStartShown", 1);
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
      game.ui?.stateManager?.setVar?.("pause", true);
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
    const list = this.ui.layoutStorageUI.getMyLayouts();
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
