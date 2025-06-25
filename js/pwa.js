import { numFormat as fmt } from "./util.js";

let deferredPrompt;
const installButton = document.getElementById("install_pwa_btn");

// Splash Screen Manager
class SplashScreenManager {
  constructor() {
    this.splashScreen = document.getElementById("splash-screen");
    this.statusElement = document.getElementById("splash-status");
    this.loadingSteps = [
      { id: "init", message: "Initializing..." },
      { id: "ui", message: "Loading UI..." },
      { id: "game", message: "Initializing game..." },
      { id: "parts", message: "Loading parts..." },
      { id: "upgrades", message: "Loading upgrades..." },
      { id: "objectives", message: "Setting up objectives..." },
      { id: "engine", message: "Starting engine..." },
      { id: "ready", message: "Ready!" },
    ];
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;

    // Initialize splash screen stats
    this.initializeSplashStats();

    // Listen for service worker messages
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }

    // Listen for beforeinstallprompt event
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      this.installPrompt = e;
      console.log("Install prompt captured");
    });
  }

  /**
   * Initialize splash screen with game stats (version and total played time)
   */
  async initializeSplashStats() {
    if (!this.splashScreen) return;

    // Get version from version.json
    let version = "Unknown";
    try {
      const versionResponse = await fetch("./version.json");
      const versionData = await versionResponse.json();
      version = versionData.version || "Unknown";
    } catch (error) {
      console.warn("Could not load version info:", error);
    }

    // Get total played time from saved game
    let totalPlayedTime = "0s";
    try {
      const savedDataJSON = localStorage.getItem("reactorGameSave");
      if (savedDataJSON) {
        const savedData = JSON.parse(savedDataJSON);
        const totalMs = savedData.total_played_time || 0;
        totalPlayedTime = this.formatTime(totalMs);
      }
    } catch (error) {
      console.warn("Could not load played time:", error);
    }

    // Add stats to splash screen
    this.addSplashStats(version, totalPlayedTime);
  }

  /**
   * Add stats display to splash screen
   */
  addSplashStats(version, totalPlayedTime) {
    // Remove existing stats if any
    const existingStats = this.splashScreen.querySelector(".splash-stats");
    if (existingStats) {
      existingStats.remove();
    }

    // Version at bottom only (removed total played time from main screen)
    const versionDiv = document.createElement("div");
    versionDiv.className = "splash-version";
    versionDiv.textContent = `v${version}`;

    // Insert version at the very bottom
    this.splashScreen.appendChild(versionDiv);
  }

  /**
   * Format time in milliseconds to human readable format with smaller units
   */
  formatTime(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / (1000 * 60)) % 60;
    const h = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (d > 0)
      return `${d}<span class="time-unit">d</span> ${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (h > 0)
      return `${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (m > 0)
      return `${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    return `${s}<span class="time-unit">s</span>`;
  }

  updateStatus(message) {
    if (this.statusElement) {
      this.statusElement.textContent = message;
    }
  }

  nextStep() {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      this.updateStatus(step.message);
    }
  }

  setStep(stepId) {
    const stepIndex = this.loadingSteps.findIndex((step) => step.id === stepId);
    if (stepIndex !== -1) {
      this.currentStep = stepIndex;
      const step = this.loadingSteps[this.currentStep];
      this.updateStatus(step.message);
    }
  }

  setSubStep(message) {
    this.updateStatus(message);
  }

  showStartOptions(canLoadGame = true) {
    if (this.splashScreen && !this.isReady) {
      // Hide spinner and Ready! text
      const spinner = this.splashScreen.querySelector(".splash-spinner");
      if (spinner) spinner.style.display = "none";
      if (this.statusElement) this.statusElement.style.display = "none";

      // Remove fallback timeout if present (so splash never auto-hides)
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }

      // Create or update the start options section
      let startOptionsSection = this.splashScreen.querySelector(
        ".splash-start-options"
      );
      if (!startOptionsSection) {
        startOptionsSection = document.createElement("div");
        startOptionsSection.className = "splash-start-options";
        this.splashScreen.appendChild(startOptionsSection);
      }

      // Clear existing content
      startOptionsSection.innerHTML = "";

      // New Game button
      const newGameButton = document.createElement("button");
      newGameButton.id = "splash-new-game-btn";
      newGameButton.className = "splash-btn splash-btn-start";
      newGameButton.textContent = "New Game";
      startOptionsSection.appendChild(newGameButton);

      const saveDataJSON = localStorage.getItem("reactorGameSave");

      // Only show the "Load Game" button if it's a valid option
      if (canLoadGame && saveDataJSON) {
        const loadGameButton = document.createElement("button");
        loadGameButton.id = "splash-load-game-btn";
        loadGameButton.className = "splash-btn splash-btn-load";
        loadGameButton.onclick = () => this.hide();
        // Button label
        const labelDiv = document.createElement("div");
        labelDiv.textContent = "Load Game";
        labelDiv.style.fontWeight = "bold";
        labelDiv.style.fontSize = "1.1em";
        loadGameButton.appendChild(labelDiv);
        // Game details
        try {
          const saveData = JSON.parse(saveDataJSON);
          const detailsDiv = document.createElement("div");
          detailsDiv.className = "splash-save-details";

          // Format played time
          const totalPlayedMs = saveData.total_played_time || 0;
          const playedTimeStr = this.formatTime(totalPlayedMs);

          detailsDiv.innerHTML =
            `<div><span class="save-detail-label">Money:</span> <span class="save-detail-value">$${fmt(
              saveData.current_money ?? 0
            )}</span></div>` +
            `<div><span class="save-detail-label">Cells:</span> <span class="save-detail-value">${
              saveData.tiles ? saveData.tiles.length : 0
            }</span></div>` +
            `<div><span class="save-detail-label">Played:</span> <span class="save-detail-value">${playedTimeStr}</span></div>`;
          loadGameButton.appendChild(detailsDiv);
        } catch (e) {}
        startOptionsSection.appendChild(loadGameButton);
      }

      // Spacing
      const spacer = document.createElement("div");
      spacer.style.height = "1rem";
      startOptionsSection.appendChild(spacer);

      // Add install button if PWA install is available
      if (this.installPrompt) {
        const installButton = document.createElement("button");
        installButton.className = "splash-btn splash-btn-install";
        installButton.textContent = "Install App";
        installButton.onclick = async () => {
          try {
            this.installPrompt.prompt();
            const { outcome } = await this.installPrompt.userChoice;
            console.log(`User response to install prompt: ${outcome}`);
            if (outcome === "accepted") {
              this.installPrompt = null;
              installButton.textContent = "App Installed!";
              installButton.disabled = true;
              installButton.classList.add("installed");
            }
          } catch (error) {
            console.error("Error during install:", error);
          }
        };
        startOptionsSection.appendChild(installButton);
      }

      // Show the options with animation
      startOptionsSection.style.display = "flex";
      setTimeout(() => {
        startOptionsSection.classList.add("show");
      }, 100);
    }
  }

  hide() {
    if (this.splashScreen && !this.isReady) {
      this.isReady = true;

      // Clear any error timeout
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }

      this.splashScreen.classList.add("fade-out");
      setTimeout(() => {
        this.splashScreen.classList.add("hidden");
        // Notify service worker that splash is hidden
        if (
          "serviceWorker" in navigator &&
          navigator.serviceWorker.controller
        ) {
          navigator.serviceWorker.controller.postMessage({
            type: "SPLASH_HIDDEN",
          });
        }
      }, 500);
    }
  }

  show() {
    if (this.splashScreen) {
      this.splashScreen.classList.remove("hidden", "fade-out");
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);

    if (autoHide) {
      // Auto-hide error after 3 seconds
      this.errorTimeout = setTimeout(() => {
        this.hide();
      }, 3000);
    }
  }

  // Force hide splash screen (for emergency cases)
  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.splashScreen.classList.add("hidden", "fade-out");
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }
    }
  }
}

// Global splash screen manager instance
window.splashManager = new SplashScreenManager();

// Add keyboard shortcut to force hide splash screen (for debugging)
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && window.splashManager) {
    window.splashManager.forceHide();
  }
});

// Note: beforeinstallprompt is now handled in SplashScreenManager
// to provide install option on the splash screen

if (installButton) {
  installButton.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      installButton.style.display = "none";
    }
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA was installed");
  deferredPrompt = null;
  if (installButton) {
    installButton.style.display = "none";
  }
});
