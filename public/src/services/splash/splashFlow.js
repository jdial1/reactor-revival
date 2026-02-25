import { getResourceUrl, isTestEnv } from "../../utils/util.js";
import { getCriticalUiIconAssets, warmImageCache, preloadAllPartImages } from "../imagePreloadService.js";
import { generateSplashBackground } from "../splashBackground.js";
import { fetchVersionForSplash, addSplashStats as addSplashStatsFromModule } from "./splashVersionStats.js";
import { logger } from "../../utils/logger.js";

export async function runLoadSplashScreen(manager) {
  if (isTestEnv()) return false;
  try {
    const response = await fetch(getResourceUrl("pages/splash.html"));
    const html = await response.text();
    const container = document.querySelector("#splash-container");
    if (!container) throw new Error("Splash container not found");
    container.innerHTML = html;
    manager.splashScreen = container.querySelector("#splash-screen");
    manager.statusElement = container.querySelector("#splash-status");
    manager.flavorElement = container.querySelector("#splash-flavor");
    manager.uiManager?.setRefs({ statusElement: manager.statusElement, flavorElement: manager.flavorElement, splashScreen: manager.splashScreen });
    await manager.initializeSplashStats();
    manager.updateUserCountDisplay();
    try {
      await warmImageCache(getCriticalUiIconAssets());
      preloadAllPartImages().catch((error) => logger.log('warn', 'splash', '[PWA] Background part image preloading failed:', error));
    } catch (e) {
      logger.log('warn', 'splash', '[PWA] Failed to warm image cache:', e);
    }
    if (manager.splashScreen) generateSplashBackground();
    return true;
  } catch (error) {
    logger.log('error', 'splash', 'Error loading splash screen:', error);
    return false;
  }
}

export function runSetStep(manager, stepId, flavorMessages) {
  const stepIndex = manager.loadingSteps.findIndex((step) => step.id === stepId);
  if (stepIndex === -1) return;
  manager.currentStep = stepIndex;
  const step = manager.loadingSteps[manager.currentStep];
  if (manager.statusElement) manager.statusElement.classList.add("splash-element-hidden");
  if (flavorMessages?.length > 0 && manager.flavorElement) {
    const flavorMessage = flavorMessages[Math.floor(Math.random() * flavorMessages.length)];
    manager.flavorElement.textContent = flavorMessage;
    manager.flavorElement.classList.remove("splash-element-hidden");
    manager.flavorElement.classList.add("splash-element-visible");
  } else if (manager.statusElement) {
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = step.message;
  }
}

export function runSetSubStep(manager, message, flavorMessages) {
  if (manager.statusElement) manager.statusElement.classList.add("splash-element-hidden");
  if (flavorMessages?.length > 0 && manager.flavorElement) {
    manager.flavorElement.textContent = flavorMessages[Math.floor(Math.random() * flavorMessages.length)];
    manager.flavorElement.classList.remove("splash-element-hidden");
    manager.flavorElement.classList.add("splash-element-visible");
  } else if (manager.statusElement) {
    manager.statusElement.classList.add("splash-element-visible");
    manager.statusElement.textContent = message;
  }
}
