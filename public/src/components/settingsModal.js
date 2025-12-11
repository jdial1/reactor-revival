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
<button class="pixel-btn" id="research_google_signin_btn">
<div class="google-signin-container">
<svg width="24" height="24" viewBox="0 0 24 24" class="google-icon">
<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
</svg>
<span>Google Sign In</span>
</div>
</button>
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

    const googleSignInBtn = this.overlay.querySelector("#research_google_signin_btn");
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener("click", () => {
        if (window.googleDriveSave) {
          window.googleDriveSave.signIn();
        }
      });
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
  }
}

