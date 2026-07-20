import { bumpSnapshotRev } from "../../state/snapshot-rev.js";
import { safeCall } from "../../core/teardown.js";
import { html, render } from "lit-html";
import { MOBILE_BREAKPOINT_PX } from "../../constants/ui-constants.js";
import { logger } from "../../core/logger.js";
import { numFormat as fmt } from "../../core/numbers.js";
import { actions } from "../../store.js";
import { bindLitRenderMulti } from "../../dom/lit-reactive.js";
import { PartButton, partsModuleInfoCardTemplate } from "../upgrades/button-factory.js";
import {
  partsPanelLayoutTemplate,
  partsPanelEmptyTabContentTemplate,
  partsPanelTabContentTemplate,
  quickSelectSlotTemplate,
  upgradeHubDetailEmptyTemplate,
  upgradeHubDetailPanelTemplate,
} from "../../templates/uiComponentsTemplates.js";
import { getUiElement } from "./page-dom.js";
import { classMap, styleMap, repeat } from "../../dom/lit.js";
import { partIconPath, resolvePartDescription } from "../tooltip-stats.js";
import { refreshPartsFromSession } from "../../domain/part.js";

function getPartsSectionElement(ui) {
  return getUiElement(ui, "parts_section");
}

export function updatePartsPanelBodyClass(ui) {
  const partsSection = getPartsSectionElement(ui);
  if (ui.uiState && partsSection) {
    ui.uiState.parts_panel_right_side = partsSection.classList.contains("right-side");
  }
}

export function togglePartsPanelForBuildButton(ui) {
  ui.deviceFeatures?.heavyVibration?.();
  if (ui.game) actions.enqueueEffect(ui.game, { kind: "sfx", id: "metal_clank", a: 0.8, b: -0.7, context: "global" });
  const partsSection = getPartsSectionElement(ui);
  if (partsSection && ui.uiState) {
    ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
    updatePartsPanelBodyClass(ui);
  }
}

const CATEGORY_MAP = {
  power: ["cell", "reflector", "capacitor", "particle_accelerator"],
  heat: ["vent", "heat_exchanger", "heat_inlet", "heat_outlet", "coolant_cell", "reactor_plating", "valve"],
};

const CATEGORY_TO_CONTAINER = {
  coolant_cell: "coolantCells",
  reactor_plating: "reactorPlatings",
  heat_exchanger: "heatExchangers",
  heat_inlet: "heatInlets",
  heat_outlet: "heatOutlets",
  particle_accelerator: "particleAccelerators",
};

function getContainerKey(part) {
  if (CATEGORY_TO_CONTAINER[part.category]) return CATEGORY_TO_CONTAINER[part.category];
  if (part.category === "valve" && part.valve_group) return part.valve_group + "Valves";
  return part.category + "s";
}

function getPartsByContainer(partset, tabId, unlockManager) {
  const categories = CATEGORY_MAP[tabId] || [];
  const byContainer = new Map();
  for (const cat of categories) {
    const parts = partset.getPartsByCategory(cat);
    for (const part of parts) {
      if (unlockManager && !unlockManager.shouldShowPart(part)) continue;
      const key = getContainerKey(part);
      if (!byContainer.has(key)) byContainer.set(key, []);
      byContainer.get(key).push(part);
    }
  }
  return byContainer;
}

export function refreshPartsPanel(ui) {
  refreshPartsFromSession(ui.game?.partset);
  bumpSnapshotRev(ui.game);
}

export function onPartsPanelActiveTabChanged(ui, _tabId) {
  refreshPartsPanel(ui);
}

function createPartTemplateHandlers(ui, partset, unlockManager, selectedPartId) {
  const game = ui.game;
  return (part) => {
    const onClick = () => {
      if (part.affordable) {
        if (ui.help_mode_active && ui.tooltipManager) ui.tooltipManager.show(part, null, true);
        game?.emit?.("partClicked", { part });
        ui.stateManager.setClickedPart(part);
      } else if (ui.tooltipManager) {
        ui.tooltipManager.show(part, null, true);
      }
    };
    const unlocked = !unlockManager || unlockManager.isPartUnlocked(part);
    const opts = {
      locked: !unlocked,
      doctrineLocked: !unlocked && partset?.isPartDoctrineLocked?.(part),
      tierProgress: !unlocked ? `${Math.min(unlockManager?.getPreviousTierCount(part) ?? 0, 10)}/10` : "",
      partActive: part.id === selectedPartId,
      game,
    };
    return PartButton(part, onClick, opts);
  };
}

function buildPartsTabContent(ui, partset, unlockManager, activeTab, powerActive, heatActive) {
  if (!partset) return partsPanelEmptyTabContentTemplate();
  const byContainer = getPartsByContainer(partset, activeTab, unlockManager);
  const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
  const partTemplate = createPartTemplateHandlers(ui, partset, unlockManager, selectedPartId);
  const grid = (id) => html`<div id=${id} class="item-grid">${repeat(byContainer.get(id) ?? [], (p) => p.id, partTemplate)}</div>`;
  return partsPanelTabContentTemplate({ powerActive, heatActive, grid });
}

function buildPartDetailPanelData(part, ui) {
  const iconPath = partIconPath(part);
  if (!iconPath) return null;
  const unlockManager = ui.game?.unlockManager;
  const locked = unlockManager && !unlockManager.isPartUnlocked(part);
  const doctrineLocked = ui.game?.partset?.isPartDoctrineLocked?.(part) ?? false;
  const rawDesc = resolvePartDescription(part, null, ui.game);
  const descHtml = ui.stateManager?.addPartIconsToTitle?.(rawDesc) ?? rawDesc;
  const costDisplay = part.erequires ? `${fmt(part.cost)} EP` : `$${fmt(part.cost)}`;
  const statParts = [];
  if (part.power > 0) statParts.push(`${fmt(part.power)} power`);
  if (part.heat > 0) statParts.push(`${fmt(part.heat)} heat`);
  const levelHeader = locked
    ? `${Math.min(unlockManager?.getPreviousTierCount(part) ?? 0, 10)}/10`
    : (statParts.join(" · ") || "Selected");
  return {
    iconPath,
    title: part.title || "",
    descHtml,
    levelHeader,
    costDisplay,
    doctrineLocked: doctrineLocked || locked,
    isMaxed: false,
    unaffordable: !part.affordable && !locked && !doctrineLocked,
    affordProgress: null,
    ariaLabel: `${part.title || "Part"}, ${costDisplay}`,
    onBuyClick: (e) => {
      e.stopPropagation();
      if (locked || doctrineLocked || !part.affordable) return;
      ui.stateManager.setClickedPart(part);
    },
  };
}

function buildPartsModuleInfoContent(ui, selPart, uiState) {
  const isMobile = uiState?.is_mobile_viewport ?? (typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX);
  if (isMobile) {
    if (!selPart) return upgradeHubDetailEmptyTemplate("— Select a module —");
    const data = buildPartDetailPanelData(selPart, ui);
    return data ? upgradeHubDetailPanelTemplate(data) : upgradeHubDetailEmptyTemplate("— Select a module —");
  }
  return selPart
    ? partsModuleInfoCardTemplate(selPart, ui.game)
    : html`<span class="parts-module-info-empty">— Select a module —</span>`;
}

function buildPartsPanelLayoutTemplate(ui, uiState) {
  const game = ui.game;
  const partset = game?.partset;
  const unlockManager = game?.unlockManager;
  const activeTab = uiState?.active_parts_tab ?? "power";
  const switchTab = (tabId) => { if (ui.uiState) ui.uiState.active_parts_tab = tabId; };
  const onHelpToggle = () => {
    ui.setHelpModeActive(!ui.help_mode_active);
    refreshPartsPanel(ui);
  };
  const powerActive = activeTab === "power";
  const heatActive = activeTab === "heat";
  const tabContent = buildPartsTabContent(ui, partset, unlockManager, activeTab, powerActive, heatActive);

  const selectedPartId = uiState?.interaction?.selectedPartId ?? null;
  const selPart = selectedPartId && partset ? partset.getPartById(selectedPartId) : null;
  const isMobile = uiState?.is_mobile_viewport ?? (typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX);
  const moduleInfoContent = buildPartsModuleInfoContent(ui, selPart, uiState);

  return partsPanelLayoutTemplate({
    powerActive,
    heatActive,
    helpModeActive: ui.help_mode_active,
    onSwitchPower: () => switchTab("power"),
    onSwitchHeat: () => switchTab("heat"),
    onHelpToggle,
    tabContent,
    moduleInfoContent,
    moduleInfoPanelClass: isMobile ? "upgrade-hub-detail-panel" : "parts-module-info-panel",
  });
}

export function setupPartsTabs(ui) {
  if (ui._partsPanelReactiveMounted) {
    const root = getUiElement(ui, "parts_panel_reactive_root");
    if (root?.isConnected) return;
    if (typeof ui._partsPanelReactiveUnmount === "function") {
      safeCall(() => { ui._partsPanelReactiveUnmount(); });
      ui._partsPanelReactiveUnmount = null;
    }
    ui._partsPanelReactiveMounted = false;
  }
  const root = getUiElement(ui, "parts_panel_reactive_root");
  if (!root || !ui.uiState) return;
  const subscriptions = [
    { state: ui.uiState, keys: ["active_parts_tab", "parts_panel_collapsed", "is_mobile_viewport", "snapshot_rev"] },
    { state: ui.uiState?.interaction, keys: ["selectedPartId"] },
  ].filter((s) => s.state != null);
  if (subscriptions.length === 0) return;
  const renderFn = () => buildPartsPanelLayoutTemplate(ui, ui.uiState);
  ui._partsPanelReactiveUnmount = bindLitRenderMulti(subscriptions, renderFn, root);
  ui._partsPanelReactiveMounted = true;
  if (!ui._layoutUnmounts) ui._layoutUnmounts = [];
  ui._layoutUnmounts.push(ui._partsPanelReactiveUnmount);
}

const PLACEMENT_MACROS = [
  { id: "row", label: "ROW", title: "Fill row (Ctrl+click)" },
  { id: "col", label: "COL", title: "Fill column (Alt+click)" },
  { id: "checker", label: "CHK", title: "Checkerboard (Ctrl+Alt+click)" },
  { id: "fill", label: "FILL", title: "Fill matching parts (Shift+click)" },
  { id: null, label: "1×", title: "Single tile placement" },
];

function macroFabLabel(active) {
  if (!active) return "1×";
  const match = PLACEMENT_MACROS.find((m) => m.id === active);
  return match?.label ?? "1×";
}

function setMacroPopoverOpen(ui, open) {
  const popover = getUiElement(ui, "macro_toolbar_popover");
  const fab = getUiElement(ui, "macro_toolbar_fab");
  if (!popover || !fab) return;
  popover.className = open ? "macro-toolbar-popover" : "macro-toolbar-popover hidden";
  fab.setAttribute("aria-expanded", open ? "true" : "false");
}

function syncMacroFabChrome(ui) {
  const fab = getUiElement(ui, "macro_toolbar_fab");
  const labelEl = getUiElement(ui, "macro_toolbar_fab_label");
  if (!fab || !labelEl || !ui?.uiState) return;
  const active = ui.uiState.interaction.placementMacro;
  labelEl.textContent = macroFabLabel(active);
  fab.className = active
    ? "control-deck-fab macro-toolbar-fab is-macro-active"
    : "control-deck-fab macro-toolbar-fab";
  fab.title = active
    ? `Macro: ${macroFabLabel(active)} (tap to change)`
    : "Placement macros";
}

export function setupMacroToolbar(ui) {
  const popover = getUiElement(ui, "macro_toolbar_popover");
  const fab = getUiElement(ui, "macro_toolbar_fab");
  if (!popover || !fab || !ui.uiState) return;
  const active = ui.uiState.interaction.placementMacro;
  const template = html`
    ${PLACEMENT_MACROS.map(
      (m) => html`
        <button
          type="button"
          role="menuitemradio"
          class=${classMap({ "macro-toolbar-btn": true, "is-active": active === m.id })}
          data-macro=${m.id ?? ""}
          title=${m.title}
          aria-label=${m.title}
          aria-checked=${active === m.id ? "true" : "false"}
        >${m.label}</button>
      `
    )}
  `;
  render(template, popover);
  syncMacroFabChrome(ui);

  if (!ui._macroToolbarBound) {
    ui._macroToolbarBound = true;
    fab.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = fab.getAttribute("aria-expanded") === "true";
      setMacroPopoverOpen(ui, !isOpen);
      ui.deviceFeatures?.lightVibration?.();
    });
    popover.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-macro]");
      if (!btn || !popover.contains(btn)) return;
      e.stopPropagation();
      const raw = btn.getAttribute("data-macro");
      const next = raw || null;
      const current = ui.uiState.interaction.placementMacro;
      ui.uiState.interaction.placementMacro = next && next === current ? null : next;
      ui.deviceFeatures?.lightVibration?.();
      setMacroPopoverOpen(ui, false);
      updateMacroToolbar(ui);
    });
    document.addEventListener("click", (e) => {
      const anchor = getUiElement(ui, "macro_toolbar_anchor");
      if (!anchor || anchor.contains(e.target)) return;
      setMacroPopoverOpen(ui, false);
    });
  }
}

export function updateMacroToolbar(ui) {
  setupMacroToolbar(ui);
}

export function updateQuickSelectSlots(ui) {
  const stateManager = ui?.stateManager;
  if (!stateManager) return;
  stateManager.normalizeQuickSelectSlotsForUnlock();
  const slots = stateManager.getQuickSelectSlots();
  const partset = ui.game?.partset;
  const selectedPartId = stateManager.getClickedPart()?.id ?? null;
  const root = getUiElement(ui, "quick_select_slots_root");
  if (!root) return;
  const slotTemplate = (slot, i) => {
    const { partId, locked } = slot || { partId: null, locked: false };
    const part = partId && partset ? partset.getPartById(partId) : null;
    const slotClass = classMap({
      "quick-select-slot": true,
      locked: !!locked,
      unaffordable: !!(part && !part.affordable),
      "is-selected": partId !== null && partId === selectedPartId,
    });
    const ariaLabel = part ? (locked ? `Unlock ${part.title}` : `Select ${part.title}`) : `Recent part ${i + 1}`;
    const costText = part ? (part.erequires ? `${fmt(part.cost)} EP` : `$${fmt(part.cost)}`) : "";
    const iconPath = partIconPath(part);
    const iconStyle = iconPath ? styleMap({ backgroundImage: `url('${iconPath}')` }) : {};
    return quickSelectSlotTemplate({
      slotClass,
      index: i,
      ariaLabel,
      hasIcon: !!iconPath,
      iconStyle,
      hasPart: !!part,
      costText,
    });
  };
  const template = html`${repeat(slots, (_, i) => i, slotTemplate)}`;
  try {
    render(template, root);
  } catch (err) {
    const msg = err?.message ?? "";
    if (msg.includes("ChildPart") && msg.includes("parentNode")) {
      render(html``, root);
      render(template, root);
    } else {
      throw err;
    }
  }
}

export function closePartsPanel(ui) {
  if (ui.uiState) ui.uiState.parts_panel_collapsed = true;
}

export function teardownPartsPanel(ui) {
  if (ui?._partsPanelAbortController) {
    ui._partsPanelAbortController.abort();
    ui._partsPanelAbortController = null;
  }
}

export function initializePartsPanel(ui) {
  const panel = getPartsSectionElement(ui);
  if (!panel) return;

  teardownPartsPanel(ui);
  ui._partsPanelAbortController = new AbortController();
  const { signal } = ui._partsPanelAbortController;
  window.addEventListener("resize", () => {
    const isCurrentlyMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (ui.uiState) {
      ui.uiState.is_mobile_viewport = isCurrentlyMobile;
      ui.uiState.parts_panel_collapsed = isCurrentlyMobile;
    }
  }, { signal });

  const isMobileOnLoad = window.innerWidth <= MOBILE_BREAKPOINT_PX;
  if (ui.uiState) {
    ui.uiState.is_mobile_viewport = isMobileOnLoad;
    ui.uiState.parts_panel_collapsed = isMobileOnLoad;
  }
  logger.log("debug", "ui", "[Parts Panel Init]", isMobileOnLoad ? "Mobile detected - added collapsed class" : "Desktop detected - removed collapsed class");
  logger.log("debug", "ui", "[Parts Panel Init] Final state - collapsed:", ui.uiState?.parts_panel_collapsed ?? true);
  updatePartsPanelBodyClass(ui);

  const closeBtn = getUiElement(ui, "parts_close_btn");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      closePartsPanel(ui);
    }, { signal });
  }

  ui.stateManager.updatePartsPanelToggleIcon(null);
}

export function setupPartsPanel(ui) {
  setupPartsTabs(ui);
  initializePartsPanel(ui);
}
