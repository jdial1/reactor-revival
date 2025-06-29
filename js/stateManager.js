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

  handleObjectiveCompleted() {
    if (this.ui.DOMElements.objectives_section) {
      const section = this.ui.DOMElements.objectives_section;

      // Add flash class for completion animation
      section.classList.add("flash");

      // Minimal confetti - just a few particles
      const confettiColors = [
        "rgba(89, 196, 53, 0.8)",
        "rgba(255, 255, 255, 0.6)",
      ];
      // Spawn fewer, subtler confetti
      for (let i = 0; i < 5; i++) {
        const conf = document.createElement("span");
        conf.className = "confetti";
        conf.style.background =
          confettiColors[Math.floor(Math.random() * confettiColors.length)];
        conf.style.left = `${30 + Math.random() * 40}%`;
        conf.style.top = `${20 + Math.random() * 20}%`;
        conf.style.transform = `rotate(${Math.random() * 180}deg)`;
        conf.style.animationDelay = `${Math.random() * 0.1}s`;
        section.appendChild(conf);
        setTimeout(() => conf.remove(), 800);
      }
      setTimeout(() => {
        section.classList.remove("flash");
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
        other: "other_upgrades",
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
    // Only add tiles within the current active area
    if (tile.row >= game.rows || tile.col >= game.cols) {
      // Remove from DOM if present
      if (tile.$el && tile.$el.parentNode) {
        tile.$el.parentNode.removeChild(tile.$el);
      }
      return;
    }
    // Create tile element if it doesn't exist
    let tile_el = tile.$el;
    if (!tile_el) {
      tile_el = document.createElement("button");
      tile_el.className = "tile";
      tile_el.dataset.row = tile.row;
      tile_el.dataset.col = tile.col;
      tile.tile_index = tile.row * game.max_cols + tile.col;
      tile_el.tile = tile;
      tile.$el = tile_el;

      // --- Begin: Updated percent bar logic ---
      const percent_wrapper_wrapper = document.createElement("div");
      percent_wrapper_wrapper.className = "percent_wrapper_wrapper";
      const percent_wrapper = document.createElement("div");
      percent_wrapper.className = "percent_wrapper";

      // Add heat bar if part has base_containment
      if (tile.part && tile.part.base_containment > 0) {
        const heatBar = document.createElement("div");
        heatBar.className = "percent heat";
        percent_wrapper.appendChild(heatBar);
        tile.$heatBar = heatBar;
      }

      // Add durability bar if part has base_ticks
      else if (tile.part && tile.part.base_ticks > 0) {
        const durabilityBar = document.createElement("div");
        durabilityBar.className = "percent durability";
        percent_wrapper.appendChild(durabilityBar);
        tile.$durabilityBar = durabilityBar;
      }

      percent_wrapper_wrapper.appendChild(percent_wrapper);
      tile_el.appendChild(percent_wrapper_wrapper);
      // --- End: Updated percent bar logic ---

      // Add sell indicator element
      const sellIndicator = document.createElement("div");
      sellIndicator.className = "sell-indicator";
      tile_el.appendChild(sellIndicator);
      // Debug log for tile creation
      // console.log(
      //   "[StateManager] Created tile element for tile:",
      //   tile.row,
      //   tile.col,
      //   tile
      // );
    }
    // Add enabled class if needed
    if (tile.enabled) {
      tile.$el.classList.add("enabled");
    } else {
      tile.$el.classList.remove("enabled");
    }
    // Only append if not already in DOM
    if (this.ui.DOMElements.reactor && !tile_el.parentNode) {
      this.ui.DOMElements.reactor.appendChild(tile_el);
      // Debug log for tile appending
      // console.log(
      //   "[StateManager] Appended tile to DOM:",
      //   tile.row,
      //   tile.col,
      //   tile
      // );
    }
  }
  game_reset() {
    this.setVar("current_money", this.game.base_money);
    this.setVar("current_power", 0);
    this.setVar("current_heat", 0);
    this.setVar("max_power", this.game.base_max_power);
    this.setVar("max_heat", this.game.base_max_heat);
  }

  getAllVars() {
    const vars = {};
    for (const [key, value] of this.vars.entries()) {
      vars[key] = value;
    }
    return vars;
  }

  handleObjectiveLoaded(objective) {
    // Update the current objective title and reward
    const titleEl = this.ui.DOMElements.objective_title;
    const rewardEl = this.ui.DOMElements.objective_reward;
    const oldObjectivesEl = this.ui.DOMElements.objectives_old;
    if (titleEl && objective.title) {
      // Move the previous objective to the old objectives list
      const prevTitle = titleEl.querySelector("span")?.textContent;
      if (prevTitle && prevTitle !== objective.title && oldObjectivesEl) {
        const oldObj = document.createElement("div");
        oldObj.className = "objective-old";
        oldObj.textContent = prevTitle;
        oldObjectivesEl.prepend(oldObj);
      }
      // Set the new objective
      titleEl.innerHTML = `<span>${objective.title}</span>`;
    }
    if (rewardEl && (objective.reward || objective.ep_reward)) {
      rewardEl.textContent = objective.reward
        ? `+${objective.reward} $`
        : `+${objective.ep_reward} EP`;
    } else if (rewardEl) {
      rewardEl.textContent = "";
    }
  }

  handleObjectiveUnloaded() {
    // No-op for now. Could add animation or clearing logic here if desired.
  }
}
