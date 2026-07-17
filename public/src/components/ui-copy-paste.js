import { html, render, nothing } from "lit-html";
import { proxy, subscribe, modalUi } from "../store.js";
import { MODAL_IDS } from "../modalIds.js";
import { serializeSave, StorageUtils } from "../storage/index.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { serializeReactor } from "../layout/reactor-codec.js";
import { clipToGrid, computeBlueprintDiff, calculateLayoutCost } from "../domain/blueprint.js";
import { encodeLayoutShare } from "../core/layoutShareCodec.js";
import { showStatusNotice } from "./ui-notices.js";
import { addToMyLayouts } from "./ui-layout-storage.js";
import { renderComponentIcons } from "./ui-blueprint-helpers.js";
import {
  deserializeReactor,
  deserializeReactorInput,
  filterLayoutByCheckedTypes,
  calculateLayoutDiffBreakdown,
  calculateCurrentSellValue,
  validatePasteResources,
  buildPasteState,
} from "../domain/blueprint.js";
import {
  buildPartSummary,
  renderLayoutPreview,
} from "./ui-reactor-layout.js";
import { drainGridIntentsAsync } from "../bridge/bridge-intents.js";
import { styleMap } from "../dom/lit.js";
import {
  copyPasteNoPartsTemplate,
  copyPasteCostDisplayTemplate,
  copyPasteSellOptionTemplate,
  copyPasteModalCostContentTemplate,
  copyPasteStatusMessageTemplate,
  copyPasteRenderedContentTemplate,
  copyPasteSelectedPartsCostTemplate,
  copyPasteDialogShellTemplate,
} from "../templates/uiComponentsTemplates.js";

function startRenderLoop(ui, timestamp = 0) {
  if (typeof ui.startRenderLoop === 'function') ui.startRenderLoop(timestamp);
}
const MODAL_HIDE_DELAY_MS = 1000;
const MODAL_COST_MARGIN_TOP_PX = 10;
const MODAL_SECTION_MARGIN_TOP_PX = 15;
const MODAL_BORDER_RADIUS_PX = 4;
const CONFIRM_BTN_BG = "var(--canvas-confirm)";
const MODAL_GAP_PX = 4;
const MODAL_PADDING_PX = 10;
const MODAL_INNER_GAP_PX = 8;
const JSON_INDENT_SPACES = 2;
const MODAL_BORDER_COLOR = "var(--neutral-500)";
const MODAL_BG_DARK = "var(--alert-panel-bg)";
const COLOR_GOLD = "rgb(255 215 0)";
const COLOR_SUCCESS = "var(--status-success)";
const COLOR_ERROR = "var(--canvas-cannot-afford)";
const COLOR_AFFORD = "var(--canvas-afford)";
const COLOR_CANNOT_AFFORD = "var(--canvas-cannot-afford)";
const OPACITY_VISIBLE = "1";
const OPACITY_HIDDEN = "0";
const Z_INDEX_VISIBLE = "1";
const HEIGHT_COLLAPSED = "0";

const pasteState = proxy({
  textareaData: "",
  checkedTypes: {},
  sellExisting: false,
});

function setModalTextareaVisibility(modalText, isPaste) {
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
    return copyPasteNoPartsTemplate({
      messageStyle: styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_ERROR, fontWeight: "bold" }),
    });
  }
  const moneyColor = affordability.canAffordMoney ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const epColor = affordability.canAffordEp ? COLOR_AFFORD : COLOR_CANNOT_AFFORD;
  const containerStyle = styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, display: "flex", flexDirection: "column", gap: `${MODAL_GAP_PX}px` });
  return copyPasteCostDisplayTemplate({
    containerStyle,
    showMoney: costMoney > 0,
    moneyStyle: styleMap({ color: moneyColor, fontWeight: "bold" }),
    moneyText: `Money: $${fmt(costMoney)} needed (you have $${fmt(affordability.currentMoneyNum)})`,
    showEp: costEp > 0,
    epStyle: styleMap({ color: epColor, fontWeight: "bold" }),
    epText: `EP: ${fmt(costEp)} needed (you have ${fmt(affordability.currentEpNum)})`,
  });
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
  return copyPasteSellOptionTemplate({
    boxStyle,
    labelStyle,
    inputStyle: styleMap({ margin: 0 }),
    checked,
    onSellChange,
    textStyle: styleMap({ color: COLOR_GOLD }),
    text: `Sell existing grid for $${fmt(currentSellValue)}`,
  });
}

function renderModalCostContent(modalCost, cost, summary, ui, options, onSlotClick) {
  const componentTemplate = summary.length ? renderComponentIcons(summary, options, onSlotClick) : html``;
  const costTemplate = cost > 0 ? html`<div style=${styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" })}>Total Cost: $${fmt(cost)}</div>` : html``;
  render(copyPasteModalCostContentTemplate({ componentTemplate, costTemplate }), modalCost);
}

function syncModalDialogOpen(root, open) {
  if (!root || typeof HTMLDialogElement === "undefined" || !(root instanceof HTMLDialogElement)) return;
  try {
    if (open && !root.open) root.showModal();
    else if (!open && root.open) root.close();
  } catch (_) {}
}

export function getCopyPasteRefs(root = document.getElementById("modal-root")) {
  if (!root) return null;
  const modal = root.querySelector("#reactor_copy_paste_modal");
  const modalTitle = root.querySelector("#reactor_copy_paste_modal_title");
  const modalText = root.querySelector("#reactor_copy_paste_text");
  const modalCost = root.querySelector("#reactor_copy_paste_cost");
  const closeBtn = root.querySelector("#reactor_copy_paste_close_btn");
  const confirmBtn = root.querySelector("#reactor_copy_paste_confirm_btn");
  if (!modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) return null;
  return { modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
}

export function openCopyPasteDialogHost() {
  const root = document.getElementById("modal-root");
  if (!root) return null;
  render(copyPasteDialogShellTemplate(), root);
  syncModalDialogOpen(root, true);
  return getCopyPasteRefs(root);
}

function showModal(ui, refs, opts) {
  modalUi.activeModal = MODAL_IDS.COPY_PASTE;
  modalUi.payload = opts;
  const liveRefs = refs ?? openCopyPasteDialogHost();
  if (!liveRefs) return;
  const { modal, modalTitle, modalText, modalCost, confirmBtn, closeBtn } = liveRefs;
  const { title, data, cost, action, canPaste = false, summary = [], ...options } = opts;
  const confirmLabel = action === "copy" ? "Copy" : "Paste";
  modalTitle.textContent = title;
  confirmBtn.textContent = confirmLabel;
  modalText.value = data;
  setModalTextareaVisibility(modalText, action === "paste");
  const wasPaused = !!ui.game.state.pause;
  if (!wasPaused) ui.game.pause();
  renderModalCostContent(modalCost, cost, summary, ui, options);
  if (action === "copy") {
    modalText.readOnly = true;
    modalText.placeholder = "Reactor layout data (read-only)";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = false;
  } else if (action === "paste") {
    modalText.readOnly = false;
    modalText.placeholder = (data && data.trim()) ? "Paste reactor layout JSON data here..." : "Enter reactor layout JSON data manually...";
    confirmBtn.classList.remove("hidden");
    confirmBtn.disabled = !canPaste;
  }
  const previewWrap = document.getElementById("reactor_copy_paste_preview_wrap");
  const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
  if (previewWrap) previewWrap.classList.toggle("hidden", action !== "paste");
  if (partialBtn) partialBtn.classList.toggle("hidden", action !== "paste");
  modal.dataset.previousPauseState = wasPaused;
  closeBtn.onclick = () => hideCopyPasteModal(ui);
  const dialogRoot = document.getElementById("modal-root");
  if (dialogRoot && !dialogRoot._copyPasteBackdropBound) {
    dialogRoot._copyPasteBackdropBound = true;
    dialogRoot.addEventListener("click", (e) => {
      if (e.target === dialogRoot) hideCopyPasteModal(ui);
    });
  }
}

export function setupCopyAction(ui, { copyBtn, getRefs }) {
  const game = ui.game;

  copyBtn.onclick = () => {
    const refs = getRefs();
    if (!refs) return;
    const { modalCost, confirmBtn } = refs;
    const data = serializeReactor(game);
    const layout = deserializeReactor(data);
    const cost = calculateLayoutCost(game, layout);
    const summary = buildPartSummary(game.partset, layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    showModal(ui, refs, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });

    const updateCopySummary = (layout, summary, checkedTypes) => {
      const onSlotClick = (ids, checked) => {
        ids.forEach(id => { checkedTypes[id] = !checked; });
        updateCopySummary(layout, summary, checkedTypes);
      };
      const componentTemplate = renderComponentIcons(summary, { showCheckboxes: true, checkedTypes }, onSlotClick);
      const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
      const filteredCost = calculateLayoutCost(game, filteredLayout);
      const costTemplate = copyPasteSelectedPartsCostTemplate({
        costStyle: styleMap({ marginTop: `${MODAL_COST_MARGIN_TOP_PX}px`, color: COLOR_SUCCESS, fontWeight: "bold" }),
        text: `Selected Parts Cost: $${fmt(filteredCost)}`,
      });
      render(html`${componentTemplate}${costTemplate}`, modalCost);
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
    };

    updateCopySummary(layout, summary, checkedTypes);

    confirmBtn.onclick = async () => {
      if (!game) return;
      const filteredLayout = filterLayoutByCheckedTypes(layout, checkedTypes);
      const rows = game.rows;
      const cols = game.cols;
      const parts = filteredLayout.flatMap((row, r) => (row || []).map((cell, c) => (cell && cell.id) ? { r, c, t: cell.t, id: cell.id, lvl: cell.lvl || 1 } : null).filter(Boolean));
      const compactLayout = { size: { rows, cols }, parts };
      const filteredData = JSON.stringify(compactLayout, null, JSON_INDENT_SPACES);
      const shareCode = encodeLayoutShare(filteredLayout, game.partset);
      const clipboardPayload = shareCode || filteredData;
      const result = await ui.clipboardUI.writeToClipboard(clipboardPayload);
      const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
      if (result.success) {
        addToMyLayouts(name.trim() || defaultName, filteredData);
        confirmBtn.textContent = "Copied!";
      } else {
        confirmBtn.textContent = "Failed to Copy";
      }
      setTimeout(() => hideCopyPasteModal(ui), MODAL_HIDE_DELAY_MS);
    };

    confirmBtn.disabled = false;
    confirmBtn.classList.remove("hidden");
    confirmBtn.style.backgroundColor = CONFIRM_BTN_BG;
    confirmBtn.style.cursor = "pointer";
  };
}

function showBlueprintDeficitToast(result) {
  const parts = [];
  if (result.moneyShort > 0) parts.push(`$${fmt(result.moneyShort)}`);
  if (result.epShort > 0) parts.push(`${fmt(result.epShort)} EP`);
  if (parts.length === 0 && result.breakdown) {
    const b = result.breakdown;
    if (b.money > 0) parts.push(`$${fmt(b.money)}`);
    if (b.ep > 0) parts.push(`${fmt(b.ep)} EP`);
  }
  showStatusNotice({
    tag: "Blueprint",
    body: parts.length ? `Need ${parts.join(" + ")} more` : "Not enough resources",
  });
}

function downloadTextFile(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function tickSeriesToCsv(series) {
  if (!series?.length) return "";
  const headers = Object.keys(series[0]);
  const lines = [headers.join(",")];
  for (let i = 0; i < series.length; i++) {
    lines.push(headers.map((h) => series[i][h]).join(","));
  }
  return lines.join("\n");
}

function queueBlueprintPaste(game, layout, options = {}) {
  return drainGridIntentsAsync(game, game.engine, [{
    action: "APPLY_BLUEPRINT",
    payload: {
      layout,
      sellExisting: !!options.sellExisting,
      skipCostDeduction: options.skipCostDeduction === true,
      partial: options.partial === true,
    },
  }]);
}

function handleConfirmPaste(ui) {
  const g = ui.game;
  const layoutToPaste = deserializeReactorInput(pasteState.textareaData, g);
  if (!layoutToPaste) {
    logger.log('warn', 'ui', 'Please paste reactor layout data into the text area.');
    return;
  }
  const filtered = filterLayoutByCheckedTypes(layoutToPaste, pasteState.checkedTypes);
  const breakdown = calculateLayoutDiffBreakdown(g, filtered);
  const sellCredit = pasteState.sellExisting ? calculateCurrentSellValue(g.tileset) : 0;
  const validation = validatePasteResources(breakdown, sellCredit, g.state.current_money, g.state.current_exotic_particles ?? 0);

  if (!validation.valid) {
    if (validation.reason === "insufficient_resources") {
      const money = typeof g.state.current_money?.toNumber === "function" ? g.state.current_money.toNumber() : Number(g.state.current_money ?? 0);
      const ep = typeof g.state.current_exotic_particles?.toNumber === "function" ? g.state.current_exotic_particles.toNumber() : Number(g.state.current_exotic_particles ?? 0);
      showBlueprintDeficitToast({
        moneyShort: Math.max(0, breakdown.money - sellCredit - money),
        epShort: Math.max(0, breakdown.ep - ep),
        breakdown,
      });
    } else {
      logger.log('warn', 'ui', validation.reason === "no_parts" ? "Invalid layout: no parts found." : "Not enough resources for full layout.");
    }
    return;
  }
  queueBlueprintPaste(g, clipToGrid(filtered, g.rows, g.cols), { sellExisting: pasteState.sellExisting }).then(() => {
    ui.gridCanvasRenderer?.markStaticDirty?.();
    startRenderLoop(ui, 0);
  });
  hideCopyPasteModal(ui);
}

function handlePartialPaste(ui) {
  const g = ui.game;
  const layoutToPaste = deserializeReactorInput(pasteState.textareaData, g);
  if (!layoutToPaste) return;
  const filtered = filterLayoutByCheckedTypes(layoutToPaste, pasteState.checkedTypes);
  queueBlueprintPaste(g, clipToGrid(filtered, g.rows, g.cols), { sellExisting: pasteState.sellExisting, partial: true }).then(() => {
    ui.gridCanvasRenderer?.markStaticDirty?.();
    startRenderLoop(ui, 0);
  });
  hideCopyPasteModal(ui);
}

function renderPasteModalContent(ui, refs) {
  const g = ui.game;
  const parsed = deserializeReactorInput(pasteState.textareaData, g);
  if (!parsed) {
    const msg = !pasteState.textareaData ? "Enter reactor layout JSON data in the text area above" : "Invalid layout data - please check the JSON format";
    render(copyPasteStatusMessageTemplate({ message: msg }), refs.modalCost);
    refs.confirmBtn.disabled = true;
    const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
    if (partialBtnRef) partialBtnRef.disabled = true;
    return;
  }

  const originalSummary = buildPartSummary(g.partset, parsed);
  originalSummary.forEach(item => {
    if (pasteState.checkedTypes[item.id] === undefined) {
      pasteState.checkedTypes[item.id] = true;
    }
  });

  const validationState = buildPasteState(parsed, pasteState.checkedTypes, g, g.tileset, pasteState.sellExisting);
  if (!validationState.valid) {
    render(copyPasteStatusMessageTemplate({ message: validationState.invalidMessage }), refs.modalCost);
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

  render(
    copyPasteRenderedContentTemplate({
      componentTemplate,
      sellOptionTemplate,
      costTemplate,
    }),
    refs.modalCost
  );

  refs.confirmBtn.disabled = !validationState.canPaste;
  const partialBtnRef = document.getElementById("reactor_copy_paste_partial_btn");
  if (partialBtnRef) {
    partialBtnRef.disabled = !validationState.hasPartial;
  }

  const previewCanvas = document.getElementById("reactor_copy_paste_preview");
  if (previewCanvas) {
    const diff = g ? computeBlueprintDiff(g, validationState.filteredLayout) : { unchanged: [], toPlace: [] };
    const affordableSet = new Set(
      diff.unchanged.map((u) => `${u.r},${u.c}`)
    );
    (validationState.affordablePlacements || []).forEach((p) => affordableSet.add(`${p.r},${p.c}`));
    renderLayoutPreview(g.partset, parsed, previewCanvas, validationState.canPaste ? null : affordableSet);
  }
}

export function setupPasteAction(ui, { pasteBtn, getRefs }) {
  const g = ui.game;

  const bindPasteModalListeners = (refs) => {
    const { modal, modalText, confirmBtn } = refs;
    const partialBtn = document.getElementById("reactor_copy_paste_partial_btn");
    if (modal._pasteListenersBound) return;
    modal._pasteListenersBound = true;
    subscribe(pasteState, () => {
      const liveRefs = getCopyPasteRefs();
      if (liveRefs) renderPasteModalContent(ui, liveRefs);
    });
    modalText.oninput = (e) => {
      pasteState.textareaData = e.target.value.trim();
      pasteState.checkedTypes = {};
    };
    confirmBtn.onclick = () => handleConfirmPaste(ui);
    if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui);
  };

  ui._showPasteModalWithData = (data) => {
    const refs = getRefs();
    if (!refs) return;
    bindPasteModalListeners(refs);
    const { modal } = refs;
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = deserializeReactorInput(data, g);
    const summary = buildPartSummary(g.partset, layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = calculateCurrentSellValue(g.tileset);
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    modal.dataset.hasSellOption = String(hasExistingParts);
    modal.dataset.sellValue = String(currentSellValue);

    showModal(ui, refs, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    renderPasteModalContent(ui, refs);
  };

  pasteBtn.onclick = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    ui._showPasteModalWithData(result.success ? result.data : "");
  };
}


export class CopyPasteUI {
  constructor(ui) {
    this.ui = ui;
  }

  init() {
    const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
    const toggleBtn = document.getElementById("reactor_copy_paste_toggle");
    const copyBtn = document.getElementById("reactor_copy_btn");
    const pasteBtn = document.getElementById("reactor_paste_btn");
    const deselectBtn = document.getElementById("reactor_deselect_btn");
    const dropperBtn = document.getElementById("reactor_dropper_btn");
    const getRefs = () => getCopyPasteRefs() ?? openCopyPasteDialogHost();

    if (toggleBtn) {
      toggleBtn.onclick = () => {
        const uiState = this.ui.uiState;
        if (!uiState) return;
        uiState.copy_paste_collapsed = !uiState.copy_paste_collapsed;
        StorageUtils.set("reactor_copy_paste_collapsed", uiState.copy_paste_collapsed);
      };
    }

    this.setupBlueprintPlannerControls();

    if (!copyBtn || !pasteBtn) return;

    if (deselectBtn) {
      deselectBtn.onclick = () => {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.ui.stateManager.setClickedPart(null);
      };
    }

    if (dropperBtn) {
      dropperBtn.onclick = () => {
        this.ui._dropperModeActive = !this.ui._dropperModeActive;
        dropperBtn.classList.toggle("on", this.ui._dropperModeActive);
      };
    }

    setupCopyAction(this.ui, { copyBtn, getRefs });
    setupPasteAction(this.ui, { pasteBtn, getRefs });
  }

  open(data) {
    if (typeof this.ui._showPasteModalWithData === "function") this.ui._showPasteModalWithData(data ?? "");
  }

  setupCopyStateButton() {
    const ui = this.ui;
    const copyStateBtn = document.getElementById("copy_state_btn");
    if (!copyStateBtn || !ui.uiState || !ui.game?.saveManager) return;
    copyStateBtn.onclick = async () => {
      try {
        const gameStateObject = await ui.game.saveManager.getSaveState();
        const gameStateString = serializeSave(gameStateObject);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(gameStateString);
        ui.uiState.copy_state_feedback = "Copied!";
      } catch (_) {
        ui.uiState.copy_state_feedback = "Error!";
      }
      setTimeout(() => {
        if (ui.uiState) ui.uiState.copy_state_feedback = null;
      }, 2000);
    };
  }

  pasteReactorLayout(layout, options = {}) {
    const ui = this.ui;
    if (!layout || !ui.game) return Promise.resolve();
    return queueBlueprintPaste(ui.game, layout, options).then(() => {
      ui.gridCanvasRenderer?.markStaticDirty?.();
      startRenderLoop(ui, 0);
    });
  }

  setupBlueprintPlannerControls() {
    const ui = this.ui;
    const game = ui.game;
    const toggle = document.getElementById("reactor_blueprint_toggle");
    const applyBtn = document.getElementById("blueprint_planner_apply");
    const partialBtn = document.getElementById("blueprint_planner_partial");
    const exportBtn = document.getElementById("blueprint_planner_export");
    const discardBtn = document.getElementById("blueprint_planner_discard");
    if (!toggle || !game) return;
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
    let blueprintHudTimer = null;
    const syncHud = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = setTimeout(async () => {
        blueprintHudTimer = null;
        const pEl = document.getElementById("blueprint_planner_power");
        const hEl = document.getElementById("blueprint_planner_net_heat");
        const epEl = document.getElementById("blueprint_planner_ep");
        const sEl = document.getElementById("blueprint_planner_stability");
        if (!game.blueprintPlanner?.active) {
          if (pEl) pEl.textContent = "";
          if (hEl) hEl.textContent = "";
          if (epEl) epEl.textContent = "";
          if (sEl) sEl.textContent = "";
          return;
        }
        let pwr = null;
        let net = null;
        let ep = null;
        if (typeof game.requestBlueprintProjectionSample === "function") {
          const res = await game.requestBlueprintProjectionSample();
          const sample = res?.projectionPlannerSample;
          if (sample && typeof sample.stats_power === "number") pwr = sample.stats_power;
          if (sample && typeof sample.stats_net_heat === "number") net = sample.stats_net_heat;
          if (sample && typeof sample.stats_ep === "number") ep = sample.stats_ep;
        }
        if (pEl) pEl.textContent = pwr != null ? `Pwr ${fmt(pwr ?? 0, 0)}/t` : "";
        if (hEl) hEl.textContent = net != null ? `\u0394Heat ${fmt(net ?? 0, 0)}/t` : "";
        if (epEl) epEl.textContent = ep != null && ep > 0 ? `EP ${fmt(ep, 2)}/t` : "";
        if (sEl) {
          if (net == null) sEl.textContent = "";
          else if (net < 0) sEl.textContent = "Stable";
          else if (net > 0) sEl.textContent = "Net heating";
          else sEl.textContent = "Balanced";
        }
        ui.gridCanvasRenderer?.markStaticDirty?.();
      }, 30);
    };
    const onChanged = () => {
      if (ui.uiState?.copy_paste_display) {
        ui.uiState.copy_paste_display.blueprintPlannerActive = !!game.blueprintPlanner?.active;
      }
      syncHud();
    };
    const onDeficit = (result) => showBlueprintDeficitToast(result);
    if (game.on) {
      game.on("blueprintApplyDeficit", onDeficit);
    }
    let blueprintUnsub = null;
    if (game.blueprintPlanner) {
      blueprintUnsub = subscribe(game.blueprintPlanner, onChanged);
    }
    this._teardownBlueprintPlanner = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = null;
      if (blueprintUnsub) {
        try { blueprintUnsub(); } catch (_) {}
        blueprintUnsub = null;
      }
      if (game.off) {
        game.off("blueprintApplyDeficit", onDeficit);
      }
      this._teardownBlueprintPlanner = null;
    };
    const syncPlanToggle = () => {
      const active = !!ui.uiState?.copy_paste_display?.blueprintPlannerActive;
      toggle.setAttribute("aria-pressed", String(active));
      toggle.title = active ? "Blueprint planning mode on" : "Live reactor mode";
    };
    toggle.onclick = () => {
      game.toggleBlueprintPlanner?.();
      syncHud();
      syncPlanToggle();
    };
    syncPlanToggle();
    const afterApply = () => {
      syncHud();
      startRenderLoop(ui, 0);
      ui.gridCanvasRenderer?.markStaticDirty?.();
    };
    if (applyBtn) {
      applyBtn.onclick = () => {
        game.applyBlueprintPlannerLayout?.().then(afterApply);
      };
    }
    if (partialBtn) {
      partialBtn.onclick = () => {
        game.applyBlueprintPlannerLayout?.({ partial: true }).then(afterApply);
      };
    }
    if (exportBtn) {
      exportBtn.onclick = async () => {
        const res = await game.requestBlueprintProjectionSample?.({ recordTicks: true });
        const series = res?.projectionPlannerSample?.tick_series;
        if (!series?.length) return;
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        downloadTextFile(`blueprint-ticks-${stamp}.json`, JSON.stringify(series, null, 2), "application/json");
        downloadTextFile(`blueprint-ticks-${stamp}.csv`, tickSeriesToCsv(series), "text/csv");
      };
    }
    if (discardBtn) {
      discardBtn.onclick = () => {
        game.clearBlueprintPlannerSlots?.();
        syncHud();
      };
    }
    this.setupLayoutCompareControls();
  }

  setupLayoutCompareControls() {
    const ui = this.ui;
    const game = ui.game;
    const openBtn = document.getElementById("reactor_compare_layouts_btn");
    const modal = document.getElementById("layout_compare_modal");
    const closeBtn = document.getElementById("layout_compare_close_btn");
    const runBtn = document.getElementById("layout_compare_run_btn");
    const resultsEl = document.getElementById("layout_compare_results");
    if (!openBtn || !modal || !game) return;
    const hide = () => modal.classList.add("hidden");
    const show = () => modal.classList.remove("hidden");
    openBtn.onclick = show;
    if (closeBtn) closeBtn.onclick = hide;
    modal.onclick = (e) => { if (e.target === modal) hide(); };
    if (!runBtn || !resultsEl) return;
    runBtn.onclick = async () => {
      const aRaw = document.getElementById("layout_compare_a")?.value?.trim() ?? "";
      const bRaw = document.getElementById("layout_compare_b")?.value?.trim() ?? "";
      const layoutA = deserializeReactorInput(aRaw, game);
      const layoutB = deserializeReactorInput(bRaw, game);
      if (!layoutA || !layoutB) {
        resultsEl.textContent = "Invalid layout A or B.";
        return;
      }
      resultsEl.textContent = "Running steady-state sandbox…";
      const [resA, resB] = await Promise.all([
        game.requestLayoutProjectionSample?.(clipToGrid(layoutA, game.rows, game.cols)),
        game.requestLayoutProjectionSample?.(clipToGrid(layoutB, game.rows, game.cols)),
      ]);
      const sA = resA?.projectionPlannerSample;
      const sB = resB?.projectionPlannerSample;
      if (!sA || !sB) {
        resultsEl.textContent = "Sandbox unavailable (worker offline).";
        return;
      }
      const row = (label, key, digits = 0) => {
        const a = sA[key] ?? 0;
        const b = sB[key] ?? 0;
        const d = b - a;
        const sign = d > 0 ? "+" : "";
        return `${label}: A ${fmt(a, digits)} | B ${fmt(b, digits)} | Î” ${sign}${fmt(d, digits)}`;
      };
      resultsEl.innerHTML = [
        row("Power/tick", "stats_power"),
        row("Net heat/tick", "stats_net_heat"),
        row("EP/tick", "stats_ep", 2),
      ].join("<br>");
    };
  }

  teardownBlueprintPlanner() {
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
  }
}

export function hideCopyPasteModal(ui) {
  const root = document.getElementById("modal-root");
  const modal = root?.querySelector("#reactor_copy_paste_modal");
  const prevPauseState = modal?.dataset?.previousPauseState;
  modalUi.activeModal = null;
  modalUi.payload = null;
  if (root) {
    render(nothing, root);
    syncModalDialogOpen(root, false);
  }
  if (prevPauseState != null && ui?.game) {
    ui.game.onToggleStateChange?.("pause", prevPauseState === "true");
  }
}
