import { createLoadFromCloudButton, createGoogleSignInButton } from "../../components/buttonFactory.js";
import { getLocalSaveMaxTimestamp, showCloudVsLocalConflictModal } from "../saveModals.js";
import { logger } from "../../utils/logger.js";
import { MODAL_IDS } from "../../components/ModalManager.js";

async function shouldAbortDueToConflict(cloudSaveData) {
  const { maxTime } = getLocalSaveMaxTimestamp();
  const cloudTime = cloudSaveData.last_save_time || 0;
  if (maxTime <= 0 || cloudTime <= maxTime) return false;
  const orchestrator = window.ui?.modalOrchestrator;
  const choice = orchestrator
    ? await orchestrator.showModal(MODAL_IDS.CLOUD_VS_LOCAL_CONFLICT, { cloudSaveData })
    : await showCloudVsLocalConflictModal(cloudSaveData);
  return choice === "cancel" || choice === "local";
}

function backupLocalSaveToSession(dataJSON) {
  if (dataJSON && typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("reactorSaveBackupBeforeCloud", dataJSON);
    sessionStorage.setItem("reactorSaveBackupTimestamp", String(Date.now()));
  }
}

async function applyCloudSaveAndLaunch(cloudSaveData) {
  const { pageRouter, ui, game } = window;
  if (!pageRouter || !ui || !game) return;
  game.applySaveState(cloudSaveData);
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
    return;
  }
  await pageRouter.loadGameLayout();
  ui.initMainLayout();
  await pageRouter.loadPage("reactor_section");
  game.tooltip_manager = new (await import("../../components/tooltip.js")).TooltipManager("#main", "#tooltip", game);
  game.engine = new (await import("../../core/engine.js")).Engine(game);
  await game.startSession();
  game.engine.start();
}

async function handleCloudLoadClick() {
  try {
    const cloudSaveData = await window.googleDriveSave.load();
    if (!cloudSaveData) {
      logger.log('warn', 'splash', 'Could not find a save file in Google Drive.');
      return;
    }
    if (await shouldAbortDueToConflict(cloudSaveData)) return;
    const { dataJSON } = getLocalSaveMaxTimestamp();
    backupLocalSaveToSession(dataJSON);
    if (window.splashManager) window.splashManager.hide();
    await new Promise((resolve) => setTimeout(resolve, 600));
    await applyCloudSaveAndLaunch(cloudSaveData);
  } catch (error) {
    logger.log('error', 'splash', 'Failed to load from Google Drive:', error);
    logger.log('warn', 'splash', `Error loading from Google Drive: ${error.message}`);
  }
}

function applyOfflineStateToButton(btn) {
  if (btn && !navigator.onLine) {
    btn.disabled = true;
    btn.title = "Requires an internet connection";
  }
}

async function renderSignedInCloudUI(cloudButtonArea) {
  try {
    await window.googleDriveSave.findSaveFile();
    const fileId = window.googleDriveSave.saveFileId;
    if (fileId) {
      const cloudBtn = createLoadFromCloudButton(handleCloudLoadClick);
      applyOfflineStateToButton(cloudBtn);
      cloudButtonArea.appendChild(cloudBtn);
    } else {
      const info = document.createElement("div");
      info.textContent = "No cloud save found.";
      cloudButtonArea.appendChild(info);
    }
  } catch (_) {
    cloudButtonArea.innerHTML = "Cloud check failed.";
  }
}

async function handleSignInClick(manager, cloudButtonArea) {
  try {
    await window.googleDriveSave.signIn();
    await updateSplashGoogleDriveUI(manager, true, cloudButtonArea);
  } catch (_) {
    const signInBtn = cloudButtonArea.querySelector("button");
    if (signInBtn) {
      const span = signInBtn.querySelector("span");
      if (span) span.textContent = "Sign in Failed";
      setTimeout(() => {
        if (span) span.textContent = "Google Sign In";
        signInBtn.disabled = false;
      }, 2000);
    }
  }
}

function renderSignedOutSignInUI(manager, cloudButtonArea) {
  const signInBtn = createGoogleSignInButton(async () => {
    signInBtn.disabled = true;
    const span = signInBtn.querySelector("span");
    if (span) span.textContent = "Signing in...";
    await handleSignInClick(manager, cloudButtonArea);
  });
  applyOfflineStateToButton(signInBtn);
  cloudButtonArea.appendChild(signInBtn);
}

export async function updateSplashGoogleDriveUI(manager, isSignedIn, cloudButtonArea) {
  cloudButtonArea.innerHTML = "";
  if (isSignedIn) {
    await renderSignedInCloudUI(cloudButtonArea);
  } else {
    renderSignedOutSignInUI(manager, cloudButtonArea);
  }
}
