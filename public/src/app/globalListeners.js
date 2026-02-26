import { StorageUtils } from "../utils/util.js";
import { logger } from "../utils/logger.js";
import { settingsModal } from "../components/settingsModal.js";

let _pageClickHandler = null;
let _tooltipCloseHandler = null;
let _beforeUnloadHandler = null;

function attachPageClickListeners(game) {
  _pageClickHandler = async (e) => {
    const pageBtn = e.target.closest("[data-page]");
    if (!pageBtn) return;
    e.preventDefault();
    settingsModal.hide();
    await game.router.loadPage(pageBtn.dataset.page);
  };
  document.addEventListener("click", _pageClickHandler);
}

function attachTooltipCloseListener(game) {
  _tooltipCloseHandler = (e) => {
    if (!game.tooltip_manager?.isLocked) return;
    const tooltipEl = document.getElementById("tooltip");
    if (
      tooltipEl &&
      !tooltipEl.contains(e.target) &&
      !e.target.closest(".upgrade, .part") &&
      !e.target.closest("#tooltip_actions")
    ) {
      game.tooltip_manager.closeView();
    }
  };
  document.addEventListener("click", _tooltipCloseHandler, true);
}

function attachBeforeUnloadListener(game) {
  _beforeUnloadHandler = () => {
    try {
      if (StorageUtils.get("reactorNewGamePending") === 1) return;
    } catch (_) {}
    if (game && typeof game.updateSessionTime === "function") {
      game.updateSessionTime();
      void game.saveManager.autoSave();
      if (window.googleDriveSave?.isSignedIn) {
        window.googleDriveSave.flushPendingSave().catch((e) => logger.log('error', 'game', 'Flush pending save failed', e));
      }
    }
  };
  window.addEventListener("beforeunload", _beforeUnloadHandler);
}

export function setupGlobalListeners(game) {
  attachPageClickListeners(game);
  attachTooltipCloseListener(game);
  attachBeforeUnloadListener(game);
}

export function teardownGlobalListeners() {
  if (_pageClickHandler) {
    document.removeEventListener("click", _pageClickHandler);
    _pageClickHandler = null;
  }
  if (_tooltipCloseHandler) {
    document.removeEventListener("click", _tooltipCloseHandler, true);
    _tooltipCloseHandler = null;
  }
  if (_beforeUnloadHandler) {
    window.removeEventListener("beforeunload", _beforeUnloadHandler);
    _beforeUnloadHandler = null;
  }
}
