export class PWA {
  constructor() {
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.isOnline = navigator.onLine;
    this.isFullscreen = false;

    this.init();
  }

  init() {
    this.setupInstallPrompt();
    this.setupOnlineStatus();
    this.setupBeforeInstallPrompt();
    this.setupAppInstalled();
    this.setupMobileOptimizations();
  }

  setupInstallPrompt() {
    // Create install button if not exists
    if (!document.getElementById("pwa-install-btn")) {
      const installBtn = document.createElement("button");
      installBtn.id = "pwa-install-btn";
      installBtn.className = "styled-button pwa-install-btn";
      installBtn.textContent = "📱 Install App";
      installBtn.style.display = "none";
      installBtn.onclick = () => this.installApp();

      // Add to main top nav
      const topNav = document.getElementById("main_top_nav");
      if (topNav) {
        topNav.appendChild(installBtn);
      }
    }
  }

  setupBeforeInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      console.log("[PWA] Before install prompt triggered");
      e.preventDefault();
      this.deferredPrompt = e;

      // Show install button
      const installBtn = document.getElementById("pwa-install-btn");
      if (installBtn) {
        installBtn.style.display = "inline-block";
      }
    });
  }

  setupAppInstalled() {
    window.addEventListener("appinstalled", (e) => {
      console.log("[PWA] App installed successfully");
      this.isInstalled = true;
      this.deferredPrompt = null;

      // Hide install button
      const installBtn = document.getElementById("pwa-install-btn");
      if (installBtn) {
        installBtn.style.display = "none";
      }

      // Show success message
      this.showNotification("App installed successfully!", "success");
    });
  }

  setupOnlineStatus() {
    window.addEventListener("online", () => {
      this.isOnline = true;
      this.showNotification("Back online!", "success");
      document.body.classList.remove("offline");
    });

    window.addEventListener("offline", () => {
      this.isOnline = false;
      this.showNotification(
        "You are offline. Game will continue with cached data.",
        "warning"
      );
      document.body.classList.add("offline");
    });
  }

  async installApp() {
    if (!this.deferredPrompt) {
      console.log("[PWA] No install prompt available");
      return;
    }

    try {
      this.deferredPrompt.prompt();
      const { outcome } = await this.deferredPrompt.userChoice;

      if (outcome === "accepted") {
        console.log("[PWA] User accepted the install prompt");
      } else {
        console.log("[PWA] User dismissed the install prompt");
      }

      this.deferredPrompt = null;

      // Hide install button
      const installBtn = document.getElementById("pwa-install-btn");
      if (installBtn) {
        installBtn.style.display = "none";
      }
    } catch (error) {
      console.error("[PWA] Install failed:", error);
    }
  }

  showNotification(message, type = "info") {
    // Create notification element
    const notification = document.createElement("div");
    notification.className = `pwa-notification pwa-notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Auto remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  // Check if app is running in standalone mode (installed)
  isStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true
    );
  }

  // Request notification permission
  async requestNotificationPermission() {
    if (!("Notification" in window)) {
      console.log("[PWA] Notifications not supported");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  // Send notification
  sendNotification(title, options = {}) {
    if (Notification.permission === "granted") {
      new Notification(title, {
        icon: "img/parts/cells/cell_1_1.png",
        badge: "img/parts/cells/cell_1_1.png",
        ...options,
      });
    }
  }

  // Get app version from service worker
  async getAppVersion() {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          resolve(event.data.version);
        };
        navigator.serviceWorker.controller.postMessage(
          { type: "GET_VERSION" },
          [channel.port2]
        );
      });
    }
    return null;
  }

  // Check for updates
  async checkForUpdates() {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        await registration.update();
      }
    }
  }

  attachUpdateDetection(registration) {
    if (!registration) return;
    registration.onupdatefound = () => {
      const newWorker = registration.installing;
      newWorker.onstatechange = () => {
        if (
          newWorker.state === "installed" &&
          navigator.serviceWorker.controller
        ) {
          showUpdateBanner();
        }
      };
    };
  }

  setupMobileOptimizations() {
    // Prevent zoom on double tap
    let lastTouchEnd = 0;
    document.addEventListener(
      "touchend",
      (event) => {
        const now = new Date().getTime();
        if (now - lastTouchEnd <= 300) {
          event.preventDefault();
        }
        lastTouchEnd = now;
      },
      false
    );

    // Prevent pull-to-refresh on mobile
    document.addEventListener(
      "touchmove",
      (event) => {
        if (event.scale !== 1) {
          event.preventDefault();
        }
      },
      { passive: false }
    );
  }

  optimizeForFullscreen() {
    if (this.isFullscreen || this.isStandalone()) {
      // Set viewport meta tag for fullscreen
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        viewport.setAttribute(
          "content",
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
        );
      }

      document.body.classList.add("pwa-fullscreen");
      document.documentElement.classList.add("pwa-fullscreen");
    }
  }
}

// Add PWA styles
const pwaStyles = `
.pwa-install-btn {
  margin-left: 10px;
  background: linear-gradient(45deg, #59c435, #4a9c2a);
  border: 1px solid #59c435;
  color: white;
  font-weight: bold;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.pwa-install-btn:hover {
  background: linear-gradient(45deg, #4a9c2a, #59c435);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(89, 196, 53, 0.3);
}

.pwa-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 20px;
  border-radius: 8px;
  color: white;
  font-weight: bold;
  z-index: 9000;
  animation: slideIn 0.3s ease-out;
  max-width: 300px;
  word-wrap: break-word;
}

.pwa-notification-success {
  background: linear-gradient(45deg, #59c435, #4a9c2a);
  border: 1px solid #59c435;
}

.pwa-notification-warning {
  background: linear-gradient(45deg, #ffa500, #ff8c00);
  border: 1px solid #ffa500;
}

.pwa-notification-error {
  background: linear-gradient(45deg, #ff3c3c, #cc0000);
  border: 1px solid #ff3c3c;
}

.pwa-notification-info {
  background: linear-gradient(45deg, #00eaff, #0099cc);
  border: 1px solid #00eaff;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

body.offline {
  position: relative;
}

body.offline::before {
  content: "OFFLINE";
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #ff3c3c;
  color: white;
  text-align: center;
  padding: 4px;
  font-size: 12px;
  font-weight: bold;
  z-index: 9000;
}
`;

// Inject styles
const styleSheet = document.createElement("style");
styleSheet.textContent = pwaStyles;
document.head.appendChild(styleSheet);

// --- Version Polling and Update Banner ---
let currentVersion = null;
let updateBanner = null;

function showUpdateBanner() {
  if (updateBanner) return;
  updateBanner = document.createElement("div");
  updateBanner.id = "update-banner";
  updateBanner.style.position = "fixed";
  updateBanner.style.bottom = "0";
  updateBanner.style.left = "0";
  updateBanner.style.width = "100%";
  updateBanner.style.background = "#222";
  updateBanner.style.color = "#fff";
  updateBanner.style.padding = "1em";
  updateBanner.style.textAlign = "center";
  updateBanner.style.zIndex = "10000";
  updateBanner.innerHTML = `
    <span>New version available!</span>
    <button id="update-banner-reload" style="margin-left:1em;">Reload</button>
  `;
  document.body.appendChild(updateBanner);
  document.getElementById("update-banner-reload").onclick = () => {
    window.location.reload(true);
  };
}

function pollVersionJson() {
  fetch("version.json", { cache: "no-store" })
    .then((res) => res.json())
    .then((data) => {
      if (currentVersion === null) {
        currentVersion = data.version;
      } else if (data.version !== currentVersion) {
        showUpdateBanner();
      }
    })
    .catch(() => {});
}

setInterval(pollVersionJson, 60000); // Poll every 60 seconds
pollVersionJson();

window.pwa = new PWA();
