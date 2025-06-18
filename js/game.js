import { Tileset } from "./tileset.js";
import { PartSet } from "./partset.js";
import { UpgradeSet } from "./upgradeset.js";
import { Reactor } from "./reactor.js";
import { Engine } from "./engine.js";
import { Performance } from "./performance.js";

export class Game {
  constructor(ui_instance) {
    this.ui = ui_instance;
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
    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.reactor = new Reactor(this);
    this.engine = new Engine(this);
    this.performance = new Performance(this);
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
    this.reactor.updateStats();
    this.ui.stateManager.game_reset();
  }

  addMoney(amount) {
    this.current_money += amount;
    this.ui.stateManager.setVar("current_money", this.current_money);
  }

  initialize_new_game_state() {
    this.ui.stateManager.setVar("current_money", this.current_money);
    this.ui.stateManager.setVar("current_power", this.reactor.current_power);
    this.ui.stateManager.setVar("current_heat", this.reactor.current_heat);
    this.ui.stateManager.setVar("max_power", this.reactor.max_power);
    this.ui.stateManager.setVar("max_heat", this.reactor.max_heat);
    this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);
    this.ui.stateManager.setVar(
      "current_exotic_particles",
      this.current_exotic_particles
    );
    this.tileset.updateActiveTiles();
    this.reactor.updateStats();
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
    this.reactor.sellPower();
  }
  reboot_action(keep_exotic_particles = false) {
    this.current_money = this.base_money;
    if (keep_exotic_particles) {
      this.total_exotic_particles += this.exotic_particles;
      this.current_exotic_particles = this.total_exotic_particles;
    } else {
      this.total_exotic_particles = 0;
      this.current_exotic_particles = 0;
    }
    this.exotic_particles = 0;
    this.tileset.clearAllParts();
    this.reactor.current_power = 0;
    this.reactor.current_heat = 0;
    this.reactor.has_melted_down = false;
    this.initialize_new_game_state();
  }
  onToggleStateChange(property, newState) {
    this.paused = this.ui.stateManager.getVar("pause");
    this.reactor.heat_controlled = this.ui.stateManager.getVar("heat_control");

    if (property === "pause") {
      if (newState) {
        this.engine.stop();
      } else {
        this.engine.start();
      }
    } else if (property === "parts_panel") {
      const partsPanel = document.getElementById("parts_section");
      if (partsPanel) {
        partsPanel.classList.toggle("collapsed", !newState);
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
}
