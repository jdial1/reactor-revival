import { supabaseSave } from "../services/SupabaseSave.js";

export class SettingsModal {
  constructor() {
    this.overlay = null;
  }
  show() {
    this.createDOM();
    this.overlay.classList.remove("hidden");
  }
  hide() {
    if (this.overlay) {
      if (window.game && window.game.audio) {
        window.game.audio.stopTestSound();
        window.game.audio.stopWarningLoop();
      }
      this.overlay.classList.add("hidden");
      setTimeout(() => {
        if (this.overlay) {
          this.overlay.remove();
          this.overlay = null;
        }
      }, 200);
    }
  }
  createDOM() {
    if (this.overlay) return;
    const isMuted = localStorage.getItem("reactor_mute") === "true";
    const isReducedMotion = localStorage.getItem("reactor_reduced_motion") === "true";
    const hideUnaffordableUpgrades = localStorage.getItem("reactor_hide_unaffordable_upgrades") !== "false";
    const hideUnaffordableResearch = localStorage.getItem("reactor_hide_unaffordable_research") !== "false";
    const hideMaxUpgrades = localStorage.getItem("reactor_hide_max_upgrades") !== "false";
    const hideMaxResearch = localStorage.getItem("reactor_hide_max_research") !== "false";
    const masterVol = parseFloat(localStorage.getItem("reactor_volume_master") || "0.25");
    const effectsVol = parseFloat(localStorage.getItem("reactor_volume_effects") || "0.50");
    const alertsVol = parseFloat(localStorage.getItem("reactor_volume_alerts") || "0.50");
    const systemVol = parseFloat(localStorage.getItem("reactor_volume_system") || "0.50");
    const ambienceVol = parseFloat(localStorage.getItem("reactor_volume_ambience") || "0.12");
    this.overlay = document.createElement("div");
    this.overlay.className = "settings-modal-overlay";
    this.overlay.innerHTML = `
<div class="settings-modal pixel-panel">
<div class="settings-header">
<h2>Settings</h2>
<button class="close-btn" id="settings-close" aria-label="Close Settings">×</button>
</div>
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
<label for="setting-volume-master" class="volume-label">Master Volume</label>
<div class="volume-control">
<input type="range" id="setting-volume-master" min="0" max="1" step="0.01" value="${masterVol}">
</div>
</div>
<div class="volume-setting">
<label for="setting-volume-effects" class="volume-label">Effects Volume</label>
<div class="volume-control">
<input type="range" id="setting-volume-effects" min="0" max="1" step="0.01" value="${effectsVol}">
</div>
</div>
<div class="volume-setting">
<label for="setting-volume-alerts" class="volume-label">Alerts Volume</label>
<div class="volume-control">
<input type="range" id="setting-volume-alerts" min="0" max="1" step="0.01" value="${alertsVol}">
</div>
</div>
<div class="volume-setting">
<label for="setting-volume-system" class="volume-label">System Volume</label>
<div class="volume-control">
<input type="range" id="setting-volume-system" min="0" max="1" step="0.01" value="${systemVol}">
</div>
</div>
<div class="volume-setting">
<label for="setting-volume-ambience" class="volume-label">Background Volume</label>
<div class="volume-control">
<input type="range" id="setting-volume-ambience" min="0" max="1" step="0.01" value="${ambienceVol}">
</div>
</div>
</div>
<div class="settings-group">
<h3>Visuals</h3>
<label class="setting-row">
<span>Reduced Motion</span>
<input type="checkbox" id="setting-motion" ${isReducedMotion ? "checked" : ""}>
</label>
<label class="setting-row">
    <span>Hide Unaffordable Upgrades</span>
    <input type="checkbox" id="setting-hide-upgrades" ${hideUnaffordableUpgrades ? "checked" : ""}>
</label>
<label class="setting-row">
    <span>Hide Unaffordable Research</span>
    <input type="checkbox" id="setting-hide-research" ${hideUnaffordableResearch ? "checked" : ""}>
</label>
<label class="setting-row">
    <span>Hide Max Upgrades</span>
    <input type="checkbox" id="setting-hide-max-upgrades" ${hideMaxUpgrades ? "checked" : ""}>
</label>
<label class="setting-row">
    <span>Hide Max Research</span>
    <input type="checkbox" id="setting-hide-max-research" ${hideMaxResearch ? "checked" : ""}>
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
<label class="setting-row" style="cursor: pointer;">
<span>Update Notifications</span>
<input type="checkbox" id="setting-notifications">
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

    const closeBtn = this.overlay.querySelector("#settings-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this.hide());
    }

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
        localStorage.setItem("reactor_mute", muteCheckbox.checked ? "true" : "false");
        const icon = muteBtn.querySelector(".mute-icon");
        if (icon) {
          icon.textContent = muteCheckbox.checked ? "🔇" : "🔊";
        }
        if (window.game && window.game.audio) {
          window.game.audio.toggleMute(muteCheckbox.checked);
        }
      });
    }

    const masterVolSlider = this.overlay.querySelector("#setting-volume-master");
    if (masterVolSlider) {
      masterVolSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem("reactor_volume_master", value.toString());
        if (window.game && window.game.audio) {
          window.game.audio.setVolume("master", value);
        }
      });
    }

    const effectsVolSlider = this.overlay.querySelector("#setting-volume-effects");
    if (effectsVolSlider) {
      effectsVolSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem("reactor_volume_effects", value.toString());
        if (window.game && window.game.audio) {
          window.game.audio.setVolume("effects", value);
        }
      });
    }

    const alertsVolSlider = this.overlay.querySelector("#setting-volume-alerts");
    if (alertsVolSlider) {
      alertsVolSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem("reactor_volume_alerts", value.toString());
        if (window.game && window.game.audio) {
          window.game.audio.setVolume("alerts", value);
        }
      });
    }

    const systemVolSlider = this.overlay.querySelector("#setting-volume-system");
    if (systemVolSlider) {
      systemVolSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem("reactor_volume_system", value.toString());
        if (window.game && window.game.audio) {
          window.game.audio.setVolume("system", value);
        }
      });
    }

    const ambienceVolSlider = this.overlay.querySelector("#setting-volume-ambience");
    if (ambienceVolSlider) {
      ambienceVolSlider.addEventListener("input", (e) => {
        const value = parseFloat(e.target.value);
        localStorage.setItem("reactor_volume_ambience", value.toString());
        if (window.game && window.game.audio) {
          window.game.audio.setVolume("ambience", value);
        }
      });
    }

    const motionCheckbox = this.overlay.querySelector("#setting-motion");
    if (motionCheckbox) {
      motionCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("reactor_reduced_motion", e.target.checked ? "true" : "false");
        document.documentElement.style.setProperty("--prefers-reduced-motion", e.target.checked ? "reduce" : "no-preference");
      });
    }

    const hideUpgradesCheckbox = this.overlay.querySelector("#setting-hide-upgrades");
    if (hideUpgradesCheckbox) {
      hideUpgradesCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("reactor_hide_unaffordable_upgrades", e.target.checked ? "true" : "false");
        if (window.game && window.game.upgradeset) {
          window.game.upgradeset.check_affordability(window.game);
        }
      });
    }

    const hideResearchCheckbox = this.overlay.querySelector("#setting-hide-research");
    if (hideResearchCheckbox) {
      hideResearchCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("reactor_hide_unaffordable_research", e.target.checked ? "true" : "false");
        if (window.game && window.game.upgradeset) {
          window.game.upgradeset.check_affordability(window.game);
        }
      });
    }

    const hideMaxUpgradesCheckbox = this.overlay.querySelector("#setting-hide-max-upgrades");
    if (hideMaxUpgradesCheckbox) {
      hideMaxUpgradesCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("reactor_hide_max_upgrades", e.target.checked ? "true" : "false");
        if (window.game && window.game.upgradeset) {
          window.game.upgradeset.check_affordability(window.game);
        }
      });
    }

    const hideMaxResearchCheckbox = this.overlay.querySelector("#setting-hide-max-research");
    if (hideMaxResearchCheckbox) {
      hideMaxResearchCheckbox.addEventListener("change", (e) => {
        localStorage.setItem("reactor_hide_max_research", e.target.checked ? "true" : "false");
        if (window.game && window.game.upgradeset) {
          window.game.upgradeset.check_affordability(window.game);
        }
      });
    }

    const exportBtn = this.overlay.querySelector("#setting-export");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        if (window.game && typeof window.game.saveGame === "function") {
          window.game.saveGame();
          const saveData = localStorage.getItem("reactorGameSave") || localStorage.getItem("reactorGameSave_1");
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
              localStorage.setItem("reactorGameSave_1", saveData);
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
        notifCheckbox.addEventListener('change', async (e) => {
          if (e.target.checked) {
            const result = await Notification.requestPermission();
            if (result === 'granted') {
              notifCheckbox.checked = true;
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
              alert("Notifications blocked. Please enable them in your browser settings.");
            }
          } else {
            alert("To disable notifications completely, you must reset permissions in your browser settings.");
            notifCheckbox.checked = Notification.permission === 'granted';
          }
        });
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

