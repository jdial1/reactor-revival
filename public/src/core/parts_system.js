import { numFormat as fmt, getPartImagePath, logger } from "../utils/utils_constants.js";
import { BALANCE } from "./heat_system.js";
import { renderToNode, PartButton } from "../components/buttonFactory.js";
import dataService from "../services/dataService.js";
import { updateDecimal } from "./store.js";
import {
  serializeReactor,
  deserializeReactor,
  calculateLayoutCostBreakdown,
  calculateLayoutCost,
  renderLayoutPreview,
  buildPartSummary,
  buildAffordableSet,
  filterLayoutByCheckedTypes,
  clipToGrid as clipToGridFn,
  calculateCurrentSellValue,
  buildAffordableLayout as buildAffordableLayoutFn,
  buildPasteState as buildPasteStateFn,
  validatePasteResources,
  getCostBreakdown,
} from "../components/ui/uiModule.js";


export const PART_DEFINITION_TOUCH_POINTS = [
  "dataService/part_list.json",
  "core/parts.js",
  "components/ui/componentRenderingUI.js",
  "core/engine.js",
  "core/parts.js",
  "core/grid.js",
];

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;
const EP_DISPLAY_THRESHOLD = 1000000;
const HEAT_LOG_CAP = 1e100;
const HEAT_LOG_BASE = 1000;
const ISOTOPE_STABILIZATION_FACTOR = 0.05;
const PROTIUM_PARTICLE_FACTOR = 0.1;
const COMPONENT_REINFORCEMENT_FACTOR = 0.1;
const CATALYST_REDUCTION_CAP = 0.75;
const PCT_BASE = 100;
const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";
const CELL_COUNTS_BY_LEVEL = [1, 2, 4];
const TITLE_PREFIX_STRIP = /Dual |Quad /;

const CELL_POWER_MULTIPLIERS = [1, 4, 12];
const CELL_HEAT_MULTIPLIERS = [1, 8, 36];
const CELL_COUNTS = [1, 2, 4];
const PART_TITLE_PREFIXES = ["Basic ", "Advanced ", "Super ", "Wonderous ", "Ultimate "];
const CELL_TITLE_PREFIXES = ["", "Dual ", "Quad "];

function getUpgradeLevel(us, id) {
  return us.getUpgrade(id)?.level || 0;
}

function gatherUpgradeLevels(game) {
  const us = game.upgradeset;
  const level = (id) => getUpgradeLevel(us, id);
  return {
    improvedAlloys: level("improved_alloys"),
    quantumBuffering: level("quantum_buffering"),
    improvedWiring: level("improved_wiring"),
    improvedCoolantCells: level("improved_coolant_cells"),
    improvedNeutronReflection: level("improved_neutron_reflection"),
    improvedHeatExchangers: level("improved_heat_exchangers"),
    improvedHeatVents: level("improved_heat_vents"),
    fullSpectrumReflectors: level("full_spectrum_reflectors"),
    fluidHyperdynamics: level("fluid_hyperdynamics"),
    fractalPiping: level("fractal_piping"),
    ultracryonics: level("ultracryonics"),
    infusedCells: level("infused_cells"),
    unleashedCells: level("unleashed_cells"),
    unstableProtium: level("unstable_protium"),
    componentReinforcement: level("component_reinforcement"),
    isotopeStabilization: level("isotope_stabilization"),
    quantumTunneling: level("quantum_tunneling"),
  };
}

function computeTickMultiplier(part, game, levels) {
  let tickMultiplier = 1;
  if (part.category === "cell") {
    const tickUpgrade = game.upgradeset.getUpgrade(`${part.type}1_cell_tick`);
    if (tickUpgrade) tickMultiplier = Math.pow(2, tickUpgrade.level);
    if (part.type === "protium" && levels.unstableProtium > 0)
      tickMultiplier /= Math.pow(2, levels.unstableProtium);
    if (levels.isotopeStabilization > 0)
      tickMultiplier *= 1 + levels.isotopeStabilization * ISOTOPE_STABILIZATION_FACTOR;
  }
  if (part.category === "reflector") {
    const densityUpgrade = game.upgradeset.getUpgrade("improved_reflector_density");
    if (densityUpgrade && densityUpgrade.level > 0) tickMultiplier = 1 + densityUpgrade.level;
  }
  return tickMultiplier;
}

function computePowerMultiplier(part, game, levels) {
  let powerMultiplier = 1;
  if (part.category === "cell") {
    const powerUpgrade = game.upgradeset.getUpgrade(`${part.type}1_cell_power`);
    if (powerUpgrade) powerMultiplier = Math.pow(2, powerUpgrade.level);
    if (levels.infusedCells > 0) powerMultiplier *= Math.pow(2, levels.infusedCells);
    if (levels.unleashedCells > 0) powerMultiplier *= Math.pow(2, levels.unleashedCells);
    if (part.type === "protium" && levels.unstableProtium > 0)
      powerMultiplier *= Math.pow(2, levels.unstableProtium);
    if (part.type === "protium" && game.protium_particles > 0)
      powerMultiplier *= 1 + game.protium_particles * PROTIUM_PARTICLE_FACTOR;
  }
  return powerMultiplier;
}

function computeCapacitorMultipliers(part, levels) {
  let capacitorPowerMultiplier = 1;
  let capacitorContainmentMultiplier = 1;
  if (part.category === "capacitor") {
    if (levels.improvedWiring > 0) {
      capacitorPowerMultiplier *= levels.improvedWiring + 1;
      capacitorContainmentMultiplier *= levels.improvedWiring + 1;
    }
    if (levels.quantumBuffering > 0) {
      capacitorPowerMultiplier *= Math.pow(2, levels.quantumBuffering);
      capacitorContainmentMultiplier *= Math.pow(2, levels.quantumBuffering);
    }
  }
  return { capacitorPowerMultiplier, capacitorContainmentMultiplier };
}

function applyHeatExchangerUpgrades(levels) {
  let transfer = 1;
  let containment = 1;
  if (levels.improvedHeatExchangers > 0) {
    transfer *= levels.improvedHeatExchangers + 1;
    containment *= levels.improvedHeatExchangers + 1;
  }
  if (levels.fluidHyperdynamics > 0) transfer *= Math.pow(2, levels.fluidHyperdynamics);
  if (levels.fractalPiping > 0) containment *= Math.pow(2, levels.fractalPiping);
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
    if (levels.fluidHyperdynamics > 0) ventMultiplier *= Math.pow(2, levels.fluidHyperdynamics);
    if (levels.fractalPiping > 0) ventContainmentMultiplier *= Math.pow(2, levels.fractalPiping);
  }
  return { ventMultiplier, ventContainmentMultiplier };
}

function computeCoolantContainmentMultiplier(part, levels) {
  let coolantContainmentMultiplier = 1;
  if (part.category === "coolant_cell") {
    if (levels.improvedCoolantCells > 0) coolantContainmentMultiplier *= levels.improvedCoolantCells + 1;
    if (levels.ultracryonics > 0) coolantContainmentMultiplier *= Math.pow(2, levels.ultracryonics);
  }
  return coolantContainmentMultiplier;
}

function computeReflectorPowerIncreaseMultiplier(part, levels) {
  let reflectorPowerIncreaseMultiplier = 1;
  if (part.category === "reflector") {
    if (levels.improvedNeutronReflection > 0)
      reflectorPowerIncreaseMultiplier *= 1 + levels.improvedNeutronReflection / PERCENT_DIVISOR;
    if (levels.fullSpectrumReflectors > 0) reflectorPowerIncreaseMultiplier += levels.fullSpectrumReflectors;
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
  if (part.category === "particle_accelerator") {
    const epRaw = game.state.current_exotic_particles ?? game.exoticParticleManager.exotic_particles;
    const epValue = epRaw != null && typeof epRaw.toNumber === "function" ? epRaw.toNumber() : Number(epRaw);
    const epValueFinite = Number.isFinite(epValue) ? epValue : 0;
    if (epValueFinite > EP_DISPLAY_THRESHOLD) {
      const ratio = epValueFinite / EP_DISPLAY_THRESHOLD;
      const scale = 1 + Math.log10(ratio);
      if (isFinite(scale) && !isNaN(scale)) epHeatScale = scale;
    }
  }
  return epHeatScale;
}

function applyBaseCellStats(part, levels, m) {
  part.reactor_heat = part.base_reactor_heat * (1 + levels.improvedAlloys) * Math.pow(2, levels.quantumBuffering);
  part.power = part.base_power * m.powerMultiplier;
  part.heat = part.base_heat;
  if (part.category === "cell" && levels.unleashedCells > 0) part.heat *= Math.pow(2, levels.unleashedCells);
  if (part.category === "cell" && part.type === "protium" && levels.unstableProtium > 0)
    part.heat *= Math.pow(2, levels.unstableProtium);
  part.ticks = part.base_ticks * m.tickMultiplier;
}

function applyContainmentVent(part, levels, m) {
  let baseContainmentMult = 1;
  if (levels.componentReinforcement > 0) baseContainmentMult += levels.componentReinforcement * COMPONENT_REINFORCEMENT_FACTOR;
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
  if (part.category === "reactor_plating") {
    part.transfer = game.reactor.plating_transfer_rate > 0 ? part.containment * game.reactor.plating_transfer_rate : 0;
  }
}

function applyRangeWithTunneling(part, levels) {
  part.range = part.base_range;
  if (part.category === "heat_inlet" || part.category === "heat_outlet") {
    if (levels.quantumTunneling > 0) part.range += levels.quantumTunneling;
  }
}

function applyEpHeatWithFallback(part, game, m) {
  let epHeatAfter = part.base_ep_heat * m.epHeatMultiplier * m.epHeatScale;
  if (part.category === "particle_accelerator" && game.reactor.catalyst_reduction > 0) {
    const reduction = Math.min(CATALYST_REDUCTION_CAP, game.reactor.catalyst_reduction);
    epHeatAfter *= 1 - reduction;
  }
  if (!isFinite(epHeatAfter) || isNaN(epHeatAfter)) {
    const fallback = part.base_ep_heat * m.epHeatMultiplier;
    epHeatAfter = Number.isFinite(fallback) ? fallback : part.base_ep_heat || 0;
  }
  part.ep_heat = epHeatAfter;
}

function applyCostsIncreases(part, m) {
  part.power_increase = part.base_power_increase * m.reflectorPowerIncreaseMultiplier;
  part.heat_increase = part.base_heat_increase;
  part.cost = part.base_cost;
  part.ecost = part.base_ecost;
}

function applyMultipliersToPart(part, game, levels, m) {
  applyBaseCellStats(part, levels, m);
  applyContainmentVent(part, levels, m);
  applyTransferPlating(part, game, m);
  applyRangeWithTunneling(part, levels);
  applyEpHeatWithFallback(part, game, m);
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
  if (part.category !== "cell" || game.reactor.heat_power_multiplier <= 0 || game.reactor.current_heat <= 0) return;
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

function recalculatePartStats(part) {
  const game = part.game;
  const levels = gatherUpgradeLevels(game);
  const tickMultiplier = computeTickMultiplier(part, game, levels);
  const powerMultiplier = computePowerMultiplier(part, game, levels);
  const { capacitorPowerMultiplier, capacitorContainmentMultiplier } = computeCapacitorMultipliers(part, levels);
  const { transferMultiplier, heatExchangerContainmentMultiplier } =
    computeTransferExchangerMultipliers(part, levels);
  const { ventMultiplier, ventContainmentMultiplier } = computeVentMultipliers(part, levels);
  const { coolantContainmentMultiplier, reflectorPowerIncreaseMultiplier } =
    computeCoolantReflectorMultipliers(part, levels);
  const epHeatMultiplier = computeEpHeatMultiplier(part, game);
  const epHeatScale = computeEpHeatScale(part, game);
  const m = {
    tickMultiplier, powerMultiplier, capacitorPowerMultiplier, capacitorContainmentMultiplier,
    transferMultiplier, heatExchangerContainmentMultiplier, ventMultiplier, ventContainmentMultiplier,
    coolantContainmentMultiplier, reflectorPowerIncreaseMultiplier, epHeatMultiplier, epHeatScale,
  };
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

function pctFromMultiplier(mult) {
  return Math.round((mult - 1) * PCT_BASE);
}

function addVentBonusLines(obj, upg, lines, context) {
  const tile = context?.tile;
  const tev = upg("improved_heat_vents");
  if (tev > 0) {
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> venting`);
    lines.push(`<span class="pos">+${tev * PCT_BASE}%</span> max heat`);
  }
  const fh = upg("fluid_hyperdynamics");
  if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> venting`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
  const av = upg("active_venting");
  if (av > 0 && tile?.containmentNeighborTiles) {
    let capCount = 0;
    for (const neighbor of tile.containmentNeighborTiles) {
      if (neighbor.part && neighbor.part.category === "capacitor") {
        capCount += neighbor.part.part?.level || neighbor.part.level || 1;
      }
    }
    if (capCount > 0) {
      const pct = av * capCount;
      lines.push(`<span class="pos">+${pct}%</span> venting from ${capCount} capacitor neighbors`);
    }
  }
}

function addHeatExchangerBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
  const fh = upg("fluid_hyperdynamics");
  if (fh > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fh))}%</span> transfer`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
}

function addInletOutletBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
  const fp = upg("fractal_piping");
  if (fp > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, fp))}%</span> max heat`);
}

function addCapacitorBonusLines(obj, upg, lines) {
  const iw = upg("improved_wiring");
  if (iw > 0) lines.push(`<span class="pos">+${iw * PCT_BASE}%</span> power capacity, <span class="pos">+${iw * PCT_BASE}%</span> max heat`);
  const qb = upg("quantum_buffering");
  if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> power capacity and max heat`);
}

function addCoolantCellBonusLines(obj, upg, lines) {
  const icc = upg("improved_coolant_cells");
  if (icc > 0) lines.push(`<span class="pos">+${icc * PCT_BASE}%</span> max heat`);
  const uc = upg("ultracryonics");
  if (uc > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, uc))}%</span> max heat`);
}

function addReflectorBonusLines(obj, upg, lines) {
  const ird = upg("improved_reflector_density");
  if (ird > 0) lines.push(`<span class="pos">+${ird * PCT_BASE}%</span> duration`);
  const inr = upg("improved_neutron_reflection");
  if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> power reflection`);
  const fsr = upg("full_spectrum_reflectors");
  if (fsr > 0) lines.push(`<span class="pos">+${fsr * PCT_BASE}%</span> base power reflection`);
}

function addReactorPlatingBonusLines(obj, upg, lines) {
  const ia = upg("improved_alloys");
  if (ia > 0) lines.push(`<span class="pos">+${ia * PCT_BASE}%</span> reactor max heat`);
  const qb = upg("quantum_buffering");
  if (qb > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, qb))}%</span> reactor max heat`);
}

function addParticleAcceleratorBonusLines(obj, upg, lines) {
  const lvl = obj.level || 1;
  const id = lvl === 6 ? "improved_particle_accelerators6" : "improved_particle_accelerators1";
  const ipa = upg(id);
  if (ipa > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, ipa))}%</span> EP heat cap`);
}

function addCellBonusLines(obj, upg, lines, context) {
  const game = context?.game;
  if (!game?.upgradeset) return;
  const powerUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_power`);
  if (powerUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, powerUpg.level))}%</span> power`);
  const tickUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_tick`);
  if (tickUpg?.level > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, tickUpg.level))}%</span> duration`);
  const perpUpg = game.upgradeset.getUpgrade(`${obj.type}1_cell_perpetual`);
  if (perpUpg?.level > 0) lines.push("Auto-replacement enabled");
  const infused = upg("infused_cells");
  if (infused > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, infused))}%</span> power`);
  const unleashed = upg("unleashed_cells");
  if (unleashed > 0) lines.push(`<span class="pos">+${pctFromMultiplier(Math.pow(2, unleashed))}%</span> power and heat`);
  if (obj.type === "protium") {
    const unstable = upg("unstable_protium");
    if (unstable > 0) {
      const durPct = Math.round((1 - 1 / Math.pow(2, unstable)) * 100);
      const totalPct = (Math.pow(2, unstable) - 1) * 100;
      lines.push(`<span class="pos">+${totalPct}%</span> power and heat, <span class="neg">-${durPct}%</span> duration`);
    }
  }
}

const CATEGORY_BONUS_HANDLERS = {
  vent: addVentBonusLines,
  heat_exchanger: addHeatExchangerBonusLines,
  heat_inlet: addInletOutletBonusLines,
  heat_outlet: addInletOutletBonusLines,
  capacitor: addCapacitorBonusLines,
  coolant_cell: addCoolantCellBonusLines,
  reflector: addReflectorBonusLines,
  reactor_plating: addReactorPlatingBonusLines,
  particle_accelerator: addParticleAcceleratorBonusLines,
  cell: addCellBonusLines,
};

export function getUpgradeBonusLines(obj, context = {}) {
  const lines = [];
  if (!obj || obj.upgrade) return lines;
  const game = context.game ?? obj.game;
  if (!game?.upgradeset) return lines;
  const upg = (id) => game.upgradeset.getUpgrade(id)?.level || 0;
  const handler = CATEGORY_BONUS_HANDLERS[obj.category];
  if (handler) handler(obj, upg, lines, context);
  return lines;
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

        let priceDiv = this.$el.querySelector(".part-price");
        if (!priceDiv) {
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
      if (this.category === 'reflector') return this.base_cost.mul(BALANCE.reflectorSellMultiplier);
      if (this.category === 'capacitor') return this.base_cost.mul(10);
      if (this.category === 'cell') return this.base_cost.mul(BALANCE.cellSellMultiplier);
    }
    return this.base_cost;
  }
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

    const { parts } = await dataService.ensureAllGameDataLoaded();

    logger.log('info', 'game', 'Loading part list data...');
    logger.log('debug', 'game', 'Part list data loaded:', {
      count: parts.length,
      categories: [...new Set(parts.map((p) => p.category))]
    });

    parts.forEach((template) => {
      if (template.category && !template.experimental) {
        const arr = this.categoryTypeOrder.get(template.category) || [];
        if (!arr.includes(template.type)) {
          arr.push(template.type);
          this.categoryTypeOrder.set(template.category, arr);
          this.typeOrderIndex.set(`${template.category}:${template.type}`, arr.length - 1);
        }
      }
      if (template.levels) {
        for (let i = 0; i < template.levels; i++) {
          const level = i + 1;
          const partDef = this.generatePartDefinition(template, level);
          const partInstance = new Part(partDef, this.game);
          this.parts.set(partInstance.id, partInstance);
          this.partsArray.push(partInstance);
        }
      } else {
        const partDef = this.generatePartDefinition(template, template.level);
        const partInstance = new Part(partDef, this.game);
        this.parts.set(partInstance.id, partInstance);
        this.partsArray.push(partInstance);
      }
    });

    this.initialized = true;
    return this.partsArray;
  }


  generatePartDefinition(template, level) {
    const partDef = { ...template, level };

    if (template.levels) {
      partDef.id = `${template.type}${level}`;
    } else {
      if (template.id) {
        partDef.id = template.id;
      } else {
        partDef.id = `${template.type}${level}`;
      }
    }

    if (template.levels) {
      partDef.base_cost = template.base_cost.mul(Math.pow(template.cost_multi, level - 1));
    } else {
      partDef.base_cost = template.base_cost;
    }

    if (partDef.category === "cell") {
      this._applyCellProperties(partDef, template, level);
      return partDef;
    }
    this._applyGenericPartProperties(partDef, template, level);
    return partDef;
  }


  _applyCellProperties(partDef, template, level) {
    partDef.title = `${CELL_TITLE_PREFIXES[level - 1] || ""}${template.title}`;
    partDef.base_description = template.base_description || (level > 1 ? MULTI_CELL_DESC_TPL : SINGLE_CELL_DESC_TPL);
    partDef.base_power = template.base_power * (CELL_POWER_MULTIPLIERS[level - 1] || 1);
    partDef.base_heat = template.base_heat * (CELL_HEAT_MULTIPLIERS[level - 1] || 1);
    partDef.cell_count = CELL_COUNTS[level - 1] || 1;
  }


  _applyGenericPartProperties(partDef, template, level) {
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
      if (game.isSandbox) {
        part.setAffordable(true);
        return;
      }
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


export class BlueprintService {
  constructor(game) {
    this.game = game;
  }

  serialize() {
    return serializeReactor(this.game);
  }

  deserialize(str) {
    return deserializeReactor(str);
  }

  getCostBreakdown(layout) {
    return calculateLayoutCostBreakdown(this.game?.partset, layout);
  }

  getTotalCost(layout) {
    return calculateLayoutCost(this.game?.partset, layout);
  }

  getPartSummary(layout) {
    return buildPartSummary(this.game?.partset, layout);
  }

  getAffordableSet(affordableLayout) {
    return buildAffordableSet(affordableLayout);
  }

  filterByTypes(layout, checkedTypes) {
    return filterLayoutByCheckedTypes(layout, checkedTypes);
  }

  clipToGrid(layout, rows, cols) {
    return clipToGridFn(layout, rows ?? this.game.rows, cols ?? this.game.cols);
  }

  getCurrentSellValue() {
    return calculateCurrentSellValue(this.game?.tileset);
  }

  buildAffordableLayout(filteredLayout, sellCredit) {
    return buildAffordableLayoutFn(filteredLayout, sellCredit, this.game.rows, this.game.cols, this.game);
  }

  buildPasteState(layout, checkedTypes, sellCheckboxChecked) {
    return buildPasteStateFn(layout, checkedTypes, this.game, this.game?.tileset, sellCheckboxChecked);
  }

  validateResources(breakdown, sellCredit) {
    return validatePasteResources(
      breakdown,
      sellCredit,
      this.game.state.current_money,
      this.game.state.current_exotic_particles ?? 0
    );
  }

  renderPreview(layout, canvasEl, affordableSet) {
    return renderLayoutPreview(this.game?.partset, layout, canvasEl, affordableSet);
  }

  applyLayout(layout, skipCostDeduction = false) {
    const clipped = this.clipToGrid(layout);
    this.game.tileset.tiles_list.forEach(tile => {
      if (tile.enabled && tile.part) tile.clearPart();
    });

    clipped.flatMap((row, r) => (row || []).map((cell, c) => (cell?.id ? { r, c, cell } : null)).filter(Boolean))
      .forEach(({ r, c, cell }) => {
        const part = this.game.partset.getPartById(cell.id);
        if (part) {
          const tile = this.game.tileset.getTile(r, c);
          if (tile?.enabled) tile.setPart(part);
        }
      });

    if (!skipCostDeduction && !this.game.isSandbox) {
      const { money: costMoney, ep: costEp } = getCostBreakdown(clipped, this.game.partset);
      if (costMoney > 0 && this.game.state.current_money) {
        updateDecimal(this.game.state, "current_money", (d) => d.sub(costMoney));
      }
      if (costEp > 0 && this.game.state.current_exotic_particles) {
        updateDecimal(this.game.state, "current_exotic_particles", (d) => d.sub(costEp));
      }
    }
    return clipped;
  }
}
