import { supabaseSave } from "../services/SupabaseSave.js";
import { safeGetItem, safeSetItem } from "../utils/util.js";

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
  createDOM() {
    if (this.overlay) return;
    const isMuted = safeGetItem("reactor_mute") === "true";
    const isReducedMotion = safeGetItem("reactor_reduced_motion") === "true";
    const hideUnaffordableUpgrades = safeGetItem("reactor_hide_unaffordable_upgrades", "true") !== "false";
    const hideUnaffordableResearch = safeGetItem("reactor_hide_unaffordable_research", "true") !== "false";
    const hideMaxUpgrades = safeGetItem("reactor_hide_max_upgrades", "true") !== "false";
    const hideMaxResearch = safeGetItem("reactor_hide_max_research", "true") !== "false";
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
<div class="settings-group">
<h3>Audio</h3>
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
<div class="settings-group">
<h3>Visuals</h3>
<label class="setting-row mech-switch-row">
<span>Reduced Motion</span>
<input type="checkbox" id="setting-motion" ${isReducedMotion ? "checked" : ""} style="display: none;">
${mechSwitch("setting-motion", isReducedMotion)}
</label>
<label class="setting-row mech-switch-row">
<span>Hide Unaffordable Upgrades</span>
<input type="checkbox" id="setting-hide-upgrades" ${hideUnaffordableUpgrades ? "checked" : ""} style="display: none;">
${mechSwitch("setting-hide-upgrades", hideUnaffordableUpgrades)}
</label>
<label class="setting-row mech-switch-row">
<span>Hide Unaffordable Research</span>
<input type="checkbox" id="setting-hide-research" ${hideUnaffordableResearch ? "checked" : ""} style="display: none;">
${mechSwitch("setting-hide-research", hideUnaffordableResearch)}
</label>
<label class="setting-row mech-switch-row">
<span>Hide Max Upgrades</span>
<input type="checkbox" id="setting-hide-max-upgrades" ${hideMaxUpgrades ? "checked" : ""} style="display: none;">
${mechSwitch("setting-hide-max-upgrades", hideMaxUpgrades)}
</label>
<label class="setting-row mech-switch-row">
<span>Hide Max Research</span>
<input type="checkbox" id="setting-hide-max-research" ${hideMaxResearch ? "checked" : ""} style="display: none;">
${mechSwitch("setting-hide-max-research", hideMaxResearch)}
</label>
</div>
<div class="settings-group">
<h3>Data</h3>
<div class="data-buttons">
<button class="pixel-btn" id="setting-export">Export</button>
<button class="pixel-btn" id="setting-import">Import</button>
<input type="file" id="setting-import-input" accept=".json" style="display: none;">
</div>
<div id="setting-cloud-saves" style="display:none; margin-top: 10px;">
<h4 style="font-size: 0.8rem; margin-bottom: 5px;">Cloud Saves</h4>
<div class="data-buttons">
<button class="pixel-btn" id="setting-save-cloud-1">Save Slot 1</button>
<button class="pixel-btn" id="setting-save-cloud-2">Save Slot 2</button>
<button class="pixel-btn" id="setting-save-cloud-3">Save Slot 3</button>
</div>
</div>
</div>
<div class="settings-group">
<h3>System</h3>
<label class="setting-row mech-switch-row">
<span>Update Notifications</span>
<input type="checkbox" id="setting-notifications" style="display: none;">
${mechSwitch("setting-notifications", false)}
</label>
</div>
<div class="settings-group">
<h3>Navigation</h3>
<div class="data-buttons">
<button class="pixel-btn" id="research_back_to_splash_btn">Quit Game</button>
</div>
</div>
<div class="settings-group">
<h3>About</h3>
<p style="font-size: 0.6rem; margin: 0.5rem 0;">Version: <span id="app_version">Loading...</span></p>
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
      exportBtn.addEventListener("click", () => {
        if (window.game && typeof window.game.saveGame === "function") {
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
      importInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const saveData = event.target.result;
              safeSetItem("reactorGameSave_1", saveData);
              if (window.game && typeof window.game.loadGame === "function") {
                window.game.loadGame(1).then(() => {
                  window.location.reload();
                });
              }
            } catch (error) {
              console.error("Failed to import save:", error);
            }
          };
          reader.readAsText(file);
        }
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

    if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
        const cloudSection = this.overlay.querySelector("#setting-cloud-saves");
        if (cloudSection) {
            cloudSection.style.display = "block";
            
            [1, 2, 3].forEach(slotId => {
                const btn = this.overlay.querySelector(`#setting-save-cloud-${slotId}`);
                if (btn) {
                    btn.addEventListener("click", async () => {
                        try {
                            btn.textContent = "Saving...";
                            btn.disabled = true;
                            if (window.game && typeof window.game.getSaveState === "function") {
                                const saveData = window.game.getSaveState();
                                await supabaseSave.saveGame(slotId, saveData);
                                btn.textContent = "Saved!";
                                setTimeout(() => { 
                                    btn.textContent = `Save Slot ${slotId}`; 
                                    btn.disabled = false; 
                                }, 2000);
                            }
                        } catch (e) {
                            console.error("Cloud save failed", e);
                            btn.textContent = "Error";
                            setTimeout(() => { 
                                btn.textContent = `Save Slot ${slotId}`; 
                                btn.disabled = false; 
                            }, 2000);
                        }
                    });
                }
            });
        }
    }
  }
}

export const settingsModal = new SettingsModal();
