import { subscribeKey } from "valtio/vanilla/utils";
import { getUiElement } from "../components/page-dom.js";
import { requestWakeLock, releaseWakeLock } from "../services-pwa.js";

function vibrate(pattern) {
  if (!navigator?.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (_) {}
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
      const btn = getUiElement(ui, "fullscreen_toggle") ?? document.getElementById("fullscreen_toggle");
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

export function installDeviceService(ui, game) {
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

  if (game?.state) {
    unsubs.push(subscribeKey(game.state, "effect_queue", (queue) => {
      if (!Array.isArray(queue) || !queue.length) return;
      const last = queue[queue.length - 1];
      if (last?.kind === "vibrate") features.vibrate(last.pattern ?? 10);
    }));
  }

  const teardown = () => {
    unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
    unsubs.length = 0;
  };

  return { features, teardown };
}
