import { numFormat as fmt } from "../utils/util.js";

const SINGLE_CELL_DESC_TPL =
  "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL =
  "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";

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

    // Add missing properties that are defined in part_list.json
    this.location = part_definition.location || null;
    this.base_description = part_definition.base_description || "";
    this.valve_group = part_definition.valve_group || null;
    this.activation_threshold = part_definition.activation_threshold || null;
    this.transfer_direction = part_definition.transfer_direction || null;

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
    const improvedWiring =
      game.upgradeset.getUpgrade("improved_wiring")?.level || 0;
    const improvedCoolantCells =
      game.upgradeset.getUpgrade("improved_coolant_cells")?.level || 0;
    const improvedNeutronReflection =
      game.upgradeset.getUpgrade("improved_neutron_reflection")?.level || 0;
    const improvedHeatExchangers =
      game.upgradeset.getUpgrade("improved_heat_exchangers")?.level || 0;
    const improvedHeatVents =
      game.upgradeset.getUpgrade("improved_heat_vents")?.level || 0;
    const fullSpectrumReflectors =
      game.upgradeset.getUpgrade("full_spectrum_reflectors")?.level || 0;
    const fluidHyperdynamics =
      game.upgradeset.getUpgrade("fluid_hyperdynamics")?.level || 0;
    const fractalPiping =
      game.upgradeset.getUpgrade("fractal_piping")?.level || 0;
    const ultracryonics =
      game.upgradeset.getUpgrade("ultracryonics")?.level || 0;
    const infusedCells =
      game.upgradeset.getUpgrade("infused_cells")?.level || 0;
    const unleashedCells =
      game.upgradeset.getUpgrade("unleashed_cells")?.level || 0;
    const unstableProtium =
      game.upgradeset.getUpgrade("unstable_protium")?.level || 0;

    // Cell tick upgrades
    let tickMultiplier = 1;
    if (this.category === "cell") {
      const tickUpgrade = game.upgradeset.getUpgrade(`${this.type}1_cell_tick`);
      if (tickUpgrade) {
        tickMultiplier = Math.pow(2, tickUpgrade.level);
      }

      // Unstable Protium for protium cells
      if (this.type === "protium" && unstableProtium > 0) {
        tickMultiplier /= Math.pow(2, unstableProtium);
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

      // Infused cells upgrade
      if (infusedCells > 0) {
        powerMultiplier *= Math.pow(2, infusedCells);
      }

      // Unleashed cells upgrade
      if (unleashedCells > 0) {
        powerMultiplier *= Math.pow(2, unleashedCells);
      }

      // Unstable Protium for protium cells
      if (this.type === "protium" && unstableProtium > 0) {
        powerMultiplier *= Math.pow(2, unstableProtium);
      }

      // Protium cell depletion bonus
      if (this.type === "protium" && game.protium_particles > 0) {
        powerMultiplier *= (1 + (game.protium_particles * 0.1));
      }
    }

    // Capacitor upgrades
    let capacitorPowerMultiplier = 1;
    let capacitorContainmentMultiplier = 1;
    if (this.category === "capacitor") {
      if (improvedWiring > 0) {
        capacitorPowerMultiplier *= improvedWiring + 1;
        capacitorContainmentMultiplier *= improvedWiring + 1;
      }
      if (quantumBuffering > 0) {
        capacitorPowerMultiplier *= Math.pow(2, quantumBuffering);
        capacitorContainmentMultiplier *= Math.pow(2, quantumBuffering);
      }
    }

    // Heat exchanger upgrades
    let transferMultiplier = 1;
    let heatExchangerContainmentMultiplier = 1;
    if (this.category === "heat_exchanger") {
      if (improvedHeatExchangers > 0) {
        transferMultiplier *= improvedHeatExchangers + 1;
        heatExchangerContainmentMultiplier *= improvedHeatExchangers + 1;
      }
      if (fluidHyperdynamics > 0) {
        transferMultiplier *= Math.pow(2, fluidHyperdynamics);
      }
      if (fractalPiping > 0) {
        heatExchangerContainmentMultiplier *= Math.pow(2, fractalPiping);
      }
    }

    // Heat inlet/outlet upgrades - these should benefit from heat exchanger upgrades
    if (this.category === "heat_inlet" || this.category === "heat_outlet") {
      if (improvedHeatExchangers > 0) {
        transferMultiplier *= improvedHeatExchangers + 1;
        heatExchangerContainmentMultiplier *= improvedHeatExchangers + 1;
      }
      // Note: fluid_hyperdynamics should NOT affect inlets/outlets according to test expectations
      if (fractalPiping > 0) {
        heatExchangerContainmentMultiplier *= Math.pow(2, fractalPiping);
      }
    }

    // Valve upgrades - apply transfer multiplier from part definition
    if (this.category === "valve" && this.part.transfer_multiplier) {
      transferMultiplier *= this.part.transfer_multiplier;
    }

    // Vent upgrades
    let ventMultiplier = 1;
    let ventContainmentMultiplier = 1;
    if (this.category === "vent") {
      if (improvedHeatVents > 0) {
        // This was Math.pow(2, improvedHeatVents), which is incorrect for a "+100% per level" bonus.
        ventMultiplier *= (1 + improvedHeatVents);
        ventContainmentMultiplier *= improvedHeatVents + 1;
      }
      if (fluidHyperdynamics > 0) {
        ventMultiplier *= Math.pow(2, fluidHyperdynamics);
      }
      if (fractalPiping > 0) {
        ventContainmentMultiplier *= Math.pow(2, fractalPiping);
      }
    }

    // Coolant cell upgrades
    let coolantContainmentMultiplier = 1;
    if (this.category === "coolant_cell") {
      if (improvedCoolantCells > 0) {
        coolantContainmentMultiplier *= improvedCoolantCells + 1;
      }
      if (ultracryonics > 0) {
        coolantContainmentMultiplier *= Math.pow(2, ultracryonics);
      }
    }

    // Reflector power increase upgrades
    let reflectorPowerIncreaseMultiplier = 1;
    if (this.category === "reflector") {
      if (improvedNeutronReflection > 0) {
        reflectorPowerIncreaseMultiplier *= 1 + improvedNeutronReflection / 100;
      }
      if (fullSpectrumReflectors > 0) {
        reflectorPowerIncreaseMultiplier += fullSpectrumReflectors;
      }
    }

    // Particle accelerator upgrades
    let epHeatMultiplier = 1;
    if (this.category === "particle_accelerator") {
      const levelUpgrade = game.upgradeset.getUpgrade(
        `improved_particle_accelerators${this.part.level}`
      );
      if (levelUpgrade) {
        epHeatMultiplier *= levelUpgrade.level + 1;
      }
    }

    this.reactor_heat =
      this.base_reactor_heat *
      (1 + improvedAlloys) *
      Math.pow(2, quantumBuffering);

    this.power = this.base_power * powerMultiplier;
    // Ensure power is a valid number
    if (!isFinite(this.power) || isNaN(this.power)) {
      this.power = this.base_power || 0;
    }
    this.heat = this.base_heat;
    if (this.category === "cell" && unleashedCells > 0) {
      this.heat *= Math.pow(2, unleashedCells);
    }
    if (
      this.category === "cell" &&
      this.type === "protium" &&
      unstableProtium > 0
    ) {
      this.heat *= Math.pow(2, unstableProtium);
    }

    this.ticks = this.base_ticks * tickMultiplier;

    this.containment =
      this.base_containment *
      capacitorContainmentMultiplier *
      heatExchangerContainmentMultiplier *
      ventContainmentMultiplier *
      coolantContainmentMultiplier;

    // Valves should never store heat - they only transfer when both input and output are available
    // No containment needed since they don't store heat
    this.vent = this.base_vent * ventMultiplier;
    this.reactor_power = this.base_reactor_power * capacitorPowerMultiplier;
    this.transfer = this.base_transfer * transferMultiplier;
    this.range = this.base_range;
    this.ep_heat = this.base_ep_heat * epHeatMultiplier;
    this.power_increase =
      this.base_power_increase * reflectorPowerIncreaseMultiplier;
    this.heat_increase = this.base_heat_increase;
    this.cost = this.base_cost;
    this.ecost = this.base_ecost;


    if (this.category === "cell") {
      const perpetualUpgrade = game.upgradeset.getUpgrade(
        `${this.id}_cell_perpetual`
      );
      if (perpetualUpgrade && perpetualUpgrade.level > 0) {
        this.perpetual = true;
      } else {
        this.perpetual = false;
      }
    }


    if (this.category === "cell" && game.reactor.heat_power_multiplier > 0 && game.reactor.current_heat > 0) {
      const heatMultiplier =
        1 +
        game.reactor.heat_power_multiplier *
        (Math.log(game.reactor.current_heat) / Math.log(1000) / 100);
      this.power *= heatMultiplier;
      // Ensure power is still valid after heat multiplier
      if (!isFinite(this.power) || isNaN(this.power)) {
        this.power = this.base_power || 0;
      }
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
      case "valve":
        folder = "valves";
        const valveImageMap = {
          "overflow_valve": "valve_1_1",
          "overflow_valve2": "valve_1_2",
          "overflow_valve3": "valve_1_3",
          "overflow_valve4": "valve_1_4",
          "topup_valve": "valve_2_1",
          "topup_valve2": "valve_2_2",
          "topup_valve3": "valve_2_3",
          "topup_valve4": "valve_2_4",
          "check_valve": "valve_3_1",
          "check_valve2": "valve_3_2",
          "check_valve3": "valve_3_3",
          "check_valve4": "valve_3_4"
        };
        filename = valveImageMap[this.id] || `valve_1`;
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
      .replace(/%heat_increase/g, fmt(this.heat_increase, 0))
      .replace(/%reactor_power/g, fmt(this.reactor_power))
      .replace(/%reactor_heat/g, fmt(this.reactor_heat, 0))
      .replace(/%ticks/g, fmt(this.ticks))
      .replace(/%containment/g, fmt(this.containment, 0))
      .replace(/%ep_heat/g, fmt(this.ep_heat, 0))
      .replace(/%range/g, fmt(this.range))
      .replace(/%count/g, cellCountForDesc)
      .replace(/%power/g, fmt(this.power))
      .replace(/%heat/g, fmt(this.heat, 0))
      .replace(/%transfer/g, fmt(effectiveTransfer))
      .replace(/%vent/g, fmt(effectiveVent))
      .replace(/%type/g, this.part.title.replace(/Dual |Quad /, ""));
  }

  createElement() {
    this.$el = window.templateLoader.cloneTemplateElement("part-btn-template");
    if (!this.$el) {
      // Fallback to original method if template not available
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

      // Add price display
      const priceDiv = document.createElement("div");
      priceDiv.className = "part-price";
      priceDiv.textContent = this.erequires
        ? `${fmt(this.cost)} EP`
        : `${fmt(this.cost)}`;
      this.$el.appendChild(priceDiv);

      this.$el.classList.toggle("unaffordable", !this.affordable);
      this.$el.disabled = !this.affordable;

      this.$el.addEventListener("click", (e) => {
        // Check if help mode is active
        if (this.game?.ui?.help_mode_active) {
          // In help mode, show tooltip instead of selecting part
          if (this.game && this.game.tooltip_manager) {
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
          this.game.ui.stateManager.setClickedPart(this);

          // Add active class to this part
          this.$el.classList.add("part_active");
        } else {
          // Show tooltip for unaffordable parts when clicked
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(this, null, true, this.$el);
          }
        }
      });

      // Add hover tooltips for parts
      this.$el.addEventListener("mouseenter", (e) => {
        // Only show hover tooltips when help mode is active
        if (
          this.game?.ui?.help_mode_active &&
          this.game &&
          this.game.tooltip_manager
        ) {
          this.game.tooltip_manager.show(this, null, false, this.$el);
        }
      });

      this.$el.addEventListener("mouseleave", (e) => {
        // Only hide tooltips if help mode is active (since we only show them in help mode)
        if (
          this.game?.ui?.help_mode_active &&
          this.game &&
          this.game.tooltip_manager
        ) {
          this.game.tooltip_manager.hide();
        }
      });

      return this.$el;
    }

    // Set part data
    if (this.className) this.$el.classList.add(this.className);
    this.$el.classList.add(`part_${this.id}`);
    this.$el.classList.add(`category_${this.category}`);
    this.$el.id = `part_btn_${this.id}`;
    this.$el.title = this.title;

    // Set image
    const imageDiv = this.$el.querySelector(".image");
    if (imageDiv) {
      imageDiv.style.backgroundImage = `url('${this.getImagePath()}')`;
    }

    // Set price
    const priceDiv = this.$el.querySelector(".part-price");
    if (priceDiv) {
      priceDiv.textContent = this.erequires
        ? `${fmt(this.cost)} EP`
        : `${fmt(this.cost)}`;
    }

    this.$el.classList.toggle("unaffordable", !this.affordable);
    this.$el.disabled = !this.affordable;

    // Ensure a tier-progress element exists for potential locking UI
    let tp = this.$el.querySelector('.tier-progress');
    if (!tp) {
      tp = document.createElement('div');
      tp.className = 'tier-progress';
      this.$el.appendChild(tp);
    }
    tp.style.display = 'none';

    // Add event listeners
    this.$el.addEventListener("click", (e) => {
      // Check if help mode is active
      if (this.game?.ui?.help_mode_active) {
        // In help mode, show tooltip instead of selecting part
        if (this.game && this.game.tooltip_manager) {
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
        this.game.ui.stateManager.setClickedPart(this);

        // Add active class to this part
        this.$el.classList.add("part_active");
      } else {
        // Show tooltip for unaffordable parts when clicked
        if (this.game && this.game.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
      }
    });

    // Add hover tooltips for parts
    this.$el.addEventListener("mouseenter", (e) => {
      // Only show hover tooltips when help mode is active
      if (
        this.game?.ui?.help_mode_active &&
        this.game &&
        this.game.tooltip_manager
      ) {
        this.game.tooltip_manager.show(this, null, false, this.$el);
      }
    });

    this.$el.addEventListener("mouseleave", (e) => {
      // Only hide tooltips if help mode is active (since we only show them in help mode)
      if (
        this.game?.ui?.help_mode_active &&
        this.game &&
        this.game.tooltip_manager
      ) {
        this.game.tooltip_manager.hide();
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

  // Get the cost for auto-replacement (1.5x base cost for perpetual cells)
  getAutoReplacementCost() {
    if (this.category === "cell" && this.perpetual) {
      return this.base_cost * 1.5;
    }
    return this.base_cost;
  }
}
