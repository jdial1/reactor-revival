import { numFormat as fmt } from "../utils/util.js";
import { BALANCE } from "./balanceConfig.js";
import { getUpgradeBonusLines } from "./part/partUpgradeBonusBuilder.js";
import { getPartImagePath } from "../utils/partImageUtils.js";
import { buildPartDescription } from "./part/partDescription.js";
import { recalculatePartStats } from "./part/partStatsRecalculator.js";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;

export class Part {
  constructor(part_definition, game) {
    this.game = game;
    this.part = part_definition;
    this.id = part_definition.id;
    this.title = part_definition.title;
    this.category = part_definition.category;
    this.type = part_definition.type;
    this.level = part_definition.level;
    this.experimental = part_definition.experimental;
    this.base_power = part_definition.base_power;
    this.base_heat = part_definition.base_heat;
    this.base_ticks = part_definition.base_ticks;
    this.base_containment = part_definition.base_containment ?? (this.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0);
    this.base_vent = part_definition.base_vent;
    this.base_reactor_power = part_definition.base_reactor_power;
    this.base_reactor_heat = part_definition.base_reactor_heat;
    this.base_transfer = part_definition.base_transfer;
    this.base_range = part_definition.base_range;
    this.base_ep_heat = part_definition.base_ep_heat;
    this.base_power_increase = part_definition.base_power_increase;
    this.base_heat_increase = part_definition.base_heat_increase;
    this.base_ecost = part_definition.base_ecost;
    this.base_cost = part_definition.base_cost;

    this.location = part_definition.location ?? null;
    this.base_description = part_definition.base_description;
    this.valve_group = part_definition.valve_group ?? null;
    this.activation_threshold = part_definition.activation_threshold ?? null;
    this.transfer_direction = part_definition.transfer_direction ?? null;

    this.erequires = part_definition.erequires ?? null;
    this.cost = part_definition.base_cost;
    this.perpetual = false;
    this.description = "";
    this.cell_count = part_definition.cell_count;
    this.affordable = false;
    this.$el = null;
    this.className = "";

    this.recalculate_stats();
    this.updateDescription();
  }

  recalculate_stats() {
    recalculatePartStats(this);
    this.updateDescription();
  }

  getCacheKinds(tile) {
    const c = this.category;
    const cells = c === "cell" && tile?.ticks > 0;
    const inlets = c === "heat_inlet";
    const exchangers = c === "heat_exchanger" || c === "valve" || (c === "reactor_plating" && this.transfer > 0);
    const valves = c === "valve";
    const outlets = c === "heat_outlet" && tile?.activated;
    const vents = c === "vent";
    const capacitors = c === "capacitor";
    const vessels = c === "vent" || (this.vent > 0) || c === "particle_accelerator" || (this.containment > 0 && c !== "valve");
    return { cells, inlets, exchangers, valves, outlets, vents, capacitors, vessels };
  }

  getImagePath() {
    return getPartImagePath({ type: this.type, category: this.category, level: this.level, id: this.id });
  }

  updateDescription(tile_context = null) {
    this.description = buildPartDescription(this, fmt, tile_context);
  }

  createElement() {
    const templateLoader = typeof window !== "undefined" ? window.templateLoader : null;
    this.$el = typeof templateLoader?.cloneTemplateElement === "function"
      ? templateLoader.cloneTemplateElement("part-btn-template")
      : null;
    if (!this.$el || typeof this.$el.querySelector !== "function") this.$el = null;
    if (!this.$el) {
      this.$el = document.createElement("button");
      this.$el.className = "part";
      if (this.className) this.$el.classList.add(this.className);
      this.$el.classList.add(`part_${this.id}`);
      this.$el.classList.add(`category_${this.category}`);
      this.$el.id = `part_btn_${this.id}`;
      this.$el.title = this.title;
      const costText = this.erequires ? `${fmt(this.cost)} EP` : `${fmt(this.cost)}`;
      this.$el.setAttribute("aria-label", `${this.title || "Part button"}, Cost: ${costText}`);

      const imageDiv = document.createElement("div");
      imageDiv.className = "image";
      imageDiv.style.backgroundImage = `url('${this.getImagePath()}')`;
      this.$el.appendChild(imageDiv);

      const priceDiv = document.createElement("div");
      priceDiv.className = "part-price";
      priceDiv.textContent = this.erequires
        ? `${fmt(this.cost)} EP`
        : `${fmt(this.cost)}`;
      this.$el.appendChild(priceDiv);

      const detailsDiv = document.createElement("div");
      detailsDiv.className = "part-details";
      detailsDiv.innerHTML = '<div class="part-details-title"></div><div class="part-details-stats"></div><div class="part-details-desc"></div><div class="part-details-bonuses"></div>';
      this.$el.appendChild(detailsDiv);

      this.$el.classList.toggle("unaffordable", !this.affordable);
      this.$el.disabled = !this.affordable;

      this.$el.addEventListener("click", (e) => {
        if (this.game?.ui?.help_mode_active) {
          if (this.game?.tooltip_manager) {
            this.game.tooltip_manager.show(this, null, true, this.$el);
          }
          return;
        }

        if (this.affordable) {
          document
            .querySelectorAll(".part.part_active")
            .forEach((el) => el.classList.remove("part_active"));

          this.game.emit?.("partClicked", { part: this });

          this.$el.classList.add("part_active");
        } else {
          if (this.game?.tooltip_manager) {
            this.game.tooltip_manager.show(this, null, true, this.$el);
          }
        }
      });

      this.$el.addEventListener("mouseenter", (e) => {
        if (
          this.game?.ui?.help_mode_active &&
          this.game?.tooltip_manager
        ) {
          this.game.tooltip_manager.show(this, null, false, this.$el);
        }
      });

      this.$el.addEventListener("mouseleave", (e) => {
        if (
          this.game?.ui?.help_mode_active &&
          this.game?.tooltip_manager
        ) {
          this.game.tooltip_manager.hide();
        }
      });

      this.populatePartDetails();
      return this.$el;
    }

    if (this.className) this.$el.classList.add(this.className);
    this.$el.classList.add(`part_${this.id}`);
    this.$el.classList.add(`category_${this.category}`);
    this.$el.id = `part_btn_${this.id}`;
    this.$el.title = this.title;
    const costText = this.erequires ? `${fmt(this.cost)} EP` : `${fmt(this.cost)}`;
    this.$el.setAttribute("aria-label", `${this.title || "Part button"}, Cost: ${costText}`);

    const imageDiv = this.$el.querySelector(".image");
    if (imageDiv) {
      imageDiv.style.backgroundImage = `url('${this.getImagePath()}')`;
    }

    const priceDiv = this.$el.querySelector(".part-price");
    if (priceDiv) {
      priceDiv.textContent = this.erequires
        ? `${fmt(this.cost)} EP`
        : `${fmt(this.cost)}`;
    }

    this.$el.classList.toggle("unaffordable", !this.affordable);
    this.$el.disabled = !this.affordable;

    let tp = this.$el.querySelector('.tier-progress');
    if (!tp) {
      tp = document.createElement('div');
      tp.className = 'tier-progress';
      this.$el.appendChild(tp);
    }
    tp.style.display = 'none';

    this.$el.addEventListener("click", (e) => {
      if (this.game?.ui?.help_mode_active) {
        if (this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
        return;
      }

      if (this.affordable) {
        // Remove active class from all parts
        document
          .querySelectorAll(".part.part_active")
          .forEach((el) => el.classList.remove("part_active"));

        // Set the clicked part in state manager (this will update the toggle icon)
        this.game.emit?.("partClicked", { part: this });

        // Add active class to this part
        this.$el.classList.add("part_active");
      } else {
        // Show tooltip for unaffordable parts when clicked
        if (this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
      }
    });

    // Add hover tooltips for parts
    this.$el.addEventListener("mouseenter", (e) => {
      // Only show hover tooltips when help mode is active
      if (
        this.game?.ui?.help_mode_active &&
        this.game?.tooltip_manager
      ) {
        this.game.tooltip_manager.show(this, null, false, this.$el);
      }
    });

    this.$el.addEventListener("mouseleave", (e) => {
      // Only hide tooltips if help mode is active (since we only show them in help mode)
      if (
        this.game?.ui?.help_mode_active &&
        this.game?.tooltip_manager
      ) {
        this.game.tooltip_manager.hide();
      }
    });

    this.populatePartDetails();

    return this.$el;
  }

  populatePartDetails() {
    if (!this.$el) return;
    if (typeof this.$el.querySelector !== "function") return;
    const detailsEl = this.$el.querySelector(".part-details");
    if (!detailsEl) return;

    const titleEl = detailsEl.querySelector(".part-details-title");
    if (titleEl) {
      titleEl.textContent = this.title;
    }

    const statsEl = detailsEl.querySelector(".part-details-stats");
    if (statsEl) {
      const stats = [];
      const cashIcon = "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='$'>";
      const powerIcon = "<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='pwr'>";
      const heatIcon = "<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>";
      const tickIcon = "<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>";
      if (this.erequires) {
        stats.push(`<span class="stat-cost">${fmt(this.cost)} EP</span>`);
      } else {
        stats.push(`<span class="stat-cost">${cashIcon}${fmt(this.cost)}</span>`);
      }
      if (this.power > 0) stats.push(`<span class="stat-power">${powerIcon}${fmt(this.power)}</span>`);
      if (this.heat > 0) stats.push(`<span class="stat-heat">${heatIcon}${fmt(this.heat, 0)}</span>`);
      if (this.vent > 0) stats.push(`<span class="stat-vent">${fmt(this.vent, 0)} vent</span>`);
      if (this.containment > 0) stats.push(`<span class="stat-cont">${heatIcon}${fmt(this.containment, 0)} cap</span>`);
      if (this.transfer > 0) stats.push(`<span class="stat-xfer">${fmt(this.transfer, 0)} xfer</span>`);
      if (this.ticks > 0) stats.push(`<span class="stat-tick">${tickIcon}${fmt(this.ticks)}</span>`);
      if (this.reactor_power > 0) stats.push(`<span class="stat-rpower">${powerIcon}${fmt(this.reactor_power)} cap</span>`);
      if (this.power_increase > 0) stats.push(`<span class="stat-boost">+${fmt(this.power_increase)}%${powerIcon}</span>`);
      statsEl.innerHTML = stats.join("");
    }

    const descEl = detailsEl.querySelector(".part-details-desc");
    if (descEl) {
      descEl.textContent = this.description;
    }

    const bonusEl = detailsEl.querySelector(".part-details-bonuses");
    if (bonusEl) {
      const bonuses = this.getUpgradeBonusLines();
      if (bonuses.length > 0) {
        bonusEl.innerHTML = bonuses.map(line => `<span class="bonus-line">${line}</span>`).join("");
      } else {
        bonusEl.innerHTML = "";
      }
    }
  }

  getUpgradeBonusLines() {
    return getUpgradeBonusLines(this, { tile: null, game: this.game });
  }

  setAffordable(isAffordable) {
    if (this.affordable !== isAffordable) {
      this.affordable = isAffordable;
      if (this.$el) {
        this.$el.classList.toggle("unaffordable", !isAffordable);
        this.$el.disabled = !isAffordable;

        // Add or remove price display
        let priceDiv = this.$el.querySelector(".part-price");
        if (!priceDiv) {
          // Add price display for unaffordable parts
          priceDiv = document.createElement("div");
          priceDiv.className = "part-price";
          priceDiv.textContent = this.erequires
            ? `${fmt(this.cost)} EP`
            : `${fmt(this.cost)}`;
          this.$el.appendChild(priceDiv);
        }
      }
    }
  }

  getEffectiveVentValue() {
    let ventValue = this.vent;
    if (this.part?.vent) {
      const ventMultiplier = this.game?.reactor.vent_multiplier_eff || 0;
      ventValue = this.part.vent * (1 + ventMultiplier / PERCENT_DIVISOR);
    }
    // Active venting: boost by adjacent capacitors
    if (this.part?.category === "vent") {
      const activeVenting =
        this.game.upgradeset.getUpgrade("active_venting")?.level || 0;
      if (activeVenting > 0) {
        // Count adjacent capacitors
        let capCount = 0;
        if (this.containmentNeighborTiles) {
          for (const neighbor of this.containmentNeighborTiles) {
            if (neighbor.part?.category === "capacitor") {
              capCount += neighbor.part.part.level || 1;
            }
          }
        }
        ventValue *= 1 + (activeVenting * capCount) / PERCENT_DIVISOR;
      }
    }
    return ventValue;
  }

  getAutoReplacementCost() {
    if (this.perpetual) {
      if (this.category === 'reflector') return this.base_cost.mul(BALANCE.reflectorSellMultiplier);
      if (this.category === 'capacitor') return this.base_cost.mul(10);
      if (this.category === 'cell') return this.base_cost.mul(BALANCE.cellSellMultiplier);
    }
    return this.base_cost;
  }
}
