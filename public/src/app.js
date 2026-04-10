import { Game, Engine } from "./logic.js";
import { StorageUtils, StorageAdapter, isTestEnv, migrateLocalStorageToIndexedDB, setFormatPreferencesGetter, logger, classMap, StorageUtilsAsync, setSlot1FromBackupAsync, UPDATE_TOAST_STYLES, FOUNDATIONAL_TICK_MS, MAX_ACCUMULATOR_MULTIPLIER, BASE_MAX_HEAT, BASE_MAX_POWER } from "./utils.js";
import { html, render } from "lit-html";
import { UI } from "./components/ui.js";
import { MODAL_IDS } from "./components/ui-modals.js";
import { updateSectionCountsState, getCompactLayout } from "./components/ui-components.js";
import dataService, { AudioService, createSplashManager } from "./services.js";
import { getValidatedPreferences, initPreferencesStore, preferences, subscribeKey, showLoadBackupModal } from "./state.js";
import { TooltipManager, TutorialManager } from "./components/ui-tooltips-tutorial.js";
import { ReactiveLitComponent } from "./components/reactive-lit-component.js";
import {
  renderSplashTemplate,
  gameSetupTemplate,
  updateToastTemplate,
  fallbackStartTemplate,
  criticalErrorTemplate,
} from "./templates/appTemplates.js";
import {
  gameShellTemplate,
  pageSectionTemplates,
  pageLoadErrorTemplate,
} from "./templates/pageTemplates.js";

setFormatPreferencesGetter(getValidatedPreferences);

if (typeof window !== "undefined") {
  window.splashManager ??= createSplashManager();
  window.showLoadBackupModal = showLoadBackupModal;
  window.setSlot1FromBackup = () => setSlot1FromBackupAsync();
}

export class PageRouter {
  constructor(ui) {
    this.ui = ui;
    this.pages = {
      reactor_section: { template: pageSectionTemplates.reactor_section },
      upgrades_section: { template: pageSectionTemplates.upgrades_section },
      experimental_upgrades_section: {
        template: pageSectionTemplates.experimental_upgrades_section,
      },
      soundboard_section: { template: pageSectionTemplates.soundboard_section },
      about_section: { template: pageSectionTemplates.about_section },
      privacy_policy_section: {
        template: pageSectionTemplates.privacy_policy_section,
        stateless: true,
      },
      terms_of_service_section: {
        template: pageSectionTemplates.terms_of_service_section,
        stateless: true,
      },
      leaderboard_section: { template: pageSectionTemplates.leaderboard_section },
    };
    this.pageCache = new Map();
    this.initializedPages = new Set();
    this.currentPageId = null;
    this.navigationPaused = false;
    this.isNavigating = false;
    this.contentAreaSelector = "#page_content_area";
    this._epHumUnsub = null;
  }

  _triggerCrtFlash() {
    const el = document.querySelector(this.contentAreaSelector);
    if (!el) return;
    el.classList.remove("crt-content-flash");
    void el.offsetWidth;
    el.classList.add("crt-content-flash");
    setTimeout(() => el.classList.remove("crt-content-flash"), 150);
  }

  _playTabNavAudio(pageId) {
    const audio = this.ui.game?.audio;
    if (!audio) return;
    audio.play("tab_switch");
    if (pageId === "upgrades_section" || pageId === "experimental_upgrades_section") {
      audio.play("tab_relay_thud");
    }
  }

  _syncResearchEpHumPage(pageId) {
    if (this._epHumUnsub) {
      this._epHumUnsub();
      this._epHumUnsub = null;
    }
    const audio = this.ui.game?.audio;
    if (!audio) return;
    if (pageId !== "experimental_upgrades_section") {
      audio.stopResearchEpHum();
      return;
    }
    const game = this.ui.game;
    const sync = () => audio.syncResearchEpHum(game);
    sync();
    if (game?.state) {
      this._epHumUnsub = subscribeKey(game.state, "current_exotic_particles", sync);
    }
  }

  _applyPauseStateForNavigation(wasOnReactorPage, goingToReactorPage) {
    if (!this.ui.game?.engine) return;
    if (wasOnReactorPage && !goingToReactorPage) {
      this.ui.partsPanelUI?.closePartsPanel?.();
      const currentlyPaused = this.ui.stateManager.getVar("pause");
      if (!currentlyPaused) {
        this.navigationPaused = true;
        this.isNavigating = true;
        this.ui.game.pause();
        this.isNavigating = false;
      } else {
        this.navigationPaused = false;
      }
      return;
    }
    if (!wasOnReactorPage && goingToReactorPage) {
      if (this.navigationPaused) {
        this.navigationPaused = false;
        this.isNavigating = true;
        this.ui.game.resume();
        this.isNavigating = false;
      } else {
        const shouldBePaused = !!this.ui.stateManager.getVar("pause");
        if (shouldBePaused && !this.ui.game.paused) {
          this.ui.game.pause();
        }
      }
    }
  }

  async loadPage(pageId, force = false) {
    if (!force && this.ui.game.reactor.has_melted_down) {
      return;
    }
    if (!force && this.currentPageId === pageId) {
      return;
    }

    const wasOnReactorPage = this.currentPageId === "reactor_section";
    const goingToReactorPage = pageId === "reactor_section";
    this._applyPauseStateForNavigation(wasOnReactorPage, goingToReactorPage);

    if (this.currentPageId === "upgrades_section" && goingToReactorPage) {
      const pageInit = this.ui.pageInitUI;
      if (pageInit) {
        pageInit.setReactorVisibility(false);
        setTimeout(() => pageInit.setReactorVisibility(true), 250);
      }
    }

    const earlyPageDef = this.pages[pageId];
    if (earlyPageDef && earlyPageDef.stateless) {
      const wrapper = document.getElementById("wrapper");
      if (!wrapper || wrapper.classList.contains("hidden")) {
        await this.loadGameLayout();
      }
    }

    const pageContentArea = document.querySelector(this.contentAreaSelector);
    if (!pageContentArea) {
      logger.log('error', 'ui', `PageRouter: Content area "${this.contentAreaSelector}" not found.`);
      return;
    }

    if (this.currentPageId && this.pageCache.has(this.currentPageId)) {
      this.pageCache.get(this.currentPageId).classList.add("hidden");
    }

    const hadPreviousPage = this.currentPageId != null;
    this.currentPageId = pageId;
    window.location.hash = pageId;
    if (this.ui?.uiState) this.ui.uiState.active_page = pageId;

    this.cleanupUIForStatelessPage(pageId);

    if (this.pageCache.has(pageId)) {
      const cachedPage = this.pageCache.get(pageId);
      cachedPage.classList.remove("hidden");

      this.ui.pageInitUI.initializePage(pageId);

      if (pageId === "reactor_section" && this.ui.resizeReactor) {
        this.ui.resizeReactor();
        setTimeout(() => {
          this.ui.resizeReactor();
          this.ui.pageInitUI?.setReactorVisibility(true);
        }, 100);
      } else if (pageId === "experimental_upgrades_section") {
        this.ui.pageInitUI.loadAndSetVersion();
      }

      if (hadPreviousPage) this._playTabNavAudio(pageId);
      if (hadPreviousPage) this._triggerCrtFlash();
      this._syncResearchEpHumPage(pageId);
      return;
    }

    const pagesToScroll = [
      "reactor_section",
      "upgrades_section",
      "experimental_upgrades_section",
    ];
    if (pagesToScroll.includes(pageId)) {
      const contentArea = document.querySelector("#main_content_wrapper");
      if (contentArea) {
        contentArea.scrollTop = 0;
      }
    }

    const pageDef = this.pages[pageId];
    if (!pageDef) {
      logger.error(
        `PageRouter: Page definition not found for ID "${pageId}".`
      );
      return;
    }



    try {
      const tempContainer = document.createElement("div");
      render(pageDef.template(), tempContainer);
      const newPageElement = tempContainer.firstElementChild;

      if (newPageElement && newPageElement.classList.contains("page")) {
        pageContentArea.appendChild(newPageElement);
        this.pageCache.set(pageId, newPageElement);

        requestAnimationFrame(() => {
          newPageElement.classList.remove("hidden");
        });

        if (!this.initializedPages.has(pageId)) {
          this.ui.pageInitUI.initializePage(pageId);
          this.initializedPages.add(pageId);
        }

        if (pageId === "reactor_section" && this.ui.resizeReactor) {
          setTimeout(() => {
            this.ui.resizeReactor();
            this.ui.pageInitUI?.setReactorVisibility(true);
          }, 100);
        }
        if (hadPreviousPage) this._playTabNavAudio(pageId);
        if (hadPreviousPage) this._triggerCrtFlash();
        this._syncResearchEpHumPage(pageId);
        this.ui.objectivesUI.showObjectivesForPage(pageId);
      } else {
        logger.log("warn", "ui", `PageRouter: No .page element found in loaded content for ${pageId}`);
      }
    } catch (error) {
      logger.error("PageRouter: Failed to render page \"%s\":", pageId, error);
      render(pageLoadErrorTemplate(), pageContentArea);
      if (this.currentPageId && this.ui?.uiState) this.ui.uiState.active_page = this.currentPageId;
    }
  }

  cleanupUIForStatelessPage(pageId) {
    const pageDef = this.pages[pageId];
    if (pageDef && pageDef.stateless) {
      const splashContainer = document.getElementById("splash-container");
      if (splashContainer) {
        splashContainer.style.display = "none";
      }


      const quickStartModal = document.getElementById("quick-start-modal");
      if (quickStartModal) {
        quickStartModal.style.display = "none";
      }

      const navElements = ["main_top_nav", "bottom_nav", "info_bar"];

      navElements.forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
          element.style.display = "none";
          element.style.visibility = "hidden";
          element.style.opacity = "0";
          element.style.height = "0";
          element.style.overflow = "hidden";
        }
      });

      if (pageId === "privacy_policy_section") {
        this.populatePrivacyPolicyDate();
      }

      const bodyClasses = document.body.className.split(" ");
      const cleanClasses = bodyClasses.filter(
        (cls) =>
          cls === `page-${pageId.replace("_section", "")}` ||
          (!cls.startsWith("page-") &&
            !cls.includes("panel") &&
            !cls.includes("open"))
      );
      document.body.className = cleanClasses.join(" ");

      if (
        !document.body.classList.contains(
          `page-${pageId.replace("_section", "")}`
        )
      ) {
        document.body.classList.add(`page-${pageId.replace("_section", "")}`);
      }
    }
  }

  async populatePrivacyPolicyDate() {
    try {
      const response = await fetch("version.json");
      if (response.ok) {
        const versionData = await response.json();
        const version = versionData.version;

        const parts = version.split("-")[0].split("_");
        if (parts.length === 3) {
          const day = parts[0];
          const month = parts[1];
          const year = "20" + parts[2];

          const monthNames = [
            "January",
            "February",
            "March",
            "April",
            "May",
            "June",
            "July",
            "August",
            "September",
            "October",
            "November",
            "December",
          ];

          const monthName = monthNames[parseInt(month) - 1];
          const formattedDate = `${monthName} ${day}, ${year}`;

          const dateElement = document.getElementById("privacy-policy-date");
          if (dateElement) {
            dateElement.textContent = formattedDate;
          }
        }
      }
    } catch (error) {
      logger.error("Failed to load version for privacy policy date:", error);
      const dateElement = document.getElementById("privacy-policy-date");
      if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      }
    }
  }



  loadGameLayout() {
    try {
      const wrapper = document.getElementById("wrapper");
      if (wrapper) {
        render(gameShellTemplate(), wrapper);
        wrapper.classList.remove("hidden");
      } else {
        logger.log("error", "ui", "PageRouter: #wrapper element not found to load game layout.");
      }
    } catch (error) {
      logger.log("error", "ui", "PageRouter: Failed to render game layout:", error);
    }
  }
}

export class AppRoot {
  constructor(container, game, ui) {
    this.container = container;
    this.game = game;
    this.ui = ui;
    this._bodyClassUnmount = null;
  }

  _setupBodyClassObserver() {
    if (!this.ui?.uiState || this._bodyClassUnmount) return;
    const syncBodyClasses = () => {
      if (typeof document !== "undefined" && document.body) {
        document.body.classList.toggle("game-paused", !!this.ui.uiState.is_paused);
        document.body.classList.toggle("reactor-meltdown", !!this.ui.uiState.is_melting_down);
      }
      const banner = typeof document !== "undefined" ? document.getElementById("meltdown_banner") : null;
      if (banner) banner.classList.toggle("hidden", !this.ui.uiState.is_melting_down);
    };
    syncBodyClasses();
    const unsub1 = subscribeKey(this.ui.uiState, "is_paused", syncBodyClasses);
    const unsub2 = subscribeKey(this.ui.uiState, "is_melting_down", syncBodyClasses);
    this._bodyClassUnmount = () => { try { unsub1(); } catch (_) {} try { unsub2(); } catch (_) {} };
  }

  render() {
    const hasSession = !!this.game?.lifecycleManager?.session_start_time;

    const template = html`
      ${this.renderSplash(hasSession)}
      <div id="wrapper" class=${classMap({ hidden: !hasSession })}></div>
      <div id="modal-root"></div>
    `;

    render(template, this.container);
    if (!hasSession) {
      const iconEl = this.container.querySelector(".splash-mute-icon");
      if (iconEl) {
        this._splashMuteUnmount = ReactiveLitComponent.mountMulti(
          [{ state: preferences, keys: ["mute"] }],
          () => html`<span class="splash-mute-led" data-muted=${preferences.mute ? "1" : "0"}></span>`,
          iconEl
        );
      }
    } else if (this._splashMuteUnmount) {
      this._splashMuteUnmount();
      this._splashMuteUnmount = null;
    }
  }

  renderSplash(hasSession) {
    if (hasSession) return null;

    const isMuted = !!preferences.mute;
    const handleMuteClick = (e) => {
      e.stopPropagation();
      if (this.ui?.uiState) this.ui.uiState.audio_muted = !this.ui.uiState.audio_muted;
      else {
        preferences.mute = !preferences.mute;
        this.game?.audio?.toggleMute(preferences.mute);
      }
    };
    const onHideMenuClick = (e) => {
      e.stopPropagation();
      const panel = e.currentTarget.closest(".splash-menu-panel");
      if (panel) panel.classList.add("splash-menu-fade-full");
    };
    return renderSplashTemplate(isMuted, handleMuteClick, onHideMenuClick);
  }

  teardown() {
    if (this._bodyClassUnmount) {
      this._bodyClassUnmount();
      this._bodyClassUnmount = null;
    }
  }
}

let _requestWakeLock = () => {};

function ensureGameSetupOverlay() {
  let overlay = document.getElementById("game-setup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "game-setup-overlay";
    overlay.className = "game-setup-overlay bios-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
}


let _showTechTreeInProgress = false;

export async function showTechTreeSelection(game, pageRouter, ui, splashManager) {
  if (_showTechTreeInProgress) return;
  _showTechTreeInProgress = true;
  try {
    const overlay = ensureGameSetupOverlay();
    const techTreeData = await dataService.loadTechTree();
    const treeList = Array.isArray(techTreeData) ? techTreeData : (techTreeData?.default ?? []);

    if (!treeList.length) {
      await startNewGameFlow(game, pageRouter, ui, splashManager, null);
      return;
    }

    let selectedDifficulty = null;
    let difficultyPresets;

    try {
      difficultyPresets = await dataService.loadDifficultyCurves();
    } catch (err) {
      logger.log('error', 'game', 'Failed to load difficulty curves:', err);
      return;
    }

    const renderSetup = () => {
      render(gameSetupTemplate(
        treeList,
        null,
        selectedDifficulty,
        () => {},
        (diff) => { selectedDifficulty = diff; renderSetup(); },
        () => {
          overlay.classList.add("hidden");
          setTimeout(() => overlay.remove(), 300);
        },
        async () => {
          const preset = difficultyPresets[selectedDifficulty];
          if (!preset) return;

          game.base_money = Number(preset.base_money);
          game.base_loop_wait = Number(preset.base_loop_wait);
          game.base_manual_heat_reduce = Number(preset.base_manual_heat_reduce);
          game.reactor.base_max_heat = BASE_MAX_HEAT;
          game.reactor.base_max_power = BASE_MAX_POWER;
          game.reactor.power_overflow_to_heat_ratio = Number(preset.power_overflow_to_heat_pct) / 100;
          game.tech_tree = treeList[0]?.id ?? null;

          overlay.classList.add("hidden");
          setTimeout(() => overlay.remove(), 300);

          try {
            await startNewGameFlow(game, pageRouter, ui, splashManager, null);
          } catch (error) {
            logger.log('error', 'game', 'Failed to start game:', error);
          }
        }
      ), overlay);
    };

    renderSetup();
    overlay.classList.remove("hidden");
  } finally {
    _showTechTreeInProgress = false;
  }
}

const SPLASH_HIDE_DELAY_MS_GAME = 600;

function hideSplashForNewGame(splashManager) {
  if (splashManager) splashManager.hide();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSplashHide() {
  await delay(SPLASH_HIDE_DELAY_MS_GAME);
}

async function clearStorageForNewGameFlow(game) {
  if (typeof window.clearAllGameDataForNewGame === "function") {
    await window.clearAllGameDataForNewGame(game);
  } else {
    try {
      await StorageUtilsAsync.remove("reactorGameSave");
      for (let i = 1; i <= 3; i++) await StorageUtilsAsync.remove(`reactorGameSave_${i}`);
      await StorageUtilsAsync.remove("reactorGameSave_Previous");
      await StorageUtilsAsync.remove("reactorGameSave_Backup");
      await StorageUtilsAsync.remove("reactorCurrentSaveSlot");
      StorageUtils.remove("reactorGameQuickStartShown");
      StorageUtils.remove("google_drive_save_file_id");
      StorageUtils.set("reactorNewGamePending", 1);
    } catch (_) { }
    delete game._saved_objective_index;
  }
}

async function initializeGameState(game) {
  try {
    await game.initialize_new_game_state();
  } catch (error) {
    logger.log('warn', 'game', 'Error during game initialization (non-fatal):', error);
  }
}

async function launchGame(pageRouter, ui, game) {
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
  } else {
    await pageRouter.loadGameLayout();
    ui.initMainLayout();
    await pageRouter.loadPage("reactor_section");
    game.startSession();
    game.engine.start();
  }
}

export async function startNewGameFlow(game, pageRouter, ui, splashManager, techTreeId) {
  try {
    hideSplashForNewGame(splashManager);
    await waitForSplashHide();
    await clearStorageForNewGameFlow(game);
    await initializeGameState(game);
    ui.stateManager?.setClickedPart?.(null);
    ui.setHelpModeActive?.(true);
    await launchGame(pageRouter, ui, game);
    StorageUtils.remove("reactorNewGamePending");
  } catch (error) {
    logger.log('error', 'game', 'Error in startNewGameFlow:', error);
    logger.log('error', 'game', 'Error stack:', error.stack);
    throw error;
  }
}

window.showTechTreeSelection = showTechTreeSelection;

let _toastContainer = null;

function removeExistingUpdateToast() {
  const existing = document.querySelector(".update-toast");
  if (existing) existing.remove();
  if (_toastContainer?.parentNode) _toastContainer.remove();
  _toastContainer = null;
}

const UPDATE_TOAST_AUTO_REMOVE_MS = 10000;
const TOAST_ANIMATION_MS = 300;


function showUpdateToast(newVersion, currentVersion) {
  removeExistingUpdateToast();
  _toastContainer = document.createElement("div");
  document.body.appendChild(_toastContainer);

  const onRefresh = () => {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    window.location.reload();
  };
  const onClose = () => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  };

  render(updateToastTemplate(UPDATE_TOAST_STYLES, onRefresh, onClose), _toastContainer);

  setTimeout(() => {
    const toast = _toastContainer?.querySelector(".update-toast");
    if (toast && document.body.contains(toast)) {
      toast.style.animation = `toast-slide-up ${TOAST_ANIMATION_MS}ms ease-out reverse`;
      setTimeout(() => removeExistingUpdateToast(), TOAST_ANIMATION_MS);
    }
  }, UPDATE_TOAST_AUTO_REMOVE_MS);
}

let _swMessageHandler = null;

function registerServiceWorkerUpdateListener() {
  if (!("serviceWorker" in navigator)) return;
  _swMessageHandler = (event) => {
    if (event?.data?.type === "NEW_VERSION_AVAILABLE") {
      showUpdateToast(event.data.version, event.data.currentVersion);
    }
  };
  navigator.serviceWorker.addEventListener("message", _swMessageHandler);
}

let _pageClickHandler = null;
let _tooltipCloseHandler = null;
let _beforeUnloadHandler = null;

function attachPageClickListeners(game) {
  _pageClickHandler = async (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (!pageBtn) return;
    e.preventDefault();
    game.ui?.modalOrchestrator?.hideModal(MODAL_IDS.SETTINGS);
    await game.router.loadPage(pageBtn.dataset.page);
  };
  document.addEventListener("click", _pageClickHandler);
}

function attachTooltipCloseListener(game) {
  _tooltipCloseHandler = (e) => {
    if (!game.tooltip_manager?.isLocked) return;
    const tooltipEl = document.getElementById("tooltip");
    if (
      tooltipEl &&
      !tooltipEl.contains(e.target) &&
      !e.target.closest(".upgrade, .part") &&
      !e.target.closest("#tooltip_actions")
    ) {
      game.tooltip_manager.closeView();
    }
  };
  document.addEventListener("click", _tooltipCloseHandler, true);
}

function attachBeforeUnloadListener(game) {
  _beforeUnloadHandler = () => {
    try {
      if (StorageUtils.get("reactorNewGamePending") === 1) return;
    } catch (_) {}
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      void game.saveManager.autoSave();
    }
  };
  window.addEventListener("beforeunload", _beforeUnloadHandler);
}

function setupGlobalListeners(game) {
  attachPageClickListeners(game);
  attachTooltipCloseListener(game);
  attachBeforeUnloadListener(game);
}

function applyStatePatch(ui, patch) {
  if (!ui?.stateManager || !patch || typeof patch !== "object") return;
  Object.entries(patch).forEach(([key, value]) => {
    ui.stateManager.setVar(key, value);
  });
}

function handleObjectiveLoaded(ui, payload) {
  if (!payload?.objective) return;
  ui.stateManager.handleObjectiveLoaded(payload.objective, payload.objectiveIndex);
}

function handleObjectiveCompleted(ui) {
  ui.stateManager.handleObjectiveCompleted();
}

function handleObjectiveUnloaded(ui) {
  ui.stateManager.handleObjectiveUnloaded();
}

export function attachGameEventListeners(game, ui) {
  if (!game || !ui) return () => {};

  const subscriptions = [];
  const on = (eventName, handler) => {
    game.on(eventName, handler);
    subscriptions.push(() => game.off(eventName, handler));
  };

  on("statePatch", (patch) => applyStatePatch(ui, patch));
  on("toggleStateChanged", ({ toggleName, value }) => {
    if (!ui?.stateManager) return;
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "heat_control"];
    const coerced = toggleKeys.includes(toggleName) ? Boolean(value) : value;
    ui.stateManager.setVar(toggleName, coerced);
  });
  on("quickSelectSlotsChanged", ({ slots }) => ui.stateManager.setQuickSelectSlots(slots));
  on("reactorTick", (payload) => {
    applyStatePatch(ui, payload);
    if (ui.heatVisualsUI?.updateHeatVisuals) ui.heatVisualsUI.updateHeatVisuals();
  });
  on("exoticParticleEmitted", ({ tile }) => {
    if (ui.gridController?.emitEP && tile) ui.gridController.emitEP(tile);
  });
  on("partClicked", ({ part }) => {
    if (part && ui.stateManager?.setClickedPart) ui.stateManager.setClickedPart(part);
  });
  on("reflectorPulse", ({ r_tile, tile }) => {
    if (ui.gridController?.pulseReflector && r_tile && tile) ui.gridController.pulseReflector(r_tile, tile);
  });
  on("gridResized", () => ui.resizeReactor?.());
  on("vibrationRequest", ({ type }) => {
    if (type === "heavy" && ui.deviceFeatures?.heavyVibration) ui.deviceFeatures.heavyVibration();
    if (type === "meltdown" && ui.deviceFeatures?.meltdownVibration) ui.deviceFeatures.meltdownVibration();
    if (type === "doublePulse" && ui.deviceFeatures?.doublePulseVibration) ui.deviceFeatures.doublePulseVibration();
  });
  on("heatWarning", ({ heatRatio }) => {
    if (game.audio) game.audio.play("warning", heatRatio ?? 0.85);
  });
  on("pipeIntegrityWarning", ({ heatRatio }) => {
    if (game.audio) game.audio.play("warning", heatRatio ?? 0.85);
  });
  on("firstHighHeat", () => {});
  on("heatWarningCleared", () => {
    if (ui.heatVisualsUI?.clearHeatWarningClasses) ui.heatVisualsUI.clearHeatWarningClasses();
    if (ui.gridInteractionUI) ui.gridInteractionUI.clearSegmentHighlight();
  });
  on("chapterCelebration", ({ chapterIdx }) => {
    if (ui.modalOrchestrationUI?.showChapterCelebration && chapterIdx >= 0) ui.modalOrchestrationUI.showChapterCelebration(chapterIdx);
  });
  on("welcomeBackOffline", ({ deltaTime, offlineMs, tickEquivalent }) => {
    const ms = offlineMs ?? deltaTime;
    const te = tickEquivalent ?? Math.floor(ms / FOUNDATIONAL_TICK_MS);
    if (ui.modalOrchestrator?.showModal) ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: ms, tickEquivalent: te });
  });
  on("gameLoopWorkerFatal", ({ detail }) => {
    logger.log("error", "engine", "Game loop worker fatal:", detail);
  });
  on("simulationHardwareError", ({ message }) => {
    ui.stateManager?.setVar?.("engine_status", "simulation_error");
    ui.stateManager?.setVar?.("simulation_error_message", message ?? "");
  });
  on("upgradeAdded", ({ upgrade, game: g }) => {
    if (ui.stateManager?.handleUpgradeAdded && upgrade) ui.stateManager.handleUpgradeAdded(g, upgrade);
  });
  on("upgradePurchased", ({ upgrade }) => {
    if (upgrade?.$el) {
      upgrade.$el.classList.remove("upgrade-purchase-success");
      void upgrade.$el.offsetWidth;
      upgrade.$el.classList.add("upgrade-purchase-success");
    }
  });
  on("upgradesChanged", () => updateSectionCountsState(ui, game));
  on("upgradesAffordabilityChanged", ({ hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch }) => {
    if (!ui?.uiState) return;
    ui.uiState.upgrades_banner_visibility = {
      upgradesHidden: !(hasAnyUpgrade && !hasVisibleAffordableUpgrade),
      researchHidden: !(hasAnyResearch && !hasVisibleAffordableResearch),
    };
  });
  on("saveLoaded", ({ toggles, quick_select_slots }) => {
    if (toggles && ui.stateManager) {
      Object.entries(toggles).forEach(([key, value]) => ui.stateManager.setVar(key, value));
    }
    if (quick_select_slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(quick_select_slots);
    if (ui.controlDeckUI?.updateAllToggleBtnStates) ui.controlDeckUI.updateAllToggleBtnStates();
    game.eventRouter?.clearState?.(game);
  });
  on("meltdown", () => ui.stateManager?.setVar("melting_down", true));
  on("meltdownResolved", () => ui.stateManager?.setVar("melting_down", false));
  on("meltdownStateChanged", () => {
    if (ui.meltdownUI?.updateMeltdownState) ui.meltdownUI.updateMeltdownState();
  });
  on("meltdownStarted", () => {
    if (ui.meltdownUI?.startMeltdownBuildup) {
      ui.meltdownUI.startMeltdownBuildup(() => ui.meltdownUI?.explodeAllPartsSequentially?.());
    } else if (ui.meltdownUI?.explodeAllPartsSequentially) {
      ui.meltdownUI.explodeAllPartsSequentially();
    }
  });
  on("visualEventsReady", (eventBuffer) => {
    if (ui._renderVisualEvents && eventBuffer) ui._renderVisualEvents(eventBuffer);
  });
  on("tileCleared", ({ tile }) => {
    if (game.tooltip_manager?.current_tile_context === tile) game.tooltip_manager.hide();
  });
  on("clearAnimations", () => {
    if (ui.gridInteractionUI?.clearAllActiveAnimations) ui.gridInteractionUI.clearAllActiveAnimations();
  });
  on("clearImageCache", () => {
    if (ui.gridCanvasRenderer?.clearImageCache) ui.gridCanvasRenderer.clearImageCache();
  });
  on("partsPanelRefresh", () => {
    if (ui.partsPanelUI?.populateActiveTab) ui.partsPanelUI.populateActiveTab();
    if (ui.partsPanelUI?.refreshPartsPanel) ui.partsPanelUI.refreshPartsPanel();
  });
  on("markTileDirty", ({ row, col }) => {
    if (ui.gridCanvasRenderer?.markTileDirty) ui.gridCanvasRenderer.markTileDirty(row, col);
  });
  on("markStaticDirty", () => {
    if (ui.gridCanvasRenderer?.markStaticDirty) ui.gridCanvasRenderer.markStaticDirty();
  });
  on("showFloatingText", ({ tile, value }) => {
    if (ui.particleEffectsUI?.showFloatingTextAtTile && tile) ui.particleEffectsUI.showFloatingTextAtTile(tile, value);
  });
  on("objectiveLoaded", (payload) => handleObjectiveLoaded(ui, payload));
  on("objectiveCompleted", () => handleObjectiveCompleted(ui));
  on("objectiveUnloaded", () => handleObjectiveUnloaded(ui));

  return () => {
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        subscriptions[i]();
      } catch (_) {}
    }
    subscriptions.length = 0;
  };
}

const OFFLINE_WELCOME_BACK_MS = 30000;
const OBJECTIVE_CHECK_READY_MS = 100;
const SYNC_UI_DELAY_MS = 100;

function getInitialPage(pageRouter) {
  const hash = window.location.hash.substring(1);
  return hash in pageRouter.pages ? hash : "reactor_section";
}

async function tryLoadStatelessPage(pageRouter, initialPage) {
  const pageDef = pageRouter.pages[initialPage];
  if (pageDef?.stateless) {
    await pageRouter.loadPage(initialPage);
    return true;
  }
  return false;
}

function initGameComponents(game) {
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);
  game.engine = new Engine(game);
  game.engine.setForceNoSAB(preferences.forceNoSAB === true);
  game.tutorialManager = new TutorialManager(game);
}

async function applyOfflineWelcomeBack(game, ui) {
  const offlineMs = Date.now() - (game.lifecycleManager.last_save_time || 0);
  if (offlineMs <= OFFLINE_WELCOME_BACK_MS || !game.tileset.active_tiles_list.length) return;
  const maxMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(offlineMs, maxMs);
  game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  await ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: span, tickEquivalent });
}

function syncToggleStatesFromGame(game, ui) {
  if (ui.controlDeckUI?.syncToggleStatesFromGame) {
    ui.controlDeckUI.syncToggleStatesFromGame();
    return;
  }
  try {
    ui.stateManager.setVar("pause", game.paused ?? false);
    ui.stateManager.setVar("auto_sell", game.reactor?.auto_sell_enabled ?? false);
    ui.stateManager.setVar("auto_buy", game.reactor?.auto_buy_enabled ?? false);
    ui.stateManager.setVar("heat_control", game.reactor?.heat_controlled ?? false);
  } catch (_) {}
}

function startEngine(game) {
  game.engine.start();
  _requestWakeLock();
}

function syncUIAfterEngineStart(game, ui) {
  ui.stateManager.setVar("current_heat", game.reactor.current_heat);
  ui.stateManager.setVar("current_power", game.reactor.current_power);
  ui.stateManager.setVar("max_heat", game.reactor.max_heat);
  ui.stateManager.setVar("max_power", game.reactor.max_power);
  if (ui.heatVisualsUI) ui.heatVisualsUI.updateHeatVisuals();
  StorageUtils.remove("reactorNewGamePending");
  game.objectives_manager?._syncActiveObjectiveToState?.();
  ui.pauseStateUI?.updatePauseState?.();
  setTimeout(() => {
    game.reactor.updateStats();
  }, SYNC_UI_DELAY_MS);
}

function initializeEngineViaPauseToggle(ui) {
  ui.stateManager.setVar("pause", false);
  ui.stateManager.setVar("pause", true);
}

async function finalizeGameStart(game, ui) {
  game.pause();
  ui.stateManager.setVar("pause", true);
  await applyOfflineWelcomeBack(game, ui);
  syncToggleStatesFromGame(game, ui);
  startEngine(game);
  initializeEngineViaPauseToggle(ui);
  syncUIAfterEngineStart(game, ui);
  if (!StorageUtils.get("reactorGameQuickStartShown")) {
    try {
      await ui.modalOrchestrator.showModal(MODAL_IDS.QUICK_START, { game });
    } catch (error) {
      logger.log('warn', 'game', 'Failed to show quick start modal:', error);
    }
  }
}

function applyPendingToggleStates(game) {
  if (!game._pendingToggleStates) return;
  Object.entries(game._pendingToggleStates).forEach(([key, value]) => {
    game.ui.stateManager.setVar(key, value);
  });
  delete game._pendingToggleStates;
}

function restoreObjectiveState(game, savedIndex) {
  const maxValidIndex = game.objectives_manager.objectives_data.length - 2;
  let index = savedIndex;
  if (index < 0) index = 0;
  if (index > maxValidIndex) index = maxValidIndex;
  game.objectives_manager.current_objective_index = index;
  game.objectives_manager.set_objective(index, true);
  game.objectives_manager.start();
}

async function runObjectiveRestoreFlow(game, ui) {
  const savedIndex = game._saved_objective_index;
  delete game._saved_objective_index;
  const finishObjectiveRestoreFlow = async () => {
    restoreObjectiveState(game, savedIndex);
    await finalizeGameStart(game, ui);
  };
  if (!game.objectives_manager?.objectives_data?.length) {
    const checkReady = async () => {
      if (game.objectives_manager?.objectives_data?.length) {
        await finishObjectiveRestoreFlow();
      } else {
        setTimeout(checkReady, OBJECTIVE_CHECK_READY_MS);
      }
    };
    checkReady();
  } else {
    await finishObjectiveRestoreFlow();
  }
}

async function startGame(appContext) {
  const { pageRouter, ui, game } = appContext;
  const initialPage = getInitialPage(pageRouter);
  if (await tryLoadStatelessPage(pageRouter, initialPage)) return;
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage(initialPage);
  initGameComponents(game);
  await game.startSession();
  if (typeof window !== "undefined" && window.appRoot) window.appRoot.render();
  if (initialPage === "reactor_section" && ui.resizeReactor) {
    ui.resizeReactor();
    requestAnimationFrame(() => ui.resizeReactor());
    setTimeout(() => ui.resizeReactor(), 50);
    setTimeout(() => ui.resizeReactor(), 150);
  }
  ui.partsPanelUI.initializePartsPanel();
  applyPendingToggleStates(game);
  if (game._saved_objective_index !== undefined) {
    await runObjectiveRestoreFlow(game, ui);
  } else {
    game.objectives_manager.start();
    await finalizeGameStart(game, ui);
  }
}

class GameBootstrapper {
  constructor({ game, ui, pageRouter, splashManager, appRoot }) {
    this.game = game;
    this.ui = ui;
    this.pageRouter = pageRouter;
    this.splashManager = splashManager;
    this.appRoot = appRoot;
  }
  async bootstrap() {
    await dataService.ensureAllGameDataLoaded();
    this.ui.init(this.game);
    this.appRoot.render();
    if (typeof this.ui.detachGameEventListeners === "function") {
      this.ui.detachGameEventListeners();
    }
    this.ui.detachGameEventListeners = attachGameEventListeners(this.game, this.ui);
    this.game.tileset.initialize();
    await this.game.partset.initialize();
    await this.game.upgradeset.initialize();
    await this.game.set_defaults();
  }
}

const SAVE_SLOT_COUNT = 3;
const SPLASH_HIDE_DELAY_MS = 600;

function hasAnyExistingSave(isNewGamePending) {
  if (isNewGamePending) return false;
  if (StorageUtils.getRaw("reactorGameSave")) return true;
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    if (StorageUtils.getRaw(`reactorGameSave_${i}`)) return true;
  }
  return false;
}

async function resolveBackupIfRequested(game, savedGame, loadSlot) {
  if (!savedGame || typeof savedGame !== "object" || !savedGame.backupAvailable || !window.showLoadBackupModal || !window.setSlot1FromBackup) return savedGame;
  const useBackup = await window.showLoadBackupModal();
  if (!useBackup) return false;
  await window.setSlot1FromBackup();
  return game.saveManager.loadGame(loadSlot ? parseInt(loadSlot) : null);
}

async function loadSavedGame(game, loadSlot, isNewGamePending) {
  if (isNewGamePending) return { resolved: false, shouldPause: false };
  try {
    const savedGame = loadSlot ? await game.saveManager.loadGame(parseInt(loadSlot)) : await game.saveManager.loadGame();
    if (loadSlot) StorageUtils.remove("reactorLoadSlot");
    const resolved = await resolveBackupIfRequested(game, savedGame, loadSlot);
    return { resolved, shouldPause: resolved === true };
  } catch (err) {
    logger.log('error', 'game', 'Error loading saved game:', err);
    return { resolved: false, shouldPause: false };
  }
}

function shouldAutoStart(savedGame, isNewGamePending, pageInfo) {
  return !!savedGame && !isNewGamePending && !!pageInfo;
}

async function performAutoStart(hash, pageInfo, ctx) {
  if (pageInfo && pageInfo.stateless) {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await ctx.pageRouter.loadPage(hash);
    return;
  }
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
  await startGame(ctx);
}

async function handleNoAutoStart(ctx) {
  if (window.splashManager) {
    await window.splashManager.setStep("ready");
    await window.splashManager.showStartOptions(true);
    return;
  }
  createFallbackStartInterface(ctx.pageRouter, ctx.ui, ctx.game);
}

async function handleUserSession(ctx) {
  const isNewGamePending = StorageUtils.get("reactorNewGamePending") === 1;
  const loadSlot = StorageUtils.get("reactorLoadSlot");
  const { resolved: savedGame, shouldPause } = await loadSavedGame(ctx.game, loadSlot, isNewGamePending);
  if (shouldPause) ctx.game.paused = true;
  const hash = window.location.hash.substring(1);
  const pageInfo = ctx.pageRouter.pages[hash];
  const autoStart = shouldAutoStart(savedGame, isNewGamePending, pageInfo);
  if (autoStart) await performAutoStart(hash, pageInfo, ctx);
  else await handleNoAutoStart(ctx);
}

async function clearAllGameDataForNewGame(game) {
  await StorageAdapter.remove("reactorGameSave");
  for (let i = 1; i <= SAVE_SLOT_COUNT; i++) {
    await StorageAdapter.remove(`reactorGameSave_${i}`);
  }
  await StorageAdapter.remove("reactorGameSave_Previous");
  await StorageAdapter.remove("reactorGameSave_Backup");
  await StorageAdapter.remove("reactorCurrentSaveSlot");
  StorageUtils.remove("reactorGameQuickStartShown");
  StorageUtils.remove("google_drive_save_file_id");
  StorageUtils.set("reactorNewGamePending", 1);
  if (game && Object.prototype.hasOwnProperty.call(game, "_saved_objective_index")) {
    delete game._saved_objective_index;
  }
}

function bindLoadGameButton(ctx) {
  const btn = document.getElementById("splash-load-game-btn");
  if (!btn) return;
  btn.onclick = async () => {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await startGame(ctx);
  };
}

function bindLoadGameUploadRow(ctx) {
  const loadBtn =
    document.querySelector("#splash-load-game-upload-row #splash-load-game-btn") ??
    document.getElementById("splash-load-game-btn");
  if (!loadBtn) return;
  loadBtn.onclick = async () => {
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
    await startGame(ctx);
  };
}

function setupButtonHandlers(ctx) {
  bindLoadGameButton(ctx);
  bindLoadGameUploadRow(ctx);
}

function createAppInstances() {
  const ui = new UI();
  const game = new Game(ui, getCompactLayout);
  game.audio = new AudioService();
  const initAudioOnGesture = () => game.audio.init();
  document.addEventListener("click", initAudioOnGesture, { once: true });
  document.addEventListener("keydown", initAudioOnGesture, { once: true });
  document.addEventListener("touchstart", initAudioOnGesture, { once: true });
  const pageRouter = new PageRouter(ui);
  game.router = pageRouter;
  return { ui, game, pageRouter };
}

async function main() {
  "use strict";
  const pwaModule = await import("./services.js");
  _requestWakeLock = pwaModule.requestWakeLock;
  pwaModule.initializePwa();
  initPreferencesStore();
  const { ui, game, pageRouter } = createAppInstances();
  const appRoot = new AppRoot(document.getElementById("app_root"), game, ui);
  appRoot.render();
  if (!isTestEnv()) {
    window.pageRouter = pageRouter;
    window.ui = ui;
    window.game = game;
    window.appRoot = appRoot;
  }
  await migrateLocalStorageToIndexedDB();
  const ctx = { game, pageRouter, ui };
  if (window.splashManager) window.splashManager.setAppContext(ctx);
  const bootstrapper = new GameBootstrapper({ game, ui, pageRouter, splashManager: window.splashManager, appRoot });
  await bootstrapper.bootstrap();
  await handleUserSession(ctx);
  setupButtonHandlers(ctx);
  setupGlobalListeners(game);
  registerServiceWorkerUpdateListener();
  if (typeof window !== "undefined") {
    if (typeof registerPeriodicSync === "function") registerPeriodicSync();
    if (typeof registerOneOffSync === "function") registerOneOffSync();
  }
  setupLaunchQueueHandler(game);
}

function setupLaunchQueueHandler(game) {
  if (!('launchQueue' in window) || !('files' in LaunchParams.prototype)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files.length) return;

    const fileHandle = launchParams.files[0];
    const file = await fileHandle.getFile();
    const text = await file.text();

    try {
      const validated = game?.saveManager?.validateSaveData(text);

      if (game.engine?.running) game.pause();

      const confirmLoad = confirm(
        `Load save "${file.name}"?\n(Current unsaved progress will be lost)`
      );

      if (confirmLoad && validated) {
        await game.applySaveState(validated);
        game.activeFileHandle = fileHandle;
      }
    } catch (e) {
      logger.log('error', 'game', '[PWA] Error handling launch file', e);
    }
  });
}

window.startGame = startGame;
window.clearAllGameDataForNewGame = clearAllGameDataForNewGame;

async function createFallbackStartInterface(pageRouter, ui, game) {
  try {
    const container = document.createElement("div");
    container.id = "fallback-start-interface";
    document.body.appendChild(container);
    const onStart = async () => {
      container.remove();
      await startGame({ pageRouter, ui, game });
    };
    render(fallbackStartTemplate(onStart), container);
  } catch (error) {
    logger.log('error', 'game', 'Could not load fallback start interface', error);
  }
}

function showCriticalError(error) {
  const errorMessage = error?.message || error?.toString() || "Unknown error";
  const errorStack = error?.stack || "";
  const errorOverlay = document.createElement("div");
  errorOverlay.id = "critical-error-overlay";
  errorOverlay.className = "critical-error-overlay";
  render(criticalErrorTemplate(errorMessage, errorStack, () => window.location.reload()), errorOverlay);
  document.body.appendChild(errorOverlay);
  document.body.style.overflow = "hidden";
}


let _windowErrorHandler = null;
let _unhandledRejectionHandler = null;

document.addEventListener("DOMContentLoaded", () => {
  try {
    main().catch((error) => {
      logger.log('error', 'game', 'Critical startup error:', error);
      showCriticalError(error);
    });
  } catch (error) {
    logger.error("Critical startup error:", error);
    showCriticalError(error);
  }
});

_windowErrorHandler = (event) => {
  if (event.error && !document.getElementById("critical-error-overlay")) {
    logger.log('error', 'game', 'Uncaught error:', event.error);
    showCriticalError(event.error);
  }
};
window.addEventListener("error", _windowErrorHandler);

_unhandledRejectionHandler = (event) => {
  if (event.reason && !document.getElementById("critical-error-overlay")) {
    logger.log('error', 'game', 'Unhandled promise rejection:', event.reason);
    showCriticalError(event.reason);
  }
};
window.addEventListener("unhandledrejection", _unhandledRejectionHandler);

export function teardownAppErrorHandlers() {
  if (_windowErrorHandler) {
    window.removeEventListener("error", _windowErrorHandler);
    _windowErrorHandler = null;
  }
  if (_unhandledRejectionHandler) {
    window.removeEventListener("unhandledrejection", _unhandledRejectionHandler);
    _unhandledRejectionHandler = null;
  }
}
