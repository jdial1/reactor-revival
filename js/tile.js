export class Tile {
  constructor(row, col, game) {
    this.game = game;
    this.part = null;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this.containmentNeighborTiles = [];
    this.cellNeighborTiles = [];
    this.reflectorNeighborTiles = [];

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
  }

  getEffectiveVentValue() {
    if (!this.part || !this.part.vent) return 0;
    let ventValue = this.part.vent;

    // Apply vent upgrades
    const ventUpgrade = this.game.upgradeset.getUpgrade("improved_heat_vents");
    if (ventUpgrade) {
      ventValue *= Math.pow(2, ventUpgrade.level);
    }

    // Apply active venting upgrade
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
    // Only clear if there is an existing part
    if (this.part) {
      this.clearPart(false);
    }
    this.part = partInstance || null;
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      if (this.$el) {
        this.$el.className = `tile enabled part_${this.part.id} category_${this.part.category}`;
        this.$el.style.backgroundImage = `url('${this.part.getImagePath()}')`;
        this.updateVisualState();
      }

      // Clear meltdown state when placing parts after meltdown
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

        // Reset reactor heat to prevent immediate re-meltdown
        this.game.reactor.current_heat = 0;
        this.game.reactor.clearMeltdownState();

        // Update UI to reflect reset heat
        this.game.ui.stateManager.setVar(
          "current_heat",
          this.game.reactor.current_heat
        );

        // Restart the engine if it was stopped due to meltdown
        // Force engine restart by ensuring pause state is properly managed
        if (this.game.engine && !this.game.engine.running) {
          const currentPauseState = this.game.ui.stateManager.getVar("pause");
          console.log("[Recovery] Current pause state:", currentPauseState);
          console.log(
            "[Recovery] Engine running state:",
            this.game.engine.running
          );
          console.log("[Recovery] Game paused state:", this.game.paused);

          // Force unpause if needed, then restart engine
          if (currentPauseState) {
            console.log("[Recovery] Unpausing game");
            this.game.ui.stateManager.setVar("pause", false);
          } else {
            // Even if not paused, force engine restart
            console.log("[Recovery] Force restarting engine");
            this.game.paused = false; // Ensure game.paused is synchronized
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

    // Update reactor stats after placing/removing a part
    this.game.reactor.updateStats();

    // Save game after placing a part
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }
  }

  clearPart(full_clear = true) {
    if (!this.part) return;
    const part_id = this.part.id;

    if (full_clear) {
      const sell_value = this.calculateSellValue();
      this.game.addMoney(sell_value);
    }

    // Always set activated to false when a part is cleared
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
    // Save game after removing a part
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }
  }

  updateVisualState() {
    if (!this.$percent || !this.part || !this.activated) {
      if (this.$percent) this.$percent.style.width = "0%";
      return;
    }

    if (
      (this.part.category === "cell" || this.part.category === "reflector") &&
      this.part.ticks > 0
    ) {
      const perc = Math.max(0, Math.min(1, this.ticks / this.part.ticks));
      this.$percent.style.width = perc * 100 + "%";
      this.$percent.style.backgroundColor = "#0f0";
      this.$el.classList.toggle("spent", this.ticks === 0);
    } else if (this.part.containment > 0 || this.heat_contained > 0) {
      // Show heat bar if part has containment OR currently contains heat
      const maxHeat = this.part.containment || Math.max(this.heat_contained, 1);
      const perc = Math.max(0, Math.min(1, this.heat_contained / maxHeat));
      this.$percent.style.width = perc * 100 + "%";
      this.$percent.style.backgroundColor = "#f00";
      this.$el.classList.remove("spent");

      // Debug logging for parts without containment that have heat
      if (!this.part.containment && this.heat_contained > 0) {
        console.log(
          `[Heat Bar] ${this.part.id} has ${this.heat_contained} heat but no containment`
        );
      }
    } else {
      this.$percent.style.width = "0%";
      this.$el.classList.remove("spent");
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

    // Parts with a limited lifespan (value decreases over time)
    if (part.ticks > 0 && typeof this.ticks === "number") {
      const lifeRemainingRatio = Math.max(0, this.ticks / part.ticks);
      sellValue = Math.ceil(part.cost * lifeRemainingRatio);
    }
    // Parts that degrade with heat (value decreases with damage)
    else if (part.containment > 0 && typeof this.heat_contained === "number") {
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

  /**
   * Refreshes the tile's visual state after DOM element creation.
   * This is needed when loading save games where parts are set before DOM elements exist.
   */
  refreshVisualState() {
    if (!this.$el || !this.part) return;

    // Set the part classes and background image
    this.$el.className = `tile enabled part_${this.part.id} category_${this.part.category}`;
    this.$el.style.backgroundImage = `url('${this.part.getImagePath()}')`;

    // Update the visual state (progress bars, etc.)
    this.updateVisualState();
  }
}
