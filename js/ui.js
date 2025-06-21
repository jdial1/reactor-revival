import { numFormat as fmt } from "./util.js";
import { StateManager } from "./stateManager.js";
import { Hotkeys } from "./hotkeys.js";
import help_text from "../data/help_text.js";

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
      "primary",
      "info_bar",
      "info_heat_block",
      "info_power_block",
      "info_money_block",
      "time_flux",
      "info_bar_current_heat",
      "info_bar_max_heat",
      "info_bar_auto_heat_reduce",
      "info_heat_progress",
      "info_bar_current_power",
      "info_bar_max_power",
      "info_power_progress",
      "info_bar_money",
      "time_flux_value",
      "sellBtnInfoBar",
      "reduceHeatBtnInfoBar",
      "all_parts",
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
      "tooltip_nav",
      "stats_power",
      "stats_heat",
      "stats_cash",
      "stats_outlet",
      "stats_inlet",
      "stats_vent",
      "money_per_tick",
      "power_per_tick",
      "heat_per_tick",
      "upgrades_section",
      "experimental_upgrades_section",
      "options_section",
      "help_section",
      "about_section",
      "upgrades_content_wrapper",
      "other_upgrades",
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
      "exotic_particles",
      "reboot_exotic_particles",
      "refund_exotic_particles",
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
      "help_toggle_checkbox",
      "basic_overview_section",
      "debug_section",
      "debug_toggle_btn",
      "debug_hide_btn",
      "debug_variables",
      "debug_refresh_btn",
      "meltdown_banner",
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
    this.dom_ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        this.DOMElements[id] = el;
        const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        this.DOMElements[camelCaseKey] = el;
      } else {
        console.warn(`[UI] Element with id '${id}' not found in DOM.`);
      }
    });
    return !!this.DOMElements.reactor;
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
    if (this.DOMElements.parts_panel_toggle) {
      console.log("[UI] Attaching parts panel toggle handler");
      this.DOMElements.parts_panel_toggle.onclick = () => {
        this.DOMElements.parts_section.classList.toggle("collapsed");
      };
    } else {
      console.warn("[UI] #parts_panel_toggle not found.");
    }
    this.updateAllToggleBtnStates();
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
        this.game.performance.markEnd("ui_affordability_check");
      }

      // Update UI state
      this.game.performance.markStart("ui_state_manager");
      this.stateManager.setVar("current_money", this.game.current_money);
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
    // Live-update tooltip if showing
    if (this.game?.tooltip_manager?.tooltip_showing) {
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
      if (!config) continue;
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
        dom: this.DOMElements.exotic_particles,
        num: true,
        onupdate: (val) => {
          if (this.DOMElements.reboot_exotic_particles)
            this.DOMElements.reboot_exotic_particles.textContent = fmt(val);
        },
      },
      current_exotic_particles: {
        dom: this.DOMElements.current_exotic_particles,
        num: true,
        onupdate: () => {
          if (this.DOMElements.refund_exotic_particles) {
            this.DOMElements.refund_exotic_particles.textContent = fmt(
              (this.stateManager.getVar("total_exotic_particles") || 0) +
                (this.stateManager.getVar("exotic_particles") || 0)
            );
          }
        },
      },
      total_exotic_particles: {
        onupdate: () => {
          if (this.DOMElements.refund_exotic_particles) {
            this.DOMElements.refund_exotic_particles.textContent = fmt(
              (this.stateManager.getVar("total_exotic_particles") || 0) +
                (this.stateManager.getVar("exotic_particles") || 0)
            );
          }
        },
      },
      stats_power: { dom: this.DOMElements.stats_power, num: true },
      total_heat: { dom: this.DOMElements.stats_heat, num: true, places: 0 },
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

  init(gameInstance) {
    this.game = gameInstance;
    this.stateManager.setGame(gameInstance);
    this.hotkeys = new Hotkeys(this.game);
    if (!this.cacheDOMElements()) return false;
    this.initVarObjsConfig();
    this.setupEventListeners();
    this.initializeToggleButtons();
    this.setupPartsTabs();
    this.resizeReactor();
    window.addEventListener("resize", () => this.resizeReactor());
    this.update_interface_task = setTimeout(
      () => this.runUpdateInterfaceLoop(),
      this.update_interface_interval
    );
    // Add global click listener to collapse parts panel when clicking outside
    document.addEventListener("mousedown", (e) => {
      const partsSection = this.DOMElements.parts_section;
      const toggle = this.DOMElements.partsPanelToggle;
      if (!partsSection || !toggle) return;
      if (!partsSection.contains(e.target) && !toggle.contains(e.target)) {
        partsSection.classList.add("collapsed");
      }
    });

    // Add help toggle to experimental upgrades section
    const experimentalSection = document.getElementById(
      "experimental_upgrades_content_wrapper"
    );
    if (experimentalSection) {
      const helpToggle = document.createElement("div");
      helpToggle.id = "help_toggle";
      helpToggle.innerHTML = `
        <input type="checkbox" id="help_toggle_checkbox" checked>
        <label for="help_toggle_checkbox">Show Help Buttons</label>
      `;
      experimentalSection.appendChild(helpToggle);

      // Add event listener for help toggle
      const checkbox = helpToggle.querySelector("#help_toggle_checkbox");
      checkbox.addEventListener("change", (e) => {
        const showHelp = e.target.checked;
        document.body.classList.toggle("hide-help-buttons", !showHelp);
        this.stateManager.setVar("show_help_buttons", showHelp);
        // Force update all info buttons visibility
        document.querySelectorAll(".info-button").forEach((button) => {
          button.style.display = showHelp ? "" : "none";
        });
      });

      // Initialize state
      const helpEnabled = this.stateManager.getVar("show_help_buttons") ?? true;
      checkbox.checked = helpEnabled;
      document.body.classList.toggle("hide-help-buttons", !helpEnabled);
      document.querySelectorAll(".info-button").forEach((button) => {
        button.style.display = helpEnabled ? "" : "none";
      });
    }

    this.initializeHelpButtons();
    this.initializePartsPanel();
    this.addHelpButtonToMainPage();

    // Populate Basic Overview
    if (this.DOMElements.basic_overview_section && help_text.basic_overview) {
      this.DOMElements.basic_overview_section.innerHTML = `
        <h3>${help_text.basic_overview.title}</h3>
        <p>${help_text.basic_overview.content}</p>
      `;
    }

    return true;
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
  }

  showPage(pageId, force = false) {
    if (!force && this.game.reactor.has_melted_down) {
      console.log("Cannot switch pages during meltdown.");
      return;
    }

    const pageElementIds = [
      "reactor_section",
      "upgrades_section",
      "experimental_upgrades_section",
      "options_section",
      "help_section",
      "about_section",
    ];
    pageElementIds.forEach((id) => {
      const page = this.DOMElements[id];
      if (page) page.classList.remove("showing");
    });
    const targetPage = this.DOMElements[pageId];
    if (targetPage) {
      targetPage.classList.add("showing");
    }

    // Update nav buttons active state
    const navContainers = [
      this.DOMElements.main_top_nav,
      this.DOMElements.bottom_nav,
    ];
    navContainers.forEach((container) => {
      if (container) {
        container
          .querySelectorAll(".pixel-btn")
          .forEach((btn) => btn.classList.remove("active"));
        const activeButton = container.querySelector(
          `.pixel-btn[data-page="${pageId}"]`
        );
        if (activeButton) {
          activeButton.classList.add("active");
        }
      }
    });

    if (pageId === "reactor_section") {
      if (this.DOMElements.objectives_section)
        this.DOMElements.objectives_section.style.display = "";
      document.body.classList.remove("tooltips-disabled");
    } else {
      if (this.DOMElements.objectives_section)
        this.DOMElements.objectives_section.style.display = "none";
      document.body.classList.add("tooltips-disabled");
    }
  }

  setupEventListeners() {
    const reactor = this.DOMElements.reactor;
    if (reactor) {
      let longPressTargetTile = null;
      let pointerMoved = false;
      let pointerDownTileEl = null;
      let startX = 0;
      let startY = 0;
      const MOVE_THRESHOLD = 10; // px
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
        // Only left mouse or touch
        if ((e.pointerType === "mouse" && e.button !== 0) || e.button > 0)
          return;
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
          }, 250); // 250ms to start animation, then 500ms for the animation
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
          // Always call handleGridInteraction for click/tap if no drag and no long-press
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
    }

    const setupNav = (container, buttonClass) => {
      if (!container) {
        console.warn(`[UI] Nav container not found for selector`, buttonClass);
        return;
      }
      console.log(
        `[UI] Attaching nav handler to`,
        container,
        "with selector",
        buttonClass
      );
      container.addEventListener("click", (event) => {
        const button = event.target.closest(buttonClass);
        if (button?.dataset.page) {
          this.showPage(button.dataset.page);
          container
            .querySelectorAll(buttonClass)
            .forEach((tab) => tab.classList.remove("active"));
          button.classList.add("active");
        }
      });
    };
    setupNav(this.DOMElements.bottom_nav, ".pixel-btn");
    setupNav(this.DOMElements.main_top_nav, ".pixel-btn");

    // Reboot buttons
    this.DOMElements.reboot_btn?.addEventListener("click", () =>
      this.game.reboot_action(false)
    );
    this.DOMElements.refund_btn?.addEventListener("click", () =>
      this.game.reboot_action(true)
    );

    // Helper to sync body class with panel state
    this.updatePartsPanelBodyClass();

    // Add hotkeys for testing
    document.addEventListener("keydown", (e) => {
      if (e.ctrlKey) {
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

    // Add parts panel toggle button handler
    const partsButton = document.querySelector(
      'button[data-toggle="parts_panel"]'
    );
    if (partsButton) {
      partsButton.addEventListener("click", () => {
        const partsSection = document.getElementById("parts_section");
        if (partsSection) {
          const isMobile = window.innerWidth <= 900;
          const isOpening = partsSection.classList.contains("collapsed");

          partsSection.classList.toggle("collapsed");
          // Update button state
          partsButton.classList.toggle("active");
          // Always sync body class
          this.updatePartsPanelBodyClass();

          // Auto-pause on mobile when opening parts panel
          if (isMobile && isOpening && !this.stateManager.getVar("pause")) {
            this.stateManager.setVar("pause", true);
          }
        }
      });
    }

    // Add fullscreen toggle functionality
    const fullscreenButton = this.DOMElements.fullscreen_toggle;
    if (fullscreenButton) {
      fullscreenButton.addEventListener("click", () => {
        this.toggleFullscreen();
      });

      // Update fullscreen button state when fullscreen changes
      document.addEventListener("fullscreenchange", () => {
        this.updateFullscreenButtonState();
      });

      // Initialize button state
      this.updateFullscreenButtonState();
    }

    // Add debug panel functionality
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

    // Add right-click sell functionality to reactor tiles
    const reactorEl = document.getElementById("reactor");
    if (reactorEl) {
      reactorEl.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const tile = e.target.closest(".tile");
        if (tile && tile.part) {
          if (tile.part.id && !tile.part.isSpecialTile) {
            this.game.sellPart(tile.part);
          }
        }
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
              this.game.tooltip_manager.show(tile.part, null, true);
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
            this.game.tooltip_manager.show(tile.part, null, true);
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
    } else {
      document.body.classList.remove("parts-panel-open");
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
    if (this.DOMElements.help_toggle_checkbox) {
      this.DOMElements.help_toggle_checkbox.checked = helpEnabled;
    }
  }

  initializePartsPanel() {
    const toggle = this.DOMElements.parts_panel_toggle;
    const panel = this.DOMElements.parts_section;

    if (toggle && panel) {
      // Initialize dragging functionality
      let isDragging = false;
      let startY = 0;
      let startTop = 0;

      const onPointerDown = (e) => {
        isDragging = true;
        startY = e.clientY;
        startTop = toggle.offsetTop;
        toggle.setPointerCapture(e.pointerId);
      };

      const onPointerMove = (e) => {
        if (!isDragging) return;

        const deltaY = e.clientY - startY;
        const newTop = startTop + deltaY;

        // Calculate bounds - account for bottom bars
        const bottomBarHeight = 150; // 56px nav + 56px info bar
        const maxTop =
          window.innerHeight - toggle.offsetHeight - bottomBarHeight;
        const boundedTop = Math.max(0, Math.min(newTop, maxTop));

        toggle.style.top = `${boundedTop}px`;
      };

      const onPointerUp = () => {
        isDragging = false;
      };

      // Add event listeners for dragging
      toggle.addEventListener("pointerdown", onPointerDown);
      toggle.addEventListener("pointermove", onPointerMove);
      toggle.addEventListener("pointerup", onPointerUp);
      toggle.addEventListener("pointercancel", onPointerUp);

      // Set initial position to bottom if not already set
      if (!toggle.style.top) {
        toggle.style.top = `${
          window.innerHeight - toggle.offsetHeight - 150
        }px`;
      }

      // Handle panel toggle
      toggle.onclick = (e) => {
        // Only toggle if we haven't dragged
        if (Math.abs(e.clientY - startY) < 5) {
          panel.classList.toggle("collapsed");
        }
      };
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

  showDetailedQuickStart() {
    const modal = document.createElement("div");
    modal.id = "quick-start-modal";
    modal.innerHTML = `
      <div class="quick-start-overlay">
        <div class="quick-start-content pixel-panel">
          <div id="quick-start-page-2" class="quick-start-page">
            <h2 class="quick-start-title">Getting Started Guide</h2>
            <div class="quick-start-section">
              <h3>First Steps:</h3>
              <ul class="quick-start-list">
                <li>Click "Scrounge for cash (+1$)" 10 times to get your first $10</li>
                <li>Place your first Fuel Cell on the reactor grid</li>
                <li>Cells come in 3 configurations: Single, Double, and Quad</li>
              </ul>
            </div>
            <div class="quick-start-section">
              <h3>Cell Mechanics:</h3>
              <ul class="quick-start-list">
                <li><b>Single cells:</b> Generate 1 pulse, 1 power, 1 heat per tick</li>
                <li><b>Double cells:</b> Generate 2 pulses, act like two adjacent single cells</li>
                <li><b>Quad cells:</b> Generate 4 pulses, act like four adjacent single cells in a 2x2 grid</li>
                <li><b>Adjacency bonus:</b> Adjacent cells share pulses, increasing power and heat output</li>
              </ul>
            </div>
            <div class="quick-start-section">
              <h3>Heat Management:</h3>
              <ul class="quick-start-list">
                <li>Click the Heat bar to manually reduce heat (-1 heat per click)</li>
                <li>Build vents and heat exchangers to automatically manage heat</li>
                <li>Use reactor plating to increase maximum heat capacity</li>
                <li>Exceeding max heat causes components to melt/explode</li>
              </ul>
            </div>
            <div class="quick-start-section">
              <h3>Power & Upgrades:</h3>
              <ul class="quick-start-list">
                <li>Build capacitors to increase maximum power storage</li>
                <li>Enable auto-sell to automatically convert power to money</li>
                <li>Use heat controllers for automatic cooling systems</li>
              </ul>
            </div>
            <div class="quick-start-buttons">
              <button id="quick-start-close-detailed" class="pixel-btn btn-start">Got it!</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("quick-start-close-detailed").onclick = () => {
      modal.remove();
    };
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
      helpButton.onclick = () => this.showDetailedQuickStart();

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
}
