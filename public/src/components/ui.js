import { numFormat as fmt } from "../utils/util.js";
import { StateManager } from "../core/stateManager.js";
import { Hotkeys } from "../utils/hotkeys.js";
import dataService from "../services/dataService.js";
import { on } from "../utils/util.js";
import { SettingsModal } from "./settingsModal.js";
import { GridScaler } from "./gridScaler.js";

// Load help text
let help_text = {};
let dataLoaded = false;

async function ensureDataLoaded() {
  if (!dataLoaded) {
    try {
      help_text = await dataService.loadHelpText();
      dataLoaded = true;
    } catch (error) {
      console.warn("Failed to load help text:", error);
      help_text = {};
      dataLoaded = true;
    }
  }
  return help_text;
}

export class UI {
  constructor() {
    this.game = null;
    this.DOMElements = {};
    this.update_vars = new Map();
    this.var_objs_config = {};
    this.last_money = 0;
    this.last_exotic_particles = 0;
    // Initialize parts panel state based on screen size
    const isMobileOnInit = typeof window !== 'undefined' && window.innerWidth <= 900;
    this.parts_panel_collapsed = isMobileOnInit; // Mobile starts collapsed, desktop starts open
    this.parts_panel_right_side = false;
    this.update_interface_interval = 100;
    this.update_interface_task = null;
    this._updateLoopRunning = false;
    this.stateManager = new StateManager(this);
    this.hotkeys = null;
    this.gridScaler = new GridScaler(this);
    this.isDragging = false;
    this.lastTileModified = null;
    this.longPressTimer = null;
    this.longPressDuration = 500;
    this.help_mode_active = false; // Track help mode state
    this.highlightedSegment = null; // Track the currently highlighted segment

    // CTRL+9 exponential money variables
    this.ctrl9HoldTimer = null;
    this.ctrl9HoldStartTime = null;
    this.ctrl9MoneyInterval = null;
    this.ctrl9BaseAmount = 1000000000; // Base amount for CTRL+9
    this.ctrl9ExponentialRate = 5; // Exponential growth rate
    this.ctrl9IntervalMs = 100; // How often to add money while held
    // Visual event rendering pool (simplified - emit nodes removed)
    this._visualPool = {};
    this._icons = {
      power: "img/ui/icons/icon_power.png",
      heat: "img/ui/icons/icon_heat.png",
    };

    // Animation state tracking to prevent spam
    this._activeVentRotors = new Set(); // Track tiles with active vent rotor animations
    // Flow indicators removed for performance
    this._activeTileIcons = new Map(); // Track active tile icons by tile and type

    // Performance tracking for FPS and TPS
    this._fpsHistory = [];
    this._tpsHistory = [];
    this._lastFrameTime = performance.now();
    this._lastTickTime = performance.now();
    this._frameCount = 0;
    this._tickCount = 0;
    this._performanceUpdateInterval = null;

    this.dom_ids = [
      "main",
      "reactor",
      "reactor_background",
      "reactor_wrapper",
      "reactor_section",
      "parts_section",
      "info_bar",
      "info_heat",
      "info_power",
      "info_money",
      "info_heat_denom",
      "info_power_denom",
      "info_bar_heat_btn",
      "info_bar_power_btn",
      // Desktop info bar elements
      "info_heat_desktop",
      "info_power_desktop",
      "info_money_desktop",
      "info_heat_denom_desktop",
      "info_power_denom_desktop",
      "info_bar_heat_btn_desktop",
      "info_bar_power_btn_desktop",
      "info_ep",
      "info_ep_desktop",
      "info_ep_value",
      "info_ep_value_desktop",
      "parts_tab_contents",
      "cells",
      "reflectors",
      "capacitors",
      "vents",
      "heatExchangers",
      "heatInlets",
      "heatOutlets",
      "coolantCells",
      "reactorPlatings",
      "particleAccelerators",
      "overflowValves",
      "topupValves",
      "checkValves",
      "objectives_section",
      "tooltip",
      "tooltip_data",
      "stats_power",
      "stats_heat",
      "stats_total_part_heat",
      "engine_status_indicator",
      "tps_display",
      "fps_display",
      "stats_outlet",
      "stats_inlet",
      "stats_vent",
      "upgrades_section",
      "experimental_upgrades_section",
      "about_section",
      "privacy_policy_section",
      "upgrades_content_wrapper",
      "cell_tick_upgrades",
      "cell_power_upgrades",
      "cell_perpetual_upgrades",
      "vent_upgrades",
      "exchanger_upgrades",
      "experimental_upgrades_content_wrapper",
      "exotic_particles_display",
      "experimental_laboratory",
      "experimental_boost",
      "experimental_particle_accelerators",
      "experimental_cells",
      "experimental_cells_boost",
      "experimental_parts",
      "current_exotic_particles",
      "total_exotic_particles",
      "reboot_exotic_particles",
      "reboot_btn",
      "refund_btn",
      "auto_sell_toggle",
      "auto_buy_toggle",
      "time_flux_toggle",
      "heat_control_toggle",
      "pause_toggle",
      "parts_panel_toggle",
      "bottom_nav",
      "main_top_nav",
      "fullscreen_toggle",
      "settings_btn",
      "basic_overview_section",
      "debug_section",
      "debug_toggle_btn",
      "debug_hide_btn",
      "debug_variables",
      "debug_refresh_btn",
      "copy_state_btn",
      "research_google_signin_btn",
      "research_back_to_splash_btn",
      "meltdown_banner",
      "splash_close_btn",
      // Controls collapse elements (removed from HTML but kept for compatibility)
      "controls_collapse_btn",
      "controls_collapse_icon",
      "controls_expanded_group",
      "controls_collapsed_group",
      "collapsed_controls_nav",
      "reactor_copy_btn",
      "reactor_paste_btn",
      "reactor_deselect_btn",
      "reactor_dropper_btn",
      "reactor_copy_paste_modal",
      "reactor_copy_paste_modal_title",
      "reactor_copy_paste_text",
      "reactor_copy_paste_cost",
      "reactor_copy_paste_close_btn",
      "reactor_copy_paste_confirm_btn",
    ];
    this.toggle_buttons_config = {
      auto_sell: { id: "auto_sell_toggle", stateProperty: "auto_sell" },
      auto_buy: { id: "auto_buy_toggle", stateProperty: "auto_buy" },
      time_flux: { id: "time_flux_toggle", stateProperty: "time_flux" },
      heat_control: {
        id: "heat_control_toggle",
        stateProperty: "heat_control",
      },
      pause: { id: "pause_toggle", stateProperty: "pause" },
    };
  }

  cacheDOMElements(pageId = null) {
    // Define page-specific element mappings
    const pageElements = {
      // Global elements that exist on all pages
      global: [
        "main",
        "info_bar",
        "info_heat",
        "info_power",
        "info_money",
        "info_heat_denom",
        "info_power_denom",
        "info_bar_heat_btn",
        "info_bar_power_btn",
        "info_heat_desktop",
        "info_power_desktop",
        "info_money_desktop",
        "info_heat_denom_desktop",
        "info_power_denom_desktop",
        "info_bar_heat_btn_desktop",
        "info_bar_power_btn_desktop",
        "info_ep",
        "info_ep_desktop",
        "info_ep_value",
        "info_ep_value_desktop",
        "parts_tab_contents",
        "cells",
        "reflectors",
        "capacitors",
        "vents",
        "heatExchangers",
        "heatInlets",
        "heatOutlets",
        "coolantCells",
        "reactorPlatings",
        "particleAccelerators",
        "overflowValves",
        "topupValves",
        "checkValves",
        "objectives_section",
        "objective_reward",
        "objectives_container",
        "objectives_header",
        "objectives_toggle_btn",
        "objectives_content_panel",
        "objective_current_title",
        "objective_current_progress_bar",
        "objective_chapter_title",
        "objective_chapter_progress_bar",
        "objective_chapter_progress_text",
        "objective_current_description",
        "objective_current_progress_text",
        "objective_flavor_text",
        "objective_claim_btn",
        "objective_claim_btn_compact",
        "objective_claim_chapter_btn",
        "objective_claim_chapter_btn_compact",
        "tooltip",
        "tooltip_data"
      ],

      // Reactor page specific elements
      reactor_section: [
        "reactor",
        "reactor_background",
        "reactor_wrapper",
        "reactor_section",
        "parts_section",
        "meltdown_banner"
      ],

      // Upgrades page specific elements
      upgrades_section: [
        "upgrades_section",
        "upgrades_content_wrapper",
        "cell_power_upgrades",
        "cell_tick_upgrades",
        "cell_perpetual_upgrades",
        "vent_upgrades",
        "exchanger_upgrades"
      ],

      // Research/Experimental upgrades page specific elements
      experimental_upgrades_section: [
        "experimental_upgrades_section",
        "experimental_upgrades_content_wrapper",
        "exotic_particles_display",
        "current_exotic_particles",
        "total_exotic_particles",
        "experimental_laboratory",
        "experimental_boost",
        "experimental_particle_accelerators",
        "experimental_cells",
        "experimental_cells_boost",
        "experimental_parts"
      ],

      // About page specific elements
      about_section: [
        "about_section"
      ],

      // Privacy policy page specific elements
      privacy_policy_section: [
        "privacy_policy_section"
      ],
      soundboard_section: [
        "soundboard_section",
        "sound_warning_intensity",
        "sound_warning_value"
      ]
    };

    // Determine which elements to cache based on pageId
    let elementsToCache = [...pageElements.global];

    if (pageId && pageElements[pageId]) {
      elementsToCache = [...elementsToCache, ...pageElements[pageId]];
    } else if (!pageId) {
      // If no pageId provided, cache global elements and all elements from dom_ids
      // This ensures backward compatibility while also caching global elements
      const domIdsElements = this.dom_ids || [];
      elementsToCache = [...new Set([...pageElements.global, ...domIdsElements])];
    }

    // Cache the determined elements
    elementsToCache.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        this.DOMElements[id] = el;
        const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        this.DOMElements[camelCaseKey] = el;

        // Debug logging for stats elements
        if (id.startsWith("stats_")) {

        }
      } else {
        // Only warn for global elements that should always exist
        if (pageElements.global.includes(id)) {
          console.warn(`[UI] Global element with id '${id}' not found in DOM.`);
        }
        // For page-specific elements, don't warn as they may not be loaded yet
      }
    });

    // Always return true - we'll handle missing elements gracefully
    return true;
  }

  // Lazy getter for DOM elements - provides fallback for uncached elements
  getElement(id) {
    // First check if already cached
    if (this.DOMElements[id]) {
      return this.DOMElements[id];
    }

    // Try to get from DOM and cache it
    const el = document.getElementById(id);
    if (el) {
      this.DOMElements[id] = el;
      const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      this.DOMElements[camelCaseKey] = el;
      return el;
    }

    return null;
  }

  initializeToggleButtons() {
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const button = this.DOMElements[config.id];
      if (button) {

        button.onclick = () => {
          const currentState = this.stateManager.getVar(config.stateProperty);
          this.stateManager.setVar(config.stateProperty, !currentState);
        };
      } else {
        console.warn(`[UI] Toggle button #${config.id} not found.`);
      }
    }
    // Parts panel toggle is handled in initializePartsPanel() with pointer events
    // No need for onclick handler here as it conflicts with drag functionality

    // Note: Controls collapse functionality has been removed as the HTML elements don't exist
    // The following code is kept for reference but disabled to prevent errors

    /*
    if (this.DOMElements.controls_collapse_btn) {
      this.DOMElements.controls_collapse_btn.onclick = () => {
        const isCollapsed =
          this.DOMElements.controls_collapsed_group.style.display !== "none";
        if (isCollapsed) {
          // Expand
          this.DOMElements.controls_collapsed_group.style.display = "none";
          this.DOMElements.controls_expanded_group.style.display = "";
          this.DOMElements.controls_collapse_icon.textContent = "▼";
        } else {
          // Collapse
          this.DOMElements.controls_collapsed_group.style.display = "flex";
          this.DOMElements.controls_expanded_group.style.display = "none";
          this.DOMElements.controls_collapse_icon.textContent = "▲";
        }
      };
    }
    */

    this.updateAllToggleBtnStates();

    /*
    if (this.DOMElements.controls_collapsed_group) {
      const icons = {
        auto_sell: "img/ui/icons/icon_cash.png",
        auto_buy: "🛒",
        time_flux: "⏩",
        heat_control: "🌡️",
        // pause: removed, use text only
      };
      this.DOMElements.controls_collapsed_group
        .querySelectorAll(".collapsed-control-btn")
        .forEach((btn) => {
          const control = btn.getAttribute("data-control");
          if (control === "pause") {
            const isPaused = this.stateManager.getVar("pause");
            if (isPaused) {
              btn.classList.add("paused");
              btn.title = "Resume";
            } else {
              btn.classList.remove("paused");
              btn.title = "Pause";
            }
              ? "Resume"
              : "Pause";
          } else {
            btn.innerHTML = icons[control] || "?";
          }
          btn.onclick = () => {
            const currentState = this.stateManager.getVar(control);
            this.stateManager.setVar(control, !currentState);
            this.updateAllToggleBtnStates();
          };
        });
    }
    */

    // Add this after setting up all toggle buttons in initializeToggleButtons()
    const updatePauseButtonText = () => {
      const isPaused = this.stateManager.getVar("pause");
      const pauseBtn = this.DOMElements.pause_toggle;
      if (pauseBtn) {
        if (isPaused) {
          pauseBtn.classList.add("paused");
          pauseBtn.title = "Resume";
        } else {
          pauseBtn.classList.remove("paused");
          pauseBtn.title = "Pause";
        }
      }
    };
    updatePauseButtonText();

    // Patch setVar to also update pause button text and toggle states
    const origSetVar = this.stateManager.setVar.bind(this.stateManager);
    this.stateManager.setVar = (key, value, ...args) => {
      origSetVar(key, value, ...args);
      if (key === "pause") {
        this.updateAllToggleBtnStates();
        updatePauseButtonText();
      }
    };
  }

  updateAllToggleBtnStates() {
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const isActive = this.stateManager.getVar(config.stateProperty);
      this.updateToggleButtonState(config, isActive);
    }
  }

  updateToggleButtonState(config, isActive) {
    const button = this.DOMElements[config.id];
    if (!button) return;
    button.classList.toggle("on", isActive);
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
    containerIds.forEach((id) => {
      const el = this.DOMElements[id];
      if (el) el.innerHTML = "";
    });
  }

  populatePartsForTab(tabId) {
    if (!this.game || !this.game.partset) return;

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
      const parts = this.game.partset.getPartsByCategory(partCategory);

      if (parts.length === 0) {
        console.warn(`No parts found for category: ${partCategory}`);
      }
      parts.forEach((part) => {

        this.stateManager.handlePartAdded(this.game, part);
      });
    });
  }

  // Allow other systems to trigger a refresh of the visible parts panel
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

  // Fallback method to refresh parts display when refreshPartsPanel is not available
  refreshPartsDisplay() {
    // Clear and repopulate all parts tabs
    const partsTabsContainer = document.querySelector(".parts_tabs");
    if (partsTabsContainer) {
      const activeTab = Array.from(partsTabsContainer.querySelectorAll(".parts_tab")).find((btn) =>
        btn.classList.contains("active")
      );
      const activeTabId = activeTab ? activeTab.getAttribute("data-tab") : "power";

      // Clear all tab contents first
      const tabContents = document.querySelector(".parts_tab_contents");
      if (tabContents) {
        tabContents.innerHTML = "";
      }

      // Repopulate the active tab
      this.populatePartsForTab(activeTabId);
    }
  }

  setupPartsTabs() {
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

    // Setup help toggle button
    const helpToggleBtn = document.getElementById("parts_help_toggle");
    if (helpToggleBtn) {
      helpToggleBtn.addEventListener("click", () => {
        this.help_mode_active = !this.help_mode_active;
        helpToggleBtn.classList.toggle("active", this.help_mode_active);
        document.body.classList.toggle(
          "help-mode-active",
          this.help_mode_active
        );

        // When help mode is activated, deselect current part and clear selection
        if (this.help_mode_active) {
          // Deselect any currently selected part
          document.querySelectorAll(".part.part_active").forEach((el) => {
            el.classList.remove("part_active");
          });

          // Clear the clicked part from state manager
          this.stateManager.setClickedPart(null);
        }
      });
    }

    const activeTab = Array.from(
      partsTabsContainer.querySelectorAll(".parts_tab")
    ).find((btn) => btn.classList.contains("active"));
    if (activeTab) {
      this.populatePartsForTab(activeTab.getAttribute("data-tab"));
    }
    this.updateCollapsedControlsNav();
  }

  updateMeltdownState() {
    // Add this check to prevent errors when document is not available
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    if (this.game && this.game.reactor) {
      const hasMeltedDown = this.game.reactor.has_melted_down;
      const isMeltdownClassPresent =
        document.body.classList.contains("reactor-meltdown");

      // Show/hide meltdown banner
      const meltdownBanner = document.getElementById("meltdown_banner");
      if (meltdownBanner) {
        meltdownBanner.classList.toggle("hidden", !hasMeltedDown);
      }

      if (hasMeltedDown && !isMeltdownClassPresent) {
        document.body.classList.add("reactor-meltdown");
      } else if (!hasMeltedDown && isMeltdownClassPresent) {
        document.body.classList.remove("reactor-meltdown");
      }

      // Update progress bar meltdown state
      this.updateProgressBarMeltdownState(hasMeltedDown);

      // Set up reset button event listener when meltdown banner is shown
      if (hasMeltedDown) {
        const resetReactorBtn = document.getElementById("reset_reactor_btn");
        if (resetReactorBtn && !resetReactorBtn.hasAttribute('data-listener-added')) {
          console.log("Setting up reset reactor button event listener");
          resetReactorBtn.addEventListener("click", async () => {
            console.log("Reset reactor button clicked");
            await this.resetReactor();
          });
          resetReactorBtn.setAttribute('data-listener-added', 'true');
        }
      }
    }
  }

  updatePauseState() {
    // Add this check to prevent errors when document is not available
    if (typeof document === "undefined" || !document.body) {
      return;
    }
    if (this.stateManager) {
      const isPaused = this.stateManager.getVar("pause");
      const isPauseClassPresent = document.body.classList.contains("game-paused");

      // Update body class for pause state - this controls banner visibility via CSS
      if (isPaused && !isPauseClassPresent) {
        document.body.classList.add("game-paused");
      } else if (!isPaused && isPauseClassPresent) {
        document.body.classList.remove("game-paused");
      }
    }
  }

  updateNavIndicators() {
    if (typeof document === "undefined" || !this.game || !this.game.upgradeset) {
      return;
    }

    const hasAffordableUpgrades = this.game.upgradeset.hasAffordableUpgrades();
    const hasAffordableResearch = this.game.upgradeset.hasAffordableResearch();

    const upgradeButtons = document.querySelectorAll('[data-page="upgrades_section"]');
    const researchButtons = document.querySelectorAll('[data-page="experimental_upgrades_section"]');

    upgradeButtons.forEach((button) => {
      let indicator = button.querySelector('.nav-indicator');
      if (hasAffordableUpgrades) {
        if (!indicator) {
          indicator = document.createElement('span');
          indicator.className = 'nav-indicator';
          button.style.position = 'relative';
          button.appendChild(indicator);
        }
        indicator.style.display = 'block';
      } else if (indicator) {
        indicator.style.display = 'none';
      }
    });

    researchButtons.forEach((button) => {
      let indicator = button.querySelector('.nav-indicator');
      if (hasAffordableResearch) {
        if (!indicator) {
          indicator = document.createElement('span');
          indicator.className = 'nav-indicator';
          button.style.position = 'relative';
          button.appendChild(indicator);
        }
        indicator.style.display = 'block';
      } else if (indicator) {
        indicator.style.display = 'none';
      }
    });
  }

  runUpdateInterfaceLoop() {
    // Guard against running after cleanup in test environment
    if (this._updateLoopStopped || typeof document === 'undefined' || !document) {
      return;
    }
    if (this._updateLoopRunning) return;
    this._updateLoopRunning = true;
    // Record frame for performance tracking
    this.recordFrame();

    this.game.performance.markStart("ui_update_total");

    this.game.performance.markStart("ui_process_queue");
    this.processUpdateQueue();
    this.game.performance.markEnd("ui_process_queue");

    if (this.game?.tileset.active_tiles_list) {
      this.game.performance.markStart("ui_visual_updates");
      this.game.tileset.active_tiles_list.forEach((tile) =>
        tile.updateVisualState()
      );
      this.game.performance.markEnd("ui_visual_updates");
    }
    // Drain and render visual events produced during the last engine tick
    if (this.game && typeof this.game.drainVisualEvents === 'function') {
      const events = this.game.drainVisualEvents();
      // Visual events drained from game queue
      if (events && events.length) {
        this._renderVisualEvents(events);
      }
    }
    if (this.game) {
      // Ensure money is a number
      this.game.current_money = Number(this.game.current_money);
      this.game.current_exotic_particles = Number(
        this.game.current_exotic_particles
      );

      // Only check affordability if money or exotic particles changed
      const moneyChanged = this.last_money !== this.game.current_money;
      const exoticParticlesChanged =
        this.last_exotic_particles !== this.game.current_exotic_particles;

      if (moneyChanged || exoticParticlesChanged) {
        this.game.performance.markStart("ui_affordability_check");
        // Update last known values
        this.last_money = this.game.current_money;
        this.last_exotic_particles = this.game.current_exotic_particles;

        // Check affordability for both parts and upgrades
        this.game.partset.check_affordability(this.game);
        this.game.upgradeset.check_affordability(this.game);

        // Update upgrade tooltip if one is showing and money/particles changed
        if (this.game.tooltip_manager) {
          this.game.tooltip_manager.updateUpgradeAffordability();
        }

        // Update nav indicators when affordability changes
        this.updateNavIndicators();

        this.game.performance.markEnd("ui_affordability_check");
      }

      // Update UI state
      this.game.performance.markStart("ui_state_manager");
      this.stateManager.setVar("current_money", this.game.current_money);
      this.stateManager.setVar("current_heat", this.game.reactor.current_heat);
      this.stateManager.setVar(
        "current_power",
        this.game.reactor.current_power
      );
      this.stateManager.setVar(
        "current_exotic_particles",
        this.game.current_exotic_particles
      );
      this.game.performance.markEnd("ui_state_manager");
    }

    this._updateLoopRunning = false;
    this.update_interface_task = setTimeout(
      () => this.runUpdateInterfaceLoop(),
      this.update_interface_interval
    );
    // Live-update tooltip only if it needs dynamic updates
    if (
      this.game?.tooltip_manager?.tooltip_showing &&
      this.game?.tooltip_manager?.needsLiveUpdates
    ) {
      this.game.performance.markStart("ui_tooltip_update");
      this.game.tooltip_manager.update();
      this.game.performance.markEnd("ui_tooltip_update");
    }

    this.updateMeltdownState();
    this.updatePauseState();

    this.game.performance.markEnd("ui_update_total");
  }

  // Internal: render batched visual events - OPTIMIZED for performance
  _renderVisualEvents(events) {
    // Early return if no events - most common case after disabling visual events
    if (!events || !events.length) {
      return;
    }

    // Since we've disabled most visual events in the engine for performance,
    // this method now primarily handles only essential visual feedback
    const tileFor = (r, c) => (this.game?.tileset ? this.game.tileset.getTile(r, c) : null);

    for (const evt of events) {
      if (!evt) {
        continue;
      }

      // Only process essential visual events - most are disabled for performance
      if (evt.type === 'emit') {
        // Only handle critical visual feedback that doesn't impact performance
        if (evt.icon === 'power' && Array.isArray(evt.tile)) {
          const t = tileFor(evt.tile[0], evt.tile[1]);
          if (t) this.spawnTileIcon('power', t, null);
        } else if (evt.icon === 'heat' && evt.part === 'vent' && Array.isArray(evt.tile)) {
          const t = tileFor(evt.tile[0], evt.tile[1]);
          if (t) this.blinkVent(t);
        }
      } else if (evt.type === 'flow') {
        // Flow events are disabled for performance - skip processing
        continue;
      }
    }
  }
  // eslint-disable-next-line class-methods-use-this
  _ensureOverlay() {
    if (this._overlay && this._overlay.parentElement) return this._overlay;
    const reactorWrapper = this.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');
    if (!reactorWrapper) {
      return null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'reactor-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    reactorWrapper.style.position = reactorWrapper.style.position || 'relative';
    reactorWrapper.appendChild(overlay);
    this._overlay = overlay;
    return overlay;
  }


  _tileCenterToOverlayPosition(row, col) {
    const reactor = this.DOMElements.reactor;
    const overlay = this._ensureOverlay();
    if (!reactor || !overlay) return { x: 0, y: 0 };

    // Get the actual tile size from CSS custom property or fallback to measured size
    const computedTileSize = getComputedStyle(reactor).getPropertyValue('--tile-size');
    let tileSize = 48; // Default fallback

    if (computedTileSize) {
      // Parse the CSS value (e.g., "32px" -> 32)
      tileSize = parseInt(computedTileSize) || 48;
    } else {
      // Fallback to measuring an actual tile
      tileSize = reactor.querySelector('.tile')?.offsetWidth || 48;
    }

    // Get reactor and overlay positions
    const reactorRect = reactor.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();

    // Account for reactor padding (important for mobile grid alignment)
    const reactorStyle = getComputedStyle(reactor);
    const reactorPaddingLeft = parseFloat(reactorStyle.paddingLeft) || 0;
    const reactorPaddingTop = parseFloat(reactorStyle.paddingTop) || 0;

    // Account for tile border width (1px border on each side)
    const tileBorderWidth = 1;
    const totalTileSize = tileSize + (tileBorderWidth * 2);

    // Check if there's a specific tile at this position to get exact coordinates
    const targetTile = reactor.querySelector(`[data-row="${row}"][data-col="${col}"]`) ||
      reactor.querySelector(`.tile:nth-child(${row * parseInt(getComputedStyle(reactor).getPropertyValue('--game-cols') || 12) + col + 1})`);

    if (targetTile) {
      // Use the actual tile position for perfect alignment
      const tileRect = targetTile.getBoundingClientRect();
      const x = tileRect.left + (tileRect.width / 2) - overlayRect.left;
      const y = tileRect.top + (tileRect.height / 2) - overlayRect.top;
      return { x, y };
    }

    // Fallback: Calculate position using the grid system
    // The grid starts at the reactor's position, plus padding, plus the tile offset
    const x = reactorRect.left + reactorPaddingLeft + (col * totalTileSize) + (totalTileSize / 2) - overlayRect.left;
    const y = reactorRect.top + reactorPaddingTop + (row * totalTileSize) + (totalTileSize / 2) - overlayRect.top;

    return { x, y };
  }



  // Note: Power/heat emission and flow visualization methods removed for performance
  // Vent spinning is preserved in blinkVent() method




  processUpdateQueue() {
    if (this.update_vars.size === 0) return;
    for (const [key, value] of this.update_vars) {
      const config = this.var_objs_config[key];
      if (!config) {
        continue;
      }
      if (config.dom) {
        let textContent = config.num ? fmt(value, config.places) : value;
        if (config.prefix) textContent = config.prefix + textContent;
        config.dom.textContent = textContent;
      }
      config.onupdate?.(value);
    }

    // Add this line to update objectives progress continuously
    this.updateObjectiveDisplay();

    this.update_vars.clear();
  }

  initVarObjsConfig() {
    // Helper function to get the appropriate DOM element based on screen size
    const getInfoElement = (mobileId, desktopId) => {
      const isDesktop = window.innerWidth >= 901;
      const elementId = isDesktop ? desktopId : mobileId;
      return document.getElementById(elementId);
    };

    this.var_objs_config = {
      current_money: {
        dom: getInfoElement("info_money", "info_money_desktop"),
        num: true,
        onupdate: (val) => {
          // Update both mobile and desktop elements
          const mobileEl = document.getElementById("info_money");
          const desktopEl = document.getElementById("info_money_desktop");
          if (mobileEl) mobileEl.textContent = fmt(val);
          if (desktopEl) desktopEl.textContent = fmt(val);
        }
      },
      current_power: {
        dom: getInfoElement("info_power", "info_power_desktop"),
        num: true,
        onupdate: (val) => {
          // Update both mobile and desktop elements
          const mobileEl = document.getElementById("info_power");
          const desktopEl = document.getElementById("info_power_desktop");
          if (mobileEl) mobileEl.textContent = fmt(val);
          if (desktopEl) desktopEl.textContent = fmt(val);

          // Update denominators
          const mobileDenom = document.getElementById("info_power_denom");
          const desktopDenom = document.getElementById("info_power_denom_desktop");
          const maxPower = this.stateManager.getVar("max_power") || "";
          if (mobileDenom) mobileDenom.textContent = "/" + fmt(maxPower);
          if (desktopDenom) desktopDenom.textContent = "/" + fmt(maxPower);

          // Update fill indicator
          this.updateInfoBarFillIndicator("power", val, maxPower);
        },
      },
      max_power: {
        dom: getInfoElement("info_power_denom", "info_power_denom_desktop"),
        num: true,
        onupdate: (val) => {
          const mobileDenom = document.getElementById("info_power_denom");
          const desktopDenom = document.getElementById("info_power_denom_desktop");
          if (mobileDenom) mobileDenom.textContent = "/" + fmt(val);
          if (desktopDenom) desktopDenom.textContent = "/" + fmt(val);
        },
      },
      current_heat: {
        dom: getInfoElement("info_heat", "info_heat_desktop"),
        num: true,
        places: 2,
        onupdate: (val) => {
          // Update both mobile and desktop elements
          const mobileEl = document.getElementById("info_heat");
          const desktopEl = document.getElementById("info_heat_desktop");
          const isMobile = typeof window !== 'undefined' && window.innerWidth <= 900;
          if (mobileEl) mobileEl.textContent = fmt(val, isMobile ? 0 : 2);
          if (desktopEl) desktopEl.textContent = fmt(val, 2);

          // Update denominators
          const mobileDenom = document.getElementById("info_heat_denom");
          const desktopDenom = document.getElementById("info_heat_denom_desktop");
          const maxHeat = this.stateManager.getVar("max_heat") || "";
          if (mobileDenom) mobileDenom.textContent = "/" + fmt(maxHeat);
          if (desktopDenom) desktopDenom.textContent = "/" + fmt(maxHeat);

          // Update fill indicator
          this.updateInfoBarFillIndicator("heat", val, maxHeat);
        },
      },
      max_heat: {
        dom: getInfoElement("info_heat_denom", "info_heat_denom_desktop"),
        num: true,
        onupdate: (val) => {
          const mobileDenom = document.getElementById("info_heat_denom");
          const desktopDenom = document.getElementById("info_heat_denom_desktop");
          if (mobileDenom) mobileDenom.textContent = "/" + fmt(val);
          if (desktopDenom) desktopDenom.textContent = "/" + fmt(val);
        },
      },
      exotic_particles: {
        num: true,
        onupdate: (val) => {
          if (this.DOMElements.reboot_exotic_particles) {
            this.DOMElements.reboot_exotic_particles.textContent = fmt(val);
          }
        },
      },
      current_exotic_particles: {
        dom: this.DOMElements.current_exotic_particles,
        num: true,
        onupdate: (val) => {
          const shouldShow = val > 0;
          const gameEP = this.game?.exotic_particles ?? 'N/A';
          const stateManagerEP = this.stateManager.getVar("current_exotic_particles") ?? 'N/A';
          console.log(`[EP-DISPLAY DEBUG] onupdate called: val=${val}, shouldShow=${shouldShow}, game.exotic_particles=${gameEP}, stateManager.current_exotic_particles=${stateManagerEP}`);
          const mobileEl = document.getElementById("info_ep");
          const desktopEl = document.getElementById("info_ep_desktop");
          const mobileValueEl = document.getElementById("info_ep_value");
          const desktopValueEl = document.getElementById("info_ep_value_desktop");

          console.log(`[EP-DISPLAY DEBUG] Elements found: mobileEl=${!!mobileEl}, desktopEl=${!!desktopEl}, mobileValueEl=${!!mobileValueEl}, desktopValueEl=${!!desktopValueEl}`);

          if (mobileEl) {
            const content = mobileEl.querySelector('.ep-content');
            console.log(`[EP-DISPLAY DEBUG] Mobile content element: ${!!content}, setting display to ${shouldShow ? "flex" : "none"}`);
            if (content) {
              content.style.display = shouldShow ? "flex" : "none";
              console.log(`[EP-DISPLAY DEBUG] Mobile content display after update: ${content.style.display}`);
            } else {
              console.log(`[EP-DISPLAY DEBUG] Mobile .ep-content element not found`);
            }
          }
          if (desktopEl) {
            const content = desktopEl.querySelector('.ep-content');
            console.log(`[EP-DISPLAY DEBUG] Desktop content element: ${!!content}, setting display to ${shouldShow ? "flex" : "none"}`);
            if (content) {
              content.style.display = shouldShow ? "flex" : "none";
              console.log(`[EP-DISPLAY DEBUG] Desktop content display after update: ${content.style.display}`);
            } else {
              console.log(`[EP-DISPLAY DEBUG] Desktop .ep-content element not found`);
            }
          }

          if (shouldShow) {
            if (mobileValueEl) {
              mobileValueEl.textContent = fmt(val);
              console.log(`[EP-DISPLAY DEBUG] Mobile value updated to: ${fmt(val)}`);
            }
            if (desktopValueEl) {
              desktopValueEl.textContent = fmt(val);
              console.log(`[EP-DISPLAY DEBUG] Desktop value updated to: ${fmt(val)}`);
            }
          }

          if (this.DOMElements.current_exotic_particles) {
            this.DOMElements.current_exotic_particles.textContent = fmt(val);
            console.log(`[EP-DISPLAY DEBUG] DOMElements.current_exotic_particles updated to: ${fmt(val)}`);
          }
        },
      },
      total_exotic_particles: {
        dom: this.DOMElements.total_exotic_particles,
        num: true,
        onupdate: (val) => {
          if (this.DOMElements.total_exotic_particles) {
            this.DOMElements.total_exotic_particles.textContent = fmt(val);
          }
          const reboot_val = this.stateManager.getVar("exotic_particles") || 0;
          if (this.DOMElements.refund_exotic_particles) {
            this.DOMElements.refund_exotic_particles.textContent = fmt(val + reboot_val);
          }
        },
      },
      stats_power: {
        dom: this.DOMElements.stats_power,
        num: true,
        onupdate: (val) => {
          if (!this.DOMElements.stats_power) {
            // DOM element missing
          }

        },
      },
      total_heat: {
        dom: this.DOMElements.stats_heat,
        num: true,
        places: 0,
        onupdate: (val) => {
          if (!this.DOMElements.stats_heat) {
            // DOM element missing
          }
        },
      },
      // Remove autosell cash from reactor_stats; keep mapping undefined to avoid updates
      // stats_cash intentionally not bound (feature disabled)
      engine_status: {
        onupdate: (val) => {
          const indicator = this.DOMElements.engine_status_indicator;
          if (!indicator) return;

          // Remove all status classes
          indicator.classList.remove('engine-running', 'engine-paused', 'engine-stopped', 'engine-tick');

          // Add appropriate status class
          if (val === 'running') {
            indicator.classList.add('engine-running');
          } else if (val === 'paused') {
            indicator.classList.add('engine-paused');
          } else if (val === 'stopped') {
            indicator.classList.add('engine-stopped');
          } else if (val === 'tick') {
            indicator.classList.add('engine-tick');
            // Remove tick class after animation completes
            setTimeout(() => {
              if (indicator.classList.contains('engine-tick')) {
                indicator.classList.remove('engine-tick');
                // Restore the appropriate status
                const currentStatus = this.game.engine.running ?
                  (this.game.paused ? 'paused' : 'running') : 'stopped';
                indicator.classList.add(`engine-${currentStatus}`);
              }
            }, 100);
          }
        }
      },
      stats_outlet: {
        dom: this.DOMElements.stats_outlet,
        num: true,
        places: 0,
      },
      stats_inlet: { dom: this.DOMElements.stats_inlet, num: true, places: 0 },
      stats_vent: { dom: this.DOMElements.stats_vent, num: true, places: 0 },
      stats_total_part_heat: {
        dom: this.DOMElements.stats_total_part_heat,
        num: true,
        places: 0,
      },
      auto_sell: {
        onupdate: (val) =>
          this.updateToggleButtonState(
            this.toggle_buttons_config.auto_sell,
            val
          ),
      },
      auto_buy: {
        onupdate: (val) =>
          this.updateToggleButtonState(
            this.toggle_buttons_config.auto_buy,
            val
          ),
      },
      heat_control: {
        onupdate: (val) =>
          this.updateToggleButtonState(
            this.toggle_buttons_config.heat_control,
            val
          ),
      },
      time_flux: {
        onupdate: (val) =>
          this.updateToggleButtonState(
            this.toggle_buttons_config.time_flux,
            val
          ),
      },
      pause: {
        id: "pause_toggle",
        stateProperty: "pause",
        onupdate: (val) => {
          this.updateToggleButtonState(this.toggle_buttons_config.pause, val);
          const pauseBtn = this.DOMElements.pause_toggle;
          if (pauseBtn) {
            if (val) {
              pauseBtn.classList.add("paused");
              pauseBtn.title = "Resume";
            } else {
              pauseBtn.classList.remove("paused");
              pauseBtn.title = "Pause";
            }
          }
          // Body class and banner visibility are now handled by updatePauseState()

          // Clear all active animations when pausing to prevent visual spam
          if (val) {
            this.clearAllActiveAnimations();
          }

          // Update engine status indicator and start/stop engine
          if (this.game && this.game.engine) {
            if (val) {
              // Pausing - stop the engine
              this.game.engine.stop();
              this.stateManager.setVar("engine_status", "paused");
            } else {
              // Unpausing - start the engine
              this.game.engine.start();
              this.stateManager.setVar("engine_status", "running");
            }
          }
        },
      },
      melting_down: {
        onupdate: (val) => {
          // This is handled by updateMeltdownState()
          // Clear animations when meltdown occurs to prevent visual spam
          if (val) {
            this.clearAllActiveAnimations();
          }
        },
      },
    };
  }

  updatePercentageBar(currentKey, maxKey, domElement) {
    if (!domElement) return;
    const current = this.stateManager.getVar(currentKey) || 0;
    const max = this.stateManager.getVar(maxKey) || 1;
    domElement.style.width = `${Math.min(
      100,
      Math.max(0, (current / max) * 100)
    )}%`;
  }

  updateHeatVisuals() {
    const current = this.stateManager.getVar("current_heat") || 0;
    const max = this.stateManager.getVar("max_heat") || 1;
    const background = this.DOMElements.reactor_background;
    if (!background) return;

    // Calculate heat ratio (0.0 to 1.0+)
    const heatRatio = current / max;

    // Remove existing heat classes
    background.classList.remove("heat-warning", "heat-critical");

    // Create a smooth red tint based on heat ratio
    if (heatRatio <= 0.5) {
      // No tint when heat is below 50% of max
      background.style.backgroundColor = "transparent";
    } else if (heatRatio <= 1.0) {
      // Gradual red tint from 50% to 100% of max heat
      const intensity = (heatRatio - 0.5) * 2; // 0.0 to 1.0
      const alpha = Math.min(intensity * 0.2, 0.2); // Max 20% opacity (reduced from 30%)
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      // Add warning glow when approaching max heat
      if (heatRatio >= 0.8) {
        background.classList.add("heat-warning");
      }
    } else if (heatRatio <= 1.5) {
      // Stronger red tint when exceeding max heat
      const intensity = (heatRatio - 1.0) * 2; // 0.0 to 1.0
      const alpha = 0.2 + (intensity * 0.3); // 20% to 50% opacity (reduced from 30% to 70%)
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      // Add warning glow
      background.classList.add("heat-warning");

      // Add critical glow when significantly exceeding max heat
      if (heatRatio >= 1.3) {
        background.classList.add("heat-critical");
      }
    } else {
      // Maximum red tint for critical heat levels (reduced from 70% to 50%)
      background.style.backgroundColor = "rgba(255, 0, 0, 0.5)";

      // Add critical glow
      background.classList.add("heat-critical");
    }

    // NEW: Add wiggle effect to individual tiles nearing their heat capacity
    if (this.game?.tileset?.active_tiles_list) {
      this.game.tileset.active_tiles_list.forEach((tile) => {
        if (tile.$el && tile.part && tile.part.containment > 0) {
          const heatRatio = tile.heat_contained / tile.part.containment;
          if (heatRatio >= 0.9) {
            tile.$el.classList.add("heat-wiggle");
          } else {
            tile.$el.classList.remove("heat-wiggle");
          }
        }
      });
    }
  }

  // Spawn a transient icon representing power/heat on the grid - OPTIMIZED for performance
  // kind: 'power' | 'heat' | 'vent'
  // fromTile: Tile instance to start from
  // toTile: optional Tile instance to travel to
  spawnTileIcon(kind, fromTile, toTile = null) {
    try {
      // Early validation - most performance critical
      if (
        typeof document === "undefined" ||
        !fromTile?.$el ||
        (!this.DOMElements?.reactor_background && !document.getElementById)
      )
        return;

      // Create a unique key for this animation
      const animationKey = `${fromTile.row}-${fromTile.col}-${kind}`;
      if (toTile) {
        animationKey += `-to-${toTile.row}-${toTile.col}`;
      }

      // Check if this animation is already running - prevent duplicate animations
      if (this._activeTileIcons.has(animationKey)) {
        return;
      }

      const container =
        this.DOMElements.reactor_background ||
        document.getElementById("reactor_background");
      if (!container) return;

      // Use cached icon sources for better performance
      const iconSrcMap = {
        power: "img/ui/icons/icon_power.png",
        heat: "img/ui/icons/icon_heat.png",
        vent: "img/ui/icons/icon_vent.png",
      };
      const src = iconSrcMap[kind];
      if (!src) return;

      // Cache DOM measurements to avoid repeated getBoundingClientRect calls
      const startRect = fromTile.$el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const img = document.createElement("img");
      img.src = src;
      img.alt = kind;
      img.className = `tile-fx fx-${kind}`;

      // Optimize size calculation - cache computed style
      const tileSize = this._cachedTileSize ||
        Math.max(12, Math.min(18, parseInt(getComputedStyle(this.DOMElements.reactor).getPropertyValue('--tile-size')) / 3 || 16));
      if (!this._cachedTileSize) this._cachedTileSize = tileSize;

      img.style.width = `${tileSize}px`;
      img.style.height = `${tileSize}px`;

      // Start at center of fromTile with optimized offset calculation
      const startOffset = (kind === 'power') ? { x: 6, y: -6 } : (kind === 'heat') ? { x: -6, y: 6 } : { x: 0, y: 0 };
      const startLeft = startRect.left - containerRect.left + startRect.width / 2 - tileSize / 2 + startOffset.x;
      const startTop = startRect.top - containerRect.top + startRect.height / 2 - tileSize / 2 + startOffset.y;
      img.style.left = `${startLeft}px`;
      img.style.top = `${startTop}px`;

      // Mark this animation as active
      this._activeTileIcons.set(animationKey, img);
      container.appendChild(img);

      // Use requestAnimationFrame for smooth animation
      requestAnimationFrame(() => {
        if (toTile?.$el) {
          const endRect = toTile.$el.getBoundingClientRect();
          const endLeft = endRect.left - containerRect.left + endRect.width / 2 - tileSize / 2;
          const endTop = endRect.top - containerRect.top + endRect.height / 2 - tileSize / 2;

          img.style.left = `${endLeft}px`;
          img.style.top = `${endTop}px`;
          // Slight fade on move for heat
          if (kind === "heat") img.style.opacity = "0.75";
        } else {
          // No destination: quick fade out in place (power)
          img.classList.add("fx-fade-out");
        }

        // Cleanup after animation - use shorter timeout for better performance
        setTimeout(() => {
          if (img && img.parentNode) img.parentNode.removeChild(img);
          this._activeTileIcons.delete(animationKey);
        }, 300); // Reduced from 450ms for better performance
      });
    } catch (_) {
      // No-op on environments without DOM
    }
  }

  // Ensure an animated vent rotor exists and trigger a brief spin - OPTIMIZED for performance
  blinkVent(tile) {
    try {
      // Early validation
      if (typeof document === "undefined" || !tile?.$el) return;

      // Check if this tile already has an active vent rotor animation
      if (this._activeVentRotors.has(tile)) {
        return;
      }

      let rotor = tile.$el.querySelector(".vent-rotor");
      if (!rotor) {
        rotor = document.createElement("span");
        rotor.className = "vent-rotor";
        tile.$el.appendChild(rotor);

        // Cache the sprite path to avoid repeated function calls
        try {
          if (tile?.part && typeof tile.part.getImagePath === 'function') {
            const sprite = tile.part.getImagePath();
            if (sprite) {
              rotor.style.backgroundImage = `url('${sprite}')`;
            }
          }
        } catch (_) { /* ignore */ }
      }

      // Mark this tile as having an active animation
      this._activeVentRotors.add(tile);

      // Optimize animation restart - use classList.toggle for better performance
      rotor.classList.remove("spin");
      // Force reflow for animation restart
      void rotor.offsetWidth;
      rotor.classList.add("spin");

      // Auto-remove the class after a shorter duration for better performance
      setTimeout(() => {
        if (!rotor || !rotor.parentNode) return;
        rotor.classList.remove("spin");

        // Remove from active animations set
        this._activeVentRotors.delete(tile);

        // If the tile is no longer a vent, remove the rotor element entirely
        const isVent = tile?.part?.category === 'vent';
        if (!isVent) {
          rotor.parentNode.removeChild(rotor);
        }
      }, 300); // Reduced from 450ms for better performance
    } catch (_) {
      // ignore
    }
  }

  // Utility: remove lingering vent rotor if present (e.g., after part removal)
  _cleanupVentRotor(tile) {
    try {
      if (!tile?.$el) return;
      const rotor = tile.$el.querySelector('.vent-rotor');
      if (rotor && tile?.part?.category !== 'vent') {
        rotor.parentNode.removeChild(rotor);
      }
      // Remove from active animations if present
      this._activeVentRotors.delete(tile);
    } catch (_) { /* ignore */ }
  }

  // Clear all active animations (useful for cleanup or when game state changes)
  clearAllActiveAnimations() {
    // Clear vent rotor animations
    this._activeVentRotors.clear();

    // Flow indicators removed for performance

    // Clear tile icon animations
    this._activeTileIcons.forEach((icon) => {
      if (icon && icon.parentElement) {
        icon.parentElement.removeChild(icon);
      }
    });
    this._activeTileIcons.clear();
  }

  // Get animation status for debugging
  getAnimationStatus() {
    return {
      activeVentRotors: this._activeVentRotors.size,
      activeTileIcons: this._activeTileIcons.size,
      totalActiveAnimations: this._activeVentRotors.size + this._activeTileIcons.size
    };
  }

  // Debug method to log current animation status
  logAnimationStatus() {
    const status = this.getAnimationStatus();
    // Animation status logging removed for cleaner console
  }

  // Clear all reactor heat (hotkey: Ctrl+H)
  clearReactorHeat() {
    if (!this.game || !this.game.reactor) return;

    try {
      // Clear reactor heat
      this.game.reactor.current_heat = 0;

      // Clear all tile heat
      if (this.game.tileset && this.game.tileset.active_tiles_list) {
        this.game.tileset.active_tiles_list.forEach(tile => {
          if (tile.heat_contained !== undefined) {
            tile.heat_contained = 0;
          }
          if (tile.heat !== undefined) {
            tile.heat = 0;
          }
          if (tile.display_heat !== undefined) {
            tile.display_heat = 0;
          }
        });
      }

      // Update UI displays
      if (this.stateManager) {
        this.stateManager.setVar("current_heat", 0);
        this.stateManager.setVar("total_heat", 0);
      }

      // Clear any active heat flow animations
      this.clearAllActiveAnimations();

      // Optional: Show feedback to user
      console.log("Reactor heat cleared!");
    } catch (error) {
      console.error("Error clearing reactor heat:", error);
    }
  }

  // Pulse a subtle aura from a reflector towards a target cell
  pulseReflector(fromTile, toTile) {
    try {
      if (!fromTile?.$el || !toTile?.$el) return;
      const container = this.DOMElements.reactor_background || document.getElementById('reactor_background');
      if (!container) return;
      const size = 12;
      const aura = document.createElement('div');
      aura.className = 'reflector-aura';
      const fromRect = fromTile.$el.getBoundingClientRect();
      const toRect = toTile.$el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const x1 = fromRect.left - cRect.left + fromRect.width / 2;
      const y1 = fromRect.top - cRect.top + fromRect.height / 2;
      const x2 = toRect.left - cRect.left + toRect.width / 2;
      const y2 = toRect.top - cRect.top + toRect.height / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      aura.style.left = `${x1 - size / 2}px`;
      aura.style.top = `${y1 - size / 2}px`;
      aura.style.width = `${size}px`;
      aura.style.height = `${size}px`;
      aura.style.transform = `rotate(${angle}deg)`;
      container.appendChild(aura);
      requestAnimationFrame(() => aura.classList.add('active'));
      setTimeout(() => aura.remove(), 450);
    } catch (_) { /* ignore */ }
  }

  // Emit a transient EP icon that travels from a tile towards the EP display
  emitEP(fromTile) {
    try {
      if (!fromTile?.$el) return;
      const container = this.DOMElements.reactor_background || document.getElementById('reactor_background');
      if (!container) return;
      const src = 'img/ui/icons/icon_power.png'; // reuse closest visual; custom EP icon can be added later
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'ep';
      img.className = 'tile-fx fx-ep';
      const startRect = fromTile.$el.getBoundingClientRect();
      const cRect = container.getBoundingClientRect();
      const size = 14;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      const startLeft = startRect.left - cRect.left + startRect.width / 2 - size / 2;
      const startTop = startRect.top - cRect.top + startRect.height / 2 - size / 2;
      img.style.left = `${startLeft}px`;
      img.style.top = `${startTop}px`;
      container.appendChild(img);
      // Find EP display target (desktop then mobile)
      const epEl = document.getElementById('info_ep_desktop') || document.getElementById('info_ep');
      const valueEl = document.getElementById('info_ep_value_desktop') || document.getElementById('info_ep_value');
      const targetEl = valueEl || epEl;
      requestAnimationFrame(() => {
        if (targetEl) {
          const tRect = targetEl.getBoundingClientRect();
          const endLeft = tRect.left - cRect.left + tRect.width / 2 - size / 2;
          const endTop = tRect.top - cRect.top + tRect.height / 2 - size / 2;
          img.style.left = `${endLeft}px`;
          img.style.top = `${endTop}px`;
          img.style.opacity = '0.2';
        } else {
          img.classList.add('fx-fade-out');
        }
        setTimeout(() => img.remove(), 550);
      });
    } catch (_) { /* ignore */ }
  }

  updateInfoBarFillIndicator(type, current, max) {
    // Calculate percentage (0-100)
    const percentage = max > 0 ? Math.min(100, Math.max(0, (current / max) * 100)) : 0;
    const isFull = percentage >= 100;

    // Get all relevant elements for both desktop and mobile
    const desktopElement = document.querySelector(`.info-bar-desktop .info-item.${type}`);
    const mobileElement = document.querySelector(`#info_bar .info-row.info-main .info-item.${type}`);

    // Update desktop fill indicator
    if (desktopElement) {
      const afterElement = desktopElement.querySelector('::after') || desktopElement;
      // Use CSS custom property to set the height
      desktopElement.style.setProperty('--fill-height', `${percentage}%`);

      // Add/remove full animation class
      if (isFull) {
        desktopElement.classList.add('full');
      } else {
        desktopElement.classList.remove('full');
      }
    }

    // Update mobile fill indicator
    if (mobileElement) {
      const afterElement = mobileElement.querySelector('::after') || mobileElement;
      // Use CSS custom property to set the height
      mobileElement.style.setProperty('--fill-height', `${percentage}%`);

      // Add/remove full animation class
      if (isFull) {
        mobileElement.classList.add('full');
      } else {
        mobileElement.classList.remove('full');
      }
    }
  }

  async init(game) {
    await ensureDataLoaded();

    // Handle ES module format
    const data = help_text.default || help_text;

    this.game = game;
    this.stateManager = new StateManager(this);
    this.hotkeys = new Hotkeys();
    this.help_text = data;

    // Clear any existing animations when initializing
    this.clearAllActiveAnimations();

    return true;
  }

  initMainLayout() {
    this.cacheDOMElements();
    this.initVarObjsConfig();
    this.setupEventListeners();
    this.initializeToggleButtons();
    this.setupPartsTabs();
    this.initializePartsPanel();
    this.addHelpButtonToMainPage();
    if (this.DOMElements.basic_overview_section && this.help_text.basic_overview) {
      this.DOMElements.basic_overview_section.innerHTML = `
        <h3>${this.help_text.basic_overview.title}</h3>
        <p>${this.help_text.basic_overview.content}</p>
        `;
    }
    if (this.gridScaler) this.gridScaler.init();

    this.gridScaler.resize();
    this.runUpdateInterfaceLoop();

    // Initialize engine status indicator
    if (this.game && this.game.engine) {
      const status = this.game.paused ? "paused" : (this.game.engine.running ? "running" : "stopped");
      this.stateManager.setVar("engine_status", status);
    }

    // Start performance tracking
    this.startPerformanceTracking();
  }

  resizeReactor() {
    this.gridScaler.resize();
  }



  forceReactorRealignment() {
    if (!this.game || !this.DOMElements.reactor) return;

    const reactor = this.DOMElements.reactor;
    const originalDisplay = reactor.style.display;
    reactor.style.display = "none";
    reactor.offsetHeight;
    reactor.style.display = originalDisplay;

    this.gridScaler.resize();
  }

  setupEventListeners() {
    const setupNav = (container, buttonClass) => {
      if (!container) return;

      container.addEventListener("click", (event) => {
        const button = event.target.closest(buttonClass);
        if (button?.dataset.page) {
          this.game.router.loadPage(button.dataset.page);
          container
            .querySelectorAll(buttonClass)
            .forEach((tab) => tab.classList.remove("active"));
          button.classList.add("active");
        }
      });
    };
    setupNav(this.DOMElements.bottom_nav, "div");
    setupNav(this.DOMElements.main_top_nav, "div");
    this.DOMElements.reboot_btn?.addEventListener("click", () =>
      this.game.reboot_action(false)
    );
    this.DOMElements.refund_btn?.addEventListener("click", () =>
      this.game.reboot_action(true)
    );
    this.updatePartsPanelBodyClass();
    document.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        if (!e.target.matches("input, textarea, [contenteditable]")) {
          e.preventDefault();
          const currentPauseState = this.stateManager.getVar("pause");
          this.stateManager.setVar("pause", !currentPauseState);
        }
      } else if (e.ctrlKey) {
        switch (e.key) {
          case "1":
            e.preventDefault();
            this.game.addMoney(10);
            break;
          case "2":
            e.preventDefault();
            this.game.addMoney(100);
            break;
          case "3":
            e.preventDefault();
            this.game.addMoney(1000);
            break;
          case "4":
            e.preventDefault();
            this.game.addMoney(10000);
            break;
          case "5":
            e.preventDefault();
            this.game.addMoney(100000);
            break;
          case "6":
            e.preventDefault();
            this.game.addMoney(1000000);
            break;
          case "7":
            e.preventDefault();
            this.game.addMoney(10000000);
            break;
          case "8":
            e.preventDefault();
            this.game.addMoney(100000000);
            break;
          case "9":
            e.preventDefault();
            // Start exponential money increase
            this.startCtrl9MoneyIncrease();
            break;
          case "e":
          case "E":
            e.preventDefault();
            // Give user +1 EP
            this.game.exotic_particles += 1;
            this.game.total_exotic_particles += 1;
            this.game.current_exotic_particles += 1;

            // Update state manager for all EP values
            this.stateManager.setVar("exotic_particles", this.game.exotic_particles);
            this.stateManager.setVar("total_exotic_particles", this.game.total_exotic_particles);
            this.stateManager.setVar("current_exotic_particles", this.game.current_exotic_particles);

            // Update research affordability after adding EP
            this.game.upgradeset.check_affordability(this.game);
            break;
          case "x":
          case "X":
            e.preventDefault();
            // Complete current objective for testing/review
            if (this.game.objectives_manager && this.game.objectives_manager.current_objective_def) {
              // Mark the current objective as completed
              this.game.objectives_manager.current_objective_def.completed = true;
              this.game.ui.stateManager.handleObjectiveCompleted();

              // Update the UI to show completed state with claim button
              const displayObjective = {
                ...this.game.objectives_manager.current_objective_def,
                title: typeof this.game.objectives_manager.current_objective_def.title === "function"
                  ? this.game.objectives_manager.current_objective_def.title()
                  : this.game.objectives_manager.current_objective_def.title,
                completed: true
              };
              this.game.ui.stateManager.handleObjectiveLoaded(displayObjective, this.game.objectives_manager.current_objective_index);


            }
            break;
          case "u":
          case "U":
            e.preventDefault();
            // Unlock all parts for testing by setting placement counts to 10
            if (this.game.partset && this.game.partset.partsArray) {
              // Get all unique type:level combinations from all parts
              const typeLevelCombos = new Set();
              this.game.partset.partsArray.forEach(part => {
                if (part.type && part.level) {
                  typeLevelCombos.add(`${part.type}:${part.level}`);
                }
              });

              // Set all placement counts to 10 to unlock everything
              typeLevelCombos.forEach(combo => {
                this.game.placedCounts[combo] = 10;
              });

              // Refresh part affordability and UI
              this.game.partset.check_affordability(this.game);

              // Force refresh of parts panel to show all unlocked parts
              if (this.stateManager && typeof this.stateManager.refreshPartsPanel === 'function') {
                this.stateManager.refreshPartsPanel();
              } else {
                // Fallback: manually refresh the parts display
                this.refreshPartsDisplay();
              }


            }
            break;
          case "h":
          case "H":
            e.preventDefault();
            // Clear all reactor heat
            this.clearReactorHeat();
            break;
          case "0":
            e.preventDefault();
            console.log("CTRL+0 pressed");
            // Add 10 ticks to time flux accumulator
            if (this.game.engine) {
              console.log("Adding 10 ticks to time flux accumulator");
              console.log("Time flux accumulator:", this.game.engine.time_accumulator);
              this.game.engine.addTimeTicks(1000);
              console.log("Time flux accumulator after adding 10 ticks:", this.game.engine.time_accumulator);
            }
            break;
        }
      }
    });

    // Handle keyup for CTRL+9 exponential money
    document.addEventListener("keyup", (e) => {
      if (e.ctrlKey && e.key === "9") {
        this.stopCtrl9MoneyIncrease();
      }
    });

    const fullscreenButton = this.DOMElements.fullscreen_toggle;
    if (fullscreenButton) {
      fullscreenButton.addEventListener("click", () => {
        this.toggleFullscreen();
      });
      document.addEventListener("fullscreenchange", () => {
        this.updateFullscreenButtonState();
      });
      this.updateFullscreenButtonState();
    }

    const settingsBtn = this.DOMElements.settings_btn;
    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => new SettingsModal().show());
    }

    let resizeTimeout;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.game && this.DOMElements.reactor && typeof window !== "undefined") {
          this.gridScaler.resize();
        }
        // Check objective text scrolling on resize
        if (this.game && this.game.ui && this.game.ui.stateManager) {
          this.game.ui.stateManager.checkObjectiveTextScrolling();
        }
      }, 100);
    });

    if (window.visualViewport) {
      let viewportTimeout;
      window.visualViewport.addEventListener("resize", () => {
        clearTimeout(viewportTimeout);
        viewportTimeout = setTimeout(() => {
          if (
            this.game &&
            this.DOMElements.reactor &&
            typeof window !== "undefined" &&
            window.innerWidth &&
            window.innerWidth <= 900
          ) {
            this.gridScaler.resize();
          }
        }, 150);
      });
    }

    if (this.DOMElements.splash_close_btn) {
      this.DOMElements.splash_close_btn.onclick = () => {
        // Navigate to root URL to show splash screen
        window.location.href = window.location.origin + window.location.pathname;
      };
    }

    const copyStateBtn = document.getElementById("copy_state_btn");
    if (copyStateBtn) {
      copyStateBtn.onclick = () => {
        const gameStateObject = this.game.getSaveState();
        const gameStateString = JSON.stringify(gameStateObject, null, 2);
        navigator.clipboard
          .writeText(gameStateString)
          .then(() => {
            const originalText = copyStateBtn.textContent;
            copyStateBtn.textContent = "Copied!";
            setTimeout(() => {
              copyStateBtn.textContent = originalText;
            }, 2000);
          })
          .catch((err) => {
            console.error("Failed to copy game state: ", err);
            const originalText = copyStateBtn.textContent;
            copyStateBtn.textContent = "Error!";
            setTimeout(() => {
              copyStateBtn.textContent = originalText;
            }, 2000);
          });
      };
    }

    // Re-enable click handlers for info bar items (both mobile and desktop)
    const heatItems = document.querySelectorAll(".info-item.heat");
    heatItems.forEach(heatItem => {
      heatItem.onclick = () => {
        if (this.game) this.game.manual_reduce_heat_action();
      };
    });

    const powerItems = document.querySelectorAll(".info-item.power");
    powerItems.forEach(powerItem => {
      powerItem.onclick = () => {
        if (this.game) this.game.sell_action();
      };
    });

    // Handle both mobile and desktop button IDs
    const heatBtnIds = ["info_bar_heat_btn", "info_bar_heat_btn_desktop"];
    const powerBtnIds = ["info_bar_power_btn", "info_bar_power_btn_desktop"];

    heatBtnIds.forEach(btnId => {
      document.getElementById(btnId)?.addEventListener("click", function () {
        if (window.game) window.game.manual_reduce_heat_action();
      });
    });

    powerBtnIds.forEach(btnId => {
      document.getElementById(btnId)?.addEventListener("click", function () {
        if (window.game) window.game.sell_action();
      });
    });

    // Add segment visualization event listeners
    const reactorElement = this.DOMElements.reactor;
    if (reactorElement) {
      const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];

      reactorElement.addEventListener('pointermove', (e) => {
        const clickedPart = this.stateManager.getClickedPart();
        if (!clickedPart || !heatComponentCategories.includes(clickedPart.category)) {
          this.clearSegmentHighlight();
          return;
        }

        const tileEl = e.target.closest('.tile');
        if (tileEl && tileEl.tile) {
          const currentSegment = this.game.engine.heatManager.getSegmentForTile(tileEl.tile);

          if (currentSegment !== this.highlightedSegment) {
            this.clearSegmentHighlight();

            if (currentSegment) {
              for (const component of currentSegment.components) {
                component.highlight();
              }
              this.highlightedSegment = currentSegment;
            }
          }
        }
      });

      reactorElement.addEventListener('pointerleave', () => {
        this.clearSegmentHighlight();
      });
    }

    // NEW: Objectives UI event listeners
    this.initObjectivesUIListeners();
  }

  // NEW METHOD for objective UI listeners
  initObjectivesUIListeners() {
    const header = this.DOMElements.objectives_header;
    const claimBtn = this.DOMElements.objective_claim_btn;
    const claimBtnCompact = this.DOMElements.objective_claim_btn_compact;
    const chapterClaimBtn = this.DOMElements.objective_claim_chapter_btn;
    const chapterClaimBtnCompact = this.DOMElements.objective_claim_chapter_btn_compact;

    if (header) {
      header.addEventListener('click', () => this.toggleObjectivesPanel());
    }

    if (claimBtn) {
      claimBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent expanding the objectives panel
        if (!claimBtn.disabled) {
          this.game.objectives_manager.claimObjective();
        }
      });
    }

    if (claimBtnCompact) {
      claimBtnCompact.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent expanding the objectives panel
        if (!claimBtnCompact.disabled) {
          this.game.objectives_manager.claimObjective();
        }
      });
    }

    if (chapterClaimBtn) {
      chapterClaimBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent expanding the objectives panel
        if (!chapterClaimBtn.disabled) {
          this.game.objectives_manager.claimObjective();
        }
      });
    }

    if (chapterClaimBtnCompact) {
      chapterClaimBtnCompact.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent expanding the objectives panel
        if (!chapterClaimBtnCompact.disabled) {
          this.game.objectives_manager.claimObjective();
        }
      });
    }
  }

  // NEW METHOD to toggle the panel
  toggleObjectivesPanel() {
    const container = this.DOMElements.objectives_container;
    if (container) {
      const isOpen = container.classList.toggle('is-open');
      const toggleBtn = this.DOMElements.objectives_toggle_btn;
      if (toggleBtn) {
        toggleBtn.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
      }
      if (this.game && this.game.audio) {
        this.game.audio.play('click');
      }
    }
  }

  // NEW METHOD to update the entire objectives display
  updateObjectiveDisplay() {
    // Check if game and objectives_manager are properly initialized
    if (!this.game || !this.game.objectives_manager) {
      return;
    }

    const info = this.game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;

    // Update Titles
    if (this.DOMElements.objective_current_title) {
      this.DOMElements.objective_current_title.innerHTML = this.stateManager.addPartIconsToTitle(info.title);
    }
    if (this.DOMElements.objective_chapter_title) {
      this.DOMElements.objective_chapter_title.textContent = info.chapterName;
    }

    // Update Progress Bars & Text with smooth animation
    const progressBarContainer = this.DOMElements.objective_current_progress_bar?.parentElement;
    if (info.isComplete && progressBarContainer) {
      progressBarContainer.style.display = 'none';
    } else if (progressBarContainer) {
      progressBarContainer.style.display = 'flex';
    }

    if (this.DOMElements.objective_current_progress_bar) {
      this.DOMElements.objective_current_progress_bar.style.width = `${info.progressPercent}%`;
    }
    if (this.DOMElements.objective_chapter_progress_bar) {
      this.DOMElements.objective_chapter_progress_bar.style.width = `${info.chapterProgressPercent}%`;
    }
    if (this.DOMElements.objective_chapter_progress_text) {
      this.DOMElements.objective_chapter_progress_text.textContent = info.chapterProgressText;
    }

    // Update Detailed Info
    if (this.DOMElements.objective_current_description) {
      this.DOMElements.objective_current_description.innerHTML = this.stateManager.addPartIconsToTitle(info.description);
    }

    // Add Flavor Text - only show when objective is completed
    if (this.DOMElements.objective_flavor_text) {
      if (info.flavor_text && info.isComplete) {
        this.DOMElements.objective_flavor_text.textContent = info.flavor_text;
        this.DOMElements.objective_flavor_text.hidden = false;
      } else {
        this.DOMElements.objective_flavor_text.hidden = true;
      }
    }

    if (this.DOMElements.objective_current_progress_text) {
      this.DOMElements.objective_current_progress_text.textContent = info.progressText;
    }

    // Update Reward Display
    if (this.DOMElements.objective_reward) {
      let rewardHTML = '';
      if (info.reward.money > 0) {
        rewardHTML = `<img src="img/ui/icons/icon_cash.png" alt="Money"> ${info.reward.money.toLocaleString()}`;
      } else if (info.reward.ep > 0) {
        rewardHTML = `<img src="img/ui/icons/icon_power.png" alt="EP"> ${info.reward.ep.toLocaleString()} EP`;
      }
      this.DOMElements.objective_reward.innerHTML = rewardHTML;
    }

    // Update Claim Button State with animation (both compact and full)
    const isChapterObjective = info.isChapterCompletion || false;
    const normalClaimButtons = [
      this.DOMElements.objective_claim_btn,
      this.DOMElements.objective_claim_btn_compact
    ].filter(btn => btn);

    const chapterClaimButtons = [
      this.DOMElements.objective_claim_chapter_btn,
      this.DOMElements.objective_claim_chapter_btn_compact
    ].filter(btn => btn);

    // Show/hide appropriate buttons based on chapter completion
    if (normalClaimButtons.length > 0) {
      normalClaimButtons.forEach(btn => {
        btn.style.display = isChapterObjective ? 'none' : 'block';
      });
    }

    if (chapterClaimButtons.length > 0) {
      chapterClaimButtons.forEach(btn => {
        btn.style.display = isChapterObjective ? 'block' : 'none';
      });
    }

    const activeButtons = isChapterObjective ? chapterClaimButtons : normalClaimButtons;
    const activeButtonsFiltered = activeButtons.filter(btn => btn);

    if (activeButtonsFiltered.length > 0) {
      const wasComplete = activeButtonsFiltered[0].classList.contains('ready-to-claim');


      if (info.isComplete) {
        activeButtonsFiltered.forEach((btn, index) => {
          btn.disabled = false;
          btn.classList.add('ready-to-claim');

          if (isChapterObjective) {
            if (btn === this.DOMElements.objective_claim_chapter_btn_compact) {
              btn.textContent = "Complete";
            } else {
              btn.textContent = `Complete ${info.chapterName || 'Chapter'}`;
            }
          } else {
            btn.textContent = btn === this.DOMElements.objective_claim_btn_compact ? "Claim" : "Claim Reward";
          }

          if (btn === this.DOMElements.objective_claim_btn_compact || btn === this.DOMElements.objective_claim_chapter_btn_compact) {
            btn.classList.add('full-width');
          }
        });

        const headerActions = this.DOMElements.objective_claim_btn_compact?.parentElement;
        if (headerActions) {
          headerActions.classList.add('full-width');
        }

        // Add completion animation if this is a new completion
        if (!wasComplete) {
          this.animateObjectiveCompletion();
        }
      } else {
        activeButtonsFiltered.forEach(btn => {
          btn.disabled = true;
          btn.classList.remove('ready-to-claim');

          if (btn === this.DOMElements.objective_claim_btn_compact || btn === this.DOMElements.objective_claim_chapter_btn_compact) {
            btn.classList.remove('full-width');
          }

          // Show reward amount instead of "In Progress..."
          let rewardText = "In Progress...";
          if (info.reward.money > 0) {
            rewardText = btn === this.DOMElements.objective_claim_btn_compact
              ? `$${info.reward.money.toLocaleString()}`
              : `Reward: $${info.reward.money.toLocaleString()}`;
          } else if (info.reward.ep > 0) {
            rewardText = btn === this.DOMElements.objective_claim_btn_compact
              ? `${info.reward.ep.toLocaleString()} EP`
              : `Reward: ${info.reward.ep.toLocaleString()} EP`;
          }
          btn.textContent = rewardText;
        });

        const headerActions = this.DOMElements.objective_claim_btn_compact?.parentElement;
        if (headerActions) {
          headerActions.classList.remove('full-width');
        }
      }
    }
  }

  // NEW METHOD to animate objective completion
  animateObjectiveCompletion() {
    const container = this.DOMElements.objectives_container;
    if (!container) return;

    // Add completion class for CSS animation
    container.classList.add('objective-completed');

    // Remove the class after animation completes
    setTimeout(() => {
      container.classList.remove('objective-completed');
    }, 2000);
  }

  async handleGridInteraction(tileEl, event) {
    if (!tileEl || !tileEl.tile) return;

    if (this.game && this.game.reactor && this.game.reactor.has_melted_down) {
      return;
    }

    const startTile = tileEl.tile;
    const isRightClick =
      (event.pointerType === "mouse" && event.button === 2) ||
      event.type === "contextmenu";
    const clicked_part = this.stateManager.getClickedPart();
    const tilesToModify = this.hotkeys.getTiles(startTile, event);
    let soundPlayed = false;

    for (const tile of tilesToModify) {
      if (isRightClick) {
        if (tile.part && tile.part.id && !tile.part.isSpecialTile) {
          const moneyBefore = this.game.current_money;
          this.game.sellPart(tile);
          if (!soundPlayed && this.game && this.game.audio) {
            this.game.audio.play('sell');
            soundPlayed = true;
          }
        }
      } else {
        if (tile.part && this.help_mode_active) {
          if (this.game && this.game.tooltip_manager) {

            this.game.tooltip_manager.show(tile.part, tile, true);
          }
          return;
        }

        if (clicked_part) {
          if (this.game.current_money >= clicked_part.cost) {
            const moneyBefore = this.game.current_money;
            this.game.current_money -= clicked_part.cost;
            const partPlaced = await tile.setPart(clicked_part);
            if (partPlaced) {
              soundPlayed = true; // Sound is now handled in tile.setPart
            } else {
              // Refund the money if the part couldn't be placed (tile already occupied)
              this.game.current_money += clicked_part.cost;
              if (!soundPlayed && this.game && this.game.audio) {
                this.game.audio.play('error');
                soundPlayed = true;
              }
            }
          } else {
            if (!soundPlayed && this.game && this.game.audio) {
              this.game.audio.play('error');
              soundPlayed = true;
            }
          }
        }
      }
    }
  }

  updatePartsPanelBodyClass() {
    const partsSection = document.getElementById("parts_section");
    if (partsSection && !partsSection.classList.contains("collapsed")) {
      document.body.classList.add("parts-panel-open");
      if (partsSection.classList.contains("right-side")) {
        document.body.classList.add("parts-panel-right");
      } else {
        document.body.classList.remove("parts-panel-right");
      }
    } else {
      document.body.classList.remove("parts-panel-open");
      document.body.classList.remove("parts-panel-right");
    }
  }

  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("Error attempting to enable fullscreen:", err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.warn("Error attempting to exit fullscreen:", err);
        });
      }
    }
  }

  updateFullscreenButtonState() {
    const fullscreenButton = this.DOMElements.fullscreen_toggle;
    if (!fullscreenButton) return;

    if (document.fullscreenElement) {
      fullscreenButton.textContent = "⛶";
      fullscreenButton.title = "Exit Fullscreen";
    } else {
      fullscreenButton.textContent = "⛶";
      fullscreenButton.title = "Enter Fullscreen";
    }
  }

  updateTimeFluxButton(count) {
    const btn = this.DOMElements.time_flux_toggle;
    if (!btn) return;
    const label = btn.querySelector('.control-text');
    if (label) {
      const previousText = label.textContent;
      const previousHasQueue = btn.classList.contains('has-queue');
      const timeFluxEnabled = this.game && this.game.time_flux;
      
      if (count > 1) {
        label.textContent = `Time Flux (${count})`;
        btn.classList.add('has-queue');
      } else {
        label.textContent = `Time Flux`;
        btn.classList.remove('has-queue');
      }
      
      const hasQueueChanged = previousHasQueue !== btn.classList.contains('has-queue');
      if (this.game && this.game.logger && (previousText !== label.textContent || hasQueueChanged)) {
        this.game.logger.debug(`[TIME FLUX UI] Button state: "${label.textContent}", Queued ticks: ${count}, Time Flux: ${timeFluxEnabled ? 'ON' : 'OFF'}, Has queue class: ${btn.classList.contains('has-queue')}`);
      }
    }
  }

  initializePartsPanel() {
    const toggle = this.DOMElements.parts_panel_toggle;
    const panel = this.DOMElements.parts_section;

    if (toggle && panel) {
      // Remove existing event listeners if they exist
      if (this._partsPanelToggleHandler) {
        toggle.removeEventListener("click", this._partsPanelToggleHandler);
      }
      if (this._partsPanelResizeHandler) {
        window.removeEventListener("resize", this._partsPanelResizeHandler);
      }

      // Create and store the toggle handler
      this._partsPanelToggleHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
          panel.classList.toggle("collapsed");
          this.updatePartsPanelBodyClass();
          // Reposition tooltip if it's showing to avoid overlap
          if (this.game && this.game.tooltip_manager) {
            setTimeout(() => {
              this.game.tooltip_manager.reposition();
            }, 350);
          }
        }
      };

      // Create and store the resize handler
      this._partsPanelResizeHandler = () => {
        const isCurrentlyMobile = window.innerWidth <= 900;
        if (!isCurrentlyMobile) {
          panel.classList.remove("collapsed");
        }
        this.updatePartsPanelBodyClass();
      };

      // Add the event listeners
      toggle.addEventListener("click", this._partsPanelToggleHandler);
      window.addEventListener("resize", this._partsPanelResizeHandler);

      // Initialize the panel state based on screen size
      const isMobileOnLoad = window.innerWidth <= 900;
      if (isMobileOnLoad) {
        // Start with panel collapsed on mobile for better UX
        panel.classList.add("collapsed");
      } else {
        // Desktop: always start open and stay open
        panel.classList.remove("collapsed");
      }
      this.updatePartsPanelBodyClass();

      // Initialize the selected part icon
      this.stateManager.updatePartsPanelToggleIcon(null);
    }
  }



  renderUpgrade(upgrade) {
    const btn = document.createElement("button");
    btn.className = "upgrade";
    btn.dataset.id = upgrade.id;

    const image = document.createElement("div");
    image.className = "image";
    image.style.backgroundImage = `url(${upgrade.image})`;
    btn.appendChild(image);

    if (upgrade.cost !== undefined) {
      const price = document.createElement("div");
      price.className = "upgrade-price";
      price.textContent = fmt(upgrade.cost);
      btn.appendChild(price);
    }

    if (upgrade.level !== undefined) {
      const levels = document.createElement("div");
      levels.className = "levels";
      levels.textContent = `${upgrade.level}/${upgrade.max_level}`;
      btn.appendChild(levels);
    }



    return btn;
  }

  async showDetailedQuickStart() {
    try {
      const response = await fetch("pages/detailed-quick-start.html");
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const html = await response.text();

      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = html;
      document.body.appendChild(modal);

      document.getElementById("quick-start-close-detailed").onclick = () => {
        modal.remove();
      };
    } catch (error) {
      console.error("Failed to load detailed quick start modal:", error);
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = `
        <div class="quick-start-overlay">
          <div class="quick-start-content">
            <h2>Getting Started Guide</h2>
            <p>Follow the objectives at the top to continue the tutorial!</p>
            <button id="quick-start-close-detailed-fallback" class="btn-start">Got it!</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      document.getElementById("quick-start-close-detailed-fallback").onclick =
        () => {
          modal.remove();
        };
    }
  }

  addHelpButtonToMainPage() {
    const mainTopNav = this.DOMElements.main_top_nav;
    if (mainTopNav) {
      const helpButton = document.createElement("div");
      helpButton.className = "hidden";
      helpButton.title = "Getting Started Guide";
      helpButton.textContent = "?";
      helpButton.style.marginLeft = "8px";
      helpButton.onclick = async () => await this.showDetailedQuickStart();

      const aboutButton = mainTopNav.querySelector("#about_toggle");
      if (aboutButton) {
        mainTopNav.insertBefore(helpButton, aboutButton);
      } else {
        mainTopNav.appendChild(helpButton);
      }
    }
  }

  showDebugPanel() {
    const debugSection = this.DOMElements.debug_section;
    const debugToggleBtn = this.DOMElements.debug_toggle_btn;

    if (debugSection && debugToggleBtn) {
      debugSection.classList.remove("hidden");
      debugToggleBtn.textContent = "Hide Debug Info";
      this.updateDebugVariables();
    }
  }

  hideDebugPanel() {
    const debugSection = this.DOMElements.debug_section;
    const debugToggleBtn = this.DOMElements.debug_toggle_btn;

    if (debugSection && debugToggleBtn) {
      debugSection.classList.add("hidden");
      debugToggleBtn.textContent = "Show Debug Info";
    }
  }

  updateDebugVariables() {
    if (!this.game || !this.DOMElements.debug_variables) return;

    const debugContainer = this.DOMElements.debug_variables;
    debugContainer.innerHTML = "";

    const gameVars = this.collectGameVariables();

    Object.entries(gameVars).forEach(([fileName, variables]) => {
      const section = document.createElement("div");
      section.className = "debug-section";

      const title = document.createElement("h4");
      title.textContent = fileName;
      section.appendChild(title);

      const varList = document.createElement("div");
      varList.className = "debug-variables-list";

      Object.entries(variables)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([key, value]) => {
          const varItem = document.createElement("div");
          varItem.className = "debug-variable";
          varItem.innerHTML = `
            <span class="debug-key">${key}:</span>
            <span class="debug-value">${this.formatDebugValue(value)}</span>
          `;
          varList.appendChild(varItem);
        });

      section.appendChild(varList);
      debugContainer.appendChild(section);
    });
  }

  collectGameVariables() {
    const vars = {
      "Game (game.js)": {},
      "Reactor (reactor.js)": {},
      "State Manager": {},
      "UI State": {},
      Performance: {},
      Tileset: {},
      Engine: {},
    };

    if (!this.game) return vars;

    const game = this.game;
    vars["Game (game.js)"]["version"] = game.version;
    vars["Game (game.js)"]["base_cols"] = game.base_cols;
    vars["Game (game.js)"]["base_rows"] = game.base_rows;
    vars["Game (game.js)"]["max_cols"] = game.max_cols;
    vars["Game (game.js)"]["max_rows"] = game.max_rows;
    vars["Game (game.js)"]["rows"] = game.rows;
    vars["Game (game.js)"]["cols"] = game.cols;
    vars["Game (game.js)"]["base_loop_wait"] = game.base_loop_wait;
    vars["Game (game.js)"]["base_manual_heat_reduce"] =
      game.base_manual_heat_reduce;
    vars["Game (game.js)"]["upgrade_max_level"] = game.upgrade_max_level;
    vars["Game (game.js)"]["base_money"] = game.base_money;
    vars["Game (game.js)"]["current_money"] = game.current_money;
    vars["Game (game.js)"]["protium_particles"] = game.protium_particles;
    vars["Game (game.js)"]["total_exotic_particles"] =
      game.total_exotic_particles;
    vars["Game (game.js)"]["exotic_particles"] = game.exotic_particles;
    vars["Game (game.js)"]["current_exotic_particles"] =
      game.current_exotic_particles;
    vars["Game (game.js)"]["loop_wait"] = game.loop_wait;
    vars["Game (game.js)"]["paused"] = game.paused;
    vars["Game (game.js)"]["auto_sell_disabled"] = game.auto_sell_disabled;
    vars["Game (game.js)"]["auto_buy_disabled"] = game.auto_buy_disabled;
    vars["Game (game.js)"]["time_flux"] = game.time_flux;
    vars["Game (game.js)"]["sold_power"] = game.sold_power;
    vars["Game (game.js)"]["sold_heat"] = game.sold_heat;

    if (game.reactor) {
      const reactor = game.reactor;
      vars["Reactor (reactor.js)"]["base_max_heat"] = reactor.base_max_heat;
      vars["Reactor (reactor.js)"]["base_max_power"] = reactor.base_max_power;
      vars["Reactor (reactor.js)"]["current_heat"] = reactor.current_heat;
      vars["Reactor (reactor.js)"]["current_power"] = reactor.current_power;
      vars["Reactor (reactor.js)"]["max_heat"] = reactor.max_heat;
      vars["Reactor (reactor.js)"]["altered_max_heat"] =
        reactor.altered_max_heat;
      vars["Reactor (reactor.js)"]["max_power"] = reactor.max_power;
      vars["Reactor (reactor.js)"]["altered_max_power"] =
        reactor.altered_max_power;
      vars["Reactor (reactor.js)"]["auto_sell_multiplier"] =
        reactor.auto_sell_multiplier;
      vars["Reactor (reactor.js)"]["heat_power_multiplier"] =
        reactor.heat_power_multiplier;
      vars["Reactor (reactor.js)"]["heat_controlled"] = reactor.heat_controlled;
      vars["Reactor (reactor.js)"]["heat_outlet_controlled"] =
        reactor.heat_outlet_controlled;
      vars["Reactor (reactor.js)"]["vent_capacitor_multiplier"] =
        reactor.vent_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["vent_plating_multiplier"] =
        reactor.vent_plating_multiplier;
      vars["Reactor (reactor.js)"]["transfer_capacitor_multiplier"] =
        reactor.transfer_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["transfer_plating_multiplier"] =
        reactor.transfer_plating_multiplier;
      vars["Reactor (reactor.js)"]["has_melted_down"] = reactor.has_melted_down;
      vars["Reactor (reactor.js)"]["stats_power"] = reactor.stats_power;
      vars["Reactor (reactor.js)"]["stats_heat_generation"] =
        reactor.stats_heat_generation;
      vars["Reactor (reactor.js)"]["stats_vent"] = reactor.stats_vent;
      vars["Reactor (reactor.js)"]["stats_inlet"] = reactor.stats_inlet;
      vars["Reactor (reactor.js)"]["stats_outlet"] = reactor.stats_outlet;
      vars["Reactor (reactor.js)"]["stats_total_part_heat"] = reactor.stats_total_part_heat;
      // stats_cash disabled from UI; omit from debug vars to reduce noise
      vars["Reactor (reactor.js)"]["vent_multiplier_eff"] =
        reactor.vent_multiplier_eff;
      vars["Reactor (reactor.js)"]["transfer_multiplier_eff"] =
        reactor.transfer_multiplier_eff;
    }

    if (game.tileset) {
      const tileset = game.tileset;
      vars["Tileset"]["max_rows"] = tileset.max_rows;
      vars["Tileset"]["max_cols"] = tileset.max_cols;
      vars["Tileset"]["rows"] = tileset.rows;
      vars["Tileset"]["cols"] = tileset.cols;
      vars["Tileset"]["tiles_list_length"] = tileset.tiles_list?.length || 0;
      vars["Tileset"]["active_tiles_list_length"] =
        tileset.active_tiles_list?.length || 0;
      vars["Tileset"]["tiles_with_parts"] =
        tileset.tiles_list?.filter((t) => t.part)?.length || 0;
    }

    if (game.engine) {
      const engine = game.engine;
      vars["Engine"]["running"] = engine.running;
      vars["Engine"]["tick_count"] = engine.tick_count;
      vars["Engine"]["last_tick_time"] = engine.last_tick_time;
      vars["Engine"]["tick_interval"] = engine.tick_interval;
    }

    if (this.stateManager) {
      const stateVars = this.stateManager.getAllVars();
      Object.entries(stateVars).forEach(([key, value]) => {
        vars["State Manager"][key] = value;
      });
    }

    vars["UI State"]["update_interface_interval"] =
      this.update_interface_interval;
    vars["UI State"]["isDragging"] = this.isDragging;
    vars["UI State"]["lastTileModified"] = this.lastTileModified
      ? "Tile Object"
      : null;
    vars["UI State"]["longPressTimer"] = this.longPressTimer ? "Active" : null;
    vars["UI State"]["longPressDuration"] = this.longPressDuration;
    vars["UI State"]["last_money"] = this.last_money;
    vars["UI State"]["last_exotic_particles"] = this.last_exotic_particles;

    // CTRL+9 Exponential Money Debug Variables
    vars["UI State"]["ctrl9HoldTimer"] = this.ctrl9HoldTimer ? "Active" : null;
    vars["UI State"]["ctrl9HoldStartTime"] = this.ctrl9HoldStartTime;
    vars["UI State"]["ctrl9MoneyInterval"] = this.ctrl9MoneyInterval ? "Active" : null;
    vars["UI State"]["ctrl9BaseAmount"] = this.ctrl9BaseAmount;
    vars["UI State"]["ctrl9ExponentialRate"] = this.ctrl9ExponentialRate;
    vars["UI State"]["ctrl9IntervalMs"] = this.ctrl9IntervalMs;
    if (this.ctrl9HoldStartTime) {
      const holdDuration = Date.now() - this.ctrl9HoldStartTime;
      const secondsHeld = holdDuration / 1000;
      vars["UI State"]["ctrl9SecondsHeld"] = secondsHeld.toFixed(2);
      vars["UI State"]["ctrl9CurrentAmount"] = Math.floor(this.ctrl9BaseAmount * Math.pow(this.ctrl9ExponentialRate, secondsHeld));
    }

    vars["UI State"][
      "screen_resolution"
    ] = `${window.innerWidth}x${window.innerHeight}`;
    vars["UI State"]["device_pixel_ratio"] = window.devicePixelRatio;

    if (game.performance) {
      const perf = game.performance;
      vars["Performance"]["enabled"] = perf.enabled;
      vars["Performance"]["marks"] = Object.keys(perf.marks || {}).length;
      vars["Performance"]["measures"] = Object.keys(perf.measures || {}).length;
    }

    return vars;
  }

  formatDebugValue(value) {
    if (value === null || value === undefined) {
      return "<span class='debug-null'>null</span>";
    }
    if (typeof value === "boolean") {
      return `<span class='debug-boolean'>${value}</span>`;
    }
    if (typeof value === "number") {
      return `<span class='debug-number'>${value}</span>`;
    }
    if (typeof value === "string") {
      return `<span class='debug-string'>"${value}"</span>`;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return `<span class='debug-array'>[${value.length} items]</span>`;
      }
      return `<span class='debug-object'>{${Object.keys(value).length
        } keys}</span>`;
    }
    return `<span class='debug-other'>${String(value)}</span>`;
  }

  updateCollapsedControlsNav() {
    // Note: Controls collapse functionality has been removed as the HTML elements don't exist
    // This method is kept for compatibility but no longer performs any actions

    /*
    const isCollapsed =
      this.DOMElements.parts_section.classList.contains("collapsed");
    if (this.DOMElements.collapsed_controls_nav) {
      this.DOMElements.collapsed_controls_nav.style.display = isCollapsed
        ? "flex"
        : "none";
    }
    */
  }

  /**
   * Clears the highlight from the currently highlighted segment.
   */
  clearSegmentHighlight() {
    if (this.highlightedSegment) {
      for (const component of this.highlightedSegment.components) {
        component.unhighlight();
      }
    }
    this.highlightedSegment = null;
  }

  // Clipboard utility functions with fallbacks
  async writeToClipboard(text) {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return { success: true, method: 'clipboard-api' };
      }
    } catch (error) {
      console.warn("Clipboard API failed:", error);
    }

    // Fallback to document.execCommand for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        return { success: true, method: 'exec-command' };
      }
    } catch (error) {
      console.warn("execCommand fallback failed:", error);
    }

    return { success: false, error: 'No clipboard method available' };
  }

  async readFromClipboard() {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return { success: true, data: text, method: 'clipboard-api' };
      }
    } catch (error) {
      console.warn("Clipboard API read failed:", error);
      // Check if it's a permission error
      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          error: 'permission-denied',
          message: 'Clipboard access denied. Please manually paste your data.'
        };
      }
    }

    return {
      success: false,
      error: 'no-clipboard-api',
      message: 'Clipboard reading not supported. Please manually paste your data.'
    };
  }

  initializeCopyPasteUI() {
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

    if (toggleBtn && copyPasteBtns) {
      toggleBtn.onclick = () => {
        copyPasteBtns.classList.toggle("collapsed");
        const isCollapsed = copyPasteBtns.classList.contains("collapsed");
        localStorage.setItem("reactor_copy_paste_collapsed", isCollapsed ? "true" : "false");
      };
      
      const savedState = localStorage.getItem("reactor_copy_paste_collapsed");
      if (savedState === "true") {
        copyPasteBtns.classList.add("collapsed");
      }
    }

    // Check if all required elements exist
    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) {
      console.warn("[UI] Copy/paste UI elements not found, skipping initialization");
    }

    // Initialize PWA display mode button (independent of copy/paste UI)
    const pwaDisplayBtn = document.getElementById("pwa_display_mode_btn");
    if (pwaDisplayBtn) {
      console.log("[UI] PWA display mode button found, initializing...");
      pwaDisplayBtn.style.display = "flex";
      pwaDisplayBtn.style.visibility = "visible";
      pwaDisplayBtn.style.opacity = "1";
      this.initializePWADisplayModeButton(pwaDisplayBtn);
    } else {
      console.warn("[UI] PWA display mode button element not found, retrying...");
      // Retry after a short delay in case DOM isn't ready
      setTimeout(() => {
        const retryBtn = document.getElementById("pwa_display_mode_btn");
        if (retryBtn) {
          console.log("[UI] PWA display mode button found on retry, initializing...");
          retryBtn.style.display = "flex";
          retryBtn.style.visibility = "visible";
          retryBtn.style.opacity = "1";
          this.initializePWADisplayModeButton(retryBtn);
        } else {
          console.warn("[UI] PWA display mode button element not found in DOM after retry");
        }
      }, 100);
    }

    // Early return only if critical copy/paste elements are missing
    if (!copyBtn || !pasteBtn || !modal || !modalTitle || !modalText || !modalCost || !closeBtn || !confirmBtn) {
      return;
    }

    // Deselect current selected part
    if (deselectBtn) {
      deselectBtn.onclick = () => {
        try {
          document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        } catch (_) { }
        this.stateManager.setClickedPart(null);
      };
    }

    // Dropper mode: click a placed part in the reactor to select its part
    if (dropperBtn) {
      dropperBtn.onclick = () => {
        this._dropperModeActive = !this._dropperModeActive;
        dropperBtn.classList.toggle("on", this._dropperModeActive);
        if (this._dropperModeActive) {
          // Visually clear existing active part selection in panel
          try {
            document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
          } catch (_) { }
          // Temporarily highlight tiles on hover and pick on click
          const reactorEl = this.DOMElements.reactor;
          if (reactorEl && !this._dropperPointerHandler) {
            this._dropperPointerHandler = async (e) => {
              const tileEl = e.target && e.target.closest ? e.target.closest(".tile") : null;
              if (tileEl && tileEl.tile && tileEl.tile.part) {
                const pickedPart = tileEl.tile.part;
                // Set selected part
                this.stateManager.setClickedPart(pickedPart);
                // Best-effort: add active class to the matching button in parts panel
                const btn = document.getElementById(`part_btn_${pickedPart.id}`);
                if (btn) btn.classList.add("part_active");
                // Exit dropper mode
                this._dropperModeActive = false;
                dropperBtn.classList.remove("on");
                reactorEl.removeEventListener("pointerdown", this._dropperPointerHandler, true);
                this._dropperPointerHandler = null;
              }
            };
            reactorEl.addEventListener("pointerdown", this._dropperPointerHandler, true);
          }
        } else if (this._dropperPointerHandler && this.DOMElements.reactor) {
          this.DOMElements.reactor.removeEventListener("pointerdown", this._dropperPointerHandler, true);
          this._dropperPointerHandler = null;
        }
      };
    }

    // Helper: serialize reactor layout
    const serializeReactor = () => {
      if (!this.game || !this.game.tileset || !this.game.tileset.tiles_list) return "";

      // Get the current reactor dimensions
      const rows = this.game.rows;
      const cols = this.game.cols;

      // Collect only the parts that exist
      const parts = [];
      this.game.tileset.tiles_list.forEach(tile => {
        if (tile.enabled && tile.part) {
          parts.push({
            r: tile.row,
            c: tile.col,
            t: tile.part.type,
            id: tile.part.id,
            lvl: tile.part.level || 1
          });
        }
      });

      // Create compact layout object
      const layout = {
        size: { rows, cols },
        parts: parts
      };

      return JSON.stringify(layout, null, 2);
    };

    // Helper: deserialize layout
    const deserializeReactor = (str) => {
      try {
        const data = JSON.parse(str);

        // Handle new compact format
        if (data.size && data.parts) {
          const { rows, cols } = data.size;
          const layout = [];

          // Initialize empty grid
          for (let r = 0; r < rows; r++) {
            layout[r] = [];
            for (let c = 0; c < cols; c++) {
              layout[r][c] = null;
            }
          }

          // Fill in parts
          data.parts.forEach(part => {
            if (part.r >= 0 && part.r < rows && part.c >= 0 && part.c < cols) {
              layout[part.r][part.c] = {
                t: part.t,
                id: part.id,
                lvl: part.lvl || 1
              };
            }
          });

          return layout;
        }

        // Handle old format (2D array)
        if (Array.isArray(data) && Array.isArray(data[0])) {
          return data;
        }

        return null;
      } catch {
        return null;
      }
    };

    // Helper: calculate total cost of a layout
    const calculateLayoutCost = (layout) => {
      if (!layout || !this.game || !this.game.partset) return 0;
      let cost = 0;
      for (const row of layout) {
        for (const cell of row) {
          if (cell && cell.id) {
            const part = this.game.partset.parts.get(cell.id);
            if (part) cost += part.cost * (cell.lvl || 1);
          }
        }
      }
      return cost;
    };

    // Helper: build part summary from layout
    const buildPartSummary = (layout) => {
      const summary = {};
      for (const row of layout) {
        for (const cell of row) {
          if (cell && cell.id) {
            const key = `${cell.id}|${cell.lvl || 1}`;
            if (!summary[key]) {
              const part = this.game.partset.parts.get(cell.id);
              summary[key] = {
                id: cell.id,
                type: cell.t,
                lvl: cell.lvl || 1,
                title: part ? part.title : cell.id,
                unitPrice: part ? part.cost : 0,
                count: 0,
                total: 0,
              };
            }
            summary[key].count++;
            summary[key].total += summary[key].unitPrice;
          }
        }
      }
      return Object.values(summary);
    };

    // Helper: calculate sell value of current reactor
    const calculateCurrentSellValue = () => {
      if (!this.game || !this.game.tileset || !this.game.tileset.tiles_list) return 0;
      let sellValue = 0;
      this.game.tileset.tiles_list.forEach(tile => {
        if (tile.enabled && tile.part) {
          // Sell value is typically 50% of purchase cost
          sellValue += (tile.part.cost * (tile.part.level || 1)) * 0.5;
        }
      });
      return Math.floor(sellValue);
    };





    // Show modal with data, cost, and action options
    const showModal = (title, data, cost, action, canPaste = false, summary = [], options = {}) => {
      modalTitle.textContent = title;
      modalText.value = data;

      // Show/hide textarea based on action
      if (action === "paste") {
        // Ensure textarea is visible and properly styled for paste actions

        // Force textarea to be visible
        modalText.classList.remove("hidden");
        modalText.style.display = "block";
        modalText.style.visibility = "visible";
        modalText.style.opacity = "1";
        modalText.style.position = "relative";
        modalText.style.zIndex = "1";
      } else {
        // Hide textarea for copy and other actions
        modalText.classList.add("hidden");
        modalText.style.display = "none";
        modalText.style.visibility = "hidden";
        modalText.style.opacity = "0";
        modalText.style.height = "0";
        modalText.style.overflow = "hidden";

      }

      // Pause the reactor when modal opens
      const wasPaused = this.stateManager.getVar("pause");
      this.stateManager.setVar("pause", true);

      // Render component icons first
      let summaryHtml = '';
      if (summary.length) {
        summaryHtml = this.renderComponentIcons(summary, options);
      }

      // Show total cost under the table
      const costText = cost > 0 ? `Total Cost: $${fmt(cost)}` : "";
      modalCost.innerHTML = summaryHtml + (costText ? `<div style="margin-top: 10px; font-weight: bold; color: #4caf50;">${costText}</div>` : "");

      // Set textarea properties based on action
      if (action === "copy") {
        modalText.readOnly = true;
        modalText.placeholder = "Reactor layout data (read-only)";
        confirmBtn.textContent = "Copy";
        confirmBtn.classList.remove("hidden");
        confirmBtn.disabled = false;
      } else if (action === "paste") {
        modalText.readOnly = false;
        // Set placeholder based on whether we have data or not
        if (data && data.trim()) {
          modalText.placeholder = "Paste reactor layout data here...";
        } else {
          modalText.placeholder = "Enter reactor layout JSON data manually...";
        }
        confirmBtn.textContent = "Paste";
        confirmBtn.classList.remove("hidden"); // Always show paste button
        confirmBtn.disabled = !canPaste; // Disable if unaffordable

        // Add sell existing grid option (always show if there are any parts)
        const currentSellValue = calculateCurrentSellValue();

        // Check if there are any parts in the current reactor
        const hasExistingParts = this.game.tileset.tiles_list.some(tile => tile.enabled && tile.part);

        // Store the sell option HTML to be used in real-time updates
        modal.dataset.sellOptionHtml = '';
        if (hasExistingParts) {
          modal.dataset.sellOptionHtml = `
            <div style="margin-top: 15px; padding: 10px; background-color: #2a2a2a; border: 1px solid #444; border-radius: 4px;">
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="sell_existing_checkbox" style="margin: 0;">
                <span style="color: #ffd700;">Sell existing grid for $${fmt(currentSellValue)}</span>
              </label>
            </div>
          `;
        }
      }

      modal.classList.remove("hidden");

      // Store the previous pause state to restore it when modal closes
      modal.dataset.previousPauseState = wasPaused;

      // Add click-outside-to-close functionality
      const handleOutsideClick = (e) => {
        if (e.target === modal) {
          this.hideModal();
          modal.removeEventListener('click', handleOutsideClick);
        }
      };
      modal.addEventListener('click', handleOutsideClick);
    };



    // Copy button handler
    copyBtn.onclick = () => {
      const data = serializeReactor();
      const layout = deserializeReactor(data);
      const cost = calculateLayoutCost(layout);
      const summary = buildPartSummary(layout);

      // Initialize checked types for copy (all checked by default)
      let checkedTypes = {};
      summary.forEach(item => { checkedTypes[item.id] = true; });

      showModal("Copy Reactor Layout", data, cost, "copy", false, summary, { showCheckboxes: true, checkedTypes });

      // Add real-time filtering for copy
      const updateCopySummary = () => {
        // Filter layout by checked types for summary display
        const filteredLayout = layout.map(row => row.map(cell => {
          if (!cell) return null;
          return checkedTypes[cell.id] !== false ? cell : null;
        }));

        const filteredSummary = buildPartSummary(filteredLayout);
        const filteredCost = calculateLayoutCost(filteredLayout);

        let html = this.renderComponentIcons(summary, { showCheckboxes: true, checkedTypes });
        html += `<div style="margin-top: 10px; font-weight: bold; color: #4caf50;">Selected Parts Cost: $${fmt(filteredCost)}</div>`;

        modalCost.innerHTML = html;

        // Ensure copy button is always enabled for copy action
        confirmBtn.disabled = false;
        confirmBtn.classList.remove("hidden");
      };

      // Listen for component icon clicks
      modalCost.addEventListener("click", (e) => {
        const componentSlot = e.target.closest('.component-slot');
        if (componentSlot) {
          const ids = componentSlot.getAttribute("data-ids");
          if (!ids) return;

          const idArray = ids.split(',');
          const isCurrentlyChecked = !componentSlot.classList.contains('component-disabled');

          // Toggle all associated IDs to the opposite state
          idArray.forEach(id => {
            checkedTypes[id] = !isCurrentlyChecked;
          });

          updateCopySummary();
        }
      });

      updateCopySummary(); // Initial update

      // Set up copy action
      confirmBtn.onclick = async () => {
        // Filter the data based on checked types
        const filteredLayout = layout.map(row => row.map(cell => {
          if (!cell) return null;
          return checkedTypes[cell.id] !== false ? cell : null;
        }));

        // Convert filtered layout to compact format
        const rows = this.game.rows;
        const cols = this.game.cols;
        const parts = [];

        for (let r = 0; r < filteredLayout.length; r++) {
          for (let c = 0; c < filteredLayout[r].length; c++) {
            const cell = filteredLayout[r][c];
            if (cell && cell.id) {
              parts.push({
                r: r,
                c: c,
                t: cell.t,
                id: cell.id,
                lvl: cell.lvl || 1
              });
            }
          }
        }

        const compactLayout = {
          size: { rows, cols },
          parts: parts
        };

        // Serialize the compact layout
        const filteredData = JSON.stringify(compactLayout, null, 2);

        const result = await this.writeToClipboard(filteredData);
        if (result.success) {
          confirmBtn.textContent = "Copied!";
          setTimeout(() => {
            this.hideModal();
          }, 1000);
        } else {
          confirmBtn.textContent = "Failed to Copy";
          setTimeout(() => {
            this.hideModal();
          }, 1000);
        }
      };

      // Ensure copy button is enabled and visible
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("hidden");
      confirmBtn.style.backgroundColor = "#236090"; // Reset to normal button color
      confirmBtn.style.cursor = "pointer";
    };

    // Paste button handler
    pasteBtn.onclick = async () => {
      // Try to get data from clipboard first
      let data = "";
      const clipboardResult = await this.readFromClipboard();

      if (clipboardResult.success) {
        data = clipboardResult.data;
      } else if (clipboardResult.error === 'permission-denied') {
        // Show user-friendly message for permission denial and show modal for manual entry
        data = ""; // Ensure data is empty for manual entry
        // No notification - just show the modal directly
      } else {
        // For other clipboard errors, also show manual entry modal
        data = "";
        // No notification - just show the modal directly
      }

      // Show modal with clipboard data (if any) or for manual entry
      let checkedTypes = {};
      let layout = deserializeReactor(data);
      let summary = buildPartSummary(layout || []);
      summary.forEach(item => { checkedTypes[item.id] = true; });

      // Set appropriate title based on whether we have data or not
      const modalTitle = data ? "Paste Reactor Layout" : "Enter Reactor Layout Manually";
      showModal(modalTitle, data, 0, "paste", false, summary, { showCheckboxes: true, checkedTypes });
      // Add real-time cost calculation and filtering
      const updateCostAndSummary = () => {
        const textareaData = modalText.value.trim();
        let layout = deserializeReactor(textareaData);
        if (!layout) {
          if (!textareaData) {
            modalCost.innerHTML = "Enter reactor layout JSON data in the text area above";
          } else {
            modalCost.innerHTML = "Invalid layout data - please check the JSON format";
          }
          confirmBtn.disabled = true;
          confirmBtn.classList.remove("hidden"); // Always show button
          return;
        }

        // Preserve checkbox state before updating HTML
        const currentSellCheckboxState = document.getElementById('sell_existing_checkbox')?.checked || false;

        // Build summary from original layout (keep all items visible)
        const originalSummary = buildPartSummary(layout);

        // Filter layout by checked types for cost calculation
        const filteredLayout = layout.map(row => row.map(cell => {
          if (!cell) return null;
          return checkedTypes[cell.id] !== false ? cell : null;
        }));

        const cost = calculateLayoutCost(filteredLayout);
        const currentSellValue = calculateCurrentSellValue();
        const sellExisting = currentSellCheckboxState;
        const netCost = cost - (sellExisting ? currentSellValue : 0);
        const canPaste = cost > 0 && this.game.current_money >= netCost;

        let html = this.renderComponentIcons(originalSummary, { showCheckboxes: true, checkedTypes });

        // Add sell existing grid option from stored HTML
        const sellOptionHtml = modal.dataset.sellOptionHtml || '';
        if (sellOptionHtml) {
          html += sellOptionHtml;
        }

        // Show cost information below the sell checkbox
        if (cost > 0) {
          const finalCost = sellExisting && currentSellValue > 0 ? Math.max(0, netCost) : cost;
          const costColor = canPaste ? "#4caf50" : "#ff6b6b";
          const costText = canPaste ? `$${fmt(finalCost)}` : `$${fmt(finalCost)} - Not Enough Money`;
          html += `<div style="margin-top: 10px; font-weight: bold; color: ${costColor};">${costText}</div>`;
        } else {
          html += `<div style="margin-top: 10px; font-weight: bold; color: #ff6b6b;">No parts found in layout</div>`;
        }

        modalCost.innerHTML = html;

        // Restore checkbox state and ensure it's properly initialized
        const sellCheckbox = document.getElementById('sell_existing_checkbox');
        if (sellCheckbox) {
          // Restore the previous state
          sellCheckbox.checked = currentSellCheckboxState;
          // Make sure it's not disabled and can be interacted with
          sellCheckbox.disabled = false;
          sellCheckbox.style.pointerEvents = 'auto';

          // Add a direct change event listener to the checkbox
          sellCheckbox.addEventListener('change', (e) => {

            updateCostAndSummary();
          });
        }

        confirmBtn.disabled = !canPaste;
        confirmBtn.classList.remove("hidden"); // Always show button
      };
      // Listen for component icon clicks and sell checkbox
      modalCost.addEventListener("click", (e) => {
        const componentSlot = e.target.closest('.component-slot');
        if (componentSlot) {
          const ids = componentSlot.getAttribute("data-ids");
          if (!ids) return;

          const idArray = ids.split(',');
          const isCurrentlyChecked = !componentSlot.classList.contains('component-disabled');

          // Toggle all associated IDs to the opposite state
          idArray.forEach(id => {
            checkedTypes[id] = !isCurrentlyChecked;
          });

          updateCostAndSummary();
        } else if (e.target.id === "sell_existing_checkbox") {
          // Let the native checkbox behavior handle this
          e.stopPropagation();

          updateCostAndSummary();
        } else if (e.target.closest('label') && e.target.closest('label').querySelector('#sell_existing_checkbox')) {
          // Handle label clicks for the sell checkbox
          const checkbox = e.target.closest('label').querySelector('#sell_existing_checkbox');
          if (e.target.tagName !== 'INPUT') {
            e.preventDefault();
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;

            updateCostAndSummary();
          }
        }
      });
      // Update cost on input
      modalText.addEventListener("input", () => {
        layout = deserializeReactor(modalText.value.trim());
        summary = buildPartSummary(layout || []);
        checkedTypes = {};
        summary.forEach(item => { checkedTypes[item.id] = true; });
        updateCostAndSummary();
      });
      updateCostAndSummary(); // Initial update
      // Set up paste action that reads from textarea
      confirmBtn.onclick = () => {
        const textareaData = modalText.value.trim();
        let layout = deserializeReactor(textareaData);
        if (!layout) {
          alert("Please paste reactor layout data into the text area.");
          return;
        }
        // Filter layout by checked types
        const filteredLayout = layout.map(row => row.map(cell => {
          if (!cell) return null;
          return checkedTypes[cell.id] !== false ? cell : null;
        }));
        const cost = calculateLayoutCost(filteredLayout);
        const currentSellValue = calculateCurrentSellValue();
        const sellExisting = document.getElementById('sell_existing_checkbox')?.checked || false;
        const netCost = cost - (sellExisting ? currentSellValue : 0);

        if (cost <= 0) {
          alert("Invalid layout: no parts found.");
          return;
        }
        if (this.game.current_money < netCost) {
          alert(`Not enough money! Layout costs $${fmt(cost)}${sellExisting ? ` - $${fmt(currentSellValue)} (sell value) = $${fmt(netCost)}` : ''} but you only have $${fmt(this.game.current_money)}.`);
          return;
        }

        // Sell existing grid if checkbox is checked
        if (sellExisting) {
          this.game.tileset.tiles_list.forEach(tile => {
            if (tile.enabled && tile.part) {
              tile.clearPart(true); // Sell the part
            }
          });
          this.game.reactor.updateStats();
        }

        // Apply layout to reactor
        this.pasteReactorLayout(filteredLayout);
        this.hideModal();
      };
    };

    closeBtn.onclick = this.hideModal.bind(this);
  }

  // Initialize sell all button functionality
  initializeSellAllButton() {
    const sellAllBtn = document.getElementById("reactor_sell_all_btn");
    if (sellAllBtn) {
      sellAllBtn.onclick = () => {
        if (!this.game || !this.game.tileset) return;

        // Pause the reactor when sell modal opens
        const wasPaused = this.stateManager.getVar("pause");
        this.stateManager.setVar("pause", true);

        // Build summary of existing parts
        const existingSummary = this.buildExistingPartSummary();

        // Always show the modal, even when there are no parts
        // Initialize checked types (all checked by default)
        let checkedTypes = {};
        existingSummary.forEach(item => { checkedTypes[item.id] = true; });

        this.showSellModal(existingSummary, checkedTypes, wasPaused);
      };
    }
  }

  // Build summary of existing parts in reactor
  buildExistingPartSummary() {
    if (!this.game || !this.game.tileset || !this.game.tileset.tiles_list) return [];

    const summary = {};
    this.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) {
        const key = `${tile.part.id}|${tile.part.level || 1}`;
        if (!summary[key]) {
          summary[key] = {
            id: tile.part.id,
            type: tile.part.type,
            lvl: tile.part.level || 1,
            title: tile.part.title || tile.part.id,
            unitPrice: tile.part.cost,
            count: 0,
            total: 0,
            tileIds: []
          };
        }
        summary[key].count++;
        summary[key].total += tile.part.cost;
        summary[key].tileIds.push(tile.id);
      }
    });

    return Object.values(summary);
  }

  // Show sell modal with component selection
  showSellModal(summary, checkedTypes, previousPauseState = false) {
    const modal = document.getElementById("reactor_copy_paste_modal");
    const modalTitle = document.getElementById("reactor_copy_paste_modal_title");
    const modalText = document.getElementById("reactor_copy_paste_text");
    const modalCost = document.getElementById("reactor_copy_paste_cost");
    const confirmBtn = document.getElementById("reactor_copy_paste_confirm_btn");
    const closeBtn = document.getElementById("reactor_copy_paste_close_btn");

    if (!modal || !modalTitle || !modalCost || !confirmBtn || !closeBtn) return;

    // Update modal title
    modalTitle.textContent = "Sell Reactor Parts";

    // Hide textarea for sell modal
    if (modalText) {
      modalText.classList.add("hidden");
      modalText.style.display = "none";
      modalText.style.visibility = "hidden";
      modalText.style.opacity = "0";
      modalText.style.height = "0";
      modalText.style.overflow = "hidden";

    }

    // Show modal
    modal.classList.remove("hidden");

    // Store the previous pause state to restore it when modal closes
    modal.dataset.previousPauseState = previousPauseState;

    // Update component display and cost
    const updateSellSummary = () => {
      // Filter summary by checked types
      const filteredSummary = summary.filter(item => checkedTypes[item.id] !== false);
      const totalSellValue = filteredSummary.reduce((sum, item) => sum + item.total, 0);

      // Render component icons with checkboxes
      let html = this.renderComponentIcons(summary, { showCheckboxes: true, checkedTypes });

      // Show total sell value
      if (totalSellValue > 0) {
        html += `<div style="margin-top: 10px; font-weight: bold; color: #4caf50;">Total Sell Value: $${fmt(totalSellValue)}</div>`;
      } else {
        html += `<div style="margin-top: 10px; font-weight: bold; color: #ff6b6b;">No parts selected</div>`;
      }

      modalCost.innerHTML = html;

      // Enable/disable confirm button based on selection
      confirmBtn.disabled = totalSellValue === 0;
    };

    // Listen for component icon clicks
    modalCost.addEventListener("click", (e) => {
      const componentSlot = e.target.closest('.component-slot');
      if (componentSlot) {
        const ids = componentSlot.getAttribute("data-ids");
        if (!ids) return;

        const idArray = ids.split(',');
        const isCurrentlyChecked = !componentSlot.classList.contains('component-disabled');

        // Toggle all associated IDs to the opposite state
        idArray.forEach(id => {
          checkedTypes[id] = !isCurrentlyChecked;
        });

        updateSellSummary();
      }
    });

    // Set up confirm button action
    confirmBtn.textContent = "Sell Selected";
    confirmBtn.classList.remove("hidden"); // Ensure button is visible
    confirmBtn.disabled = false; // Enable button initially
    confirmBtn.style.backgroundColor = '#e74c3c'; // Red background for sell action
    confirmBtn.onclick = () => {
      // Get tiles to sell based on checked types
      const tilesToSell = [];
      this.game.tileset.tiles_list.forEach(tile => {
        if (tile.enabled && tile.part && checkedTypes[tile.part.id] !== false) {
          tilesToSell.push(tile);
        }
      });

      // Calculate total sell value
      const totalSellValue = tilesToSell.reduce((sum, tile) => sum + tile.part.cost, 0);

      // Sell selected parts
      tilesToSell.forEach(tile => {
        tile.clearPart(true);
      });

      // Update reactor stats
      this.game.reactor.updateStats();

      // Show success feedback
      confirmBtn.textContent = `Sold $${fmt(totalSellValue)}`;
      confirmBtn.style.backgroundColor = '#27ae60';

      setTimeout(() => {
        this.hideModal();
        // Reset button styling
        confirmBtn.style.backgroundColor = '#4a9eff';
      }, 1500);
    };

    // Set up close button
    closeBtn.onclick = this.hideModal.bind(this);

    // Handle outside click to close
    const handleOutsideClick = (e) => {
      if (e.target === modal) {
        this.hideModal();
      }
    };
    modal.addEventListener("click", handleOutsideClick);

    // Initial update
    updateSellSummary();
  }

  // Hide modal helper
  hideModal() {
    const modal = document.getElementById("reactor_copy_paste_modal");
    if (!modal) return;

    modal.classList.add("hidden");

    // Restore the previous pause state when modal closes
    const previousPauseState = modal.dataset.previousPauseState === "true";
    this.stateManager.setVar("pause", previousPauseState);
  }



  // Paste layout logic
  pasteReactorLayout(layout) {
    if (!layout || !this.game || !this.game.tileset || !this.game.partset) return;

    // Helper: calculate total cost of a layout
    const calculateLayoutCost = (layout) => {
      if (!layout || !this.game || !this.game.partset) return 0;
      let cost = 0;
      for (const row of layout) {
        for (const cell of row) {
          if (cell && cell.id) {
            const part = this.game.partset.parts.get(cell.id);
            if (part) cost += part.cost * (cell.lvl || 1);
          }
        }
      }
      return cost;
    };

    // Clear existing parts first
    this.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) {
        tile.setPart(null);
      }
    });

    // Apply the new layout
    for (let r = 0; r < layout.length; r++) {
      for (let c = 0; c < layout[r].length; c++) {
        const cell = layout[r][c];
        if (cell && cell.id) {
          const part = this.game.partset.parts.get(cell.id);
          if (part) {
            const tile = this.game.tileset.getTile(r, c);
            if (tile && tile.enabled) {
              tile.setPart(part);
            }
          }
        }
      }
    }

    // Deduct cost
    const cost = calculateLayoutCost(layout);
    this.game.current_money -= cost;
    this.runUpdateInterfaceLoop();
  }

  initializePage(pageId) {
    const game = this.game;
    this.cacheDOMElements(pageId);

    if (pageId === "reactor_section") {
      this.initVarObjsConfig();
    }

    const setupUpgradeClickHandler = (containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;

      // Click handler for upgrades
      // Desktop hover functionality
      if (window.innerWidth > 768) {
        on(container, ".upgrade-card", "mouseenter", function (e) {
          const upgradeEl = this;
          if (!upgradeEl.upgrade_object) return;
          const upgrade_obj = upgradeEl.upgrade_object;

          game.tooltip_manager.show(upgrade_obj, null, false, upgradeEl);
        });

        on(container, ".upgrade-card", "mouseleave", function (e) {
          if (!game.tooltip_manager.isLocked) {
            game.tooltip_manager.hide();
          }
        });
      }
    };

    switch (pageId) {
      case "reactor_section":
        if (this.DOMElements.reactor) {
          this.DOMElements.reactor.innerHTML = "";
        }

        if (this.game && this.game.tileset && this.game.tileset.tiles_list) {
          this.game.tileset.tiles_list.forEach((tile) => {
            tile.enabled = true; // Ensure tile is enabled for visibility
            this.stateManager.handleTileAdded(this.game, tile);
          });

          this.game.tileset.tiles_list.forEach((tile) => {
            if (tile.part) {
              tile.refreshVisualState();
            }
          });
        }
        this.setupReactorEventListeners();
        this.gridScaler.resize();
        this.initializeCopyPasteUI();
        this.initializeSellAllButton();
        // Prepare mobile top overlay that aligns stats with copy/paste/sell
        this.setupMobileTopBar();
        this.setupMobileTopBarResizeListener();
        
        const settingsBtnMobile = document.getElementById("settings_btn_mobile");
        if (settingsBtnMobile) {
          settingsBtnMobile.addEventListener("click", () => new SettingsModal().show());
        }
        break;
      case "upgrades_section":
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateUpgrades === "function"
        ) {
          game.upgradeset.populateUpgrades();
          if (typeof game.upgradeset.check_affordability === "function") {
            game.upgradeset.check_affordability(game);
          }
        } else {
          console.warn(
            "[UI] upgradeset.populateUpgrades is not a function or upgradeset missing"
          );
        }
        break;
      case "experimental_upgrades_section":
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateExperimentalUpgrades === "function"
        ) {
          game.upgradeset.populateExperimentalUpgrades();
          if (typeof game.upgradeset.check_affordability === "function") {
            game.upgradeset.check_affordability(game);
          }
        } else {
          console.warn(
            "[UI] upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing"
          );
        }
        break;
      case "about_section":
        const versionEl = document.getElementById("about_version");
        const appVersionEl = document.getElementById("app_version");
        if (versionEl && appVersionEl) {
          versionEl.textContent = appVersionEl.textContent;
        }
        break;
      case "experimental_upgrades_section":
        // Load and set version for research page
        this.loadAndSetVersion();
        break;
      case "soundboard_section":
        this.setupSoundboardPage();
        break;
    }

    this.showObjectivesForPage(pageId);
  }

  setupSoundboardPage() {
    if (!this.game?.audio) return;
    const page = this.DOMElements.soundboard_section || document.getElementById("soundboard_section");
    if (!page) return;

    const warningSlider = this.DOMElements.sound_warning_intensity || document.getElementById("sound_warning_intensity");
    const warningValue = this.DOMElements.sound_warning_value || document.getElementById("sound_warning_value");
    
    const updateWarningValue = () => {
      if (warningSlider && warningValue) {
        warningValue.textContent = `${warningSlider.value}%`;
      }
    };

    if (warningSlider) {
      warningSlider.oninput = updateWarningValue;
      updateWarningValue();
    }

    const playSound = (button) => {
      const sound = button.dataset.sound;
      if (!sound) return;

      if (sound === "warning") {
        const intensity = warningSlider ? Number(warningSlider.value) / 100 : 0.5;
        this.game.audio.play("warning", intensity);
        return;
      }

      if (sound === "explosion") {
        if (button.dataset.variant === "meltdown") {
          this.game.audio.play("explosion", "meltdown");
        } else {
          this.game.audio.play("explosion");
        }
        return;
      }

      const subtype = button.dataset.subtype || null;
      this.game.audio.play(sound, subtype);
    };

    page.querySelectorAll("button.sound-btn").forEach((button) => {
      button.onclick = () => playSound(button);
    });
  }

  // Align top stats and copy/paste/sell buttons into a single transparent bar on mobile
  setupMobileTopBar() {
    try {
      const mobileTopBar = document.getElementById("mobile_top_bar");
      const stats = document.getElementById("reactor_stats");
      const topNav = document.getElementById("main_top_nav");
      const reactorWrapper = document.getElementById("reactor_wrapper");
      const copyPasteBtns = document.getElementById("reactor_copy_paste_btns");
      if (!mobileTopBar || !stats) return;

      const isMobile = typeof window !== "undefined" && window.innerWidth <= 900;

      if (isMobile) {
        // Activate overlay container
        mobileTopBar.classList.add("active");
        mobileTopBar.setAttribute("aria-hidden", "false");

        // Ensure inner containers exist
        let statsWrap = mobileTopBar.querySelector(".mobile-top-stats");
        if (!statsWrap) {
          statsWrap = document.createElement("div");
          statsWrap.className = "mobile-top-stats";
          mobileTopBar.appendChild(statsWrap);
        }

        // Move existing nodes into overlay
        if (stats && stats.parentElement !== statsWrap) statsWrap.appendChild(stats);

        // Ensure copy/paste/sell buttons remain top-right in reactor wrapper
        if (copyPasteBtns && reactorWrapper && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      } else {
        // Deactivate overlay and restore elements
        mobileTopBar.classList.remove("active");
        mobileTopBar.setAttribute("aria-hidden", "true");

        if (topNav && stats) {
          const engineUl = topNav.querySelector("#engine_status");
          if (engineUl) {
            topNav.insertBefore(stats, engineUl);
          } else {
            topNav.appendChild(stats);
          }
        }
        if (reactorWrapper && copyPasteBtns && copyPasteBtns.parentElement !== reactorWrapper) {
          reactorWrapper.appendChild(copyPasteBtns);
        }
      }

      this._lastIsMobileForTopBar = isMobile;
    } catch (err) {
      console.warn("[UI] setupMobileTopBar error:", err);
    }
  }

  setupMobileTopBarResizeListener() {
    if (this._mobileTopBarResizeListenerAdded) return;
    this._mobileTopBarResizeListenerAdded = true;
    window.addEventListener("resize", () => {
      const isMobile = window.innerWidth <= 900;
      if (isMobile !== this._lastIsMobileForTopBar) {
        this.setupMobileTopBar();
      }
    });
  }

  setupReactorEventListeners() {
    const reactor = this.DOMElements.reactor;
    if (!reactor) {
      console.error("Reactor element not found for event listeners.");
      return;
    }

    let longPressTargetTile = null;
    let pointerMoved = false;
    let pointerDownTileEl = null;
    let startX = 0;
    let startY = 0;
    const MOVE_THRESHOLD = 10;
    const cancelLongPress = () => {
      if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
      }
      if (longPressTargetTile) {
        longPressTargetTile.$el.classList.remove("selling");
        longPressTargetTile = null;
      }
    };
    const pointerDownHandler = (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || e.button > 0) return;
      const tileEl = e.target.closest(".tile");
      if (!tileEl?.tile?.enabled) return;
      pointerDownTileEl = tileEl;
      e.preventDefault();
      this.isDragging = true;
      this.lastTileModified = tileEl.tile;
      pointerMoved = false;
      startX = e.clientX;
      startY = e.clientY;
      const hasPart = tileEl.tile.part;
      const noModifiers = !e.ctrlKey && !e.altKey && !e.shiftKey;
      if (hasPart && noModifiers) {
        longPressTargetTile = tileEl.tile;
        this.longPressTimer = setTimeout(() => {
          this.longPressTimer = null;
          if (longPressTargetTile) {
            longPressTargetTile.$el.classList.add("selling");
            longPressTargetTile.$el.style.setProperty(
              "--sell-duration",
              `${this.longPressDuration}ms`
            );
            setTimeout(() => {
              if (longPressTargetTile) {
                longPressTargetTile.clearPart(true);
                this.game.reactor.updateStats();
                longPressTargetTile.$el.classList.remove("selling");
                if (this.game && this.game.audio) {
                  this.game.audio.play('sell');
                }
              }
            }, this.longPressDuration);
          }
          this.isDragging = false;
        }, 250);
      }
      const pointerMoveHandler = async (e_move) => {
        const dx = e_move.clientX - startX;
        const dy = e_move.clientY - startY;
        if (
          !pointerMoved &&
          (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD)
        ) {
          pointerMoved = true;
          cancelLongPress();
        }
        if (!this.isDragging) return;
        const moveTileEl = e_move.target && e_move.target.closest ? e_move.target.closest(".tile") : null;
        if (
          moveTileEl &&
          moveTileEl.tile &&
          moveTileEl.tile !== this.lastTileModified
        ) {
          await this.handleGridInteraction(moveTileEl, e_move);
          this.lastTileModified = moveTileEl.tile;
        }
      };
      const pointerUpHandler = async (e_up) => {
        if (!pointerMoved && this.isDragging && pointerDownTileEl) {
          cancelLongPress();
          await this.handleGridInteraction(pointerDownTileEl, e_up || e);
        } else if (this.longPressTimer) {
          cancelLongPress();
        }
        if (this.isDragging) {
          this.isDragging = false;
          this.lastTileModified = null;
          this.game.reactor.updateStats();
          this.stateManager.setVar("current_money", this.game.current_money);
        }
        window.removeEventListener("pointermove", pointerMoveHandler);
        window.removeEventListener("pointerup", pointerUpHandler);
        window.removeEventListener("pointercancel", pointerUpHandler);
        pointerDownTileEl = null;
      };
      window.addEventListener("pointermove", pointerMoveHandler);
      window.addEventListener("pointerup", pointerUpHandler);
      window.addEventListener("pointercancel", pointerUpHandler);
    };
    reactor.addEventListener("pointerdown", pointerDownHandler);
    reactor.addEventListener("contextmenu", async (e) => {
      e.preventDefault();
      await this.handleGridInteraction(e.target && e.target.closest ? e.target.closest(".tile") : null, e);
    });

    reactor.addEventListener(
      "mouseenter",
      (e) => {
        const tileEl = e.target && e.target.closest ? e.target.closest(".tile") : null;
        if (
          tileEl?.tile?.part &&
          this.game?.tooltip_manager &&
          !this.isDragging &&
          this.help_mode_active
        ) {
          this.game.tooltip_manager.show(tileEl.tile.part, tileEl.tile, false);
        }
      },
      true
    );

    reactor.addEventListener(
      "mouseleave",
      (e) => {
        const tileEl = e.target && e.target.closest ? e.target.closest(".tile") : null;
        if (
          tileEl?.tile?.part &&
          this.game?.tooltip_manager &&
          !this.isDragging &&
          this.help_mode_active
        ) {
          this.game.tooltip_manager.hide();
        }
      },
      true
    );
  }

  async loadAndSetVersion() {
    try {
      const { getResourceUrl } = await import("../utils/util.js");
      const response = await fetch(getResourceUrl("version.json"));
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          throw new Error("HTML response received (likely 404 fallback)");
        }
        throw new Error(`Expected JSON but got ${contentType || "unknown content type"}`);
      }
      
      const versionData = await response.json();
      const version = versionData.version || "Unknown";

      const appVersionEl = document.getElementById("app_version");
      if (appVersionEl) {
        appVersionEl.textContent = version;
      } else {
        console.warn("[UI] app_version element not found in DOM");
        setTimeout(async () => {
          const retryEl = document.getElementById("app_version");
          if (retryEl) {
            retryEl.textContent = version;
          } else {
            console.error("[UI] app_version element still not found after retry");
          }
        }, 100);
      }
    } catch (error) {
      if (!error.message || !error.message.includes("Expected JSON")) {
        console.warn("Could not load version info:", error.message || error);
      }
      const appVersionEl = document.getElementById("app_version");
      if (appVersionEl) {
        appVersionEl.textContent = "Unknown";
      }
    }
  }

  showObjectivesForPage(pageId) {
    // Always re-cache DOM elements after navigation
    this.cacheDOMElements();

    // Handle objectives section (contains both old and new UI)
    const objectivesSection = document.getElementById("objectives_section");
    if (objectivesSection) {
      objectivesSection.classList.toggle(
        "hidden",
        pageId !== "reactor_section"
      );

      if (pageId === "reactor_section") {
        // Force refresh of the current objective display
        const objectivesManager = this.game && this.game.objectives_manager;
        if (objectivesManager && objectivesManager.current_objective_def) {
          this.stateManager.handleObjectiveLoaded({
            ...objectivesManager.current_objective_def,
            title:
              typeof objectivesManager.current_objective_def.title ===
                "function"
                ? objectivesManager.current_objective_def.title()
                : objectivesManager.current_objective_def.title,
          }, objectivesManager.current_objective_index);

          // Update the new objectives display
          this.updateObjectiveDisplay();
        }
      }
    }
  }

  // Get part image path based on type and level
  getPartImagePath(partType, level = 1) {
    const levelStr = level.toString();
    const typeMap = {
      'cell': 'cells',
      'capacitor': 'capacitors',
      'accelerator': 'accelerators',
      'vent': 'vents',
      'heat_exchanger': 'exchangers',
      'heat_inlet': 'inlets',
      'heat_outlet': 'outlets',
      'coolant_cell': 'coolants',
      'reactor_plating': 'platings',
      'particle_accelerator': 'accelerators',
      'reflector': 'reflectors'
    };

    // Handle cell types (uranium, plutonium, thorium, etc.)
    const cellTypes = ['uranium', 'plutonium', 'thorium', 'seaborgium', 'dolorium', 'nefastium', 'protium'];
    if (cellTypes.includes(partType)) {
      const folder = 'cells';
      const cellCounts = { 1: 1, 2: 2, 3: 4 };
      const cellType = partType === 'protium' ? 'xcell' : 'cell';
      const typeToNum = {
        uranium: 1,
        plutonium: 2,
        thorium: 3,
        seaborgium: 4,
        dolorium: 5,
        nefastium: 6,
        protium: 1,
      };
      const cellNum = typeToNum[partType];
      const fileName = `${cellType}_${cellNum}_${cellCounts[level]}.png`;
      return `img/parts/${folder}/${fileName}`;
    }

    const folder = typeMap[partType] || partType;
    let fileName;

    // Handle special cases for file naming
    if (partType === 'heat_exchanger') {
      fileName = `exchanger_${levelStr}.png`;
    } else if (partType === 'heat_inlet') {
      fileName = `inlet_${levelStr}.png`;
    } else if (partType === 'heat_outlet') {
      fileName = `outlet_${levelStr}.png`;
    } else if (partType === 'coolant_cell') {
      fileName = `coolant_cell_${levelStr}.png`;
    } else if (partType === 'reactor_plating') {
      fileName = `plating_${levelStr}.png`;
    } else if (partType === 'particle_accelerator') {
      fileName = `accelerator_${levelStr}.png`;
    } else {
      fileName = `${partType}_${levelStr}.png`;
    }

    return `img/parts/${folder}/${fileName}`;
  }

  // Render component icons (replaces table)
  renderComponentIcons(summary, options = {}) {
    const { showCheckboxes = false, checkedTypes = {} } = options;

    // Merge duplicate components by type and level
    const mergedComponents = {};
    summary.forEach(item => {
      const key = `${item.type}_${item.lvl}`;
      if (!mergedComponents[key]) {
        mergedComponents[key] = {
          ...item,
          count: 0,
          ids: []
        };
      }
      mergedComponents[key].count += item.count;
      mergedComponents[key].ids.push(item.id);
    });

    let html = '<div class="component-summary-section">';
    html += '<div class="component-header">';
    html += '<span class="component-title">Components</span>';
    html += '</div>';
    html += '<div class="component-grid">';

    Object.values(mergedComponents).forEach(item => {
      // Check if any of the merged IDs are unchecked
      const anyUnchecked = item.ids.some(id => checkedTypes[id] === false);
      const checked = !anyUnchecked;
      const disabledClass = showCheckboxes && !checked ? 'component-disabled' : '';
      const imagePath = this.getPartImagePath(item.type, item.lvl);

      html += `<div class="component-slot ${disabledClass}" data-ids="${item.ids.join(',')}" data-type="${item.type}" data-lvl="${item.lvl}">`;
      html += `<div class="component-icon">`;
      html += `<img src="${imagePath}" alt="${item.title}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />`;
      html += `<div class="component-fallback" style="display: none;">${item.title.charAt(0).toUpperCase()}</div>`;
      html += `</div>`;
      html += `<div class="component-count">${item.count}</div>`;
      html += `</div>`;
    });

    html += '</div></div>';
    return html;
  }

  // CTRL+9 Exponential Money Methods
  /**
   * Starts exponential money increase when CTRL+9 is pressed and held.
   * 
   * The money increases exponentially based on how long the key is held:
   * - Base amount: 1,000,000,000 (1 billion)
   * - Exponential rate: 1.5x per second
   * - Update interval: 100ms
   * 
   * Formula: baseAmount * (rate ^ secondsHeld)
   * Examples:
   * - 0 seconds: 1,000,000,000
   * - 1 second: 1,500,000,000
   * - 2 seconds: 2,250,000,000
   * - 3 seconds: 3,375,000,000
   */
  startCtrl9MoneyIncrease() {
    // Clear any existing timer
    this.stopCtrl9MoneyIncrease();

    // Record start time
    this.ctrl9HoldStartTime = Date.now();

    // Add initial amount
    this.game.addMoney(this.ctrl9BaseAmount);

    // Start interval for exponential increase
    this.ctrl9MoneyInterval = setInterval(() => {
      const holdDuration = Date.now() - this.ctrl9HoldStartTime;
      const secondsHeld = holdDuration / 1000;

      // Calculate exponential amount: base * (rate ^ seconds_held)
      const exponentialAmount = Math.floor(this.ctrl9BaseAmount * Math.pow(this.ctrl9ExponentialRate, secondsHeld));

      // Add the exponential amount
      this.game.addMoney(exponentialAmount);
    }, this.ctrl9IntervalMs);
  }

  stopCtrl9MoneyIncrease() {
    if (this.ctrl9MoneyInterval) {
      clearInterval(this.ctrl9MoneyInterval);
      this.ctrl9MoneyInterval = null;
    }
    this.ctrl9HoldStartTime = null;
  }

  // Performance tracking methods
  startPerformanceTracking() {
    if (this._performanceUpdateInterval) return;

    this._performanceUpdateInterval = setInterval(() => {
      this.updatePerformanceDisplay();
    }, 1000); // Update every second
  }

  stopPerformanceTracking() {
    if (this._performanceUpdateInterval) {
      clearInterval(this._performanceUpdateInterval);
      this._performanceUpdateInterval = null;
    }
  }

  recordFrame() {
    const now = performance.now();
    this._frameCount++;

    // Calculate FPS over the last second
    if (now - this._lastFrameTime >= 1000) {
      const fps = this._frameCount;
      this._fpsHistory.push(fps);

      // Keep only last 10 samples
      if (this._fpsHistory.length > 10) {
        this._fpsHistory.shift();
      }

      this._frameCount = 0;
      this._lastFrameTime = now;
    }
  }

  recordTick() {
    const now = performance.now();
    this._tickCount++;

    // Calculate TPS over the last second
    if (now - this._lastTickTime >= 1000) {
      const tps = this._tickCount;
      this._tpsHistory.push(tps);

      // Keep only last 10 samples
      if (this._tpsHistory.length > 10) {
        this._tpsHistory.shift();
      }

      this._tickCount = 0;
      this._lastTickTime = now;
    }
  }

  updatePerformanceDisplay() {
    if (!this.DOMElements.fps_display || !this.DOMElements.tps_display) return;

    // Calculate average FPS and TPS
    const avgFPS = this._fpsHistory.length > 0
      ? Math.round(this._fpsHistory.reduce((a, b) => a + b, 0) / this._fpsHistory.length)
      : 0;

    const avgTPS = this._tpsHistory.length > 0
      ? Math.round(this._tpsHistory.reduce((a, b) => a + b, 0) / this._tpsHistory.length)
      : 0;

    // Update display with color coding based on performance
    this.DOMElements.fps_display.textContent = avgFPS;
    this.DOMElements.tps_display.textContent = avgTPS;

    // Color code FPS based on 60 FPS target (16.7ms budget)
    if (avgFPS >= 55) {
      this.DOMElements.fps_display.style.color = '#4CAF50'; // Green for good performance
    } else if (avgFPS >= 45) {
      this.DOMElements.fps_display.style.color = '#FF9800'; // Orange for moderate performance
    } else {
      this.DOMElements.fps_display.style.color = '#F44336'; // Red for poor performance
    }

    // Color code TPS based on expected performance
    if (avgTPS >= 30) {
      this.DOMElements.tps_display.style.color = '#4CAF50'; // Green for good performance
    } else if (avgTPS >= 20) {
      this.DOMElements.tps_display.style.color = '#FF9800'; // Orange for moderate performance
    } else {
      this.DOMElements.tps_display.style.color = '#F44336'; // Red for poor performance
    }
  }

  /**
   * Determines the appropriate CSS class for a heat arrow based on the heat value.
   * The style is scaled by the number of digits in the heat value.
   *
   * @param {number | string | bigint} heatValue The amount of heat being transferred.
   * @returns {string} The CSS class name to apply to the arrow element.
   */

  async resetReactor() {
    console.log("resetReactor method called - deleting save and returning to splash");

    // Delete the current save file
    try {
      localStorage.removeItem("reactorGameSave");
      console.log("Save file deleted from localStorage");
    } catch (error) {
      console.error("Error deleting save file:", error);
    }

    // Navigate to splash page (same as Back to Splash button)
    console.log("Navigating to splash page");
    window.location.href = window.location.origin + window.location.pathname;
  }

  /**
   * Cleanup method to stop UI updates and clear timers
   * Should be called when tests finish or when the UI is being destroyed
   */
  cleanup() {
    // Clear the update interface timer
    if (this.update_interface_task) {
      clearTimeout(this.update_interface_task);
      this.update_interface_task = null;
    }

    // Clear any other timers that might be running
    // This helps prevent "Error: This error was caught after test environment was torn down"
  }

  explodeAllPartsSequentially() {
    // Get all tiles with parts
    const tilesWithParts = this.game.tileset.active_tiles_list.filter(tile => tile.part);

    if (tilesWithParts.length === 0) {
      return;
    }

    // In test mode, clear parts immediately without animation delays
    if (typeof process !== "undefined" && (process.env.NODE_ENV === 'test' || process.env.VITEST === 'true')) {
      tilesWithParts.forEach((tile) => {
        if (tile.part) {
          tile.clearPart(false);
        }
      });
      console.log("All parts exploded!");
      return;
    }

    // Shuffle the tiles for random explosion order
    const shuffledTiles = [...tilesWithParts].sort(() => Math.random() - 0.5);

    // Explode each tile with a delay
    shuffledTiles.forEach((tile, index) => {
      setTimeout(() => {
        if (tile.part && tile.$el) {
          // Add explosion class for visual effect
          tile.$el.classList.add("exploding");

          // Add a brief delay before clearing the part
          setTimeout(() => {
            tile.clearPart(false);
          }, 600); // Wait for explosion animation to complete (0.6s)
        }
      }, index * 150); // 150ms delay between each explosion
    });

    // Add a final delay to ensure all explosions complete before allowing new actions
    const totalExplosionTime = (shuffledTiles.length - 1) * 150 + 600;
    setTimeout(() => {
      // Optional: Add any post-explosion cleanup or effects here
      console.log("All parts exploded!");
    }, totalExplosionTime);
  }

  updateProgressBarMeltdownState(isMeltdown) {
    // Update desktop progress bars
    const desktopPowerElement = document.querySelector('.info-bar-desktop .info-item.power');
    const desktopHeatElement = document.querySelector('.info-bar-desktop .info-item.heat');

    if (desktopPowerElement) {
      desktopPowerElement.classList.toggle('meltdown', isMeltdown);
    }
    if (desktopHeatElement) {
      desktopHeatElement.classList.toggle('meltdown', isMeltdown);
    }

    // Update mobile progress bars
    const mobilePowerElement = document.querySelector('#info_bar .info-row.info-main .info-item.power');
    const mobileHeatElement = document.querySelector('#info_bar .info-row.info-main .info-item.heat');

    if (mobilePowerElement) {
      mobilePowerElement.classList.toggle('meltdown', isMeltdown);
    }
    if (mobileHeatElement) {
      mobileHeatElement.classList.toggle('meltdown', isMeltdown);
    }

    // Update money display to show radiation symbol during meltdown
    const mobileEl = document.getElementById("info_money");
    const desktopEl = document.getElementById("info_money_desktop");

    if (isMeltdown) {
      if (mobileEl) mobileEl.textContent = "☢️";
      if (desktopEl) desktopEl.textContent = "☢️";
    } else {
      // Restore normal money display
      this.stateManager.setVar("current_money", this.game.current_money);
    }
  }

  initializePWADisplayModeButton(button) {
    if (!button) {
      console.warn("[UI] PWA display mode button not found");
      return;
    }

    const displayModes = ["fullscreen", "standalone", "minimal-ui", "browser"];
    const modeLabels = {
      "fullscreen": "🖥️ Fullscreen",
      "standalone": "📱 Standalone",
      "minimal-ui": "🔲 Minimal UI",
      "browser": "🌐 Browser"
    };

    const getCurrentMode = () => {
      const saved = localStorage.getItem("pwa_display_mode");
      if (saved && displayModes.includes(saved)) {
        return saved;
      }
      return "fullscreen";
    };

    const setDisplayMode = (mode) => {
      localStorage.setItem("pwa_display_mode", mode);
      this.updateManifestDisplayMode(mode);
      button.title = `PWA Display: ${modeLabels[mode]} (Click to cycle)`;
      button.style.display = "flex";
      button.style.visibility = "visible";
      button.style.opacity = "1";
      button.style.display = "flex";
      button.style.visibility = "visible";
    };

    const cycleDisplayMode = () => {
      const current = getCurrentMode();
      const currentIndex = displayModes.indexOf(current);
      const nextIndex = (currentIndex + 1) % displayModes.length;
      const nextMode = displayModes[nextIndex];
      setDisplayMode(nextMode);
      
      const toast = document.createElement("div");
      toast.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: #2a2a2a;
        border: 2px solid #4CAF50;
        border-radius: 8px;
        padding: 12px 20px;
        z-index: 10000;
        font-family: 'Minecraft', monospace;
        font-size: 0.9em;
        color: #fff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        animation: toast-slide-up 0.3s ease-out;
      `;
      toast.textContent = `PWA Display Mode: ${modeLabels[nextMode]} - Reload to apply`;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        if (document.body.contains(toast)) {
          toast.style.animation = "toast-slide-up 0.3s ease-out reverse";
          setTimeout(() => toast.remove(), 300);
        }
      }, 3000);
    };

    button.onclick = cycleDisplayMode;
    setDisplayMode(getCurrentMode());
  }

  updateManifestDisplayMode(mode) {
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;

    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      return;
    }

    const originalHref = manifestLink.getAttribute("data-original-href") || manifestLink.href;
    if (!manifestLink.hasAttribute("data-original-href")) {
      manifestLink.setAttribute("data-original-href", originalHref);
    }

    fetch(originalHref)
      .then(response => response.json())
      .then(manifest => {
        manifest.display = mode;
        manifest.display_override = [mode, "standalone"];
        
        const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const newLink = document.createElement("link");
        newLink.rel = "manifest";
        newLink.href = url;
        newLink.setAttribute("data-original-href", originalHref);
        
        const oldLink = document.querySelector('link[rel="manifest"]');
        if (oldLink) {
          oldLink.remove();
        }
        
        document.head.appendChild(newLink);
      })
      .catch(error => {
        console.warn("[UI] Failed to update manifest display mode:", error);
      });
  }
}
