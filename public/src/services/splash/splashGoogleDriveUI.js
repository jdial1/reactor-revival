import { html, render } from "lit-html";
import { LoadFromCloudButton, GoogleSignInButton } from "../../components/buttonFactory.js";
import { showCloudVsLocalConflictModal } from "../saveModals.js";
import { logger } from "../../utils/logger.js";
import { MODAL_IDS } from "../../components/ModalManager.js";
import { fetchResolvedSaves } from "../savesQuery.js";

async function shouldAbortDueToConflict(cloudSaveData) {
  const { maxLocalTime } = await fetchResolvedSaves();
  const cloudTime = cloudSaveData.last_save_time || 0;
  if (maxLocalTime <= 0 || cloudTime <= maxLocalTime) return false;
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
  const validated = game.saveManager.validateSaveData(cloudSaveData);
  await game.applySaveState(validated);
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
    const { dataJSON } = await fetchResolvedSaves();
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
      render(LoadFromCloudButton(handleCloudLoadClick), cloudButtonArea);
      const btn = cloudButtonArea.firstElementChild;
      if (btn) applyOfflineStateToButton(btn);
    } else {
      render(html`<div>No cloud save found.</div>`, cloudButtonArea);
    }
  } catch (_) {
    render(html`<div>Cloud check failed.</div>`, cloudButtonArea);
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
  const onClick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const span = btn.querySelector("span");
    if (span) span.textContent = "Signing in...";
    await handleSignInClick(manager, cloudButtonArea);
  };
  render(GoogleSignInButton(onClick), cloudButtonArea);
  const btn = cloudButtonArea.firstElementChild;
  if (btn) applyOfflineStateToButton(btn);
}

export async function updateSplashGoogleDriveUI(manager, isSignedIn, cloudButtonArea) {
  render(html``, cloudButtonArea);
  if (isSignedIn) {
    await renderSignedInCloudUI(cloudButtonArea);
  } else {
    renderSignedOutSignInUI(manager, cloudButtonArea);
  }
}
