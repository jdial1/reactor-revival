import { safeSetItem, safeGetItem, safeRemoveItem } from "../utils/util.js";

const TUTORIAL_STEP_KEY = "reactorTutorialStep";
const TUTORIAL_HARD_SKIP_KEY = "reactorTutorialHardSkipped";

const CLAIM_STEP = {
  key: "claim_objective",
  message: "Click Claim to complete the objective",
  onEnter: () => {
    const toast = document.getElementById("objectives_toast_btn");
    if (toast && !toast.classList.contains("is-expanded")) {
      toast.classList.add("is-expanded");
      toast.setAttribute("aria-expanded", "true");
    }
  },
};

export class TutorialManager {
  constructor(game) {
    this.game = game;
    this.currentStep = -1;
    this.overlay = null;
    this.callout = null;
    this._resumeStepIndex = null;
    this._claimStepActive = false;
    this.isMobile = () => typeof window !== "undefined" && window.innerWidth <= 900;
    this.steps = [
      {
        key: "place_cell",
        message: "Click to select your Uranium Cell",
        mobileMessage: "Tap to select your Uranium Cell",
        completion: () => this.game?.ui?.stateManager?.getClickedPart()?.id === "uranium1",
        onEnter: () => {},
      },
      {
        key: "place_on_reactor",
        message: "Place the cell on the reactor grid",
        completion: () =>
          this.game?.tileset?.active_tiles_list?.some(
            (t) => t.part?.category === "cell"
          ),
        onEnter: () => {},
      },
      {
        key: "see_heat_rise",
        message: "Watch heat rise as your cell generates power",
        completion: () => (this.game?.reactor?.current_heat ?? 0) > 0,
        onEnter: () => {
          if (this.game?.paused) this.game.resume();
        },
      },
      {
        key: "sell_power",
        message: "Sell your power for credits",
        completion: () => this.game?.sold_power === true,
        onEnter: () => {},
      },
      {
        key: "place_vent",
        message: "Place a Heat Vent to cool the cell",
        mobileMessage: "Tap to select the Heat Vent, then place it",
        completion: () =>
          this.game?.tileset?.active_tiles_list?.some(
            (t) => t.part?.category === "vent"
          ),
        onEnter: () => {
          if (!this.isMobile()) this.ensureHeatTabAndPanel();
        },
      },
    ];
  }

  ensurePartsPanelOpen(expand) {
    const section = document.getElementById("parts_section");
    const tabPower = document.getElementById("tab_power");
    if (section?.classList.contains("collapsed") && expand) {
      section.classList.remove("collapsed");
      if (section.previousElementSibling?.id === "control_deck_build_fab") return;
      const ui = this.game?.ui;
      if (ui?.updatePartsPanelBodyClass) ui.updatePartsPanelBodyClass();
    }
    if (tabPower && !tabPower.classList.contains("active")) {
      tabPower.click();
    }
  }

  ensureHeatTabAndPanel() {
    this.ensurePartsPanelOpen(true);
    const tabHeat = document.getElementById("tab_heat");
    if (tabHeat && !tabHeat.classList.contains("active")) {
      tabHeat.click();
    }
  }

  hasClaimableObjective() {
    if (this.game?.isSandbox) return false;
    const def = this.game?.objectives_manager?.current_objective_def;
    return !!def?.completed;
  }

  persistStep(stepIndex) {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      safeSetItem(TUTORIAL_STEP_KEY, String(stepIndex));
    }
  }

  clearPersistedStep() {
    safeRemoveItem(TUTORIAL_STEP_KEY);
  }

  getSelectorForStep(step) {
    if (step.selector) return step.selector;
    if (typeof step.getSelector === "function") return step.getSelector();
    return null;
  }

  getTargetElement(step) {
    if (step.key === "claim_objective") {
      const el = this.game?.ui?.getTutorialTarget?.("claim_objective");
      if (el) return el;
    }
    if (step.key && this.game?.ui?.getTutorialTarget) {
      const el = this.game.ui.getTutorialTarget(step.key);
      if (el) return el;
    }
    const sel = this.getSelectorForStep(step);
    return sel ? document.querySelector(sel) : null;
  }

  getGridTileForStep(step) {
    if (step.gridTile && typeof step.gridTile.row === "number" && typeof step.gridTile.col === "number")
      return step.gridTile;
    if (step.key && this.game?.ui?.getTutorialGridTile)
      return this.game.ui.getTutorialGridTile(step.key);
    return null;
  }

  getTileRectForStep(step) {
    const tile = this.getGridTileForStep(step);
    if (!tile || !this.game?.ui?.getTileRectInViewport) return null;
    return this.game.ui.getTileRectInViewport(tile.row, tile.col);
  }

  updatePointer(tileRect) {
    if (!this.pointer) return;
    if (!tileRect) {
      this.pointer.classList.remove("visible");
      return;
    }
    const centerX = tileRect.left + tileRect.width / 2;
    const centerY = tileRect.top + tileRect.height / 2;
    const tipOffsetX = 10;
    const tipOffsetY = 28;
    this.pointer.style.left = `${centerX - tipOffsetX}px`;
    this.pointer.style.top = `${centerY - tipOffsetY}px`;
    this.pointer.classList.add("visible");
  }

  createOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.id = "tutorial-overlay";
    this.overlay.className = "tutorial-overlay";
    this.overlay.innerHTML = `
      <div class="tutorial-spotlight-top"></div>
      <div class="tutorial-spotlight-left"></div>
      <div class="tutorial-spotlight-right"></div>
      <div class="tutorial-spotlight-bottom"></div>
      <div class="tutorial-focus-border"></div>
      <div class="tutorial-pointer" aria-hidden="true">
        <svg class="tutorial-pointer-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 4l4 8-2 2 2 10 4-6 4 8 4-12-6-4-4-2-4-4z" fill="rgb(255 220 160)" stroke="rgb(180 140 80)" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
    this.pointer = this.overlay.querySelector(".tutorial-pointer");
    this.callout = document.createElement("div");
    this.callout.id = "tutorial-callout";
    this.callout.className = "tutorial-callout";
    const msgEl = document.createElement("div");
    msgEl.className = "tutorial-message";
    this.callout.appendChild(msgEl);
    const skipBtn = document.createElement("button");
    skipBtn.type = "button";
    skipBtn.className = "tutorial-skip-btn";
    skipBtn.textContent = "Skip";
    skipBtn.onclick = () => this.skip();
    this.callout.appendChild(skipBtn);
    const hardSkipBtn = document.createElement("button");
    hardSkipBtn.type = "button";
    hardSkipBtn.className = "tutorial-hard-skip-btn";
    hardSkipBtn.textContent = "Hard Skip";
    hardSkipBtn.onclick = () => this.hardSkip();
    this.callout.appendChild(hardSkipBtn);
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.callout);
  }

  updateSpotlight(rect) {
    if (!this.overlay) return;
    const padding = 8;
    const r = {
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    r.right = r.left + r.width;
    r.bottom = r.top + r.height;
    const [top, left, right, bottom] = this.overlay.children;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const focusBorder = this.overlay.querySelector(".tutorial-focus-border");
    top.style.cssText = `top:0;left:0;width:100%;height:${r.top}px`;
    left.style.cssText = `top:${r.top}px;left:0;width:${r.left}px;height:${r.height}px`;
    right.style.cssText = `top:${r.top}px;left:${r.right}px;width:${w - r.right}px;height:${r.height}px`;
    bottom.style.cssText = `top:${r.bottom}px;left:0;width:100%;height:${h - r.bottom}px`;
    if (focusBorder) focusBorder.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
  }

  updateCallout(message, targetRect) {
    if (!this.callout) return;
    const msgEl = this.callout.querySelector(".tutorial-message");
    if (msgEl) msgEl.textContent = message;
    const rect = this.callout.getBoundingClientRect();
    let top = 16;
    let left = 16;
    if (targetRect) {
      if (targetRect.bottom + rect.height + 12 < window.innerHeight) {
        top = targetRect.bottom + 12;
        left = targetRect.left + (targetRect.width - rect.width) / 2;
      } else if (targetRect.top - rect.height - 12 > 0) {
        top = targetRect.top - rect.height - 12;
        left = targetRect.left + (targetRect.width - rect.width) / 2;
      }
    }
    this.callout.style.top = `${Math.max(8, top)}px`;
    this.callout.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`;
  }

  showStep(stepIndex) {
    const step = this.steps[stepIndex];
    if (!step) return this.complete();
    this.currentStep = stepIndex;
    if (typeof step.onEnter === "function") step.onEnter();
    const target = this.getTargetElement(step);
    if (!target) {
      this.advance();
      return;
    }
    this.createOverlay();
    this.overlay.classList.add("visible");
    this.callout.classList.add("visible");
    const message = (this.isMobile() && step.mobileMessage) ? step.mobileMessage : step.message;
    const tileRect = this.getTileRectForStep(step);
    const useGridTile = !!tileRect;
    const update = () => {
      const rect = useGridTile ? this.getTileRectForStep(step) : target.getBoundingClientRect();
      if (!rect) return;
      this.updateSpotlight(rect);
      this.updateCallout(message, rect);
      this.updatePointer(useGridTile ? rect : null);
    };
    update();
    this._resizeListener = () => update();
    this._scrollListener = () => update();
    window.addEventListener("resize", this._resizeListener);
    window.addEventListener("scroll", this._scrollListener, true);
  }

  hideSpotlight() {
    this.updatePointer(null);
    if (this.overlay) this.overlay.classList.remove("visible");
    if (this.callout) this.callout.classList.remove("visible");
    window.removeEventListener("resize", this._resizeListener);
    window.removeEventListener("scroll", this._scrollListener, true);
  }

  advance() {
    this.advanceFrom(this.currentStep);
  }

  advanceFrom(fromIndex) {
    this.hideSpotlight();
    const next = fromIndex + 1;
    if (next >= this.steps.length) return this.complete().catch(() => {});
    this.persistStep(next);
    if (this.hasClaimableObjective()) {
      this._resumeStepIndex = next;
      this._claimStepActive = true;
      this.showClaimStep();
    } else {
      this.showStep(next);
    }
  }

  showClaimStep() {
    this.currentStep = -1;
    document.body.classList.add("tutorial-claim-step");
    CLAIM_STEP.onEnter();
    const target = this.game?.ui?.getTutorialTarget?.("claim_objective");
    if (!target) {
      document.body.classList.remove("tutorial-claim-step");
      this._claimStepActive = false;
      if (this._resumeStepIndex !== null) {
        const next = this._resumeStepIndex;
        this._resumeStepIndex = null;
        this.showStep(next);
      }
      return;
    }
    this.createOverlay();
    this.overlay.classList.add("visible");
    this.callout.classList.add("visible");
    const update = () => {
      const t = this.game?.ui?.getTutorialTarget?.("claim_objective");
      if (!t) return;
      const rect = t.getBoundingClientRect();
      this.updateSpotlight(rect);
      this.updateCallout(CLAIM_STEP.message, rect);
    };
    setTimeout(update, 50);
    this._resizeListener = () => update();
    this._scrollListener = () => update();
    window.addEventListener("resize", this._resizeListener);
    window.addEventListener("scroll", this._scrollListener, true);
  }

  async complete() {
    document.body.classList.remove("tutorial-claim-step");
    this.hideSpotlight();
    this.currentStep = -1;
    this._claimStepActive = false;
    this._resumeStepIndex = null;
    if (this.game?.off && this._onObjectiveClaimed) this.game.off("objectiveClaimed", this._onObjectiveClaimed);
    this._onObjectiveClaimed = null;
    this.clearPersistedStep();
    if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    if (this.callout?.parentNode) this.callout.parentNode.removeChild(this.callout);
    this.overlay = null;
    this.callout = null;
    safeSetItem("reactorTutorialCompleted", "1");
  }

  skip() {
    this.complete().catch(() => {});
  }

  hardSkip() {
    if (this.game) this.game.bypass_tech_tree_restrictions = true;
    safeSetItem(TUTORIAL_HARD_SKIP_KEY, "1");
    this.complete().catch(() => {});
  }

  _exitClaimStepAndResume() {
    document.body.classList.remove("tutorial-claim-step");
    this.hideSpotlight();
    this._claimStepActive = false;
    if (this._resumeStepIndex !== null) {
      const next = this._resumeStepIndex;
      this._resumeStepIndex = null;
      this.showStep(next);
    }
  }

  tick() {
    if (this._claimStepActive) {
      if (!this.hasClaimableObjective()) this._exitClaimStepAndResume();
      return;
    }
    if (this.currentStep < 0) return;
    const step = this.steps[this.currentStep];
    if (step?.completion && step.completion()) this.advance();
  }

  start() {
    if (this.currentStep >= 0) return;
    this._onObjectiveClaimed = () => {
      if (this._claimStepActive) this._exitClaimStepAndResume();
    };
    if (this.game?.on) this.game.on("objectiveClaimed", this._onObjectiveClaimed);
    const saved = safeGetItem(TUTORIAL_STEP_KEY);
    const stepIndex = saved !== null && saved !== undefined ? parseInt(saved, 10) : NaN;
    if (Number.isFinite(stepIndex) && stepIndex >= 0 && stepIndex < this.steps.length) {
      this.showStep(stepIndex);
    } else {
      this.showStep(0);
    }
  }
}
