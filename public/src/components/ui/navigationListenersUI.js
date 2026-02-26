import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { MODAL_IDS } from "../ModalManager.js";

const setupNavGroup = (ui, signal) => {
  const setupNav = (container, buttonClass) => {
    if (!container) return;
    container.addEventListener("click", (event) => {
      const button = event.target.closest(buttonClass);
      if (button?.dataset.page) {
        ui.game.router.loadPage(button.dataset.page);
        container.querySelectorAll(buttonClass).forEach((tab) => tab.classList.remove("active"));
        button.classList.add("active");
      }
    }, { signal });
  };
  setupNav(ui.DOMElements.bottom_nav, "div");
  setupNav(ui.DOMElements.main_top_nav, "div");
};

const setupPrestigeListeners = (ui, signal) => {
  ui.DOMElements.reboot_btn?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "refund" }), { signal });
  ui.DOMElements.refund_btn?.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.PRESTIGE, { mode: "prestige" }), { signal });
  ui.DOMElements.prestige_modal_cancel?.addEventListener("click", () => ui.modalOrchestrator.hideModal(MODAL_IDS.PRESTIGE), { signal });
  ui.DOMElements.prestige_modal_confirm_refund?.addEventListener("click", () => {
    ui.modalOrchestrator.hideModal(MODAL_IDS.PRESTIGE);
    ui.game.rebootActionDiscardExoticParticles();
  }, { signal });
  ui.DOMElements.prestige_modal_confirm_prestige?.addEventListener("click", () => {
    ui.modalOrchestrator.hideModal(MODAL_IDS.PRESTIGE);
    ui.game.rebootActionKeepExoticParticles();
  }, { signal });
};

const setupDoctrineAndMiscListeners = (ui, signal) => {
  ui.DOMElements.respec_doctrine_btn?.addEventListener("click", () => {
    if (!ui.game?.respecDoctrine?.()) return;
    ui.userAccountUI.renderDoctrineTreeViewer();
    ui.stateManager.setVar("current_exotic_particles", ui.game.state.current_exotic_particles);
  }, { signal });
  
  const fullscreenButton = ui.DOMElements.fullscreen_toggle;
  if (fullscreenButton) {
    fullscreenButton.addEventListener("click", () => ui.deviceFeatures.toggleFullscreen(), { signal });
    document.addEventListener("fullscreenchange", () => ui.deviceFeatures.updateFullscreenButtonState(), { signal });
    ui.deviceFeatures.updateFullscreenButtonState();
  }

  const settingsBtn = ui.DOMElements.settings_btn;
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS), { signal });
  }

  if (ui.DOMElements.splash_close_btn) {
    ui.DOMElements.splash_close_btn.onclick = () => {
      window.location.href = window.location.origin + window.location.pathname;
    };
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
  ui._prestigeModalMode = null;
}

export function setupResizeListeners(ui) {
  if (ui._resizeAbortController) ui._resizeAbortController.abort();
  ui._resizeAbortController = new AbortController();
  const { signal } = ui._resizeAbortController;

  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (ui.game && ui.DOMElements.reactor && typeof window !== "undefined") {
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
        if (ui.game && ui.DOMElements.reactor && typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
          if (ui.game.updateBaseDimensions) ui.game.updateBaseDimensions();
          ui.gridScaler.resize();
        }
        ui._resizeParticleCanvas?.();
      }, 150);
    }, { signal });
  }
}
