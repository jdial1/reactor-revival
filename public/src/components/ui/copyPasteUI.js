import { numFormat as fmt, StorageUtils, serializeSave } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { BlueprintService } from "../../core/services/BlueprintService.js";
import { renderMyLayoutsList } from "./copyPaste/myLayoutsListUI.js";
import { setupCopyAction, setupPasteAction } from "./copyPaste/pasteModalController.js";

const TOAST_DURATION_MS = 2000;
const JSON_INDENT_SPACES = 2;

export class CopyPasteUI {
  constructor(ui) {
    this.ui = ui;
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
    if (uiState) {
      copyPasteBtns.classList.toggle("collapsed", uiState.copy_paste_collapsed);
    } else if (StorageUtils.get("reactor_copy_paste_collapsed") === true) {
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
        const reactorEl = ui.DOMElements.reactor;
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
      } else if (ui._dropperPointerHandler && ui.DOMElements.reactor) {
        (ui.gridCanvasRenderer?.getCanvas() || ui.DOMElements.reactor).removeEventListener("pointerdown", ui._dropperPointerHandler, true);
        ui._dropperPointerHandler = null;
      }
    };
  }

  _setupMyLayouts() {
    const ui = this.ui;
    const myLayoutsBtn = document.getElementById("reactor_my_layouts_btn");
    const myLayoutsModal = document.getElementById("my_layouts_modal");
    const myLayoutsList = document.getElementById("my_layouts_list");
    const myLayoutsCloseBtn = document.getElementById("my_layouts_close_btn");
    if (!myLayoutsBtn || !myLayoutsModal || !myLayoutsList) return;
    myLayoutsBtn.onclick = () => {
      renderMyLayoutsList(ui, ui.layoutStorageUI.getMyLayouts(), myLayoutsList, myLayoutsModal, fmt, () => myLayoutsBtn.click());
      myLayoutsModal.classList.remove("hidden");
    };
    if (myLayoutsCloseBtn) myLayoutsCloseBtn.onclick = () => myLayoutsModal.classList.add("hidden");
    const saveFromClipboardBtn = document.getElementById("my_layouts_save_from_clipboard_btn");
    if (saveFromClipboardBtn) {
      saveFromClipboardBtn.onclick = async () => {
        const result = await ui.clipboardUI.readFromClipboard();
        const data = result.success ? result.data : "";
        const layout = this._getBlueprint()?.deserialize(data);
        if (!layout) {
          logger.log('warn', 'ui', !result.success ? (result.message || "Clipboard unavailable.") : (data ? "Invalid layout data in clipboard." : "Clipboard is empty."));
          return;
        }
        const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
        ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, data);
        myLayoutsBtn.click();
      };
    }
  }

  _setupSandboxButton() {
    const ui = this.ui;
    const sandboxBtn = document.getElementById("reactor_sandbox_btn");
    if (!sandboxBtn) return;
    sandboxBtn.onclick = () => ui.sandboxUI.toggleSandbox();
    const updateSandboxButton = () => {
      if (!sandboxBtn) return;
      sandboxBtn.title = ui.game?.isSandbox ? "Return to Splash" : "Enter Sandbox";
      sandboxBtn.querySelector(".emoji-icon").textContent = ui.game?.isSandbox ? "\u23EE" : "\u{1F9EA}";
      sandboxBtn.classList.toggle("on", !!ui.game?.isSandbox);
    };
    ui._updateSandboxButton = updateSandboxButton;
    updateSandboxButton();
  }

  setupCopyStateButton() {
    const ui = this.ui;
    const copyStateBtn = document.getElementById("copy_state_btn");
    if (!copyStateBtn) return;
    copyStateBtn.onclick = async () => {
      const gameStateObject = await ui.game.saveManager.getSaveState();
      const gameStateString = serializeSave(gameStateObject);
      navigator.clipboard
        .writeText(gameStateString)
        .then(() => {
          const originalText = copyStateBtn.textContent;
          ui.coreLoopUI.scheduleDomUpdate(() => { copyStateBtn.textContent = "Copied!"; });
          setTimeout(() => {
            ui.coreLoopUI.scheduleDomUpdate(() => { copyStateBtn.textContent = originalText; });
          }, TOAST_DURATION_MS);
        })
        .catch((err) => {
          logger.log('error', 'ui', 'Failed to copy game state: ', err);
          const originalText = copyStateBtn.textContent;
          ui.coreLoopUI.scheduleDomUpdate(() => { copyStateBtn.textContent = "Error!"; });
          setTimeout(() => {
            ui.coreLoopUI.scheduleDomUpdate(() => { copyStateBtn.textContent = originalText; });
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
