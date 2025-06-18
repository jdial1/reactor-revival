import { numFormat as fmt } from "./util.js";
export class StateManager {
  constructor(ui) {
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.vars = new Map();
  }
  setGame(gameInstance) {
    this.game = gameInstance;
  }
  setVar(key, value) {
    if (this.vars.get(key) === value) return;
    this.vars.set(key, value);
    this.ui.update_vars.set(key, value);
    if (this.game && this.game.onToggleStateChange) {
      if (
        [
          "pause",
          "auto_sell",
          "auto_buy",
          "time_flux",
          "heat_control",
          "parts_panel",
        ].includes(key)
      ) {
        this.game.onToggleStateChange(key, value);
      }
    }
  }
  getVar(key) {
    return this.vars.get(key);
  }
  setClickedPart(part) {
    this.clicked_part = part;
    const partActive = !!part;
    this.ui.DOMElements.main.classList.toggle("part_active", partActive);
  }
  getClickedPart() {
    return this.clicked_part;
  }
  handleObjectiveLoaded(objData) {
    if (this.ui.DOMElements.objective_title) {
      this.ui.DOMElements.objective_title.textContent = objData.title;
    }
    if (this.ui.DOMElements.objective_reward) {
      this.ui.DOMElements.objective_reward.textContent = objData.reward
        ? fmt(objData.reward)
        : objData.ep_reward
        ? `${fmt(objData.ep_reward)} EP`
        : "";
    }
    if (this.ui.DOMElements.objectives_section) {
      this.ui.DOMElements.objectives_section.classList.remove(
        "unloading",
        "loading"
      );
    }
  }
  handleObjectiveUnloaded() {
    if (this.ui.DOMElements.objectives_section) {
      this.ui.DOMElements.objectives_section.classList.add("unloading");
      setTimeout(() => {
        if (this.ui.DOMElements.objectives_section) {
          this.ui.DOMElements.objectives_section.classList.add("loading");
        }
      }, 300);
    }
  }
  handleObjectiveCompleted() {
    if (this.ui.DOMElements.objectives_section) {
      this.ui.DOMElements.objectives_section.classList.add("flash");
      setTimeout(() => {
        this.ui.DOMElements.objectives_section.classList.remove("flash");
      }, 800);
    }
  }
  handlePartAdded(game, part_obj) {
    if (part_obj.erequires) {
      const required_upgrade = this.game?.upgradeset.getUpgrade(
        part_obj.erequires
      );
      if (!required_upgrade || required_upgrade.level < 1) {
        return;
      }
    }

    // Use the Part class's createElement method for consistent element creation
    const part_el = part_obj.createElement();
    part_el._part = part_obj; // Assign the object to the element for event handlers

    let containerKey = part_obj.category + "s";
    const categoryToContainerMap = {
      coolant_cell: "coolantCells",
      reactor_plating: "reactorPlatings",
      heat_exchanger: "heatExchangers",
      heat_inlet: "heatInlets",
      heat_outlet: "heatOutlets",
      particle_accelerator: "particleAccelerators",
    };
    if (categoryToContainerMap[part_obj.category]) {
      containerKey = categoryToContainerMap[part_obj.category];
    }
    const container = this.ui.DOMElements[containerKey];
    if (container) {
      container.appendChild(part_el);
    }
  }
  handleUpgradeAdded(game, upgrade_obj) {
    const normalizeKey = (key) => {
      const map = {
        cell_power: "cell_power_upgrades",
        cell_tick: "cell_tick_upgrades",
        cell_perpetual: "cell_perpetual_upgrades",
        exchangers: "exchanger_upgrades",
        vents: "vent_upgrades",
      };
      return map[key] || key;
    };
    let locationKey = normalizeKey(upgrade_obj.upgrade.type);
    const container = document.getElementById(locationKey);
    if (!container) return;
    const upgradeEl = upgrade_obj.createElement();
    upgradeEl.upgrade_object = upgrade_obj;
    container.appendChild(upgradeEl);
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    const tile_el = document.createElement("button");
    tile_el.className = "tile";
    tile_el.dataset.row = tile_data.row;
    tile_el.dataset.col = tile_data.col;
    tile.tile_index = tile_data.row * game.max_cols + tile_data.col;
    tile_el.tile = tile;
    tile.$el = tile_el;
    if (tile.enabled) {
      tile.$el.classList.add("enabled");
    }
    const percent_wrapper_wrapper = document.createElement("div");
    percent_wrapper_wrapper.className = "percent_wrapper_wrapper";
    const percent_wrapper = document.createElement("div");
    percent_wrapper.className = "percent_wrapper";
    const percent = document.createElement("div");
    percent.className = "percent";
    tile.$percent = percent;
    percent_wrapper.appendChild(percent);
    percent_wrapper_wrapper.appendChild(percent_wrapper);
    tile_el.appendChild(percent_wrapper_wrapper);

    // Add sell indicator element
    const sellIndicator = document.createElement("div");
    sellIndicator.className = "sell-indicator";
    tile_el.appendChild(sellIndicator);

    if (this.ui.DOMElements.reactor) {
      this.ui.DOMElements.reactor.appendChild(tile_el);
    }
  }
  game_reset() {
    this.setVar("current_money", this.game.base_money);
    this.setVar("current_power", 0);
    this.setVar("current_heat", 0);
    this.setVar("max_power", this.game.base_max_power);
    this.setVar("max_heat", this.game.base_max_heat);
  }
}
