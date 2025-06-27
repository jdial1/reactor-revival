import { numFormat as fmt } from "./util.js";
import { flavorMessages } from "../data/flavor_text.js";

let deferredPrompt;
const installButton = document.getElementById("install_pwa_btn");

// Splash Screen Manager
class SplashScreenManager {
  constructor() {
    this.splashScreen = null;
    this.statusElement = null;
    this.flavorElement = null;

    // Debug flag - set to true to enable slow loading for testing flavor text
    this.debugMode =
      new URLSearchParams(window.location.search).has("debug-splash") ||
      localStorage.getItem("debug-splash") === "true";

    this.loadingSteps = [
      { id: "init", message: "Initializing reactor systems..." },
      { id: "ui", message: "Calibrating control panels..." },
      { id: "game", message: "Spinning up nuclear protocols..." },
      { id: "parts", message: "Installing reactor components..." },
      { id: "upgrades", message: "Analyzing technological blueprints..." },
      { id: "objectives", message: "Briefing mission parameters..." },
      { id: "engine", message: "Achieving critical mass..." },
      { id: "ready", message: "Reactor online - All systems nominal!" },
    ];
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.flavorInterval = null;

    // Promise that resolves when splash screen is fully loaded
    this.readyPromise = this.waitForDOMAndLoad();

    if (this.debugMode) {
      console.log(
        "[SPLASH DEBUG] Debug mode enabled - loading will be slower to showcase flavor text"
      );
      console.log(
        "[SPLASH DEBUG] Available flavor messages:",
        flavorMessages.length
      );
    }

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
   * Wait for DOM to be ready, then load splash screen
   */
  async waitForDOMAndLoad() {
    // Wait for DOM if it's not ready yet
    if (document.readyState === "loading") {
      await new Promise((resolve) => {
        document.addEventListener("DOMContentLoaded", resolve, { once: true });
      });
    }

    console.log("[SPLASH] DOM ready, loading splash screen...");
    return this.loadSplashScreen();
  }

  /**
   * Load splash screen HTML from pages folder
   */
  async loadSplashScreen() {
    try {
      const response = await fetch("./pages/splash.html");
      if (!response.ok) {
        throw new Error(`Failed to load splash screen: ${response.status}`);
      }
      const html = await response.text();

      // Insert HTML into container
      const container = document.getElementById("splash-container");
      if (container) {
        container.innerHTML = html;

        // Initialize element references after HTML is loaded
        this.splashScreen = document.getElementById("splash-screen");
        this.statusElement = document.getElementById("splash-status");
        this.flavorElement = document.getElementById("splash-flavor");

        // Initialize splash screen stats
        await this.initializeSplashStats();

        console.log("[SPLASH] Splash screen loaded successfully");
        return true;
      } else {
        throw new Error("Splash container not found");
      }
    } catch (error) {
      console.error("Error loading splash screen:", error);
      // Fallback: create minimal splash screen
      this.createFallbackSplashScreen();
      return false;
    }
  }

  /**
   * Create a minimal fallback splash screen if loading fails
   */
  createFallbackSplashScreen() {
    console.log("[SPLASH] Creating fallback splash screen");
    const container = document.getElementById("splash-container");
    if (container) {
      container.innerHTML = `
        <div id="splash-screen" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #2c3e50; color: white; font-family: monospace;">
          <h1>REACTOR REVIVAL</h1>
          <p>Loading...</p>
          <div id="splash-status"></div>
          <div id="splash-flavor"></div>
        </div>
      `;

      this.splashScreen = document.getElementById("splash-screen");
      this.statusElement = document.getElementById("splash-status");
      this.flavorElement = document.getElementById("splash-flavor");

      // Initialize stats for fallback too
      this.initializeSplashStats().catch(console.error);
    }
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

  /**
   * Ensure splash screen is ready before executing methods
   */
  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    // Don't do anything if elements aren't ready yet
    if (!this.statusElement) {
      console.warn(
        "[SPLASH] Status element not ready, skipping update:",
        message
      );
      return;
    }

    this.statusElement.textContent = message;
    this.statusElement.style.display = "block";

    // Start showing flavor text when loading begins
    if (!this.flavorInterval && this.flavorElement) {
      this.startFlavorText();
    }
  }

  startFlavorText() {
    if (!this.flavorElement) {
      console.warn(
        "[SPLASH] Cannot start flavor text - flavor element not found"
      );
      return;
    }

    console.log(
      "[SPLASH] Flavor text element ready - will be controlled by loading steps"
    );

    if (this.debugMode) {
      console.log(
        "[SPLASH DEBUG] Flavor text is now controlled by loading steps instead of automatic rotation"
      );
    }
  }

  showRandomFlavorText() {
    if (!this.flavorElement) return;

    const randomIndex = Math.floor(Math.random() * flavorMessages.length);
    const message = flavorMessages[randomIndex];
    this.flavorElement.textContent = message;

    if (this.debugMode) {
      console.log(
        `[SPLASH DEBUG] Showing flavor text ${randomIndex + 1}/${
          flavorMessages.length
        }: "${message}"`
      );
    }
  }

  stopFlavorText() {
    if (this.flavorInterval) {
      clearInterval(this.flavorInterval);
      this.flavorInterval = null;
    }
    if (this.flavorElement) {
      this.flavorElement.style.display = "none";
    }
  }

  nextStep() {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      const step = this.loadingSteps[this.currentStep];
      this.updateStatus(step.message);
    }
  }

  async setStep(stepId) {
    await this.ensureReady();
    const stepIndex = this.loadingSteps.findIndex((step) => step.id === stepId);
    if (stepIndex !== -1) {
      this.currentStep = stepIndex;
      const step = this.loadingSteps[this.currentStep];

      // Hide the status element and use flavor element for everything
      if (this.statusElement) {
        this.statusElement.style.display = "none";
      }

      // Show flavor text instead of boring step messages
      if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
        const randomIndex = Math.floor(Math.random() * flavorMessages.length);
        const flavorMessage = flavorMessages[randomIndex];
        this.flavorElement.textContent = flavorMessage;
        this.flavorElement.style.display = "block";

        if (this.debugMode) {
          console.log(
            `[SPLASH DEBUG] Step ${stepIndex + 1}/${
              this.loadingSteps.length
            }: ${step.message} -> showing flavor: "${flavorMessage}"`
          );
        }
      } else {
        // Fallback to status element with original message if no flavor text available
        if (this.statusElement) {
          this.statusElement.style.display = "block";
          this.statusElement.textContent = step.message;
        }

        if (this.debugMode) {
          console.log(
            `[SPLASH DEBUG] Step ${stepIndex + 1}/${
              this.loadingSteps.length
            }: ${step.message} (no flavor text available, using status element)`
          );
        }
      }

      if (this.debugMode) {
        // Add pause in debug mode to showcase flavor text (2-4 seconds)
        const pauseDuration = 2000 + Math.random() * 2000;
        console.log(
          `[SPLASH DEBUG] Pausing for ${Math.round(
            pauseDuration
          )}ms to showcase flavor text...`
        );
        await new Promise((resolve) => setTimeout(resolve, pauseDuration));
      }
    }
  }

  async setSubStep(message) {
    await this.ensureReady();

    // Hide status element and show flavor text instead
    if (this.statusElement) {
      this.statusElement.style.display = "none";
    }

    if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
      const randomIndex = Math.floor(Math.random() * flavorMessages.length);
      const flavorMessage = flavorMessages[randomIndex];
      this.flavorElement.textContent = flavorMessage;
      this.flavorElement.style.display = "block";

      if (this.debugMode) {
        console.log(
          `[SPLASH DEBUG] SubStep: ${message} -> showing flavor: "${flavorMessage}"`
        );
      }
    } else {
      // Fallback to status element
      if (this.statusElement) {
        this.statusElement.style.display = "block";
        this.statusElement.textContent = message;
      }
    }
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (this.splashScreen && !this.isReady) {
      // Stop flavor text rotation since loading is complete
      this.stopFlavorText();

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
        // Create a container for the split load game section
        const loadGameContainer = document.createElement("div");
        loadGameContainer.className = "splash-load-container";
        loadGameContainer.style.cssText = `
          display: flex;
          align-items: stretch;
          gap: 0;
          width: 100%;
          justify-content: center;
          max-width: 520px;
          margin: 0 auto;
        `;

        const loadGameButton = document.createElement("button");
        loadGameButton.id = "splash-load-game-btn";
        loadGameButton.className = "splash-btn splash-btn-load";
        loadGameButton.onclick = () => this.hide();
        loadGameButton.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem 2rem;
          min-height: auto;
          flex: 1;
          border-radius: 8px;
          margin-right: 0;
        `;

        // Add save details to the button
        try {
          const saveData = JSON.parse(saveDataJSON);
          const totalPlayedMs = saveData.total_played_time || 0;
          const playedTimeStr = this.formatTime(totalPlayedMs);

          // Check if this save has been uploaded to cloud
          const isCloudSynced = saveData.isCloudSynced || false;

          loadGameButton.innerHTML = `
            <div style="text-align: center; margin-bottom: 0.3rem;">
              <span>Load Game</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.8em; color: #CCC; line-height: 1.3; font-weight: 400;">
              <span style="color: #BBB; font-weight: 500;">LOCAL</span>
              <img src="img/ui/icons/icon_cash.png" style="width: 16px; height: 16px;" alt="$">
              <span>$${fmt(saveData.current_money ?? 0)}</span>
              <img src="img/ui/icons/icon_time.png" style="width: 16px; height: 16px;" alt="⏰">
              <span>${playedTimeStr}</span>
              ${
                isCloudSynced
                  ? '<span style="color: #4285F4; font-weight: 500;">Synced</span>'
                  : ""
              }
            </div>
          `;
        } catch (e) {
          // Fallback if save data can't be parsed
          loadGameButton.innerHTML = `
            <div style="text-align: center; margin-bottom: 0.3rem;">
              <span>Load Game</span>
            </div>
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.8em; color: #CCC; line-height: 1.3; font-weight: 400;">
              <span style="color: #BBB; font-weight: 500;">LOCAL</span>
            </div>
          `;
        }

        // Create upload to cloud option button (hidden until signed into Google)
        const uploadToCloudOption = document.createElement("button");
        uploadToCloudOption.id = "splash-upload-option-btn";
        uploadToCloudOption.className = "splash-btn-small splash-btn-upload";
        uploadToCloudOption.style.display = "none"; // Only control visibility via JS
        uploadToCloudOption.innerHTML = `
          <div class="upload-icon">☁️⬆️</div>
          <div class="upload-text">Upload</div>
        `;
        uploadToCloudOption.title = "Upload local save to Google Drive";

        loadGameContainer.appendChild(loadGameButton);
        loadGameContainer.appendChild(uploadToCloudOption);
        startOptionsSection.appendChild(loadGameContainer);
      }

      // Button to load from Google Drive (only shown if signed in and save exists)
      // Position this right after the local load game button
      const loadFromCloudButton = document.createElement("button");
      loadFromCloudButton.id = "splash-load-cloud-btn";
      loadFromCloudButton.className = "splash-btn splash-btn-load";
      loadFromCloudButton.textContent = "Load from Cloud";
      loadFromCloudButton.style.display = "none"; // Initially hidden
      loadFromCloudButton.style.cssText = `
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 1rem 2rem;
        min-height: auto;
        margin: 0.5rem auto 0;
        border-radius: 8px;
      `;
      startOptionsSection.appendChild(loadFromCloudButton);

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

      // Add persistent flavor text below the buttons
      const flavorTextDiv = document.createElement("div");
      flavorTextDiv.className = "splash-persistent-flavor";
      const randomFlavorIndex = Math.floor(
        Math.random() * flavorMessages.length
      );
      flavorTextDiv.textContent = flavorMessages[randomFlavorIndex];
      startOptionsSection.appendChild(flavorTextDiv);

      // --- GOOGLE DRIVE INTEGRATION START ---

      // Button to sign in to Google
      const signInButton = document.createElement("button");
      signInButton.id = "splash-signin-btn";
      signInButton.className = "splash-btn splash-btn-load";
      signInButton.innerHTML = `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" xmlns:xlink="http://www.w3.org/1999/xlink" style="width: 20px; height: 20px; margin-right: 8px; flex-shrink: 0; vertical-align: middle;">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
          <path fill="none" d="M0 0h48v48H0z"></path>
        </svg>
        <span>Google Sign In</span>
      `;
      signInButton.style.display = "none"; // Initially hidden
      startOptionsSection.appendChild(signInButton);

      // Button to sign out from Google Drive
      const signOutButton = document.createElement("button");
      signOutButton.id = "splash-signout-btn";
      signOutButton.className = "splash-btn splash-btn-install";
      signOutButton.textContent = "Sign Out";
      signOutButton.style.display = "none"; // Initially hidden
      startOptionsSection.appendChild(signOutButton);

      // --- GOOGLE DRIVE INTEGRATION END ---

      // Show the options with animation
      startOptionsSection.style.display = "flex";
      setTimeout(() => {
        startOptionsSection.classList.add("show");
      }, 100);

      // Set up Google Drive button logic
      this.setupGoogleDriveButtons(
        signInButton,
        loadFromCloudButton,
        signOutButton
      );
    }
  }

  async setupGoogleDriveButtons(
    signInButton,
    loadFromCloudButton,
    signOutButton
  ) {
    const uploadOptionButton = document.getElementById(
      "splash-upload-option-btn"
    );

    // Check if upload button exists (it might not be created yet)
    if (!uploadOptionButton) {
      console.warn("Upload option button not found - might not be created yet");
    }

    if (!window.googleDriveSave) {
      console.warn("GoogleDriveSave not initialized.");
      return;
    }

    // Check if Google Drive is properly configured
    if (!window.googleDriveSave.isConfigured()) {
      console.log("Google Drive integration not configured - hiding buttons");
      signInButton.style.display = "none";
      loadFromCloudButton.style.display = "none";
      signOutButton.style.display = "none";
      if (uploadOptionButton) {
        uploadOptionButton.style.display = "none";
      }
      return;
    }

    // Show loading state while initializing
    this.showGoogleDriveInitializing(signInButton, loadFromCloudButton);

    try {
      console.log("Setting up Google Drive buttons...");

      // Initialize the Google Drive module
      const initialized = await window.googleDriveSave.init();
      if (!initialized) {
        console.log("Google Drive initialization failed - hiding buttons");
        this.hideGoogleDriveInitializing(signInButton, loadFromCloudButton);
        signInButton.style.display = "none";
        loadFromCloudButton.style.display = "none";
        signOutButton.style.display = "none";
        if (uploadOptionButton) {
          uploadOptionButton.style.display = "none";
        }
        return;
      }

      // Hide loading state after successful initialization
      this.hideGoogleDriveInitializing(signInButton, loadFromCloudButton);

      console.log("Google Drive initialized, checking auth status...");

      // Check auth status without triggering popup
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      console.log("Auth status:", isSignedIn ? "Signed in" : "Not signed in");

      await this.updateGoogleDriveUI(
        isSignedIn,
        signInButton,
        loadFromCloudButton,
        uploadOptionButton,
        signOutButton
      );

      // Set up event handlers
      signInButton.onclick = async () => {
        try {
          console.log("Attempting Google Drive sign-in...");
          const contentSpan = signInButton.querySelector("span");
          const iconSvg = signInButton.querySelector("svg");
          if (contentSpan) {
            contentSpan.textContent = "Signing in...";
          }
          signInButton.disabled = true;
          await window.googleDriveSave.signIn();
          await this.updateGoogleDriveUI(
            true,
            signInButton,
            loadFromCloudButton,
            uploadOptionButton,
            signOutButton
          );
        } catch (error) {
          console.error("Google Drive sign-in failed:", error);
          const contentSpan = signInButton.querySelector("span");
          const iconSvg = signInButton.querySelector("svg");
          if (contentSpan) {
            contentSpan.textContent = "Sign in Failed";
          }
          if (iconSvg) {
            iconSvg.style.filter = "grayscale(100%)";
          }
          setTimeout(() => {
            if (contentSpan) {
              contentSpan.textContent = "Google Sign In";
            }
            if (iconSvg) {
              iconSvg.style.filter = "";
            }
            signInButton.disabled = false;
          }, 2000);
        }
      };

      signOutButton.onclick = async () => {
        console.log("Signing out of Google Drive...");
        window.googleDriveSave.signOut();
        await this.updateGoogleDriveUI(
          false,
          signInButton,
          loadFromCloudButton,
          uploadOptionButton,
          signOutButton
        );
      };

      console.log("Google Drive buttons setup complete");

      // The load from cloud handler will be set up in app.js where game object is accessible
    } catch (error) {
      console.error("Failed to setup Google Drive buttons:", error);
      console.error("Error details:", error.message);

      // Show a more helpful error on the sign-in button
      signInButton.style.display = "block";
      const contentSpan = signInButton.querySelector("span");
      const iconSvg = signInButton.querySelector("svg");
      if (contentSpan) {
        contentSpan.textContent = "Google Drive Error";
      }
      if (iconSvg) {
        iconSvg.style.filter = "grayscale(100%) brightness(0.5)";
      }
      signInButton.disabled = true;
      signInButton.title = `Google Drive setup failed: ${error.message}`;

      loadFromCloudButton.style.display = "none";
      signOutButton.style.display = "none";
    }
  }

  async updateGoogleDriveUI(
    isSignedIn,
    signInButton,
    loadFromCloudButton,
    uploadOptionButton,
    signOutButton
  ) {
    console.log(
      "[DEBUG] updateGoogleDriveUI called with isSignedIn:",
      isSignedIn
    );

    if (isSignedIn) {
      // Reset sign-in button state before hiding it (in case it was in loading state)
      const contentSpan = signInButton.querySelector("span");
      const iconSvg = signInButton.querySelector("svg");
      if (contentSpan) {
        contentSpan.textContent = "Google Sign In";
      }
      if (iconSvg) {
        iconSvg.style.filter = "";
      }
      signInButton.disabled = false;
      signInButton.style.display = "none";
      signOutButton.style.display = "block";

      // Show loading state for cloud save button while checking
      this.showCloudSaveLoading(loadFromCloudButton);

      // Check if there's a save file in the cloud
      try {
        console.log("[DEBUG] Checking for cloud save file...");
        console.log(
          "[DEBUG] Current cached saveFileId:",
          window.googleDriveSave.saveFileId
        );

        // Always search for the file instead of relying on cache for now (to debug)
        const fileFound = await window.googleDriveSave.findSaveFile();
        const fileId = window.googleDriveSave.saveFileId;

        console.log("[DEBUG] findSaveFile() returned:", fileFound);
        console.log("[DEBUG] Cloud save file ID after search:", fileId);

        // Show cloud save load button if cloud save exists
        if (fileId) {
          console.log("[DEBUG] Cloud save found, showing load button");
          loadFromCloudButton.style.display = "block";

          // Hide local save button when cloud save is found
          // This prioritizes cloud saves over local saves for a cleaner UX
          const localLoadButton = document.getElementById(
            "splash-load-game-btn"
          );
          if (localLoadButton) {
            localLoadButton.style.display = "none";
            console.log("[DEBUG] Cloud save found, hiding local load button");
          }

          // Try to get cloud save details to display
          try {
            const cloudSaveData = await window.googleDriveSave.load();
            if (cloudSaveData) {
              const saveData = JSON.parse(cloudSaveData);
              const totalPlayedMs = saveData.total_played_time || 0;
              const playedTimeStr = this.formatTime(totalPlayedMs);

              loadFromCloudButton.innerHTML = `
                <div style="text-align: center; margin-bottom: 0.3rem;">
                  <span>Load Game</span>
                </div>
                <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.8em; color: #CCC; line-height: 1.3; font-weight: 400;">
                  <span style="color: #4285F4; font-weight: 500;">CLOUD</span>
                  <img src="img/ui/icons/icon_cash.png" style="width: 16px; height: 16px;" alt="$">
                  <span>$${fmt(saveData.current_money ?? 0)}</span>
                  <img src="img/ui/icons/icon_time.png" style="width: 16px; height: 16px;" alt="⏰">
                  <span>${playedTimeStr}</span>
                </div>
              `;
            } else {
              throw new Error("Could not parse cloud save data");
            }
          } catch (error) {
            console.log("[DEBUG] Could not load cloud save details:", error);
            // Fallback to simple format
            loadFromCloudButton.innerHTML = `
              <div style="text-align: center; margin-bottom: 0.3rem;">
                <span>Load Game</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: center; gap: 8px; font-size: 0.8em; color: #CCC; line-height: 1.3; font-weight: 400;">
                <span style="color: #4285F4; font-weight: 500;">CLOUD</span>
              </div>
            `;
          }
          // Clear upload-specific data attributes
          delete loadFromCloudButton.dataset.action;
          delete loadFromCloudButton.dataset.gameState;
        } else {
          console.log("[DEBUG] No cloud save found, hiding load button");
          loadFromCloudButton.style.display = "none";
          // Clear any stale data attributes
          delete loadFromCloudButton.dataset.action;
          delete loadFromCloudButton.dataset.gameState;

          // Show local save button if local save exists and no cloud save
          const localLoadButton = document.getElementById(
            "splash-load-game-btn"
          );
          const localSaveData = localStorage.getItem("reactorGameSave");
          if (localLoadButton && localSaveData) {
            localLoadButton.style.display = "block";
            console.log(
              "[DEBUG] No cloud save found, showing local load button"
            );
          }
        }

        // Check for local save to offer upload (only when signed in)
        console.log("[DEBUG] Checking for local save to upload...");
        const localSaveInfo =
          await window.googleDriveSave.offerLocalSaveUpload();
        console.log("[DEBUG] Local save info:", localSaveInfo);

        // Additional debug: Check if local save is cloud synced
        const localSaveData = localStorage.getItem("reactorGameSave");
        if (localSaveData) {
          try {
            const parsedSave = JSON.parse(localSaveData);
            console.log(
              "[DEBUG] Local save isCloudSynced:",
              parsedSave.isCloudSynced
            );
            console.log(
              "[DEBUG] Local save cloudUploadedAt:",
              parsedSave.cloudUploadedAt
            );
          } catch (e) {
            console.log("[DEBUG] Could not parse local save for sync check");
          }
        }

        if (localSaveInfo && localSaveInfo.hasLocalSave) {
          console.log(
            "[DEBUG] Local save found, offering upload to cloud:",
            localSaveInfo.saveSize
          );

          // Show the split upload option button
          if (uploadOptionButton) {
            uploadOptionButton.style.display = "flex";
            uploadOptionButton.dataset.action = "upload";
            uploadOptionButton.dataset.gameState = JSON.stringify(
              localSaveInfo.gameState
            );

            // Adjust Load Game button for split-button layout
            const loadGameButton = document.getElementById(
              "splash-load-game-btn"
            );
            if (loadGameButton) {
              loadGameButton.style.borderTopRightRadius = "0";
              loadGameButton.style.borderBottomRightRadius = "0";
              loadGameButton.style.borderRadius = "8px 0 0 8px";
            }
          }
        } else {
          console.log(
            "[DEBUG] No uploadable local save found (may be already synced), hiding upload buttons"
          );

          // Hide the split upload option button
          if (uploadOptionButton) {
            uploadOptionButton.style.display = "none";
            delete uploadOptionButton.dataset.action;
            delete uploadOptionButton.dataset.gameState;

            // Restore Load Game button to full width when upload option is hidden
            const loadGameButton = document.getElementById(
              "splash-load-game-btn"
            );
            if (loadGameButton) {
              loadGameButton.style.borderRadius = "8px";
              loadGameButton.style.borderTopRightRadius = "8px";
              loadGameButton.style.borderBottomRightRadius = "8px";
            }
          }
        }
      } catch (error) {
        console.error("Error checking for cloud save:", error);
        loadFromCloudButton.style.display = "none";
      } finally {
        // Hide loading state regardless of outcome
        this.hideCloudSaveLoading(loadFromCloudButton);
      }
    } else {
      console.log("[DEBUG] Not signed in, showing sign-in button");
      signInButton.style.display = "block";
      const contentSpan = signInButton.querySelector("span");
      const iconSvg = signInButton.querySelector("svg");
      if (contentSpan) {
        contentSpan.textContent = "Google Sign In";
      }
      if (iconSvg) {
        iconSvg.style.filter = "";
      }
      signInButton.disabled = false;
      loadFromCloudButton.style.display = "none";
      if (uploadOptionButton) {
        uploadOptionButton.style.display = "none";

        // Restore Load Game button to full width when not signed in
        const loadGameButton = document.getElementById("splash-load-game-btn");
        if (loadGameButton) {
          loadGameButton.style.borderRadius = "8px";
          loadGameButton.style.borderTopRightRadius = "8px";
          loadGameButton.style.borderBottomRightRadius = "8px";
        }
      }
      signOutButton.style.display = "none";

      // Show local save button if local save exists and not signed in
      const localLoadButton = document.getElementById("splash-load-game-btn");
      const localSaveData = localStorage.getItem("reactorGameSave");
      if (localLoadButton && localSaveData) {
        localLoadButton.style.display = "block";
        console.log(
          "[DEBUG] Not signed in, showing local load button if local save exists"
        );
      }
    }
  }

  hide() {
    if (this.splashScreen && !this.isReady) {
      this.isReady = true;

      // Stop flavor text rotation
      this.stopFlavorText();

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

  // Show loading state on cloud save button
  showCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;

    loadFromCloudButton.style.display = "block";
    loadFromCloudButton.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
        <div style="width: 16px; height: 16px; border: 2px solid #4285F4; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <span>Checking for cloud save...</span>
      </div>
    `;
    loadFromCloudButton.disabled = true;
  }

  // Hide loading state on cloud save button
  hideCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;

    loadFromCloudButton.disabled = false;
    // The actual content will be set by the calling function based on whether a save was found
  }

  // Show loading state during Google Drive initialization
  showGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.style.display = "block";
      signInButton.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <div style="width: 16px; height: 16px; border: 2px solid #4285F4; border-top: 2px solid transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <span>Initializing Google Drive...</span>
        </div>
      `;
      signInButton.disabled = true;
    }

    if (loadFromCloudButton) {
      loadFromCloudButton.style.display = "none";
    }
  }

  // Hide loading state after Google Drive initialization
  hideGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.disabled = false;
      // Reset button content to normal Google Sign In button
      signInButton.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <svg width="18" height="18" viewBox="0 0 24 24" style="fill: currentColor;">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          <span>Google Sign In</span>
        </div>
      `;
    }
  }

  // Refresh save options after upload/download operations
  async refreshSaveOptions() {
    console.log("[DEBUG] Refreshing save options...");

    // Check if we still have buttons to update
    const signInButton = document.getElementById("splash-signin-btn");
    const loadFromCloudButton = document.getElementById(
      "splash-load-cloud-btn"
    );

    const uploadOptionButton = document.getElementById(
      "splash-upload-option-btn"
    );
    const signOutButton = document.getElementById("splash-signout-btn");

    if (!signInButton || !loadFromCloudButton || !signOutButton) {
      console.log(
        "[DEBUG] Required save option buttons not found, can't refresh"
      );
      return;
    }

    // Upload button is optional - it might not exist yet
    if (!uploadOptionButton) {
      console.log(
        "[DEBUG] Upload option button not found - will skip upload option UI updates"
      );
    }

    // Update Google Drive UI state
    if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
      console.log("[DEBUG] User is signed in, updating Google Drive UI...");

      // Ensure Google Drive is fully initialized
      try {
        await window.googleDriveSave.init();
        console.log("[DEBUG] Google Drive initialization confirmed");
      } catch (initError) {
        console.error("[DEBUG] Google Drive initialization error:", initError);
      }

      await this.updateGoogleDriveUI(
        true,
        signInButton,
        loadFromCloudButton,
        uploadOptionButton,
        signOutButton
      );
    } else {
      console.log("[DEBUG] User is not signed in to Google Drive");
    }

    // Check local save status and update the local load button accordingly
    const localLoadButton = document.getElementById("splash-load-game-btn");
    const saveDataJSON = localStorage.getItem("reactorGameSave");

    // Check if there's a cloud save to determine local button visibility
    let hasCloudSave = false;
    if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
      try {
        const fileId =
          window.googleDriveSave.saveFileId ||
          (await window.googleDriveSave.findSaveFile());
        hasCloudSave = !!fileId;
      } catch (error) {
        console.log("[DEBUG] Error checking for cloud save in refresh:", error);
      }
    }

    if (localLoadButton && saveDataJSON && !hasCloudSave) {
      localLoadButton.style.display = "block";
      console.log(
        "[DEBUG] Local save exists and no cloud save, keeping local load button visible"
      );
    } else if (localLoadButton) {
      localLoadButton.style.display = "none";
      console.log(
        "[DEBUG] No local save found or cloud save exists, hiding local load button"
      );
    }
  }
}

// Global splash screen manager instance
window.splashManager = new SplashScreenManager();

// Debug helper functions
window.debugSplash = {
  enable: () => {
    localStorage.setItem("debug-splash", "true");
    console.log(
      "[SPLASH DEBUG] Debug mode enabled. Reload the page to see slower loading with showcased flavor text."
    );
    console.log(
      "[SPLASH DEBUG] Or visit: " +
        window.location.origin +
        window.location.pathname +
        "?debug-splash"
    );
  },

  // Debug Google Drive functionality
  checkGoogleDrive: async () => {
    console.log("[DEBUG] Manual Google Drive check:");
    console.log("- Google Drive Save exists:", !!window.googleDriveSave);
    console.log("- Is signed in:", window.googleDriveSave?.isSignedIn);
    console.log(
      "- Local save (reactorGameSave):",
      window.localStorage.getItem("reactorGameSave") ? "EXISTS" : "NONE"
    );

    if (window.googleDriveSave?.isSignedIn) {
      try {
        const localSaveInfo =
          await window.googleDriveSave.offerLocalSaveUpload();
        console.log("- Local save info:", localSaveInfo);

        const fileId = await window.googleDriveSave.findSaveFile();
        console.log("- Cloud save file ID:", fileId);
      } catch (error) {
        console.error("- Error during check:", error);
      }
    }
  },

  // Test cloud save detection after upload
  testCloudSaveDetection: async () => {
    console.log("=== Cloud Save Detection Test ===");

    if (!window.googleDriveSave?.isSignedIn) {
      console.error("❌ Not signed in to Google Drive");
      return;
    }

    console.log("🔍 Step 1: Clear cached file ID and search for cloud save...");
    window.googleDriveSave.saveFileId = null;

    const foundFile = await window.googleDriveSave.findSaveFile();
    console.log("- File found:", foundFile);
    console.log("- File ID:", window.googleDriveSave.saveFileId);

    console.log("🔄 Step 2: Refresh save options...");
    if (window.splashManager) {
      await window.splashManager.refreshSaveOptions();
      console.log("- Save options refreshed");
    }

    console.log("✅ Test complete");
  },

  // Test basic Google Drive API operations
  testBasicOperations: async () => {
    console.log("=== Manual Basic Operations Test ===");

    if (!window.googleDriveSave?.isSignedIn) {
      console.error("❌ Not signed in to Google Drive");
      return;
    }

    try {
      const result = await window.googleDriveSave.testBasicFileOperations();
      console.log("Test result:", result ? "✅ PASSED" : "❌ FAILED");
    } catch (error) {
      console.error("❌ Test error:", error);
    }
  },

  // Debug: List all files to see where saves are going
  listAllFiles: async () => {
    console.log("=== Listing All Drive Files ===");

    if (!window.googleDriveSave?.isSignedIn) {
      console.error("❌ Not signed in to Google Drive");
      return;
    }

    try {
      // List files in root
      console.log("📁 Files in root:");
      const rootResponse = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=name contains 'reactor'&fields=files(id,name,parents,createdTime)",
        {
          headers: {
            Authorization: `Bearer ${window.googleDriveSave.authToken}`,
          },
        }
      );

      if (rootResponse.ok) {
        const rootData = await rootResponse.json();
        console.log("Root files:", rootData.files);
      }

      // List files in appDataFolder
      console.log("📁 Files in appDataFolder:");
      const appResponse = await fetch(
        "https://www.googleapis.com/drive/v3/files?q=parents in 'appDataFolder'&fields=files(id,name,parents,createdTime)",
        {
          headers: {
            Authorization: `Bearer ${window.googleDriveSave.authToken}`,
          },
        }
      );

      if (appResponse.ok) {
        const appData = await appResponse.json();
        console.log("AppData files:", appData.files);
      }
    } catch (error) {
      console.error("❌ Error listing files:", error);
    }
  },

  // OAuth troubleshooting helper
  diagnoseOAuth: () => {
    console.log("=== OAuth Diagnostic Report ===");
    console.log("Current URL:", window.location.href);
    console.log("Origin:", window.location.origin);
    console.log("Protocol:", window.location.protocol);
    console.log("Port:", window.location.port);

    console.log("\n=== Google Drive Config ===");
    if (window.googleDriveSave) {
      console.log("- Google Drive Save:", "✅ Loaded");
      console.log(
        "- Configuration:",
        window.googleDriveSave.isConfigured() ? "✅ Valid" : "❌ Invalid"
      );
    } else {
      console.log("- Google Drive Save:", "❌ Not loaded");
    }

    console.log("\n=== Required URLs for Google Cloud Console ===");
    console.log("Add these to 'Authorized JavaScript origins':");
    console.log(`- ${window.location.origin}`);
    if (window.location.port !== "8080") {
      console.log("- http://localhost:8080");
      console.log("- http://127.0.0.1:8080");
    }

    console.log("\n=== Next Steps ===");
    console.log(
      "1. Go to Google Cloud Console > APIs & Services > Credentials"
    );
    console.log("2. Edit your OAuth 2.0 Client ID");
    console.log("3. Add the URLs above to 'Authorized JavaScript origins'");
    console.log("4. Make sure Google Drive API is enabled");
    console.log("5. Check OAuth consent screen is configured");
    console.log("6. Try signing in again");
  },

  // Test save state transitions
  testSaveFlow: async () => {
    console.log("=== Save Flow Test ===");
    console.log("Before operation:");
    console.log(
      "- Local save exists:",
      !!localStorage.getItem("reactorGameSave")
    );
    console.log(
      "- Signed into Google Drive:",
      window.googleDriveSave?.isSignedIn
    );

    if (window.googleDriveSave?.isSignedIn) {
      try {
        const cloudFileId = await window.googleDriveSave.findSaveFile();
        console.log("- Cloud save exists:", !!cloudFileId);

        if (window.splashManager) {
          await window.splashManager.refreshSaveOptions();
          console.log("- Save options refreshed");
        }
      } catch (error) {
        console.error("- Error checking cloud save:", error);
      }
    }
  },

  // Test Google Drive permissions specifically
  testPermissions: async () => {
    console.log("=== Google Drive Permissions Test ===");

    if (!window.googleDriveSave) {
      console.error("❌ GoogleDriveSave not available");
      return;
    }

    console.log("✅ GoogleDriveSave available");
    console.log("- Configured:", window.googleDriveSave.isConfigured());
    console.log("- Signed in:", window.googleDriveSave.isSignedIn);
    console.log("- Auth token present:", !!window.googleDriveSave.authToken);
    console.log("- Current save file ID:", window.googleDriveSave.saveFileId);

    if (window.googleDriveSave.isSignedIn) {
      try {
        console.log("🔍 Testing file list permissions...");

        // Test if we can list files (basic permission check)
        const response = await fetch(
          "https://www.googleapis.com/drive/v3/files?pageSize=1",
          {
            headers: {
              Authorization: `Bearer ${window.googleDriveSave.authToken}`,
            },
          }
        );

        if (response.ok) {
          console.log("✅ File listing permissions: OK");
          const data = await response.json();
          console.log("- Can access", data.files?.length || 0, "files");
        } else {
          console.error("❌ File listing permissions: FAILED");
          console.error("- Status:", response.status, response.statusText);
          const errorText = await response.text();
          console.error("- Error:", errorText);
        }

        // Test if we can access the current save file
        if (window.googleDriveSave.saveFileId) {
          console.log("🔍 Testing save file access...");
          const fileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${window.googleDriveSave.saveFileId}`,
            {
              headers: {
                Authorization: `Bearer ${window.googleDriveSave.authToken}`,
              },
            }
          );

          if (fileResponse.ok) {
            console.log("✅ Save file access: OK");
            const fileData = await fileResponse.json();
            console.log("- File name:", fileData.name);
            console.log("- File size:", fileData.size);
            console.log("- Created:", fileData.createdTime);
            console.log("- Modified:", fileData.modifiedTime);
          } else {
            console.error("❌ Save file access: FAILED");
            console.error(
              "- Status:",
              fileResponse.status,
              fileResponse.statusText
            );
            const errorText = await fileResponse.text();
            console.error("- Error:", errorText);
          }
        }
      } catch (error) {
        console.error("❌ Permission test failed:", error);
      }
    } else {
      console.log("ℹ️ Not signed in - sign in first to test permissions");
    }
  },

  // Force clear all Google Drive authentication
  resetAuth: () => {
    console.log("=== Resetting Google Drive Authentication ===");

    if (window.googleDriveSave) {
      console.log("🔄 Signing out and clearing all auth data...");
      window.googleDriveSave.signOut();
      window.googleDriveSave.isSignedIn = false;
      window.googleDriveSave.authToken = null;
      window.googleDriveSave.saveFileId = null;
      console.log("✅ Auth data cleared");
    }

    // Clear any gapi tokens
    if (window.gapi && window.gapi.client) {
      try {
        window.gapi.client.setToken(null);
        console.log("✅ GAPI tokens cleared");
      } catch (error) {
        console.log("ℹ️ No GAPI tokens to clear");
      }
    }

    console.log("✅ Authentication reset complete");
    console.log("ℹ️ Refresh the page and sign in again with fresh permissions");
  },

  disable: () => {
    localStorage.removeItem("debug-splash");
    console.log(
      "[SPLASH DEBUG] Debug mode disabled. Reload the page for normal loading speed."
    );
  },
  showRandomFlavor: () => {
    if (window.splashManager && window.splashManager.flavorElement) {
      window.splashManager.showRandomFlavorText();
    } else {
      console.log(
        "[SPLASH DEBUG] Splash manager or flavor element not available"
      );
    }
  },
  listFlavors: () => {
    console.log("[SPLASH DEBUG] Available flavor messages:");
    flavorMessages.forEach((msg, index) => {
      console.log(`  ${index + 1}. ${msg}`);
    });
  },
};

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
