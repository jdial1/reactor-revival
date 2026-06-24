import { html } from "lit-html";
import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { getAppContext } from "../app-context.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { leaderboardService } from "../services-leaderboard.js";
import { MODAL_IDS } from "../modalIds.js";
import { getPartElement } from "../logic-upgrade-dom.js";
import { getUiElement } from "./page-dom.js";
import {
  setupMacroToolbar,
  updateQuickSelectSlots,
  closePartsPanel,
  updatePartsPanelBodyClass,
} from "./ui-parts-panel.js";
import { navIndicatorTemplate } from "../templates/uiComponentsTemplates.js";

function mountLeaderboardButtons(ui) {
  if (!ui.uiState || (ui._navLeaderboardUnmounts?.length ?? 0) > 0) return;
  ui._navLeaderboardUnmounts = [];
  const topBtn = document.querySelector('#main_top_nav button[data-page="leaderboard_section"]');
  const bottomBtn = document.querySelector('#bottom_nav button[data-page="leaderboard_section"]');
  const applyProps = (btn, d) => {
    if (!btn || !d) return;
    btn.disabled = d.disabled;
    btn.style.opacity = d.disabled ? "0.5" : "1";
    btn.style.cursor = d.disabled ? "not-allowed" : "pointer";
    btn.style.pointerEvents = d.disabled ? "none" : "auto";
  };
  const template = () => html`${ui.uiState?.leaderboard_display?.icon ?? "🏆"}`;
  const renderTop = () => {
    const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
    applyProps(topBtn, d);
    return template();
  };
  const renderBottom = () => {
    const d = ui.uiState?.leaderboard_display ?? { icon: "🏆", disabled: false };
    applyProps(bottomBtn, d);
    return template();
  };
  if (topBtn) {
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    topBtn.textContent = "";
    topBtn.appendChild(span);
    ui._navLeaderboardUnmounts.push(bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["leaderboard_display"] }],
      renderTop,
      span
    ));
  }
  if (bottomBtn && bottomBtn !== topBtn) {
    const span = document.createElement("span");
    span.setAttribute("aria-hidden", "true");
    bottomBtn.textContent = "";
    bottomBtn.appendChild(span);
    ui._navLeaderboardUnmounts.push(bindLitRenderMulti(
      [{ state: ui.uiState, keys: ["leaderboard_display"] }],
      renderBottom,
      span
    ));
  }
}

export function updateLeaderboardIcon(ui) {
  if (typeof document === "undefined" || !ui.game) return;
  mountLeaderboardButtons(ui);
  if (!ui.uiState) return;
  const lb = leaderboardService.getStatus();
  const circuitOff = lb.state === "open";
  const icon = ui.game.cheats_used ? "🚷" : circuitOff ? "📴" : "🏆";
  const disabled = !!ui.game.cheats_used || circuitOff;
  ui.uiState.leaderboard_display = { icon, disabled };
}

export function updateNavIndicators(ui) {
  if (typeof document === "undefined" || !ui.uiState) return;
  if (ui._navAffordabilityUnmounts?.length) return;
  const mountIndicator = (button, key) => {
    if (!button || button.style.position !== "relative") button.style.position = "relative";
    let container = button.querySelector(".nav-indicator-mount");
    if (!container) {
      container = document.createElement("span");
      container.className = "nav-indicator-mount";
      button.appendChild(container);
    }
    const renderFn = () => {
      const visible = !!ui.uiState?.[key];
      return navIndicatorTemplate({ visible });
    };
    return bindLitRenderMulti(
      [{ state: ui.uiState, keys: [key] }],
      renderFn,
      container
    );
  };
  const unmounts = [];
  document.querySelectorAll('[data-page="upgrades_section"]').forEach((btn) => {
    unmounts.push(mountIndicator(btn, "has_affordable_upgrades"));
  });
  document.querySelectorAll('[data-page="experimental_upgrades_section"]').forEach((btn) => {
    unmounts.push(mountIndicator(btn, "has_affordable_research"));
  });
  ui._navAffordabilityUnmounts = unmounts;
}

export function teardownAffordabilityIndicators(ui) {
  if (ui._navAffordabilityUnmounts?.length) {
    ui._navAffordabilityUnmounts.forEach((fn) => { try { fn(); } catch (_) {} });
    ui._navAffordabilityUnmounts = [];
  }
}

export function teardownTabSetupUI(ui) {
  if (ui._tabSetupAbortController) {
    ui._tabSetupAbortController.abort();
    ui._tabSetupAbortController = null;
  }
}

export function setupBuildTabButton(ui) {
  teardownTabSetupUI(ui);
  ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;

  const buildBtn = document.getElementById("build_tab_btn");
  if (buildBtn) {
    buildBtn.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      const partsSection = getUiElement(ui, "parts_section");
      if (partsSection) {
        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
        const hasSelectedPart = ui.stateManager.getClickedPart() !== null;

        const uiState = ui.uiState;
        if (isMobile) {
          if (hasSelectedPart && uiState?.parts_panel_collapsed) {
            uiState.parts_panel_collapsed = false;
          } else if (!hasSelectedPart) {
            if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
          }
          updatePartsPanelBodyClass(ui);
        } else {
          if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
          updatePartsPanelBodyClass(ui);
        }
      }
    }, { signal });
  }

  const container = document.getElementById("quick_select_slots_container");
  const longPressMs = 500;
  let longPressTimer = null;
  let didLongPress = false;
  let activeSlotIndex = null;
  const clearTimer = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    activeSlotIndex = null;
  };
  const handlePointerDown = (e) => {
    const slotEl = e.target.closest(".quick-select-slot");
    if (!slotEl) return;
    activeSlotIndex = parseInt(slotEl.getAttribute("data-index"), 10);
    didLongPress = false;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      didLongPress = true;
      ui.deviceFeatures.heavyVibration();
      const slots = ui.stateManager.getQuickSelectSlots();
      const locked = slots[activeSlotIndex]?.locked ?? false;
      ui.stateManager.setQuickSelectLock(activeSlotIndex, !locked);
    }, longPressMs);
  };
  const handlePointerUp = (e) => {
    const slotEl = e.target.closest(".quick-select-slot");
    if (!slotEl) return;
    clearTimer();
    if (didLongPress) return;
    const i = parseInt(slotEl.getAttribute("data-index"), 10);
    const slots = ui.stateManager.getQuickSelectSlots();
    const partId = slots[i]?.partId;
    if (!partId || !ui.game?.partset) return;
    const part = ui.game.partset.getPartById(partId);
    if (!part || !part.affordable) return;
    ui.deviceFeatures.lightVibration();
    document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
    ui.stateManager.setClickedPart(part, { skipOpenPanel: true });
    const partEl = getPartElement(part);
    if (partEl) partEl.classList.add("part_active");
    updateQuickSelectSlots(ui);
  };
  if (container) {
    container.addEventListener("pointerdown", handlePointerDown, { signal });
    container.addEventListener("pointerup", handlePointerUp, { signal });
    container.addEventListener("pointercancel", clearTimer, { signal });
    container.addEventListener("pointerleave", clearTimer, { signal });
  }
  updateQuickSelectSlots(ui);
  setupMacroToolbar(ui);
}

export function setupMenuTabButton(ui) {
  if (!ui._tabSetupAbortController) ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;
  const menuBtn = document.getElementById("menu_tab_btn");
  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      if (ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
        ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
      } else {
        if (ui.game?.router?.currentPageId === "reactor_section") closePartsPanel(ui);
        const bottomNav = document.getElementById("bottom_nav");
        if (bottomNav) {
          bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
            btn.classList.remove("active");
          });
        }
        document.getElementById("settings_btn")?.classList.remove("active");
        menuBtn.classList.add("active");
        ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
      }
    }, { signal });
  }
}

export function setupDesktopTopNavButtons(ui) {
  if (!ui._tabSetupAbortController) ui._tabSetupAbortController = new AbortController();
  const { signal } = ui._tabSetupAbortController;
  const settingsTop = document.getElementById("settings_btn");
  if (settingsTop) {
    settingsTop.addEventListener("click", () => {
      ui.deviceFeatures.lightVibration();
      if (ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
        ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
      } else {
        if (ui.game?.router?.currentPageId === "reactor_section") closePartsPanel(ui);
        const bottomNav = document.getElementById("bottom_nav");
        if (bottomNav) {
          bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
            btn.classList.remove("active");
          });
        }
        document.getElementById("menu_tab_btn")?.classList.remove("active");
        settingsTop.classList.add("active");
        ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
      }
    }, { signal });
  }
  const fsBtn = document.getElementById("fullscreen_toggle");
  if (fsBtn) {
    fsBtn.addEventListener("click", () => {
      ui.deviceFeatures.toggleFullscreen();
      ui.deviceFeatures.updateFullscreenButtonState();
    }, { signal });
  }
  if (!ui._fullscreenSyncAttached) {
    ui._fullscreenSyncAttached = true;
    document.addEventListener("fullscreenchange", () => {
      ui.deviceFeatures?.updateFullscreenButtonState?.();
    });
  }
  const splashClose = document.getElementById("splash_close_btn");
  if (splashClose) {
    splashClose.addEventListener("click", async () => {
      ui.deviceFeatures.lightVibration();
      const sm = getAppContext()?.splashManager;
      if (!sm) return;
      ui.modalOrchestrator?.hideModal(MODAL_IDS.SETTINGS);
      if (ui.game?.engine?.running) ui.game.engine.stop();
      sm.show();
      await sm.refreshSaveOptions();
    }, { signal });
  }
  ui.deviceFeatures?.updateFullscreenButtonState?.();
}

export function setupNavListeners(ui) {
  if (!ui?.game) return;
  teardownNavListeners(ui);
  ui._navAbortController = new AbortController();
  const { signal } = ui._navAbortController;
  const handler = (event) => {
    const btn = event.target?.closest?.("[data-page]");
    const pageId = btn?.dataset?.page;
    if (pageId) ui.game.router?.loadPage?.(pageId);
  };
  document.addEventListener("click", handler, { signal });
}

export function teardownNavListeners(ui) {
  if (ui?._navAbortController) {
    ui._navAbortController.abort();
    ui._navAbortController = null;
  }
}

export function setupResizeListeners(ui) {
  if (!ui) return;
  teardownResizeListeners(ui);
  ui._resizeAbortController = new AbortController();
  const { signal } = ui._resizeAbortController;
  window.addEventListener("resize", () => {
    try {
      ui.gridScaler?.resize?.();
      ui.game?.updateBaseDimensions?.();
    } catch (_) {}
  }, { signal });
}

export function teardownResizeListeners(ui) {
  if (ui?._resizeAbortController) {
    ui._resizeAbortController.abort();
    ui._resizeAbortController = null;
  }
}
