import { html, render } from "lit-html";
import { classMap } from "../../utils/litHelpers.js";
import { styleMap } from "../../utils/litHelpers.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export class ObjectiveController {
  constructor(api) {
    this.api = api;
    this._onToastClick = (e) => this._handleToastClick(e);
    this._objectivesUnmount = null;
  }

  _handleClaimClick(event) {
    event.stopPropagation();
    this.api.getGame()?.objectives_manager?.claimObjective?.();
  }

  _handleToastClick(event) {
    if (event.target?.closest?.(".objectives-claim-pill")) return;
    const toastBtn = event.currentTarget;
    const uiState = this.api.getUI()?.uiState;
    if (uiState) {
      uiState.objectives_toast_expanded = !uiState.objectives_toast_expanded;
      if (uiState.objectives_toast_expanded && this.api.lightVibration) this.api.lightVibration();
    } else {
      const isExpanded = toastBtn.classList.toggle("is-expanded");
      toastBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      if (isExpanded && this.api.lightVibration) this.api.lightVibration();
      this._render(this._getRenderState());
    }
  }

  _getRenderState() {
    const game = this.api.getGame();
    const uiState = this.api.getUI()?.uiState;
    if (!game) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    if (game.isSandbox) {
      return { sandbox: true, title: "Sandbox", claimText: "", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    }
    const obj = game.state?.active_objective;
    const om = game.objectives_manager;
    if (obj?.title) {
      const isExpanded = uiState?.objectives_toast_expanded ?? false;
      const showProgressBar = obj.hasProgressBar && isExpanded;
      return {
        sandbox: false,
        title: obj.title ? `${(obj.index ?? 0) + 1}: ${obj.title}` : "",
        claimText: obj.isChapterCompletion ? "Complete" : "Claim",
        progressPercent: showProgressBar ? (obj.progressPercent ?? 0) : 0,
        isComplete: !!obj.isComplete,
        isActive: !obj.isComplete,
        hasProgressBar: !!showProgressBar,
        isExpanded,
        hidden: uiState?.active_page !== "reactor_section",
      };
    }
    const hidden = uiState?.active_page !== "reactor_section";
    if (!om) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const info = om.getCurrentObjectiveDisplayInfo();
    if (!info) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const objectiveIndex = om.current_objective_index ?? 0;
    const displayTitle = info.title ? `${objectiveIndex + 1}: ${info.title}` : "";
    const checkId = om.current_objective_def?.checkId;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = checkId === "sustainedPower1k" && isExpanded && !info.isComplete;
    return {
      sandbox: false,
      title: displayTitle,
      claimText: info.isChapterCompletion ? "Complete" : "Claim",
      progressPercent: info.progressPercent ?? 0,
      isComplete: !!info.isComplete,
      isActive: !info.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
  }

  _getRenderStateForPage(pageId) {
    const state = this._getRenderState();
    if (!state) return null;
    state.hidden = pageId !== "reactor_section";
    return state;
  }

  _toTemplate(state) {
    if (!state) return null;
    const btnClass = classMap({
      "objectives-toast-btn": true,
      "is-complete": state.isComplete,
      "is-active": state.isActive,
      "has-progress-bar": state.hasProgressBar,
      "is-expanded": state.isExpanded,
      hidden: state.hidden,
    });
    const progressStyle = styleMap({ width: state.hasProgressBar ? `${state.progressPercent}%` : "0%" });
    return html`
      <div
        id="objectives_toast_btn"
        class=${btnClass}
        role="button"
        tabindex="0"
        aria-label="Show Objectives"
        aria-expanded=${state.isExpanded ? "true" : "false"}
        @click=${this._onToastClick}
        @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._handleToastClick(e); } }}
      >
        <span class="objectives-toast-row">
          <span class="objectives-toast-icon">${state.isComplete ? "!" : "?"}</span>
          <span class="objectives-toast-title" id="objectives_toast_title">${state.title}</span>
          <button type="button" class="objectives-claim-pill" ?disabled=${!state.isComplete} @click=${(e) => this._handleClaimClick(e)}>${state.claimText}</button>
        </span>
        <span class="objectives-toast-progress" aria-hidden="true"><span class="objectives-toast-progress-fill" style=${progressStyle}></span></span>
      </div>
    `;
  }

  _render(state) {
    const root = document.getElementById("objectives_toast_root");
    if (!root?.isConnected || !state) return;
    const template = this._toTemplate(state);
    if (template) {
      try {
        render(template, root);
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
      }
    }
    if (state.title) this.api.getStateManager()?.checkObjectiveTextScrolling?.();
  }

  _renderReactive() {
    const state = this._getRenderState();
    const template = this._toTemplate(state);
    if (template && state?.isComplete && !this._lastObjectiveComplete) {
      this._lastObjectiveComplete = true;
      setTimeout(() => this.animateCompletion(), 0);
    } else if (state && !state.isComplete) {
      this._lastObjectiveComplete = false;
    }
    if (template && state?.title) setTimeout(() => this.api.getStateManager()?.checkObjectiveTextScrolling?.(), 0);
    return template;
  }

  updateDisplayFromState() {
    if (this._objectivesUnmount) return;
    const game = this.api.getGame();
    const state = game?.state;
    if (!state?.active_objective) return;
    const obj = state.active_objective;
    const uiState = this.api.getUI()?.uiState;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = obj.hasProgressBar && isExpanded;
    const renderState = {
      sandbox: false,
      title: obj.title ? `${obj.index + 1}: ${obj.title}` : "",
      claimText: obj.isChapterCompletion ? "Complete" : "Claim",
      progressPercent: showProgressBar ? obj.progressPercent : 0,
      isComplete: !!obj.isComplete,
      isActive: !obj.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(renderState);
    if (!wasComplete && obj.isComplete) this.animateCompletion();
  }

  updateDisplay() {
    const game = this.api.getGame();
    if (!game?.objectives_manager) return;
    if (game.isSandbox) {
      this._render({ sandbox: true, title: "Sandbox", claimText: "", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: false });
      return;
    }
    const info = game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(this._getRenderState());
    if (!wasComplete && info.isComplete) this.animateCompletion();
  }

  animateCompletion() {
    const toastBtn = document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("objective-completed");
    setTimeout(() => toastBtn.classList.remove("objective-completed"), 2000);
  }

  showForPage(pageId) {
    this.api.cacheDOMElements?.();
    if (pageId === "reactor_section") {
      const game = this.api.getGame();
      const om = game?.objectives_manager;
      if (om?.current_objective_def) {
        om._syncActiveObjectiveToState?.();
        this.api.getStateManager()?.handleObjectiveLoaded?.({
          ...om.current_objective_def,
          title: typeof om.current_objective_def.title === "function" ? om.current_objective_def.title() : om.current_objective_def.title,
        }, om.current_objective_index);
      }
    }
  }

  setupListeners() {
    const game = this.api.getGame();
    const ui = this.api.getUI();
    const root = document.getElementById("objectives_toast_root");
    if (root && game?.state && ui?.uiState) {
      const subscriptions = [
        { state: game.state, keys: ["active_objective"] },
        { state: ui.uiState, keys: ["objectives_toast_expanded", "active_page"] },
      ];
      const renderFn = () => this._renderReactive();
      this._objectivesUnmount = ReactiveLitComponent.mountMulti(subscriptions, renderFn, root);
    } else if (root) {
      this._render(this._getRenderState());
    }
  }

  unmount() {
    if (typeof this._objectivesUnmount === "function") {
      this._objectivesUnmount();
      this._objectivesUnmount = null;
    }
  }
}
