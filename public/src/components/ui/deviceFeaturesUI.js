import { requestWakeLock, releaseWakeLock } from "../../services/pwa.js";
import { logger } from "../../utils/logger.js";

export class DeviceFeaturesUI {
  constructor(ui) {
    this.ui = ui;
  }

  updateAppBadge() {
    const reactor = this.ui.game?.reactor;
    if (!reactor) return;
    const heatPercent = reactor.current_heat / reactor.max_heat;
    const isPaused = this.ui.stateManager?.getVar("pause");
    if (heatPercent > 0.9 && !isPaused && document.visibilityState === "visible") {
      const now = performance.now();
      if ((this.ui._lastHeatRumbleTime ?? 0) + 600 < now) {
        this.ui._lastHeatRumbleTime = now;
        this.heatRumbleVibration();
      }
    }
    if (!('setAppBadge' in navigator)) return;
    if (heatPercent >= 0.95 && !isPaused) {
      navigator.setAppBadge(1);
      return;
    }
    const hoursAccumulated = Math.floor((this.ui.game.engine?.time_accumulator || 0) / (1000 * 60 * 60));
    if (hoursAccumulated >= 1) {
      navigator.setAppBadge(hoursAccumulated);
      return;
    }
    navigator.clearAppBadge();
  }

  setupAppBadgeVisibilityHandler() {
    if (!('setAppBadge' in navigator)) return;
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') navigator.clearAppBadge();
    });
  }

  updateWakeLockState() {
    if (!this.ui.game) return;
    const isPaused = this.ui.stateManager?.getVar("pause");
    const isRunning = this.ui.game.engine?.running && !isPaused;
    if (isRunning) requestWakeLock();
    else releaseWakeLock();
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        logger.log('warn', 'ui', 'Error attempting to enable fullscreen:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          logger.warn("Error attempting to exit fullscreen:", err);
        });
      }
    }
  }

  updateFullscreenButtonState() {
    const fullscreenButton = this.ui.DOMElements?.fullscreen_toggle;
    if (!fullscreenButton) return;
    if (document.fullscreenElement) {
      fullscreenButton.textContent = "⛶";
      fullscreenButton.title = "Exit Fullscreen";
    } else {
      fullscreenButton.textContent = "⛶";
      fullscreenButton.title = "Enter Fullscreen";
    }
  }

  vibrate(pattern) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        logger.log('warn', 'ui', 'Vibration failed:', e);
      }
    }
  }

  lightVibration() { this.vibrate(10); }
  heavyVibration() { this.vibrate(50); }
  doublePulseVibration() { this.vibrate([30, 80, 30]); }
  meltdownVibration() { this.vibrate(200); }
  heatRumbleVibration() { this.vibrate([80, 40, 80, 40, 80]); }
}
