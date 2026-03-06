import { numFormat as fmt } from "../utils/util.js";
import { BALANCE } from "./balanceConfig.js";
import { getUpgradeBonusLines } from "./part/partUpgradeBonusBuilder.js";
import { getPartImagePath } from "../utils/partImageUtils.js";
import { buildPartDescription } from "./part/partDescription.js";
import { recalculatePartStats } from "./part/partStatsRecalculator.js";
import { renderToNode, PartButton } from "../components/buttonFactory.js";

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
    const onClick = () => {
      if (this.game?.ui?.help_mode_active) {
        if (this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
        return;
      }
      if (this.affordable) {
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.game.emit?.("partClicked", { part: this });
        this.$el.classList.add("part_active");
      } else {
        if (this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
      }
    };
    const onMouseEnter = () => {
      if (this.game?.ui?.help_mode_active && this.game?.tooltip_manager) {
        this.game.tooltip_manager.show(this, null, false, this.$el);
      }
    };
    const onMouseLeave = () => {
      if (this.game?.ui?.help_mode_active && this.game?.tooltip_manager) {
        this.game.tooltip_manager.hide();
      }
    };
    this.$el = renderToNode(PartButton(this, onClick, onMouseEnter, onMouseLeave));
    return this.$el;
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
