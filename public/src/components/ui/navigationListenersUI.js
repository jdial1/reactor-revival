import { html } from "lit-html";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { MODAL_IDS } from "../ModalManager.js";

const setupNavGroup = (ui, signal) => {
  const setupNav = (container) => {
    if (!container) return;
    container.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-page]");
      if (btn?.dataset.page) ui.game.router.loadPage(btn.dataset.page);
    }, { signal });
  };
  const coreLoop = ui.registry?.get?.("CoreLoop");
  const getEl = (id) => coreLoop?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  setupNav(getEl("bottom_nav"));
  setupNav(getEl("main_top_nav"));
};

const setupPrestigeListeners = (ui, signal) => {
  const coreLoop = ui.registry?.get?.("CoreLoop");
  const getEl = (id) => coreLoop?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  getEl("reboot_btn")?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "refund" }), { signal });
  getEl("refund_btn")?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "prestige" }), { signal });
};

const setupDoctrineAndMiscListeners = (ui, signal) => {
  const getEl = (id) => ui.registry?.get?.("CoreLoop")?.getElement?.(id) ?? ui.DOMElements?.[id] ?? document.getElementById(id);
  getEl("respec_doctrine_btn")?.addEventListener("click", () => {
    if (!ui.game?.respecDoctrine?.()) return;
    ui.userAccountUI.renderDoctrineTreeViewer();
    ui.stateManager.setVar("current_exotic_particles", ui.game.state.current_exotic_particles);
  }, { signal });
  
  const fullscreenButton = ui.coreLoopUI.getElement("fullscreen_toggle");
  if (fullscreenButton && ui.uiState) {
    ui._fullscreenReactiveUnmount?.();
    fullscreenButton.addEventListener("click", () => ui.deviceFeatures.toggleFullscreen(), { signal });
    document.addEventListener("fullscreenchange", () => ui.deviceFeatures.updateFullscreenButtonState(), { signal });
    ui.deviceFeatures.updateFullscreenButtonState();
    ui._fullscreenReactiveUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["fullscreen_display"] }],
      () => {
        const d = ui.uiState?.fullscreen_display ?? { icon: "⛶", title: "Toggle Fullscreen" };
        if (fullscreenButton.title !== d.title) fullscreenButton.title = d.title;
        fullscreenButton.textContent = d.icon ?? "⛶";
        return null;
      },
      fullscreenButton
    );
  } else if (fullscreenButton) {
    fullscreenButton.addEventListener("click", () => ui.deviceFeatures.toggleFullscreen(), { signal });
    document.addEventListener("fullscreenchange", () => ui.deviceFeatures.updateFullscreenButtonState(), { signal });
    ui.deviceFeatures.updateFullscreenButtonState();
  }

  const settingsBtn = ui.coreLoopUI.getElement("settings_btn");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS), { signal });
  }

  const splashCloseBtn = ui.coreLoopUI.getElement("splash_close_btn");
  if (splashCloseBtn) {
    splashCloseBtn.addEventListener("click", () => {
      window.location.href = window.location.origin + window.location.pathname;
    }, { signal });
  }
};

export function setupNavListeners(ui) {
  if (ui._navAbortController) ui._navAbortController.abort();
  ui._navAbortController = new AbortController();
  const { signal } = ui._navAbortController;

  setupNavGroup(ui, signal);
  setupPrestigeListeners(ui, signal);
  setupDoctrineAndMiscListeners(ui, signal);

  ui.partsPanelUI.updatePartsPanelBodyClass();
}

export function setupResizeListeners(ui) {
  if (ui._resizeAbortController) ui._resizeAbortController.abort();
  ui._resizeAbortController = new AbortController();
  const { signal } = ui._resizeAbortController;

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const reactor = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
      if (ui.game && reactor && typeof window !== "undefined") {
        if (ui.game.updateBaseDimensions) ui.game.updateBaseDimensions();
        ui.gridScaler.resize();
      }
      ui.game?.ui?.stateManager?.checkObjectiveTextScrolling();
      ui._resizeParticleCanvas?.();
      ui.mobileInfoBarUI?.updateControlDeckValues?.();
    }, 100);
  }, { signal });

  if (window.visualViewport) {
    let viewportTimeout;
    window.visualViewport.addEventListener("resize", () => {
      clearTimeout(viewportTimeout);
      viewportTimeout = setTimeout(() => {
        const reactor = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (ui.game && reactor && typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
          if (ui.game.updateBaseDimensions) ui.game.updateBaseDimensions();
          ui.gridScaler.resize();
        }
        ui._resizeParticleCanvas?.();
      }, 150);
    }, { signal });
  }
}
