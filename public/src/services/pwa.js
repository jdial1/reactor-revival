import { VersionSchema } from "../schema/index.js";
import { StorageUtils } from "../storage/index.js";
import { logger } from "../core/logger.js";
import { loadChangelog, getRecentChangelogEntries, findChangelogEntry } from "./changelog.js";
import { pwaState } from "../state/ui-state.js";
import { getAppContext } from "../app-context.js";
import { getBasePath } from "../dom/lit.js";

let pwaAbortController = null;
const pwaUnsubs = [];
let pwaGlobalListenersAttached = false;

function getPwaSignal() {
  if (!pwaAbortController) {
    pwaAbortController = new AbortController();
  }
  return pwaAbortController.signal;
}

function bindPwaListener(target, type, handler, options) {
  if (!target || typeof target.addEventListener !== "function") return;
  const signal = getPwaSignal();
  const opts = options ? { ...options, signal } : { signal };
  target.addEventListener(type, handler, opts);
  pwaUnsubs.push(() => target.removeEventListener(type, handler, opts));
}

function onControllerChange() {
  window.location.reload();
}

function parseVersionFromData(data) {
  const parsed = VersionSchema.safeParse(data);
  return parsed.success ? parsed.data.version : null;
}

async function parseVersionFromResponse(response) {
  if (!response?.ok) return null;
  const data = await response.json();
  return parseVersionFromData(data);
}

function onNewWorkerStateChange(newWorker) {
  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
    logger.log('info', 'ui', '[SW] New service worker available');
  }
}

function onRegistrationUpdateFound(registration) {
  const newWorker = registration.installing;
  if (newWorker) {
    bindPwaListener(newWorker, 'statechange', () => onNewWorkerStateChange(newWorker));
  }
}

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
        bindPwaListener(navigator.serviceWorker, 'controllerchange', onControllerChange, { once: true });
      }
      bindPwaListener(registration, 'updatefound', () => onRegistrationUpdateFound(registration));
    })
    .catch(function(error) {
      logger.error('[SW] Service Worker registration failed:', error);
    });
}

function onPwaKeydown(e) {
  const splash = getAppContext()?.splashManager;
  if (e.key === "Escape" && splash) {
    splash.forceHide();
  }
  if (e.ctrlKey && e.shiftKey && e.key === "V") {
    e.preventDefault();
    pwaState.versionCheckRequested = true;
  }
}

function onPwaAppInstalled() {
  clearDeferredPrompt();
  pwaState.installPromptAvailable = false;
}

function initPwaGlobalListeners() {
  if (pwaGlobalListenersAttached || typeof document === "undefined" || typeof window === "undefined") return;
  pwaGlobalListenersAttached = true;
  bindPwaListener(document, "keydown", onPwaKeydown);
  bindPwaListener(window, "appinstalled", onPwaAppInstalled);
}

export function teardownPwa() {
  pwaAbortController?.abort();
  pwaAbortController = null;
  while (pwaUnsubs.length) {
    pwaUnsubs.pop()?.();
  }
  pwaGlobalListenersAttached = false;
  wakeLockVisibilityListenerAttached = false;
  releaseWakeLock();
}

export function initializePwa() {
  console.log("[ReactorBoot] initializePwa", window.location.hostname);
  initPwaGlobalListeners();
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
  bindPwaListener(window, 'load', registerServiceWorker);
}

let deferredPrompt = null;

export function getDeferredPrompt() {
  return deferredPrompt;
}

function clearDeferredPrompt() {
  deferredPrompt = null;
  pwaState.installPromptAvailable = false;
}

export async function onInstallPwaClick() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice.catch((err) => {
    logger.warn("PWA install choice failed", err);
  });
  deferredPrompt = null;
  pwaState.installPromptAvailable = false;
}

function onBeforeInstallPrompt(e, manager) {
  e.preventDefault();
  if (manager) manager.installPrompt = e;
  deferredPrompt = e;
  pwaState.installPromptAvailable = true;
}

export function setupInstallPrompt(manager) {
  if (typeof window === "undefined") return;
  bindPwaListener(window, "beforeinstallprompt", (e) => onBeforeInstallPrompt(e, manager));
}

let wakeLock = null;
let wakeLockEnabled = false;
let wakeLockVisibilityListenerAttached = false;

async function acquireWakeLock() {
  if (!wakeLockEnabled) return;
  if (!('wakeLock' in navigator)) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (err) {
    logger.warn("wakeLock request failed", err);
  }
}

function onWakeLockVisibilityChange() {
  if (document.visibilityState === 'visible') {
    acquireWakeLock();
  }
}

export async function requestWakeLock() {
  wakeLockEnabled = true;
  if (!wakeLockVisibilityListenerAttached && typeof document !== "undefined") {
    bindPwaListener(document, 'visibilitychange', onWakeLockVisibilityChange);
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


export class VersionChecker {
  constructor(splashManagerRef) {
    this.splashManagerRef = splashManagerRef;
    this.currentVersion = null;
  }

  startVersionChecking() {
    this.stopVersionChecking();
    this.currentVersion = null;
    this._versionAbortController = new AbortController();
    const { signal } = this._versionAbortController;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'NEW_VERSION_AVAILABLE') {
          this.handleNewVersion(event.data.version, event.data.currentVersion);
        }
      }, { signal });
    }
  }

  stopVersionChecking() {
    this._versionAbortController?.abort();
    this._versionAbortController = null;
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

      const basePath = getBasePath();
      const versionUrl = `${window.location.origin}${basePath}/version.json`;

      const response = await fetch(versionUrl, {
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });

      if (response.ok) {
        return parseVersionFromResponse(response);
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check deployed version:', error);
    }
    return null;
  }

  async getLocalVersion() {
    try {
      const cache = await caches.open("static-resources");
      const basePath = getBasePath();
      const versionUrl = `${basePath}/version.json`;
      const response = await cache.match(versionUrl);
      if (response) {
        return parseVersionFromResponse(response);
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from cache:', error);
    }

    try {
      const { getResourceUrl } = await import("../dom/lit.js");
      const versionUrl = getResourceUrl("version.json");
      const response = await fetch(versionUrl, { cache: 'no-cache' });
      if (response.ok) {
        return parseVersionFromResponse(response);
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
    const changelog = loadChangelog();
    const entry = findChangelogEntry(changelog, newVersion);
    pwaState.updateAvailable = true;
    pwaState.updateVersion = newVersion;
    pwaState.hasAcknowledgedUpdate = false;
    pwaState.currentVersion = currentVersion || this.currentVersion || "";
    pwaState.changelogPayload = entry ? { summary: `Update ${newVersion} — ${entry.date ?? "new build"}`, bullets: (entry.bullets ?? []).slice(0, 6) } : { summary: `Update available: ${newVersion}`, bullets: [] };
    this.currentVersion = newVersion;
    StorageUtils.set('reactor-last-notified-version', newVersion);
  }

  showUpdateNotification(newVersion, currentVersion) {
    this.handleNewVersion(newVersion, currentVersion);
  }

  showUpdateToast(newVersion, currentVersion) {
    this.handleNewVersion(newVersion, currentVersion);
  }

  showChangelogModal({ title, entries, onReload } = {}) {
    pwaState.changelogOpen = true;
    pwaState.changelogPayload = { title: title ?? "Recent Changes", entries: entries ?? [], onReload };
  }

  showRecentChangelogModal({ title, limit = 5, onReload } = {}) {
    const entries = getRecentChangelogEntries(loadChangelog(), limit);
    this.showChangelogModal({ title, entries, onReload });
  }

  async triggerVersionCheckToast() {
    try {
      const currentVersion = await this.getLocalVersion() || "Unknown";
      await this.showRecentChangelogModal({
        title: `Version ${currentVersion} — recent changes`,
        limit: 5,
      });
    } catch (error) {
      logger.log('error', 'ui', 'Version check failed:', error);
      this.showVersionCheckToast('Version check failed. Please try again later.', 'error');
    }
  }

  showVersionCheckToast(message, type = "info") {
    pwaState.versionCheckToast = { message, type };
    setTimeout(() => {
      if (pwaState.versionCheckToast?.message === message) pwaState.versionCheckToast = null;
    }, 5000);
  }

  clearVersionNotification() {
    StorageUtils.remove('reactor-last-notified-version');
    pwaState.hasAcknowledgedUpdate = true;
    pwaState.updateAvailable = false;
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

async function preloadTierImages(tier) {
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

export function initLaunchQueueHandler({ game, onFileLoaded } = {}) {
  if (typeof window === "undefined") return;
  if (!("launchQueue" in window) || !("files" in LaunchParams.prototype)) return;

  window.launchQueue.setConsumer(async (launchParams) => {
    if (!launchParams.files.length) return;

    const fileHandle = launchParams.files[0];
    const file = await fileHandle.getFile();
    const text = await file.text();

    try {
      const validated = game?.saveManager?.validateSaveData(text);
      if (game.engine?.running) game.pause();

      const confirmLoad = confirm(
        `Load save "${file.name}"?\n(Current unsaved progress will be lost)`
      );

      if (!confirmLoad || !validated) return;

      if (typeof onFileLoaded === "function") {
        await onFileLoaded(validated, fileHandle);
        return;
      }

      await game.applySaveState(validated);
      game.activeFileHandle = fileHandle;
    } catch (e) {
      logger.log("error", "game", "[PWA] Error handling launch file", e);
    }
  });
}
