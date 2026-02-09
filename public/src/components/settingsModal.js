import { supabaseSave } from "../services/SupabaseSave.js";
import { safeGetItem, safeSetItem, stringifySaveData, rotateAndWriteSlot1, setSlot1FromBackup } from "../utils/util.js";

class SettingsModal {
  constructor() {
    this.overlay = null;
    this.isVisible = false;
    this.handleKeyDown = this.handleKeyDown.bind(this);
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
    document.removeEventListener("keydown", this.handleKeyDown);
    if (window.game && window.game.audio) {
      window.game.audio.stopTestSound();
      window.game.audio.stopWarningLoop();
    }
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) menuBtn.classList.remove("active");
    const currentPageId = window.game?.router?.currentPageId;
    if (currentPageId) {
      const bottomNav = document.getElementById("bottom_nav");
      if (bottomNav) {
        const pageBtn = bottomNav.querySelector(`button[data-page="${currentPageId}"]`);
        if (pageBtn) pageBtn.classList.add("active");
      }
    }
  }
  handleKeyDown(e) {
    if (e.key === "Escape") {
      this.hide();
    }
  }
  async saveToHandle(handle) {
    if (!handle || !window.game?.getSaveState) return;
    try {
      const writable = await handle.createWritable();
      const data = stringifySaveData(window.game.getSaveState());
      await writable.write(data);
      await writable.close();
      console.log("[PWA] Saved directly to disk");
    } catch (e) {
      console.warn("[PWA] Lost permission to file handle", e);
      window.game.activeFileHandle = null;
    }
  }
  createDOM() {
    if (this.overlay) return;
    const isMuted = safeGetItem("reactor_mute") === "true";
    const isReducedMotion = safeGetItem("reactor_reduced_motion") === "true";
    const hideUnaffordableUpgrades = safeGetItem("reactor_hide_unaffordable_upgrades", "true") !== "false";
    const hideUnaffordableResearch = safeGetItem("reactor_hide_unaffordable_research", "true") !== "false";
    const hideMaxUpgrades = safeGetItem("reactor_hide_max_upgrades", "true") !== "false";
    const hideMaxResearch = safeGetItem("reactor_hide_max_research", "true") !== "false";
    const hideOtherDoctrineUpgrades = safeGetItem("reactor_hide_other_doctrine_upgrades", "false") === "true";
    const heatFlowVisible = safeGetItem("reactor_heat_flow_visible", "true") !== "false";
    const heatMapVisible = safeGetItem("reactor_heat_map_visible", "false") === "true";
    const numberFormat = safeGetItem("number_format", "default");
    const masterVol = parseFloat(safeGetItem("reactor_volume_master", "0.25"));
    const effectsVol = parseFloat(safeGetItem("reactor_volume_effects", "0.50"));
    const alertsVol = parseFloat(safeGetItem("reactor_volume_alerts", "0.50"));
    const systemVol = parseFloat(safeGetItem("reactor_volume_system", "0.50"));
    const ambienceVol = parseFloat(safeGetItem("reactor_volume_ambience", "0.12"));
    const volToStep = (v) => Math.min(10, Math.round(v * 10));
    const stepToVal = (s) => s / 10;
    const volumeStepper = (key, value) => {
      const step = volToStep(value);
      const blocks = Array.from({ length: 11 }, (_, i) =>
        `<button type="button" class="volume-block" data-step="${i}" aria-label="${i * 10}%" ${i <= step ? "data-active" : ""}></button>`
      ).join("");
      return `<div class="volume-stepper" data-volume-key="${key}"><div class="volume-blocks" role="slider" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${step}" tabindex="0">${blocks}</div><span class="volume-stepper-val">${step * 10}%</span></div>`;
    };
    const mechSwitch = (id, checked) =>
      `<button type="button" class="mech-switch" role="switch" aria-checked="${checked}" data-checkbox-id="${id}" tabindex="0"><span class="mech-switch-off">OFF</span><span class="mech-switch-track"><span class="mech-switch-thumb"></span></span><span class="mech-switch-on">ON</span></button>`;
    this.overlay = document.createElement("div");
    this.overlay.className = "settings-modal-overlay";
    this.overlay.innerHTML = `
<div class="settings-modal pixel-panel">
<div class="settings-content">
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>Audio</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<label class="setting-row mute-toggle">
<span>Mute</span>
<button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
<span class="mute-icon">${isMuted ? '🔇' : '🔊'}</span>
</button>
<input type="checkbox" id="setting-mute" ${isMuted ? "checked" : ""} style="display: none;">
</label>
<div class="volume-setting">
<label class="volume-label">Master Volume</label>
${volumeStepper("master", masterVol)}
</div>
<div class="volume-setting">
<label class="volume-label">Effects Volume</label>
${volumeStepper("effects", effectsVol)}
</div>
<div class="volume-setting">
<label class="volume-label">Alerts Volume</label>
${volumeStepper("alerts", alertsVol)}
</div>
<div class="volume-setting">
<label class="volume-label">System Volume</label>
${volumeStepper("system", systemVol)}
</div>
<div class="volume-setting">
<label class="volume-label">Background Volume</label>
${volumeStepper("ambience", ambienceVol)}
</div>
</div>
</div>
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>Visuals</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<table class="settings-visuals-table">
<tr>
<td class="settings-visuals-label"><span>Reduced Motion</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-motion" ${isReducedMotion ? "checked" : ""} style="display: none;">${mechSwitch("setting-motion", isReducedMotion)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Hide Unaffordable Upgrades</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-hide-upgrades" ${hideUnaffordableUpgrades ? "checked" : ""} style="display: none;">${mechSwitch("setting-hide-upgrades", hideUnaffordableUpgrades)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Hide Unaffordable Research</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-hide-research" ${hideUnaffordableResearch ? "checked" : ""} style="display: none;">${mechSwitch("setting-hide-research", hideUnaffordableResearch)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Hide Max Upgrades</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-hide-max-upgrades" ${hideMaxUpgrades ? "checked" : ""} style="display: none;">${mechSwitch("setting-hide-max-upgrades", hideMaxUpgrades)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Hide Max Research</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-hide-max-research" ${hideMaxResearch ? "checked" : ""} style="display: none;">${mechSwitch("setting-hide-max-research", hideMaxResearch)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Hide Other Doctrine Upgrades</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-hide-other-doctrine" ${hideOtherDoctrineUpgrades ? "checked" : ""} style="display: none;">${mechSwitch("setting-hide-other-doctrine", hideOtherDoctrineUpgrades)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Heat flow arrows</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-heat-flow" ${heatFlowVisible ? "checked" : ""} style="display: none;">${mechSwitch("setting-heat-flow", heatFlowVisible)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Heat map</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-heat-map" ${heatMapVisible ? "checked" : ""} style="display: none;">${mechSwitch("setting-heat-map", heatMapVisible)}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Debug overlay (flow arrows)</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-debug-overlay" ${safeGetItem("reactor_debug_overlay") === "true" ? "checked" : ""} style="display: none;">${mechSwitch("setting-debug-overlay", safeGetItem("reactor_debug_overlay") === "true")}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Number format</span></td>
<td class="settings-visuals-control"><select id="setting-number-format" class="pixel-select"><option value="default" ${numberFormat === "default" ? "selected" : ""}>1,234 K</option><option value="scientific" ${numberFormat === "scientific" ? "selected" : ""}>1.23e3</option></select></td>
</tr>
</table>
</div>
</div>
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>Data</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<div class="data-buttons">
<button class="pixel-btn" id="setting-export">Export</button>
<button class="pixel-btn" id="setting-import">Import</button>
<input type="file" id="setting-import-input" accept=".json" style="display: none;">
</div>
<div id="setting-cloud-saves" class="settings-cloud-saves" style="display: none;">
<h4 class="settings-cloud-heading">Cloud Saves</h4>
<div class="cloud-slot-list">
<div class="cloud-slot-row" data-slot="1">
<div class="cloud-slot-info">
<span class="cloud-slot-label">Slot 1</span>
<span class="cloud-slot-meta">—</span>
</div>
<div class="cloud-slot-actions">
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-save" data-slot="1">Save</button>
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-load" data-slot="1" disabled>Load</button>
</div>
</div>
<div class="cloud-slot-row" data-slot="2">
<div class="cloud-slot-info">
<span class="cloud-slot-label">Slot 2</span>
<span class="cloud-slot-meta">—</span>
</div>
<div class="cloud-slot-actions">
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-save" data-slot="2">Save</button>
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-load" data-slot="2" disabled>Load</button>
</div>
</div>
<div class="cloud-slot-row" data-slot="3">
<div class="cloud-slot-info">
<span class="cloud-slot-label">Slot 3</span>
<span class="cloud-slot-meta">—</span>
</div>
<div class="cloud-slot-actions">
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-save" data-slot="3">Save</button>
<button type="button" class="pixel-btn pixel-btn-small setting-cloud-load" data-slot="3" disabled>Load</button>
</div>
</div>
</div>
</div>
</div>
</div>
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>System</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<table class="settings-visuals-table">
<tr>
<td class="settings-visuals-label"><span>Force No-SAB</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-force-no-sab" ${safeGetItem("reactor_force_no_sab") === "true" ? "checked" : ""} style="display: none;">${mechSwitch("setting-force-no-sab", safeGetItem("reactor_force_no_sab") === "true")}</label></td>
</tr>
<tr>
<td class="settings-visuals-label"><span>Update Notifications</span></td>
<td class="settings-visuals-control"><label class="mech-switch-row"><input type="checkbox" id="setting-notifications" style="display: none;">${mechSwitch("setting-notifications", false)}</label></td>
</tr>
</table>
</div>
</div>
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>Navigation</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<div class="data-buttons">
<button class="pixel-btn" id="research_back_to_splash_btn">Quit Game</button>
</div>
</div>
</div>
<div class="settings-group settings-group-collapsed">
<button type="button" class="settings-group-header" aria-expanded="false"><h3>About</h3><span class="settings-group-chevron" aria-hidden="true"></span></button>
<div class="settings-group-body">
<p style=" margin: 0.5rem 0;font-size: 0.6rem;">Version: <span id="app_version">Loading...</span></p>
<p style=" margin: 0.5rem 0;font-size: 0.6rem;">Display Mode: <span id="app_display_mode">Detecting...</span></p>
</div>
</div>
</div>
</div>
`;
    document.body.appendChild(this.overlay);

    const playClick = () => {
      if (window.game && window.game.audio) window.game.audio.play("click");
    };

    this.overlay.addEventListener("click", (e) => {
      if (e.target === this.overlay) {
        this.hide();
      }
    });

    this.overlay.addEventListener("click", (e) => {
      const header = e.target.closest(".settings-group-header");
      if (header) {
        e.preventDefault();
        const group = header.closest(".settings-group");
        if (group) {
          const collapsed = group.classList.toggle("settings-group-collapsed");
          header.setAttribute("aria-expanded", String(!collapsed));
          playClick();
        }
      }
    });

    const muteBtn = this.overlay.querySelector("#setting-mute-btn");
    const muteCheckbox = this.overlay.querySelector("#setting-mute");
    if (muteBtn && muteCheckbox) {
      muteBtn.addEventListener("click", () => {
        muteCheckbox.checked = !muteCheckbox.checked;
        safeSetItem("reactor_mute", muteCheckbox.checked ? "true" : "false");
        const icon = muteBtn.querySelector(".mute-icon");
        if (icon) icon.textContent = muteCheckbox.checked ? "🔇" : "🔊";
        if (window.game && window.game.audio) {
          window.game.audio.toggleMute(muteCheckbox.checked);
        }
        playClick();
      });
    }

    const storageKeys = { master: "reactor_volume_master", effects: "reactor_volume_effects", alerts: "reactor_volume_alerts", system: "reactor_volume_system", ambience: "reactor_volume_ambience" };
    this.overlay.querySelectorAll(".volume-stepper").forEach((stepper) => {
      const key = stepper.dataset.volumeKey;
      const blocks = stepper.querySelector(".volume-blocks");
      const valSpan = stepper.querySelector(".volume-stepper-val");
      const updateStepper = (step) => {
        const value = stepToVal(step);
        blocks.setAttribute("aria-valuenow", step);
        blocks.querySelectorAll(".volume-block").forEach((b, i) => {
          if (i <= step) b.setAttribute("data-active", "");
          else b.removeAttribute("data-active");
        });
        if (valSpan) valSpan.textContent = `${step * 10}%`;
        safeSetItem(storageKeys[key], value.toString());
        if (window.game && window.game.audio) window.game.audio.setVolume(key, value);
      };
      blocks.querySelectorAll(".volume-block").forEach((block) => {
        block.addEventListener("click", (e) => {
          e.stopPropagation();
          const step = parseInt(block.dataset.step, 10);
          updateStepper(step);
          playClick();
        });
      });
      blocks.addEventListener("keydown", (e) => {
        const step = parseInt(blocks.getAttribute("aria-valuenow"), 10);
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          if (step > 0) {
            updateStepper(step - 1);
            playClick();
          }
        } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          if (step < 10) {
            updateStepper(step + 1);
            playClick();
          }
        }
      });
    });

    const syncMechSwitch = (checkboxId, checked) => {
      const btn = this.overlay.querySelector(`.mech-switch[data-checkbox-id="${checkboxId}"]`);
      if (btn) {
        btn.setAttribute("aria-checked", checked);
        btn.classList.toggle("mech-switch-on-active", checked);
      }
    };

    const setupMechSwitch = (checkboxId, onChange) => {
      const checkbox = this.overlay.querySelector(`#${checkboxId}`);
      const btn = this.overlay.querySelector(`.mech-switch[data-checkbox-id="${checkboxId}"]`);
      if (!checkbox || !btn) return;
      syncMechSwitch(checkboxId, checkbox.checked);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        checkbox.checked = !checkbox.checked;
        syncMechSwitch(checkboxId, checkbox.checked);
        playClick();
        onChange(checkbox.checked);
      });
    };

    setupMechSwitch("setting-motion", (checked) => {
      safeSetItem("reactor_reduced_motion", checked ? "true" : "false");
      document.documentElement.style.setProperty("--prefers-reduced-motion", checked ? "reduce" : "no-preference");
    });

    setupMechSwitch("setting-hide-upgrades", () => {
      safeSetItem("reactor_hide_unaffordable_upgrades", this.overlay.querySelector("#setting-hide-upgrades").checked ? "true" : "false");
      if (window.game && window.game.upgradeset) window.game.upgradeset.check_affordability(window.game);
    });

    setupMechSwitch("setting-hide-research", () => {
      safeSetItem("reactor_hide_unaffordable_research", this.overlay.querySelector("#setting-hide-research").checked ? "true" : "false");
      if (window.game && window.game.upgradeset) window.game.upgradeset.check_affordability(window.game);
    });

    setupMechSwitch("setting-hide-max-upgrades", () => {
      safeSetItem("reactor_hide_max_upgrades", this.overlay.querySelector("#setting-hide-max-upgrades").checked ? "true" : "false");
      if (window.game && window.game.upgradeset) window.game.upgradeset.check_affordability(window.game);
    });

    setupMechSwitch("setting-hide-max-research", () => {
      safeSetItem("reactor_hide_max_research", this.overlay.querySelector("#setting-hide-max-research").checked ? "true" : "false");
      if (window.game && window.game.upgradeset) window.game.upgradeset.check_affordability(window.game);
    });

    setupMechSwitch("setting-hide-other-doctrine", () => {
      safeSetItem("reactor_hide_other_doctrine_upgrades", this.overlay.querySelector("#setting-hide-other-doctrine").checked ? "true" : "false");
      if (window.game && window.game.upgradeset) window.game.upgradeset.check_affordability(window.game);
    });

    setupMechSwitch("setting-heat-flow", (checked) => {
      safeSetItem("reactor_heat_flow_visible", checked ? "true" : "false");
    });

    setupMechSwitch("setting-heat-map", (checked) => {
      safeSetItem("reactor_heat_map_visible", checked ? "true" : "false");
    });

    setupMechSwitch("setting-debug-overlay", (checked) => {
      safeSetItem("reactor_debug_overlay", checked ? "true" : "false");
    });

    setupMechSwitch("setting-force-no-sab", (checked) => {
      safeSetItem("reactor_force_no_sab", checked ? "true" : "false");
      if (window.game?.engine && typeof window.game.engine.setForceNoSAB === "function") {
        window.game.engine.setForceNoSAB(checked);
      }
    });

    const numberFormatSelect = this.overlay.querySelector("#setting-number-format");
    if (numberFormatSelect) {
      numberFormatSelect.addEventListener("change", () => {
        const val = numberFormatSelect.value;
        safeSetItem("number_format", val);
        if (window.game?.ui?.runUpdateInterfaceLoop) window.game.ui.runUpdateInterfaceLoop();
      });
    }

    this.overlay.querySelectorAll(".mech-switch-row").forEach((row) => {
      const labelSpan = row.querySelector("span");
      const sw = row.querySelector(".mech-switch");
      if (labelSpan && sw) {
        labelSpan.addEventListener("click", (e) => {
          e.preventDefault();
          sw.click();
        });
      }
    });

    const exportBtn = this.overlay.querySelector("#setting-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        if (!window.game || typeof window.game.getSaveState !== "function") return;

        if ('showSaveFilePicker' in window) {
          try {
            const opts = {
              types: [{
                description: 'Reactor Save File',
                accept: { 'application/json': ['.reactor'] },
              }],
              suggestedName: `reactor-save-${new Date().toISOString().split("T")[0]}.reactor`
            };
            const handle = await window.showSaveFilePicker(opts);
            window.game.activeFileHandle = handle;
            await this.saveToHandle(handle);
          } catch (err) {
            if (err.name !== 'AbortError') console.warn('[PWA] Save picker error:', err);
          }
        } else {
          window.game.saveGame();
          const slot = parseInt(safeGetItem("reactorCurrentSaveSlot", "1"), 10);
          const saveData = safeGetItem(`reactorGameSave_${slot}`) || safeGetItem("reactorGameSave");
          if (saveData) {
            const blob = new Blob([saveData], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `reactor-save-${new Date().toISOString().split("T")[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      });
    }

    const importBtn = this.overlay.querySelector("#setting-import");
    const importInput = this.overlay.querySelector("#setting-import-input");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", () => {
        importInput.click();
      });
      importInput.addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const saveData = event.target.result;
            rotateAndWriteSlot1(saveData);
            if (!window.game || typeof window.game.loadGame !== "function") return;
            let result = await window.game.loadGame(1);
            if (result && typeof result === "object" && result.backupAvailable && window.showLoadBackupModal) {
              const useBackup = await window.showLoadBackupModal();
              if (useBackup) {
                setSlot1FromBackup();
                result = await window.game.loadGame(1);
              }
            }
            if (result === true) window.location.reload();
          } catch (error) {
            console.error("Failed to import save:", error);
          }
        };
        reader.readAsText(file);
      });
    }

    const notifCheckbox = this.overlay.querySelector("#setting-notifications");
    if (notifCheckbox) {
      if ('Notification' in window) {
        notifCheckbox.checked = Notification.permission === 'granted';
        setupMechSwitch("setting-notifications", async (checked) => {
          if (checked) {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
              notifCheckbox.checked = true;
              syncMechSwitch("setting-notifications", true);
              if ('serviceWorker' in navigator) {
                try {
                  const reg = await navigator.serviceWorker.ready;
                  if (reg.periodicSync) {
                    await reg.periodicSync.register('reactor-periodic-sync', {
                      minInterval: 60 * 60 * 1000
                    });
                  }
                } catch (err) { console.log(err); }
              }
            } else {
              notifCheckbox.checked = false;
              syncMechSwitch("setting-notifications", false);
              alert("Notifications blocked. Please enable them in your browser settings.");
            }
          } else {
            alert("To disable notifications completely, you must reset permissions in your browser settings.");
            notifCheckbox.checked = Notification.permission === 'granted';
            syncMechSwitch("setting-notifications", notifCheckbox.checked);
          }
        });
        syncMechSwitch("setting-notifications", notifCheckbox.checked);
      } else {
        if (notifCheckbox.closest('.setting-row')) {
          notifCheckbox.closest('.setting-row').style.display = 'none';
        }
      }
    }


    const backToSplashBtn = this.overlay.querySelector("#research_back_to_splash_btn");
    if (backToSplashBtn) {
      backToSplashBtn.addEventListener("click", () => {
        window.location.href = window.location.origin + window.location.pathname;
      });
    }

    const versionSpan = this.overlay.querySelector("#app_version");
    if (versionSpan) {
      fetch("version.json")
        .then(res => res.json())
        .then(data => {
          versionSpan.textContent = data.version || "Unknown";
        })
        .catch(() => {
          versionSpan.textContent = "Unknown";
        });
    }

    const displayModeSpan = this.overlay.querySelector("#app_display_mode");
    if (displayModeSpan) {
      const modes = ["standalone", "minimal-ui", "browser"];
      const activeMode = modes.find(m => window.matchMedia(`(display-mode: ${m})`).matches) || "browser";
      displayModeSpan.textContent = activeMode;
    }

    if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
        const cloudSection = this.overlay.querySelector("#setting-cloud-saves");
        if (cloudSection) {
            cloudSection.style.display = "block";
            const formatCloudDate = (ts) => {
                if (!ts) return "—";
                const date = new Date(Number(ts));
                const diffMs = Date.now() - date;
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                if (diffHours < 1) return "Just now";
                if (diffHours < 24) return `${diffHours}h ago`;
                if (diffDays < 7) return `${diffDays}d ago`;
                return date.toLocaleDateString();
            };
            const refreshCloudSlots = async () => {
                let list = [];
                try {
                    list = await supabaseSave.getSaves();
                } catch (e) {
                    return;
                }
                const bySlot = new Map(list.map(s => [s.slot_id, s]));
                [1, 2, 3].forEach(slotId => {
                    const row = this.overlay.querySelector(`.cloud-slot-row[data-slot="${slotId}"]`);
                    if (!row) return;
                    const meta = row.querySelector(".cloud-slot-meta");
                    const saveBtn = row.querySelector(".setting-cloud-save[data-slot=\"" + slotId + "\"]");
                    const loadBtn = row.querySelector(".setting-cloud-load[data-slot=\"" + slotId + "\"]");
                    const slotData = bySlot.get(slotId);
                    if (meta) meta.textContent = slotData ? formatCloudDate(slotData.timestamp) : "—";
                    if (loadBtn) loadBtn.disabled = !slotData;
                });
            };
            refreshCloudSlots();
            this.overlay.querySelectorAll(".setting-cloud-save").forEach(btn => {
                const slotId = parseInt(btn.dataset.slot, 10);
                btn.addEventListener("click", async () => {
                    if (!window.game || typeof window.game.getSaveState !== "function") return;
                    const label = btn.textContent;
                    btn.textContent = "Saving...";
                    btn.disabled = true;
                    try {
                        await supabaseSave.saveGame(slotId, window.game.getSaveState());
                        btn.textContent = "Saved";
                        await refreshCloudSlots();
                        setTimeout(() => {
                            btn.textContent = label;
                            btn.disabled = false;
                        }, 1500);
                    } catch (e) {
                        btn.textContent = "Error";
                        setTimeout(() => {
                            btn.textContent = label;
                            btn.disabled = false;
                        }, 2000);
                    }
                    playClick();
                });
            });
            this.overlay.querySelectorAll(".setting-cloud-load").forEach(btn => {
                const slotId = parseInt(btn.dataset.slot, 10);
                btn.addEventListener("click", async () => {
                    if (btn.disabled) return;
                    let list = [];
                    try {
                        list = await supabaseSave.getSaves();
                    } catch (e) {
                        return;
                    }
                    const slotData = list.find(s => s.slot_id === slotId);
                    if (!slotData || !slotData.save_data) return;
                    safeSetItem(`reactorGameSave_${slotId}`, slotData.save_data);
                    const loaded = await window.game.loadGame(slotId);
                    if (loaded) window.location.reload();
                    playClick();
                });
            });
        }
    }
  }
}

export const settingsModal = new SettingsModal();
