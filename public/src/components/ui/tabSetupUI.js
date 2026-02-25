import { settingsModal } from "../settingsModal.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { MODAL_IDS } from "../ModalManager.js";
import { BaseComponent } from "../BaseComponent.js";

export class TabSetupUI extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this._abortController = null;
  }

  teardown() {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
  }

  setupBuildTabButton() {
    this.teardown();
    this._abortController = new AbortController();
    const { signal } = this._abortController;

    const buildBtn = document.getElementById("build_tab_btn");
    if (buildBtn) {
      buildBtn.addEventListener("click", () => {
        this.ui.deviceFeatures.lightVibration();
        const partsSection = this.ui.DOMElements.parts_section;
        if (partsSection) {
          const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
          const hasSelectedPart = this.ui.stateManager.getClickedPart() !== null;

          if (isMobile) {
            if (hasSelectedPart && partsSection.classList.contains("collapsed")) {
              partsSection.classList.remove("collapsed");
            } else if (!hasSelectedPart) {
              partsSection.classList.toggle("collapsed");
            }
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
          } else {
            this.ui.parts_panel_collapsed = !this.ui.parts_panel_collapsed;
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
          }
        }
      }, { signal });
    }

    const quickSelectSlots = document.querySelectorAll(".quick-select-slot");
    const longPressMs = 500;
    quickSelectSlots.forEach((slotEl) => {
      let longPressTimer = null;
      let didLongPress = false;
      const clearTimer = () => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      };
      slotEl.addEventListener("pointerdown", (e) => {
        didLongPress = false;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          didLongPress = true;
          this.ui.deviceFeatures.heavyVibration();
          const i = parseInt(slotEl.getAttribute("data-index"), 10);
          const slots = this.ui.stateManager.getQuickSelectSlots();
          const locked = slots[i]?.locked ?? false;
          this.ui.stateManager.setQuickSelectLock(i, !locked);
        }, longPressMs);
      }, { signal });
      slotEl.addEventListener("pointerup", (e) => {
        clearTimer();
        if (didLongPress) return;
        const i = parseInt(slotEl.getAttribute("data-index"), 10);
        const slots = this.ui.stateManager.getQuickSelectSlots();
        const partId = slots[i]?.partId;
        if (!partId || !this.ui.game?.partset) return;
        const part = this.ui.game.partset.getPartById(partId);
        if (!part || !part.affordable) return;
        this.ui.deviceFeatures.lightVibration();
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.ui.stateManager.setClickedPart(part, { skipOpenPanel: true });
        if (part.$el) part.$el.classList.add("part_active");
        this.ui.partsPanelUI.updateQuickSelectSlots();
      }, { signal });
      slotEl.addEventListener("pointercancel", clearTimer, { signal });
      slotEl.addEventListener("pointerleave", clearTimer, { signal });
    });
    this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setupMenuTabButton() {
    if (!this._abortController) this._abortController = new AbortController();
    const { signal } = this._abortController;
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        this.ui.deviceFeatures.lightVibration();
        if (settingsModal.isVisible) {
          this.ui.modalOrchestrator.hideModal(MODAL_IDS.SETTINGS);
        } else {
          const bottomNav = document.getElementById("bottom_nav");
          if (bottomNav) {
            bottomNav.querySelectorAll("button[data-page]").forEach((btn) => {
              btn.classList.remove("active");
            });
          }
          menuBtn.classList.add("active");
          this.ui.modalOrchestrator.showModal(MODAL_IDS.SETTINGS);
        }
      }, { signal });
    }
  }
}
