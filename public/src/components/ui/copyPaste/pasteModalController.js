import { html, render } from "lit-html";
import { renderComponentIcons } from "../componentRenderingUI.js";
import { numFormat as fmt } from "../../../utils/util.js";
import { logger } from "../../../utils/logger.js";

const PREVIEW_RERENDER_DELAY_MS = 180;
const MODAL_HIDE_DELAY_MS = 1000;
const MODAL_COST_MARGIN_TOP_PX = 10;
const MODAL_SECTION_MARGIN_TOP_PX = 15;
const MODAL_BORDER_RADIUS_PX = 4;
const CONFIRM_BTN_BG = "#236090";
const MODAL_GAP_PX = 4;
const MODAL_PADDING_PX = 10;
const MODAL_INNER_GAP_PX = 8;
const JSON_INDENT_SPACES = 2;
const MODAL_BORDER_COLOR = "rgb(68 68 68)";
const MODAL_BG_DARK = "rgb(42 42 42)";
const COLOR_GOLD = "rgb(255 215 0)";
const COLOR_SUCCESS = "rgb(76 175 80)";
const COLOR_ERROR = "rgb(255 107 107)";
const COLOR_AFFORD = "#4caf50";
const COLOR_CANNOT_AFFORD = "#ff6b6b";
const OPACITY_VISIBLE = "1";
const OPACITY_HIDDEN = "0";
const Z_INDEX_VISIBLE = "1";
const HEIGHT_COLLAPSED = "0";

export function setModalTextareaVisibility(modalText, isPaste) {
  if (isPaste) {
    modalText.classList.remove("hidden");
    modalText.style.display = "block";
    modalText.style.visibility = "visible";
    modalText.style.opacity = OPACITY_VISIBLE;
    modalText.style.position = "relative";
    modalText.style.zIndex = Z_INDEX_VISIBLE;
  } else {
    modalText.classList.add("hidden");
    modalText.style.display = "none";
    modalText.style.visibility = "hidden";
    modalText.style.opacity = OPACITY_HIDDEN;
    modalText.style.height = HEIGHT_COLLAPSED;
    modalText.style.overflow = "hidden";
  }
}

function buildCostDisplayTemplate(breakdown, affordability) {
  const { money: costMoney, ep: costEp } = breakdown;
  if (costMoney <= 0 && costEp <= 0) {
    return html`<div style="margin-top: ${MODAL_COST_MARGIN_TOP_PX}px; color: ${COLOR_ERROR}; font-weight: bold;">No parts found in layout</div>`;
  }
  const moneyColor = affordability.canAffordMoney ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const epColor = affordability.canAffordEp ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  return html`
    <div style="margin-top: ${MODAL_COST_MARGIN_TOP_PX}px; display: flex; flex-direction: column; gap: ${MODAL_GAP_PX}px;">
      ${costMoney > 0 ? html`<span style="color: ${moneyColor}; font-weight: bold;">Money: $${fmt(costMoney)} needed (you have $${fmt(affordability.currentMoneyNum)})</span>` : ""}
      ${costEp > 0 ? html`<span style="color: ${epColor}; font-weight: bold;">EP: ${fmt(costEp)} needed (you have ${fmt(affordability.currentEpNum)})</span>` : ""}
    </div>
  `;
}

function buildSellOptionTemplate(currentSellValue, checked, onSellChange) {
  return html`
    <div style="padding: ${MODAL_PADDING_PX}px; border: 1px solid ${MODAL_BORDER_COLOR}; border-radius: ${MODAL_BORDER_RADIUS_PX}px; margin-top: ${MODAL_SECTION_MARGIN_TOP_PX}px; background-color: ${MODAL_BG_DARK};">
      <label style="display: flex; align-items: center; cursor: pointer; gap: ${MODAL_INNER_GAP_PX}px;">
        <input type="checkbox" id="sell_existing_checkbox" style="margin: 0;" ?checked=${checked} @change=${onSellChange}>
        <span style="color: ${COLOR_GOLD};">Sell existing grid for $${fmt(currentSellValue)}</span>
      </label>
    </div>
  `;
}

export function renderModalCostContent(modalCost, cost, summary, ui, options, onSlotClick) {
  const componentTemplate = summary.length ? renderComponentIcons(summary, options, onSlotClick) : html``;
  const costTemplate = cost > 0 ? html`<div style="margin-top: ${MODAL_COST_MARGIN_TOP_PX}px; color: ${COLOR_SUCCESS}; font-weight: bold;">Total Cost: $${fmt(cost)}</div>` : html``;
  render(html`${componentTemplate}${costTemplate}`, modalCost);
}

export function showModal(ui, refs, opts) {
  const { modal, modalTitle, modalText, modalCost, confirmBtn } = refs;
  const { title, data, cost, action, canPaste = false, summary = [], ...options } = opts;
  modalTitle.textContent = title;
  modalText.value = data;
  setModalTextareaVisibility(modalText, action === "paste");
  const wasPaused = ui.stateManager.getVar("pause");
  ui.stateManager.setVar("pause", true);
  renderModalCostContent(modalCost, cost, summary, ui, options);
  if (action === "copy") {
    modalText.readOnly = true;
    modalText.placeholder = "Reactor layout data (read-only)";
    confirmBtn.textContent = "Copy";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = false;
  } else if (action === "paste") {
    modalText.readOnly = false;
    modalText.placeholder = (data && data.trim()) ? "Paste reactor layout data here..." : "Enter reactor layout JSON data manually...";
    confirmBtn.textContent = "Paste";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = !canPaste;
  }
  modal.classList.remove("hidden");
  const previewWrap = document.getElementById("reactor_copy_paste_preview_wrap");
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
  if (previewWrap) previewWrap.classList.toggle("hidden", action !== "paste");
  if (partialBtn) partialBtn.classList.toggle("hidden", action !== "paste");
  modal.dataset.previousPauseState = wasPaused;
  const handleOutsideClick = (e) => {
    if (e.target === modal) {
      ui.modalOrchestrationUI.hideModal();
      modal.removeEventListener('click', handleOutsideClick);
    }
  };
  modal.addEventListener('click', handleOutsideClick);
}

function renderCopySummary(modalCost, bp, layout, summary, checkedTypes, updateCopySummary) {
  const onSlotClick = (ids, checked) => {
    ids.forEach(id => { checkedTypes[id] = !checked; });
    updateCopySummary();
  };
  const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
  const filteredLayout = bp().filterByTypes(layout, checkedTypes);
  const filteredCost = bp().getTotalCost(filteredLayout);
  const costTemplate = html`<div style="margin-top: ${MODAL_COST_MARGIN_TOP_PX}px; color: ${COLOR_SUCCESS}; font-weight: bold;">Selected Parts Cost: $${fmt(filteredCost)}</div>`;
  render(html`${componentTemplate}${costTemplate}`, modalCost);
}

function bindCopyConfirm(confirmBtn, layout, checkedTypes, bp, ui) {
  confirmBtn.onclick = async () => {
    if (!ui.game) return;
    const filteredLayout = bp().filterByTypes(layout, checkedTypes);
    const rows = ui.game.rows;
    const cols = ui.game.cols;
    const parts = filteredLayout.flatMap((row, r) => (row || []).map((cell, c) => (cell && cell.id) ? { r, c, t: cell.t, id: cell.id, lvl: cell.lvl || 1 } : null).filter(Boolean));
    const compactLayout = { size: { rows, cols }, parts };
    const filteredData = JSON.stringify(compactLayout, null, JSON_INDENT_SPACES);
    const result = await ui.clipboardUI.writeToClipboard(filteredData);
    const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
    if (result.success) {
      ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, filteredData);
      confirmBtn.textContent = "Copied!";
    } else {
      confirmBtn.textContent = "Failed to Copy";
    }
    setTimeout(() => ui.modalOrchestrationUI.hideModal(), MODAL_HIDE_DELAY_MS);
  };
}

export function setupCopyAction(ui, bp, refs) {
  const { copyBtn, modal, modalText, modalCost, confirmBtn } = refs;
  copyBtn.onclick = () => {
    const data = bp().serialize();
    const layout = bp().deserialize(data);
    const cost = bp().getTotalCost(layout);
    const summary = bp().getPartSummary(layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = () => {
      renderCopySummary(modalCost, bp, layout, summary, checkedTypes, updateCopySummary);
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
    };

    updateCopySummary();
    bindCopyConfirm(confirmBtn, layout, checkedTypes, bp, ui);

    confirmBtn.disabled = false;
    confirmBtn.classList.remove("hidden");
    confirmBtn.style.backgroundColor = CONFIRM_BTN_BG;
    confirmBtn.style.cursor = "pointer";
  };
}

function parseLayoutState(textareaData, bp) {
  const layoutInner = bp().deserialize(textareaData);
  if (!layoutInner) {
    return {
      valid: false,
      invalidMessage: !textareaData
        ? "Enter reactor layout JSON data in the text area above"
        : "Invalid layout data - please check the JSON format"
    };
  }
  return { valid: true, layoutInner };
}

function buildPasteStateFromInput(textareaData, checkedTypes, bp, getSellCheckboxChecked) {
  const parseResult = parseLayoutState(textareaData, bp);
  if (!parseResult.valid) return parseResult;
  const { layoutInner } = parseResult;
  const currentSellCheckboxState = getSellCheckboxChecked();
  const originalSummary = bp().getPartSummary(layoutInner);
  const pasteState = bp().buildPasteState(layoutInner, checkedTypes, currentSellCheckboxState);
  if (!pasteState.valid) return pasteState;
  const affordableSet = bp().getAffordableSet(pasteState.affordableLayout);
  return { ...pasteState, layoutInner, originalSummary, affordableSet, currentSellCheckboxState };
}

function getCheckedTypesFromSummary(summary) {
  const checkedTypes = {};
  summary.forEach((item) => { checkedTypes[item.id] = true; });
  return checkedTypes;
}

async function readClipboardForPaste(ui) {
  const result = await ui.clipboardUI.readFromClipboard();
  return result.success ? result.data : "";
}

export function setupPasteAction(ui, bp, refs) {
  const { pasteBtn, modal, modalText, modalCost, confirmBtn } = refs;

  const clearExistingPartsForSell = () => {
    ui.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) tile.sellPart();
    });
    ui.game.reactor.updateStats();
  };

  const renderCostContent = (state, checkedTypes, updaterRef) => {
    const onSlotClick = (ids, checked) => {
      ids.forEach(id => { checkedTypes[id] = !checked; });
      updaterRef.update();
    };
    const componentTemplate = renderComponentIcons(state.originalSummary, { showCheckboxes: true, checkedTypes }, onSlotClick);
    const hasSellOption = modal.dataset.hasSellOption === "true";
    const sellValue = Number(modal.dataset.sellValue || 0);
    const sellOptionTemplate = hasSellOption ? buildSellOptionTemplate(sellValue, state.currentSellCheckboxState, () => updaterRef.update()) : html``;
    const costTemplate = buildCostDisplayTemplate(state.breakdown, {
      canAffordMoney: state.canAffordMoney,
      canAffordEp: state.canAffordEp,
      currentMoneyNum: state.currentMoneyNum,
      currentEpNum: state.currentEpNum,
    });
    render(html`${componentTemplate}${sellOptionTemplate}${costTemplate}`, modalCost);
  };

  const updateModalState = (state, checkedTypes, previewCanvas, partialBtnRef, updaterRef) => {
    if (!state.valid) {
      render(html`${state.invalidMessage}`, modalCost);
      confirmBtn.disabled = true;
      confirmBtn.classList.remove("hidden");
      if (partialBtnRef) partialBtnRef.disabled = true;
      return;
    }
    if (previewCanvas) {
      bp().renderPreview(state.layoutInner, previewCanvas, state.affordableSet);
      setTimeout(() => bp().renderPreview(state.layoutInner, previewCanvas, state.affordableSet), PREVIEW_RERENDER_DELAY_MS);
    }
    renderCostContent(state, checkedTypes, updaterRef);
    confirmBtn.disabled = !state.canPaste;
    confirmBtn.classList.remove("hidden");
    if (partialBtnRef) {
      partialBtnRef.disabled = !state.hasPartial;
      partialBtnRef.classList.remove("hidden");
    }
  };

  const createUpdater = (previewCanvas, partialBtnRef) => {
    let checkedTypes = {};
    const ref = {};
    const getSellCheckboxChecked = () => document.getElementById('sell_existing_checkbox')?.checked || false;
    ref.update = function update() {
      const state = buildPasteStateFromInput(modalText.value.trim(), checkedTypes, bp, getSellCheckboxChecked);
      updateModalState(state, checkedTypes, previewCanvas, partialBtnRef, ref);
    };
    return { updater: ref.update, checkedTypes, setCheckedTypes(ct) { checkedTypes = ct; } };
  };

  const bindModalInput = (ctrl) => {
    modalText.oninput = () => {
      const layout = bp().deserialize(modalText.value.trim());
      const summary = bp().getPartSummary(layout || []);
      ctrl.setCheckedTypes(getCheckedTypesFromSummary(summary));
      ctrl.updater();
    };
  };

  const bindConfirmPaste = (ctrl) => {
    confirmBtn.onclick = () => {
      const textareaData = modalText.value.trim();
      const layoutToPaste = bp().deserialize(textareaData);
      if (!layoutToPaste) {
        logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
        return;
      }
      const filtered = bp().filterByTypes(layoutToPaste, ctrl.checkedTypes);
      const breakdown = bp().getCostBreakdown(filtered);
      const sellExisting = document.getElementById('sell_existing_checkbox')?.checked || false;
      const sellCredit = sellExisting ? bp().getCurrentSellValue() : 0;
      const validation = bp().validateResources(breakdown, sellCredit);
      if (!validation.valid) {
        logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
        return;
      }
      if (sellExisting) clearExistingPartsForSell();
      ui.copyPaste.pasteReactorLayout(bp().clipToGrid(filtered));
      ui.modalOrchestrationUI.hideModal();
    };
  };

  const bindPartialPaste = (partialBtn, ctrl) => {
    if (!partialBtn) return;
    partialBtn.onclick = () => {
      const textareaData = modalText.value.trim();
      const layoutToPaste = bp().deserialize(textareaData);
      if (!layoutToPaste) return;
      const filtered = bp().filterByTypes(layoutToPaste, ctrl.checkedTypes);
      const sellExisting = document.getElementById('sell_existing_checkbox')?.checked || false;
      if (sellExisting) clearExistingPartsForSell();
      const affordable = bp().buildAffordableLayout(filtered, 0);
      if (affordable) ui.copyPaste.pasteReactorLayout(affordable);
      ui.modalOrchestrationUI.hideModal();
    };
  };

  const showPasteModalWithData = (data) => {
    const layout = bp().deserialize(data);
    const summary = bp().getPartSummary(layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = bp().getCurrentSellValue();
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);
    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);
    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    const previewCanvas = document.getElementById("reactor_copy_paste_preview");
    const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
    const ctrl = createUpdater(previewCanvas, partialBtn);
    ctrl.setCheckedTypes(getCheckedTypesFromSummary(summary));
    bindModalInput(ctrl);
    ctrl.updater();
    bindConfirmPaste(ctrl);
    bindPartialPaste(partialBtn, ctrl);
  };

  pasteBtn.onclick = async () => {
    const data = await readClipboardForPaste(ui);
    showPasteModalWithData(data);
  };

  ui._showPasteModalWithData = showPasteModalWithData;
}
