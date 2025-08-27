import { Part } from "./part.js";
export class Tile {
  constructor(row, col, game) {
    this.game = game;
    this.part = null;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this._containmentNeighborTiles = [];
    this._cellNeighborTiles = [];
    this._reflectorNeighborTiles = [];
    this.activated = false;
    this.row = row;
    this.col = col;
    this.enabled = false;
    this.display_chance = 0;
    this.display_chance_percent_of_total = 0;
    this.heat_contained = 0;
    this.ticks = 0;
    this.$el = null;
    this.$percent = null;
    this.$heatBar = null;       // Direct reference to the heat bar element
    this.$durabilityBar = null; // Direct reference to the durability bar
    this._neighborCache = null;
  }
  _calculateAndCacheNeighbors() {
    const p = this.part;
    if (!p) {
      this._neighborCache = { containment: [], cell: [], reflector: [] };
      return;
    }
    const neighbors = Array.from(
      this.game.tileset.getTilesInRange(this, p.range || 1)
    );
    const containment = [];
    const cell = [];
    const reflector = [];
    for (const neighbor_tile of neighbors) {
      if (neighbor_tile.part && neighbor_tile.activated) {
        const p = neighbor_tile.part;
        if (p.containment > 0 || ['heat_exchanger', 'heat_outlet', 'heat_inlet'].includes(p.category)) {
          containment.push(neighbor_tile);
        }
        if (neighbor_tile.part.category === "cell" && neighbor_tile.ticks > 0)
          cell.push(neighbor_tile);
        if (neighbor_tile.part.category === "reflector")
          reflector.push(neighbor_tile);
      }
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' && this.part && this.part.category === 'heat_outlet') {
      this.game.logger?.debug(`Outlet at (${this.row}, ${this.col}) has ${containment.length} containment neighbors: ${containment.map(t => `(${t.row}, ${t.col}) ${t.part?.id}`).join(', ')}`);
    }

    this._neighborCache = { containment, cell, reflector };
  }
  invalidateNeighborCaches() {
    this._neighborCache = null;
    for (const neighbor of this.game.tileset.getTilesInRange(this, 1)) {
      if (neighbor) neighbor._neighborCache = null;
    }
  }
  get containmentNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.containment;
  }
  get cellNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.cell;
  }
  get reflectorNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.reflector;
  }
  getEffectiveVentValue() {
    if (!this.part || !this.part.vent) return 0;
    let ventValue = this.part.vent; // This value is already calculated with permanent upgrades.

    // Active Venting is a contextual bonus based on neighbors, so it's calculated here.
    const activeVenting = this.game.upgradeset.getUpgrade("active_venting");
    if (activeVenting && activeVenting.level > 0) {
      let capacitorBonus = 0;
      for (const neighbor of this.containmentNeighborTiles) {
        if (neighbor.part && neighbor.part.category === "capacitor") {
          capacitorBonus += neighbor.part.level || 1; // Corrected: neighbor.part.level
        }
      }
      ventValue *= 1 + (activeVenting.level * capacitorBonus) / 100;
    }
    return ventValue;
  }
  getEffectiveTransferValue() {
    if (this.part && this.part.transfer) {
      const transferMultiplier =
        this.game?.reactor.transfer_multiplier_eff || 0;
      return this.part.transfer * (1 + transferMultiplier / 100);
    }
    return 0;
  }
  disable() {
    if (this.enabled) {
      this.enabled = false;
      if (this.$el) this.$el.classList.remove("enabled");
    }
  }
  enable() {
    if (!this.enabled) {
      this.enabled = true;
      if (this.$el) this.$el.classList.add("enabled");
    }
  }
  async setPart(partInstance) {
    // Validate part instance
    if (partInstance === null || partInstance === undefined) {
      throw new Error("Invalid part: part cannot be null or undefined");
    }
    
    // Prevent overwriting existing parts
    if (this.part) {
      return false; // Return false to indicate the part was not placed
    }
    this.part = partInstance;
    this.invalidateNeighborCaches();
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      if (this.$el) {
        this.$el.className = `tile enabled part_${this.part.id} category_${this.part.category}`;
        this.$el.style.backgroundImage = `url('${this.part.getImagePath()}')`;
        this.updateVisualState();

        // Remove old percent bars and set up new ones
        const percentWrapperWrapper = this.$el.querySelector(
          ".percent_wrapper_wrapper"
        );
        if (percentWrapperWrapper) {
          percentWrapperWrapper.innerHTML = "";
          const percentWrapper = document.createElement("div");
          percentWrapper.className = "percent_wrapper";

          // Add heat bar if part has base_containment or containment (but not for valves)
          if (this.part && (this.part.base_containment > 0 || (this.part.containment > 0 && this.part.category !== "valve"))) {
            const heatBar = document.createElement("div");
            heatBar.className = "percent heat";
            percentWrapper.appendChild(heatBar);
            this.$heatBar = heatBar;
          }

          // Add durability bar if part has base_ticks
          else if (this.part && this.part.base_ticks > 0) {
            const durabilityBar = document.createElement("div");
            durabilityBar.className = "percent durability";
            percentWrapper.appendChild(durabilityBar);
            this.$durabilityBar = durabilityBar;
          }

          percentWrapperWrapper.appendChild(percentWrapper);
        }
      }
      // Cumulative placement tracking for gating
      try {
        if (this.game && this.part && typeof this.game.incrementPlacedCount === "function") {
          this.game.incrementPlacedCount(this.part.type, this.part.level);
        }
      } catch (_) { }
      if (this.game.reactor.has_melted_down) {
        this.game.logger?.debug(
          "[Recovery] Clearing meltdown state after placing part:",
          this.part.id
        );
        this.game.logger?.debug(
          "[Recovery] Reactor heat before reset:",
          this.game.reactor.current_heat,
          "max:",
          this.game.reactor.max_heat
        );
        this.game.reactor.current_heat = 0;
        this.game.reactor.clearMeltdownState();
        this.game.ui.stateManager.setVar(
          "current_heat",
          this.game.reactor.current_heat
        );
        if (this.game.engine && !this.game.engine.running) {
          const currentPauseState = this.game.ui.stateManager.getVar("pause");
          this.game.logger?.debug("[Recovery] Current pause state:", currentPauseState);
          this.game.logger?.debug(
            "[Recovery] Engine running state:",
            this.game.engine.running
          );
          this.game.logger?.debug("[Recovery] Game paused state:", this.game.paused);
          if (currentPauseState) {
            this.game.logger?.info("[Recovery] Unpausing game");
            this.game.ui.stateManager.setVar("pause", false);
          } else {
            this.game.logger?.info("[Recovery] Force restarting engine");
            this.game.paused = false;
            this.game.engine.start();
          }
        }
        this.game.logger?.debug(
          "[Recovery] Meltdown state cleared, has_melted_down:",
          this.game.reactor.has_melted_down,
          "heat reset to:",
          this.game.reactor.current_heat
        );
      }
    }

    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    this.game.reactor.updateStats();
    // Refresh parts panel to update tier gating counters/visibility
    try {
      if (this.game && this.game.ui && typeof this.game.ui.refreshPartsPanel === "function") {
        this.game.ui.refreshPartsPanel();
      }
      // Also refresh the upgrades section so gated cell upgrade columns
      // appear as soon as the corresponding cell becomes unlocked
      if (this.game && this.game.upgradeset && typeof this.game.upgradeset.populateUpgrades === "function") {
        this.game.upgradeset.populateUpgrades();
      }
    } catch (_) { }
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }
    return true; // Return true to indicate the part was successfully placed
  }
  clearPart(full_clear = true) {
    if (!this.part) return;
    const part_id = this.part.id;
    this.invalidateNeighborCaches();
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
      this.game.logger?.debug(`Clearing part ${part_id} from tile (${this.row}, ${this.col})`);
    }
    if (full_clear) {
      const sell_value = this.calculateSellValue();
      this.game.addMoney(sell_value);
      // Note: do NOT decrement cumulative placedCounts; progress is permanent
    }
    this.activated = false;
    this.part = null;
    this.ticks = 0;
    this.heat_contained = 0;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this.exploded = false; // Reset explosion state when clearing part
    if (this.$el) {
      // Remove any lingering vent rotor element from UI
      try {
        const rotor = this.$el.querySelector('.vent-rotor');
        if (rotor && rotor.parentNode) rotor.parentNode.removeChild(rotor);
      } catch (_) { }
      const baseClasses = ["tile"];
      if (this.enabled) baseClasses.push("enabled");
      this.$el.className = baseClasses.join(" ");
      this.$el.style.backgroundImage = "none";
      this.$el.style.backgroundColor = "transparent"; // Clear any red heat indicators
      if (this.$percent) this.$percent.style.width = "0%";
    }
    if (this.game.tooltip_manager?.current_tile_context === this) {
      this.game.tooltip_manager.hide();
    }
    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    this.game.reactor.updateStats();
    // Refresh parts panel to update tier gating after selling
    try {
      if (this.game && this.game.ui && typeof this.game.ui.refreshPartsPanel === "function") {
        this.game.ui.refreshPartsPanel();
      }
    } catch (_) { }
    this.updateVisualState();
    if (this.$el) {
      this.$el.classList.remove("is-processing");
    }
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }
  }
  updateVisualState() {
    if (!this.$el || !this.part || !this.activated) {
      if (this.$heatBar) this.$heatBar.style.width = "0%";
      if (this.$durabilityBar) this.$durabilityBar.style.width = "0%";
      return;
    }

    // Update heat bar if present - now reflects segment heat level
    if (this.$heatBar && this.part && (this.part.base_containment > 0 || (this.part.containment > 0 && this.part.category !== "valve"))) {
      const maxHeat = this.part.containment || 1;
      const percent = Math.max(0, Math.min(1, this.heat_contained / maxHeat));
      this.$heatBar.style.width = percent * 100 + "%";
    }

    // Update durability bar if present
    if (this.$durabilityBar && this.part && this.part.base_ticks > 0) {
      const maxTicks = this.part.ticks || 1;
      const percent = Math.max(0, Math.min(1, this.ticks / maxTicks));
      this.$durabilityBar.style.width = percent * 100 + "%";
    }

    // Fallback for legacy $percent
    if (this.$percent && !this.$heatBar && !this.$durabilityBar) {
      this.$percent.style.width = "0%";
    }

    if (this.part && this.part.category === "cell") {
      const isPaused = this.game.ui.stateManager.getVar("pause");
      const isProcessing = this.ticks > 0 && !isPaused;
      this.$el.classList.toggle("is-processing", isProcessing);
    } else if (this.part) {
      this.$el.classList.remove("is-processing");
    }
  }

  /**
   * Adds the highlight class to the tile's element.
   */
  highlight() {
    if (this.$el) {
      this.$el.classList.add('segment-highlight');
    }
  }

  /**
   * Removes the highlight class from the tile's element.
   */
  unhighlight() {
    if (this.$el) {
      this.$el.classList.remove('segment-highlight');
    }
  }


  calculateSellValue() {
    if (!this.part) {
      return 0;
    }
    const part = this.part;
    let sellValue = part.cost;
    if (part.ticks > 0 && typeof this.ticks === "number") {
      const lifeRemainingRatio = Math.max(0, this.ticks / part.ticks);
      sellValue = Math.ceil(part.cost * lifeRemainingRatio);
    } else if (
      part.containment > 0 &&
      typeof this.heat_contained === "number"
    ) {
      const damageRatio = Math.min(1, this.heat_contained / part.containment);
      sellValue = part.cost - Math.ceil(part.cost * damageRatio);
    }
    return Math.max(0, sellValue);
  }
  updateTooltip(force = false) {
    if (this.game.tooltip.current_obj === this.part || force) {
      const heat_percent = this.heat / this.part.containment;
      this.$el.style.backgroundColor = `rgba(255, 0, 0, ${heat_percent})`;
    } else {
      this.$el.style.backgroundColor = "transparent";
    }
    if (this.part && this.part.category === "cell") {
      const isPaused = this.game.ui.stateManager.getVar("pause");
      const isProcessing = this.ticks > 0 && !isPaused;
      this.$el.classList.toggle("is-processing", isProcessing);
    } else if (this.part) {
      this.$el.classList.remove("is-processing");
    }
  }
  refreshVisualState() {
    if (!this.$el || !this.part) return;
    this.$el.className = `tile enabled part_${this.part.id} category_${this.part.category}`;
    this.$el.style.backgroundImage = `url('${this.part.getImagePath()}')`;
    this.updateVisualState();
  }
}
