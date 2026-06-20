import { render } from "lit-html";
import { VersionSchema } from "./state.js";
import {
  logger,
  StorageUtils,
  escapeHtml,
} from "./utils.js";
import {
  updateNotificationModalTemplate,
  updateToastTemplate as updateToastTemplateView,
  versionCheckToastTemplate,
} from "./templates/servicesTemplates.js";

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
  console.log("[ReactorBoot] initializePwa", window.location.hostname);
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

      const { getBasePath } = await import("./utils.js");
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
      const { getBasePath } = await import("./utils.js");
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
      const { getResourceUrl } = await import("./utils.js");
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
    render(
      updateNotificationModalTemplate(
        escapeHtml(currentVersion),
        escapeHtml(newVersion),
        () => window.location.reload(),
        onDismiss
      ),
      modal
    );

    document.body.appendChild(modal);

    setTimeout(() => {
      if (document.body && typeof document.body.contains === "function" && document.body.contains(modal)) {
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
    render(updateToastTemplateView(onRefresh, onClose), toast);

    if (document.body) document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body && typeof document.body.contains === "function" && document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body && typeof document.body.contains === "function" && document.body.contains(toast)) {
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
    render(versionCheckToastTemplate(borderColor, icon, message, onClose), toast);

    if (document.body) document.body.appendChild(toast);

    setTimeout(() => {
      if (document.body && typeof document.body.contains === "function" && document.body.contains(toast)) {
        toast.style.animation = 'toast-slide-up 0.3s ease-out reverse';
        setTimeout(() => {
          if (document.body && typeof document.body.contains === "function" && document.body.contains(toast)) {
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
    'img/parts/accelerator_1.png',
    'img/parts/capacitor_1.png',
    'img/parts/cell_1_1.png',
    'img/parts/cell_1_2.png',
    'img/parts/cell_1_4.png',
    'img/parts/coolant_cell_1.png',
    'img/parts/exchanger_1.png',
    'img/parts/inlet_1.png',
    'img/parts/outlet_1.png',
    'img/parts/plating_1.png',
    'img/parts/reflector_1.png',
    'img/parts/vent_1.png',
  ],
  2: [
    'img/parts/accelerator_2.png',
    'img/parts/capacitor_2.png',
    'img/parts/cell_2_1.png',
    'img/parts/cell_2_2.png',
    'img/parts/cell_2_4.png',
    'img/parts/coolant_cell_2.png',
    'img/parts/exchanger_2.png',
    'img/parts/inlet_2.png',
    'img/parts/outlet_2.png',
    'img/parts/plating_2.png',
    'img/parts/reflector_2.png',
    'img/parts/vent_2.png',
  ],
  3: [
    'img/parts/accelerator_3.png',
    'img/parts/capacitor_3.png',
    'img/parts/cell_3_1.png',
    'img/parts/cell_3_2.png',
    'img/parts/cell_3_4.png',
    'img/parts/coolant_cell_3.png',
    'img/parts/exchanger_3.png',
    'img/parts/inlet_3.png',
    'img/parts/outlet_3.png',
    'img/parts/plating_3.png',
    'img/parts/reflector_3.png',
    'img/parts/vent_3.png',
  ],
  4: [
    'img/parts/accelerator_4.png',
    'img/parts/capacitor_4.png',
    'img/parts/cell_4_1.png',
    'img/parts/cell_4_2.png',
    'img/parts/cell_4_4.png',
    'img/parts/coolant_cell_4.png',
    'img/parts/exchanger_4.png',
    'img/parts/inlet_4.png',
    'img/parts/outlet_4.png',
    'img/parts/plating_4.png',
    'img/parts/reflector_4.png',
    'img/parts/vent_4.png',
  ],
  5: [
    'img/parts/accelerator_5.png',
    'img/parts/capacitor_5.png',
    'img/parts/coolant_cell_5.png',
    'img/parts/exchanger_5.png',
    'img/parts/inlet_5.png',
    'img/parts/outlet_5.png',
    'img/parts/plating_5.png',
    'img/parts/cell_5_1.png',
    'img/parts/cell_5_2.png',
    'img/parts/cell_5_4.png',
    'img/parts/reflector_5.png',
    'img/parts/vent_5.png',
  ],
  6: [
    'img/parts/accelerator_6.png',
    'img/parts/capacitor_6.png',
    'img/parts/cell_6_1.png',
    'img/parts/cell_6_2.png',
    'img/parts/cell_6_4.png',
    'img/parts/xcell_1_1.png',
    'img/parts/xcell_1_2.png',
    'img/parts/xcell_1_4.png',
    'img/parts/coolant_cell_6.png',
    'img/parts/exchanger_6.png',
    'img/parts/inlet_6.png',
    'img/parts/outlet_6.png',
    'img/parts/plating_6.png',
    'img/parts/reflector_6.png',
    'img/parts/vent_6.png',
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
    'img/parts/cell_1_1.png', 'img/parts/cell_1_2.png', 'img/parts/cell_1_4.png',
    'img/parts/accelerator_1.png', 'img/parts/capacitor_1.png',
    'img/parts/coolant_cell_1.png', 'img/parts/exchanger_1.png',
    'img/parts/inlet_1.png', 'img/parts/outlet_1.png',
    'img/parts/plating_1.png', 'img/parts/reflector_1.png',
    'img/parts/vent_1.png',
    'img/parts/valve_1_1.png',
    'img/parts/valve_2_1.png',
    'img/parts/valve_3_1.png',
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
