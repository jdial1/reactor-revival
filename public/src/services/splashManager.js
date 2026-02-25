import { StorageUtils, isTestEnv } from "../utils/util.js";
import { escapeHtml } from "../utils/stringUtils.js";
import dataService from "./dataService.js";
import { supabaseSave } from "./SupabaseSave.js";
import { settingsModal } from "../components/settingsModal.js";
import {
  createGoogleSignInButton,
  createLoadingButton,
  createGoogleSignInButtonWithIcon,
} from "../components/buttonFactory.js";
import { runLoadSplashScreen, runSetStep, runSetSubStep } from "./splash/splashFlow.js";
import { SplashFlowController } from "./splash/SplashFlowController.js";
import { SplashUIManager } from "./splash/SplashUIManager.js";
import { VersionChecker } from "./versionChecker.js";
import { SplashSaveSlotUI } from "./splashSaveSlotUI.js";
import { initSocketConnection as initSplashSocket } from "./splashSocketService.js";
import { SplashStartOptionsBuilder } from "./splash/splashStartOptionsBuilder.js";
import { setupSplashAuth } from "./splash/splashAuthUI.js";
import { updateSplashGoogleDriveUI } from "./splash/splashGoogleDriveUI.js";
import { fetchVersionForSplash, addSplashStats as addSplashStatsFromModule } from "./splash/splashVersionStats.js";
import { loadFromSaveSlot as loadFromSaveSlotFromModule, loadFromData as loadFromDataFromModule } from "./splash/splashLoadFromSave.js";
import { logger } from "../utils/logger.js";
import { BaseComponent } from "../components/BaseComponent.js";

let flavorMessages = [];
dataService.loadFlavorText().then(messages => {
  flavorMessages = messages;
}).catch(error => {
  logger.log('warn', 'splash', 'Failed to load flavor text:', error);
  flavorMessages = ["Loading..."];
});

class SplashScreenManager extends BaseComponent {
  constructor() {
    super();
    this.splashScreen = null;
    this.statusElement = null;
    this.flavorElement = null;
    this._appContext = null;



    this.flowController = new SplashFlowController();
    this.loadingSteps = this.flowController.loadingSteps;
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.uiManager = new SplashUIManager({ statusElement: null, flavorElement: null, splashScreen: null });
    this.versionChecker = new VersionChecker(this);
    this.saveSlotUI = new SplashSaveSlotUI(this);

    if (!StorageUtils.get("reactor_user_id")) {
      StorageUtils.set("reactor_user_id", crypto.randomUUID());
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;

    if (!isTestEnv()) {
      this.initSocketConnection();
    }

    // Listen for service worker messages
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      });
    }
  }

  async initSocketConnection() {
    await initSplashSocket(this);
  }

  updateUserCountDisplay() {
    const userCountElement = document.getElementById('user-count-text');
    if (userCountElement) {
        userCountElement.textContent = `${this.userCount}`;
    }
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

    return this.loadSplashScreen();
  }



  async loadSplashScreen() {
    return runLoadSplashScreen(this);
  }



  async initializeSplashStats() {
    if (!this.splashScreen) return;
    const version = await fetchVersionForSplash(this.versionChecker);
    addSplashStatsFromModule(this.splashScreen, version, this.versionChecker);
    this.versionChecker.startVersionChecking();
  }

  // Return list of critical UI asset paths to pre-cache
  // (helper functions declared after class)





  async showSaveSlotSelection(localSaveSlots) {
    await this.saveSlotUI.showSaveSlotSelection(localSaveSlots);
  }

  async loadFromData(saveData) {
    await loadFromDataFromModule(this, saveData, this._appContext);
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  async loadFromSaveSlot(slot) {
    await loadFromSaveSlotFromModule(this, slot, this._appContext);
  }

  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    this.uiManager.setRefs({ statusElement: this.statusElement, flavorElement: this.flavorElement, splashScreen: this.splashScreen });
    this.uiManager.updateStatus(message, flavorMessages);
  }

  startFlavorText() {
    this.uiManager.setRefs({ statusElement: this.statusElement, flavorElement: this.flavorElement, splashScreen: this.splashScreen });
    this.uiManager.startFlavorText(flavorMessages);
  }

  showRandomFlavorText() {
    this.uiManager.showRandomFlavorText(flavorMessages);
  }

  stopFlavorText() {
    this.uiManager.stopFlavorText();
  }

  nextStep() {
    this.flowController.nextStep((msg) => this.updateStatus(msg));
    this.currentStep = this.flowController.currentStep;
  }

  async setStep(stepId) {
    await this.ensureReady();
    runSetStep(this, stepId, flavorMessages);
  }

  async setSubStep(message) {
    await this.ensureReady();
    runSetSubStep(this, message, flavorMessages);
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (!this.splashScreen || this.isReady) return;

    this.stopFlavorText();
    const spinner = this.splashScreen?.querySelector(".splash-spinner");
    if (spinner) spinner.classList.add("splash-element-hidden");
    if (this.statusElement) this.statusElement.classList.add("splash-element-hidden");
    if (this.flavorElement && flavorMessages && flavorMessages.length > 0) {
      if (!this.flavorElement.textContent) {
        const randomIndex = Math.floor(Math.random() * flavorMessages.length);
        this.flavorElement.textContent = flavorMessages[randomIndex];
      }
      this.flavorElement.classList.remove("splash-element-hidden");
      this.flavorElement.classList.add("splash-element-visible");
    }

    let startOptionsSection = this.splashScreen?.querySelector(".splash-start-options");
    if (!startOptionsSection) {
      startOptionsSection = document.createElement("div");
      startOptionsSection.id = "splash-start-options";
      startOptionsSection.className = "splash-start-options";
      this.splashScreen.querySelector(".splash-menu-panel").appendChild(startOptionsSection);
    }
    startOptionsSection.innerHTML = "";

    const builder = new SplashStartOptionsBuilder(this, this._appContext);
    const { hasSave, saveSlots, cloudSaveOnly, cloudSaveData, mostRecentSave } = await builder.buildSaveSlotList(canLoadGame);

    const continueBtn = builder.buildContinueButton(mostRecentSave);
    if (continueBtn) startOptionsSection.appendChild(continueBtn);

    if (cloudSaveOnly && cloudSaveData && !hasSave) {
      const cloudBtn = builder.buildCloudContinueButton(cloudSaveData);
      if (cloudBtn) startOptionsSection.appendChild(cloudBtn);
    }

    if (hasSave || (cloudSaveOnly && cloudSaveData)) {
      startOptionsSection.appendChild(builder.buildSpacer());
    }

    const newGameBtn = builder.buildNewGameButton(hasSave);
    if (newGameBtn) startOptionsSection.appendChild(newGameBtn);

    startOptionsSection.appendChild(builder.buildLoadGameButton(saveSlots));
    startOptionsSection.appendChild(builder.buildStandardButtons());

    const sabWarning = builder.buildSabWarning();
    if (sabWarning) startOptionsSection.appendChild(sabWarning);

    const authArea = builder.buildAuthArea();
    const authRow = this.splashScreen.querySelector("#splash-auth-row");
    if (authRow) {
      authRow.innerHTML = "";
      authRow.appendChild(authArea);
    } else {
      authArea.style.marginTop = "1rem";
      startOptionsSection.appendChild(authArea);
    }

    startOptionsSection.classList.add("visible");
    setTimeout(() => startOptionsSection.classList.add("show"), 100);
  }

  async setupSupabaseAuth(container) {
    return setupSplashAuth(container, this);
  }

  async setupGoogleDriveButtons(cloudButtonArea) {
    if (!window.googleDriveSave) {
      logger.warn("GoogleDriveSave not initialized.");
      return;
    }
    // Check if Google Drive is properly configured
    if (!window.googleDriveSave.isConfigured()) {
      cloudButtonArea.innerHTML = "";
      return;
    }
    // If offline, show disabled button with tooltip and skip network calls
    if (!navigator.onLine) {
      cloudButtonArea.innerHTML = "";
      const signInBtn = createGoogleSignInButton(() => { });
      if (signInBtn) {
        signInBtn.disabled = true;
        signInBtn.title = "Requires an internet connection";
        cloudButtonArea.appendChild(signInBtn);
      }
      return;
    }
    // Show loading state while initializing
    cloudButtonArea.innerHTML = "";
    const loadingBtn = createLoadingButton("Checking ...");
    loadingBtn.classList.add("splash-btn-google"); // Ensure margin is consistent
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
      logger.log('error', 'splash', 'Failed to setup Google Drive buttons:', error);
      cloudButtonArea.innerHTML = "Google Drive Error";
    }
  }

  async updateGoogleDriveUI(isSignedIn, cloudButtonArea) {
    await updateSplashGoogleDriveUI(this, isSignedIn, cloudButtonArea);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;
    this.stopFlavorText();
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.uiManager.setRefs({ statusElement: this.statusElement, flavorElement: this.flavorElement, splashScreen: this.splashScreen });
    this.uiManager.hide(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SPLASH_HIDDEN" });
      }
    });
  }

  show() {
    if (this.splashScreen) {
      this.uiManager.setRefs({ statusElement: this.statusElement, flavorElement: this.flavorElement, splashScreen: this.splashScreen });
      this.uiManager.show();
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

  forceHide() {
    if (this.splashScreen) {
      this.isReady = true;
      this.uiManager.forceHide();
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
    const loadingButton = createLoadingButton("Checking...");
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
      const loadingButton = createLoadingButton("Initializing...");
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
    await this.showStartOptions(!!StorageUtils.getRaw("reactorGameSave"));
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('splash-screen')) {
      generateSplashBackground();
    } else {
      logger.log('warn', 'splash', 'Splash screen element not found, skipping dynamic background generation.');
    }
  });
}

export function getFlavorMessages() {
  return flavorMessages;
}

export function createSplashManager() {
  return new SplashScreenManager();
}

export { SplashScreenManager };
