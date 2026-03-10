import { html } from "lit-html";
import { classMap } from "../../utils/litHelpers.js";
import { numFormat as fmt, StorageUtils, serializeSave } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { BlueprintService } from "../../core/services/BlueprintService.js";
import { setupCopyAction, setupPasteAction } from "./copyPaste/pasteModalController.js";
import { MODAL_IDS } from "../ModalManager.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

const TOAST_DURATION_MS = 2000;
const JSON_INDENT_SPACES = 2;

export class CopyPasteUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('CopyPaste', this);
    this._blueprint = null;
  }

  _getBlueprint() {
    if (!this._blueprint && this.ui.game) {
      this._blueprint = new BlueprintService(this.ui.game);
    }
    return this._blueprint;
  }

  init() {
    const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
    const toggleBtn = document.getElementById("reactor_copy_paste_toggle");
    const copyBtn = document.getElementById("reactor_copy_btn");
    const pasteBtn = document.getElementById("reactor_paste_btn");
    const deselectBtn = document.getElementById("reactor_deselect_btn");
    const dropperBtn = document.getElementById("reactor_dropper_btn");
    const modal = document.getElementById("reactor_copy_paste_modal");
    const modalTitle = document.getElementById("reactor_copy_paste_modal_title");
    const modalText = document.getElementById("reactor_copy_paste_text");
    const modalCost = document.getElementById("reactor_copy_paste_cost");
    const closeBtn = document.getElementById("reactor_copy_paste_close_btn");
    const confirmBtn = document.getElementById("reactor_copy_paste_confirm_btn");

    this._setupToggleCollapse(copyPasteBtns, toggleBtn);
    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) {
      logger.log('warn', 'ui', 'Copy/paste UI elements not found, skipping initialization');
      return;
    }
    this._setupDeselect(deselectBtn);
    this._setupDropper(dropperBtn);

    const refs = { copyBtn, pasteBtn, modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
    const bp = () => this._getBlueprint();
    setupCopyAction(this.ui, bp, refs);
    setupPasteAction(this.ui, bp, refs);

    this._setupMyLayouts();
    this._setupSandboxButton();
    if (closeBtn) closeBtn.onclick = this.ui.modalOrchestrationUI.hideModal.bind(this.ui.modalOrchestrationUI);
  }

  open(data) {
    if (typeof this.ui._showPasteModalWithData === "function") {
      this.ui._showPasteModalWithData(data ?? "");
    }
  }

  _setupToggleCollapse(copyPasteBtns, toggleBtn) {
    if (!toggleBtn || !copyPasteBtns) return;
    const uiState = this.ui.uiState;
    toggleBtn.onclick = () => {
      if (uiState) uiState.copy_paste_collapsed = !uiState.copy_paste_collapsed;
      else {
        copyPasteBtns.classList.toggle("collapsed");
        StorageUtils.set("reactor_copy_paste_collapsed", copyPasteBtns.classList.contains("collapsed"));
      }
    };
    if (!uiState && StorageUtils.get("reactor_copy_paste_collapsed") === true) {
      copyPasteBtns.classList.add("collapsed");
    }
  }

  _setupDeselect(deselectBtn) {
    if (!deselectBtn) return;
    deselectBtn.onclick = () => {
      document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
      this.ui.stateManager.setClickedPart(null);
    };
  }

  _setupDropper(dropperBtn) {
    const ui = this.ui;
    if (!dropperBtn) return;
    dropperBtn.onclick = () => {
      ui._dropperModeActive = !ui._dropperModeActive;
      dropperBtn.classList.toggle("on", ui._dropperModeActive);
      if (ui._dropperModeActive) {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        const reactorEl = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (reactorEl && !ui._dropperPointerHandler) {
          ui._dropperPointerHandler = (e) => {
            const tile = ui.gridCanvasRenderer ? ui.gridCanvasRenderer.hitTest(e.clientX, e.clientY) : null;
            if (tile?.part) {
              document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
              ui.stateManager.setClickedPart(tile.part, { skipOpenPanel: true });
              if (tile.part.$el) tile.part.$el.classList.add("part_active");
              ui._dropperModeActive = false;
              dropperBtn.classList.remove("on");
              reactorEl.removeEventListener("pointerdown", ui._dropperPointerHandler, true);
              ui._dropperPointerHandler = null;
            }
          };
          (ui.gridCanvasRenderer?.getCanvas() || reactorEl).addEventListener("pointerdown", ui._dropperPointerHandler, true);
        }
      } else if (ui._dropperPointerHandler) {
        const reactorEl = ui.registry?.get?.("PageInit")?.getReactor?.() ?? ui.DOMElements?.reactor;
        if (reactorEl) (ui.gridCanvasRenderer?.getCanvas() || reactorEl).removeEventListener("pointerdown", ui._dropperPointerHandler, true);
        ui._dropperPointerHandler = null;
      }
    };
  }

  _setupMyLayouts() {
    const ui = this.ui;
    const myLayoutsBtn = document.getElementById("reactor_my_layouts_btn");
    if (!myLayoutsBtn) return;
    myLayoutsBtn.onclick = () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  }

  _setupSandboxButton() {
    const ui = this.ui;
    const root = document.getElementById("reactor_sandbox_btn_root");
    if (!root || !ui.uiState) return;
    if (this._sandboxUnmount) {
      this._sandboxUnmount();
      this._sandboxUnmount = null;
    }
    if (ui.game) ui.uiState.copy_paste_display = { isSandbox: !!ui.game.isSandbox };
    const template = () => {
      const isSandbox = ui.uiState.copy_paste_display.isSandbox;
      const icon = isSandbox ? "\u23EE" : "\u{1F9EA}";
      const title = isSandbox ? "Return to Splash" : "Enter Sandbox";
      return html`
        <button id="reactor_sandbox_btn" title=${title} tabindex="0" aria-label="Sandbox" class=${classMap({ on: isSandbox })} @click=${() => ui.sandboxUI.toggleSandbox()}>
          <span class="emoji-icon">${icon}</span>
        </button>
      `;
    };
    this._sandboxUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["copy_paste_display"] }],
      template,
      root
    );
  }

  setupCopyStateButton() {
    const ui = this.ui;
    const copyStateBtn = document.getElementById("copy_state_btn");
    if (!copyStateBtn || !ui.uiState) return;
    const defaultLabel = "Copy State";
    if (this._copyStateUnmount) {
      this._copyStateUnmount();
      this._copyStateUnmount = null;
    }
    const renderFn = () => {
      const label = ui.uiState.copy_state_feedback ?? defaultLabel;
      return html`${label}`;
    };
    this._copyStateUnmount = ReactiveLitComponent.mountMulti(
      [{ state: ui.uiState, keys: ["copy_state_feedback"] }],
      renderFn,
      copyStateBtn
    );
    copyStateBtn.onclick = async () => {
      const gameStateObject = await ui.game.saveManager.getSaveState();
      const gameStateString = serializeSave(gameStateObject);
      navigator.clipboard
        .writeText(gameStateString)
        .then(() => {
          ui.uiState.copy_state_feedback = "Copied!";
          setTimeout(() => {
            ui.uiState.copy_state_feedback = null;
          }, TOAST_DURATION_MS);
        })
        .catch((err) => {
          logger.log('error', 'ui', 'Failed to copy game state: ', err);
          ui.uiState.copy_state_feedback = "Error!";
          setTimeout(() => {
            ui.uiState.copy_state_feedback = null;
          }, TOAST_DURATION_MS);
        });
    };
  }

  pasteReactorLayout(layout, options = {}) {
    const ui = this.ui;
    if (!layout || !ui.game || !ui.game.tileset || !ui.game.partset) return;
    ui.game.action_pasteLayout(layout, options);
    ui.gridCanvasRenderer?.markStaticDirty();
    ui.coreLoopUI.runUpdateInterfaceLoop();
  }
}
