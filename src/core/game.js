import { Reactor } from "./reactor.js";
import { PartSet } from "./partset.js";
import { UpgradeSet } from "./upgradeset.js";
import { Tileset } from "./tileset.js";
import { Engine } from "./engine.js";
import { ObjectiveManager } from "./objective.js";
import { executeUpgradeAction } from "./upgradeActions.js";
import { Performance } from "./performance.js";

export class Game {
  constructor(ui_instance) {
    this.ui = ui_instance;
    this.router = null;
    this.version = "1.4.0";
    this.base_cols = 12;
    this.base_rows = 12;
    this.max_cols = 35;
    this.max_rows = 32;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
    this.offline_tick = true;
    this.base_loop_wait = 1000;
    this.base_manual_heat_reduce = 1;
    this.upgrade_max_level = 32;
    this.base_money = 10;
    this._current_money = 0;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;

    this.total_played_time = 0;
    this.session_start_time = null;
    this.last_save_time = null;

    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.reactor = new Reactor(this);
    this.engine = null;
    this.performance = new Performance(this);
    this.performance.enable();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;
    this.auto_sell_disabled = false;
    this.auto_buy_disabled = false;
    this.time_flux = true;
    this.sold_power = false;
    this.sold_heat = false;
    this.objectives_manager = null;
    this.tooltip_manager = null;
  }
  async set_defaults() {
    this.base_cols = 12;
    this.base_rows = 12;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
    this._current_money = this.base_money;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;
    this.sold_power = false;
    this.sold_heat = false;
    this.reactor.setDefaults();
    this.partset.reset();
    await this.partset.initialize(); // Await initialization
    this.upgradeset.reset();
    await this.upgradeset.initialize(); // Await initialization
    this.upgradeset.check_affordability(this);
    this.tileset.clearAllTiles();
    this.reactor.updateStats();

    // Clear all heat-related visual states after clearing tiles
    this.reactor.clearHeatVisualStates();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;

    this.session_start_time = null;
    this.total_played_time = 0;
    this.last_save_time = null;

    // Clear the cached objective index from a previous load
    delete this._saved_objective_index;

    // Ensure objectives are reset to 0 completed
    if (this.objectives_manager) {
      this.objectives_manager.current_objective_index = 0;
      this.objectives_manager.objectives_data.forEach(obj => {
        obj.completed = false;
      });
      this.objectives_manager.set_objective(0, true);
    }
  }

  get current_money() {
    return this._current_money;
  }

  set current_money(value) {
    this._current_money = value;
  }

  addMoney(amount) {
    this._current_money += amount;
    this.ui.stateManager.setVar("current_money", this._current_money);
  }

  async initialize_new_game_state() {
    await this.set_defaults();
    // Always clear meltdown state and update UI after new game
    this.reactor.clearMeltdownState();
    this._current_money = this.base_money;
    this.ui.stateManager.setVar("current_money", this._current_money);
    this.ui.stateManager.setVar("stats_cash", this._current_money);
    this.ui.stateManager.setVar("current_exotic_particles", 0);
    this.ui.stateManager.setVar("total_exotic_particles", 0);
    this.ui.stateManager.setVar("exotic_particles", 0);
    if (this.objectives_manager) {
      this.objectives_manager.set_objective(0, true);
    }
  }

  startSession() {
    console.log("[DEBUG] Game.startSession() called");
    this.session_start_time = Date.now();
    this.last_save_time = Date.now();

    // Initialize objective manager
    console.log("[DEBUG] Initializing objective manager...");
    this.objectives_manager = new ObjectiveManager(this);
    this.objectives_manager.initialize().then(() => {
      console.log("[DEBUG] Objective manager initialization completed");
      console.log(`[DEBUG] Initial objective index: ${this.objectives_manager.current_objective_index}`);
    });

    // Initialize other managers
    this.reactor.updateStats();
    this.upgradeset.check_affordability(this);
  }

  updateSessionTime() {
    if (this.session_start_time) {
      const sessionTime = Date.now() - this.session_start_time;
      this.total_played_time += sessionTime;
      this.session_start_time = Date.now();
    }
  }

  getFormattedTotalPlayedTime() {
    let totalTime = this.total_played_time;
    if (this.session_start_time) {
      totalTime += Date.now() - this.session_start_time;
    }
    return this.formatTime(totalTime);
  }

  formatTime(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / (1000 * 60)) % 60;
    const h = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (d > 0)
      return `${d}<span class="time-unit">d</span> ${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (h > 0)
      return `${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    if (m > 0)
      return `${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;
    return `${s}<span class="time-unit">s</span>`;
  }

  update_cell_power() {
    if (!this.partset || !this.reactor) return;
    this.partset.updateCellPower();
    this.reactor.updateStats();
  }
  epart_onclick(purchased_upgrade) {
    if (
      !purchased_upgrade ||
      !purchased_upgrade.upgrade ||
      purchased_upgrade.level <= 0
    )
      return;
    this.upgradeset.getAllUpgrades().forEach((upg) => {
      if (
        upg.upgrade.type === "experimental_parts" &&
        upg.upgrade.id !== purchased_upgrade.upgrade.id
      ) {
        upg.updateDisplayCost();
      }
    });
    this.upgradeset.check_affordability(this);
  }
  manual_reduce_heat_action() {
    this.reactor.manualReduceHeat();
  }
  sell_action() {
    if (this._current_money < 10 && this.reactor.current_power == 0) {
      const hasPartsToSell = this.tileset.active_tiles_list.some(
        (tile) => tile.part && !tile.part.isSpecialTile
      );

      if (!hasPartsToSell) {
        this.addMoney(10);
      }
    } else {
      this.reactor.sellPower();
    }
  }
  async reboot_action(keep_exotic_particles = false) {
    const epToKeep = keep_exotic_particles
      ? this.total_exotic_particles + this.exotic_particles
      : 0;

    const preservedUpgrades = this.upgradeset.upgradesArray
      .filter(upg => upg.level > 0 && (upg.upgrade.ecost > 0 || upg.id.startsWith('expand_reactor')))
      .map(upg => ({ id: upg.id, level: upg.level }));

    await this.set_defaults();

    // Re-initialize the upgradeset so we can set levels on them
    // await this.upgradeset.initialize(); // This line is removed as set_defaults now awaits it

    // Always clear meltdown state and update UI after reboot
    this.reactor.clearMeltdownState();

    this.total_exotic_particles = epToKeep;
    this.current_exotic_particles = epToKeep;

    this.ui.stateManager.setVar(
      "total_exotic_particles",
      this.total_exotic_particles
    );
    this.ui.stateManager.setVar(
      "current_exotic_particles",
      this.current_exotic_particles
    );
    this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);

    preservedUpgrades.forEach((upgData) => {
      const upgrade = this.upgradeset.getUpgrade(upgData.id);
      if (upgrade) {
        upgrade.setLevel(upgData.level);
        // Execute the upgrade action to apply its effects
        if (upgData.id.startsWith('expand_reactor')) {
          executeUpgradeAction(upgData.id, upgrade, this);
        }
      }
    });

    this.reactor.updateStats();
    this.upgradeset.check_affordability(this);
    this.partset.check_affordability(this);

    // Refresh the UI to show updated affordability
    if (this.ui) {
      // Find the currently active tab and refresh it
      if (typeof document !== "undefined" && document.querySelector && typeof window !== "undefined" && window.templateLoader) {
        const activeTab = document.querySelector(".parts_tab.active");
        if (activeTab) {
          const tabId = activeTab.getAttribute("data-tab");
          this.ui.populatePartsForTab(tabId);
        } else {
          // Fallback to power tab if no active tab found
          this.ui.populatePartsForTab("power");
        }
      } else {
        // Skip UI refresh if DOM or templateLoader is not available (e.g., in tests)
        console.log("[Game] Skipping UI refresh - DOM or templateLoader not available");
      }
    }

    if (this.objectives_manager) {
      this.objectives_manager.check_current_objective();
    }
  }
  onToggleStateChange(property, newState) {
    if (this.ui.stateManager.getVar(property) !== undefined) {
      this[property] = newState;
    }

    if (property === "pause") {
      this.paused = newState;
      if (this.engine) {
        if (newState) {
          this.engine.stop();
        } else {
          this.engine.start();
        }
      }
    } else if (property === "heat_control") {
      this.reactor.heat_controlled = newState;
    } else if (property === "parts_panel") {
      const partsPanel = document.getElementById("parts_section");
      if (partsPanel) {
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
          // Mobile: allow toggling
          partsPanel.classList.toggle("collapsed", !newState);
        } else {
          // Desktop: always keep open
          partsPanel.classList.remove("collapsed");
        }
        this.ui.updatePartsPanelBodyClass();
      }
    }
  }
  get rows() {
    return this._rows;
  }
  set rows(value) {
    if (this._rows !== value) {
      this._rows = value;
      this.tileset.updateActiveTiles();
      this.reactor.updateStats();
      if (this.ui) {
        this.ui.resizeReactor();
      }
    }
  }
  get cols() {
    return this._cols;
  }
  set cols(value) {
    if (this._cols !== value) {
      this._cols = value;
      this.tileset.updateActiveTiles();
      this.reactor.updateStats();
      if (this.ui) {
        this.ui.resizeReactor();
      }
    }
  }

  sellPart(tile) {
    if (tile && tile.part) {
      tile.clearPart(true);
    }
  }

  handleComponentDepletion(tile) {
    if (!tile.part) return;

    const part = tile.part;
    if (part.perpetual && this.ui.stateManager.getVar("auto_buy")) {
      const cost = part.getAutoReplacementCost();
      if (this._current_money >= cost) {
        this._current_money -= cost;
        this.ui.stateManager.setVar("current_money", this._current_money);
        part.recalculate_stats();
        tile.ticks = part.ticks;
        this.reactor.updateStats();
        return;
      }
    }

    if (this.tooltip_manager?.current_tile_context === tile) {
      this.tooltip_manager.hide();
    }

    tile.clearPart(false);
  }

  getSaveState() {
    this.updateSessionTime();

    const saveData = {
      version: this.version,
      current_money: this._current_money,
      protium_particles: this.protium_particles,
      total_exotic_particles: this.total_exotic_particles,
      exotic_particles: this.exotic_particles,
      current_exotic_particles: this.current_exotic_particles,
      rows: this.rows,
      cols: this.cols,
      sold_power: this.sold_power,
      sold_heat: this.sold_heat,

      total_played_time: this.total_played_time,
      last_save_time: Date.now(),

      reactor: {
        current_heat: this.reactor.current_heat,
        current_power: this.reactor.current_power,
        has_melted_down: this.reactor.has_melted_down,
      },
      tiles: this.tileset.tiles_list
        .filter((tile) => tile.part)
        .map((tile) => ({
          row: tile.row,
          col: tile.col,
          partId: tile.part.id,
          ticks: tile.ticks,
          heat_contained: tile.heat_contained,
        })),
      upgrades: this.upgradeset.upgradesArray
        .filter((upg) => upg.level > 0)
        .map((upg) => ({
          id: upg.id,
          level: upg.level,
        })),
      objectives: {
        current_objective_index:
          this.objectives_manager?.current_objective_index || 0,
        completed_objectives: this.objectives_manager?.objectives_data?.map(obj => obj.completed) || [],
      },
      toggles: {
        auto_sell: this.ui.stateManager.getVar("auto_sell"),
        auto_buy: this.ui.stateManager.getVar("auto_buy"),
        heat_control: this.ui.stateManager.getVar("heat_control"),
        time_flux: this.ui.stateManager.getVar("time_flux"),
        pause: this.ui.stateManager.getVar("pause"),
      },
    };

    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        const existingData = localStorage.getItem("reactorGameSave");
        if (existingData) {
          const existingSave = JSON.parse(existingData);
          if (existingSave.isCloudSynced) {
            saveData.isCloudSynced = existingSave.isCloudSynced;
            saveData.cloudUploadedAt = existingSave.cloudUploadedAt;
          }
        }
      }
    } catch (error) {
      console.warn("Could not preserve cloud sync flags:", error.message);
    }

    return saveData;
  }

  _hasCoreDataChanged(newData, existingData) {
    const keyFields = [
      "current_money",
      "protium_particles",
      "total_exotic_particles",
      "exotic_particles",
      "current_exotic_particles",
      "rows",
      "cols",
      "sold_power",
      "sold_heat",
    ];

    for (const field of keyFields) {
      if (newData[field] !== existingData[field]) {
        return true;
      }
    }

    if (
      newData.reactor?.has_melted_down !== existingData.reactor?.has_melted_down
    ) {
      return true;
    }

    if (newData.tiles?.length !== existingData.tiles?.length) {
      return true;
    }

    if (newData.upgrades?.length !== existingData.upgrades?.length) {
      return true;
    }

    // Compare objectives
    if (
      newData.objectives?.current_objective_index !==
      existingData.objectives?.current_objective_index
    ) {
      return true;
    }

    return false;
  }

  saveGame() {
    try {
      if (this.reactor.has_melted_down) {
        return;
      }
      const saveData = this.getSaveState();

      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.setItem("reactorGameSave", JSON.stringify(saveData));
      } else if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "test"
      ) {
        return;
      }

      // Only attempt Google Drive save if running in browser and googleDriveSave is defined
      if (typeof window !== "undefined" && window.googleDriveSave && window.googleDriveSave.isSignedIn) {
        window.googleDriveSave.save(JSON.stringify(saveData)).catch((error) => {
          console.error("Failed to auto-save to Google Drive:", error);
        });
      }
    } catch (error) {
      if (
        typeof process === "undefined" ||
        process.env?.NODE_ENV !== "test" ||
        !error.message.includes("localStorage")
      ) {
        console.error("Error saving game:", error);
      }
    }
  }

  loadGame() {
    try {
      if (typeof localStorage === "undefined" || localStorage === null) {
        return false;
      }

      const savedDataJSON = localStorage.getItem("reactorGameSave");
      if (savedDataJSON) {
        const savedData = JSON.parse(savedDataJSON);
        this.applySaveState(savedData);
        this.upgradeset.check_affordability(this);
        this.reactor.updateStats();
        return true;
      }
    } catch (error) {
      console.error("Error loading game:", error);
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.removeItem("reactorGameSave");
      }
    }
    return false;
  }

  applySaveState(savedData) {
    this._current_money = savedData.current_money || this.base_money;
    this.protium_particles = savedData.protium_particles || 0;
    this.total_exotic_particles = savedData.total_exotic_particles || 0;
    this.exotic_particles = savedData.exotic_particles || 0;
    this.current_exotic_particles = savedData.current_exotic_particles || 0;

    // Update UI state manager with EP values so EP display shows immediately
    this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);
    this.ui.stateManager.setVar("total_exotic_particles", this.total_exotic_particles);
    this.ui.stateManager.setVar("current_exotic_particles", this.current_exotic_particles);
    this.rows = savedData.rows || this.base_rows;
    this.cols = savedData.cols || this.base_cols;
    this.sold_power = savedData.sold_power || false;
    this.sold_heat = savedData.sold_heat || false;

    this.total_played_time = savedData.total_played_time || 0;
    this.last_save_time = savedData.last_save_time || null;
    this.session_start_time = null;

    if (savedData.reactor) {
      this.reactor.current_heat = savedData.reactor.current_heat || 0;
      this.reactor.current_power = savedData.reactor.current_power || 0;
      this.reactor.has_melted_down = savedData.reactor.has_melted_down || false;

      // Update UI meltdown state properly
      if (this.ui && typeof this.ui.updateMeltdownState === "function") {
        this.ui.updateMeltdownState();
      }
    }

    // Ensure upgradeset is properly initialized before loading upgrades
    this.upgradeset.reset();
    this.upgradeset.initialize().then(() => {
      if (savedData.upgrades) {
        savedData.upgrades.forEach((upgData) => {
          const upgrade = this.upgradeset.getUpgrade(upgData.id);
          if (upgrade) {
            upgrade.setLevel(upgData.level);
          }
        });
      }
    });

    this.tileset.clearAllTiles();
    if (savedData.tiles) {
      savedData.tiles.forEach((tileData) => {
        const tile = this.tileset.getTile(tileData.row, tileData.col);
        const part = this.partset.getPartById(tileData.partId);
        if (tile && part) {
          tile.setPart(part);
          tile.ticks = tileData.ticks;
          tile.heat_contained = tileData.heat_contained;
        }
      });
    }
    if (savedData.objectives) {
      // Safeguard: Ensure saved objective index is within valid bounds
      // When loading a saved game, clamp to the last real objective to prevent showing "All objectives completed!" prematurely
      let savedIndex = savedData.objectives.current_objective_index || 0;

      // Convert to number and handle edge cases
      if (typeof savedIndex === 'string') {
        savedIndex = parseInt(savedIndex, 10);
        if (isNaN(savedIndex)) {
          console.warn(`[DEBUG] Saved objective index "${savedData.objectives.current_objective_index}" is not a valid number. Defaulting to 0.`);
          savedIndex = 0;
        }
      } else if (typeof savedIndex === 'number') {
        // Convert decimal to integer
        savedIndex = Math.floor(savedIndex);
      }

      console.log(`[DEBUG] Loading saved objective index: ${savedIndex}`);
      if (this.objectives_manager) {
        const maxValidIndex = this.objectives_manager.objectives_data.length - 2; // Last real objective (not "All objectives completed!")
        console.log(`[DEBUG] Max valid index for saved games: ${maxValidIndex}`);

        // Clamp negative values to 0
        if (savedIndex < 0) {
          console.warn(`[DEBUG] Saved objective index ${savedIndex} is negative. Clamping to 0.`);
          savedIndex = 0;
        }

        if (savedIndex > maxValidIndex) {
          console.warn(`[DEBUG] Saved objective index ${savedIndex} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`);
          savedIndex = maxValidIndex;
        }

        this.objectives_manager.current_objective_index = savedIndex;
        console.log(`[DEBUG] Set objectives_manager.current_objective_index to: ${savedIndex}`);

        // Restore completion status of objectives
        if (savedData.objectives.completed_objectives && Array.isArray(savedData.objectives.completed_objectives)) {
          console.log(`[DEBUG] Restoring completion status for ${savedData.objectives.completed_objectives.length} objectives`);
          savedData.objectives.completed_objectives.forEach((completed, index) => {
            if (index < this.objectives_manager.objectives_data.length) {
              this.objectives_manager.objectives_data[index].completed = !!completed;
              if (completed) {
                console.log(`[DEBUG] Marked objective ${index} as completed`);
              }
            }
          });
        }
      }
      this._saved_objective_index = savedIndex;
      console.log(`[DEBUG] Set _saved_objective_index to: ${savedIndex}`);
    }
    this._pendingToggleStates = savedData.toggles;
    this.ui.updateAllToggleBtnStates();
  }
}
