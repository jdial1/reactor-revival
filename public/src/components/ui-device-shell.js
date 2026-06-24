import { MODAL_IDS } from "../modalIds.js";
import { getUiElement } from "./page-dom.js";
import { quickStartTemplate as quickStartOverlayTemplate } from "../templates/uiComponentsTemplates.js";
export class UserAccountUI {
  constructor(ui) {
    this.ui = ui;
    this._buttonAbortController = null;
  }

  setupUserAccountButton() {
    const ui = this.ui;
    if (!ui.uiState) return;
    const root = document.getElementById("user_account_btn_root");
    if (!root) return;
    this._buttonAbortController?.abort?.();
    this._buttonAbortController = new AbortController();
    const btn = document.getElementById("user_account_btn");
    if (btn) {
      btn.onclick = null;
    }

    ui.uiState.user_account_display = { icon: "💾", title: "Local saves" };
  }

  showProfileModal() {}
}

export function subscribeToContextModalEvents(ui, game) {
  if (!game?.on) return;
  if (ui._contextModalHandler) return;
  ui._contextModalHandler = (payload) => ui.modalOrchestrator?.showModal?.(MODAL_IDS.CONTEXT, payload);
  game.on("showContextModal", ui._contextModalHandler);
}

export function unsubscribeContextModalEvents(ui, game) {
  if (!game?.off || !ui._contextModalHandler) return;
  game.off("showContextModal", ui._contextModalHandler);
  ui._contextModalHandler = null;
}
export const quickStartTemplate = (page, onClose, onMoreDetails, onBack) =>
  quickStartOverlayTemplate({ page, onClose, onMoreDetails, onBack });

export class PwaDisplayModeUI {
  constructor(ui) {
    this.ui = ui;
  }

  init() {
    initPwaDisplayMode(this.ui);
  }
}

export function initPwaDisplayMode(ui) {
  if (typeof document === "undefined") return;
  if (initPwaDisplayMode._mounted) return;
  initPwaDisplayMode._mounted = true;

  const installBtn = document.getElementById("install_pwa_btn");
  if (installBtn && !installBtn.dataset.pwaBound) {
    installBtn.dataset.pwaBound = "1";
    installBtn.addEventListener("click", () => {
      import("../services-pwa.js").then((m) => m.onInstallPwaClick?.());
    });
  }

  if (ui) ui._unmounts.push(() => {
    initPwaDisplayMode._mounted = false;
  });
}

export class QuickStartUI {
  constructor(ui) {
    this.ui = ui;
  }

  addHelpButtonToMainPage() {
    const mainTopNav = document.getElementById("main_top_nav");
    if (!mainTopNav) return;
    if (mainTopNav.querySelector("#quick_start_help_button")) return;
    const btn = document.createElement("button");
    btn.id = "quick_start_help_button";
    btn.type = "button";
    btn.className = "hidden";
    btn.title = "Getting Started Guide";
    btn.textContent = "?";
    btn.onclick = () => this.ui.modalOrchestrator?.showModal?.(MODAL_IDS.DETAILED_QUICK_START);
    mainTopNav.appendChild(btn);
  }
}

function dfVibrate(pattern) {
  if (!navigator?.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch (_) {}
}

export function bindDeviceFeatures(ui) {
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
      const btn = getUiElement(ui, "fullscreen_toggle") ?? document.getElementById("fullscreen_toggle");
      if (!btn || !ui.uiState) return;
      const title = document.fullscreenElement ? "Exit Fullscreen" : "Enter Fullscreen";
      ui.uiState.fullscreen_display = { icon: fsIcon, title };
      btn.title = title;
      btn.textContent = fsIcon;
    },
    vibrate: dfVibrate,
    lightVibration() { dfVibrate(10); },
    heavyVibration() { dfVibrate(50); },
    upgradeCardHoverBuzz() { dfVibrate([8, 12, 10]); },
    doublePulseVibration() { dfVibrate([30, 80, 30]); },
    meltdownVibration() { dfVibrate(200); },
    heatRumbleVibration() { dfVibrate([80, 40, 80, 40, 80]); },
    updateAppBadge() {},
  };
}
