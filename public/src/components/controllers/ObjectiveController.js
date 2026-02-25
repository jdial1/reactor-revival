export class ObjectiveController {
  constructor(api) {
    this.api = api;
  }

  updateDisplay() {
    const game = this.api.getGame();
    const DOMElements = this.api.getDOMElements();
    if (!game?.objectives_manager) return;
    if (game.isSandbox) {
      const toastTitleEl = DOMElements?.objectives_toast_title;
      const toastBtn = DOMElements?.objectives_toast_btn;
      if (toastTitleEl) toastTitleEl.textContent = "Sandbox";
      if (toastBtn) {
        toastBtn.classList.remove("is-complete", "is-active", "has-progress-bar");
        const claimPill = toastBtn.querySelector(".objectives-claim-pill");
        if (claimPill) claimPill.textContent = "";
        const progressFill = toastBtn.querySelector(".objectives-toast-progress-fill");
        if (progressFill) progressFill.style.width = "0%";
      }
      return;
    }
    const info = game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const toastTitleEl = DOMElements?.objectives_toast_title;
    const toastBtn = DOMElements?.objectives_toast_btn;
    if (toastTitleEl) {
      const objectiveIndex = game.objectives_manager?.current_objective_index ?? 0;
      const displayTitle = info.title ? `${objectiveIndex + 1}: ${info.title}` : "";
      toastTitleEl.textContent = displayTitle;
      this.api.getStateManager()?.checkObjectiveTextScrolling?.();
    }
    if (toastBtn) {
      const wasComplete = toastBtn.classList.contains("is-complete");
      const claimPill = toastBtn.querySelector(".objectives-claim-pill");
      toastBtn.classList.toggle("is-complete", !!info.isComplete);
      toastBtn.classList.toggle("is-active", !info.isComplete);
      if (claimPill) claimPill.textContent = info.isChapterCompletion ? "Complete" : "Claim";
      const checkId = game.objectives_manager.current_objective_def?.checkId;
      const showProgressBar = checkId === "sustainedPower1k" && toastBtn.classList.contains("is-expanded") && !info.isComplete;
      toastBtn.classList.toggle("has-progress-bar", !!showProgressBar);
      const progressFill = toastBtn.querySelector(".objectives-toast-progress-fill");
      if (progressFill) progressFill.style.width = showProgressBar ? `${info.progressPercent}%` : "0%";
      if (!wasComplete && info.isComplete) this.animateCompletion();
    }
  }

  animateCompletion() {
    const toastBtn = this.api.getDOMElements()?.objectives_toast_btn;
    if (!toastBtn) return;
    toastBtn.classList.add("objective-completed");
    setTimeout(() => toastBtn.classList.remove("objective-completed"), 2000);
  }

  showForPage(pageId) {
    this.api.cacheDOMElements?.();
    const DOMElements = this.api.getDOMElements();
    const toastBtn = DOMElements?.objectives_toast_btn;
    if (!toastBtn) return;
    toastBtn.classList.toggle("hidden", pageId !== "reactor_section");
    if (pageId === "reactor_section") {
      const game = this.api.getGame();
      const om = game?.objectives_manager;
      if (om?.current_objective_def) {
        this.api.getStateManager()?.handleObjectiveLoaded?.({
          ...om.current_objective_def,
          title: typeof om.current_objective_def.title === "function" ? om.current_objective_def.title() : om.current_objective_def.title,
        }, om.current_objective_index);
        this.updateDisplay();
      }
    }
  }

  setupListeners() {
    const toastBtn = this.api.getDOMElements()?.objectives_toast_btn;
    if (!toastBtn) return;
    toastBtn.addEventListener("click", (event) => {
      const claimPill = event.target.closest(".objectives-claim-pill");
      if (claimPill && toastBtn.classList.contains("is-complete")) {
        this.api.getGame()?.objectives_manager?.claimObjective?.();
        return;
      }
      const isExpanded = toastBtn.classList.toggle("is-expanded");
      toastBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      if (isExpanded && this.api.lightVibration) this.api.lightVibration();
    });
  }
}
