import { html, render } from "lit-html";
import { StorageUtils } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

export class PwaDisplayModeUI {
  constructor(ui) {
    this.ui = ui;
  }

  initializePWADisplayModeButton(button) {
    if (!button) {
      logger.log('warn', 'ui', 'PWA display mode button not found');
      return;
    }
    const displayModes = ["fullscreen", "standalone", "minimal-ui", "browser"];
    const modeLabels = {
      "fullscreen": "🖥️ Fullscreen",
      "standalone": "📱 Standalone",
      "minimal-ui": "🔲 Minimal UI",
      "browser": "🌐 Browser"
    };
    const getCurrentMode = () => {
      const saved = StorageUtils.get("pwa_display_mode");
      if (saved && displayModes.includes(saved)) return saved;
      return "fullscreen";
    };
    const setDisplayMode = (mode) => {
      StorageUtils.set("pwa_display_mode", mode);
      this.updateManifestDisplayMode(mode);
      button.title = `PWA Display: ${modeLabels[mode]} (Click to cycle)`;
      button.style.display = "flex";
      button.style.visibility = "visible";
      button.style.opacity = "1";
    };
    const cycleDisplayMode = () => {
      const current = getCurrentMode();
      const currentIndex = displayModes.indexOf(current);
      const nextIndex = (currentIndex + 1) % displayModes.length;
      const nextMode = displayModes[nextIndex];
      setDisplayMode(nextMode);
      const toastContainer = document.createElement("div");
      render(html`
        <div style="position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2a2a2a;border:2px solid #4CAF50;border-radius:8px;padding:12px 20px;z-index:10000;font-family:'Press Start 2P',monospace;font-size:0.8rem;color:#fff;box-shadow:0 4px 20px rgba(0,0,0,0.5);animation:toast-slide-up 0.3s ease-out;" id="pwa_toast_inner">
          PWA Display Mode: ${modeLabels[nextMode]} - Reload to apply
        </div>
      `, toastContainer);
      document.body.appendChild(toastContainer);
      setTimeout(() => {
        if (document.body.contains(toastContainer)) {
          const inner = toastContainer.querySelector("#pwa_toast_inner");
          if (inner) inner.style.animation = "toast-slide-up 0.3s ease-out reverse";
          setTimeout(() => toastContainer.remove(), 300);
        }
      }, 3000);
    };
    button.onclick = cycleDisplayMode;
    setDisplayMode(getCurrentMode());
  }

  updateManifestDisplayMode(mode) {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;
    const originalHref = manifestLink.getAttribute("data-original-href") || manifestLink.href;
    if (!manifestLink.hasAttribute("data-original-href")) {
      manifestLink.setAttribute("data-original-href", originalHref);
    }
    fetch(originalHref)
      .then(response => response.json())
      .then(manifest => {
        manifest.display = mode;
        manifest.display_override = [mode, "standalone"];
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const newLink = document.createElement("link");
        newLink.rel = "manifest";
        newLink.href = url;
        newLink.setAttribute("data-original-href", originalHref);
        const oldLink = document.querySelector('link[rel="manifest"]');
        if (oldLink) oldLink.remove();
        document.head.appendChild(newLink);
      })
      .catch(error => logger.log('warn', 'ui', 'Failed to update manifest display mode:', error));
  }
}
