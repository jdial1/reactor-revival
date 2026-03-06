import { html, render } from "lit-html";
import { proxy, subscribe } from "valtio/vanilla";
import { styleMap } from "../../../utils/litHelpers.js";
import { renderComponentIcons } from "../componentRenderingUI.js";
import { numFormat as fmt } from "../../../utils/util.js";
import { logger } from "../../../utils/logger.js";

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

const pasteState = proxy({
  textareaData: "",
  checkedTypes: {},
  sellExisting: false,
});

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

function CostDisplay({ breakdown, affordability }) {
  const { money: costMoney, ep: costEp } = breakdown;
  if (costMoney <= 0 && costEp <= 0) {
    return html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_ERROR, fontWeight: "bold" })}>No parts found in layout</div>`;
  }
  const moneyColor = affordability.canAffordMoney ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const epColor = affordability.canAffordEp ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const containerStyle = styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, display: "flex", flexDirection: "column", gap: `${MODAL_GAP_PX}px` });
  return html`
    <div style=${containerStyle}>
      ${costMoney > 0 ? html`<span style=${styleMap({ color: moneyColor, fontWeight: "bold" })}>Money: $${fmt(costMoney)} needed (you have $${fmt(affordability.currentMoneyNum)})</span>` : ""}
      ${costEp > 0 ? html`<span style=${styleMap({ color: epColor, fontWeight: "bold" })}>EP: ${fmt(costEp)} needed (you have ${fmt(affordability.currentEpNum)})</span>` : ""}
    </div>
  `;
}

function SellOption({ currentSellValue, checked, onSellChange }) {
  const boxStyle = styleMap({
    padding: `${MODAL_PADDING_PX}px`,
    border: `1px solid ${MODAL_BORDER_COLOR}`,
    borderRadius: `${MODAL_BORDER_RADIUS_PX}px`,
    marginTop: `${MODAL_SECTION_MARGIN_TOP_PX}px`,
    backgroundColor: MODAL_BG_DARK,
  });
  const labelStyle = styleMap({ display: "flex", alignItems: "center", cursor: "pointer", gap: `${MODAL_INNER_GAP_PX}px` });
  return html`
    <div style=${boxStyle}>
      <label style=${labelStyle}>
        <input type="checkbox" id="sell_existing_checkbox" style=${styleMap({ margin: 0 })} ?checked=${checked} @change=${onSellChange}>
        <span style=${styleMap({ color: COLOR_GOLD })}>Sell existing grid for $${fmt(currentSellValue)}</span>
      </label>
    </div>
  `;
}

export function renderModalCostContent(modalCost, cost, summary, ui, options, onSlotClick) {
  const componentTemplate = summary.length ? renderComponentIcons(summary, options, onSlotClick) : html``;
  const costTemplate = cost > 0 ? html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Total Cost: $${fmt(cost)}</div>` : html``;
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

export function setupCopyAction(ui, bp, refs) {
  const { copyBtn, modalCost, confirmBtn } = refs;

  copyBtn.onclick = () => {
    const data = bp().serialize();
    const layout = bp().deserialize(data);
    const cost = bp().getTotalCost(layout);
    const summary = bp().getPartSummary(layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = (layout, summary, checkedTypes) => {
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateCopySummary(layout, summary, checkedTypes);
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const filteredLayout = bp().filterByTypes(layout, checkedTypes);
      const filteredCost = bp().getTotalCost(filteredLayout);
      const costTemplate = html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Selected Parts Cost: $${fmt(filteredCost)}</div>`;
      render(html`${componentTemplate}${costTemplate}`, modalCost);
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
    };

    updateCopySummary(layout, summary, checkedTypes);

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

    confirmBtn.disabled = false;
    confirmBtn.classList.remove("hidden");
    confirmBtn.style.backgroundColor = CONFIRM_BTN_BG;
    confirmBtn.style.cursor = "pointer";
  };
}

function clearExistingPartsForSell(ui) {
  ui.game.tileset.tiles_list.forEach(tile => {
    if (tile.enabled && tile.part) tile.sellPart();
  });
  ui.game.reactor.updateStats();
}

function handleConfirmPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) {
    logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
    return;
  }
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  const breakdown = bp().getCostBreakdown(filtered);
  const sellCredit = pasteState.sellExisting ? bp().getCurrentSellValue() : 0;
  const validation = bp().validateResources(breakdown, sellCredit);

  if (!validation.valid) {
    logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
    return;
  }
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  ui.copyPaste.pasteReactorLayout(bp().clipToGrid(filtered));
  ui.modalOrchestrationUI.hideModal();
}

function handlePartialPaste(ui, bp) {
  const layoutToPaste = bp().deserialize(pasteState.textareaData);
  if (!layoutToPaste) return;
  const filtered = bp().filterByTypes(layoutToPaste, pasteState.checkedTypes);
  if (pasteState.sellExisting) clearExistingPartsForSell(ui);
  const affordable = bp().buildAffordableLayout(filtered, 0);
  if (affordable) ui.copyPaste.pasteReactorLayout(affordable);
  ui.modalOrchestrationUI.hideModal();
}

function renderPasteModalContent(ui, bp, refs) {
  const parsed = bp().deserialize(pasteState.textareaData);
  if (!parsed) {
    const msg = !pasteState.textareaData ? "Enter reactor layout JSON data in the text area above" : "Invalid layout data - please check the JSON format";
    render(html`${msg}`, refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const originalSummary = bp().getPartSummary(parsed);
  originalSummary.forEach(item => {
    if (pasteState.checkedTypes[item.id] === undefined) {
      pasteState.checkedTypes[item.id] = true;
    }
  });

  const validationState = bp().buildPasteState(parsed, pasteState.checkedTypes, pasteState.sellExisting);
  if (!validationState.valid) {
    render(html`${validationState.invalidMessage}`, refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const onSlotClick = (ids, checked) => ids.forEach(id => { pasteState.checkedTypes[id] = !checked; });
  const onSellChange = (e) => { pasteState.sellExisting = e.target.checked; };

  const componentTemplate = renderComponentIcons(originalSummary, { showCheckboxes: true, checkedTypes: pasteState.checkedTypes }, onSlotClick);
  const hasSellOption = refs.modal.dataset.hasSellOption === "true";
  const totalSellValue = Number(refs.modal.dataset.sellValue || 0);

  const sellOptionTemplate = hasSellOption
    ? SellOption({ currentSellValue: totalSellValue, checked: pasteState.sellExisting, onSellChange })
    : html``;

  const costTemplate = CostDisplay({
    breakdown: validationState.breakdown,
    affordability: {
      canAffordMoney: validationState.canAffordMoney,
      canAffordEp: validationState.canAffordEp,
      currentMoneyNum: validationState.currentMoneyNum,
      currentEpNum: validationState.currentEpNum,
    },
  });

  render(html`${componentTemplate}${sellOptionTemplate}${costTemplate}`, refs.modalCost);

  refs.confirmBtn.disabled = !validationState.canPaste;
  const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
  if (partialBtnRef) {
    partialBtnRef.disabled = !validationState.hasPartial;
  }

  const previewCanvas = document.getElementById("reactor_copy_paste_preview");
  if (previewCanvas) {
    const affordableSet = bp().getAffordableSet(validationState.affordableLayout);
    bp().renderPreview(parsed, previewCanvas, affordableSet);
  }
}

export function setupPasteAction(ui, bp, refs) {
  const { pasteBtn, modal, modalText, confirmBtn } = refs;
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");

  if (!modal._hasValtioSub) {
    modal._hasValtioSub = true;
    subscribe(pasteState, () => renderPasteModalContent(ui, bp, refs));
  }

  modalText.oninput = (e) => {
    pasteState.textareaData = e.target.value.trim();
    pasteState.checkedTypes = {};
  };

  confirmBtn.onclick = () => handleConfirmPaste(ui, bp);
  if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui, bp);

  ui._showPasteModalWithData = (data) => {
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = bp().deserialize(data);
    const summary = bp().getPartSummary(layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = bp().getCurrentSellValue();
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);

    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    renderPasteModalContent(ui, bp, refs);
  };

  pasteBtn.onclick = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    ui._showPasteModalWithData(result.success ? result.data : "");
  };
}
