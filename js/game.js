import { Tileset } from "./tileset.js";
import { PartSet } from "./partset.js";
import { UpgradeSet } from "./upgradeset.js";
import { Reactor } from "./reactor.js";
import { Engine } from "./engine.js";
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
    this.current_money = 0;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;

    // Total played time tracking
    this.total_played_time = 0; // Total time played in milliseconds
    this.session_start_time = null; // When current session started
    this.last_save_time = null; // When the game was last saved

    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.reactor = new Reactor(this);
    this.engine = null; // Engine will be created later in startGame()
    this.performance = new Performance(this);
    this.performance.enable();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;
    this.auto_sell_disabled = false;
    this.auto_buy_disabled = false;
    this.time_flux = true;
    this.sold_power = false;
    this.sold_heat = false;
  }
  set_defaults() {
    this.current_money = this.base_money;
    this.rows = this.base_rows;
    this.cols = this.base_cols;
    this.protium_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;
    this.total_exotic_particles = 0;
    this.ui.stateManager.setVar("auto_sell", false);
    this.ui.stateManager.setVar("auto_buy", false);
    this.ui.stateManager.setVar("heat_control", false);
    this.ui.stateManager.setVar("time_flux", true);
    this.ui.stateManager.setVar("pause", false);
    this.partset.check_affordability(this);
    this.upgradeset.check_affordability(this);
    this.upgradeset.reset();
    this.tileset.clearAllTiles();
    this.reactor.setDefaults();
    this.reactor.clearMeltdownState();
    this.reactor.updateStats();
    this.ui.stateManager.game_reset();
  }

  addMoney(amount) {
    this.current_money += amount;
    this.ui.stateManager.setVar("current_money", this.current_money);
  }

  initialize_new_game_state() {
    this.set_defaults();
    this.tileset.clearAllTiles();
    this.upgradeset.reset();
    this.current_money = this.base_money;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;

    // Initialize time tracking for new game (but don't start session yet)
    this.total_played_time = 0;
    this.last_save_time = null;
    this.session_start_time = null;

    this.upgradeset.check_affordability(this);
    this.reactor.updateStats();
  }

  /**
   * Start tracking time for the current session
   */
  startSession() {
    this.session_start_time = Date.now();
    // Silenced log to reduce test noise
  }

  /**
   * Update the total played time with current session time
   */
  updateSessionTime() {
    if (this.session_start_time) {
      const sessionTime = Date.now() - this.session_start_time;
      this.total_played_time += sessionTime;
      this.session_start_time = Date.now(); // Reset session start for next interval
    }
  }

  /**
   * Get formatted total played time
   */
  getFormattedTotalPlayedTime() {
    // Add current session time to total
    let totalTime = this.total_played_time;
    if (this.session_start_time) {
      totalTime += Date.now() - this.session_start_time;
    }
    return this.formatTime(totalTime);
  }

  /**
   * Format time in milliseconds to human readable format with smaller units
   */
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
    if (this.current_money < 10 && this.reactor.current_power == 0) {
      // Check if there are any parts in the reactor that could be sold for money
      const hasPartsToSell = this.tileset.active_tiles_list.some(
        (tile) => tile.part && !tile.part.isSpecialTile
      );

      if (!hasPartsToSell) {
        this.addMoney(10);
      }
      // If there are parts to sell, don't give free money - player should sell parts first
    } else {
      this.reactor.sellPower();
    }
  }
  reboot_action(keep_exotic_particles = false) {
    const epToKeep = keep_exotic_particles
      ? this.total_exotic_particles + this.exotic_particles
      : 0;

    // Save current upgrades before reset
    const currentUpgrades = this.upgradeset.upgradesArray
      .filter((upg) => upg.level > 0)
      .map((upg) => ({
        id: upg.id,
        level: upg.level,
      }));

    this.set_defaults();

    // Restore exotic particles if keeping them
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

    // Restore upgrades (this will trigger their actions and update reactor size)
    currentUpgrades.forEach((upgData) => {
      const upgrade = this.upgradeset.getUpgrade(upgData.id);
      if (upgrade) {
        upgrade.setLevel(upgData.level);
      }
    });

    // Final update to ensure everything is in sync
    this.reactor.updateStats();
    this.upgradeset.check_affordability(this);
  }
  onToggleStateChange(property, newState) {
    this.paused = this.ui.stateManager.getVar("pause");
    this.reactor.heat_controlled = this.ui.stateManager.getVar("heat_control");

    if (property === "pause") {
      if (this.engine) {
        if (newState) {
          this.engine.stop();
        } else {
          this.engine.start();
        }
      }
    } else if (property === "parts_panel") {
      const partsPanel = document.getElementById("parts_section");
      if (partsPanel) {
        partsPanel.classList.toggle("collapsed", !newState);
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
      const cost = part.cost * 1.5;
      if (this.current_money >= cost) {
        this.current_money -= cost;
        this.ui.stateManager.setVar("current_money", this.current_money);
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
    // Update session time before saving
    this.updateSessionTime();

    const saveData = {
      version: this.version,
      current_money: this.current_money,
      protium_particles: this.protium_particles,
      total_exotic_particles: this.total_exotic_particles,
      exotic_particles: this.exotic_particles,
      current_exotic_particles: this.current_exotic_particles,
      rows: this.rows,
      cols: this.cols,
      sold_power: this.sold_power,
      sold_heat: this.sold_heat,

      // Time tracking
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
          this.objectives_manager.current_objective_index,
      },
      toggles: {
        auto_sell: this.ui.stateManager.getVar("auto_sell"),
        auto_buy: this.ui.stateManager.getVar("auto_buy"),
        heat_control: this.ui.stateManager.getVar("heat_control"),
        time_flux: this.ui.stateManager.getVar("time_flux"),
        pause: this.ui.stateManager.getVar("pause"),
      },
    };
    return saveData;
  }

  saveGame() {
    try {
      if (this.reactor.has_melted_down) {
        // Silenced log to reduce test noise
        return;
      }
      const saveData = this.getSaveState();

      // Skip localStorage in test environment
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        localStorage.setItem("reactorGameSave", JSON.stringify(saveData));
        // Silenced log to reduce test noise
      } else if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "test"
      ) {
        // Silent success in test environment
        return;
      }
    } catch (error) {
      // Only log errors in non-test environments or if it's not a localStorage issue
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
      localStorage.removeItem("reactorGameSave");
    }
    return false;
  }

  applySaveState(savedData) {
    this.current_money = savedData.current_money || this.base_money;
    this.protium_particles = savedData.protium_particles || 0;
    this.total_exotic_particles = savedData.total_exotic_particles || 0;
    this.exotic_particles = savedData.exotic_particles || 0;
    this.current_exotic_particles = savedData.current_exotic_particles || 0;
    this.rows = savedData.rows || this.base_rows;
    this.cols = savedData.cols || this.base_cols;
    this.sold_power = savedData.sold_power || false;
    this.sold_heat = savedData.sold_heat || false;

    // Load time tracking data (but don't start session yet - wait for game to actually start)
    this.total_played_time = savedData.total_played_time || 0;
    this.last_save_time = savedData.last_save_time || null;
    this.session_start_time = null;

    if (savedData.reactor) {
      this.reactor.current_heat = savedData.reactor.current_heat || 0;
      this.reactor.current_power = savedData.reactor.current_power || 0;
      this.reactor.has_melted_down = savedData.reactor.has_melted_down || false;

      // Update UI state for meltdown
      if (this.reactor.has_melted_down) {
        document.body.classList.add("reactor-meltdown");
      } else {
        document.body.classList.remove("reactor-meltdown");
      }
    }
    this.upgradeset.reset();
    if (savedData.upgrades) {
      savedData.upgrades.forEach((upgData) => {
        const upgrade = this.upgradeset.getUpgrade(upgData.id);
        if (upgrade) {
          upgrade.setLevel(upgData.level);
        }
      });
    }
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
      this.objectives_manager.current_objective_index =
        savedData.objectives.current_objective_index || 0;
      // Also store this for use when starting the objective manager
      this._saved_objective_index =
        savedData.objectives.current_objective_index || 0;
    }
    // Store toggles for later restoration (after engine is created)
    this._pendingToggleStates = savedData.toggles;
    this.ui.updateAllToggleBtnStates();
  }
}
