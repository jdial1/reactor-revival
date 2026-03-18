import { html, render } from "lit-html";
import { StorageUtils, setSlot1FromBackupAsync, escapeHtml, logger } from "../utils/utils_constants.js";
import { VersionSchema } from "../utils/utils_constants.js";

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
  import("./splash.js").then((m) => {
    window.splashManager = m.createSplashManager();
    setupInstallPrompt(window.splashManager);
  });
  import("../core/save_system.js").then((m) => {
    window.showLoadBackupModal = m.showLoadBackupModal;
  });
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

export class VersionChecker {
  constructor(splashManagerRef) {
    this.splashManagerRef = splashManagerRef;
    this.currentVersion = null;
  }

  startVersionChecking() {
    this.currentVersion = null;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
          this.handleNewVersion(event.data.version, event.data.currentVersion);
        }
      });
    }
  }

  async checkForNewVersion() {
    try {
      const localResponse = await fetch('./version.json', { cache: 'no-cache' });

      if (!localResponse.ok) {
        logger.log('warn', 'ui', `Local version check failed with status: ${localResponse.status}`);
        return;
      }

      const contentType = localResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        logger.log('warn', 'ui', `Local version response is not JSON. Content-Type: ${contentType}`);
        return;
      }

      const localVersionData = await localResponse.json();
      const parsedLocal = VersionSchema.safeParse(localVersionData);
      const currentLocalVersion = parsedLocal.success ? parsedLocal.data.version : "Unknown";

      if (!currentLocalVersion) {
        logger.log('warn', 'ui', 'Local version data missing or invalid:', localVersionData);
        return;
      }

      if (this.currentVersion === null) {
        this.currentVersion = currentLocalVersion;
      }

      const latestVersion = await this.checkDeployedVersion();

      if (latestVersion && this.isNewerVersion(latestVersion, currentLocalVersion)) {
        this.handleNewVersion(latestVersion, currentLocalVersion);
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check for new version:', error);
    }
  }

  async checkDeployedVersion() {
    try {
      if (!navigator.onLine) {
        return null;
      }
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return null;
      }

      const { getBasePath } = await import("../utils/utils_constants.js");
      const basePath = getBasePath();
      const versionUrl = `${window.location.origin}${basePath}/version.json`;

      const response = await fetch(versionUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check deployed version:', error);
    }
    return null;
  }

  async getLocalVersion() {
    try {
      const cache = await caches.open("static-resources");
      const { getBasePath } = await import("../utils/utils_constants.js");
      const basePath = getBasePath();
      const versionUrl = `${basePath}/version.json`;
      const response = await cache.match(versionUrl);
      if (response) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from cache:', error);
    }

    try {
      const { getResourceUrl } = await import("../utils/utils_constants.js");
      const versionUrl = getResourceUrl("version.json");
      const response = await fetch(versionUrl, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        const parsed = VersionSchema.safeParse(data);
        return parsed.success ? parsed.data.version : null;
      }
    } catch (error) {
      console.warn("Failed to get local version from direct fetch:", error);
    }

    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        return new Promise((resolve) => {
          const messageChannel = new MessageChannel();
          messageChannel.port1.onmessage = (event) => {
            if (event.data && event.data.type === 'VERSION_RESPONSE') {
              resolve(event.data.version);
            } else {
              resolve(null);
            }
          };

          navigator.serviceWorker.controller.postMessage({
            type: 'GET_VERSION'
          }, [messageChannel.port2]);

          setTimeout(() => resolve(null), 2000);
        });
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from service worker:', error);
    }

    return null;
  }

  isNewerVersion(deployedVersion, localVersion) {
    if (!deployedVersion || !localVersion) {
      return false;
    }
    return deployedVersion > localVersion;
  }

  handleNewVersion(newVersion, currentVersion = null) {
    const lastNotifiedVersion = StorageUtils.get('reactor-last-notified-version');
    if (lastNotifiedVersion === newVersion) return;
    this.showUpdateToast(newVersion, currentVersion || this.currentVersion);
    this.currentVersion = newVersion;
    StorageUtils.set('reactor-last-notified-version', newVersion);
  }

  showUpdateNotification(newVersion, currentVersion) {
    const modal = document.createElement("div");
    modal.className = "update-notification-modal";
    const onDismiss = () => modal.remove();
    render(html`
      <style>
        .update-notification-modal {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center;
          align-items: center; z-index: 10000; font-family: 'Press Start 2P', monospace;
        }
        .update-notification-content {
          background: #2a2a2a; border: 2px solid #4a4a4a; border-radius: 8px;
          padding: 20px; max-width: 400px; text-align: center; color: #fff;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        }
        .update-notification-content h3 { margin: 0 0 15px 0; color: #4CAF50; font-size: 1.2em; }
        .version-comparison { margin: 15px 0; display: flex; justify-content: space-around; gap: 20px; }
        .version-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .version-label { font-size: 0.9em; color: #ccc; }
        .version-value { font-size: 1.1em; font-weight: bold; padding: 5px 10px; border-radius: 4px; }
        .version-value.current { background: #f44336; color: white; }
        .version-value.latest { background: #4CAF50; color: white; }
        .update-instruction { margin: 15px 0; font-size: 0.9em; line-height: 1.4; }
        .update-instruction a { color: #4CAF50; text-decoration: none; }
        .update-instruction a:hover { text-decoration: underline; }
        .update-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
        .update-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.9em; transition: background-color 0.2s; }
        .update-btn.refresh { background: #4CAF50; color: white; }
        .update-btn.refresh:hover { background: #45a049; }
        .update-btn.dismiss { background: #666; color: white; }
        .update-btn.dismiss:hover { background: #777; }
      </style>
      <div class="update-notification-content">
        <h3>🚀 Update Available!</h3>
        <p>A new version of Reactor Revival is available:</p>
        <div class="version-comparison">
          <div class="version-item">
            <span class="version-label">Current:</span>
            <span class="version-value current">${escapeHtml(currentVersion)}</span>
          </div>
          <div class="version-item">
            <span class="version-label">Latest:</span>
            <span class="version-value latest">${escapeHtml(newVersion)}</span>
          </div>
        </div>
        <p class="update-instruction">
          To get the latest version, refresh your browser or check for updates.
        </p>
        <div class="update-actions">
          <button class="update-btn refresh" @click=${() => window.location.reload()}>
            🔄 Refresh Now
          </button>
          <button class="update-btn dismiss" @click=${onDismiss}>
            ✕ Dismiss
          </button>
        </div>
      </div>
    `, modal);

    document.body.appendChild(modal);

    setTimeout(() => {
      if (document.body.contains(modal)) {
        modal.remove();
      }
    }, 30000);
  }

  showUpdateToast(_newVersion, _currentVersion) {
    const existingToast = document.querySelector('.update-toast');
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = 'update-toast';
    const onRefresh = () => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
      }
      window.location.reload();
    };
    const onClose = () => toast.remove();
    render(html`
      <style>
        .update-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid #4CAF50; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .update-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .update-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; color: #fff; }
        .update-toast-text { font-size: 0.9em; font-weight: 500; }
        .update-toast-button { background: #4CAF50; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-family: 'Press Start 2P', monospace; font-size: 0.8em; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
        .update-toast-button:hover { background: #45a049; }
        .update-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .update-toast-close:hover { color: #fff; }
        @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media (max-width: 480px) { .update-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .update-toast-content { padding: 10px 12px; gap: 8px; } .update-toast-text { font-size: 0.8em; } .update-toast-button { padding: 6px 12px; font-size: 0.75em; } }
      </style>
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-text">New content available, click to reload.</span>
        </div>
        <button class="update-toast-button" @click=${onRefresh}>Reload</button>
        <button class="update-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 10000);
  }

  async triggerVersionCheckToast() {
    try {
      const currentVersion = await this.getLocalVersion() || "Unknown";
      const deployedVersion = await this.checkDeployedVersion();
      if (deployedVersion && this.isNewerVersion(deployedVersion, currentVersion)) {
        this.showUpdateToast(deployedVersion, currentVersion);
      } else if (deployedVersion && deployedVersion === currentVersion) {
        this.showVersionCheckToast(`You're running the latest version: ${currentVersion}`, 'info');
      } else if (deployedVersion && !this.isNewerVersion(deployedVersion, currentVersion) && deployedVersion !== currentVersion) {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Deployed: ${deployedVersion})`, 'warning');
      } else {
        this.showVersionCheckToast(`Current version: ${currentVersion} (Unable to check for updates)`, 'warning');
      }
    } catch (error) {
      logger.log('error', 'ui', 'Version check failed:', error);
      this.showVersionCheckToast('Version check failed. Please try again later.', 'error');
    }
  }

  showVersionCheckToast(message, type = "info") {
    const existingToast = document.querySelector(".version-check-toast");
    if (existingToast) {
      existingToast.remove();
    }

    const toast = document.createElement("div");
    toast.className = "version-check-toast";
    const icon = type === "info" ? "ℹ️" : type === "warning" ? "⚠️" : "❌";
    const borderColor = type === "info" ? "#2196F3" : type === "warning" ? "#FF9800" : "#f44336";
    const onClose = () => toast.remove();
    render(html`
      <style>
        .version-check-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid ${borderColor}; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .version-check-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .version-check-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; }
        .version-check-toast-icon { font-size: 1.2em; }
        .version-check-toast-text { color: #fff; font-size: 0.7em; line-height: 1.4; }
        .version-check-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .version-check-toast-close:hover { color: #fff; }
        @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media (max-width: 480px) { .version-check-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .version-check-toast-content { padding: 10px 12px; gap: 8px; } .version-check-toast-text { font-size: 0.6em; } }
      </style>
      <div class="version-check-toast-content">
        <div class="version-check-toast-message">
          <span class="version-check-toast-icon">${icon}</span>
          <span class="version-check-toast-text">${message}</span>
        </div>
        <button class="version-check-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body.contains(toast)) {
            toast.remove();
          }
        }, 300);
      }
    }, 5000);
  }

  clearVersionNotification() {
    StorageUtils.remove('reactor-last-notified-version');
    const versionEl = this.splashManagerRef.splashScreen?.querySelector('#splash-version-text');
    if (versionEl) {
      versionEl.classList.remove('new-version');
      versionEl.title = 'Click to check for updates';
    }
  }
}

const partImagesByTier = {
  1: [
    'img/parts/accelerators/accelerator_1.png',
    'img/parts/capacitors/capacitor_1.png',
    'img/parts/cells/cell_1_1.png',
    'img/parts/cells/cell_1_2.png',
    'img/parts/cells/cell_1_4.png',
    'img/parts/coolants/coolant_cell_1.png',
    'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png',
    'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png',
    'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png',
  ],
  2: [
    'img/parts/accelerators/accelerator_2.png',
    'img/parts/capacitors/capacitor_2.png',
    'img/parts/cells/cell_2_1.png',
    'img/parts/cells/cell_2_2.png',
    'img/parts/cells/cell_2_4.png',
    'img/parts/coolants/coolant_cell_2.png',
    'img/parts/exchangers/exchanger_2.png',
    'img/parts/inlets/inlet_2.png',
    'img/parts/outlets/outlet_2.png',
    'img/parts/platings/plating_2.png',
    'img/parts/reflectors/reflector_2.png',
    'img/parts/vents/vent_2.png',
  ],
  3: [
    'img/parts/accelerators/accelerator_3.png',
    'img/parts/capacitors/capacitor_3.png',
    'img/parts/cells/cell_3_1.png',
    'img/parts/cells/cell_3_2.png',
    'img/parts/cells/cell_3_4.png',
    'img/parts/coolants/coolant_cell_3.png',
    'img/parts/exchangers/exchanger_3.png',
    'img/parts/inlets/inlet_3.png',
    'img/parts/outlets/outlet_3.png',
    'img/parts/platings/plating_3.png',
    'img/parts/reflectors/reflector_3.png',
    'img/parts/vents/vent_3.png',
  ],
  4: [
    'img/parts/accelerators/accelerator_4.png',
    'img/parts/capacitors/capacitor_4.png',
    'img/parts/cells/cell_4_1.png',
    'img/parts/cells/cell_4_2.png',
    'img/parts/cells/cell_4_4.png',
    'img/parts/coolants/coolant_cell_4.png',
    'img/parts/exchangers/exchanger_4.png',
    'img/parts/inlets/inlet_4.png',
    'img/parts/outlets/outlet_4.png',
    'img/parts/platings/plating_4.png',
    'img/parts/reflectors/reflector_4.png',
    'img/parts/vents/vent_4.png',
  ],
  5: [
    'img/parts/accelerators/accelerator_5.png',
    'img/parts/capacitors/capacitor_5.png',
    'img/parts/coolants/coolant_cell_5.png',
    'img/parts/exchangers/exchanger_5.png',
    'img/parts/inlets/inlet_5.png',
    'img/parts/outlets/outlet_5.png',
    'img/parts/platings/plating_5.png',
    'img/parts/cells/cell_5_1.png',
    'img/parts/cells/cell_5_2.png',
    'img/parts/cells/cell_5_4.png',
    'img/parts/reflectors/reflector_5.png',
    'img/parts/vents/vent_5.png',
  ],
  6: [
    'img/parts/accelerators/accelerator_6.png',
    'img/parts/capacitors/capacitor_6.png',
    'img/parts/cells/cell_6_1.png',
    'img/parts/cells/cell_6_2.png',
    'img/parts/cells/cell_6_4.png',
    'img/parts/cells/xcell_1_1.png',
    'img/parts/cells/xcell_1_2.png',
    'img/parts/cells/xcell_1_4.png',
    'img/parts/coolants/coolant_cell_6.png',
    'img/parts/exchangers/exchanger_6.png',
    'img/parts/inlets/inlet_6.png',
    'img/parts/outlets/outlet_6.png',
    'img/parts/platings/plating_6.png',
    'img/parts/reflectors/reflector_6.png',
    'img/parts/vents/vent_6.png',
  ],
};

const maxTier = 6;

function getUiIconAssets() {
  return [
    'img/ui/icons/icon_cash.png', 'img/ui/icons/icon_heat.png',
    'img/ui/icons/icon_power.png', 'img/ui/icons/icon_time.png',
    'img/ui/icons/icon_inlet.png', 'img/ui/icons/icon_outlet.png',
    'img/ui/icons/icon_vent.png', 'img/ui/icons/icon_cash_outline.svg',
    'img/ui/icons/icon_copy.svg', 'img/ui/icons/icon_deselect.svg',
    'img/ui/icons/icon_dropper.svg', 'img/ui/icons/icon_paste.svg',
  ];
}

function getStatusAndNavAssets() {
  return [
    'img/ui/status/status_bolt.png', 'img/ui/status/status_infinity.png',
    'img/ui/status/status_plus.png', 'img/ui/status/status_star.png',
    'img/ui/status/status_time.png', 'img/ui/nav/nav_experimental.png',
    'img/ui/nav/nav_normal.png', 'img/ui/nav/nav_pause.png',
    'img/ui/nav/nav_play.png', 'img/ui/nav/nav_renew.png',
    'img/ui/nav/nav_unrenew.png',
  ];
}

function getBorderAndPanelAssets() {
  return [
    'img/ui/borders/button/button_border.png', 'img/ui/borders/button/button_border_alt.png',
    'img/ui/borders/button/button_border_alt_active.png', 'img/ui/borders/button/button_border_alt_down.png',
    'img/ui/borders/button/button_border_alt_down_active.png', 'img/ui/borders/button/small_button_down.png',
    'img/ui/borders/button/small_button_off.png', 'img/ui/borders/button/small_button_on.png',
    'img/ui/borders/panel/medium_panel.png', 'img/ui/borders/panel/panel_border.png',
    'img/ui/borders/panel/panel_border_first_first.png', 'img/ui/borders/panel/panel_border_first_last.png',
    'img/ui/borders/panel/panel_border_last_first.png', 'img/ui/borders/panel/panel_border_last_last.png',
    'img/ui/borders/panel/panel_border_last_middle.png',
  ];
}

function getInnerAndFlowAssets() {
  return [
    'img/ui/inner/inner_border.png', 'img/ui/inner/inner_border_alt.png',
    'img/ui/inner/inner_border_alt_active.png', 'img/ui/inner/inner_border_alt_down.png',
    'img/ui/inner/inner_border_alt_flip.png', 'img/ui/inner/inner_border_alt_flip_active.png',
    'img/ui/inner/inner_border_alt_flip_down.png', 'img/ui/flow/flow-arrow-down.svg',
    'img/ui/flow/flow-arrow-left.svg', 'img/ui/flow/flow-arrow-right.svg',
    'img/ui/flow/flow-arrow-up.svg', 'img/ui/effects/explosion_map.png',
    'img/ui/connector_border.png', 'img/ui/tile.png',
  ];
}

function getPartAssets() {
  return [
    'img/parts/cells/cell_1_1.png', 'img/parts/cells/cell_1_2.png', 'img/parts/cells/cell_1_4.png',
    'img/parts/accelerators/accelerator_1.png', 'img/parts/capacitors/capacitor_1.png',
    'img/parts/coolants/coolant_cell_1.png', 'img/parts/exchangers/exchanger_1.png',
    'img/parts/inlets/inlet_1.png', 'img/parts/outlets/outlet_1.png',
    'img/parts/platings/plating_1.png', 'img/parts/reflectors/reflector_1.png',
    'img/parts/vents/vent_1.png', 'img/parts/valves/valve_1_1.png',
    'img/parts/valves/valve_1_2.png', 'img/parts/valves/valve_1_3.png',
    'img/parts/valves/valve_1_4.png',
  ];
}

export function getCriticalUiIconAssets() {
  return [
    ...getUiIconAssets(),
    ...getStatusAndNavAssets(),
    ...getBorderAndPanelAssets(),
    ...getInnerAndFlowAssets(),
    ...getPartAssets(),
  ];
}

export async function warmImageCache(imagePaths) {
  const loadPromises = imagePaths.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve({ success: true, path: imagePath });
        img.onerror = () => resolve({ success: false, path: imagePath });
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      return { success: false, path: imagePath, error };
    }
  });
  try {
    const results = await Promise.allSettled(loadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'fulfilled' && !r.value.success).length;
    if (failed > 0) {
      const failedAssets = results
        .filter(r => r.status === 'fulfilled' && !r.value.success)
        .map(r => r.value.path);
      logger.log('warn', 'ui', `[PWA] Failed to preload: ${failedAssets.join(', ')}`);
    }
  } catch (error) {
    console.warn('[PWA] Image cache warming encountered an error:', error);
  }
}

export async function preloadTierImages(tier) {
  const tierImages = partImagesByTier[tier] || [];
  if (tierImages.length === 0) {
    return;
  }
  const loadPromises = tierImages.map(async (imagePath) => {
    try {
      const img = new Image();
      const loadPromise = new Promise((resolve) => {
        img.onload = () => resolve(imagePath);
        img.onerror = () => resolve(imagePath);
      });
      img.src = imagePath;
      return loadPromise;
    } catch (error) {
      logger.log('warn', 'ui', `[PWA] Error preloading tier ${tier} image ${imagePath}:`, error);
      return imagePath;
    }
  });
  await Promise.allSettled(loadPromises);
}

export async function preloadAllPartImages() {
  const tierPromises = Array.from({ length: maxTier }, (_, i) => preloadTierImages(i + 1));
  await Promise.all(tierPromises);
}

export function getPartImagesByTier() {
  return partImagesByTier;
}

export function getMaxTier() {
  return maxTier;
}
