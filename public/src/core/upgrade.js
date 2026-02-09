import Decimal, { toDecimal } from "../utils/decimal.js";
import { numFormat as fmt } from "../utils/util.js";
import { executeUpgradeAction } from "./upgradeActions.js";

export class Upgrade {
  constructor(upgrade_definition, game) {
    this.game = game;
    this.upgrade = upgrade_definition;
    this.id = upgrade_definition.id;
    this.title = upgrade_definition.title;
    this.description = upgrade_definition.description;
    this.base_cost = toDecimal(upgrade_definition.cost ?? 0);
    this.cost_multiplier = upgrade_definition.multiplier || 1.5;
    this.max_level = upgrade_definition.levels || game.upgrade_max_level;
    this.type = upgrade_definition.type;
    this.category = upgrade_definition.category;
    this.erequires = upgrade_definition.erequires;
    this.base_ecost = toDecimal(upgrade_definition.ecost ?? 0);
    this.ecost_multiplier = upgrade_definition.ecost_multiplier || upgrade_definition.multiplier || 1.5;
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
        if (isAffordable) {
          this.$el.classList.remove("unaffordable");
        } else {
          this.$el.classList.add("unaffordable");
        }
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
          if (this.level >= this.max_level) {
            buyBtn.setAttribute("aria-label", `${this.title} is maxed out`);
          } else {
            buyBtn.setAttribute("aria-label", `Buy ${this.title} for ${this.display_cost}`);
          }
        }
      }

      const descEl = this.$el.querySelector(".upgrade-description");
      if (descEl) {
        if (this.level >= this.max_level) {
          descEl.style.display = "none";
        } else {
          descEl.style.display = "";
        }
      }

      if (this.level >= this.max_level) {
        this.$el.classList.add("maxed-out");
      } else {
        this.$el.classList.remove("maxed-out");
      }
    }
  }

  createElement() {
    if (window.templateLoader && window.templateLoader.loaded) {
      this.$el = window.templateLoader.cloneTemplateElement("upgrade-card-template");
    }

    if (!this.$el) {
      this.$el = document.createElement("div");
      this.$el.className = "upgrade-card";
      this.$el.innerHTML = `
        <div class="upgrade-header">
          <div class="upgrade-icon-wrapper">
            <div class="image"></div>
          </div>
          <div class="upgrade-details">
            <div class="upgrade-title"></div>
            <div class="upgrade-description"></div>
          </div>
          <div class="upgrade-doctrine-icon"></div>
        </div>
        <div class="upgrade-footer">
          <div class="upgrade-level-info">
            <span class="level-text"></span>
          </div>
          <button class="pixel-btn upgrade-action-btn">
            <span class="action-text">Buy</span>
            <span class="cost-display"></span>
          </button>
          <div class="sandbox-upgrade-actions">
            <button class="pixel-btn sandbox-buy-max-btn" type="button">Buy Max</button>
            <button class="pixel-btn sandbox-reset-btn" type="button">Reset</button>
          </div>
        </div>
      `;
    }

    this.$el.dataset.id = this.id;
    if (this.upgrade.classList) {
      this.$el.classList.add(...this.upgrade.classList);
    }

    const imageDiv = this.$el.querySelector(".image");
    if (imageDiv && this.upgrade.icon) {
      imageDiv.style.backgroundImage = `url('${this.upgrade.icon}')`;
    }

    const doctrineIconEl = this.$el.querySelector(".upgrade-doctrine-icon");
    if (doctrineIconEl && this.game.upgradeset) {
      const doctrine = this.game.upgradeset.getDoctrineForUpgrade(this.id);
      const iconPath = doctrine ? doctrine.icon : "img/ui/status/status_star.png";
      doctrineIconEl.style.backgroundImage = `url('${iconPath}')`;
      doctrineIconEl.dataset.doctrine = doctrine ? doctrine.id : "base";
    }

    const doctrineLocked = this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id);
    if (doctrineLocked) {
      this.$el.classList.add("doctrine-locked");
      this.$el.dataset.doctrineLocked = "true";
    }

    try {
      const classes = Array.isArray(this.upgrade.classList) ? this.upgrade.classList : [];
      const title = (this.title || "").toLowerCase();
      const desc = (this.description || "").toLowerCase();
      const type = (this.type || this.upgrade?.type || "").toLowerCase();
      const actionId = (this.actionId || this.upgrade?.actionId || "").toLowerCase();

      let iconPath = null;
      let isHeat = false;

      if (classes.includes("cell_perpetual") || title.includes("perpetual") || actionId.includes("perpetual")) {
        iconPath = "img/ui/status/status_infinity.png";
      }

      if (!iconPath && (classes.includes("cell_tick") || title.includes("enriched") || actionId.includes("tick") ||
        desc.includes("tick") || desc.includes("duration") || desc.includes("last") || desc.includes("per second") || title.includes("clock") || title.includes("chronometer"))) {
        iconPath = "img/ui/icons/icon_time.png";
      }

      if (!iconPath) {
        const heatTerms = ["heat", "vent", "exchange", "containment", "hold", "heatsink", "coolant", "thermal", "inlet", "outlet", "exchanger", "venting"];
        const powerTerms = ["power", "potent", "reflection", "transformer", "grid", "capacitor", "capacitance", "accelerator"];
        const hasHeat = heatTerms.some(t => title.includes(t) || desc.includes(t) || type.includes(t) || actionId.includes(t));
        const hasPower = powerTerms.some(t => title.includes(t) || desc.includes(t) || type.includes(t) || actionId.includes(t) || classes.includes("cell_power"));
        if (hasHeat) {
          iconPath = "img/ui/icons/icon_heat.png";
          isHeat = true;
        } else if (hasPower) {
          iconPath = "img/ui/icons/icon_power.png";
        }
      }

      if (!iconPath) {
        iconPath = "img/ui/status/status_star.png";
      }

      if (iconPath) {
        const overlay = document.createElement("img");
        overlay.className = "status-overlay";
        if (isHeat) overlay.classList.add("status-heat");
        overlay.src = iconPath;
        overlay.alt = "";
        const iconWrapper = this.$el.querySelector(".upgrade-icon-wrapper");
        if(iconWrapper) iconWrapper.appendChild(overlay);
      }
    } catch (_) {  }

    const titleEl = this.$el.querySelector(".upgrade-title");
    if (titleEl) titleEl.textContent = this.title;

    const descEl = this.$el.querySelector(".upgrade-description");
    if (descEl) {
      const desc = this.description || "";
      if (this.game.ui && this.game.ui.stateManager) {
        descEl.innerHTML = this.game.ui.stateManager.addPartIconsToTitle(desc);
      } else {
        descEl.textContent = desc;
      }
    }

    const buyBtn = this.$el.querySelector(".upgrade-action-btn");
    if (buyBtn) {
      if (doctrineLocked) {
        const doctrine = this.game.upgradeset.getDoctrineForUpgrade(this.id);
        const doctrineName = doctrine?.title || doctrine?.id || "other doctrine";
        buyBtn.setAttribute("aria-label", `Locked – ${doctrineName}`);
        buyBtn.disabled = true;
      } else {
        buyBtn.setAttribute("aria-label", `Buy ${this.title} for ${this.display_cost}`);
      }
      buyBtn.onclick = (e) => {
        e.stopPropagation();
        if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) {
          return;
        }
        if (this.game.upgradeset.purchaseUpgrade(this.id)) {
          if (this.game.audio) this.game.audio.play('upgrade');
          this.game.upgradeset.check_affordability(this.game);
        } else {
          if (this.game.audio) this.game.audio.play('error');
        }
      };
    }

    const sandboxActions = this.$el.querySelector(".sandbox-upgrade-actions");
    if (sandboxActions && this.game) {
      const buyMaxBtn = sandboxActions.querySelector(".sandbox-buy-max-btn");
      const resetBtn = sandboxActions.querySelector(".sandbox-reset-btn");
      if (buyMaxBtn) {
        buyMaxBtn.onclick = (e) => {
          e.stopPropagation();
          if (!this.game.isSandbox) return;
          if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
          const count = this.game.upgradeset.purchaseUpgradeToMax(this.id);
          if (count > 0 && this.game.audio) this.game.audio.play('upgrade');
          this.game.upgradeset.check_affordability(this.game);
        };
      }
      if (resetBtn) {
        resetBtn.onclick = (e) => {
          e.stopPropagation();
          if (!this.game.isSandbox) return;
          this.game.upgradeset.resetUpgradeLevel(this.id);
        };
      }
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
