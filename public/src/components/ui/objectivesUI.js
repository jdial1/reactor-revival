import { getObjectiveScrollDuration } from "../../core/objective/objectiveUIHelper.js";

export class ObjectivesUI {
  constructor(ui, controller = null) {
    this.ui = ui;
    this.ui.registry.register('Objectives', this);
    this.controller = controller;
  }

  checkTextScrolling() {
    const toastTitleEl = this.ui.coreLoopUI?.getElement?.("objectives_toast_title") ?? document.getElementById("objectives_toast_title");
    if (!toastTitleEl) return;
    const duration = getObjectiveScrollDuration();
    toastTitleEl.style.animation = `scroll-objective-title ${duration}s linear infinite`;
  }

  markComplete() {
    const toastBtn = this.ui.coreLoopUI?.getElement?.("objectives_toast_btn") ?? document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("is-complete");
    if (typeof this.animateObjectiveCompletion === "function") this.animateObjectiveCompletion();
  }

  updateObjectiveDisplay() {
    if (this.controller) return this.controller.updateDisplay();
  }

  updateObjectiveDisplayFromState() {
    if (this.controller) return this.controller.updateDisplayFromState();
  }

  animateObjectiveCompletion() {
    if (this.controller) return this.controller.animateCompletion();
  }

  showObjectivesForPage(pageId) {
    if (this.ui?.uiState) this.ui.uiState.active_page = pageId;
    if (this.controller) return this.controller.showForPage(pageId);
  }

  setupObjectivesListeners() {
    if (this.controller) return this.controller.setupListeners();
  }
}
