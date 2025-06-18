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
      }
    });
    return !!this.DOMElements.reactor;
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
      }
    }
    if (this.DOMElements.partsPanelToggle) {
      this.DOMElements.partsPanelToggle.onclick = () => {
        this.DOMElements.partsSection.classList.toggle("collapsed");
      };
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
    const tabButtons = Array.from(document.querySelectorAll(".parts_tab"));
    const tabContents = Array.from(
      document.querySelectorAll(".parts_tab_content")
    );

    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
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
    });

    const activeTab = tabButtons.find((btn) =>
      btn.classList.contains("active")
    );
    if (activeTab) {
      this.populatePartsForTab(activeTab.getAttribute("data-tab"));
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
      total_heat: { dom: this.DOMElements.stats_heat, num: true },
      stats_cash: { dom: this.DOMElements.stats_cash, num: true, places: 2 },
      stats_outlet: {
        dom: this.DOMElements.stats_outlet,
        num: true,
        places: 2,
      },
      stats_inlet: { dom: this.DOMElements.stats_inlet, num: true, places: 2 },
      stats_vent: { dom: this.DOMElements.stats_vent, num: true, places: 2 },
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
      experimentalSection.insertBefore(
        helpToggle,
        experimentalSection.firstChild
      );

      // Add event listener for help toggle
      const checkbox = helpToggle.querySelector("#help_toggle_checkbox");
      checkbox.addEventListener("change", (e) => {
        const showHelp = e.target.checked;
        document.body.classList.toggle("hide-help-buttons", !showHelp);
        this.stateManager.setVar("show_help_buttons", showHelp);
      });
    }

    this.initializeHelpButtons();

    return true;
  }

  resizeReactor() {
    if (
      !this.game ||
      !this.DOMElements.reactor ||
      !this.DOMElements.reactor_wrapper
    )
      return;
    const wrapperWidth = this.DOMElements.reactor_wrapper.clientWidth;
    const numCols = this.game.cols;
    const gap = 2;
    let tileSize = Math.floor(wrapperWidth / numCols - gap);
    tileSize = Math.max(50, Math.min(64, tileSize));
    this.DOMElements.reactor.style.setProperty("--tile-size", `${tileSize}px`);
    this.DOMElements.reactor.style.setProperty("--game-cols", numCols);
  }

  showPage(pageId) {
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
      container?.addEventListener("click", (event) => {
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
    setupNav(this.DOMElements.bottom_nav, ".bottom_nav_btn");
    setupNav(this.DOMElements.main_top_nav, ".styled-button");

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
    const startTile = tileEl.tile;
    const isRightClick =
      (event.pointerType === "mouse" && event.button === 2) ||
      event.type === "contextmenu";
    const clicked_part = this.stateManager.getClickedPart();
    const tilesToModify = this.hotkeys.getTiles(startTile, event);

    for (const tile of tilesToModify) {
      if (isRightClick) {
        if (tile.part) tile.clearPart(true);
      } else {
        if (clicked_part) {
          if (tile.part) tile.clearPart(true);
          if (this.game.current_money >= clicked_part.cost) {
            this.game.current_money -= clicked_part.cost;
            tile.setPart(clicked_part);
          }
        } else if (tile.part) {
          tile.clearPart(true);
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
        infoButton.className = "info-button";
        infoButton.textContent = "ⓘ";
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
      const originalText = button.textContent; // Store original text before adding button
      const controlType = originalText.replace(/\s+/g, "").toLowerCase();
      if (help_text.controls[controlType]) {
        const infoButton = document.createElement("button");
        infoButton.className = "info-button";
        infoButton.textContent = "ⓘ";
        infoButton.title = "Click for information";
        infoButton.style.marginLeft = "4px";
        infoButton.addEventListener("click", (e) => {
          e.stopPropagation(); // Prevent triggering the main button
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(
              {
                title: originalText, // Use original text without info button
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

    // Initialize help toggle state
    const helpEnabled = this.stateManager.getVar("show_help_buttons") ?? true;
    document.body.classList.toggle("hide-help-buttons", !helpEnabled);
    if (this.DOMElements.help_toggle_checkbox) {
      this.DOMElements.help_toggle_checkbox.checked = helpEnabled;
    }
  }
}
