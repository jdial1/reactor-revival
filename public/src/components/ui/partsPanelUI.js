import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";

export class PartsPanelUI {
  constructor(ui) {
    this.ui = ui;
    this._resizeHandler = null;
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

  populatePartsForTab(tabId) {
    const ui = this.ui;
    if (!ui.game || !ui.game.partset) return;

    const categoryMap = {
      power: ["cell", "reflector", "capacitor", "particle_accelerator"],
      heat: [
        "vent",
        "heat_exchanger",
        "heat_inlet",
        "heat_outlet",
        "coolant_cell",
        "reactor_plating",
        "valve",
      ],
    };
    const categories = categoryMap[tabId] || [];

    this.clearPartContainers();

    categories.forEach((partCategory) => {
      const parts = ui.game.partset.getPartsByCategory(partCategory);

      if (parts.length === 0) {
        logger.log('warn', 'ui', `No parts found for category: ${partCategory}`);
      }
      parts.forEach((part) => {
        ui.stateManager.handlePartAdded(ui.game, part);
      });
    });
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
    const partsTabsContainer = document.querySelector(".parts_tabs");
    const activeTab = partsTabsContainer
      ? Array.from(partsTabsContainer.querySelectorAll(".parts_tab")).find((btn) =>
        btn.classList.contains("active")
      )
      : null;
    const activeTabId = activeTab ? activeTab.getAttribute("data-tab") : "power";
    this.populatePartsForTab(activeTabId);
  }

  refreshPartsDisplay() {
    const partsTabsContainer = document.querySelector(".parts_tabs");
    if (partsTabsContainer) {
      const activeTab = Array.from(partsTabsContainer.querySelectorAll(".parts_tab")).find((btn) =>
        btn.classList.contains("active")
      );
      const activeTabId = activeTab ? activeTab.getAttribute("data-tab") : "power";

      const tabContents = document.querySelector(".parts_tab_contents");
      if (tabContents) {
        tabContents.innerHTML = "";
      }

      this.populatePartsForTab(activeTabId);
    }
  }

  setupPartsTabs() {
    const ui = this.ui;
    const partsTabsContainer = document.querySelector(".parts_tabs");
    if (!partsTabsContainer) return;
    const tabContents = Array.from(
      document.querySelectorAll(".parts_tab_content")
    );
    partsTabsContainer.addEventListener("click", (event) => {
      const btn = event.target.closest(".parts_tab");
      if (!btn || btn.disabled) return;
      const tabButtons = Array.from(
        partsTabsContainer.querySelectorAll(".parts_tab")
      );
      const clickedTabId = btn.getAttribute("data-tab");
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));
      btn.classList.add("active");
      const contentToShow = document.getElementById(
        "parts_tab_" + clickedTabId
      );
      if (contentToShow) contentToShow.classList.add("active");
      this.populatePartsForTab(clickedTabId);
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

    const activeTab = Array.from(
      partsTabsContainer.querySelectorAll(".parts_tab")
    ).find((btn) => btn.classList.contains("active"));
    if (activeTab) {
      this.populatePartsForTab(activeTab.getAttribute("data-tab"));
    }
    ui.updateCollapsedControlsNav();
  }

  updateQuickSelectSlots() {
    const ui = this.ui;
    ui.stateManager.normalizeQuickSelectSlotsForUnlock();
    const slots = ui.stateManager.getQuickSelectSlots();
    const partset = ui.game?.partset;
    const selectedPartId = ui.stateManager.getClickedPart()?.id ?? null;
    document.querySelectorAll(".quick-select-slot").forEach((el) => {
      const i = parseInt(el.getAttribute("data-index"), 10);
      if (i < 0 || i > 4) return;
      const { partId, locked } = slots[i] || { partId: null, locked: false };
      const part = partId && partset ? partset.getPartById(partId) : null;
      el.innerHTML = "";
      if (part && typeof part.getImagePath === "function") {
        const icon = document.createElement("div");
        icon.className = "quick-select-icon";
        icon.style.backgroundImage = `url('${part.getImagePath()}')`;
        el.appendChild(icon);
      }
      if (part) {
        const costEl = document.createElement("div");
        costEl.className = "quick-select-cost";
        costEl.textContent = part.erequires ? `${fmt(part.cost)} EP` : `$${fmt(part.cost)}`;
        el.appendChild(costEl);
      }
      el.classList.toggle("locked", !!locked);
      el.classList.toggle("unaffordable", !!(part && !part.affordable));
      el.classList.toggle("is-selected", partId !== null && partId === selectedPartId);
      el.setAttribute("aria-label", part ? (locked ? `Unlock ${part.title}` : `Select ${part.title}`) : `Recent part ${i + 1}`);
    });
  }

  updatePartsPanelBodyClass() {
    const partsSection = document.getElementById("parts_section");
    document.body.classList.toggle("parts-panel-open", !!(partsSection && !partsSection.classList.contains("collapsed")));
    document.body.classList.toggle("parts-panel-right", !!partsSection?.classList.contains("right-side"));

    logger.log('debug', 'ui', '[updatePartsPanelBodyClass] Panel collapsed:', partsSection?.classList.contains("collapsed"), "Body classes:", document.body.className);
  }

  togglePartsPanelForBuildButton() {
    const ui = this.ui;
    ui.deviceFeatures.lightVibration();
    const partsSection = document.getElementById("parts_section");
    if (partsSection) {
      const isMobile = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      if (isMobile) {
        partsSection.classList.toggle("collapsed");
        this.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      } else {
        ui.parts_panel_collapsed = !ui.parts_panel_collapsed;
        this.updatePartsPanelBodyClass();
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
        panel.classList.toggle("collapsed", isCurrentlyMobile);
        this.updatePartsPanelBodyClass();
      };

      window.addEventListener("resize", this._resizeHandler);

      const isMobileOnLoad = window.innerWidth <= MOBILE_BREAKPOINT_PX;
      panel.classList.toggle("collapsed", isMobileOnLoad);
      logger.log('debug', 'ui', '[Parts Panel Init]', isMobileOnLoad ? "Mobile detected - added collapsed class" : "Desktop detected - removed collapsed class");
      logger.log('debug', 'ui', '[Parts Panel Init] Final state - collapsed:', panel.classList.contains("collapsed"));
      this.updatePartsPanelBodyClass();

      const closeBtn = document.getElementById("parts_close_btn");
      if (closeBtn && !closeBtn.hasAttribute("data-listener-attached")) {
        closeBtn.setAttribute("data-listener-attached", "true");
        closeBtn.addEventListener("click", () => {
          panel.classList.add("collapsed");
          this.updatePartsPanelBodyClass();
        });
      }

      ui.stateManager.updatePartsPanelToggleIcon(null);
    }
  }
}
