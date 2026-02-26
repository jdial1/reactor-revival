import { StorageUtils, setSlot1FromBackupAsync } from "../utils/util.js";
import { showLoadBackupModal } from "./saveModals.js";
import { showTechTreeSelection } from "./gameSetupFlow.js";
import { createSplashManager, getFlavorMessages } from "./splashManager.js";
import { logger } from "../utils/logger.js";

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const pathParts = window.location.pathname.split('/').filter(p => p);
  const repoName = pathParts.length > 0 ? pathParts[0] : '';
  const basePath = repoName ? `/${repoName}` : '';
  const swPath = `${basePath}/sw.js`;
  const scope = `${basePath}/`;

  navigator.serviceWorker.register(swPath, { scope })
    .then(function(registration) {
      logger.log('info', 'ui', '[SW] Service Worker registered successfully:', registration.scope);
      if (!navigator.serviceWorker.controller) {
        navigator.serviceWorker.addEventListener('controllerchange', function() { window.location.reload(); }, { once: true });
      }
      registration.addEventListener('updatefound', function() {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', function() {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              logger.log('info', 'ui', '[SW] New service worker available');
            }
          });
        }
      });
    })
    .catch(function(error) {
      logger.error('[SW] Service Worker registration failed:', error);
    });
}

export function initializePwa() {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  if (isLocalhost) {
    logger.log('info', 'ui', '[SW] Localhost detected. Skipping Service Worker registration.');
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (let registration of registrations) {
          registration.unregister();
        }
      });
    }
    return;
  }
  window.addEventListener('load', registerServiceWorker);
}

let deferredPrompt = null;

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function clearDeferredPrompt() {
  deferredPrompt = null;
}

function setupInstallPrompt(manager) {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    if (manager) manager.installPrompt = e;
    deferredPrompt = e;
    const btn = document.querySelector("#install_pwa_btn");
    if (btn) {
      btn.classList.remove("hidden");
      if (!btn.dataset.installListenerAttached) {
        btn.dataset.installListenerAttached = "1";
        btn.addEventListener("click", async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            try {
              await deferredPrompt.userChoice;
            } catch (_) {}
            deferredPrompt = null;
            btn.classList.add("hidden");
          }
        });
      }
    }
  });
}

if (typeof window !== "undefined") {
  window.splashManager = createSplashManager();
  setupInstallPrompt(window.splashManager);
  window.showTechTreeSelection = showTechTreeSelection;
  window.showLoadBackupModal = showLoadBackupModal;
  window.setSlot1FromBackup = () => setSlot1FromBackupAsync();
}

let wakeLock = null;
let wakeLockEnabled = false;
let wakeLockVisibilityListenerAttached = false;

async function acquireWakeLock() {
  if (!wakeLockEnabled) return;
  if (!('wakeLock' in navigator)) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (_err) {}
}

export async function requestWakeLock() {
  wakeLockEnabled = true;
  if (!wakeLockVisibilityListenerAttached && typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        acquireWakeLock();
      }
    });
    wakeLockVisibilityListenerAttached = true;
  }
  await acquireWakeLock();
}

export function releaseWakeLock() {
  wakeLockEnabled = false;
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
  }
}

async function registerPeriodicSync() {
  try {
    if ('serviceWorker' in navigator) {
      const ready = await navigator.serviceWorker.ready;
      if ('periodicSync' in ready) {
        const tags = await ready.periodicSync.getTags();
        if (!tags.includes('reactor-periodic-sync')) {
          const perm = await navigator.permissions.query({ name: 'periodic-background-sync' });
          if (perm.state === 'granted') {
            await ready.periodicSync.register('reactor-periodic-sync', { minInterval: 60 * 60 * 1000 });
          }
        }
      }
    }
  } catch (_e) {}
}

async function registerOneOffSync() {
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const ready = await navigator.serviceWorker.ready;
      await ready.sync.register('reactor-sync');
    }
  } catch (_e) {}
}

function enable() {
  StorageUtils.set("debug-splash", true);
}

async function checkGoogleDrive() {
  if (window.googleDriveSave?.isSignedIn) {
    try {
      await window.googleDriveSave.offerLocalSaveUpload();
      await window.googleDriveSave.findSaveFile();
    } catch (error) {
      logger.error("- Error during check:", error);
    }
  }
}

async function testCloudSaveDetection() {
  if (!window.googleDriveSave?.isSignedIn) {
    logger.log('error', 'game', 'Not signed in to Google Drive');
    return;
  }
  window.googleDriveSave.saveFileId = null;
  await window.googleDriveSave.findSaveFile();
  if (window.splashManager) {
    await window.splashManager.refreshSaveOptions();
  }
}

async function testBasicOperations() {
  if (!window.googleDriveSave?.isSignedIn) {
    logger.log('error', 'game', 'Not signed in to Google Drive');
    return;
  }
  try {
    await window.googleDriveSave.testBasicFileOperations();
  } catch (error) {
    logger.log('error', 'game', 'Test error:', error);
  }
}

async function listAllFiles() {
  if (!window.googleDriveSave?.isSignedIn) {
    logger.log('error', 'game', 'Not signed in to Google Drive');
    return;
  }
  try {
    const rootResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=name contains 'reactor'&fields=files(id,name,parents,createdTime)",
      {
        headers: {
          Authorization: `Bearer ${window.googleDriveSave.authToken}`,
        },
      }
    );

    if (rootResponse.ok) {
      await rootResponse.json();
    }
    const appResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=parents in 'appDataFolder'&fields=files(id,name,parents,createdTime)",
      {
        headers: {
          Authorization: `Bearer ${window.googleDriveSave.authToken}`,
        },
      }
    );

    if (appResponse.ok) {
      await appResponse.json();
    }
  } catch (error) {
    logger.log('error', 'game', 'Error listing files:', error);
  }
}

function diagnoseOAuth() {}

async function testSaveFlow() {
  if (window.googleDriveSave?.isSignedIn) {
    try {
      await window.googleDriveSave.findSaveFile();
      if (window.splashManager) {
        await window.splashManager.refreshSaveOptions();
      }
    } catch (error) {
      logger.log('error', 'game', 'Error checking cloud save:', error);
    }
  }
}

function logPermissionError(label, response, errorText) {
  logger.error(`❌ ${label}: FAILED`);
  logger.error("- Status:", response.status, response.statusText);
  logger.error("- Error:", errorText);
}

async function testFileListingPermission() {
  const response = await fetch(
    "https://www.googleapis.com/drive/v3/files?pageSize=1",
    {
      headers: {
        Authorization: `Bearer ${window.googleDriveSave.authToken}`,
      },
    }
  );
  if (response.ok) {
    await response.json();
  } else {
    const errorText = await response.text();
    logPermissionError("File listing permissions", response, errorText);
  }
}

async function testSaveFileAccess() {
  const fileResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${window.googleDriveSave.saveFileId}`,
    {
      headers: {
        Authorization: `Bearer ${window.googleDriveSave.authToken}`,
      },
    }
  );
  if (fileResponse.ok) {
    await fileResponse.json();
  } else {
    const errorText = await fileResponse.text();
    logPermissionError("Save file access", fileResponse, errorText);
  }
}

async function testPermissions() {
  if (!window.googleDriveSave) {
    logger.log('error', 'game', 'GoogleDriveSave not available');
    return;
  }
  if (!window.googleDriveSave.isSignedIn) return;
  try {
    await testFileListingPermission();
    if (window.googleDriveSave.saveFileId) {
      await testSaveFileAccess();
    }
  } catch (error) {
    logger.log('error', 'game', 'Permission test failed:', error);
  }
}

function resetAuth() {
  if (window.googleDriveSave) {
    window.googleDriveSave.signOut();
    window.googleDriveSave.isSignedIn = false;
    window.googleDriveSave.authToken = null;
    window.googleDriveSave.saveFileId = null;
  }
  if (window.gapi?.client) {
    try {
      window.gapi.client.setToken(null);
    } catch (_error) {}
  }
}

function disable() {
  StorageUtils.remove("debug-splash");
}

function showRandomFlavor() {
  if (window.splashManager?.flavorElement) {
    window.splashManager.showRandomFlavorText();
  }
}

function listFlavors() {
  getFlavorMessages();
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.splashManager) {
      window.splashManager.forceHide();
    }
    if (e.ctrlKey && e.shiftKey && e.key === "V") {
      e.preventDefault();
      if (window.splashManager) {
        window.splashManager?.versionChecker?.triggerVersionCheckToast();
      }
    }
  });

  window.addEventListener("appinstalled", () => {
    clearDeferredPrompt();
    const btn = document.querySelector("#install_pwa_btn");
    if (btn) btn.classList.add("hidden");
  });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  (function setupConnectivityUI() {
    function updateGoogleDriveButtonState() {
      const isOnline = navigator.onLine;
      const selectors = [
        "#splash-load-cloud-btn",
        "#splash-google-signin-btn",
        "#splash-google-signout-btn",
        "#splash-signin-btn",
        "#splash-signout-btn",
        "#splash-upload-option-btn",
      ];
      selectors.forEach((sel) => {
        const el = document.querySelector(sel);
        if (el) {
          el.disabled = !isOnline;
          el.title = isOnline ? "Requires Google Drive permissions" : "Requires an internet connection";
        }
      });
      const cloudArea = document.getElementById("splash-cloud-button-area");
      if (cloudArea) {
        cloudArea.querySelectorAll("button").forEach((btn) => {
          btn.disabled = !isOnline;
          btn.title = isOnline ? btn.title || "" : "Requires an internet connection";
        });
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateGoogleDriveButtonState, { once: true });
    } else {
      updateGoogleDriveButtonState();
    }

    window.addEventListener("online", updateGoogleDriveButtonState);
    window.addEventListener("offline", updateGoogleDriveButtonState);
  })();
}

if (typeof window !== "undefined") {
  window.showHotkeyHelp = function () {};
}
