import { numFormat as fmt } from "./util.js";
import { flavorMessages } from "../data/flavor_text.js";
import {
  createNewGameButton,
  createLoadGameButton,
  createUploadToCloudButton,
  createLoadFromCloudButton,
  createGoogleSignInButton,
  createGoogleSignOutButton,
  createLoadGameUploadRow,
  createLoadGameButtonFullWidth,
} from "../components/splash-buttons.js";
import {
  createCloudSaveButton,
  createLoadingButton,
  createGoogleSignInButtonWithIcon,
  createInstallButton,
} from "../components/ui-buttons.js";

let deferredPrompt;
const installButton = window.domMapper?.get("pwa.installButton");

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
      const container = window.domMapper?.get("static.splashContainer");
      if (container) {
        container.innerHTML = html;

        // Map splash elements after they're loaded
        window.domMapper?.mapCategory("splash");

        // Initialize element references after HTML is loaded
        this.splashScreen = window.domMapper?.get("splash.screen");
        this.statusElement = window.domMapper?.get("splash.status");
        this.flavorElement = window.domMapper?.get("splash.flavor");

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
  async createFallbackSplashScreen() {
    console.log("[SPLASH] Creating fallback splash screen");
    const container = window.domMapper?.get("static.splashContainer");
    if (container) {
      const response = await fetch("./pages/fallback-splash.html");
      if (!response.ok) {
        throw new Error(
          `Failed to load fallback splash screen: ${response.status}`
        );
      }
      const html = await response.text();
      container.innerHTML = html;

      // Map splash elements after they're loaded
      window.domMapper?.mapCategory("splash");

      this.splashScreen = window.domMapper?.get("splash.screen");
      this.statusElement = window.domMapper?.get("splash.status");
      this.flavorElement = window.domMapper?.get("splash.flavor");

      // Initialize stats for fallback too
      await this.initializeSplashStats().catch(console.error);
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
    // Remove existing version if any
    const existingVersion = this.splashScreen.querySelector(".splash-version");
    if (existingVersion) {
      existingVersion.remove();
    }

    // Version at the very bottom
    const versionDiv = document.createElement("div");
    versionDiv.className = "splash-version";
    versionDiv.textContent = `v${version}`;
    this.splashScreen.appendChild(versionDiv);
    window.domMapper?.add("splash.version", versionDiv);

    // Add stats (total played time) just above version, if present
    if (totalPlayedTime && totalPlayedTime !== "0s") {
      const statsDiv = document.createElement("div");
      statsDiv.className = "splash-stats";
      statsDiv.innerHTML = `Total Played: ${totalPlayedTime}`;
      this.splashScreen.appendChild(statsDiv);
      window.domMapper?.add("splash.stats", statsDiv);
    }

    // Map splash category after dynamic elements are appended
    window.domMapper?.mapCategory("splash");
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
    this.statusElement.classList.add("splash-element-visible");

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
      this.flavorElement.classList.remove("splash-element-visible");
      this.flavorElement.classList.add("splash-element-hidden");
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
        this.statusElement.classList.add("splash-element-hidden");
      }

      // Show flavor text instead of boring step messages
      if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
        const randomIndex = Math.floor(Math.random() * flavorMessages.length);
        const flavorMessage = flavorMessages[randomIndex];
        this.flavorElement.textContent = flavorMessage;
        this.flavorElement.classList.remove("splash-element-hidden");
        this.flavorElement.classList.add("splash-element-visible");

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
          this.statusElement.classList.add("splash-element-visible");
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
      this.statusElement.classList.add("splash-element-hidden");
    }

    if (flavorMessages && flavorMessages.length > 0 && this.flavorElement) {
      const randomIndex = Math.floor(Math.random() * flavorMessages.length);
      const flavorMessage = flavorMessages[randomIndex];
      this.flavorElement.textContent = flavorMessage;
      this.flavorElement.classList.remove("splash-element-hidden");
      this.flavorElement.classList.add("splash-element-visible");

      if (this.debugMode) {
        console.log(
          `[SPLASH DEBUG] SubStep: ${message} -> showing flavor: "${flavorMessage}"`
        );
      }
    } else {
      // Fallback to status element
      if (this.statusElement) {
        this.statusElement.classList.add("splash-element-visible");
        this.statusElement.textContent = message;
      }
    }
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (this.splashScreen && !this.isReady) {
      this.stopFlavorText();
      const spinner = window.domMapper?.get("splash.spinner");
      if (spinner) spinner.classList.add("splash-element-hidden");
      if (this.statusElement)
        this.statusElement.classList.add("splash-element-hidden");
      if (this.flavorElement)
        this.flavorElement.classList.add("splash-element-hidden");

      let startOptionsSection = window.domMapper?.get("splash.startOptions");
      if (!startOptionsSection) {
        startOptionsSection = document.createElement("div");
        startOptionsSection.className = "splash-start-options";
        this.splashScreen.appendChild(startOptionsSection);
      }
      startOptionsSection.innerHTML = "";

      const flavorTextDiv = document.createElement("div");
      flavorTextDiv.className = "splash-persistent-flavor";
      flavorTextDiv.textContent =
        flavorMessages[Math.floor(Math.random() * flavorMessages.length)];
      startOptionsSection.appendChild(flavorTextDiv);

      const newGameButton = createNewGameButton(() => this.hide());
      startOptionsSection.appendChild(newGameButton);

      const localSaveJSON = localStorage.getItem("reactorGameSave");

      // Determine if the upload option should be shown
      let showUpload = false;
      let localSaveData = null;
      if (window.googleDriveSave && window.googleDriveSave.canUploadLocalSave) {
        const uploadCheck = await window.googleDriveSave.canUploadLocalSave();
        showUpload = uploadCheck.showUpload;
        localSaveData = uploadCheck.gameState;
      }

      if (canLoadGame && localSaveJSON) {
        const saveData = JSON.parse(localSaveJSON);
        const playedTimeStr = this.formatTime(saveData.total_played_time || 0);

        if (showUpload) {
          // Create the combined Load/Upload button row
          const loadGameUploadRow = createLoadGameUploadRow(
            saveData,
            playedTimeStr,
            false, // It's not synced if we're offering upload
            () => this.hide(),
            async () => {
              const uploadBtn = loadGameUploadRow.querySelector(
                "#splash-upload-option-btn"
              );
              uploadBtn.textContent = "Uploading...";
              uploadBtn.disabled = true;
              try {
                await window.googleDriveSave.uploadLocalSave(localSaveJSON);
                uploadBtn.textContent = "Uploaded!";
                setTimeout(() => this.refreshSaveOptions(), 2000); // Refresh UI
              } catch (err) {
                alert("Upload failed. Please try again.");
                uploadBtn.textContent = "Upload";
                uploadBtn.disabled = false;
              }
            }
          );
          startOptionsSection.appendChild(loadGameUploadRow);
        } else {
          // Create the full-width Load Game button
          const isCloudSynced = saveData.isCloudSynced || false;
          const loadGameButton = createLoadGameButtonFullWidth(
            saveData,
            playedTimeStr,
            isCloudSynced,
            () => this.hide()
          );
          startOptionsSection.appendChild(loadGameButton);
        }
      }

      const cloudButtonArea = document.createElement("div");
      cloudButtonArea.id = "splash-cloud-button-area";
      startOptionsSection.appendChild(cloudButtonArea);

      if (this.installPrompt) {
        const installButton = createInstallButton(async () => {
          // ... install logic
        });
        startOptionsSection.appendChild(installButton);
      }

      startOptionsSection.classList.add("visible");
      setTimeout(() => startOptionsSection.classList.add("show"), 100);

      window.domMapper?.mapCategory("splashButtons");
      window.domMapper?.add("splash.startOptions", startOptionsSection);
      window.domMapper?.add("splash.cloudButtonArea", cloudButtonArea);
      this.setupGoogleDriveButtons(cloudButtonArea);
    }
  }

  async setupGoogleDriveButtons(cloudButtonArea) {
    if (!window.googleDriveSave) {
      console.warn("GoogleDriveSave not initialized.");
      return;
    }
    // Check if Google Drive is properly configured
    if (!window.googleDriveSave.isConfigured()) {
      cloudButtonArea.innerHTML = "";
      return;
    }
    // Show loading state while initializing
    cloudButtonArea.innerHTML = "";
    const loadingBtn = createLoadingButton("Checking Google Drive...");
    cloudButtonArea.appendChild(loadingBtn);
    try {
      const initialized = await window.googleDriveSave.init();
      if (!initialized) {
        cloudButtonArea.innerHTML = "";
        return;
      }
      // Check auth status without triggering popup
      const isSignedIn = await window.googleDriveSave.checkAuth(true);
      await this.updateGoogleDriveUI(isSignedIn, cloudButtonArea);
    } catch (error) {
      console.error("Failed to setup Google Drive buttons:", error);
      cloudButtonArea.innerHTML = "Google Drive Error";
    }
  }

  async updateGoogleDriveUI(isSignedIn, cloudButtonArea) {
    cloudButtonArea.innerHTML = "";
    if (isSignedIn) {
      // Check if there's a save file in the cloud
      try {
        const fileFound = await window.googleDriveSave.findSaveFile();
        const fileId = window.googleDriveSave.saveFileId;
        if (fileId) {
          // Try to load save data to get last save time, etc.
          let saveData = {};
          let playedTimeStr = "";
          try {
            saveData = await window.googleDriveSave.load();
            const totalPlayedMs = saveData.total_played_time || 0;
            playedTimeStr = this.formatTime(totalPlayedMs);
          } catch (error) {
            // fallback to empty
          }
          const cloudBtn = createLoadFromCloudButton(async () => {
            try {
              console.log("[DEBUG] Loading from Google Drive...");
              const cloudSaveData = await window.googleDriveSave.load();
              if (cloudSaveData) {
                console.log("[DEBUG] Cloud save data loaded successfully");
                if (window.splashManager) {
                  console.log("[DEBUG] Hiding splash manager...");
                  window.splashManager.hide();
                }
                await new Promise((resolve) => setTimeout(resolve, 600));
                if (window.pageRouter && window.ui && window.game) {
                  console.log("[DEBUG] Applying save state...");
                  window.game.applySaveState(cloudSaveData);
                  // Call the startGame function that should be available globally
                  if (typeof window.startGame === "function") {
                    console.log("[DEBUG] Calling global startGame function...");
                    await window.startGame(
                      window.pageRouter,
                      window.ui,
                      window.game
                    );
                  } else {
                    console.error("startGame function not available globally");
                    // Fallback: try to trigger the game start manually
                    await window.pageRouter.loadGameLayout();
                    window.ui.initMainLayout();
                    await window.pageRouter.loadPage("reactor_section");
                    window.game.tooltip_manager = new (
                      await import("./tooltip.js")
                    ).TooltipManager("#main", "#tooltip", window.game);
                    window.game.engine = new (
                      await import("./engine.js")
                    ).Engine(window.game);
                    window.game.startSession();
                    window.game.engine.start();
                  }
                } else {
                  console.error(
                    "[DEBUG] Required global objects not available:",
                    {
                      pageRouter: !!window.pageRouter,
                      ui: !!window.ui,
                      game: !!window.game,
                    }
                  );
                }
              } else {
                alert("Could not find a save file in Google Drive.");
              }
            } catch (error) {
              console.error("Failed to load from Google Drive:", error);
              alert(`Error loading from Google Drive: ${error.message}`);
            }
          });
          cloudButtonArea.appendChild(cloudBtn);
        } else {
          // No cloud save, show info
          const info = document.createElement("div");
          info.textContent = "No cloud save found.";
          cloudButtonArea.appendChild(info);
        }
      } catch (error) {
        cloudButtonArea.innerHTML = "Cloud check failed.";
      }
    } else {
      // Not signed in, show Google Sign In button
      const signInBtn = createGoogleSignInButton(async () => {
        try {
          signInBtn.disabled = true;
          signInBtn.querySelector("span").textContent = "Signing in...";
          await window.googleDriveSave.signIn();
          await this.updateGoogleDriveUI(true, cloudButtonArea);
        } catch (error) {
          signInBtn.querySelector("span").textContent = "Sign in Failed";
          setTimeout(() => {
            signInBtn.querySelector("span").textContent = "Google Sign In";
            signInBtn.disabled = false;
          }, 2000);
        }
      });
      cloudButtonArea.appendChild(signInBtn);
    }
  }

  hide() {
    console.log("[DEBUG] SplashManager.hide() called");
    console.log("[DEBUG] splashScreen exists:", !!this.splashScreen);
    console.log("[DEBUG] isReady:", this.isReady);

    if (this.splashScreen && !this.isReady) {
      console.log("[DEBUG] Hiding splash screen...");
      this.isReady = true;

      // Stop flavor text rotation
      this.stopFlavorText();

      // Clear any error timeout
      if (this.errorTimeout) {
        clearTimeout(this.errorTimeout);
        this.errorTimeout = null;
      }

      console.log("[DEBUG] Adding fade-out class...");
      this.splashScreen.classList.add("fade-out");
      setTimeout(() => {
        console.log("[DEBUG] Adding hidden class...");
        this.splashScreen.classList.add("hidden");
        console.log(
          "[DEBUG] Splash screen classes:",
          this.splashScreen.className
        );
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
    } else {
      console.log("[DEBUG] Splash screen already hidden or not ready");
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

    loadFromCloudButton.classList.add("visible", "cloud-loading");
    const loadingButton = createLoadingButton("Checking for cloud save...");
    loadFromCloudButton.innerHTML = loadingButton.innerHTML;
    loadFromCloudButton.disabled = true;
  }

  // Hide loading state on cloud save button
  hideCloudSaveLoading(loadFromCloudButton) {
    if (!loadFromCloudButton) return;

    loadFromCloudButton.classList.remove("cloud-loading");
    loadFromCloudButton.disabled = false;
    // The actual content will be set by the calling function based on whether a save was found
  }

  // Show loading state during Google Drive initialization
  showGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.add("visible", "google-loading");
      const loadingButton = createLoadingButton("Initializing Google Drive...");
      signInButton.innerHTML = loadingButton.innerHTML;
      signInButton.disabled = true;
    }

    if (loadFromCloudButton) {
      loadFromCloudButton.classList.remove("visible");
    }
  }

  // Hide loading state after Google Drive initialization
  hideGoogleDriveInitializing(signInButton, loadFromCloudButton) {
    if (signInButton) {
      signInButton.classList.remove("google-loading");
      signInButton.disabled = false;
      // Reset button content to normal Google Sign In button
      const newButton = createGoogleSignInButtonWithIcon();
      signInButton.innerHTML = newButton.innerHTML;
    }
  }

  // Refresh save options after upload/download operations
  async refreshSaveOptions() {
    await this.showStartOptions(!!localStorage.getItem("reactorGameSave"));
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
      installButton.classList.add("hidden");
    }
  });
}

window.addEventListener("appinstalled", () => {
  console.log("PWA was installed");
  deferredPrompt = null;
  if (installButton) {
    installButton.classList.add("hidden");
  }
});
