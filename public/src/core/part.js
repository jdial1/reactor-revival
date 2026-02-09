import { toDecimal } from "../utils/decimal.js";
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
    this.base_containment = part_definition.base_containment || (this.category === "reactor_plating" ? 1000 : 0);
    this.base_vent = part_definition.base_vent || 0;
    this.base_reactor_power = part_definition.base_reactor_power || 0;
    this.base_reactor_heat = part_definition.base_reactor_heat || 0;
    this.base_transfer = part_definition.base_transfer || 0;
    this.base_range = part_definition.base_range || 1;
    this.base_ep_heat = part_definition.base_ep_heat || 0;
    this.base_power_increase = part_definition.base_power_increase || 0;
    this.base_heat_increase = part_definition.base_heat_increase || 0;
    this.base_ecost = toDecimal(part_definition.base_ecost ?? 0);
    this.base_cost = toDecimal(part_definition.base_cost ?? 0);

    // Add missing properties that are defined in part_list.json
    this.location = part_definition.location || null;
    this.base_description = part_definition.base_description || "";
    this.valve_group = part_definition.valve_group || null;
    this.activation_threshold = part_definition.activation_threshold || null;
    this.transfer_direction = part_definition.transfer_direction || null;

    this.erequires = part_definition.erequires || null;
    this.cost = toDecimal(part_definition.base_cost ?? 0);
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
    const epHeatBefore = this.ep_heat;
    const partId = this.id;
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
    const componentReinforcement =
      game.upgradeset.getUpgrade("component_reinforcement")?.level || 0;
    const isotopeStabilization =
      game.upgradeset.getUpgrade("isotope_stabilization")?.level || 0;
    const quantumTunneling =
      game.upgradeset.getUpgrade("quantum_tunneling")?.level || 0;

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

      if (isotopeStabilization > 0) {
        tickMultiplier *= (1 + (isotopeStabilization * 0.05));
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
      if (fluidHyperdynamics > 0) {
        transferMultiplier *= Math.pow(2, fluidHyperdynamics);
      }
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

    let baseContainmentMult = 1;
    if (componentReinforcement > 0) {
      baseContainmentMult += (componentReinforcement * 0.10);
    }

    this.containment =
      (this.base_containment || (this.category === "reactor_plating" ? 1000 : 0)) *
      baseContainmentMult *
      capacitorContainmentMultiplier *
      heatExchangerContainmentMultiplier *
      ventContainmentMultiplier *
      coolantContainmentMultiplier;

    this.vent = (this.base_vent || 0) * ventMultiplier;
    this.reactor_power = this.base_reactor_power * capacitorPowerMultiplier;
    this.transfer = this.base_transfer * transferMultiplier;
    
    if (this.category === "reactor_plating") {
      if (game.reactor.plating_transfer_rate > 0) {
        this.transfer = this.containment * game.reactor.plating_transfer_rate;
      } else {
        this.transfer = 0;
      }
    }
    
    this.range = this.base_range;
    if (this.category === "heat_inlet" || this.category === "heat_outlet") {
      if (quantumTunneling > 0) {
        this.range += quantumTunneling;
      }
    }
    let epHeatScale = 1;
    if (this.category === "particle_accelerator") {
      const epRaw = game.current_exotic_particles ?? game.exotic_particles;
      const epValue = (epRaw != null && typeof epRaw.toNumber === 'function' ? epRaw.toNumber() : Number(epRaw));
      const epValueFinite = Number.isFinite(epValue) ? epValue : 0;
      if (epValueFinite > 1000000) {
        const ratio = epValueFinite / 1000000;
        const scale = 1 + Math.log10(ratio);
        if (isFinite(scale) && !isNaN(scale)) {
          epHeatScale = scale;
        }
      }
    }
    let epHeatAfter = this.base_ep_heat * epHeatMultiplier * epHeatScale;
    
    if (this.category === "particle_accelerator" && game.reactor.catalyst_reduction > 0) {
      const reduction = Math.min(0.75, game.reactor.catalyst_reduction);
      epHeatAfter *= (1 - reduction);
    }
    if (!isFinite(epHeatAfter) || isNaN(epHeatAfter)) {
      const fallback = this.base_ep_heat * epHeatMultiplier;
      epHeatAfter = Number.isFinite(fallback) ? fallback : (this.base_ep_heat || 0);
    }
    if (partId === 'particle_accelerator1' && epHeatBefore !== undefined && epHeatAfter !== epHeatBefore) {
      console.log(`[RECALC-STATS DEBUG] ep_heat changed for ${partId}: ${epHeatBefore} -> ${epHeatAfter} (base_ep_heat=${this.base_ep_heat}, multiplier=${epHeatMultiplier})`);
    }
    this.ep_heat = epHeatAfter;
    this.power_increase =
      this.base_power_increase * reflectorPowerIncreaseMultiplier;
    this.heat_increase = this.base_heat_increase;
    this.cost = this.base_cost;
    this.ecost = this.base_ecost;

    // Reset perpetual status first, then check upgrades
    this.perpetual = false;

    if (this.category === "cell") {
      const perpetualUpgrade = game.upgradeset.getUpgrade(
        `${this.id}_cell_perpetual`
      );
      if (perpetualUpgrade && perpetualUpgrade.level > 0) {
        this.perpetual = true;
      }
    } else if (this.category === "reflector") {
      const perpRefs = game.upgradeset.getUpgrade("perpetual_reflectors");
      if (perpRefs && perpRefs.level > 0) {
        this.perpetual = true;
      }
    } else if (this.category === "capacitor") {
      const perpCaps = game.upgradeset.getUpgrade("perpetual_capacitors");
      if (perpCaps && perpCaps.level > 0) {
        this.perpetual = true;
      }
    }


    if (this.category === "cell" && game.reactor.heat_power_multiplier > 0 && game.reactor.current_heat > 0) {
      const heatForLog = Math.min(game.reactor.current_heat, 1e100);
      const heatMultiplier =
        1 +
        game.reactor.heat_power_multiplier *
        (Math.log(heatForLog) / Math.log(1000) / 100);
      this.power *= heatMultiplier;
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
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(this, null, true, this.$el);
          }
          return;
        }

        if (this.affordable) {
          document
            .querySelectorAll(".part.part_active")
            .forEach((el) => el.classList.remove("part_active"));

          this.game.ui.stateManager.setClickedPart(this);

          this.$el.classList.add("part_active");
        } else {
          if (this.game && this.game.tooltip_manager) {
            this.game.tooltip_manager.show(this, null, true, this.$el);
          }
        }
      });

      this.$el.addEventListener("mouseenter", (e) => {
        if (
          this.game?.ui?.help_mode_active &&
          this.game &&
          this.game.tooltip_manager
        ) {
          this.game.tooltip_manager.show(this, null, false, this.$el);
        }
      });

      this.$el.addEventListener("mouseleave", (e) => {
        if (
          this.game?.ui?.help_mode_active &&
          this.game &&
          this.game.tooltip_manager
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

    this.populatePartDetails();

    return this.$el;
  }

  populatePartDetails() {
    if (!this.$el) return;
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
    const lines = [];
    if (!this.game?.upgradeset) return lines;
    const upg = (id) => this.game.upgradeset.getUpgrade(id)?.level || 0;
    const pctFromMultiplier = (mult) => Math.round((mult - 1) * 100);

    switch (this.category) {
      case 'vent': {
        const tev = upg('improved_heat_vents');
        if (tev > 0) {
          lines.push(`<span class="pos">+${tev * 100}%</span> venting`);
          lines.push(`<span class="pos">+${tev * 100}%</span> max heat`);
        }
        const fh = upg('fluid_hyperdynamics');
        if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> venting`);
        const fp = upg('fractal_piping');
        if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
        break;
      }
      case 'heat_exchanger': {
        const ihe = upg('improved_heat_exchangers');
        if (ihe > 0) lines.push(`<span class="pos">+${ihe * 100}%</span> transfer`);
        const fh = upg('fluid_hyperdynamics');
        if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> transfer`);
        const fp = upg('fractal_piping');
        if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
        break;
      }
      case 'heat_inlet':
      case 'heat_outlet': {
        const ihe = upg('improved_heat_exchangers');
        if (ihe > 0) lines.push(`<span class="pos">+${ihe * 100}%</span> transfer`);
        const fp = upg('fractal_piping');
        if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
        break;
      }
      case 'capacitor': {
        const iw = upg('improved_wiring');
        if (iw > 0) lines.push(`<span class="pos">+${iw * 100}%</span> power capacity`);
        const qb = upg('quantum_buffering');
        if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> capacity`);
        break;
      }
      case 'coolant_cell': {
        const icc = upg('improved_coolant_cells');
        if (icc > 0) lines.push(`<span class="pos">+${icc * 100}%</span> max heat`);
        const uc = upg('ultracryonics');
        if (uc > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, uc))}%</span> max heat`);
        break;
      }
      case 'reflector': {
        const ird = upg('improved_reflector_density');
        if (ird > 0) lines.push(`<span class="pos">+${ird * 100}%</span> duration`);
        const inr = upg('improved_neutron_reflection');
        if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> reflection`);
        const fsr = upg('full_spectrum_reflectors');
        if (fsr > 0) lines.push(`<span class="pos">+${fsr * 100}%</span> base reflection`);
        break;
      }
      case 'reactor_plating': {
        const ia = upg('improved_alloys');
        if (ia > 0) lines.push(`<span class="pos">+${ia * 100}%</span> reactor heat`);
        const qb = upg('quantum_buffering');
        if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> reactor heat`);
        break;
      }
      case 'particle_accelerator': {
        const lvl = this.level || 1;
        const id = lvl === 6 ? 'improved_particle_accelerators6' : 'improved_particle_accelerators1';
        const ipa = upg(id);
        if (ipa > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, ipa))}%</span> EP heat cap`);
        break;
      }
      case 'cell': {
        const powerUpg = this.game.upgradeset.getUpgrade(`${this.type}1_cell_power`);
        if (powerUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, powerUpg.level))}%</span> power`);
        const tickUpg = this.game.upgradeset.getUpgrade(`${this.type}1_cell_tick`);
        if (tickUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, tickUpg.level))}%</span> duration`);
        const perpUpg = this.game.upgradeset.getUpgrade(`${this.type}1_cell_perpetual`);
        if (perpUpg?.level > 0) lines.push(`Auto-replace`);
        const infused = upg('infused_cells');
        if (infused > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, infused))}%</span> power`);
        const unleashed = upg('unleashed_cells');
        if (unleashed > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, unleashed))}%</span> pwr/heat`);
        break;
      }
      default:
        break;
    }
    return lines;
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

  getAutoReplacementCost() {
    if (this.perpetual) {
      if (this.category === 'reflector') return this.base_cost.mul(1.5);
      if (this.category === 'capacitor') return this.base_cost.mul(10);
      if (this.category === 'cell') return this.base_cost.mul(1.5);
    }
    return this.base_cost;
  }
}
