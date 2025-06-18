import { numFormat as fmt } from "./util.js";
import { executeUpgradeAction } from "./upgradeActions.js";

export class Upgrade {
  constructor(upgrade_definition, game) {
    this.game = game;
    this.upgrade = upgrade_definition;
    this.id = upgrade_definition.id;
    this.title = upgrade_definition.title;
    this.description = upgrade_definition.description;
    this.base_cost = upgrade_definition.cost;
    this.cost_multiplier = upgrade_definition.multiplier || 1.5;
    this.max_level = upgrade_definition.levels || game.upgrade_max_level;
    this.type = upgrade_definition.type;
    this.category = upgrade_definition.category;
    this.erequires = upgrade_definition.erequires;
    this.base_ecost = upgrade_definition.ecost;
    this.ecost_multiplier = upgrade_definition.ecost_multiplier || 1.5;
    this.actionId = upgrade_definition.actionId;
    this.level = 0;
    this.current_cost = this.base_cost;
    this.current_ecost = this.base_ecost;
    this.affordable = false;
    this.$el = null;
    this.$levels = null;
    this.display_cost = "";
    this.updateDisplayCost();
  }

  setLevel(level) {
    this.level = Math.min(level, this.max_level);
    this.updateDisplayCost();
    if (this.actionId) {
      executeUpgradeAction(this.actionId, this, this.game);
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
    if (this.$levels) {
      this.$levels.textContent =
        this.level >= this.max_level && this.max_level > 1 ? "MAX" : this.level;
    }
    this.game.reactor.updateStats();
    this.game.upgradeset.check_affordability(this.game);
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
      if (this.$el) {
        this.$el.classList.toggle("unaffordable", !isAffordable);
        this.$el.disabled = !isAffordable;
      }
    }
  }

  updateDisplayCost() {
    if (this.base_ecost) {
      this.current_ecost =
        this.base_ecost * Math.pow(this.cost_multiplier, this.level);
    } else {
      this.current_cost =
        this.base_cost * Math.pow(this.cost_multiplier, this.level);
    }
    if (this.level >= this.max_level) {
      this.display_cost = "--";
      this.current_cost = Infinity;
      this.current_ecost = Infinity;
    } else {
      this.display_cost = this.base_ecost
        ? fmt(this.current_ecost)
        : fmt(this.current_cost);
    }
  }

  createElement() {
    this.$el = document.createElement("button");
    this.$el.className = "upgrade";
    if (this.upgrade.classList)
      this.$el.classList.add(...this.upgrade.classList);
    this.$el.id = this.id;

    const imageDiv = document.createElement("div");
    imageDiv.className = "image";

    if (this.upgrade.icon) {
      imageDiv.style.backgroundImage = `url('${this.upgrade.icon}')`;
    }

    this.$levels = document.createElement("span");
    this.$levels.className = "levels";
    this.$levels.textContent = this.level;
    imageDiv.appendChild(this.$levels);
    this.$el.appendChild(imageDiv);

    this.$el.classList.toggle("unaffordable", !this.affordable);
    this.$el.disabled = !this.affordable;

    return this.$el;
  }

  getCost() {
    return this.base_ecost > 0 ? this.current_ecost : this.current_cost;
  }

  getEcost() {
    return this.current_ecost || 0;
  }
}
