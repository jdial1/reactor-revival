import { html, render } from "lit-html";
import { classMap, styleMap } from "../dom/lit.js";
import { bindLitRenderMulti } from "../dom/lit-reactive.js";
import { getObjectiveClaimText } from "../domain/objectives.js";
import { isShopOverlayPage } from "./shell/page-dom.js";
import { enqueueGameEffect } from "../state/game-effects.js";

export function checkObjectiveTextScrolling(titleEl) {
  if (!titleEl) return;
  titleEl.style.animation = "none";
  titleEl.classList.remove("objectives-toast-title--typewriter");
  const text = titleEl.textContent || "";
  if (!text.trim()) return;
  titleEl.textContent = text;
}

function isReactorContextPage(pageId) {
  return pageId === "reactor_section" || isShopOverlayPage(pageId);
}

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
    if (!game) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    const obj = game.state?.active_objective;
    const om = game.objectives_manager;
    if (obj?.title) {
      const isExpanded = uiState?.objectives_toast_expanded ?? false;
      const showProgressBar = obj.hasProgressBar && isExpanded;
      return {
        sandbox: false,
        title: obj.title ? `${(obj.index ?? 0) + 1}: ${obj.title}` : "",
        claimText: getObjectiveClaimText(obj.reward),
        reward: obj.reward ?? null,
        progressPercent: showProgressBar ? (obj.progressPercent ?? 0) : 0,
        isComplete: !!obj.isComplete,
        isActive: !obj.isComplete,
        hasProgressBar: !!showProgressBar,
        isExpanded,
        hidden: !isReactorContextPage(uiState?.active_page),
      };
    }
    const hidden = !isReactorContextPage(uiState?.active_page);
    if (!om) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const info = om.getCurrentObjectiveDisplayInfo();
    if (!info) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const objectiveIndex = om.current_objective_index ?? 0;
    const displayTitle = info.title ? `${objectiveIndex + 1}: ${info.title}` : "";
    const checkId = om.current_objective_def?.checkId;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = checkId === "sustainedPower1k" && isExpanded && !info.isComplete;
    return {
      sandbox: false,
      title: displayTitle,
      claimText: getObjectiveClaimText(info.reward),
      reward: info.reward ?? null,
      progressPercent: info.progressPercent ?? 0,
      isComplete: !!info.isComplete,
      isActive: !info.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: !isReactorContextPage(uiState?.active_page),
    };
  }

  _getRenderStateForPage(pageId) {
    const state = this._getRenderState();
    if (!state) return null;
    state.hidden = !isReactorContextPage(pageId);
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
          <span class="objectives-toast-printer" aria-hidden="true">
            <span class="objectives-toast-printer-head">
              <span class="objectives-toast-icon">${state.isComplete ? "!" : "?"}</span>
            </span>
            <span class="objectives-toast-printer-slot"></span>
          </span>
          <span class="objectives-toast-paper">
            <span class="objectives-toast-paper-head">
              <button type="button" class="objectives-claim-pill" ?disabled=${!state.isComplete} @click=${(e) => this._handleClaimClick(e)}>${state.claimText}</button>
            </span>
            <span class="objectives-toast-paper-line">
              <span class="objectives-toast-title" id="objectives_toast_title"></span>
            </span>
            <span class="objectives-toast-progress" aria-hidden="true"><span class="objectives-toast-progress-fill" style=${progressStyle}></span></span>
          </span>
        </span>
      </div>
    `;
  }

  _syncObjectivesToastTitle(state) {
    const titleEl = typeof document !== "undefined" ? document.getElementById("objectives_toast_title") : null;
    if (!titleEl) return;
    titleEl.textContent = state?.title ?? "";
    if (state?.title?.trim()) {
      setTimeout(() => checkObjectiveTextScrolling(titleEl), 0);
    }
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
    this._syncObjectivesToastTitle(state);
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
      claimText: getObjectiveClaimText(obj.reward),
      reward: obj.reward ?? null,
      progressPercent: showProgressBar ? obj.progressPercent : 0,
      isComplete: !!obj.isComplete,
      isActive: !obj.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: !isReactorContextPage(uiState?.active_page),
    };
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(renderState);
    if (!wasComplete && obj.isComplete) this.animateCompletion();
  }

  updateDisplay() {
    const game = this.api.getGame();
    if (!game?.objectives_manager) return;
    const info = game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(this._getRenderState());
    if (!wasComplete && info.isComplete) this.animateCompletion();
  }

  animateCompletion() {
    const game = this.api.getGame();
    if (game) {
      enqueueGameEffect(game, {
        kind: "dom_pulse",
        selector: "#objectives_toast_btn",
        className: "objective-completed",
        durationMs: 2000,
      });
    }
  }

  showForPage(pageId) {
    if (isReactorContextPage(pageId)) {
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
      this._objectivesUnmount = bindLitRenderMulti(
        subscriptions,
        renderFn,
        root,
        () => {
          const s = this._getRenderState();
          this._syncObjectivesToastTitle(s);
        }
      );
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
