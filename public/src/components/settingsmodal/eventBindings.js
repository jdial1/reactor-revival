import { StorageUtilsAsync } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { preferences } from "../../core/preferencesStore.js";
import { supabaseSave } from "../../services/SupabaseSave.js";
import { createSupabaseProvider, createGoogleDriveProvider } from "../../services/cloudSaveProvider.js";
import { bindEvents } from "../../utils/bindEvents.js";
import dataService from "../../services/dataService.js";

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
  if (overlay.querySelector("#setting-notifications") && "Notification" in window) {
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
