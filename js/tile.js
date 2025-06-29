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
        if (neighbor_tile.part.containment) containment.push(neighbor_tile);
        if (neighbor_tile.part.category === "cell" && neighbor_tile.ticks > 0)
          cell.push(neighbor_tile);
        if (neighbor_tile.part.category === "reflector")
          reflector.push(neighbor_tile);
      }
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
    let ventValue = this.part.vent;
    const ventUpgrade = this.game.upgradeset.getUpgrade("improved_heat_vents");
    if (ventUpgrade) {
      ventValue *= Math.pow(2, ventUpgrade.level);
    }
    const activeVenting = this.game.upgradeset.getUpgrade("active_venting");
    if (activeVenting && activeVenting.level > 0) {
      let capacitorBonus = 0;
      for (const neighbor of this.game.tileset.getTilesInRange(this, 1)) {
        if (neighbor.part && neighbor.part.category === "capacitor") {
          capacitorBonus += neighbor.part.part.level;
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
    if (this.part) {
      this.clearPart(false);
    }
    this.part = partInstance || null;
    this.invalidateNeighborCaches();
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      if (this.$el) {
        this.$el.className = `tile enabled part_${this.part.id} category_${this.part.category}`;
        this.$el.style.backgroundImage = `url('${this.part.getImagePath()}')`;
        this.updateVisualState();

        // Remove old percent bars
        const percentWrapperWrapper = this.$el.querySelector(
          ".percent_wrapper_wrapper"
        );
        if (percentWrapperWrapper) {
          percentWrapperWrapper.innerHTML = "";
          const percentWrapper = document.createElement("div");
          percentWrapper.className = "percent_wrapper";

          // Add heat bar if part has base_containment
          if (this.part && this.part.base_containment > 0) {
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
      if (this.game.reactor.has_melted_down) {
        console.log(
          "[Recovery] Clearing meltdown state after placing part:",
          this.part.id
        );
        console.log(
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
          console.log("[Recovery] Current pause state:", currentPauseState);
          console.log(
            "[Recovery] Engine running state:",
            this.game.engine.running
          );
          console.log("[Recovery] Game paused state:", this.game.paused);
          if (currentPauseState) {
            console.log("[Recovery] Unpausing game");
            this.game.ui.stateManager.setVar("pause", false);
          } else {
            console.log("[Recovery] Force restarting engine");
            this.game.paused = false;
            this.game.engine.start();
          }
        }
        console.log(
          "[Recovery] Meltdown state cleared, has_melted_down:",
          this.game.reactor.has_melted_down,
          "heat reset to:",
          this.game.reactor.current_heat
        );
      }
    }
    this.game.reactor.updateStats();
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }
  }
  clearPart(full_clear = true) {
    if (!this.part) return;
    const part_id = this.part.id;
    this.invalidateNeighborCaches();
    if (full_clear) {
      const sell_value = this.calculateSellValue();
      this.game.addMoney(sell_value);
    }
    this.activated = false;
    this.part = null;
    this.ticks = 0;
    this.heat_contained = 0;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    if (this.$el) {
      const baseClasses = ["tile"];
      if (this.enabled) baseClasses.push("enabled");
      this.$el.className = baseClasses.join(" ");
      this.$el.style.backgroundImage = "none";
      if (this.$percent) this.$percent.style.width = "0%";
    }
    if (this.game.tooltip_manager?.current_tile_context === this) {
      this.game.tooltip_manager.hide();
    }
    this.game.reactor.updateStats();
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

    // Update heat bar if present
    if (this.$heatBar && this.part && this.part.base_containment > 0) {
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
