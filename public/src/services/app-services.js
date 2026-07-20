import { teardownAll } from "../core/teardown.js";
export {
  getValidatedGameData,
  AUDIO_RUNTIME_DEFAULTS,
  handleAudioEvent,
  processSensoryMask,
  resolveAudioService,
  loadSampleBuffers,
  AudioService,
} from "./audio.js";
export { default } from "./audio.js";
export {
  initializePwa,
  teardownPwa,
  getDeferredPrompt,
  setupInstallPrompt,
  onInstallPwaClick,
  requestWakeLock,
  releaseWakeLock,
  VersionChecker,
  getCriticalUiIconAssets,
  warmImageCache,
  preloadAllPartImages,
} from "./pwa.js";
export { LeaderboardService, leaderboardService, getLocalBestRun, queryClient, queryKeys } from "./leaderboard.js";

import { html, render } from "lit-html";
import { VersionSchema } from "../schema/index.js";
import { parseAndValidateSave } from "../domain/game-save.js";
import { MODAL_IDS } from "../constants/modal-ids.js";
import { fetchResolvedSaves } from "../state/save-query.js";
import { showLoadBackupModal } from "../state/save-ui.js";
import {
  StorageUtils,
  StorageAdapter,
  serializeSave,
  setSlot1FromBackupAsync,
  rotateSlot1ToBackup,
} from "../storage/index.js";
import { classMap, BaseComponent, getResourceUrl } from "../dom/lit.js";
import { logger } from "../core/logger.js";
import { isTestEnv } from "../simUtils.js";
import { formatNumber, formatPlaytimeLog } from "../core/numbers.js";
import { LEADERBOARD_CONFIG } from "../constants/balance.js";
import { getAppContext } from "../app-context.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { pwaState } from "../state/ui-state.js";
import { getUiElement } from "../components/shell/page-dom.js";

function firstByClass(root, className) {
  if (!root) return null;
  return root.getElementsByClassName(className)[0] ?? null;
}

function forEachByClass(root, className, fn) {
  if (!root) return;
  const list = root.getElementsByClassName(className);
  for (let i = 0; i < list.length; i++) fn(list[i]);
}

function setClassFlag(el, className, on) {
  if (!el) return;
  const re = new RegExp(`\\b${className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
  const base = el.className.replace(re, "").replace(/\s+/g, " ").trim();
  el.className = on ? (base ? `${base} ${className}` : className) : base;
}

function resolveIdSelector(sel) {
  if (typeof sel === "string" && sel.startsWith("#") && !/[\s>+~[:.]/.test(sel.slice(1))) {
    return getUiElement(null, sel.slice(1));
  }
  return null;
}
import {
  VersionChecker,
  warmImageCache,
  getCriticalUiIconAssets,
  preloadAllPartImages,
  setupInstallPrompt,
} from "./pwa.js";

const splashStartOptionsTemplate = ({
  mostRecentSave,
  onResume,
  onNewRun,
  onShowLoad,
  onShowSettings,
}) => {
  return html`
    ${mostRecentSave
      ? html`
          <button
            class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
            @click=${onResume}
          >
            <div class="load-game-header"><span>RESUME</span></div>
          </button>
        `
      : ""}

    <div class="splash-btn-actions-grid">
      <div class="splash-btn-row-secondary">
        <button
          id="splash-new-game-btn"
          class="splash-btn splash-btn-start ${!mostRecentSave ? "splash-btn-resume-primary" : ""}"
          @click=${onNewRun}
        >
          NEW RUN
        </button>
        <button class="splash-btn splash-btn-load" @click=${onShowLoad}>
          <div class="load-game-header"><span>LOAD</span></div>
        </button>
      </div>
      <div class="splash-btn-row-tertiary">
        <button
          class="splash-btn splash-btn-config splash-btn-row-tertiary-single"
          title="System configuration"
          @click=${onShowSettings}
        >
          SYS
        </button>
      </div>
    </div>
  `;
};

const saveSlotRowTemplate =({
  rowClasses,
  btnClasses,
  i,
  isEmpty,
  logId,
  isSelected,
  slotData,
  onSwipeStart,
  onSwipeEnd,
  onSlotClick,
  onDeleteClick,
  formatPlaytimeLog,
  formatSlotNumber,
}) => {
  return html`
    <div class=${rowClasses}>
      <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
        <button
          class=${btnClasses}
          type="button"
          data-slot=${i}
          data-is-empty=${isEmpty}
          @click=${onSlotClick}
        >
          ${isEmpty
            ? html`
                <div class="save-slot-row-top">
                  <span class="save-slot-log-id save-slot-log-id-empty">${logId}</span>
                  <span class="save-slot-right">EMPTY</span>
                </div>
                <div class="save-slot-row-bottom">
                  <span class="save-slot-ttime">--:--:--</span>
                </div>
              `
            : html`
                <span class="save-slot-tape-icon" aria-hidden="true"></span>
                <span class="save-slot-select-arrow ${isSelected ? "visible" : ""}" aria-hidden="true">&#x25B6;</span>
                <div class="save-slot-row-top">
                  <span class="save-slot-log-id">${logId}</span>
                </div>
                <div class="save-slot-row-meta">
                  <span class="save-slot-ttime">T+ ${formatPlaytimeLog(Number(slotData.totalPlayedTime))}</span>
                </div>
                <div class="save-slot-row-bottom">
                  <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span>
                  <span class="save-slot-sep">|</span>
                  <span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
                </div>
              `}
        </button>
        ${!isEmpty
          ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>`
          : ""}
      </div>
    </div>
  `;
};

const saveSlotMainTemplate =({
  localSlots,
  selectedSlot,
  onHeaderTouchStart,
  onHeaderTouchEnd,
  onClose,
  onFileChange,
  onRestore,
  onImportBackup,
  renderSlot,
}) => {
  return html`
    <header
      class="save-slot-screen-header"
      @touchstart=${onHeaderTouchStart}
      @touchend=${onHeaderTouchEnd}
    >
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="save-slot-header-row">
        <h1 class="save-slot-title">SYSTEM LOGS</h1>
        <button class="save-slot-back-btn" title="Cancel" aria-label="Cancel" @click=${onClose}>&#x2715;</button>
      </div>
    </header>
    <div class="save-slot-panel">
      <div class="save-slot-options">
        <h2 class="save-slot-section-header">CORE BACKUPS</h2>
        ${localSlots.map((s, idx) => renderSlot(s, idx + 1))}
        <div class="save-slot-actions">
          <input
            type="file"
            id="load-from-file-input"
            accept=".json,.reactor,application/json"
            style="display: none;"
            @change=${onFileChange}
          />
          <button
            class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
            ?disabled=${selectedSlot == null}
            style="opacity: ${selectedSlot != null ? 1 : 0.5};"
            @click=${onRestore}
          >
            RESTORE
          </button>
          <button class="save-slot-import-btn" @click=${onImportBackup}>IMPORT BACKUP</button>
          <button class="save-slot-back-action" @click=${onClose}>BACK</button>
        </div>
      </div>
    </div>
  `;
};


const FADE_SLIGHT_MS = 15000;
const FADE_FULL_MS = 30000;
const FADE_CLASS_SLIGHT = "splash-menu-fade-slight";
const FADE_CLASS_FULL = "splash-menu-fade-full";

function clearFadeClasses(panel) {
  setClassFlag(panel, FADE_CLASS_SLIGHT, false);
  setClassFlag(panel, FADE_CLASS_FULL, false);
}

function scheduleFadeSteps(panel, slightTimerRef, fullTimerRef) {
  if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
  if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
  clearFadeClasses(panel);
  slightTimerRef.current = setTimeout(() => {
    setClassFlag(panel, FADE_CLASS_SLIGHT, true);
    slightTimerRef.current = null;
  }, FADE_SLIGHT_MS);
  fullTimerRef.current = setTimeout(() => {
    setClassFlag(panel, FADE_CLASS_SLIGHT, false);
    setClassFlag(panel, FADE_CLASS_FULL, true);
    fullTimerRef.current = null;
  }, FADE_FULL_MS);
}

function bindWakeListeners(panel, slightTimerRef, fullTimerRef, ac) {
  const wake = () => {
    scheduleFadeSteps(panel, slightTimerRef, fullTimerRef);
  };
  const events = ["click", "touchstart", "pointerdown", "pointermove", "keydown"];
  const { signal } = ac;
  events.forEach((ev) => {
    const h = (e) => {
      if (ev === "pointermove" && e.buttons === 0) return;
      wake();
    };
    document.addEventListener(ev, h, { capture: true, passive: ev === "pointermove", signal });
  });
}

function initSplashMenuIdleFade(panelElement) {
  if (!panelElement) return () => {};
  const slightTimerRef = { current: null };
  const fullTimerRef = { current: null };
  const ac = new AbortController();
  scheduleFadeSteps(panelElement, slightTimerRef, fullTimerRef);
  bindWakeListeners(panelElement, slightTimerRef, fullTimerRef, ac);
  return () => {
    if (slightTimerRef.current) clearTimeout(slightTimerRef.current);
    if (fullTimerRef.current) clearTimeout(fullTimerRef.current);
    ac.abort();
    clearFadeClasses(panelElement);
  };
}

async function fetchVersionFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseVersionFromResponse(text) {
  try {
    const data = JSON.parse(text);
    const parsed = VersionSchema.safeParse(data);
    return parsed.success ? parsed.data.version : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function tryPrimaryVersionUrl() {
  const versionUrl = getResourceUrl("version.json");
  try {
    return await fetchVersionFromUrl(versionUrl);
  } catch (urlError) {
    logger.log("warn", "splash", "Primary URL failed, trying direct path:", urlError);
    return await fetchVersionFromUrl("/version.json");
  }
}

async function tryDirectOrAbsolutePath() {
  try {
    const directResponse = await fetch("./version.json");
    if (directResponse.ok) return parseVersionFromResponse(await directResponse.text());
  } catch (directError) {
    logger.warn("Could not load direct local version:", directError);
  }
  try {
    const absoluteResponse = await fetch("/version.json");
    if (absoluteResponse.ok) return parseVersionFromResponse(await absoluteResponse.text());
  } catch (absoluteError) {
    logger.log("warn", "splash", "Could not load absolute path version:", absoluteError);
  }
  return null;
}

async function tryLocalVersionFallback(versionChecker) {
  const localVersion = await versionChecker.getLocalVersion();
  if (localVersion) return localVersion;
  return await tryDirectOrAbsolutePath();
}

async function fetchVersionForSplash(versionChecker) {
  try {
    const responseText = await tryPrimaryVersionUrl();
    return parseVersionFromResponse(responseText);
  } catch (error) {
    logger.warn("Could not load version info:", error);
    try {
      const fallback = await tryLocalVersionFallback(versionChecker);
      return fallback ?? "Unknown";
    } catch (localError) {
      logger.log("warn", "splash", "Could not load local version:", localError);
      return "Unknown";
    }
  }
}

function mountSplashUserCountReactive(_splashScreen, ui) {
  const userCountEl = getUiElement(null, "user-count-text");
  if (!userCountEl || !ui?.uiState) return () => {};
  return bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["user_count"] }],
    () => html`${ui.uiState?.user_count ?? 0}`,
    userCountEl
  );
}

function addSplashStats(splashScreen, version, versionChecker, ui) {
  const versionText = getUiElement(null, "splash-version-text");
  if (!versionText) return () => {};
  versionText.style.cursor = "pointer";
  versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  if (ui?.uiState) {
    return bindLitRenderMulti(
      [
        { state: ui.uiState, keys: ["version"] },
        { state: pwaState, keys: ["updateAvailable", "hasAcknowledgedUpdate"] },
      ],
      () => {
        const showNew = pwaState.updateAvailable && !pwaState.hasAcknowledgedUpdate;
        setClassFlag(versionText, "new-version", showNew);
        versionText.title = showNew ? "New version available — click for details" : "Click to check for updates";
        return html`v.${ui.uiState?.version ?? ""}`;
      },
      versionText
    );
  }
  versionText.textContent = `v.${version}`;
  return () => {};
}

class SplashUIManager extends BaseComponent {
  constructor(refs) {
    super();
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  setRefs(refs) {
    this.statusElement = refs.statusElement;
    this.splashScreen = refs.splashScreen;
  }

  updateStatus(message) {
    if (!this.statusElement) {
      logger.log("warn", "splash", "Status element not ready, skipping update:", message);
      return;
    }
    this.statusElement.textContent = message;
    setClassFlag(this.statusElement, "splash-element-visible", true);
  }

  stopFlavorText() {}

  hide(onHidden) {
    if (!this.splashScreen) return;
    this.stopFlavorText();
    setClassFlag(this.splashScreen, "fade-out", true);
    setTimeout(() => {
      this.isVisible = false;
      this.setElementVisible(this.splashScreen, false);
      onHidden?.();
    }, 500);
  }

  show() {
    if (this.splashScreen) {
      this.isVisible = true;
      setClassFlag(this.splashScreen, "fade-out", false);
      this.setElementVisible(this.splashScreen, true);
    }
  }

  forceHide() {
    if (this.splashScreen) {
      this.isVisible = false;
      setClassFlag(this.splashScreen, "fade-out", true);
      this.setElementVisible(this.splashScreen, false);
    }
  }
}

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = resolveIdSelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    manager.splashScreen = getUiElement(null, "splash-screen") ?? await waitForSplashElement("#splash-screen");
    manager.statusElement = getUiElement(null, "splash-status");
    if (!manager.splashScreen) throw new Error("Splash screen not found (AppRoot must render first)");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) =>
        logger.log("warn", "splash", "[PWA] Background part image preloading failed:", error)
      );
    } catch (e) {
      logger.log("warn", "splash", "[PWA] Failed to warm image cache:", e);
    }
    return true;
  } catch (error) {
    logger.log("error", "splash", "Error loading splash screen:", error);
    return false;
  }
}

function showStatusVisible(el, message) {
  if (!el) return;
  setClassFlag(el, "splash-element-hidden", false);
  setClassFlag(el, "splash-element-visible", true);
  el.textContent = message;
}

function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  showStatusVisible(manager.statusElement, step.message);
}

function runSetSubStep(manager, message) {
  showStatusVisible(manager.statusElement, message);
}

const SPLASH_HIDE_DELAY_MS = 600;

async function loadFromDataImpl(splashManager, saveData, ctx) {
  const str = typeof saveData === "string" ? saveData : serializeSave(saveData);
  await rotateSlot1ToBackup(str);
  await loadFromSaveSlotImpl(splashManager, 1, ctx);
}

async function teardownSplashAndWait() {
  const saveSlotEl = getUiElement(null, "save-slot-screen");
  if (saveSlotEl) saveSlotEl.remove();
  getAppContext()?.splashManager?.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
}

async function handleBackupLoadFlow(ctx, slot) {
  if (!ctx?.game?.saveManager) return null;
  let loadSuccess = await ctx.game.saveManager.loadGame(slot);
  if (loadSuccess && typeof loadSuccess === "object" && loadSuccess.backupAvailable) {
    const useBackup = await showLoadBackupModal();
    if (!useBackup) return null;
    await setSlot1FromBackupAsync();
    loadSuccess = await ctx.game.saveManager.loadGame(1);
  }
  return loadSuccess;
}

async function startGameOrFallback(ctx) {
  if (!ctx?.game || !ctx?.ui || !ctx?.pageRouter) return;
  if (typeof getAppContext()?.startGame === "function") {
    await getAppContext().startGame(ctx);
    return;
  }
  logger.log("error", "splash", "startGame function not available globally");
  await ctx.pageRouter.loadGameLayout();
  ctx.ui.initMainLayout();
  await ctx.pageRouter.loadPage("reactor_section");
  const { wireTooltipManager } = await import("../components/ui-tooltips-tutorial.js");
  wireTooltipManager(ctx.ui, ctx.game);
  ctx.game.engine = new (await import("../domain/engine.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

async function loadFromSaveSlotImpl(splashManager, slot, ctx) {
  try {
    await teardownSplashAndWait();
    const appCtx =
      ctx ?? (splashManager._appContext || getAppContext() || {});
    if (!appCtx.game) {
      logger.log("error", "splash", "Game instance not available");
      return;
    }
    const loadSuccess = await handleBackupLoadFlow(appCtx, slot);
    if (loadSuccess !== true || !appCtx.pageRouter || !appCtx.ui) {
      logger.log("error", "splash", "Failed to load game or missing dependencies");
      return;
    }
    await startGameOrFallback(appCtx);
  } catch (error) {
    logger.log("error", "splash", "Error loading from save slot:", error);
  }
}

class SplashStartOptionsBuilder {
  constructor(splashManager, ctx = null) {
    this.splashManager = splashManager;
    this.ctx = ctx ?? (splashManager._appContext || getAppContext() || {});
  }

  async buildSaveSlotList(canLoadGame) {
    if (!canLoadGame) {
      return { hasSave: false, saveSlots: [], mostRecentSave: null };
    }
    return fetchResolvedSaves();
  }

  renderTo(container, state) {
    const { hasSave, saveSlots, mostRecentSave } = state;

    const onResume = async () => {
      try {
        getAppContext()?.splashManager?.hide();
        await new Promise((resolve) => setTimeout(resolve, 600));

        const game = this.ctx?.game ?? getAppContext()?.game;
        if (game) {
          const loadSuccess = await game.saveManager.loadGame(mostRecentSave.slot);
          const loadedOk = loadSuccess === true;

          const pageRouter = this.ctx?.pageRouter ?? getAppContext()?.pageRouter;
          const ui = this.ctx?.ui ?? getAppContext()?.ui;

          if (loadedOk && pageRouter && ui) {
            if (typeof getAppContext()?.startGame === "function") {
              await getAppContext().startGame({ pageRouter, ui, game });
            } else {
              await pageRouter.loadGameLayout();
              ui.initMainLayout();
              await pageRouter.loadPage("reactor_section");

              const { wireTooltipManager } = await import("../components/ui-tooltips-tutorial.js");
              wireTooltipManager(ui, game);
              game.engine = new (await import("../domain/engine.js")).Engine(game);

              await game.startSession();
              game.engine.start();
            }
          }
        }
      } catch (error) {
        logger.log("error", "splash", "Error loading game:", error);
      }
    };

    const onNewRun = async () => {
      if (hasSave && !confirm("Are you sure you want to start a new game? Your saved progress will be overwritten."))
        return;
      const game = this.ctx?.game ?? getAppContext()?.game;
      const pageRouter = this.ctx?.pageRouter ?? getAppContext()?.pageRouter;
      const ui = this.ctx?.ui ?? getAppContext()?.ui;
      try {
        const showTechTree = getAppContext()?.showTechTreeSelection;
        if (game && typeof showTechTree === "function") await showTechTree(game, pageRouter, ui, this.splashManager);
      } catch (error) {
        logger.log("error", "game", "Error showing tech tree selection:", error);
      }
    };

    const template = splashStartOptionsTemplate({
      mostRecentSave,
      onResume,
      onNewRun,
      onShowLoad: () => this.splashManager.showSaveSlotSelection(saveSlots),
      onShowSettings: () => this.ctx?.ui?.modalOrchestrator?.showModal(MODAL_IDS.SETTINGS),
    });

    render(template, container);
  }
}

const formatSlotNumber = (n) => formatNumber(n, { places: 1 });

class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      selectedSlot: null,
      swipedSlots: new Set(),
    };
  }

  _slotTemplate(slotData, i) {
    const isEmpty = !slotData || !slotData.exists;
    const logId = `LOG ${String(i).padStart(2, "0")}`;
    const swipeKey = `l_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isEmpty,
      swiped: isSwiped,
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      selected: isSelected,
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && now - this._lastTap < 400;
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find((s) => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return saveSlotRowTemplate({
      rowClasses,
      btnClasses,
      i,
      isEmpty,
      logId,
      isSelected,
      slotData,
      onSwipeStart,
      onSwipeEnd,
      onSlotClick,
      onDeleteClick,
      formatPlaytimeLog,
      formatSlotNumber,
    });
  }

  _mainTemplate() {
    const localSlots = [1, 2, 3].map((i) => this.state.localSaveSlots.find((s) => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const validated = parseAndValidateSave(event.target.result);
          await rotateSlot1ToBackup(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      getUiElement(null, "load-from-file-input")?.click();
    };

    return saveSlotMainTemplate({
      localSlots,
      selectedSlot: this.state.selectedSlot,
      onHeaderTouchStart: (e) => {
        this._headerStartY = e.touches[0].clientY;
      },
      onHeaderTouchEnd: (e) => {
        if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
      },
      onClose: () => this._close(),
      onFileChange,
      onRestore: () => this._handleRestore(),
      onImportBackup: triggerFileInput,
      renderSlot: (slot, idx) => this._slotTemplate(slot, idx),
    });
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const logId = `LOG ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;
    await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      selectedSlot: null,
      swipedSlots: new Set(),
    };

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const firstFilled = this.state.localSaveSlots.find((s) => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
    }

    this.render();
  }
}

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
