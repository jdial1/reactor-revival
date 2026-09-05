import { teardownAll } from "../../core/teardown.js";
import { BaseComponent } from "../../dom/lit.js";
import { logger } from "../../core/logger.js";
import { isTestEnv } from "../../simUtils.js";
import { getAppContext } from "../../app-context.js";
import { LEADERBOARD_CONFIG } from "../../constants/balance.js";
import { StorageUtils, StorageAdapter } from "../../storage/index.js";
import { VersionChecker, setupInstallPrompt } from "../../services/pwa.js";
import { getUiElement } from "../shell/page-dom.js";
import { firstByClass, forEachByClass, setClassFlag } from "../../dom/class-flags.js";
import { initSplashMenuIdleFade } from "./idle-fade.js";
import { fetchVersionForSplash, mountSplashUserCountReactive, addSplashStats } from "./version.js";
import { SplashUIManager } from "./ui-manager.js";
import { SplashSaveSlotUI } from "./save-slots.js";
import { SplashStartOptionsBuilder } from "./start-options.js";
import {
  runLoadSplashScreen,
  runSetStep,
  runSetSubStep,
  loadFromDataImpl,
  loadFromSaveSlotImpl,
} from "./load-flow.js";

const LOADING_STEPS = [
  { id: "init", message: "Initializing reactor systems..." },
  { id: "ui", message: "Calibrating control panels..." },
  { id: "game", message: "Spinning up nuclear protocols..." },
  { id: "parts", message: "Installing reactor components..." },
  { id: "upgrades", message: "Analyzing technological blueprints..." },
  { id: "objectives", message: "Briefing mission parameters..." },
  { id: "engine", message: "Achieving critical mass..." },
  { id: "ready", message: "Reactor online - All systems nominal!" },
];

class SplashScreenManager extends BaseComponent {
  constructor() {
    super();
    this.splashScreen = null;
    this.statusElement = null;
    this._appContext = null;

    this.loadingSteps = LOADING_STEPS;
    this.currentStep = 0;
    this.isReady = false;
    this.errorTimeout = null;
    this.installPrompt = null;
    this.uiManager = new SplashUIManager({ statusElement: null, splashScreen: null });
    this.versionChecker = new VersionChecker(this);
    setupInstallPrompt(this);
    this.saveSlotUI = new SplashSaveSlotUI(this);

    if (!StorageUtils.get("reactor_user_id")) {
      StorageUtils.set("reactor_user_id", "local_architect");
    }

    this.readyPromise = isTestEnv() ? Promise.resolve(false) : this.waitForDOMAndLoad();
    this.socket = null;
    this.userCount = 0;
    this._signalJumpEnabled = false;
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    this._vholdBootTimeout = null;
    this._resumeGlowHandlers = [];
    this._splashReactiveUnmounts = [];

    if (!isTestEnv()) {
      this.initSocketConnection();
    }

    if ("serviceWorker" in navigator) {
      const ac = new AbortController();
      this._serviceWorkerAbortController = ac;
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data && event.data.type === "HIDE_SPLASH") {
          this.hide();
        }
      }, { signal: ac.signal });
    }
  }

  async initSocketConnection() {
    if (typeof navigator !== "undefined" && !navigator.onLine) return null;
    if (typeof io === "undefined") return null;
    const isLocalhost =
      typeof window !== "undefined" &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (isLocalhost) return null;
    try {
      const apiUrl = LEADERBOARD_CONFIG.API_URL;
      const socket = io(apiUrl, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 3000,
        reconnectionAttempts: 3,
      });
      this.socket = socket;
      socket.on("connect", () => {});
      socket.on("userCount", (count) => {
        this.userCount = count;
        this.updateUserCountDisplay();
      });
      socket.on("disconnect", () => {});
      socket.on("connect_error", (error) => {
        logger.log("debug", "splash", "Socket.IO connection error:", error);
      });
      return socket;
    } catch (error) {
      logger.log("debug", "splash", "Failed to initialize Socket.IO:", error);
      return null;
    }
  }

  updateUserCountDisplay() {
    const ui = this._appContext?.ui;
    if (ui?.uiState) ui.uiState.user_count = this.userCount;
  }

  async waitForDOMAndLoad() {
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
    const ui = this._appContext?.ui;
    if (ui?.uiState) {
      ui.uiState.version = version;
      ui.uiState.user_count = this.userCount;
    }
    teardownAll(this._splashReactiveUnmounts);
    this._splashReactiveUnmounts = [];
    const userCountUnmount = mountSplashUserCountReactive(this.splashScreen, ui);
    if (typeof userCountUnmount === "function") this._splashReactiveUnmounts.push(userCountUnmount);
    const versionUnmount = addSplashStats(this.splashScreen, version, this.versionChecker, ui);
    if (typeof versionUnmount === "function") this._splashReactiveUnmounts.push(versionUnmount);
    this.versionChecker.startVersionChecking();
  }

  async showSaveSlotSelection(localSaveSlots) {
    await this.saveSlotUI.showSaveSlotSelection(localSaveSlots);
  }

  async loadFromData(saveData) {
    await loadFromDataImpl(this, saveData, this._appContext);
  }

  setAppContext(ctx) {
    this._appContext = ctx;
  }

  async loadFromSaveSlot(slot) {
    await loadFromSaveSlotImpl(this, slot, this._appContext);
  }

  async ensureReady() {
    if (this.readyPromise) {
      await this.readyPromise;
    }
  }

  updateStatus(message) {
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.updateStatus(message);
  }

  stopFlavorText() {
    this.uiManager.stopFlavorText();
  }

  nextStep() {
    if (this.currentStep < this.loadingSteps.length - 1) {
      this.currentStep++;
      this.updateStatus(this.loadingSteps[this.currentStep].message);
    }
  }

  async setStep(stepId) {
    await this.ensureReady();
    runSetStep(this, stepId);
  }

  async setSubStep(message) {
    await this.ensureReady();
    runSetSubStep(this, message);
  }

  async showStartOptions(canLoadGame = true) {
    await this.ensureReady();
    if (!this.splashScreen || this.isReady) return;

    const splashScreen = this.splashScreen;
    setClassFlag(splashScreen, "splash-vhold-booting", false);
    void splashScreen.offsetHeight;
    setClassFlag(splashScreen, "splash-vhold-booting", true);
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = setTimeout(() => setClassFlag(splashScreen, "splash-vhold-booting", false), 900);
    const audio = this._appContext?.game?.audio ?? getAppContext()?.game?.audio;
    audio?.play?.("crt_whine");

    const menuPanel = firstByClass(splashScreen, "splash-menu-panel");
    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    setClassFlag(menuPanel, "splash-signal-jump", false);

    this._signalJumpEnabled = true;
    const jumpOnce = () => {
      if (!this._signalJumpEnabled || !menuPanel) return;
      const amp = 2 + Math.random();
      const dir = Math.random() < 0.5 ? -1 : 1;
      menuPanel.style.setProperty("--splash-jump-y", `${dir * amp}px`);
      setClassFlag(menuPanel, "splash-signal-jump", false);
      void menuPanel.offsetHeight;
      setClassFlag(menuPanel, "splash-signal-jump", true);
      if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
      this._signalJumpResetTimeout = setTimeout(() => setClassFlag(menuPanel, "splash-signal-jump", false), 230);
      const nextDelayMs = 1200 + Math.random() * 2600;
      this._signalJumpLoopTimeout = setTimeout(jumpOnce, nextDelayMs);
    };
    const initialDelayMs = 1100 + Math.random() * 1500;
    this._signalJumpLoopTimeout = setTimeout(jumpOnce, initialDelayMs);

    this.stopFlavorText();
    setClassFlag(firstByClass(splashScreen, "splash-spinner"), "splash-element-hidden", true);
    setClassFlag(this.statusElement, "splash-element-hidden", true);

    let startOptionsSection = getUiElement(null, "splash-start-options")
      ?? firstByClass(splashScreen, "splash-start-options");
    if (!startOptionsSection) {
      startOptionsSection = document.createElement("div");
      startOptionsSection.id = "splash-start-options";
      startOptionsSection.className = "splash-start-options";
      (firstByClass(splashScreen, "splash-menu-inner") ?? menuPanel)?.appendChild(startOptionsSection);
    }

    const builder = new SplashStartOptionsBuilder(this, this._appContext);
    const state = await builder.buildSaveSlotList(canLoadGame);
    builder.renderTo(startOptionsSection, state);

    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;
    const splashRoot = splashScreen;
    const active = new Set();
    const updateGlow = () => {
      setClassFlag(splashRoot, "splash-bezel-glow-hot", active.size > 0);
    };
    const onEnter = (e) => {
      active.add(e.currentTarget);
      updateGlow();
    };
    const onLeave = (e) => {
      active.delete(e.currentTarget);
      updateGlow();
    };
    forEachByClass(splashRoot, "splash-btn-resume-primary", (btn) => {
      btn.addEventListener("pointerenter", onEnter);
      btn.addEventListener("pointerleave", onLeave);
      btn.addEventListener("focus", onEnter);
      btn.addEventListener("blur", onLeave);
      if (btn.matches(":hover")) active.add(btn);
      this._resumeGlowHandlers.push({ el: btn, onEnter, onLeave });
    });
    updateGlow();

    setClassFlag(startOptionsSection, "visible", true);
    setTimeout(() => setClassFlag(startOptionsSection, "show", true), 100);

    this.teardownIdleFade?.();
    if (menuPanel) this.teardownIdleFade = initSplashMenuIdleFade(menuPanel);
  }

  hide() {
    if (!this.splashScreen || this.isReady) return;
    this.isReady = true;

    this._signalJumpEnabled = false;
    if (this._signalJumpLoopTimeout) clearTimeout(this._signalJumpLoopTimeout);
    if (this._signalJumpResetTimeout) clearTimeout(this._signalJumpResetTimeout);
    this._signalJumpLoopTimeout = null;
    this._signalJumpResetTimeout = null;
    if (this._vholdBootTimeout) clearTimeout(this._vholdBootTimeout);
    this._vholdBootTimeout = null;
    setClassFlag(this.splashScreen, "splash-vhold-booting", false);
    setClassFlag(firstByClass(this.splashScreen, "splash-menu-panel"), "splash-signal-jump", false);
    setClassFlag(this.splashScreen, "splash-bezel-glow-hot", false);
    this._resumeGlowHandlers.forEach(({ el, onEnter, onLeave }) => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("focus", onEnter);
      el.removeEventListener("blur", onLeave);
    });
    this._resumeGlowHandlers.length = 0;

    this.teardownIdleFade?.();
    this.teardownIdleFade = null;
    if (this._splashReactiveUnmounts?.length) {
      teardownAll(this._splashReactiveUnmounts);
      this._splashReactiveUnmounts = [];
    }
    if (this._serviceWorkerAbortController) {
      this._serviceWorkerAbortController.abort();
      this._serviceWorkerAbortController = null;
    }
    this.stopFlavorText();
    if (this.versionCheckInterval) {
      clearInterval(this.versionCheckInterval);
      this.versionCheckInterval = null;
    }
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
    this.uiManager.hide(() => {
      if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "SPLASH_HIDDEN" });
      }
    });
  }

  show() {
    if (this.splashScreen) {
      this.uiManager.setRefs({ statusElement: this.statusElement, splashScreen: this.splashScreen });
      this.uiManager.show();
      this.isReady = false;
    }
  }

  showError(message, autoHide = true) {
    this.updateStatus(`Error: ${message}`);
    if (autoHide) {
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

  async refreshSaveOptions() {
    await this.showStartOptions(!!(await StorageAdapter.getRaw("reactorGameSave")));
  }
}

export const createSplashManager = () => new SplashScreenManager();
