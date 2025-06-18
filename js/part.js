import { numFormat as fmt } from "./util.js";

const SINGLE_CELL_DESC_TPL =
  "Produces %power power and %heat heat for %ticks ticks.";
const MULTI_CELL_DESC_TPL =
  "Acts as %count %type cells. Produces %power power and %heat heat for %ticks ticks";

export class Part {
  constructor(part_definition, game) {
    this.game = game;
    this.part = part_definition;
    this.id = part_definition.id;
    this.title = part_definition.title;
    this.category = part_definition.category;
    this.type = part_definition.type;
    this.level = part_definition.level || 1;
    this.experimental = part_definition.experimental || false;
    this.base_power = part_definition.base_power || 0;
    this.base_heat = part_definition.base_heat || 0;
    this.base_ticks = part_definition.base_ticks || 0;
    this.base_containment = part_definition.base_containment || 0;
    this.base_vent = part_definition.base_vent || 0;
    this.base_reactor_power = part_definition.base_reactor_power || 0;
    this.base_reactor_heat = part_definition.base_reactor_heat || 0;
    this.base_transfer = part_definition.base_transfer || 0;
    this.base_range = part_definition.base_range || 1;
    this.base_ep_heat = part_definition.base_ep_heat || 0;
    this.base_power_increase = part_definition.base_power_increase || 0;
    this.base_heat_increase = part_definition.base_heat_increase || 0;
    this.base_ecost = part_definition.base_ecost || 0;
    this.base_cost = part_definition.base_cost || 0;

    this.erequires = part_definition.erequires || null;
    this.cost = part_definition.base_cost;
    this.perpetual = false;
    this.description = "";
    this.cell_count = part_definition.cell_count || 0;
    this.affordable = false;
    this.$el = null;
    this.className = "";

    this.recalculate_stats();
    this.updateDescription();
  }

  recalculate_stats() {
    const { game } = this;
    // Example:
    const improvedAlloys =
      game.upgradeset.getUpgrade("improved_alloys")?.level || 0;
    const quantumBuffering =
      game.upgradeset.getUpgrade("quantum_buffering")?.level || 0;

    // Cell tick upgrades
    let tickMultiplier = 1;
    if (this.category === "cell") {
      const tickUpgrade = game.upgradeset.getUpgrade(`${this.type}1_cell_tick`);
      if (tickUpgrade) {
        tickMultiplier = Math.pow(2, tickUpgrade.level);
      }
    }

    // Reflector tick upgrades
    if (this.category === "reflector") {
      const densityUpgrade = game.upgradeset.getUpgrade(
        "improved_reflector_density"
      );
      if (densityUpgrade && densityUpgrade.level > 0) {
        tickMultiplier = 1 + densityUpgrade.level;
      }
    }

    // Cell power upgrades
    let powerMultiplier = 1;
    if (this.category === "cell") {
      const powerUpgrade = game.upgradeset.getUpgrade(
        `${this.type}1_cell_power`
      );
      if (powerUpgrade) {
        powerMultiplier = Math.pow(2, powerUpgrade.level);
      }
    }

    this.reactor_heat =
      this.base_reactor_heat *
      (1 + improvedAlloys) *
      Math.pow(2, quantumBuffering);

    this.power = this.base_power * powerMultiplier;
    this.heat = this.base_heat;
    this.ticks = this.base_ticks * tickMultiplier;
    this.containment = this.base_containment;
    this.vent = this.base_vent;
    this.reactor_power = this.base_reactor_power;
    this.transfer = this.base_transfer;
    this.range = this.base_range;
    this.ep_heat = this.base_ep_heat;
    this.power_increase = this.base_power_increase;
    this.heat_increase = this.base_heat_increase;
    this.cost = this.base_cost;
    this.ecost = this.base_ecost;

    // Apply forceful fusion upgrade
    if (this.category === "cell" && game.reactor.heat_power_multiplier > 0) {
      const heatMultiplier =
        1 +
        game.reactor.heat_power_multiplier *
          (Math.log(game.reactor.current_heat) / Math.log(1000) / 100);
      this.power *= heatMultiplier;
    }

    this.updateDescription();
  }

  getImagePath() {
    let folder;
    let filename;
    const level = this.part.level;

    switch (this.category) {
      case "cell": {
        folder = "cells";
        const cellCounts = { 1: 1, 2: 2, 3: 4 };
        const cellType = this.type === "protium" ? "xcell" : "cell";
        const typeToNum = {
          uranium: 1,
          plutonium: 2,
          thorium: 3,
          seaborgium: 4,
          dolorium: 5,
          nefastium: 6,
          protium: 1,
        };
        const cellNum = typeToNum[this.type];
        filename = `${cellType}_${cellNum}_${cellCounts[level]}`;
        break;
      }
      case "reflector":
        folder = "reflectors";
        filename = `reflector_${level}`;
        break;
      case "capacitor":
        folder = "capacitors";
        filename = `capacitor_${level}`;
        break;
      case "vent":
        folder = "vents";
        filename = `vent_${level}`;
        break;
      case "heat_exchanger":
        folder = "exchangers";
        filename = `exchanger_${level}`;
        break;
      case "heat_inlet":
        folder = "inlets";
        filename = `inlet_${level}`;
        break;
      case "heat_outlet":
        folder = "outlets";
        filename = `outlet_${level}`;
        break;
      case "coolant_cell":
        folder = "coolants";
        filename = `coolant_cell_${level}`;
        break;
      case "reactor_plating":
        folder = "platings";
        filename = `plating_${level}`;
        break;
      case "particle_accelerator":
        folder = "accelerators";
        filename = `accelerator_${level}`;
        break;
      default:
        folder = this.type + "s";
        filename = `${this.type}_${level}`;
    }
    return `img/parts/${folder}/${filename}.png`;
  }

  updateDescription(tile_context = null) {
    let baseDescTpl = this.part.base_description;
    if (baseDescTpl === "%single_cell_description") {
      baseDescTpl = SINGLE_CELL_DESC_TPL;
    } else if (baseDescTpl === "%multi_cell_description") {
      baseDescTpl = MULTI_CELL_DESC_TPL;
    } else if (!baseDescTpl) {
      baseDescTpl =
        this.part.cell_count > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL;
    }

    const effectiveTransfer = tile_context
      ? tile_context.getEffectiveTransferValue()
      : this.transfer;
    const effectiveVent = tile_context
      ? tile_context.getEffectiveVentValue()
      : this.vent;
    const cellLevelIndex = (this.part.level || 1) - 1;
    const cellCountForDesc = [1, 2, 4][cellLevelIndex] || this.cell_count || 1;

    this.description = baseDescTpl
      .replace(/%power_increase/g, fmt(this.power_increase))
      .replace(/%heat_increase/g, fmt(this.heat_increase))
      .replace(/%reactor_power/g, fmt(this.reactor_power))
      .replace(/%reactor_heat/g, fmt(this.reactor_heat))
      .replace(/%ticks/g, fmt(this.ticks))
      .replace(/%containment/g, fmt(this.containment))
      .replace(/%ep_heat/g, fmt(this.ep_heat))
      .replace(/%range/g, fmt(this.range))
      .replace(/%count/g, cellCountForDesc)
      .replace(/%power/g, fmt(this.power))
      .replace(/%heat/g, fmt(this.heat))
      .replace(/%transfer/g, fmt(effectiveTransfer))
      .replace(/%vent/g, fmt(effectiveVent))
      .replace(/%type/g, this.part.title.replace(/Dual |Quad /, ""));
  }

  createElement() {
    this.$el = document.createElement("button");
    this.$el.className = "part";
    if (this.className) this.$el.classList.add(this.className);
    this.$el.classList.add(`part_${this.id}`);
    this.$el.classList.add(`category_${this.category}`);
    this.$el.id = `part_btn_${this.id}`;
    this.$el.title = this.title;

    const imageDiv = document.createElement("div");
    imageDiv.className = "image";
    imageDiv.style.backgroundImage = `url('${this.getImagePath()}')`;
    this.$el.appendChild(imageDiv);

    this.$el.classList.toggle("unaffordable", !this.affordable);
    this.$el.disabled = !this.affordable;

    this.$el.addEventListener("click", (e) => {
      if (this.affordable) {
        document
          .querySelectorAll(".part.part_active")
          .forEach((el) => el.classList.remove("part_active"));
        this.game.ui.stateManager.setClickedPart(this);
        this.$el.classList.add("part_active");
        const icon = document.createElement("div");
        icon.className = "image";
        icon.style.backgroundImage = `url(${this.getImagePath()})`;
        if (this.game.ui.DOMElements.partsPanelToggle) {
          this.game.ui.DOMElements.partsPanelToggle.innerHTML = "";
          this.game.ui.DOMElements.partsPanelToggle.appendChild(icon);
        }
      }
    });

    return this.$el;
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

  getEffectiveVentValue() {
    let ventValue = this.vent;
    if (this.part && this.part.vent) {
      const ventMultiplier = this.game?.reactor.vent_multiplier_eff || 0;
      ventValue = this.part.vent * (1 + ventMultiplier / 100);
    }
    // Active venting: boost by adjacent capacitors
    if (this.part && this.part.category === "vent") {
      const activeVenting =
        this.game.upgradeset.getUpgrade("active_venting")?.level || 0;
      if (activeVenting > 0) {
        // Count adjacent capacitors
        let capCount = 0;
        if (this.containmentNeighborTiles) {
          for (const neighbor of this.containmentNeighborTiles) {
            if (neighbor.part && neighbor.part.category === "capacitor") {
              capCount += neighbor.part.part.level || 1;
            }
          }
        }
        ventValue *= 1 + (activeVenting * capCount) / 100;
      }
    }
    return ventValue;
  }
}
