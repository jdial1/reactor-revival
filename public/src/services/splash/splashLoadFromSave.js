import { StorageUtils, rotateSlot1ToBackup, setSlot1FromBackup } from "../../utils/util.js";
import { showLoadBackupModal } from "../saveModals.js";
import { logger } from "../../utils/logger.js";

const SPLASH_HIDE_DELAY_MS = 600;

export async function loadFromData(splashManager, saveData, ctx) {
  const str = typeof saveData === "string" ? saveData : StorageUtils.serialize(saveData);
  rotateSlot1ToBackup(str);
  await loadFromSaveSlot(splashManager, 1, ctx);
}

async function teardownSplashAndWait() {
  const saveSlotEl = document.getElementById("save-slot-screen");
  if (saveSlotEl) saveSlotEl.remove();
  if (window.splashManager) window.splashManager.hide();
  await new Promise((resolve) => setTimeout(resolve, SPLASH_HIDE_DELAY_MS));
}

async function handleBackupLoadFlow(ctx, slot) {
  if (!ctx?.game?.saveManager) return null;
  let loadSuccess = await ctx.game.saveManager.loadGame(slot);
  if (loadSuccess && typeof loadSuccess === "object" && loadSuccess.backupAvailable) {
    const useBackup = await showLoadBackupModal();
    if (!useBackup) return null;
    setSlot1FromBackup();
    loadSuccess = await ctx.game.saveManager.loadGame(1);
  }
  return loadSuccess;
}

async function startGameOrFallback(ctx) {
  if (!ctx?.game || !ctx?.ui || !ctx?.pageRouter) return;
  if (typeof window.startGame === "function") {
    await window.startGame(ctx);
    return;
  }
  logger.log('error', 'splash', 'startGame function not available globally');
  await ctx.pageRouter.loadGameLayout();
  ctx.ui.initMainLayout();
  await ctx.pageRouter.loadPage("reactor_section");
  ctx.game.tooltip_manager = new (await import("../../components/tooltip.js")).TooltipManager("#main", "#tooltip", ctx.game);
  ctx.game.engine = new (await import("../../core/engine.js")).Engine(ctx.game);
  await ctx.game.startSession();
  ctx.game.engine.start();
}

export async function loadFromSaveSlot(splashManager, slot, ctx) {
  try {
    await teardownSplashAndWait();
    const appCtx = ctx ?? (splashManager._appContext || { game: window.game, ui: window.ui, pageRouter: window.pageRouter });
    if (!appCtx.game) {
      logger.log('error', 'splash', 'Game instance not available');
      return;
    }
    const loadSuccess = await handleBackupLoadFlow(appCtx, slot);
    if (loadSuccess !== true || !appCtx.pageRouter || !appCtx.ui) {
      logger.error("Failed to load game or missing dependencies");
      return;
    }
    await startGameOrFallback(appCtx);
  } catch (error) {
    logger.log('error', 'splash', 'Error loading from save slot:', error);
  }
}
