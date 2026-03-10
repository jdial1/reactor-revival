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
        const partsSection = this.ui.registry?.get?.("PartsPanel")?.getPartsSection?.() ?? this.ui.DOMElements?.parts_section;
        if (partsSection) {
          const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
          const hasSelectedPart = this.ui.stateManager.getClickedPart() !== null;

          const uiState = this.ui.uiState;
          if (isMobile) {
            if (hasSelectedPart && (uiState?.parts_panel_collapsed ?? partsSection.classList.contains("collapsed"))) {
              if (uiState) uiState.parts_panel_collapsed = false;
              else partsSection.classList.remove("collapsed");
            } else if (!hasSelectedPart) {
              if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
              else partsSection.classList.toggle("collapsed");
            }
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
          } else {
            if (uiState) uiState.parts_panel_collapsed = !uiState.parts_panel_collapsed;
            this.ui.partsPanelUI.updatePartsPanelBodyClass();
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
        this.ui.deviceFeatures.heavyVibration();
        const slots = this.ui.stateManager.getQuickSelectSlots();
        const locked = slots[activeSlotIndex]?.locked ?? false;
        this.ui.stateManager.setQuickSelectLock(activeSlotIndex, !locked);
      }, longPressMs);
    };
    const handlePointerUp = (e) => {
      const slotEl = e.target.closest(".quick-select-slot");
      if (!slotEl) return;
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
    };
    if (container) {
      container.addEventListener("pointerdown", handlePointerDown, { signal });
      container.addEventListener("pointerup", handlePointerUp, { signal });
      container.addEventListener("pointercancel", clearTimer, { signal });
      container.addEventListener("pointerleave", clearTimer, { signal });
    }
    this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setupMenuTabButton() {
    if (!this._abortController) this._abortController = new AbortController();
    const { signal } = this._abortController;
    const menuBtn = document.getElementById("menu_tab_btn");
    if (menuBtn) {
      menuBtn.addEventListener("click", () => {
        this.ui.deviceFeatures.lightVibration();
        if (this.ui.modalOrchestrator.isModalVisible(MODAL_IDS.SETTINGS)) {
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
