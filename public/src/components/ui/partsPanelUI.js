import { html, render } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";
import { classMap, styleMap, repeat } from "../../utils/litHelpers.js";
import { PartButton } from "../buttonFactory.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

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

export class PartsPanelUI {
  constructor(ui) {
    this.ui = ui;
    this._resizeHandler = null;
    this._partsPanelUnmount = null;
  }

  clearPartContainers() {
    const containerIds = [
      "cells",
      "reflectors",
      "capacitors",
      "particleAccelerators",
      "vents",
      "heatExchangers",
      "heatInlets",
      "heatOutlets",
      "coolantCells",
      "reactorPlatings",
      "overflowValves",
      "topupValves",
      "checkValves",
    ];
    const ui = this.ui;
    containerIds.forEach((id) => {
      const el = ui.DOMElements[id];
      if (el) el.innerHTML = "";
    });
  }

  populatePartsForTab(_tabId) {
    if (this._partsPanelUnmount) return;
    const ui = this.ui;
    if (!ui.game?.partset) return;
    this.clearPartContainers();
    const categories = CATEGORY_MAP[_tabId] || [];
    for (const cat of categories) {
      const parts = ui.game.partset.getPartsByCategory(cat);
      const unlockManager = ui.game.unlockManager;
      for (const part of parts) {
        if (unlockManager && !unlockManager.shouldShowPart(part)) continue;
        const partEl = part.createElement();
        if (!partEl) continue;
        const key = getContainerKey(part);
        const container = ui.DOMElements[key] || document.getElementById(key);
        if (container) container.appendChild(partEl);
      }
    }
  }

  unlockAllPartsForTesting() {
    const ui = this.ui;
    if (!ui.game?.partset?.partsArray) return;
    const typeLevelCombos = new Set();
    ui.game.partset.partsArray.forEach(part => {
      if (part.type && part.level) {
        typeLevelCombos.add(`${part.type}:${part.level}`);
      }
    });
    typeLevelCombos.forEach(combo => {
      ui.game.placedCounts[combo] = 10;
    });
    ui.game.partset.check_affordability(ui.game);
    if (ui.stateManager && typeof ui.stateManager.refreshPartsPanel === "function") {
      ui.stateManager.refreshPartsPanel();
    } else {
      this.refreshPartsDisplay();
    }
  }

  populateActiveTab() {
    this.refreshPartsPanel();
  }

  refreshPartsPanel() {
    const ui = this.ui;
    if (ui.game?.state && typeof ui.game.state.parts_panel_version === "number") {
      ui.game.state.parts_panel_version++;
    }
    if (this._partsPanelUnmount) return;
    const activeTabId = ui.uiState?.active_parts_tab ?? "power";
    this.populatePartsForTab(activeTabId);
  }

  refreshPartsDisplay() {
    const activeTabId = this.ui.uiState?.active_parts_tab ?? "power";
    const tabContents = document.querySelector(".parts_tab_contents");
    if (tabContents) tabContents.innerHTML = "";
    this.populatePartsForTab(activeTabId);
  }

  onActiveTabChanged(tabId) {
    if (!this._partsPanelUnmount) this.populatePartsForTab(tabId);
  }

  _partsPanelTemplate() {
    const ui = this.ui;
    const game = ui.game;
    const partset = game?.partset;
    const unlockManager = game?.unlockManager;
    const activeTab = ui.uiState?.active_parts_tab ?? "power";
    if (!partset) {
      return html`
        <div id="parts_tab_power" class="parts_tab_content active"><div id="cells" class="item-grid"></div><div id="reflectors" class="item-grid"></div><div id="capacitors" class="item-grid"></div><div id="particleAccelerators" class="item-grid"></div></div>
        <div id="parts_tab_heat" class="parts_tab_content"><div id="vents" class="item-grid"></div><div id="heatExchangers" class="item-grid"></div><div id="heatInlets" class="item-grid"></div><div id="heatOutlets" class="item-grid"></div><div id="coolantCells" class="item-grid"></div><div id="reactorPlatings" class="item-grid"></div><div id="overflowValves" class="item-grid"></div><div id="topupValves" class="item-grid"></div><div id="checkValves" class="item-grid"></div></div>
      `;
    }
    const byContainer = getPartsByContainer(partset, activeTab, unlockManager);
    const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
    const partHandlers = (part) => {
      const onClick = () => {
        if (ui.help_mode_active) {
          if (game?.tooltip_manager) game.tooltip_manager.show(part, null, true);
          return;
        }
        if (part.affordable) {
          document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
          game?.emit?.("partClicked", { part });
          ui.stateManager.setClickedPart(part);
        } else if (game?.tooltip_manager) {
          game.tooltip_manager.show(part, null, true);
        }
      };
      const onMouseEnter = () => {
        if (ui.help_mode_active && game?.tooltip_manager) game.tooltip_manager.show(part, null, false);
      };
      const onMouseLeave = () => {
        if (ui.help_mode_active && game?.tooltip_manager) game.tooltip_manager.hide();
      };
      const unlocked = !unlockManager || unlockManager.isPartUnlocked(part);
      const opts = {
        locked: !unlocked,
        doctrineLocked: !unlocked && partset?.isPartDoctrineLocked?.(part),
        tierProgress: !unlocked ? `${Math.min(unlockManager?.getPreviousTierCount(part) ?? 0, 10)}/10` : "",
        partActive: part.id === selectedPartId,
      };
      return PartButton(part, onClick, onMouseEnter, onMouseLeave, opts);
    };
    const powerActive = activeTab === "power";
    const heatActive = activeTab === "heat";
    const grid = (id) => html`<div id=${id} class="item-grid">${repeat(byContainer.get(id) ?? [], (p) => p.id, partHandlers)}</div>`;
    return html`
        <div id="parts_tab_power" class="parts_tab_content ${powerActive ? "active" : ""}">
          <hgroup><h4>Cells</h4><h6>Generate power and heat.</h6></hgroup>
          ${grid("cells")}
          <hgroup><h4>Reflectors</h4><h6>Boost adjacent cell output.</h6></hgroup>
          ${grid("reflectors")}
          <hgroup><h4>Capacitors</h4><h6>Increase reactor power capacity.</h6></hgroup>
          ${grid("capacitors")}
          <hgroup><h4>Particle Accelerators</h4><h6>Generate Exotic Particles from heat.</h6></hgroup>
          ${grid("particleAccelerators")}
        </div>
        <div id="parts_tab_heat" class="parts_tab_content ${heatActive ? "active" : ""}">
          <hgroup><h4>Vents</h4><h6>Actively cool components.</h6></hgroup>
          ${grid("vents")}
          <hgroup><h4>Heat Exchangers</h4><h6>Distribute heat between components.</h6></hgroup>
          ${grid("heatExchangers")}
          <hgroup><h4>Heat Inlets</h4><h6>Move heat into the reactor core.</h6></hgroup>
          ${grid("heatInlets")}
          <hgroup><h4>Heat Outlets</h4><h6>Move heat out of the reactor core.</h6></hgroup>
          ${grid("heatOutlets")}
          <hgroup><h4>Coolant Cells</h4><h6>Absorb and contain heat.</h6></hgroup>
          ${grid("coolantCells")}
          <hgroup><h4>Reactor Plating</h4><h6>Increase reactor heat capacity.</h6></hgroup>
          ${grid("reactorPlatings")}
          <hgroup><h4>Overflow Valves</h4><h6>Transfer heat when input exceeds 80% containment.</h6></hgroup>
          ${grid("overflowValves")}
          <hgroup><h4>Top-up Valves</h4><h6>Transfer heat when output drops below 20% containment.</h6></hgroup>
          ${grid("topupValves")}
          <hgroup><h4>Check Valves</h4><h6>Transfer heat in one direction only.</h6></hgroup>
          ${grid("checkValves")}
        </div>
    `;
  }

  setupPartsTabs() {
    const ui = this.ui;
    const partsTabsContainer = document.querySelector(".parts_tabs");
    if (!partsTabsContainer) return;
    partsTabsContainer.addEventListener("click", (event) => {
      const btn = event.target.closest(".parts_tab");
      if (!btn || btn.disabled) return;
      const clickedTabId = btn.getAttribute("data-tab");
      if (ui.uiState) ui.uiState.active_parts_tab = clickedTabId;
      else this.populatePartsForTab(clickedTabId);
    });

    const helpToggleBtn = document.getElementById("parts_help_toggle");
    if (helpToggleBtn) {
      helpToggleBtn.addEventListener("click", () => {
        ui.help_mode_active = !ui.help_mode_active;
        helpToggleBtn.classList.toggle("active", ui.help_mode_active);
        document.body.classList.toggle(
          "help-mode-active",
          ui.help_mode_active
        );

        if (ui.help_mode_active) {
          document.querySelectorAll(".part.part_active").forEach((el) => {
            el.classList.remove("part_active");
          });

          ui.stateManager.setClickedPart(null);
        }
      });
    }

    const root = document.getElementById("parts_tab_contents");
    if (root && ui.game?.state && ui.uiState) {
      const subscriptions = [
        { state: ui.game.state, keys: ["current_money", "current_exotic_particles", "parts_panel_version"] },
        { state: ui.uiState, keys: ["active_parts_tab"] },
      ];
      const renderFn = () => this._partsPanelTemplate();
      this._partsPanelUnmount = ReactiveLitComponent.mountMulti(subscriptions, renderFn, root);
    } else {
      const initialTab = ui.uiState?.active_parts_tab ?? "power";
      this.populatePartsForTab(initialTab);
    }
    ui.updateCollapsedControlsNav();
  }

  updateQuickSelectSlots() {
    const ui = this.ui;
    ui.stateManager.normalizeQuickSelectSlotsForUnlock();
    const slots = ui.stateManager.getQuickSelectSlots();
    const partset = ui.game?.partset;
    const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
    const root = document.getElementById("quick_select_slots_root");
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
      const iconStyle = part?.getImagePath ? styleMap({ backgroundImage: `url('${part.getImagePath()}')` }) : {};
      return html`
        <button type="button" class=${slotClass} data-index=${i} aria-label=${ariaLabel}>
          ${part?.getImagePath ? html`<div class="quick-select-icon" style=${iconStyle}></div>` : ""}
          ${part ? html`<div class="quick-select-cost">${costText}</div>` : ""}
        </button>
      `;
    };
    const template = html`${repeat(slots, (_, i) => i, slotTemplate)}`;
    render(template, root);
  }

  updatePartsPanelBodyClass() {
    const partsSection = document.getElementById("parts_section");
    const collapsed = this.ui.uiState?.parts_panel_collapsed ?? partsSection?.classList.contains("collapsed");
    document.body.classList.toggle("parts-panel-open", !!(partsSection && !collapsed));
    document.body.classList.toggle("parts-panel-right", !!partsSection?.classList.contains("right-side"));

    logger.log('debug', 'ui', '[updatePartsPanelBodyClass] Panel collapsed:', collapsed, "Body classes:", document.body.className);
  }

  togglePartsPanelForBuildButton() {
    const ui = this.ui;
    ui.deviceFeatures.lightVibration();
    const partsSection = document.getElementById("parts_section");
    if (partsSection && ui.uiState) {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile) {
        ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
        this.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      } else {
        ui.uiState.parts_panel_collapsed = !ui.uiState.parts_panel_collapsed;
        this.updatePartsPanelBodyClass();
      }
    } else if (partsSection) {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile) {
        partsSection.classList.toggle("collapsed");
        this.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      }
    }
  }

  initializePartsPanel() {
    const ui = this.ui;
    const panel = ui.DOMElements.parts_section;

    if (panel) {
      if (this._resizeHandler) {
        window.removeEventListener("resize", this._resizeHandler);
      }

      this._resizeHandler = () => {
        const isCurrentlyMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
        if (ui.uiState) ui.uiState.parts_panel_collapsed = isCurrentlyMobile;
        else panel.classList.toggle("collapsed", isCurrentlyMobile);
        this.updatePartsPanelBodyClass();
      };

      window.addEventListener("resize", this._resizeHandler);

      const isMobileOnLoad = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (ui.uiState) ui.uiState.parts_panel_collapsed = isMobileOnLoad;
      panel.classList.toggle("collapsed", ui.uiState?.parts_panel_collapsed ?? isMobileOnLoad);
      logger.log('debug', 'ui', '[Parts Panel Init]', isMobileOnLoad ? "Mobile detected - added collapsed class" : "Desktop detected - removed collapsed class");
      logger.log('debug', 'ui', '[Parts Panel Init] Final state - collapsed:', panel.classList.contains("collapsed"));
      this.updatePartsPanelBodyClass();

      const closeBtn = document.getElementById("parts_close_btn");
      if (closeBtn && !closeBtn.hasAttribute("data-listener-attached")) {
        closeBtn.setAttribute("data-listener-attached", "true");
        closeBtn.addEventListener("click", () => {
          if (ui.uiState) ui.uiState.parts_panel_collapsed = true;
          else panel.classList.add("collapsed");
          this.updatePartsPanelBodyClass();
        });
      }

      ui.stateManager.updatePartsPanelToggleIcon(null);
    }
  }
}
