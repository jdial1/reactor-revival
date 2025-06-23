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
          detailsDiv.innerHTML =
            `<div><b>Money:</b> $${saveData.current_money ?? 0}</div>` +
            `<div><b>Cells:</b> ${
              saveData.tiles ? saveData.tiles.length : 0
            }</div>`;
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
