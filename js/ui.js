import { numFormat as fmt } from "./util.js";
import { StateManager } from "./stateManager.js";
import { Hotkeys } from "./hotkeys.js";
import help_text from "../data/help_text.js";
import { on } from "./util.js";

export class UI {
  constructor() {
    this.game = null;
    this.DOMElements = {};
    this.update_vars = new Map();
    this.update_interface_interval = 100;
    this.update_interface_task = null;
    this.stateManager = new StateManager(this);
    this.hotkeys = null;
    this.isDragging = false;
    this.lastTileModified = null;
    this.longPressTimer = null;
    this.longPressDuration = 500;
    this.var_objs_config = {};
    this.last_money = 0;
    this.last_exotic_particles = 0;
    this.dom_ids = [
      "main",
      "reactor",
      "reactor_background",
      "reactor_wrapper",
      "reactor_section",
      "parts_section",
      "info_bar",
      "info_money_block",
      "info_bar_current_heat",
      "info_bar_max_heat",
      "info_heat_progress",
      "info_bar_current_power",
      "info_bar_max_power",
      "info_power_progress",
      "info_bar_money",
      "sellBtnInfoBar",
      "reduceHeatBtnInfoBar",
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
      "objectives_section",
      "objective_title",
      "objective_reward",
      "tooltip",
      "tooltip_data",
      "stats_power",
      "stats_heat",
      "stats_cash",
      "stats_outlet",
      "stats_inlet",
      "stats_vent",
      "upgrades_section",
      "experimental_upgrades_section",
      "about_section",
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
      "basic_overview_section",
      "debug_section",
      "debug_toggle_btn",
      "debug_hide_btn",
      "debug_variables",
      "debug_refresh_btn",
      "meltdown_banner",
      "controls_collapse_btn",
      "controls_collapse_icon",
      "controls_expanded_group",
      "controls_collapsed_group",
      "splash_close_btn",
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

  cacheDOMElements() {
    // Cache all available DOM elements, but don't fail if some are missing
    // since they'll be loaded dynamically
    this.dom_ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        this.DOMElements[id] = el;
        const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        this.DOMElements[camelCaseKey] = el;

        // Debug logging for stats elements
        if (id.startsWith("stats_")) {
          console.log(`[UI] Cached DOM element ${id}:`, el);
        }
      } else {
        // Don't warn for elements that will be loaded dynamically
        const dynamicElements = [
          "reactor",
          "reactor_background",
          "reactor_wrapper",
          "reactor_section",
          "upgrades_section",
          "experimental_upgrades_section",
          "about_section",
          "upgrades_content_wrapper",
          "experimental_upgrades_content_wrapper",
          "stats_power",
          "stats_heat",
          "stats_cash",
          "stats_outlet",
          "stats_inlet",
          "stats_vent",
          "cell_power_upgrades",
          "cell_tick_upgrades",
          "cell_perpetual_upgrades",
          "vent_upgrades",
          "exchanger_upgrades",
          "experimental_laboratory",
          "experimental_boost",
          "experimental_particle_accelerators",
          "experimental_cells",
          "experimental_cells_boost",
          "experimental_parts",
          "current_exotic_particles",
          "total_exotic_particles",
          "reboot_exotic_particles",
          "refund_exotic_particles",
          "reboot_btn",
          "refund_btn",
          "basic_overview_section",
          "debug_section",
          "debug_toggle_btn",
          "debug_hide_btn",
          "debug_variables",
          "debug_refresh_btn",
          "meltdown_banner",
          "collapsed_controls_nav",
        ];
        if (!dynamicElements.includes(id)) {
          console.warn(`[UI] Element with id '${id}' not found in DOM.`);
        }
      }
    });

    // Cache control elements
    this.DOMElements.collapsed_controls_nav = document.getElementById(
      "collapsed_controls_nav"
    );
    this.DOMElements.controls_collapse_btn = document.getElementById(
      "controls_collapse_btn"
    );
    this.DOMElements.controls_collapse_icon = document.getElementById(
      "controls_collapse_icon"
    );
    this.DOMElements.controls_expanded_group = document.getElementById(
      "controls_expanded_group"
    );
    this.DOMElements.controls_collapsed_group = document.getElementById(
      "controls_collapsed_group"
    );

    // Always return true - we'll handle missing elements gracefully
    return true;
  }

  initializeToggleButtons() {
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const button = this.DOMElements[config.id];
      if (button) {
        console.log(`[UI] Attaching toggle handler to #${config.id}`);
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
    this.updateAllToggleBtnStates();
    if (this.DOMElements.controls_collapsed_group) {
      const icons = {
        auto_sell: "💲",
        auto_buy: "🛒",
        time_flux: "⏩",
        heat_control: "🌡️",
        pause: "⏸️", // initial, will be updated in updateAllToggleBtnStates
      };
      this.DOMElements.controls_collapsed_group
        .querySelectorAll(".collapsed-control-btn")
        .forEach((btn) => {
          const control = btn.getAttribute("data-control");
          btn.innerHTML = icons[control] || "?";
          btn.onclick = () => {
            const currentState = this.stateManager.getVar(control);
            this.stateManager.setVar(control, !currentState);
            this.updateAllToggleBtnStates(); // Ensure UI updates everywhere
          };
        });
    }

    // Add this after setting up all toggle buttons in initializeToggleButtons()
    const updatePauseButtonIcon = () => {
      const isPaused = this.stateManager.getVar("pause");
      const pauseBtn = this.DOMElements.pause_toggle;
      if (pauseBtn) {
        pauseBtn.textContent = isPaused ? "▶️" : "⏸️";
      }
    };
    updatePauseButtonIcon();

    // Patch setVar to also update pause button icon and toggle states
    const origSetVar = this.stateManager.setVar.bind(this.stateManager);
    this.stateManager.setVar = (key, value) => {
      origSetVar(key, value);
      if (key === "pause") {
        this.updateAllToggleBtnStates();
        updatePauseButtonIcon();
      }
    };
  }

  updateAllToggleBtnStates() {
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const isActive = this.stateManager.getVar(config.stateProperty);
      this.updateToggleButtonState(config, isActive);
    }
    if (this.DOMElements.controls_collapsed_group) {
      const isPaused = this.stateManager.getVar("pause");
      this.DOMElements.controls_collapsed_group
        .querySelectorAll(".collapsed-control-btn")
        .forEach((btn) => {
          const control = btn.getAttribute("data-control");
          const isActive = this.stateManager.getVar(control);
          btn.classList.toggle("on", isActive);
          const icons = {
            auto_sell: "💲",
            auto_buy: "🛒",
            time_flux: "⏩",
            heat_control: "🌡️",
            pause: isPaused ? "▶️" : "⏸️",
          };
          btn.innerHTML = icons[control] || "?";
        });
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
      ],
    };
    const categories = categoryMap[tabId] || [];

    this.clearPartContainers();

    categories.forEach((partCategory) => {
      const parts = this.game.partset.getPartsByCategory(partCategory);
      parts.forEach((part) => {
        this.stateManager.handlePartAdded(this.game, part);
      });
    });
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
    const activeTab = Array.from(
      partsTabsContainer.querySelectorAll(".parts_tab")
    ).find((btn) => btn.classList.contains("active"));
    if (activeTab) {
      this.populatePartsForTab(activeTab.getAttribute("data-tab"));
    }
    this.updateCollapsedControlsNav();
  }

  updateMeltdownState() {
    if (this.game && this.game.reactor) {
      const hasMeltedDown = this.game.reactor.has_melted_down;
      document.body.classList.toggle("reactor-meltdown", hasMeltedDown);
    }
  }

  runUpdateInterfaceLoop() {
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

    this.game.performance.markEnd("ui_update_total");
  }

  processUpdateQueue() {
    if (this.update_vars.size === 0) return;
    for (const [key, value] of this.update_vars) {
      const config = this.var_objs_config[key];
      if (!config) {
        console.log(`[UI] No config found for update key: ${key}`);
        continue;
      }
      if (config.dom) {
        let textContent = config.num ? fmt(value, config.places) : value;
        if (config.prefix) textContent = config.prefix + textContent;
        config.dom.textContent = textContent;
      }
      config.onupdate?.(value);
    }
    this.update_vars.clear();
  }

  initVarObjsConfig() {
    this.var_objs_config = {
      current_money: { dom: this.DOMElements.info_bar_money, num: true },
      current_power: {
        dom: this.DOMElements.info_bar_current_power,
        num: true,
        onupdate: () =>
          this.updatePercentageBar(
            "current_power",
            "max_power",
            this.DOMElements.info_power_progress
          ),
      },
      max_power: {
        dom: this.DOMElements.info_bar_max_power,
        num: true,
        onupdate: () =>
          this.updatePercentageBar(
            "current_power",
            "max_power",
            this.DOMElements.info_power_progress
          ),
      },
      current_heat: {
        dom: this.DOMElements.info_bar_current_heat,
        num: true,
        places: 0,
        onupdate: () => {
          this.updatePercentageBar(
            "current_heat",
            "max_heat",
            this.DOMElements.info_heat_progress
          );
          this.updateReactorHeatBackground();
        },
      },
      max_heat: {
        dom: this.DOMElements.info_bar_max_heat,
        num: true,
        places: 0,
        onupdate: () => {
          this.updatePercentageBar(
            "current_heat",
            "max_heat",
            this.DOMElements.info_heat_progress
          );
          this.updateReactorHeatBackground();
        },
      },
      exotic_particles: {
        num: true,
        onupdate: (val) => {
          if (this.DOMElements.reboot_exotic_particles) {
            this.DOMElements.reboot_exotic_particles.textContent = fmt(val);
          }
          if (this.DOMElements.refund_exotic_particles) {
            this.DOMElements.refund_exotic_particles.textContent = fmt(
              (this.stateManager.getVar("total_exotic_particles") || 0) + val
            );
          }
        },
      },
      current_exotic_particles: {
        dom: this.DOMElements.current_exotic_particles,
        num: true,
      },
      total_exotic_particles: {
        dom: this.DOMElements.total_exotic_particles,
        num: true,
      },
      stats_power: {
        dom: this.DOMElements.stats_power,
        num: true,
        onupdate: (val) => {
          if (!this.DOMElements.stats_power) {
            console.log(
              `[UI] stats_power DOM element missing when trying to update with value: ${val}`
            );
          }
        },
      },
      total_heat: {
        dom: this.DOMElements.stats_heat,
        num: true,
        places: 0,
        onupdate: (val) => {
          if (!this.DOMElements.stats_heat) {
            console.log(
              `[UI] stats_heat DOM element missing when trying to update with value: ${val}`
            );
          }
        },
      },
      stats_cash: { dom: this.DOMElements.stats_cash, num: true, places: 2 },
      stats_outlet: {
        dom: this.DOMElements.stats_outlet,
        num: true,
        places: 0,
      },
      stats_inlet: { dom: this.DOMElements.stats_inlet, num: true, places: 0 },
      stats_vent: { dom: this.DOMElements.stats_vent, num: true, places: 0 },
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
            pauseBtn.textContent = val ? "Resume" : "Pause";
          }
          document.body.classList.toggle("game-paused", val);
        },
      },
      melting_down: {
        onupdate: (val) => {
          // This is handled by updateMeltdownState()
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

  updateReactorHeatBackground() {
    const current = this.stateManager.getVar("current_heat") || 0;
    const max = this.stateManager.getVar("max_heat") || 1;
    const background = this.DOMElements.reactor_background;
    if (!background) return;
    if (current <= max) background.style.backgroundColor = "transparent";
    else if (current <= max * 2)
      background.style.backgroundColor = `rgba(255, 0, 0, ${
        (current - max) / max
      })`;
    else background.style.backgroundColor = `rgb(255, 0, 0)`;
  }

  /**
   * Initial setup that does NOT depend on the main game layout.
   * @param {import('./game.js').Game} gameInstance
   * @returns {boolean} Success state
   */
  init(gameInstance) {
    this.game = gameInstance;
    this.stateManager.setGame(gameInstance);
    this.hotkeys = new Hotkeys(this.game);
    return true;
  }

  /**
   * Initializes all UI components and event listeners that depend on the main game layout.
   * This should be called AFTER the game.html layout has been loaded into the DOM.
   */
  initMainLayout() {
    this.cacheDOMElements();
    this.initVarObjsConfig();
    this.setupEventListeners();
    this.initializeToggleButtons();
    this.setupPartsTabs();
    this.initializeHelpButtons();
    this.initializePartsPanel();
    this.addHelpButtonToMainPage();
    if (this.DOMElements.basic_overview_section && help_text.basic_overview) {
      this.DOMElements.basic_overview_section.innerHTML = `
        <h3>${help_text.basic_overview.title}</h3>
        <p>${help_text.basic_overview.content}</p>
        `;
    }
    this.resizeReactor();
    window.addEventListener("resize", () => this.resizeReactor());
    this.runUpdateInterfaceLoop();
  }

  resizeReactor() {
    if (
      !this.game ||
      !this.DOMElements.reactor ||
      !this.DOMElements.reactor_wrapper
    )
      return;

    const wrapper = this.DOMElements.reactor_wrapper;
    const wrapperWidth = wrapper.clientWidth;
    const wrapperHeight = wrapper.clientHeight;

    const numCols = this.game.cols;
    const numRows = this.game.rows;
    const gap = 1; // Match the CSS gap value

    // Calculate tile size based on both width and height constraints
    const tileSizeForWidth = wrapperWidth / numCols;
    const tileSizeForHeight = wrapperHeight / numRows;

    // Use the smaller of the two to ensure the entire grid fits
    let tileSize =
      Math.floor(Math.min(tileSizeForWidth, tileSizeForHeight)) - gap;

    // Clamp the tile size to a reasonable range for usability
    tileSize = Math.max(20, Math.min(64, tileSize)); // Lowered min size for mobile

    this.DOMElements.reactor.style.setProperty("--tile-size", `${tileSize}px`);
    this.DOMElements.reactor.style.setProperty("--game-cols", numCols);
    this.DOMElements.reactor.style.setProperty("--game-rows", numRows);

    // Force a layout recalculation on mobile devices to ensure proper alignment
    if (window.innerWidth <= 900) {
      // Trigger a reflow to ensure CSS grid updates properly
      this.DOMElements.reactor.offsetHeight;
    }
  }

  // Utility method to force reactor realignment - useful for mobile orientation changes
  forceReactorRealignment() {
    if (!this.game || !this.DOMElements.reactor) return;

    // Force a complete reflow by briefly hiding and showing the reactor
    const reactor = this.DOMElements.reactor;
    const originalDisplay = reactor.style.display;
    reactor.style.display = "none";
    reactor.offsetHeight; // Force reflow
    reactor.style.display = originalDisplay;

    // Then resize normally
    this.resizeReactor();
  }

  setupEventListeners() {
    // Only navigation, info bar, and other non-reactor event listeners remain here
    const setupNav = (container, buttonClass) => {
      if (!container) return;
      console.log(
        `[UI] Attaching nav handler to`,
        container,
        "with selector",
        buttonClass
      );
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
    setupNav(this.DOMElements.bottom_nav, ".pixel-btn");
    setupNav(this.DOMElements.main_top_nav, ".pixel-btn");
    if (this.DOMElements.reduceHeatBtnInfoBar) {
      this.DOMElements.reduceHeatBtnInfoBar.addEventListener("click", () => {
        if (this.game) this.game.manual_reduce_heat_action();
      });
    }
    if (this.DOMElements.sellBtnInfoBar) {
      this.DOMElements.sellBtnInfoBar.addEventListener("click", () => {
        if (this.game) this.game.sell_action();
      });
    }
    this.DOMElements.reboot_btn?.addEventListener("click", () =>
      this.game.reboot_action(false)
    );
    this.DOMElements.refund_btn?.addEventListener("click", () =>
      this.game.reboot_action(true)
    );
    this.updatePartsPanelBodyClass();
    document.addEventListener("keydown", (e) => {
      // Spacebar to toggle pause/play
      if (e.code === "Space") {
        // Only handle spacebar if not typing in an input field
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
            this.game.addMoney(1000000000);
            break;
        }
      }
    });
    // Parts panel toggle is handled in initializePartsPanel() method
    // This button selector doesn't match our current HTML structure anyway
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

    // Handle window resize events for mobile orientation changes
    let resizeTimeout;
    window.addEventListener("resize", () => {
      // Debounce resize events to avoid excessive calls
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (this.game && this.DOMElements.reactor) {
          this.resizeReactor();
        }
      }, 100);
    });

    // Handle Visual Viewport changes (mobile keyboard, orientation, etc.)
    if (window.visualViewport) {
      let viewportTimeout;
      window.visualViewport.addEventListener("resize", () => {
        clearTimeout(viewportTimeout);
        viewportTimeout = setTimeout(() => {
          if (
            this.game &&
            this.DOMElements.reactor &&
            window.innerWidth <= 900
          ) {
            this.forceReactorRealignment();
          }
        }, 150);
      });
    }

    if (this.DOMElements.splash_close_btn) {
      this.DOMElements.splash_close_btn.onclick = () => {
        location.reload();
      };
    }
    const debugToggleBtn = this.DOMElements.debug_toggle_btn;
    const debugHideBtn = this.DOMElements.debug_hide_btn;
    const debugRefreshBtn = this.DOMElements.debug_refresh_btn;
    const debugSection = this.DOMElements.debug_section;
    if (debugToggleBtn) {
      debugToggleBtn.addEventListener("click", () => {
        this.showDebugPanel();
      });
    }
    if (debugHideBtn) {
      debugHideBtn.addEventListener("click", () => {
        this.hideDebugPanel();
      });
    }
    if (debugRefreshBtn) {
      debugRefreshBtn.addEventListener("click", () => {
        this.updateDebugVariables();
      });
    }
  }

  handleGridInteraction(tileEl, event) {
    if (!tileEl || !tileEl.tile) return;

    // Prevent interactions if reactor has melted down
    if (this.game && this.game.reactor && this.game.reactor.has_melted_down) {
      return;
    }

    const startTile = tileEl.tile;
    const isRightClick =
      (event.pointerType === "mouse" && event.button === 2) ||
      event.type === "contextmenu";
    const clicked_part = this.stateManager.getClickedPart();
    const tilesToModify = this.hotkeys.getTiles(startTile, event);

    for (const tile of tilesToModify) {
      if (isRightClick) {
        if (tile.part && tile.part.id && !tile.part.isSpecialTile) {
          this.game.sellPart(tile);
        }
      } else {
        if (clicked_part) {
          if (tile.part) {
            if (this.game && this.game.tooltip_manager) {
              console.log("Showing tooltip for part", tile.part);
              this.game.tooltip_manager.show(tile.part, tile, true);
            }
            continue;
          }
          if (this.game.current_money >= clicked_part.cost) {
            this.game.current_money -= clicked_part.cost;
            tile.setPart(clicked_part);
          }
        } else if (tile.part) {
          // No part selected, show tooltip for existing part
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(tile.part, tile, true);
          }
        }
      }
    }
  }

  // Helper to sync body class with panel state
  updatePartsPanelBodyClass() {
    const partsSection = document.getElementById("parts_section");
    if (partsSection && !partsSection.classList.contains("collapsed")) {
      document.body.classList.add("parts-panel-open");

      // Track which side the panel is on
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

  initializeHelpButtons() {
    // Add info buttons to part headers
    document.querySelectorAll(".parts_tab_content h4").forEach((header) => {
      const originalText = header.textContent; // Store original text before adding button
      const partType = originalText.toLowerCase();

      // Map header text to help text keys
      const helpTextKeyMap = {
        cells: "cells",
        reflectors: "reflectors",
        capacitors: "capacitors",
        "particle accelerators": "particleAccelerators",
        vents: "vents",
        "heat exchangers": "heatExchangers",
        inlets: "heatInlets",
        outlets: "heatOutlets",
        "coolant cells": "coolantCells",
        "reactor platings": "reactorPlatings",
      };

      const helpKey = helpTextKeyMap[partType];

      if (help_text.parts[helpKey]) {
        const infoButton = document.createElement("button");
        infoButton.className = "info-button pixel-btn-small";
        infoButton.textContent = "?";
        infoButton.title = "Click for information";

        infoButton.addEventListener("click", (e) => {
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(
              {
                title: originalText, // Use original text without info button
                description: help_text.parts[helpKey],
              },
              null,
              true,
              infoButton
            );
          }
        });
        header.appendChild(infoButton);
      }
    });

    // Add info buttons to control buttons
    document.querySelectorAll("#controls_nav .nav_button").forEach((button) => {
      const originalText = button.textContent;
      const controlType = originalText.replace(/\s+/g, "").toLowerCase();
      if (help_text.controls[controlType]) {
        const infoButton = document.createElement("button");
        infoButton.className = "info-button pixel-btn-small";
        infoButton.textContent = "?";
        infoButton.title = "Click for information";
        infoButton.style.marginLeft = "4px";

        infoButton.addEventListener("click", (e) => {
          e.stopPropagation();
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(
              {
                title: originalText,
                description: help_text.controls[controlType],
              },
              null,
              true,
              infoButton
            );
          }
        });
        button.appendChild(infoButton);
      }
    });

    const helpEnabled = this.stateManager.getVar("show_help_buttons") ?? true;
    document.body.classList.toggle("hide-help-buttons", !helpEnabled);
  }

  initializePartsPanel() {
    const toggle = this.DOMElements.parts_panel_toggle;
    const panel = this.DOMElements.parts_section;

    if (toggle && panel) {
      // Initialize dragging functionality
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startTop = 0;
      let dragStartTime = 0;
      let hasMoved = false;

      // Load saved panel side preference
      const savedSide = localStorage.getItem("partsPanelSide") || "left";
      if (savedSide === "right") {
        panel.classList.add("right-side");
      }

      // On desktop (>900px), ensure panel is expanded by default
      const isMobile = window.innerWidth <= 900;
      if (!isMobile) {
        panel.classList.remove("collapsed");
        this.updatePartsPanelBodyClass();
      }

      const onPointerDown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startTop = toggle.offsetTop;
        dragStartTime = Date.now();
        hasMoved = false;

        toggle.classList.add("dragging");
        toggle.setPointerCapture(e.pointerId);
        e.preventDefault();
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (totalMovement > 5) {
          hasMoved = true;
        }

        // Determine if this is primarily horizontal or vertical movement
        const isHorizontalDrag =
          Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 20;

        if (isHorizontalDrag) {
          // Horizontal drag - show visual feedback for side switching (both desktop and mobile)
          const threshold = 100; // pixels to drag before switching sides
          const isRightSide = panel.classList.contains("right-side");

          if (!isRightSide && deltaX > threshold) {
            // Dragging right from left side
            toggle.style.transform = `translateX(${Math.min(
              deltaX,
              threshold * 2
            )}px)`;
            toggle.style.opacity = "0.6";
          } else if (isRightSide && deltaX < -threshold) {
            // Dragging left from right side
            toggle.style.transform = `translateX(${Math.max(
              deltaX,
              -threshold * 2
            )}px)`;
            toggle.style.opacity = "0.6";
          }
        }

        // Always allow vertical repositioning (regardless of horizontal movement)
        if (Math.abs(deltaY) > 5) {
          const newTop = startTop + deltaY;

          // Calculate bounds - account for bottom bars
          const isMobile = window.innerWidth <= 900;
          const bottomBarHeight = isMobile ? 250 : 150; // More space needed on mobile
          const maxTop =
            window.innerHeight - toggle.offsetHeight - bottomBarHeight;
          const boundedTop = Math.max(0, Math.min(newTop, maxTop));

          toggle.style.top = `${boundedTop}px`;
        }
      };

      const onPointerUp = (e) => {
        if (!isDragging) return;

        isDragging = false;
        toggle.classList.remove("dragging");
        toggle.style.transform = "";
        toggle.style.opacity = "";

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const isHorizontalDrag =
          hasMoved &&
          Math.abs(deltaX) > Math.abs(deltaY) &&
          Math.abs(deltaX) > 20;

        // Check if we're on mobile (screen width <= 900px)
        const isMobile = window.innerWidth <= 900;

        if (isHorizontalDrag) {
          // Allow side switching on both desktop and mobile for horizontal drags
          const threshold = 100;
          const isRightSide = panel.classList.contains("right-side");

          if (!isRightSide && deltaX > threshold) {
            panel.classList.add("right-side");
            localStorage.setItem("partsPanelSide", "right");
            this.updatePartsPanelBodyClass();
          } else if (isRightSide && deltaX < -threshold) {
            panel.classList.remove("right-side");
            localStorage.setItem("partsPanelSide", "left");
            this.updatePartsPanelBodyClass();
          }
        } else {
          // For non-horizontal interactions (clicks and vertical drags)
          const clickTime = Date.now() - dragStartTime;
          const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          // Check if we're on mobile for click behavior
          // const isMobile = window.innerWidth <= 900; // Already declared above

          if (!hasMoved || (clickTime < 200 && totalMovement < 10)) {
            // Only allow collapse/expand clicks on mobile
            if (isMobile) {
              panel.classList.toggle("collapsed");
              this.updatePartsPanelBodyClass();
            }
            // On desktop, clicks do nothing
          }
        }
      };

      // Add event listeners for dragging
      toggle.addEventListener("pointerdown", onPointerDown);
      toggle.addEventListener("pointermove", onPointerMove);
      toggle.addEventListener("pointerup", onPointerUp);
      toggle.addEventListener("pointercancel", onPointerUp);

      // Set initial position to bottom if not already set
      if (!toggle.style.top) {
        const isMobileInit = window.innerWidth <= 900;
        const bottomBarHeight = isMobileInit ? 250 : 150;
        toggle.style.top = `${
          window.innerHeight - toggle.offsetHeight - bottomBarHeight
        }px`;
      }

      // Update position on window resize
      window.addEventListener("resize", () => {
        if (!toggle.style.top) return;

        const currentTop = parseInt(toggle.style.top);
        const isMobileResize = window.innerWidth <= 900;
        const bottomBarHeight = isMobileResize ? 250 : 150;
        const maxTop =
          window.innerHeight - toggle.offsetHeight - bottomBarHeight;

        if (currentTop > maxTop) {
          toggle.style.top = `${maxTop}px`;
        }

        // Update panel collapsed state based on screen size
        const isMobileState = window.innerWidth <= 900;
        if (!isMobileState) {
          // Desktop: ensure panel is expanded
          panel.classList.remove("collapsed");
          this.updatePartsPanelBodyClass();
        }
      });
    }
  }

  renderUpgrade(upgrade) {
    const btn = document.createElement("button");
    btn.className = "pixel-btn is-square upgrade";
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
      // Fallback to a simple modal if loading fails
      const modal = document.createElement("div");
      modal.id = "quick-start-modal";
      modal.innerHTML = `
        <div class="quick-start-overlay">
          <div class="quick-start-content pixel-panel">
            <h2>Getting Started Guide</h2>
            <p>Follow the objectives at the top to continue the tutorial!</p>
            <button id="quick-start-close-detailed-fallback" class="pixel-btn btn-start">Got it!</button>
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
    // Add help button to the main top navigation
    const mainTopNav = this.DOMElements.main_top_nav;
    if (mainTopNav) {
      const helpButton = document.createElement("button");
      helpButton.className = "pixel-btn is-small";
      helpButton.title = "Getting Started Guide";
      helpButton.textContent = "?";
      helpButton.style.marginLeft = "8px";
      helpButton.onclick = async () => await this.showDetailedQuickStart();

      // Insert before the about button
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
      debugSection.style.display = "block";
      debugToggleBtn.textContent = "Hide Debug Info";
      this.updateDebugVariables();
    }
  }

  hideDebugPanel() {
    const debugSection = this.DOMElements.debug_section;
    const debugToggleBtn = this.DOMElements.debug_toggle_btn;

    if (debugSection && debugToggleBtn) {
      debugSection.style.display = "none";
      debugToggleBtn.textContent = "Show Debug Info";
    }
  }

  updateDebugVariables() {
    if (!this.game || !this.DOMElements.debug_variables) return;

    const debugContainer = this.DOMElements.debug_variables;
    debugContainer.innerHTML = "";

    // Collect all game variables organized by source file
    const gameVars = this.collectGameVariables();

    // Create sections for each file
    Object.entries(gameVars).forEach(([fileName, variables]) => {
      const section = document.createElement("div");
      section.className = "debug-section";

      const title = document.createElement("h4");
      title.textContent = fileName;
      section.appendChild(title);

      const varList = document.createElement("div");
      varList.className = "debug-variables-list";

      // Sort variables by key
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

    // Game variables
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

    // Reactor variables
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
      vars["Reactor (reactor.js)"]["stats_cash"] = reactor.stats_cash;
      vars["Reactor (reactor.js)"]["vent_multiplier_eff"] =
        reactor.vent_multiplier_eff;
      vars["Reactor (reactor.js)"]["transfer_multiplier_eff"] =
        reactor.transfer_multiplier_eff;
    }

    // Tileset variables
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

    // Engine variables
    if (game.engine) {
      const engine = game.engine;
      vars["Engine"]["running"] = engine.running;
      vars["Engine"]["tick_count"] = engine.tick_count;
      vars["Engine"]["last_tick_time"] = engine.last_tick_time;
      vars["Engine"]["tick_interval"] = engine.tick_interval;
    }

    // State Manager variables
    if (this.stateManager) {
      const stateVars = this.stateManager.getAllVars();
      Object.entries(stateVars).forEach(([key, value]) => {
        vars["State Manager"][key] = value;
      });
    }

    // UI State variables
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
    vars["UI State"][
      "screen_resolution"
    ] = `${window.innerWidth}x${window.innerHeight}`;
    vars["UI State"]["device_pixel_ratio"] = window.devicePixelRatio;

    // Performance variables
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
      return `<span class='debug-object'>{${
        Object.keys(value).length
      } keys}</span>`;
    }
    return `<span class='debug-other'>${String(value)}</span>`;
  }

  updateCollapsedControlsNav() {
    const isCollapsed =
      this.DOMElements.parts_section.classList.contains("collapsed");
    if (this.DOMElements.collapsed_controls_nav) {
      this.DOMElements.collapsed_controls_nav.style.display = isCollapsed
        ? "flex"
        : "none";
    }
  }

  initializePage(pageId) {
    const game = this.game;
    // Always refresh DOM element cache at the start
    this.cacheDOMElements();

    // For reactor page, also reinitialize the var objects config since DOM elements may have changed
    if (pageId === "reactor_section") {
      this.initVarObjsConfig();
    }

    // Helper function to set up click handlers for upgrade buttons on a page.
    const setupUpgradeClickHandler = (containerId) => {
      const container = document.getElementById(containerId);
      if (!container) return;
      on(container, ".upgrade", "click", function (e) {
        const upgradeEl = this; // 'this' is the button element from 'on' handler
        if (!upgradeEl.upgrade_object) return;
        const upgrade_obj = upgradeEl.upgrade_object;

        if (e.shiftKey) {
          let bought = 0;
          while (upgrade_obj.affordable && bought < 10) {
            if (game.upgradeset.purchaseUpgrade(upgrade_obj.id)) {
              bought++;
            } else {
              break; // Stop if purchase fails (e.g., not enough money for next level)
            }
          }
          if (
            game.tooltip_manager.isLocked &&
            game.tooltip_manager.current_obj === upgrade_obj
          ) {
            game.tooltip_manager.update();
          }
        } else {
          game.tooltip_manager.show(upgrade_obj, null, true, upgradeEl);
        }
      });
    };

    switch (pageId) {
      case "reactor_section":
        if (this.DOMElements.reactor) {
          this.DOMElements.reactor.innerHTML = "";
        }
        console.log(
          "[UI] Rendering reactor grid. Tileset:",
          this.game.tileset,
          "Tiles:",
          this.game.tileset?.tiles_list?.length
        );
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
        this.resizeReactor();
        break;
      case "upgrades_section":
        console.log("[UI] Initializing upgrades section");
        setupUpgradeClickHandler("upgrades_content_wrapper");
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateUpgrades === "function"
        ) {
          console.log(
            "[UI] Populating upgrades via upgradeset.populateUpgrades"
          );
          game.upgradeset.populateUpgrades();
        } else {
          console.warn(
            "[UI] upgradeset.populateUpgrades is not a function or upgradeset missing"
          );
        }
        break;
      case "experimental_upgrades_section":
        console.log("[UI] Initializing experimental upgrades section");
        setupUpgradeClickHandler("experimental_upgrades_content_wrapper");
        if (
          game.upgradeset &&
          typeof game.upgradeset.populateExperimentalUpgrades === "function"
        ) {
          console.log(
            "[UI] Populating experimental upgrades via upgradeset.populateExperimentalUpgrades"
          );
          game.upgradeset.populateExperimentalUpgrades();
        } else {
          console.warn(
            "[UI] upgradeset.populateExperimentalUpgrades is not a function or upgradeset missing"
          );
        }
        const rebootBtn = document.getElementById("reboot_btn");
        const refundBtn = document.getElementById("refund_btn");
        if (rebootBtn) rebootBtn.onclick = () => game.reboot_action(false);
        if (refundBtn) refundBtn.onclick = () => game.reboot_action(true);
        break;
      case "about_section":
        const versionEl = document.getElementById("about_version");
        const appVersionEl = document.getElementById("app_version");
        if (versionEl && appVersionEl) {
          versionEl.textContent = appVersionEl.textContent;
        }
        break;
    }
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
              }
            }, this.longPressDuration);
          }
          this.isDragging = false;
        }, 250);
      }
      const pointerMoveHandler = (e_move) => {
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
        const moveTileEl = e_move.target.closest(".tile");
        if (
          moveTileEl &&
          moveTileEl.tile &&
          moveTileEl.tile !== this.lastTileModified
        ) {
          this.handleGridInteraction(moveTileEl, e_move);
          this.lastTileModified = moveTileEl.tile;
        }
      };
      const pointerUpHandler = (e_up) => {
        if (!pointerMoved && this.isDragging && pointerDownTileEl) {
          cancelLongPress();
          this.handleGridInteraction(pointerDownTileEl, e_up || e);
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
    reactor.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      this.handleGridInteraction(e.target.closest(".tile"), e);
    });

    // Add hover events for reactor tiles to show tooltips
    reactor.addEventListener(
      "mouseenter",
      (e) => {
        const tileEl = e.target.closest(".tile");
        if (
          tileEl?.tile?.part &&
          this.game?.tooltip_manager &&
          !this.isDragging
        ) {
          this.game.tooltip_manager.show(tileEl.tile.part, tileEl.tile, false);
        }
      },
      true
    );

    reactor.addEventListener(
      "mouseleave",
      (e) => {
        const tileEl = e.target.closest(".tile");
        if (
          tileEl?.tile?.part &&
          this.game?.tooltip_manager &&
          !this.isDragging
        ) {
          this.game.tooltip_manager.hide();
        }
      },
      true
    );
  }
}
