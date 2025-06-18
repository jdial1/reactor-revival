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
    this.clearPart(false);
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
    }
  }

  clearPart(refund = true) {
    if (this.part && refund && this.activated) {
      let sell_value = this.part.cost;
      if (this.part.ticks > 0) {
        sell_value = Math.ceil((this.ticks / this.part.ticks) * this.part.cost);
      } else if (this.part.containment > 0) {
        sell_value =
          this.part.cost -
          Math.ceil(
            (this.heat_contained / this.part.containment) * this.part.cost
          );
      }
      this.game.current_money += Math.max(0, sell_value);
      this.game.ui.stateManager.setVar(
        "current_money",
        this.game.current_money
      );
    }
    this.part = null;
    this.ticks = 0;
    this.heat_contained = 0;
    this.activated = false;
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
    } else if (this.part.containment > 0) {
      const perc = Math.max(
        0,
        Math.min(1, this.heat_contained / this.part.containment)
      );
      this.$percent.style.width = perc * 100 + "%";
      this.$percent.style.backgroundColor = "#f00";
      this.$el.classList.remove("spent");
    } else {
      this.$percent.style.width = "0%";
      this.$el.classList.remove("spent");
    }
  }
}
