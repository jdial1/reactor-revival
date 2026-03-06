import { html, render } from "lit-html";
import { StorageUtils } from "../utils/util.js";
import { escapeHtml } from "../utils/stringUtils.js";
import { logger } from "../utils/logger.js";

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
      const currentLocalVersion = localVersionData.version;

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

      const { getBasePath } = await import("../utils/util.js");
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
        return data.version;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to check deployed version:', error);
    }
    return null;
  }

  async getLocalVersion() {
    try {
      const cache = await caches.open("static-resources");
      const { getBasePath } = await import("../utils/util.js");
      const basePath = getBasePath();
      const versionUrl = `${basePath}/version.json`;
      const response = await cache.match(versionUrl);
      if (response) {
        const data = await response.json();
        return data.version;
      }
    } catch (error) {
      logger.log('warn', 'ui', 'Failed to get local version from cache:', error);
    }

    try {
      const { getResourceUrl } = await import("../utils/util.js");
      const versionUrl = getResourceUrl("version.json");
      const response = await fetch(versionUrl, { cache: 'no-cache' });
      if (response.ok) {
        const data = await response.json();
        return data.version;
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

    const style = document.createElement('style');
    style.textContent = `
      .update-notification-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        font-family: 'Minecraft', monospace;
      }
      .update-notification-content {
        background: #2a2a2a;
        border: 2px solid #4a4a4a;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        text-align: center;
        color: #fff;
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
      .update-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-family: 'Minecraft', monospace; font-size: 0.9em; transition: background-color 0.2s; }
      .update-btn.refresh { background: #4CAF50; color: white; }
      .update-btn.refresh:hover { background: #45a049; }
      .update-btn.dismiss { background: #666; color: white; }
      .update-btn.dismiss:hover { background: #777; }
    `;

    document.head.appendChild(style);
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
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-text">New content available, click to reload.</span>
        </div>
        <button class="update-toast-button" @click=${onRefresh}>Reload</button>
        <button class="update-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    if (!document.querySelector('#update-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'update-toast-styles';
      style.textContent = `
        .update-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid #4CAF50; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Minecraft', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .update-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .update-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; color: #fff; }
        .update-toast-text { font-size: 0.9em; font-weight: 500; }
        .update-toast-button { background: #4CAF50; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-family: 'Minecraft', monospace; font-size: 0.8em; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
        .update-toast-button:hover { background: #45a049; }
        .update-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .update-toast-close:hover { color: #fff; }
        @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
        @media (max-width: 480px) { .update-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .update-toast-content { padding: 10px 12px; gap: 8px; } .update-toast-text { font-size: 0.8em; } .update-toast-button { padding: 6px 12px; font-size: 0.75em; } }
      `;
      document.head.appendChild(style);
    }

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
    const onClose = () => toast.remove();
    render(html`
      <div class="version-check-toast-content">
        <div class="version-check-toast-message">
          <span class="version-check-toast-icon">${icon}</span>
          <span class="version-check-toast-text">${message}</span>
        </div>
        <button class="version-check-toast-close" @click=${onClose}>×</button>
      </div>
    `, toast);

    if (!document.querySelector('#version-check-toast-styles')) {
      const style = document.createElement('style');
      style.id = 'version-check-toast-styles';
      style.textContent = `
        .version-check-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid ${type === 'info' ? '#2196F3' : type === 'warning' ? '#FF9800' : '#f44336'}; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Minecraft', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
        .version-check-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
        .version-check-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; }
        .version-check-toast-icon { font-size: 1.2em; }
        .version-check-toast-text { color: #fff; font-size: 0.9em; line-height: 1.4; }
        .version-check-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
        .version-check-toast-close:hover { color: #fff; }
        @media (max-width: 480px) { .version-check-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .version-check-toast-content { padding: 10px 12px; gap: 8px; } .version-check-toast-text { font-size: 0.8em; } }
      `;
      document.head.appendChild(style);
    }

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
