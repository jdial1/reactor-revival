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
    if (this.level !== level) {
      this.level = level;
      this.updateDisplayCost();
      this.game.upgradeset.check_affordability(this.game);
      if (this.actionId) {
        executeUpgradeAction(this.actionId, this, this.game);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
    if (this.$levels) {
      this.$levels.textContent =
        this.level >= this.max_level && this.max_level > 1 ? "MAX" : this.level;
    }
    this.game.reactor.updateStats();
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
      if (this.$el) {
        this.$el.classList.toggle("unaffordable", !isAffordable);
        // this.$el.disabled = !isAffordable;
      }
    }
  }

  updateDisplayCost() {
    if (this.base_ecost) {
      this.current_ecost =
        this.base_ecost * Math.pow(this.cost_multiplier, this.level);
    }
    this.current_cost =
      this.base_cost * Math.pow(this.cost_multiplier, this.level);

    if (this.level >= this.max_level) {
      this.display_cost = "--";
      this.current_cost = Infinity;
      this.current_ecost = Infinity;
    } else {
      this.display_cost = this.base_ecost
        ? fmt(this.current_ecost)
        : fmt(this.current_cost);
    }

    // Update the DOM element if it exists
    if (this.$el) {
      let costDiv = this.$el.querySelector(".upgrade-price");
      if (!costDiv) {
        costDiv = document.createElement("div");
        costDiv.className = "upgrade-price";
        // Insert it before the levels div if it exists
        const levelsDiv = this.$el.querySelector(".levels");
        if (levelsDiv) {
          this.$el.insertBefore(costDiv, levelsDiv);
        } else {
          this.$el.appendChild(costDiv);
        }
      }
      costDiv.textContent = this.display_cost;

      // Hide the cost if it's not applicable (e.g., max level)
      if (this.display_cost === "--") {
        costDiv.style.display = "none";
      } else {
        costDiv.style.display = "";
      }
    }
  }

  createElement() {
    if (window.templateLoader && window.templateLoader.loaded) {
      this.$el = window.templateLoader.cloneTemplateElement(
        "upgrade-btn-template"
      );
      if (this.$el) {
        // Set upgrade data
        if (this.upgrade.classList) {
          this.$el.classList.add(...this.upgrade.classList);
        }
        this.$el.id = this.id;

        // Set image
        const imageDiv = this.$el.querySelector(".image");
        if (imageDiv && this.upgrade.icon) {
          imageDiv.style.backgroundImage = `url('${this.upgrade.icon}')`;
          imageDiv.style.width = "90%";
          imageDiv.style.height = "90%";
          imageDiv.style.backgroundSize = "contain";
          imageDiv.style.backgroundPosition = "center";
          imageDiv.style.backgroundRepeat = "no-repeat";
        }

        // Set cost display
        const costDiv = this.$el.querySelector(".upgrade-price");
        if (
          costDiv &&
          this.current_cost !== undefined &&
          this.current_cost !== Infinity
        ) {
          costDiv.textContent = this.display_cost;
          costDiv.style.display = "";
        }

        // Set level display
        this.$levels = this.$el.querySelector(".levels");
        if (this.$levels) {
          this.$levels.textContent =
            this.level >= this.max_level && this.max_level > 1
              ? "MAX"
              : this.level;
        }

        this.$el.classList.toggle("unaffordable", !this.affordable);
        return this.$el;
      }
    }

    // Fallback to original method if template not available
    this.$el = document.createElement("button");
    this.$el.className = "upgrade";
    if (this.upgrade.classList)
      this.$el.classList.add(...this.upgrade.classList);
    this.$el.id = this.id;

    // Create image div first, matching .part .image
    const imageDiv = document.createElement("div");
    imageDiv.className = "image";
    imageDiv.style.width = "90%";
    imageDiv.style.height = "90%";
    imageDiv.style.backgroundSize = "contain";
    imageDiv.style.backgroundPosition = "center";
    imageDiv.style.backgroundRepeat = "no-repeat";
    if (this.upgrade.icon) {
      imageDiv.style.backgroundImage = `url('${this.upgrade.icon}')`;
    }
    this.$el.appendChild(imageDiv);

    // Add cost display overlay
    if (this.current_cost !== undefined && this.current_cost !== Infinity) {
      const costDiv = document.createElement("div");
      costDiv.className = "part-price upgrade-price";
      costDiv.textContent = this.display_cost;
      this.$el.appendChild(costDiv);
    }

    // Add level display overlay
    this.$levels = document.createElement("div");
    this.$levels.className = "levels";
    this.$levels.textContent =
      this.level >= this.max_level && this.max_level > 1 ? "MAX" : this.level;
    this.$el.appendChild(this.$levels);

    this.$el.classList.toggle("unaffordable", !this.affordable);
    return this.$el;
  }

  getCost() {
    return this.current_cost;
  }

  getEcost() {
    return this.current_ecost || 0;
  }
}
