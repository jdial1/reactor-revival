import { safeCall } from "../../core/teardown.js";
import { html, render, nothing } from "lit-html";
import { proxy, subscribe, modalUi } from "../../store.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";
import { serializeSave, StorageUtils } from "../../storage/index.js";
import { numFormat as fmt } from "../../core/numbers.js";
import { logger } from "../../core/logger.js";
import { serializeReactor } from "../../domain/reactor-codec.js";
import {
  clipToGrid,
  computeBlueprintDiff,
  calculateLayoutCost,
  deserializeReactor,
  deserializeReactorInput,
  filterLayoutByCheckedTypes,
  calculateLayoutDiffBreakdown,
  calculateCurrentSellValue,
  validatePasteResources,
  buildPasteState,
} from "../../domain/blueprint.js";
import { encodeLayoutShare } from "../../core/layoutShareCodec.js";
import { showStatusNotice } from "../shell/ui-notices.js";
import { addToMyLayouts } from "./ui-layout-storage.js";
import { renderComponentIcons } from "./ui-blueprint-helpers.js";
import {
  buildPartSummary,
  renderLayoutPreview,
} from "../grid/ui-reactor-layout.js";
import { dispatchPlayerIntent } from "../../bridge/bridge-intents.js";
import { classMap, styleMap } from "../../dom/lit.js";
import { getUiElement } from "../shell/page-dom.js";
import {
  COPY_PASTE_MODAL_HIDE_DELAY_MS as MODAL_HIDE_DELAY_MS,
  COPY_PASTE_MODAL_COST_MARGIN_TOP_PX as MODAL_COST_MARGIN_TOP_PX,
  COPY_PASTE_MODAL_SECTION_MARGIN_TOP_PX as MODAL_SECTION_MARGIN_TOP_PX,
  COPY_PASTE_MODAL_BORDER_RADIUS_PX as MODAL_BORDER_RADIUS_PX,
  COPY_PASTE_MODAL_GAP_PX as MODAL_GAP_PX,
  COPY_PASTE_MODAL_PADDING_PX as MODAL_PADDING_PX,
  COPY_PASTE_MODAL_INNER_GAP_PX as MODAL_INNER_GAP_PX,
} from "../../constants/ui-timing.js";
import {
  copyPasteNoPartsTemplate,
  copyPasteCostDisplayTemplate,
  copyPasteSellOptionTemplate,
  copyPasteModalCostContentTemplate,
  copyPasteStatusMessageTemplate,
  copyPasteRenderedContentTemplate,
  copyPasteSelectedPartsCostTemplate,
  copyPasteDialogShellTemplate,
} from "../../templates/uiComponentsTemplates.js";

function startRenderLoop(ui, timestamp = 0) {
  if (typeof ui.startRenderLoop === 'function') ui.startRenderLoop(timestamp);
}
const CONFIRM_BTN_BG = "var(--canvas-confirm)";
const CONFIRM_BTN_DANGER = "var(--canvas-confirm-danger)";
const JSON_INDENT_SPACES = 2;
const MODAL_BORDER_COLOR = "var(--neutral-500)";
const MODAL_BG_DARK = "var(--alert-panel-bg)";
const COLOR_GOLD = "rgb(255 215 0)";
const COLOR_SUCCESS = "var(--status-success)";
const COLOR_ERROR = "var(--canvas-cannot-afford)";
const COLOR_AFFORD = "var(--canvas-afford)";
const COLOR_CANNOT_AFFORD = "var(--canvas-cannot-afford)";

const pasteState = proxy({
  textareaData: "",
  checkedTypes: {},
  sellExisting: false,
});

export function buildCopyPasteShellDisplay({
  action = "paste",
  title = "Reactor Layout",
  confirmLabel = "Action",
  confirmDisabled = false,
  confirmHidden = false,
  previousPauseState = "",
  confirmDanger = false,
} = {}) {
  const textareaVisible = action === "paste" || action === "copy";
  const isPaste = action === "paste";
  return {
    title,
    confirmLabel,
    confirmDisabled,
    previousPauseState,
    textareaReadOnly: action === "copy" || action === "sell",
    textareaPlaceholder: action === "copy"
      ? "Reactor layout data (read-only)"
      : "Paste reactor layout data here...",
    textareaClass: classMap({ hidden: !textareaVisible || action === "sell" }),
    textareaStyle: styleMap(
      action === "sell" || !textareaVisible
        ? { display: "none", visibility: "hidden", opacity: "0", height: "0", overflow: "hidden" }
        : { display: "block", visibility: "visible", opacity: "1", position: "relative", zIndex: "1" }
    ),
    previewClass: classMap({ hidden: !isPaste }),
    confirmClass: classMap({ hidden: confirmHidden }),
    confirmStyle: styleMap({
      backgroundColor: confirmDanger ? CONFIRM_BTN_DANGER : CONFIRM_BTN_BG,
      cursor: "pointer",
    }),
    partialClass: classMap({ hidden: !isPaste }),
  };
}

function renderCopyPasteShell(root, display) {
  render(copyPasteDialogShellTemplate(display), root);
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

export function syncModalDialogOpen(root, open) {
  if (!root || typeof HTMLDialogElement === "undefined" || !(root instanceof HTMLDialogElement)) return;
  safeCall(() => {
    if (open && !root.open) root.showModal();
    else if (!open && root.open) root.close();
  }, "syncModalDialogOpen");
}

export function getCopyPasteRefs(_root) {
  const modal = getUiElement(null, "reactor_copy_paste_modal");
  const modalTitle = getUiElement(null, "reactor_copy_paste_modal_title");
  const modalText = getUiElement(null, "reactor_copy_paste_text");
  const modalCost = getUiElement(null, "reactor_copy_paste_cost");
  const closeBtn = getUiElement(null, "reactor_copy_paste_close_btn");
  const confirmBtn = getUiElement(null, "reactor_copy_paste_confirm_btn");
  if (!modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) return null;
  return { modal, modalTitle, modalText, modalCost, closeBtn, confirmBtn };
}

export function openCopyPasteDialogHost(display = buildCopyPasteShellDisplay()) {
  const root = getUiElement(null, "modal-root");
  if (!root) return null;
  renderCopyPasteShell(root, display);
  syncModalDialogOpen(root, true);
  return getCopyPasteRefs(root);
}

function showModal(ui, _refs, opts) {
  modalUi.activeModal = MODAL_IDS.COPY_PASTE;
  modalUi.payload = opts;
  const { title, data, cost, action, canPaste = false, summary = [], ...options } = opts;
  const confirmLabel = action === "copy" ? "Copy" : "Paste";
  const wasPaused = !!ui.game.state.pause;
  if (!wasPaused) ui.game.pause();
  const display = buildCopyPasteShellDisplay({
    action,
    title,
    confirmLabel,
    confirmDisabled: action === "paste" ? !canPaste : false,
    previousPauseState: String(wasPaused),
  });
  if (action === "paste") {
    display.textareaPlaceholder = (data && data.trim())
      ? "Paste reactor layout JSON data here..."
      : "Enter reactor layout JSON data manually...";
  }
  const root = getUiElement(null, "modal-root");
  if (!root) return null;
  renderCopyPasteShell(root, display);
  syncModalDialogOpen(root, true);
  const liveRefs = getCopyPasteRefs(root);
  if (!liveRefs) return null;
  const { modalText, modalCost, closeBtn } = liveRefs;
  modalText.value = data ?? "";
  renderModalCostContent(modalCost, cost, summary, ui, options);
  closeBtn.onclick = () => hideCopyPasteModal(ui);
  if (!root._copyPasteBackdropBound) {
    root._copyPasteBackdropBound = true;
    const ac = new AbortController();
    if (!ui._unmounts) ui._unmounts = [];
    ui._unmounts.push(() => {
      safeCall(() => { ac.abort(); });
      root._copyPasteBackdropBound = false;
    });
    root.addEventListener("click", (e) => {
      if (e.target === root) hideCopyPasteModal(ui);
    }, { signal: ac.signal });
  }
  return liveRefs;
}

function setupCopyAction(ui, { copyBtn, getRefs }) {
  const game = ui.game;

  copyBtn.onclick = () => {
    if (!getRefs()) return;
    const data = serializeReactor(game);
    const layout = deserializeReactor(data);
    const cost = calculateLayoutCost(game, layout);
    const summary = buildPartSummary(game.partset, layout);
    const checkedTypes = {};
    summary.forEach(item => { checkedTypes[item.id] = true; });

    const liveRefs = showModal(ui, null, { title: "Copy Reactor Layout", data, cost, action: "copy", canPaste: false, summary, showCheckboxes: true, checkedTypes });
    if (!liveRefs) return;
    const { modalCost, confirmBtn } = liveRefs;

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
  return dispatchPlayerIntent(game, game.engine, {
    type: "APPLY_BLUEPRINT",
    payload: {
      layout,
      sellExisting: !!options.sellExisting,
      skipCostDeduction: options.skipCostDeduction === true,
      partial: options.partial === true,
    },
  });
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
    const partialBtnRef = getUiElement(null, "reactor_copy_paste_partial_btn");
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
    const partialBtnRef = getUiElement(null, "reactor_copy_paste_partial_btn");
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
  const partialBtnRef = getUiElement(null, "reactor_copy_paste_partial_btn");
  if (partialBtnRef) {
    partialBtnRef.disabled = !validationState.hasPartial;
  }

  const previewCanvas = getUiElement(null, "reactor_copy_paste_preview");
  if (previewCanvas) {
    const diff = g ? computeBlueprintDiff(g, validationState.filteredLayout) : { unchanged: [], toPlace: [] };
    const affordableSet = new Set(
      diff.unchanged.map((u) => `${u.r},${u.c}`)
    );
    (validationState.affordablePlacements || []).forEach((p) => affordableSet.add(`${p.r},${p.c}`));
    renderLayoutPreview(g.partset, parsed, previewCanvas, validationState.canPaste ? null : affordableSet);
  }
}

function setupPasteAction(ui, { pasteBtn, getRefs: _getRefs }) {
  const g = ui.game;

  const bindPasteModalListeners = (refs) => {
    const { modal, modalText, confirmBtn } = refs;
    const partialBtn = getUiElement(null, "reactor_copy_paste_partial_btn");
    if (modal._pasteListenersBound) return;
    modal._pasteListenersBound = true;
    const pasteUnsub = subscribe(pasteState, () => {
      const liveRefs = getCopyPasteRefs();
      if (liveRefs) renderPasteModalContent(ui, liveRefs);
    });
    if (!ui._unmounts) ui._unmounts = [];
    ui._unmounts.push(() => {
      safeCall(() => { pasteUnsub(); });
      modal._pasteListenersBound = false;
    });
    modalText.oninput = (e) => {
      pasteState.textareaData = e.target.value.trim();
      pasteState.checkedTypes = {};
    };
    confirmBtn.onclick = () => handleConfirmPaste(ui);
    if (partialBtn) partialBtn.onclick = () => handlePartialPaste(ui);
  };

  ui._showPasteModalWithData = (data) => {
    pasteState.textareaData = data;
    pasteState.checkedTypes = {};
    pasteState.sellExisting = false;

    const layout = deserializeReactorInput(data, g);
    const summary = buildPartSummary(g.partset, layout || []);
    const title = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
    const currentSellValue = calculateCurrentSellValue(g.tileset);
    const hasExistingParts = ui.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

    const liveRefs = showModal(ui, null, { title, data, cost: 0, action: "paste", canPaste: false, summary, showCheckboxes: true, checkedTypes: {} });
    if (!liveRefs) return;
    liveRefs.modal.dataset.hasSellOption = String(hasExistingParts);
    liveRefs.modal.dataset.sellValue = String(currentSellValue);
    bindPasteModalListeners(liveRefs);
    renderPasteModalContent(ui, liveRefs);
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
    const toggleBtn = getUiElement(null, "reactor_copy_paste_toggle");
    const copyBtn = getUiElement(null, "reactor_copy_btn");
    const pasteBtn = getUiElement(null, "reactor_paste_btn");
    const deselectBtn = getUiElement(null, "reactor_deselect_btn");
    const dropperBtn = getUiElement(null, "reactor_dropper_btn");
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
        this.ui.stateManager.setClickedPart(null);
      };
    }

    if (dropperBtn) {
      dropperBtn.onclick = () => {
        this.ui._dropperModeActive = !this.ui._dropperModeActive;
        const base = dropperBtn.className.replace(/\bon\b/g, "").replace(/\s+/g, " ").trim();
        dropperBtn.className = this.ui._dropperModeActive ? (base ? `${base} on` : "on") : base;
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
    const copyStateBtn = getUiElement(null, "copy_state_btn");
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
    const toggle = getUiElement(null, "reactor_blueprint_toggle");
    const applyBtn = getUiElement(null, "blueprint_planner_apply");
    const partialBtn = getUiElement(null, "blueprint_planner_partial");
    const exportBtn = getUiElement(null, "blueprint_planner_export");
    const discardBtn = getUiElement(null, "blueprint_planner_discard");
    if (!toggle || !game) return;
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
    let blueprintHudTimer = null;
    const syncHud = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = setTimeout(async () => {
        blueprintHudTimer = null;
        const pEl = getUiElement(null, "blueprint_planner_power");
        const hEl = getUiElement(null, "blueprint_planner_net_heat");
        const epEl = getUiElement(null, "blueprint_planner_ep");
        const sEl = getUiElement(null, "blueprint_planner_stability");
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
      game.on("blueprintPlannerChanged", onChanged);
    }
    this._teardownBlueprintPlanner = () => {
      if (blueprintHudTimer) clearTimeout(blueprintHudTimer);
      blueprintHudTimer = null;
      if (game.off) {
        game.off("blueprintApplyDeficit", onDeficit);
        game.off("blueprintPlannerChanged", onChanged);
      }
      this._teardownBlueprintPlanner = null;
    };
    if (!ui._unmounts) ui._unmounts = [];
    ui._unmounts.push(() => {
      if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
    });
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
    const openBtn = getUiElement(null, "reactor_compare_layouts_btn");
    const modal = getUiElement(null, "layout_compare_modal");
    const closeBtn = getUiElement(null, "layout_compare_close_btn");
    const runBtn = getUiElement(null, "layout_compare_run_btn");
    const resultsEl = getUiElement(null, "layout_compare_results");
    if (!openBtn || !modal || !game) return;
    const hide = () => {
      const base = modal.className.replace(/\bhidden\b/g, "").replace(/\s+/g, " ").trim();
      modal.className = base ? `${base} hidden` : "hidden";
    };
    const show = () => {
      modal.className = modal.className.replace(/\bhidden\b/g, "").replace(/\s+/g, " ").trim();
    };
    openBtn.onclick = show;
    if (closeBtn) closeBtn.onclick = hide;
    modal.onclick = (e) => { if (e.target === modal) hide(); };
    if (!runBtn || !resultsEl) return;
    runBtn.onclick = async () => {
      const aRaw = getUiElement(null, "layout_compare_a")?.value?.trim() ?? "";
      const bRaw = getUiElement(null, "layout_compare_b")?.value?.trim() ?? "";
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
        return `${label}: A ${fmt(a, digits)} | B ${fmt(b, digits)} | Δ ${sign}${fmt(d, digits)}`;
      };
      resultsEl.replaceChildren();
      [
        row("Power/tick", "stats_power"),
        row("Net heat/tick", "stats_net_heat"),
        row("EP/tick", "stats_ep", 2),
      ].forEach((line, i) => {
        if (i > 0) resultsEl.appendChild(document.createElement("br"));
        resultsEl.appendChild(document.createTextNode(line));
      });
    };
  }

  teardownBlueprintPlanner() {
    if (typeof this._teardownBlueprintPlanner === "function") this._teardownBlueprintPlanner();
  }
}

export function hideCopyPasteModal(ui) {
  const root = getUiElement(null, "modal-root");
  const modal = getUiElement(null, "reactor_copy_paste_modal");
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
