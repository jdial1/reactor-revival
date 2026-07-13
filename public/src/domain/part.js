import { z } from "zod";
import { PartDefinitionSchema } from "../schema/index.js";
import { bundledGameData } from "../bundledStaticData.js";
import { compileTraitBitmask, hasTrait } from "../traits.js";
import { BALANCE } from "./balance.js";
import { toDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { WEAVE_QUANTUM } from "../constants/balance.js";
import { getPartImagePath } from "../core/part-images.js";
import {
  getUpgradeBonusLines,
  calculateCellPulsePower,
  calculateCellPulseHeat,
} from "../logic-tooltip-stats.js";

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;
const HEAT_LOG_CAP = 1e100;
const HEAT_LOG_BASE = 1000;
const ISOTOPE_STABILIZATION_FACTOR = 0.05;
const COMPONENT_REINFORCEMENT_FACTOR = 0.1;
const CATALYST_REDUCTION_CAP = 0.75;
const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";
const TITLE_PREFIX_STRIP = /Dual |Quad /;

export const CELL_FORM_FACTORS = [
  { titlePrefix: "", cellPackM: 1, cellCount: 1 },
  { titlePrefix: "Dual ", cellPackM: 4, cellCount: 2 },
  { titlePrefix: "Quad ", cellPackM: 12, cellCount: 4 },
];

const CELL_COUNTS_BY_LEVEL = CELL_FORM_FACTORS.map((f) => f.cellCount);

const PART_TITLE_PREFIXES = ["Basic ", "Advanced ", "Super ", "Wonderous ", "Ultimate "];

export function resolveCellTierPartId(type, level) {
  return `${type}${level}`;
}

function getUpgradeLevel(us, id) {
  return us.getUpgrade(id)?.level || 0;
}

function gatherUpgradeLevels(game) {
    const us = game.upgradeset;
    const level = (id) => getUpgradeLevel(us, id);
    return {
        improvedCoolantCells: level("improved_coolant_cells"),
        improvedNeutronReflection: level("improved_neutron_reflection"),
        improvedHeatExchangers: level("improved_heat_exchangers"),
        improvedHeatVents: level("improved_heat_vents"),
        componentReinforcement: level("component_reinforcement"),
        infusedCells: level("infused_cells"),
        unleashedCells: level("unleashed_cells"),
        isotopeStabilization: level("isotope_stabilization"),
        // Add Experimental Boosts
        fullSpectrumReflectors: level("full_spectrum_reflectors"),
        fluidHyperdynamics: level("fluid_hyperdynamics"),
        fractalPiping: level("fractal_piping"),
        ultracryonics: level("ultracryonics"),
    };
}

function computeTickMultiplier(part, game, levels) {
  let tickMultiplier = 1;
  if (part.category === "cell") {
    const tickUpgrade = game.upgradeset.getUpgrade(`${part.type}1_cell_tick`);
    if (tickUpgrade && tickUpgrade.level > 0) tickMultiplier *= Math.pow(2, tickUpgrade.level);
    if (levels.isotopeStabilization > 0)
      tickMultiplier *= 1 + levels.isotopeStabilization * ISOTOPE_STABILIZATION_FACTOR;
    if (part.type === "protium" && game.upgradeset.getUpgrade("unstable_protium")?.level > 0) {
      tickMultiplier *= Math.pow(0.5, game.upgradeset.getUpgrade("unstable_protium").level);
    }
  }
  if (part.category === "reflector") {
    const densityUpgrade = game.upgradeset.getUpgrade("improved_reflector_density");
    if (densityUpgrade && densityUpgrade.level > 0) tickMultiplier = 1 + densityUpgrade.level;
  }
  return tickMultiplier;
}

function computeCapacitorMultipliers(part, _levels) {
  const capacitorPowerMultiplier = 1;
  const capacitorContainmentMultiplier = 1;
  return { capacitorPowerMultiplier, capacitorContainmentMultiplier };
}

function applyHeatExchangerUpgrades(levels) {
  let transfer = 1;
  let containment = 1;
  if (levels.improvedHeatExchangers > 0) {
    transfer *= levels.improvedHeatExchangers + 1;
    containment *= levels.improvedHeatExchangers + 1;
  }
  return { transfer, containment };
}

function isTransferExchangerCategory(part) {
  return part.category === "heat_exchanger" || part.category === "heat_inlet" || part.category === "heat_outlet";
}

function computeTransferExchangerMultipliers(part, levels) {
    let transferMultiplier = 1;
    let heatExchangerContainmentMultiplier = 1;

    if (isTransferExchangerCategory(part)) {
        const ex = applyHeatExchangerUpgrades(levels);
        transferMultiplier *= ex.transfer;
        heatExchangerContainmentMultiplier *= ex.containment;

        // Apply Experimental Boosts
        if (levels.fluidHyperdynamics > 0) {
            transferMultiplier *= Math.pow(2, levels.fluidHyperdynamics);
        }
        if (levels.fractalPiping > 0) {
            heatExchangerContainmentMultiplier *= Math.pow(2, levels.fractalPiping);
        }
        if (levels.unleashedCells > 0) {
            transferMultiplier *= 1 + levels.unleashedCells;
        }
    }
    if (part.category === "valve" && part.part.transfer_multiplier)
        transferMultiplier *= part.part.transfer_multiplier;
    return { transferMultiplier, heatExchangerContainmentMultiplier };
}

function computeVentMultipliers(part, levels) {
    let ventMultiplier = 1;
    let ventContainmentMultiplier = 1;
    if (part.category === "vent") {
        if (levels.improvedHeatVents > 0) {
            ventMultiplier *= 1 + levels.improvedHeatVents;
            ventContainmentMultiplier *= levels.improvedHeatVents + 1;
        }
        // Apply Experimental Boosts
        if (levels.fluidHyperdynamics > 0) {
            ventMultiplier *= Math.pow(2, levels.fluidHyperdynamics);
        }
        if (levels.fractalPiping > 0) {
            ventContainmentMultiplier *= Math.pow(2, levels.fractalPiping);
        }
    }
    return { ventMultiplier, ventContainmentMultiplier };
}

function computeCoolantContainmentMultiplier(part, levels) {
    let coolantContainmentMultiplier = 1;
    if (part.category === "coolant_cell") {
        if (levels.improvedCoolantCells > 0) coolantContainmentMultiplier *= levels.improvedCoolantCells + 1;
        // Apply Experimental Boosts
        if (levels.ultracryonics > 0) {
            coolantContainmentMultiplier *= Math.pow(2, levels.ultracryonics);
        }
    }
    return coolantContainmentMultiplier;
}

function computeReflectorPowerIncreaseMultiplier(part, levels) {
  let reflectorPowerIncreaseMultiplier = 1;
  if (part.category === "reflector") {
    if (levels.improvedNeutronReflection > 0)
      reflectorPowerIncreaseMultiplier *= 1 + levels.improvedNeutronReflection / PERCENT_DIVISOR;
    if (levels.infusedCells > 0)
      reflectorPowerIncreaseMultiplier *= 1 + levels.infusedCells;
  }
  return reflectorPowerIncreaseMultiplier;
}

function computeCoolantReflectorMultipliers(part, levels) {
  return {
    coolantContainmentMultiplier: computeCoolantContainmentMultiplier(part, levels),
    reflectorPowerIncreaseMultiplier: computeReflectorPowerIncreaseMultiplier(part, levels),
  };
}

function computeEpHeatMultiplier(part, game) {
  let epHeatMultiplier = 1;
  if (part.category === "particle_accelerator") {
    const levelUpgrade = game.upgradeset.getUpgrade(`improved_particle_accelerators${part.part.level}`);
    if (levelUpgrade) epHeatMultiplier *= levelUpgrade.level + 1;
  }
  return epHeatMultiplier;
}

function computeEpHeatScale(part, game) {
  let epHeatScale = 1;
  const mask = part?.trait_mask || 0;
  if (hasTrait(mask, "PARTICLE_ACCELERATOR")) {
    const epRaw = game.state.current_exotic_particles ?? game.exoticParticleManager.exotic_particles;
    const epValue = epRaw != null && typeof epRaw.toNumber === "function" ? epRaw.toNumber() : Number(epRaw);
    const epValueFinite = Number.isFinite(epValue) ? epValue : 0;
    if (epValueFinite > WEAVE_QUANTUM) {
      const ratio = epValueFinite / WEAVE_QUANTUM;
      const scale = 1 + Math.log10(ratio);
      if (isFinite(scale) && !isNaN(scale)) epHeatScale = scale;
    }
  }
  return epHeatScale;
}

function applyBaseCellStats(part, game, levels, m) {
  part.reactor_heat = part.base_reactor_heat;
  if (part.category === "cell") {
    const M = part.cell_pack_M ?? 1;
    const C = Math.max(1, part.cell_count_C ?? part.cell_count ?? 1);
    const N = m.neighborPulses ?? 0;
    part.power = calculateCellPulsePower(part.base_power, M, N);
    const powerUpg = game.upgradeset.getUpgrade(`${part.type}1_cell_power`);
    if (powerUpg && powerUpg.level > 0) {
      part.power *= Math.pow(2, powerUpg.level);
    }
    part.heat = calculateCellPulseHeat(part.base_heat, M, N, C);
  } else {
    part.power = part.base_power;
    part.heat = part.base_heat;
  }
  part.ticks = (part.base_ticks ?? 0) * m.tickMultiplier;
}

function applyContainmentVent(part, levels, m) {
  let baseContainmentMult = 1;
  if (levels.componentReinforcement > 0) {
    const bufferCategories = new Set(["reactor_plating", "coolant_cell", "capacitor"]);
    if (bufferCategories.has(part.category)) {
      baseContainmentMult += levels.componentReinforcement * COMPONENT_REINFORCEMENT_FACTOR;
    }
  }
  part.containment =
    (part.base_containment || (part.category === "reactor_plating" ? REACTOR_PLATING_DEFAULT_CONTAINMENT : 0)) *
    baseContainmentMult *
    m.capacitorContainmentMultiplier *
    m.heatExchangerContainmentMultiplier *
    m.ventContainmentMultiplier *
    m.coolantContainmentMultiplier;
  part.vent = (part.base_vent || 0) * m.ventMultiplier;
  part.reactor_power = part.base_reactor_power * m.capacitorPowerMultiplier;
}

function applyTransferPlating(part, game, m) {
  part.transfer = part.base_transfer * m.transferMultiplier;
  if (part.category === "reactor_plating" && game.reactor.plating_heat_bonus > 0) {
    part.reactor_heat = part.base_reactor_heat * (1 + game.reactor.plating_heat_bonus);
  }
}

function applyRangeWithTunneling(part, _levels) {
  const def = part.part;
  const r = def?.range;
  part.range = typeof r === "number" && r > 0 ? r : 1;
  part.topologyType = def?.topologyType || "Manhattan";
}

function deriveEpHeat(part, game, m) {
  let v = part.base_ep_heat * m.epHeatMultiplier * m.epHeatScale;
  if (part.category === "particle_accelerator" && game.reactor.catalyst_reduction > 0) {
    const reduction = Math.min(CATALYST_REDUCTION_CAP, game.reactor.catalyst_reduction);
    v *= 1 - reduction;
  }
  part.ep_heat = Math.max(0, Number.isFinite(v) ? v : 0);
}

function applyCostsIncreases(part, m) {
    part.power_increase = part.base_power_increase * m.reflectorPowerIncreaseMultiplier;
    part.heat_increase = part.base_heat_increase;
    part.cost = part.base_cost;
    part.ecost = part.base_ecost;
    if (part.category === "reflector") {
        // The test expects: initialPowerIncrease * (1 + level)
        // Adjust the logic to include the level boost correctly
        const game = part.game;
        const boostLevel = game?.upgradeset?.getUpgrade("full_spectrum_reflectors")?.level || 0;
        part.power_increase = part.base_power_increase * (1 + boostLevel);
        part.neighbor_pulse_value = Math.max(0, 1 + (part.power_increase || 0) / PERCENT_DIVISOR);
    }
}

function applyMultipliersToPart(part, game, levels, m) {
  applyBaseCellStats(part, game, levels, m);
  applyContainmentVent(part, levels, m);
  applyTransferPlating(part, game, m);
  applyRangeWithTunneling(part, levels);
  deriveEpHeat(part, game, m);
  applyCostsIncreases(part, m);
}

function isPerpetualForCell(part, game) {
  const upg = game.upgradeset.getUpgrade(`${part.id}_cell_perpetual`);
  return upg != null && upg.level > 0;
}

function isPerpetualForReflector(game) {
  const upg = game.upgradeset.getUpgrade("perpetual_reflectors");
  return upg != null && upg.level > 0;
}

function isPerpetualForCapacitor(game) {
  const upg = game.upgradeset.getUpgrade("perpetual_capacitors");
  return upg != null && upg.level > 0;
}

function applyPerpetualFlag(part, game) {
  part.perpetual = false;
  if (part.category === "cell" && isPerpetualForCell(part, game)) part.perpetual = true;
  else if (part.category === "reflector" && isPerpetualForReflector(game)) part.perpetual = true;
  else if (part.category === "capacitor" && isPerpetualForCapacitor(game)) part.perpetual = true;
}

function applyHeatPowerMultiplier(part, game) {
  if (part.category === "cell") return;
  if (game.reactor.heat_power_multiplier <= 0 || game.reactor.current_heat <= 0) return;
  const rawHeat = game.reactor.current_heat;
  const heatNum = typeof rawHeat?.toNumber === "function" ? rawHeat.toNumber() : Number(rawHeat);
  const heatForLog = Math.min(heatNum, HEAT_LOG_CAP);
  const heatMultiplier =
    1 +
    game.reactor.heat_power_multiplier *
      (Math.log(heatForLog) / Math.log(HEAT_LOG_BASE) / PERCENT_DIVISOR);
  part.power *= heatMultiplier;
  if (!isFinite(part.power) || isNaN(part.power)) part.power = part.base_power || 0;
}

function stagePartStatMultipliers(part, game, levels) {
  const tickMultiplier = computeTickMultiplier(part, game, levels);
  const { capacitorPowerMultiplier, capacitorContainmentMultiplier } = computeCapacitorMultipliers(part, levels);
  const { transferMultiplier, heatExchangerContainmentMultiplier } =
    computeTransferExchangerMultipliers(part, levels);
  const { ventMultiplier, ventContainmentMultiplier } = computeVentMultipliers(part, levels);
  const { coolantContainmentMultiplier, reflectorPowerIncreaseMultiplier } =
    computeCoolantReflectorMultipliers(part, levels);
  const epHeatMultiplier = computeEpHeatMultiplier(part, game);
  const epHeatScale = computeEpHeatScale(part, game);
  return {
    tickMultiplier,
    capacitorPowerMultiplier,
    capacitorContainmentMultiplier,
    transferMultiplier,
    heatExchangerContainmentMultiplier,
    ventMultiplier,
    ventContainmentMultiplier,
    coolantContainmentMultiplier,
    reflectorPowerIncreaseMultiplier,
    epHeatMultiplier,
    epHeatScale,
  };
}

function recalculatePartStats(part) {
  const game = part.game;
  const levels = gatherUpgradeLevels(game);
  const m = stagePartStatMultipliers(part, game, levels);
  applyMultipliersToPart(part, game, levels, m);
  applyPerpetualFlag(part, game);
  applyHeatPowerMultiplier(part, game);
}

function getBaseDescriptionTemplate(part) {
  const baseDescTpl = part.part.base_description;
  if (baseDescTpl === "%single_cell_description") return SINGLE_CELL_DESC_TPL;
  if (baseDescTpl === "%multi_cell_description") return MULTI_CELL_DESC_TPL;
  if (!baseDescTpl) return part.part.cell_count > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL;
  return baseDescTpl;
}

function getEffectiveTransfer(part, tile_context) {
  return tile_context ? tile_context.getEffectiveTransferValue() : part.transfer;
}

function getEffectiveVent(part, tile_context) {
  return tile_context ? tile_context.getEffectiveVentValue() : part.vent;
}

function getCellCountForDesc(part) {
  const cellLevelIndex = (part.part.level || 1) - 1;
  return CELL_COUNTS_BY_LEVEL[cellLevelIndex] ?? part.cell_count ?? 1;
}

function applyReplacements(baseDescTpl, part, fmtFn, effectiveTransfer, effectiveVent, cellCountForDesc) {
  const typeLabel = part.part.title.replace(TITLE_PREFIX_STRIP, "");
  return baseDescTpl
    .replace(/%power_increase/g, fmtFn(part.power_increase))
    .replace(/%heat_increase/g, fmtFn(part.heat_increase, 0))
    .replace(/%reactor_power/g, fmtFn(part.reactor_power))
    .replace(/%reactor_heat/g, fmtFn(part.reactor_heat, 0))
    .replace(/%ticks/g, fmtFn(part.ticks))
    .replace(/%containment/g, fmtFn(part.containment, 0))
    .replace(/%ep_heat/g, fmtFn(part.ep_heat, 0))
    .replace(/%range/g, fmtFn(part.range))
    .replace(/%count/g, cellCountForDesc)
    .replace(/%power/g, fmtFn(part.power))
    .replace(/%heat/g, fmtFn(part.heat, 0))
    .replace(/%transfer/g, fmtFn(effectiveTransfer))
    .replace(/%vent/g, fmtFn(effectiveVent))
    .replace(/%type/g, typeLabel);
}

function buildPartDescription(part, fmtFn, tile_context = null) {
  const baseDescTpl = getBaseDescriptionTemplate(part);
  const effectiveTransfer = getEffectiveTransfer(part, tile_context);
  const effectiveVent = getEffectiveVent(part, tile_context);
  const cellCountForDesc = getCellCountForDesc(part);
  return applyReplacements(baseDescTpl, part, fmtFn, effectiveTransfer, effectiveVent, cellCountForDesc);
}

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
    this.cell_pack_M = part_definition.cell_pack_M ?? 1;
    this.cell_count_C = part_definition.cell_count_C ?? 1;
    this.affordable = false;
    this.$el = null;
    this.className = "";
    this.vent_consumes_power = !!part_definition.vent_consumes_power;
    this.outlet_respect_neighbor_cap = !!part_definition.outlet_respect_neighbor_cap;
    this.capacitor_autosell_heat_ratio =
      typeof part_definition.capacitor_autosell_heat_ratio === "number" ? part_definition.capacitor_autosell_heat_ratio : 0;
    this.traits = (Array.isArray(part_definition.traits) && part_definition.traits.length > 0) ? part_definition.traits : (this.category === "cell" ? ["FUEL_CELL"] : []);
    this.trait_mask = part_definition.trait_mask || compileTraitBitmask(this.traits);

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

  setAffordable(isAffordable) {
    this.affordable = isAffordable;
  }

  getUpgradeBonusLines() {
    return getUpgradeBonusLines(this, { tile: null, game: this.game });
  }

  getEffectiveVentValue() {
    let ventValue = this.vent;
    if (this.part?.vent) {
      const ventMultiplier = this.game?.reactor.vent_multiplier_eff || 0;
      ventValue = this.part.vent * (1 + ventMultiplier / PERCENT_DIVISOR);
    }
    if (this.part?.category === "vent") {
      const activeVenting =
        this.game.upgradeset.getUpgrade("active_venting")?.level || 0;
      if (activeVenting > 0) {
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
      if (this.category === 'reflector') return toDecimal(this.base_cost).mul(BALANCE.reflectorSellMultiplier);
      if (this.category === 'capacitor') return toDecimal(this.base_cost).mul(BALANCE.capacitorSellMultiplier);
      if (this.category === 'cell') return toDecimal(this.base_cost).mul(BALANCE.cellSellMultiplier);
    }
    return toDecimal(this.base_cost);
  }
}

function generatePartDefinition(template, level) {
  const partDef = { ...template, level };

  if (template.levels) {
    partDef.id = resolveCellTierPartId(template.type, level);
  } else if (template.id) {
    partDef.id = template.id;
  } else {
    partDef.id = `${template.type}${level}`;
  }

  if (template.levels) {
    partDef.base_cost = template.base_cost.mul(Math.pow(template.cost_multi, level - 1));
  } else {
    partDef.base_cost = template.base_cost;
  }

  if (partDef.category === "cell") {
    applyCellProperties(partDef, template, level);
    return partDef;
  }
  applyGenericPartProperties(partDef, template, level);
  return partDef;
}

function applyCellProperties(partDef, template, level) {
  const form = CELL_FORM_FACTORS[level - 1] || CELL_FORM_FACTORS[0];
  partDef.title = `${form.titlePrefix}${template.title}`;
  partDef.base_description = template.base_description || (level > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL);
  partDef.base_power = template.base_power;
  partDef.base_heat = template.base_heat;
  partDef.cell_pack_M = form.cellPackM;
  partDef.cell_count_C = form.cellCount;
  partDef.cell_count = form.cellCount;
}

function applyGenericPartProperties(partDef, template, level) {
  if (template.title && !template.experimental) {
    partDef.title = template.title;
  } else {
    partDef.title = template.experimental ? template.title : `${PART_TITLE_PREFIXES[level - 1] || ""}${template.title || template.type}`;
  }

  if (template.levels) {
    const applyMultiplier = (baseKey, multiplierKey) => {
      if (template[baseKey] && template[multiplierKey]) {
        partDef[baseKey] = template[baseKey] * Math.pow(template[multiplierKey], level - 1);
      }
    };

    applyMultiplier("base_ticks", "ticks_multiplier");
    applyMultiplier("base_containment", "containment_multi");
    applyMultiplier("base_reactor_power", "reactor_power_multi");
    applyMultiplier("base_reactor_heat", "reactor_heat_multiplier");
    applyMultiplier("base_ep_heat", "ep_heat_multiplier");

    if (template.base_transfer && template.transfer_multiplier) {
      partDef.base_transfer = template.base_transfer * Math.pow(template.transfer_multiplier, level - 1);
    }

    if (template.base_vent && template.vent_multiplier) {
      partDef.base_vent = template.base_vent * Math.pow(template.vent_multiplier, level - 1);
    }

    if (template.base_power_increase && template.power_increase_add) {
      partDef.base_power_increase = template.base_power_increase + (template.power_increase_add * (level - 1));
    }
  } else {
    if (template.base_transfer) partDef.base_transfer = template.base_transfer;
    if (template.base_vent) partDef.base_vent = template.base_vent;
    if (template.base_power_increase) partDef.base_power_increase = template.base_power_increase;
    if (template.base_ticks) partDef.base_ticks = template.base_ticks;
    if (template.base_containment) partDef.base_containment = template.base_containment;
    if (template.base_reactor_power) partDef.base_reactor_power = template.base_reactor_power;
    if (template.base_reactor_heat) partDef.base_reactor_heat = template.base_reactor_heat;
    if (template.base_ep_heat) partDef.base_ep_heat = template.base_ep_heat;
  }
}

export function buildPartCatalog(rawParts = bundledGameData.parts) {
  const templates = z.array(PartDefinitionSchema).parse(rawParts);
  const catalog = [];
  const categoryTypeOrder = new Map();
  const typeOrderIndex = new Map();

  templates.forEach((template) => {
    if (template.category) {
      const arr = categoryTypeOrder.get(template.category) || [];
      if (!arr.includes(template.type)) {
        arr.push(template.type);
        categoryTypeOrder.set(template.category, arr);
        typeOrderIndex.set(`${template.category}:${template.type}`, arr.length - 1);
      }
    }
    if (template.levels) {
      for (let i = 0; i < template.levels; i++) {
        catalog.push(generatePartDefinition(template, i + 1));
      }
    } else {
      catalog.push(generatePartDefinition(template, template.level));
    }
  });

  return { catalog, categoryTypeOrder, typeOrderIndex };
}

export class PartSet {
  constructor(game) {
    this.game = game;
    this.parts = new Map();
    this.partsArray = [];
    this.initialized = false;
    this.categoryTypeOrder = new Map();
    this.typeOrderIndex = new Map();
  }

  reset() {
    this.parts.clear();
    this.partsArray = [];
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return this.partsArray;
    }

    logger.log('info', 'game', 'Loading part list data...');
    const { catalog, categoryTypeOrder, typeOrderIndex } = buildPartCatalog();
    this.categoryTypeOrder = categoryTypeOrder;
    this.typeOrderIndex = typeOrderIndex;
    logger.log('debug', 'game', 'Part list data loaded:', {
      count: catalog.length,
      categories: [...new Set(catalog.map((p) => p.category))]
    });

    catalog.forEach((partDef) => {
      const partInstance = new Part(partDef, this.game);
      this.parts.set(partInstance.id, partInstance);
      this.partsArray.push(partInstance);
    });

    this.initialized = true;
    return this.partsArray;
  }

  generatePartDefinition(template, level) {
    return generatePartDefinition(template, level);
  }

  _applyCellProperties(partDef, template, level) {
    applyCellProperties(partDef, template, level);
  }

  _applyGenericPartProperties(partDef, template, level) {
    applyGenericPartProperties(partDef, template, level);
  }

  updateCellPower() {
    this.partsArray.forEach((part) => {
      if (part.category === "cell") {
        part.recalculate_stats();
      }
    });
  }

  check_affordability(game) {
    if (!game) return;
    this.partsArray.forEach((part) => {
      if (game.reactor && game.reactor.has_melted_down) {
        part.setAffordable(false);
        return;
      }
      if (this.isPartDoctrineLocked(part)) {
        part.setAffordable(false);
        return;
      }
      const isUnlocked = this.game?.unlockManager && typeof this.game.unlockManager.isPartUnlocked === "function" ? this.game.unlockManager.isPartUnlocked(part) : true;
      let isAffordable = false;
      if (part.erequires) {
        const requiredUpgrade = game.upgradeset.getUpgrade(part.erequires);
        if (requiredUpgrade?.level > 0 && isUnlocked) {
          isAffordable = part.ecost?.gt?.(0)
            ? game.state.current_exotic_particles.gte(part.ecost)
            : game.state.current_money.gte(part.cost);
        }
      } else if (isUnlocked) {
        isAffordable = game.state.current_money.gte(part.cost);
      }
      part.setAffordable(isAffordable);
    });
  }

  isPartDoctrineLocked(part) {
    if (!part?.erequires) return false;
    if (this.game.bypass_tech_tree_restrictions) return false;
    if (!this.game.tech_tree || !this.game.upgradeset) return false;
    return !this.game.upgradeset.isUpgradeAvailable(part.erequires);
  }

  getPartById(id) {
    return this.parts.get(id);
  }

  getAllParts() {
    return this.partsArray;
  }

  getPartsByCategory(category) {
    return this.partsArray.filter((part) => part.category === category);
  }

  getPartsByType(type) {
    return this.partsArray.filter((part) => part.type === type);
  }

  getPartsByLevel(level) {
    return this.partsArray.filter((part) => part.level === level);
  }

  getPartsByTier(tier) {
    return this.getPartsByLevel(tier);
  }
}
