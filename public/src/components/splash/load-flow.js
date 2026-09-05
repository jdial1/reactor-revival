import { isTestEnv } from "../../simUtils.js";
import { logger } from "../../core/logger.js";
import { getAppContext } from "../../app-context.js";
import { showLoadBackupModal } from "../../state/save-ui.js";
import {
  serializeSave,
  setSlot1FromBackupAsync,
  rotateSlot1ToBackup,
} from "../../storage/index.js";
import {
  warmImageCache,
  getCriticalUiIconAssets,
  preloadAllPartImages,
} from "../../services/pwa.js";
import { getUiElement } from "../shell/page-dom.js";
import { resolveIdSelector } from "./dom-flags.js";
import { setClassFlag } from "../../dom/class-flags.js";

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = resolveIdSelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export async function runLoadSplashScreen(manager) {
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

export function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  showStatusVisible(manager.statusElement, step.message);
}

export function runSetSubStep(manager, message) {
  showStatusVisible(manager.statusElement, message);
}

const SPLASH_HIDE_DELAY_MS = 600;

export async function loadFromDataImpl(splashManager, saveData, ctx) {
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
  const { wireTooltipManager } = await import("../ui-tooltips-tutorial.js");
  wireTooltipManager(ctx.ui, ctx.game);
  ctx.game.engine = new (await import("../../domain/engine.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

export async function loadFromSaveSlotImpl(splashManager, slot, ctx) {
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
