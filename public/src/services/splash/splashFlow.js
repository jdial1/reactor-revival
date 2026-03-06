import { isTestEnv } from "../../utils/util.js";
import { getCriticalUiIconAssets, warmImageCache, preloadAllPartImages } from "../imagePreloadService.js";
import { fetchVersionForSplash, addSplashStats as addSplashStatsFromModule } from "./splashVersionStats.js";
import { logger } from "../../utils/logger.js";

async function waitForSplashElement(selector, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    manager.splashScreen = document.querySelector("#splash-screen") ?? await waitForSplashElement("#splash-screen");
    manager.statusElement = document.querySelector("#splash-status") ?? manager.splashScreen?.querySelector("#splash-status");
    if (!manager.splashScreen) throw new Error("Splash screen not found (AppRoot must render first)");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) => logger.log('warn', 'splash', '[PWA] Background part image preloading failed:', error));
    } catch (e) {
      logger.log('warn', 'splash', '[PWA] Failed to warm image cache:', e);
    }
    return true;
  } catch (error) {
    logger.log('error', 'splash', 'Error loading splash screen:', error);
    return false;
  }
}

export function runSetStep(manager, stepId) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = step.message;
  }
}

export function runSetSubStep(manager, message) {
  if (manager.statusElement) {
    manager.statusElement.classList.remove("splash-element-hidden");
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = message;
  }
}
