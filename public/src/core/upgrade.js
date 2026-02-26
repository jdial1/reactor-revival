import Decimal, { toDecimal } from "../utils/decimal.js";
import { numFormat as fmt } from "../utils/util.js";
import { executeUpgradeAction } from "./upgradeActions.js";
import { renderToNode, UpgradeCard } from "../components/buttonFactory.js";

export class Upgrade {
  constructor(upgrade_definition, game) {
    this.game = game;
    this.upgrade = upgrade_definition;
    this.id = upgrade_definition.id;
    this.title = upgrade_definition.title;
    this.description = upgrade_definition.description;
    this.base_cost = toDecimal(upgrade_definition.cost);
    this.cost_multiplier = upgrade_definition.multiplier ?? 1;
    this.max_level = upgrade_definition.levels ?? game.upgrade_max_level;
    this.type = upgrade_definition.type;
    this.category = upgrade_definition.category;
    this.erequires = upgrade_definition.erequires;
    this.base_ecost = toDecimal(upgrade_definition.ecost);
    this.ecost_multiplier = upgrade_definition.ecost_multiplier ?? 1;
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
      if (this.actionId) {
        executeUpgradeAction(this.actionId, this, this.game);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
    // Removed: this.game.reactor.updateStats();
    // The game loop's natural updateStats call on the next tick is sufficient for gameplay.
    // Calling it here overwrites externally set test data prematurely.
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
      if (this.$el) {
        const buyBtn = this.$el.querySelector(".upgrade-action-btn");
        if (buyBtn) {
          buyBtn.disabled = !isAffordable || this.level >= this.max_level;
        }
        this.$el.classList.toggle("unaffordable", !isAffordable);
      }
    }
  }

  setAffordProgress(progress) {
    const p = Math.max(0, Math.min(1, Number(progress)));
    if (this.$el) {
      const buyBtn = this.$el.querySelector(".upgrade-action-btn");
      if (buyBtn) {
        buyBtn.style.setProperty("--afford-progress", String(p));
      }
    }
  }

  updateDisplayCost() {
    this.current_ecost = this.base_ecost.mul(Decimal.pow(this.ecost_multiplier, this.level));
    this.current_cost = this.base_cost.mul(Decimal.pow(this.cost_multiplier, this.level));

    if (this.level >= this.max_level) {
      this.display_cost = "MAX";
      this.current_cost = Decimal.MAX_VALUE;
      this.current_ecost = Decimal.MAX_VALUE;
    } else {
      this.display_cost = this.base_ecost.gt(0) ? `${fmt(this.current_ecost)} EP` : `$${fmt(this.current_cost)}`;
    }

    if (this.$el) {
      const costDisplay = this.$el.querySelector(".cost-display");
      if (costDisplay) {
        costDisplay.textContent = this.display_cost;
      }

      const levelText = this.$el.querySelector(".level-text");
      if (levelText) {
        levelText.textContent = this.level >= this.max_level ? "MAX" : `Level ${this.level}/${this.max_level}`;
      }

      const buyBtn = this.$el.querySelector(".upgrade-action-btn");
      if (buyBtn) {
        const doctrineLocked = this.$el.classList.contains("doctrine-locked");
        if (doctrineLocked) {
          buyBtn.disabled = true;
          const doctrine = this.game.upgradeset?.getDoctrineForUpgrade(this.id);
          const doctrineName = doctrine?.title || doctrine?.id || "other doctrine";
          buyBtn.setAttribute("aria-label", `Locked – ${doctrineName}`);
        } else {
          buyBtn.disabled = !this.affordable || this.level >= this.max_level;
          buyBtn.setAttribute("aria-label", this.level >= this.max_level ? `${this.title} is maxed out` : `Buy ${this.title} for ${this.display_cost}`);
        }
      }

      const descEl = this.$el.querySelector(".upgrade-description");
      if (descEl) {
        descEl.style.display = this.level >= this.max_level ? "none" : "";
      }

      this.$el.classList.toggle("maxed-out", this.level >= this.max_level);
    }
  }

  createElement() {
    const doctrineSource = (id) => this.game?.upgradeset?.getDoctrineForUpgrade(id);
    const onBuyClick = (e) => {
      e.stopPropagation();
      if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
      if (!this.game.upgradeset.purchaseUpgrade(this.id)) {
        if (this.game.audio) this.game.audio.play('error');
        return;
      }
      if (this.game.audio) this.game.audio.play('upgrade');
      this.game.upgradeset.check_affordability(this.game);
    };
    const onBuyMaxClick = (e) => {
      e.stopPropagation();
      if (!this.game.isSandbox) return;
      if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
      const count = this.game.upgradeset.purchaseUpgradeToMax(this.id);
      if (count > 0 && this.game.audio) this.game.audio.play('upgrade');
    };
    const onResetClick = (e) => {
      e.stopPropagation();
      if (!this.game.isSandbox) return;
      this.game.upgradeset.resetUpgradeLevel(this.id);
    };
    this.$el = renderToNode(UpgradeCard(this, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick }));
    const descEl = this.$el.querySelector(".upgrade-description");
    if (descEl) {
      const desc = this.description || "";
      descEl.innerHTML = this.game?.ui?.stateManager ? this.game.ui.stateManager.addPartIconsToTitle(desc) : desc;
    }
    this.updateDisplayCost();
    return this.$el;
  }

  getCost() {
    return this.current_cost;
  }

  getEcost() {
    return this.current_ecost || 0;
  }
}
