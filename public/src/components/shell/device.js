import { subscribeKey } from "valtio/vanilla/utils";
import { getUiElement } from "./page-dom.js";
import { requestWakeLock, releaseWakeLock } from "../../services/pwa.js";
import { safeCall, teardownAll } from "../../core/teardown.js";

function vibrate(pattern) {
  if (!navigator?.vibrate) return;
  safeCall(() => { navigator.vibrate(pattern); });
}

export function createDeviceFeatures(getUi) {
  const fsIcon = "⛶";
  return {
    updateWakeLockState() {},
    toggleFullscreen() {
      if (!document) return;
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch?.(() => {});
      } else {
        document.exitFullscreen?.().catch?.(() => {});
      }
    },
    updateFullscreenButtonState() {
      const ui = getUi();
      const btn = getUiElement(ui, "fullscreen_toggle");
      if (!btn || !ui?.uiState) return;
      const title = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
      ui.uiState.fullscreen_display = { icon: fsIcon, title };
      btn.title = title;
      btn.textContent = fsIcon;
    },
    vibrate,
    lightVibration() { vibrate(10); },
    heavyVibration() { vibrate(50); },
    upgradeCardHoverBuzz() { vibrate([8, 12, 10]); },
    doublePulseVibration() { vibrate([30, 80, 30]); },
    meltdownVibration() { vibrate(200); },
    heatRumbleVibration() { vibrate([80, 40, 80, 40, 80]); },
    updateAppBadge() {},
  };
}

export function installDeviceService(ui, _game) {
  const features = createDeviceFeatures(() => ui);
  const unsubs = [];

  if (ui?.uiState) {
    const syncWakeLock = (paused) => {
      if (paused) releaseWakeLock();
      else requestWakeLock();
    };
    unsubs.push(subscribeKey(ui.uiState, "is_paused", syncWakeLock));
    syncWakeLock(ui.uiState.is_paused);
  }


  const teardown = () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };

  return { features, teardown };
}
