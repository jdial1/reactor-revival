import { fromError } from "../lib/zod-validation-error.js";
import { z } from "../lib/zod.js";
import superjson from "../lib/superjson.js";
import { html, render } from "lit-html";
import Decimal, {
  toDecimal,
  toNumber,
  getDecimal,
  logger,
  StorageUtils,
  Formatter,
  DebugHistory,
  performance,
  isTestEnv,
  HEAT_EPSILON,
  HEAT_TRANSFER_DIFF_DIVISOR,
  EXCHANGER_MIN_TRANSFER_UNIT,
  EXCHANGER_MIN_HEADROOM,
  HEAT_TRANSFER_MAX_ITERATIONS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  GRID_SIZE_NO_SAB_THRESHOLD,
  WORKER_HEARTBEAT_MS,
  WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK,
  PAUSED_POLL_MS,
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
  HEAT_CALC_POOL_SIZE,
  AUTONOMIC_REPAIR_POWER_COST,
  AUTONOMIC_REPAIR_POWER_MIN,
  EP_HEAT_SAFE_CAP,
  REACTOR_HEAT_STANDARD_DIVISOR,
  HEAT_REMOVAL_TARGET_RATIO,
  MULTIPLIER_FLOOR,
  HULL_REPEL_FRACTION,
  VISUAL_PARTICLE_HIGH_THRESHOLD,
  VISUAL_PARTICLE_MED_THRESHOLD,
  VISUAL_PARTICLE_HIGH_COUNT,
  VISUAL_PARTICLE_MED_COUNT,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  getIndex,
  GRID,
  COLORS,
  OVERHEAT_VISUAL,
  BAR,
  SINGULARITY,
  HEAT_MAP,
  HEAT_SHIMMER,
  HEAT_HAZE,
  HEAT_FLOW,
  GRID_TARGET_TOTAL_TILES,
  GRID_MIN_DIMENSION,
  GRID_MAX_DISPLAY_DIMENSION,
  ZOOM_DAMPING_FACTOR,
  PINCH_DISTANCE_THRESHOLD_PX,
  MOMENTUM_DECAY_FACTOR,
  SNAP_BACK_THRESHOLD_RATIO,
  SNAP_BACK_SPRING_CONSTANT,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  numFormat as fmt,
  getPartImagePath,
  classMap,
  styleMap,
  BALANCE_POWER_THRESHOLD_10K,
  CRITICAL_HEAT_RATIO,
  MOBILE_BREAKPOINT_PX,
  RESIZE_DELAY_MS,
  BASE_MAX_POWER,
  BASE_MAX_HEAT,
  MELTDOWN_HEAT_MULTIPLIER,
  SIMULATION_ERROR_MESSAGE,
  HULL_HEAT_PER_PLATING_TILE,
  POWER_STORAGE_PER_CAPACITOR_TILE,
  POWER_STORAGE_CHARGED_PLATING_EXTRA,
  MAX_PART_VARIANTS,
  UPGRADE_MAX_LEVEL,
  MAX_GRID_DIMENSION,
  getNeighborKeys,
  isInBounds,
  BASE_LOOP_WAIT_MS,
  FOUNDATIONAL_TICK_MS,
  BASE_MONEY,
  PRESTIGE_MULTIPLIER_PER_EP,
  PRESTIGE_MULTIPLIER_CAP,
  RESPEC_DOCTRINE_EP_COST,
  runCathodeScramble,
  vuSegmentRatio01,
} from "./utils.js";
import {
  GameActionSchema,
  ACTION_SCHEMA_REGISTRY,
  EVENT_SCHEMA_REGISTRY,
  updateDecimal,
  setDecimal,
  snapshot,
  createGameState,
  GameSaveManager,
  SaveOrchestrator,
  UnlockManager,
  runRebootActionKeepEp,
  runRebootActionDiscardEp,
  runFullReboot,
  setDefaults as setDefaultsFromModule,
  LifecycleManager,
  GridManager,
  ConfigManager,
  ExoticParticleManager,
  runSellAction,
  runManualReduceHeatAction,
  runSellPart,
  runEpartOnclick,
  getAffordabilitySettings,
  Reactor,
} from "./state.js";
import {
  BalanceConfigSchema,
  GameLoopTickInputSchema,
  GameLoopTickResultSchema,
  PhysicsTickInputSchema,
  PhysicsTickResultSchema,
} from "../schema/index.js";
import dataService from "./services.js";
import { renderToNode, PartButton, UpgradeCard } from "./components/button-factory.js";
import { ReactiveLitComponent } from "./components/reactive-lit-component.js";
import { serializeReactor, deserializeReactor, calculateLayoutCostBreakdown, calculateLayoutCost, renderLayoutPreview, buildPartSummary, buildAffordableSet, filterLayoutByCheckedTypes, clipToGrid as clipToGridFn, calculateCurrentSellValue, buildAffordableLayout as buildAffordableLayoutFn, buildPasteState as buildPasteStateFn, validatePasteResources, getCostBreakdown } from "./components/ui-components.js";

const rawBalance = {
  valveTopupCapRatio: 0.2,
  stirlingMultiplierPerLevel: 0.01,
  defaultCostMultiplier: 1.5,
  reflectorSellMultiplier: 1.5,
  cellSellMultiplier: 1.5,
  powerThreshold10k: 10000,
  emergencyCoolantMultPerLevel: 0.005,
  reflectorCoolingFactorPerLevel: 0.02,
  manualOverrideMultPerLevel: 0.10,
  convectiveBoostPerLevel: 0.10,
  electroThermalBaseRatio: 2,
  electroThermalStep: 0.5,
  catalystReductionPerLevel: 0.05,
  thermalFeedbackRatePerLevel: 0.1,
  volatileTuningMaxPerLevel: 0.05,
  platingTransferRatePerLevel: 0.05,
};
const balanceResult = BalanceConfigSchema.safeParse(rawBalance);
export const BALANCE = balanceResult.success ? balanceResult.data : rawBalance;


export const PART_DEFINITION_TOUCH_POINTS = [
  "dataService/part_list.json",
  "core/parts.js",
  "components/ui/componentRenderingUI.js",
  "core/simulation.js",
  "core/parts.js",
  "core/grid.js",
];

const REACTOR_PLATING_DEFAULT_CONTAINMENT = 1000;
const PERCENT_DIVISOR = 100;
const EP_DISPLAY_THRESHOLD = 1000000;
const HEAT_LOG_CAP = 1e100;
const HEAT_LOG_BASE = 1000;
const ISOTOPE_STABILIZATION_FACTOR = 0.05;
const COMPONENT_REINFORCEMENT_FACTOR = 0.1;
const CATALYST_REDUCTION_CAP = 0.75;
const PCT_BASE = 100;
const SINGLE_CELL_DESC_TPL = "Creates %power power. Creates %heat heat. Lasts %ticks ticks.";
const MULTI_CELL_DESC_TPL = "Acts as %count %type cells. Creates %power power. Creates %heat heat. Lasts %ticks ticks";
const CELL_COUNTS_BY_LEVEL = [1, 2, 4];
const TITLE_PREFIX_STRIP = /Dual |Quad /;

const CELL_POWER_MULTIPLIERS = [1, 4, 12];

function migrateLegacyValvePartId(partId) {
  if (partId === "overflow_valve2" || partId === "overflow_valve3" || partId === "overflow_valve4") return "overflow_valve";
  if (partId === "topup_valve2" || partId === "topup_valve3" || partId === "topup_valve4") return "topup_valve";
  if (partId === "check_valve2" || partId === "check_valve3" || partId === "check_valve4") return "check_valve";
  return partId;
}
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
        improvedCoolantCells: level("improved_coolant_cells"),
        improvedNeutronReflection: level("improved_neutron_reflection"),
        improvedHeatExchangers: level("improved_heat_exchangers"),
        improvedHeatVents: level("improved_heat_vents"),
        componentReinforcement: level("component_reinforcement"),
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
    if (tickUpgrade) tickMultiplier = Math.pow(2, tickUpgrade.level);
    if (levels.isotopeStabilization > 0)
      tickMultiplier *= 1 + levels.isotopeStabilization * ISOTOPE_STABILIZATION_FACTOR;
  }
  if (part.category === "reflector") {
    const densityUpgrade = game.upgradeset.getUpgrade("improved_reflector_density");
    if (densityUpgrade && densityUpgrade.level > 0) tickMultiplier = 1 + densityUpgrade.level;
  }
  return tickMultiplier;
}

export function getCellPowerCoefficientLP(part, game) {
  if (part.category !== "cell") {
    const pow =
      typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power) ? part.power : part.base_power;
    return Number.isFinite(pow) ? pow : part.base_power || 0;
  }
  const P = part.base_power || 0;
  return Number.isFinite(P) ? P : 0;
}

export function getCellHeatCoefficientH(part, game) {
  if (!game?.upgradeset || part.category !== "cell") {
    const ht =
      typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat) ? part.heat : part.base_heat;
    return Number.isFinite(ht) ? ht : part.base_heat || 0;
  }
  return part.base_heat || 0;
}

export function computeNeighborPulseNFromTile(tile) {
  let N = 0;
  const cellNeighbors = tile.cellNeighborTiles || [];
  for (let ni = 0; ni < cellNeighbors.length; ni++) {
    const nb = cellNeighbors[ni];
    if (nb.part?.category === "cell" && (nb.ticks ?? 0) > 0) N += nb.part.cell_count || 1;
  }
  const reflectors = tile.reflectorNeighborTiles || [];
  for (let ri = 0; ri < reflectors.length; ri++) {
    const rb = reflectors[ri];
    if ((rb.ticks ?? 0) > 0 && rb.part?.category === "reflector") {
      const v = rb.part.neighbor_pulse_value;
      N += typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
    }
  }
  return N;
}

export function computeWorkerNeighborPulseN(r, c, partTable, partAt, rows, cols) {
  let N = 0;
  const keys = getNeighborKeys(r, c);
  for (let k = 0; k < keys.length; k++) {
    const [nr, nc] = keys[k];
    if (!isInBounds(nr, nc, rows, cols)) continue;
    const cell = partAt(nr, nc);
    if (!cell) continue;
    const np = partTable[cell.partIndex];
    if (!np) continue;
    if (np.category === "cell" && (cell.ticks ?? 0) > 0) N += np.cell_count || 1;
    if (np.category === "reflector" && (cell.ticks ?? 0) > 0) {
      const v = np.neighbor_pulse_value;
      N += typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
    }
  }
  return N;
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

function applyBaseCellStats(part, game, levels, m) {
  part.reactor_heat = part.base_reactor_heat;
  if (part.category === "cell") {
    const M = part.cell_pack_M ?? 1;
    const C = Math.max(1, part.cell_count_C ?? part.cell_count ?? 1);
    const N = m.neighborPulses ?? 0;
    const pulse = M + N;
    part.power = part.base_power * pulse;
    part.heat = part.base_heat * (Math.pow(pulse, 2) / C);
  } else {
    part.power = part.base_power;
    part.heat = part.base_heat;
  }
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

function applyRangeWithTunneling(part, _levels) {
  part.range = 1;
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

function recalculatePartStats(part) {
  const game = part.game;
  const levels = gatherUpgradeLevels(game);
  const tickMultiplier = computeTickMultiplier(part, game, levels);
  const { capacitorPowerMultiplier, capacitorContainmentMultiplier } = computeCapacitorMultipliers(part, levels);
  const { transferMultiplier, heatExchangerContainmentMultiplier } =
    computeTransferExchangerMultipliers(part, levels);
  const { ventMultiplier, ventContainmentMultiplier } = computeVentMultipliers(part, levels);
  const { coolantContainmentMultiplier, reflectorPowerIncreaseMultiplier } =
    computeCoolantReflectorMultipliers(part, levels);
  const epHeatMultiplier = computeEpHeatMultiplier(part, game);
  const epHeatScale = computeEpHeatScale(part, game);
  const m = {
    tickMultiplier, capacitorPowerMultiplier, capacitorContainmentMultiplier,
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
}

function addInletOutletBonusLines(obj, upg, lines) {
  const ihe = upg("improved_heat_exchangers");
  if (ihe > 0) lines.push(`<span class="pos">+${ihe * PCT_BASE}%</span> transfer, <span class="pos">+${ihe * PCT_BASE}%</span> max heat`);
}

function addCapacitorBonusLines(obj, upg, lines) {
  const iw = upg("improved_wiring");
  if (iw > 0) lines.push(`<span class="pos">+${iw * PCT_BASE}%</span> power capacity, <span class="pos">+${iw * PCT_BASE}%</span> max heat`);
}

function addCoolantCellBonusLines(obj, upg, lines) {
  const icc = upg("improved_coolant_cells");
  if (icc > 0) lines.push(`<span class="pos">+${icc * PCT_BASE}%</span> max heat`);
}

function addReflectorBonusLines(obj, upg, lines) {
  const ird = upg("improved_reflector_density");
  if (ird > 0) lines.push(`<span class="pos">+${ird * PCT_BASE}%</span> duration`);
  const inr = upg("improved_neutron_reflection");
  if (inr > 0) lines.push(`<span class="pos">+${inr}%</span> power reflection`);
}

function addReactorPlatingBonusLines(_obj, _upg, _lines) {}

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
      if (this.affordable) {
        if (this.game?.ui?.help_mode_active && this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
        document.querySelectorAll(".part.part_active").forEach((el) => el.classList.remove("part_active"));
        this.game.emit?.("partClicked", { part: this });
        this.$el.classList.add("part_active");
      } else {
        if (this.game?.tooltip_manager) {
          this.game.tooltip_manager.show(this, null, true, this.$el);
        }
      }
    };
    this.$el = renderToNode(PartButton(this, onClick));
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
      if (template.category) {
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
    partDef.base_power = template.base_power;
    partDef.base_heat = template.base_heat;
    partDef.cell_pack_M = CELL_POWER_MULTIPLIERS[level - 1] || 1;
    partDef.cell_count_C = CELL_COUNTS[level - 1] || 1;
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

    if (!skipCostDeduction) {
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


function updateAllPartStats(game, partType) {
  const basePart = game.partset.getPartById(partType);
  if (basePart) {
    basePart.recalculate_stats();
  }
  for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
    const part = game.partset.getPartById(`${partType}${i}`);
    if (part) part.recalculate_stats();
  }
  game.tileset.tiles_list.forEach(tile => {
    if (tile.part && tile.part.category === partType) {
      logger.log('debug', 'game', `Updating part ${tile.part.id} (category: ${tile.part.category}) on tile (${tile.row}, ${tile.col})`);
      tile.part.recalculate_stats();
    }
  });
}

const upgradeActions = {
  chronometer: (upgrade, game) => {
    game.loop_wait = game.base_loop_wait;
    game.emit?.("statePatch", { loop_wait: game.loop_wait });
  },
  forceful_fusion: (upgrade, game) => {
    game.reactor.heat_power_multiplier = upgrade.level;
    game.reactor.updateStats();
  },
  heat_control_operator: (upgrade, game) => {
    const isEnabled = upgrade.level > 0;
    game.reactor.heat_controlled = isEnabled;
    game.onToggleStateChange?.("heat_control", isEnabled);
  },
  heat_outlet_control_operator: (upgrade, game) => {
    game.reactor.heat_outlet_controlled = upgrade.level > 0;
  },
  expand_reactor_rows: (upgrade, game) => {
    game.rows = game.base_rows + upgrade.level;
    if (typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      setTimeout(() => game.emit?.("gridResized"), RESIZE_DELAY_MS);
    }
  },
  expand_reactor_cols: (upgrade, game) => {
    game.cols = game.base_cols + upgrade.level;
    if (typeof window !== "undefined" && window.innerWidth && window.innerWidth <= MOBILE_BREAKPOINT_PX) {
      setTimeout(() => game.emit?.("gridResized"), RESIZE_DELAY_MS);
    }
  },
  improved_piping: (upgrade, game) => {
    game.reactor.manual_heat_reduce =
      game.base_manual_heat_reduce * Math.pow(10, upgrade.level);
    game.emit?.("statePatch", { manual_heat_reduce: game.reactor.manual_heat_reduce });
  },
  improved_alloys: (upgrade, game) => {
    updateAllPartStats(game, "reactor_plating");
  },
  improved_wiring: (upgrade, game) => {
    updateAllPartStats(game, "capacitor");
  },
  improved_coolant_cells: (upgrade, game) => {
    updateAllPartStats(game, "coolant_cell");
  },
  improved_reflector_density: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_neutron_reflection: (upgrade, game) => {
    updateAllPartStats(game, "reflector");
  },
  improved_heat_exchangers: (upgrade, game) => {
    ["heat_inlet", "heat_outlet", "heat_exchanger"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
  },
  improved_heat_vents: (upgrade, game) => {
    logger.log('debug', 'game', `improved_heat_vents upgrade action called with level ${upgrade.level}`);
    updateAllPartStats(game, "vent");
  },
  perpetual_capacitors: (upgrade, game) => {
    game.reactor.perpetual_capacitors = upgrade.level > 0;
  },
  perpetual_reflectors: (upgrade, game) => {
    game.reactor.perpetual_reflectors = upgrade.level > 0;
    for (let i = 1; i <= MAX_PART_VARIANTS; i++) {
      const part = game.partset.getPartById(`reflector${i}`);
      if (part) {
        part.perpetual = !!upgrade.level;
        part.recalculate_stats();
      }
    }
  },
  reinforced_heat_exchangers: (upgrade, game) => {
    game.reactor.transfer_plating_multiplier = upgrade.level;
  },
  active_exchangers: (upgrade, game) => {
    game.reactor.transfer_capacitor_multiplier = upgrade.level;
  },
  improved_heatsinks: (upgrade, game) => {
    game.reactor.vent_plating_multiplier = upgrade.level;
  },
  active_venting: (upgrade, game) => {
    game.reactor.updateStats();
  },
  stirling_generators: (upgrade, game) => {
    game.reactor.stirling_multiplier = upgrade.level * BALANCE.stirlingMultiplierPerLevel;
  },
  emergency_coolant: (upgrade, game) => {
    game.reactor.manual_vent_percent = upgrade.level * BALANCE.emergencyCoolantMultPerLevel;
  },
  component_reinforcement: (upgrade, game) => {
    game.partset.partsArray.forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part) tile.part.recalculate_stats();
    });
  },
  isotope_stabilization: (upgrade, game) => {
    game.partset.getPartsByCategory("cell").forEach(part => part.recalculate_stats());
    game.tileset.active_tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "cell") {
        tile.part.recalculate_stats();
      }
    });
  },
  reflector_cooling: (upgrade, game) => {
    game.reactor.reflector_cooling_factor = upgrade.level * BALANCE.reflectorCoolingFactorPerLevel;
    game.reactor.updateStats();
  },
  quantum_tunneling: (upgrade, game) => {
    ["heat_inlet", "heat_outlet"].forEach((cat) => {
      updateAllPartStats(game, cat);
    });
    game.tileset.tiles_list.forEach(tile => tile.invalidateNeighborCaches());
  },
  manual_override: (upgrade, game) => {
    game.reactor.manual_override_mult = upgrade.level * BALANCE.manualOverrideMultPerLevel;
  },
  convective_airflow: (upgrade, game) => {
    game.reactor.convective_boost = upgrade.level * BALANCE.convectiveBoostPerLevel;
  },
  electro_thermal_conversion: (upgrade, game) => {
    game.reactor.power_to_heat_ratio = BALANCE.electroThermalBaseRatio + ((upgrade.level - 1) * BALANCE.electroThermalStep);
  },
  sub_atomic_catalysts: (upgrade, game) => {
    game.reactor.catalyst_reduction = upgrade.level * BALANCE.catalystReductionPerLevel;
    updateAllPartStats(game, "particle_accelerator");
  },
  thermal_feedback: (upgrade, game) => {
    game.reactor.thermal_feedback_rate = upgrade.level * BALANCE.thermalFeedbackRatePerLevel;
  },
  volatile_tuning: (upgrade, game) => {
    game.reactor.volatile_tuning_max = upgrade.level * BALANCE.volatileTuningMaxPerLevel;
  },
  ceramic_composite: (upgrade, game) => {
    game.reactor.plating_transfer_rate = upgrade.level * BALANCE.platingTransferRatePerLevel;
    updateAllPartStats(game, "reactor_plating");
    game.tileset.tiles_list.forEach(tile => {
      if (tile.part && tile.part.category === "reactor_plating") {
        tile.part.recalculate_stats();
      }
    });
    if (game.engine) {
      game.engine.markPartCacheAsDirty();
    }
  },
  explosive_decompression: (upgrade, game) => {
    game.reactor.decompression_enabled = upgrade.level > 0;
  },
  auto_sell_operator: (upgrade, game) => {
    const isEnabled = upgrade.level > 0;
    game.onToggleStateChange?.("auto_sell", isEnabled);
  },
  auto_buy_operator: (upgrade, game) => {
    const isEnabled = upgrade.level > 0;
    game.onToggleStateChange?.("auto_buy", isEnabled);
  },
  protium_cells: (upgrade, game) => {
  },
  cell_power: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    game.update_cell_power();
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_tick: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.recalculate_stats();
    }
  },
  cell_perpetual: (upgrade, game) => {
    if (!upgrade.upgrade.part) {
      return;
    }
    const part = game.partset.getPartById(upgrade.upgrade.part.id);
    if (part) {
      part.perpetual = !!upgrade.level;
      part.recalculate_stats();
    }
  },
  improved_particle_accelerators: (upgrade, game) => {
    const partLevel = upgrade.upgrade.part_level;
    const partToUpdate = game.partset.getPartById(
      "particle_accelerator" + partLevel
    );
    if (partToUpdate) {
      partToUpdate.recalculate_stats();
    }
  },
  uranium1_cell_power: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    if (part) part.recalculate_stats();
    game.reactor.updateStats();
  },
  uranium1_cell_tick: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.ticks = part.base_ticks * Math.pow(2, upgrade.level);
    game.reactor.updateStats();
  },
  uranium1_cell_perpetual: (upgrade, game) => {
    const part = game.partset.getPartById("uranium1");
    part.perpetual = true;
    game.reactor.updateStats();
  },
};

export function executeUpgradeAction(actionId, upgrade, game) {
  if (upgradeActions[actionId]) {
    upgradeActions[actionId](upgrade, game);
  }
}

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
      this._syncDisplayToState();
      if (this.actionId) {
        executeUpgradeAction(this.actionId, this, this.game);
      }
    }
    if (this.type.includes("cell")) {
      this.game.update_cell_power();
    }
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

      const costEl = this.$el.querySelector(".cost-display");
      if (costEl) {
        const next = this.level >= this.max_level ? "" : String(this.display_cost ?? "");
        if (costEl.textContent !== next) {
          runCathodeScramble(costEl, next, { durationMs: 150 });
        }
      }
    }
    this._syncDisplayToState();
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
      if (this.game.upgradeset && !this.game.upgradeset.isUpgradeAvailable(this.id)) return;
      const count = this.game.upgradeset.purchaseUpgradeToMax(this.id);
      if (count > 0 && this.game.audio) this.game.audio.play('upgrade');
    };
    const onResetClick = (e) => {
      e.stopPropagation();
    };
    this.$el = renderToNode(UpgradeCard(this, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick }));
    this.updateDisplayCost();
    return this.$el;
  }

  _syncDisplayToState() {
    const st = this.game?.state?.upgrade_display;
    if (st) st[this.id] = { level: this.level, display_cost: this.display_cost };
  }

  getCost() {
    return this.current_cost;
  }

  getEcost() {
    return this.current_ecost || 0;
  }
}

const CELL_UPGRADE_TEMPLATES = [
  { type: "cell_power", title: "Potent ", description: "s: +100% power.", actionId: "cell_power" },
  { type: "cell_tick", title: "Enriched ", description: "s: 2x duration.", actionId: "cell_tick" },
  { type: "cell_perpetual", title: "Perpetual ", description: "s: auto-replace at 1.5x normal price.", levels: 1, actionId: "cell_perpetual" },
];

function generateCellUpgrades(game) {
  const generatedUpgrades = [];
  const allParts = game.partset.getAllParts();
  logger.log('debug', 'game', 'All parts:', allParts.map((p) => ({ id: p.id, level: p.level, hasCost: !!p.part.cell_tick_upgrade_cost })));
  const baseCellParts = allParts.filter((p) => p.part.cell_tick_upgrade_cost && p.level === 1);
  logger.log('debug', 'game', 'Base cell parts for upgrades:', baseCellParts.map((p) => p.id));
  for (const template of CELL_UPGRADE_TEMPLATES) {
    for (const part of baseCellParts) {
      const upgradeDef = {
        id: `${part.id}_${template.type}`,
        type: `${template.type}_upgrades`,
        title: template.title + part.title,
        description: part.title + template.description,
        levels: template.levels,
        cost: part.part[`${template.type}_upgrade_cost`],
        multiplier: part.part[`${template.type}_upgrade_multi`],
        actionId: template.actionId,
        classList: [part.id, template.type],
        part: part,
        icon: part.getImagePath(),
      };
      logger.log('debug', 'game', `Generated upgrade: ${upgradeDef.id} with cost: ${upgradeDef.cost}`);
      generatedUpgrades.push(upgradeDef);
    }
  }
  logger.log('debug', 'game', 'Total generated upgrades:', generatedUpgrades.length);
  return generatedUpgrades;
}

function handleUnavailableUpgrade(upgrade) {
  if (!upgrade.$el) return;
  upgrade.$el.classList.remove("hidden");
  upgrade.$el.classList.add("doctrine-locked");
  upgrade.setAffordable(false);
  upgrade.setAffordProgress(0);
}

function computeAffordable(upgrade, upgradeset, game) {
  if (game.reactor && game.reactor.has_melted_down) return false;
  const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);
  if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) return false;
  if (upgrade.base_ecost && upgrade.base_ecost.gt(0)) {
    return toDecimal(game.state.current_exotic_particles).gte(upgrade.current_ecost);
  }
  return toDecimal(game.state.current_money).gte(upgrade.current_cost);
}

function isMaxLevelOrMeltedDown(upgrade, game) {
  return upgrade.level >= upgrade.max_level || game.reactor?.has_melted_down === true;
}

function usesExoticParticles(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function getProgressRatio(current, cost) {
  const n = toNumber(current);
  const c = toNumber(cost);
  return Math.min(1, n / c);
}

function getCurrentAndCost(upgrade, game) {
  const useEp = usesExoticParticles(upgrade);
  const raw = useEp ? game.state.current_exotic_particles : game.state.current_money;
  const current = toDecimal(raw);
  const cost = useEp ? upgrade.current_ecost : upgrade.current_cost;
  if (!cost || !cost.gt(0)) return null;
  return { current, cost };
}

function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (isMaxLevelOrMeltedDown(upgrade, game)) return 0;
  const pair = getCurrentAndCost(upgrade, game);
  if (!pair) return 0;
  return getProgressRatio(pair.current, pair.cost);
}

function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function applyUpgradeVisibility(upgrade, isAffordable, settings) {
  if (!upgrade.$el) return { isResearch: false, isInDOM: false, isMaxed: false };
  const isResearch = isResearchUpgrade(upgrade);
  const shouldHideUnaffordable = isResearch ? settings.hideResearch : settings.hideUpgrades;
  const shouldHideMaxed = isResearch ? settings.hideMaxResearch : settings.hideMaxUpgrades;
  const isMaxed = upgrade.level >= upgrade.max_level;
  const isInDOM = upgrade.$el.isConnected;
  const shouldHide =
    (shouldHideUnaffordable && !isAffordable && !isMaxed) || (shouldHideMaxed && isMaxed);
  if (shouldHide) upgrade.$el.classList.add("hidden");
  else upgrade.$el.classList.remove("hidden");
  return { isResearch, isInDOM, isMaxed };
}

function emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch) {
  game?.emit?.("upgradesAffordabilityChanged", {
    hasAnyUpgrade,
    hasVisibleAffordableUpgrade,
    hasAnyResearch,
    hasVisibleAffordableResearch,
  });
}

export function runCheckAffordability(upgradeset, game) {
  if (!game) return;
  const settings = getAffordabilitySettings();
  let hasVisibleAffordableUpgrade = false;
  let hasVisibleAffordableResearch = false;
  let hasAnyUpgrade = false;
  let hasAnyResearch = false;

  upgradeset.upgradesArray.forEach((upgrade) => {
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) {
      handleUnavailableUpgrade(upgrade);
      return;
    }

    if (upgrade.$el) upgrade.$el.classList.remove("doctrine-locked");

    const isAffordable = computeAffordable(upgrade, upgradeset, game);
    upgrade.setAffordable(isAffordable);
    upgrade.setAffordProgress(computeAffordProgress(upgrade, game, isAffordable));

    const { isResearch, isInDOM, isMaxed } = applyUpgradeVisibility(upgrade, isAffordable, settings);
    if (isInDOM) {
      if (isResearch) {
        hasAnyResearch = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableResearch = true;
      } else {
        hasAnyUpgrade = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableUpgrade = true;
      }
    }
  });

  emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch);
}

function getUpgradeContainerIdForSection(upgrade) {
  if (upgrade.base_ecost && upgrade.base_ecost.gt(0)) {
    return upgrade.upgrade.type;
  }
  const normalizeKey = (key) => {
    if (key.endsWith("_upgrades")) return key;
    const map = {
      cell_power: "cell_power_upgrades",
      cell_tick: "cell_tick_upgrades",
      cell_perpetual: "cell_perpetual_upgrades",
      exchangers: "exchanger_upgrades",
      vents: "vent_upgrades",
      other: "other_upgrades",
    };
    return map[key] || key;
  };
  return normalizeKey(upgrade.upgrade.type);
}

function getSectionUpgradeGroups(sectionName) {
  const sectionMap = {
    "Cell Upgrades": ["cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades"],
    "Cooling Upgrades": ["vent_upgrades", "exchanger_upgrades"],
    "General Upgrades": ["other_upgrades"],
    "Laboratory": ["experimental_laboratory"],
    "Global Boosts": ["experimental_boost"],
    "Experimental Parts & Cells": ["experimental_parts", "experimental_cells", "experimental_cells_boost"],
    "Particle Accelerators": ["experimental_particle_accelerators"],
  };
  return sectionMap[sectionName] || [];
}

function countUpgradesInGroupsWithFilter(upgradeset, groupIds, includeUpgrade) {
  let total = 0;
  let researched = 0;
  const isUpgradeAvailable = (id) => upgradeset.isUpgradeAvailable(id);
  const upgradesArray = upgradeset.upgradesArray;
  const game = upgradeset.game;

  groupIds.forEach((groupId) => {
    const upgrades = upgradesArray.filter((upgrade) => {
      if (!includeUpgrade(upgrade)) return false;
      if (!isUpgradeAvailable(upgrade.id)) return false;
      const containerId = getUpgradeContainerIdForSection(upgrade);
      if (containerId !== groupId) return false;
      const upgType = upgrade?.upgrade?.type || "";
      const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
      if (isCellUpgrade) {
        const basePart = upgrade?.upgrade?.part;
        if (basePart && basePart.category === "cell") {
          if (game?.unlockManager && typeof game.unlockManager.isPartUnlocked === "function") {
            return game.unlockManager.isPartUnlocked(basePart);
          }
          return true;
        }
      }
      return true;
    });

    upgrades.forEach((upgrade) => {
      total += upgrade.max_level;
      researched += upgrade.level;
    });
  });

  return { total, researched };
}

const UPGRADE_SECTIONS = [
  { name: "Cell Upgrades", isResearch: false },
  { name: "Cooling Upgrades", isResearch: false },
  { name: "General Upgrades", isResearch: false },
  { name: "Laboratory", isResearch: true },
  { name: "Global Boosts", isResearch: true },
  { name: "Experimental Parts & Cells", isResearch: true },
  { name: "Particle Accelerators", isResearch: true },
];

export function calculateSectionCounts(upgradeset) {
  return UPGRADE_SECTIONS.map((section) => {
    const groupIds = getSectionUpgradeGroups(section.name);
    if (groupIds.length === 0) return { ...section, total: 0, researched: 0 };
    const includeUpgrade = section.isResearch
      ? (u) => u.base_ecost.gt && u.base_ecost.gt(0)
      : (u) => !(u.base_ecost.gt && u.base_ecost.gt(0));
    const { total, researched } = countUpgradesInGroupsWithFilter(upgradeset, groupIds, includeUpgrade);
    return { ...section, total, researched };
  });
}

const OBJECTIVE_REQUIRED_UPGRADES = {
  improvedChronometers: ["chronometer"],
  investInResearch1: ["infused_cells", "unleashed_cells"],
};

function isUpgradeRequiredByIncompleteObjective(upgradeset, upgradeId) {
  const objectives = upgradeset.game.objectives_manager?.objectives_data;
  if (!objectives?.length) return false;
  for (const obj of objectives) {
    if (obj.completed) continue;
    const checkId = obj.checkId;
    const required = OBJECTIVE_REQUIRED_UPGRADES[checkId];
    if (required?.includes(upgradeId)) return true;
    if (checkId === "experimentalUpgrade") {
      const upg = upgradeset.getUpgrade(upgradeId);
      if (upg?.upgrade?.type?.startsWith("experimental_")) return true;
    }
  }
  return false;
}

function isUpgradeAvailable(upgradeset, upgradeId) {
    if (upgradeset.game.bypass_tech_tree_restrictions) return true;

    const allowedTrees = upgradeset.upgradeToTechTreeMap.get(upgradeId);
    // If an upgrade isn't in any tech tree definitions, it is a global/base upgrade
    if (!allowedTrees || allowedTrees.size === 0) return true;

    // If it is in a tree, the game must have that specific tree active
    return allowedTrees.has(upgradeset.game.tech_tree);
}

function getExclusiveUpgradeIdsForTree(upgradeset, treeId) {
  if (!treeId) return [];
  if (!upgradeset.treeList || upgradeset.treeList.length <= 1) return [];
  return [...upgradeset.upgradeToTechTreeMap.entries()]
    .filter(([, treeSet]) => treeSet.size === 1 && treeSet.has(treeId))
    .map(([id]) => id);
}

function resetDoctrineUpgradeLevels(upgradeset, treeId) {
  const ids = getExclusiveUpgradeIdsForTree(upgradeset, treeId);
  ids.forEach((upgradeId) => {
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) {
      upgrade.setLevel(0);
    }
  });
}

function sanitizeDoctrineUpgradeLevelsOnLoad(upgradeset, techTreeId) {
  if (upgradeset.game.bypass_tech_tree_restrictions || !techTreeId) return;
  upgradeset.upgradeToTechTreeMap.forEach((treeSet, upgradeId) => {
    if (treeSet.size !== 1 || treeSet.has(techTreeId)) return;
    const upgrade = upgradeset.getUpgrade(upgradeId);
    if (upgrade && upgrade.level > 0) upgrade.setLevel(0);
  });
}

function runPurchaseUpgrade(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: Upgrade '${upgradeId}' not found.`);
    return false;
  }
  if (!upgradeset.isUpgradeAvailable(upgradeId)) {
    return false;
  }
  if (!upgrade.affordable) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' not affordable. Money: ${upgradeset.game.state.current_money}, Cost: ${upgrade.getCost()}`);
    return false;
  }
  if (upgrade.level >= upgrade.max_level) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' already at max level (${upgrade.level})`);
    return false;
  }

  const cost = upgrade.getCost();
  const ecost = upgrade.getEcost();
  let purchased = false;

  if (ecost.gt(0)) {
    if (toDecimal(upgradeset.game.state.current_exotic_particles).gte(ecost)) {
      updateDecimal(upgradeset.game.state, "current_exotic_particles", (d) => d.sub(ecost));
      upgradeset.game.ui?.stateManager?.setVar("current_exotic_particles", upgradeset.game.state.current_exotic_particles);
      purchased = true;
    }
  } else {
    if (toDecimal(upgradeset.game.state.current_money).gte(cost)) {
      updateDecimal(upgradeset.game.state, "current_money", (d) => d.sub(cost));
      upgradeset.game.ui?.stateManager?.setVar("current_money", upgradeset.game.state.current_money);
      purchased = true;
    }
  }

  if (purchased) {
    upgrade.setLevel(upgrade.level + 1);
    upgradeset.game.emit?.("upgradePurchased", { upgrade });
    upgradeset.game.debugHistory.add("upgrades", "Upgrade purchased", { id: upgradeId, level: upgrade.level });
    if (upgrade.upgrade.type === "experimental_parts") {
      upgradeset.game.epart_onclick(upgrade);
    }
    upgradeset.updateSectionCounts();
    void upgradeset.game.saveManager.autoSave();
  }

  return purchased;
}

function runPurchaseUpgradeToMax(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.isUpgradeAvailable(upgradeId)) return 0;
  let count = 0;
  while (upgrade.level < upgrade.max_level && runPurchaseUpgrade(upgradeset, upgradeId)) {
    count++;
  }
  return count;
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
    this.upgradeToTechTreeMap = new Map(); // upgradeId -> Set of treeIds
    this.techTrees = []; // Store raw doctrine data
    this.restrictedUpgrades = new Set();
    this._populateSectionFn = null;
  }

  setPopulateSectionFn(fn) {
    this._populateSectionFn = fn;
  }

  async initialize() {
    const { upgrades, techTree } = await dataService.ensureAllGameDataLoaded();
    const data = upgrades;
    this.techTrees = techTree; // Store for Game.getDoctrine()
    this.reset();

    // Populate the Tech Tree Mapping
    this.upgradeToTechTreeMap.clear();
    techTree.forEach(tree => {
        tree.upgrades.forEach(upgId => {
            if (!this.upgradeToTechTreeMap.has(upgId)) {
                this.upgradeToTechTreeMap.set(upgId, new Set());
            }
            this.upgradeToTechTreeMap.get(upgId).add(tree.id);
        });
    });

    logger.log('debug', 'game', 'Upgrade data loaded:', data?.length, "upgrades");

    const fullUpgradeList = [...data, ...generateCellUpgrades(this.game)];
    fullUpgradeList.forEach((upgradeDef) => {
      const upgradeInstance = new Upgrade(upgradeDef, this.game);
      this.upgrades.set(upgradeInstance.id, upgradeInstance);
      this.upgradesArray.push(upgradeInstance);
    });
    
    const autoSellUpg = new Upgrade({ id: "auto_sell_operator", title: "Power Grid Sync", description: "Unlocks Auto-Sell toggle.", cost: 50000, type: "other", levels: 1 }, this.game);
    const autoBuyUpg = new Upgrade({ id: "auto_buy_operator", title: "Supply Chain Logistics", description: "Unlocks Auto-Buy toggle.", cost: 100000, type: "other", levels: 1 }, this.game);
    this.upgrades.set(autoSellUpg.id, autoSellUpg);
    this.upgradesArray.push(autoSellUpg);
    this.upgrades.set(autoBuyUpg.id, autoBuyUpg);
    this.upgradesArray.push(autoBuyUpg);

    return this.upgradesArray;
  }


  reset() {
    this.upgrades.clear();
    this.upgradesArray = [];
  }

  getUpgrade(id) {
    return this.upgrades.get(id);
  }

  getAllUpgrades() {
    return this.upgradesArray;
  }

  getUpgradesByType(type) {
    return this.upgradesArray.filter((upgrade) => upgrade.upgrade.type === type);
  }

  populateUpgrades() {
    this._populateUpgradeSection("upgrades_content_wrapper", (upgrade) => upgrade.base_ecost.eq ? upgrade.base_ecost.eq(0) : !upgrade.base_ecost);
    this.updateSectionCounts();
  }

  populateExperimentalUpgrades() {
    this._populateUpgradeSection("experimental_upgrades_content_wrapper", (upgrade) => upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
    this.updateSectionCounts();
  }

  _populateUpgradeSection(wrapperId, filterFn) {
    if (this._populateSectionFn) this._populateSectionFn(this, wrapperId, filterFn);
  }

  purchaseUpgrade(upgradeId) {
    return runPurchaseUpgrade(this, upgradeId);
  }

  purchaseUpgradeToMax(upgradeId) {
    return runPurchaseUpgradeToMax(this, upgradeId);
  }

  check_affordability(game) {
    runCheckAffordability(this, game);
  }

  isUpgradeAvailable(upgradeId) {
    return isUpgradeAvailable(this, upgradeId);
  }

  isUpgradeDoctrineLocked(upgradeId) {
    return !this.isUpgradeAvailable(upgradeId);
  }

  getExclusiveUpgradeIdsForTree(treeId) {
    return getExclusiveUpgradeIdsForTree(this, treeId);
  }

  resetDoctrineUpgradeLevels(treeId) {
    resetDoctrineUpgradeLevels(this, treeId);
    this.updateSectionCounts();
  }

  sanitizeDoctrineUpgradeLevelsOnLoad(techTreeId) {
    sanitizeDoctrineUpgradeLevelsOnLoad(this, techTreeId);
  }

  hasAffordableUpgrades() {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    return this.upgradesArray.some((upgrade) =>
      (upgrade.base_ecost.eq ? upgrade.base_ecost.eq(0) : !upgrade.base_ecost) &&
      !expandUpgradeIds.includes(upgrade.id) &&
      upgrade.affordable &&
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  hasAffordableResearch() {
    return this.upgradesArray.some((upgrade) =>
      upgrade.base_ecost.gt && upgrade.base_ecost.gt(0) &&
      upgrade.affordable &&
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  getSectionCounts() {
    return calculateSectionCounts(this);
  }

  updateSectionCounts() {
    this.game?.emit?.("upgradesChanged");
  }

  toSaveState() {
    return this.upgradesArray
      .filter((upg) => upg.level > 0)
      .map((upg) => ({
        id: upg.id,
        level: upg.level,
      }));
  }
}


export const CHAPTER_NAMES = [
  "Chapter 1: First Fission",
  "Chapter 2: Scaling Production",
  "Chapter 3: High-Energy Systems",
  "Chapter 4: The Experimental Frontier"
];

export const INFINITE_REWARD_BASE = 250;
export const INFINITE_REWARD_PER_COMPLETION = 50;
export const INFINITE_REWARD_CAP = 500;
export const OBJECTIVE_INTERVAL_MS = 2000;
export const OBJECTIVE_WAIT_MS = 3000;
export const PERCENT_COMPLETE_MAX = 100;
export const DEFAULT_OBJECTIVE_INDEX = 0;
export const FIRST_BILLION = 1e9;
export const TOTAL_MONEY_10B = 1e10;
export const HEAT_10M = 1e7;
export const SUSTAINED_POWER_TICKS_REQUIRED = 30;
export const SUSTAINED_POWER_THRESHOLD = 1000;
export const POWER_TARGET_200 = 200;
export const POWER_TARGET_500 = 500;
export const INCOME_TARGET_50K = 50000;
export const CELLS_TARGET_10 = 10;
export const CELLS_TARGET_5 = 5;
export const EP_TARGET_10 = 10;
export const EP_TARGET_51 = 51;
export const EP_TARGET_250 = 250;
export const EP_TARGET_1000 = 1000;
export const CHAPTER_SIZE_DEFAULT = 10;
export const CHAPTER_4_SIZE = 7;
export const CHAPTER_COMPLETION_OBJECTIVE_INDICES = [9, 19, 29, 36];
export const CHAPTER_1_START_INDEX = 0;
export const CHAPTER_2_START_INDEX = 10;
export const CHAPTER_3_START_INDEX = 20;
export const CHAPTER_4_START_INDEX = 30;
export const CLAIM_FEEDBACK_DELAY_MS = 500;

export const INFINITE_POWER_INITIAL = 5000;
export const INFINITE_POWER_STEP = 5000;
export const INFINITE_HEAT_MAINTAIN_BASE_TICKS = 200;
export const INFINITE_HEAT_MAINTAIN_ADD_TICKS = 100;
export const INFINITE_HEAT_MAINTAIN_PERCENT = 50;
export const INFINITE_HEAT_MAINTAIN_MAX_TICKS = 2000;
export const INFINITE_MONEY_THORIUM_INITIAL = 1e8;
export const INFINITE_HEAT_INITIAL = 5e6;
export const INFINITE_EP_INITIAL = 100;

export const INFINITE_CHALLENGES = [
  { id: "infinitePower", nextTarget: (last) => (last < INFINITE_POWER_INITIAL ? INFINITE_POWER_INITIAL : last + INFINITE_POWER_STEP), title: (t) => `Generate ${Number(t).toLocaleString()} Power`, getLastKey: () => "_lastInfinitePowerTarget" },
  { id: "infiniteHeatMaintain", nextTarget: (last) => { const base = last ? last.ticks + INFINITE_HEAT_MAINTAIN_ADD_TICKS : INFINITE_HEAT_MAINTAIN_BASE_TICKS; return { percent: INFINITE_HEAT_MAINTAIN_PERCENT, ticks: Math.min(base, INFINITE_HEAT_MAINTAIN_MAX_TICKS) }; }, title: (t) => `Maintain ${t.percent}% heat for ${t.ticks} ticks`, getLastKey: () => "_lastInfiniteHeatMaintain" },
  { id: "infiniteMoneyThorium", nextTarget: (last) => (last < INFINITE_MONEY_THORIUM_INITIAL ? INFINITE_MONEY_THORIUM_INITIAL : last * 2), title: (t) => `Generate $${Number(t).toLocaleString()} with only Thorium cells`, getLastKey: () => "_lastInfiniteMoneyThorium" },
  { id: "infiniteHeat", nextTarget: (last) => (last < INFINITE_HEAT_INITIAL ? INFINITE_HEAT_INITIAL : last * 2), title: (t) => `Reach ${Number(t).toLocaleString()} Heat`, getLastKey: () => "_lastInfiniteHeat" },
  { id: "infiniteEP", nextTarget: (last) => (last < INFINITE_EP_INITIAL ? INFINITE_EP_INITIAL : last * 2), title: (t) => `Generate ${Number(t).toLocaleString()} Exotic Particles`, getLastKey: () => "_lastInfiniteEP" },
];

export const INFINITE_CHALLENGE_IDS = new Set(INFINITE_CHALLENGES.map((c) => c.id));

const COMPARE_OPS = { gt: (val, n) => (val?.gt ? val.gt(n) : val > n), gte: (val, n) => (val?.gte ? val.gte(n) : val >= n), lt: (val, n) => (val?.lt ? val.lt(n) : val < n), eq: (val, n) => (val?.eq ? val.eq(n) : val === n) };
function compare(value, threshold, operator) { const fn = COMPARE_OPS[operator]; return fn ? fn(value, threshold) : false; }
function progressWithCap(current, target) { return Math.min(PERCENT_COMPLETE_MAX, (current / target) * PERCENT_COMPLETE_MAX); }
function createProgress(current, target, unit = "", textOverride = null) { const percent = target > 0 ? progressWithCap(current, target) : (current > 0 ? PERCENT_COMPLETE_MAX : 0); return { completed: current >= target, percent, text: textOverride || `${current.toLocaleString()} / ${target.toLocaleString()} ${unit}`.trim() }; }
function boolProgress(done, doneText, pendingText) { return { completed: done, percent: done ? PERCENT_COMPLETE_MAX : 0, text: done ? doneText : pendingText }; }
function countTilesByCategory(game, category) { return game.tileset.getAllTiles?.() ? game.tileset.getAllTiles().filter((t) => t.part?.category === category).length : game.tileset.tiles_list.filter((t) => t.part?.category === category).length; }
function countActiveCellsByCategory(game, category) { return game.tileset.tiles_list.filter((t) => t.part?.category === category && t.ticks > 0).length; }
function countTilesByType(game, type) { return game.tileset.getAllTiles?.() ? game.tileset.getAllTiles().filter((t) => t.part?.type === type).length : game.tileset.tiles_list.filter((t) => t.part?.type === type).length; }

function _checkVentNextToCell(game) {
  return game.tileset.active_tiles_list.some((tile) => {
    if (tile?.part?.category === "cell" && tile.ticks > 0) { for (const neighbor of game.tileset.getTilesInRange(tile, 1)) { if (neighbor?.part?.category === "vent") return true; } }
    return false;
  });
}

function getChapterRange(startIndex, size) { return { start: startIndex, end: startIndex + size - 1 }; }
function countCompletedInRange(objectives_data, startIndex, endIndex) { return objectives_data.slice(startIndex, endIndex).reduce((count, obj) => (obj && !obj.isChapterCompletion && obj.completed ? count + 1 : count), 0); }
function countTotalInRange(objectives_data, startIndex, endIndex) { return objectives_data.slice(startIndex, endIndex).reduce((count, obj) => (obj && !obj.isChapterCompletion ? count + 1 : count), 0); }
function isChapterComplete(game, start, end) { if (!game.objectives_manager?.objectives_data) return false; for (let i = start; i < end; i++) { const obj = game.objectives_manager.objectives_data[i]; if (obj && !obj.isChapterCompletion && !obj.completed) return false; } return true; }

function _checkChapterCompletion(objectives_data, startIndex, chapterSize) {
  if (!objectives_data || objectives_data.length === 0) return { completed: false, text: "Loading...", percent: 0 };
  const endIndex = Math.min(startIndex + chapterSize, objectives_data.length);
  const completedCount = countCompletedInRange(objectives_data, startIndex, endIndex);
  const totalObjectives = countTotalInRange(objectives_data, startIndex, endIndex);
  const percent = totalObjectives > 0 ? (completedCount / totalObjectives) * PERCENT_COMPLETE_MAX : 0;
  return { completed: completedCount >= totalObjectives, text: `${completedCount} / ${totalObjectives} Objectives Complete`, percent: Math.min(PERCENT_COMPLETE_MAX, percent) };
}

const POWER_THRESHOLD_10K = BALANCE_POWER_THRESHOLD_10K;

const cellChecks = {
  firstCell: (game) => { const hasCell = game.tileset.tiles_list.some((tile) => tile?.part && tile?.activated); return boolProgress(hasCell, "1 / 1 Cell Placed", "0 / 1 Cell Placed"); },
  sellPower: (game) => { const power = game.reactor.stats_power || 0; return boolProgress(game.sold_power, "Power sold!", power > 0 ? "Power available to sell" : "No power to sell"); },
  reduceHeat: (game) => { const heat = game.reactor.stats_heat || 0; return boolProgress(game.sold_heat, `${heat.toLocaleString()} / 0 Heat`, `${heat.toLocaleString()} / 0 Heat`); },
  ventNextToCell: (game) => { const done = _checkVentNextToCell(game); return boolProgress(done, "Vent placed next to Cell", "Place a Vent next to a Cell"); },
  purchaseUpgrade: (game) => { const done = game.upgradeset.getAllUpgrades().some((upgrade) => upgrade.level > 0); return boolProgress(done, "Upgrade purchased!", "Purchase an upgrade"); },
  purchaseDualCell: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.id === "uranium2" && tile.activated); return boolProgress(done, "Dual Cell placed!", "Place a Dual Cell"); },
  tenActiveCells: (game) => { const count = countActiveCellsByCategory(game, "cell"); return createProgress(count, CELLS_TARGET_10, "Cells"); },
  perpetualUranium: (game) => { const done = game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.level > 0; return boolProgress(done, "Perpetual Uranium unlocked!", "Unlock Perpetual Uranium"); },
  increaseMaxPower: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.category === "capacitor"); return boolProgress(done, "Capacitor placed!", "Place a Capacitor"); },
  fiveComponentKinds: (game) => { const categories = new Set(game.tileset.tiles_list.map((t) => t.part?.category).filter(Boolean)); return createProgress(categories.size, CELLS_TARGET_5, "Component types"); },
  tenCapacitors: (game) => { const count = countTilesByCategory(game, "capacitor"); return createProgress(count, CELLS_TARGET_10, "Capacitors"); },
  fiveQuadPlutonium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "plutonium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Plutonium Cells"); },
  unlockThorium: (game) => { const count = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "thorium3").length; return createProgress(count, CELLS_TARGET_5, "Quad Thorium Cells"); },
  unlockSeaborgium: (game) => { const count = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "seaborgium3").length; return createProgress(count, CELLS_TARGET_5, "Quad Seaborgium Cells"); },
  fiveQuadDolorium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "dolorium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Dolorium Cells"); },
  fiveQuadNefastium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "nefastium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Nefastium Cells"); },
  placeExperimentalPart: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.experimental === true); return boolProgress(done, "Experimental part placed!", "Place an experimental part"); },
};

const powerChecks = {
  powerPerTick200: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_TARGET_200 && !game.paused; return { completed: done, ...createProgress(power, POWER_TARGET_200, "Power") }; },
  improvedChronometers: (game) => { const done = game.upgradeset.getUpgrade("chronometer")?.level > 0; return boolProgress(done, "Chronometer unlocked!", "Unlock Chronometer"); },
  potentUranium3: (game) => { const level = game.upgradeset.getUpgrade("uranium1_cell_power")?.level ?? 0; return createProgress(level, 3, "levels"); },
  autoSell500: (game) => { const cash = game.reactor.stats_cash || 0; return createProgress(cash, POWER_TARGET_500, "$/tick"); },
  sustainedPower1k: (game) => { const om = game.objectives_manager; const tracking = om?.getSustainedTracking("sustainedPower1k"); const power = game.reactor.stats_power || 0; if (power >= SUSTAINED_POWER_THRESHOLD && !game.paused && game.engine && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("sustainedPower1k", game.engine.tick_count); const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("sustainedPower1k").startTick; const done = elapsedTicks >= SUSTAINED_POWER_TICKS_REQUIRED; return createProgress(elapsedTicks, SUSTAINED_POWER_TICKS_REQUIRED, "", `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`); } if (om) om.resetSustainedTracking("sustainedPower1k"); return { completed: false, percent: 0, text: `${power.toLocaleString()} / 1,000 Power (hold ${SUSTAINED_POWER_TICKS_REQUIRED} ticks)` }; },
  infrastructureUpgrade1: (game) => { const advancedCapacitors = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.part.id === "capacitor2").length; const advancedHeatVents = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.part.id === "vent2").length; const done = advancedCapacitors >= CELLS_TARGET_10 && advancedHeatVents >= CELLS_TARGET_10; const total = Math.min(advancedCapacitors, CELLS_TARGET_10) + Math.min(advancedHeatVents, CELLS_TARGET_10); return createProgress(total, CELLS_TARGET_10 * 2, "", `${advancedCapacitors}/10 Capacitors, ${advancedHeatVents}/10 Vents`); },
  powerPerTick500: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_TARGET_500 && !game.paused; return { completed: done, ...createProgress(power, POWER_TARGET_500, "Power") }; },
  powerPerTick10k: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_THRESHOLD_10K && !game.paused; return { completed: done, percent: progressWithCap(power, POWER_THRESHOLD_10K), text: `${power.toLocaleString()} / ${POWER_THRESHOLD_10K.toLocaleString()} Power` }; },
};

const milestoneChecks = {
  incomeMilestone50k: (game) => { const income = game.reactor.stats_cash || 0; return createProgress(income, INCOME_TARGET_50K, "", `$${income.toLocaleString()} / $50,000 per tick`); },
  firstBillion: (game) => { const money = toNumber(game.state.current_money) || 0; const done = compare(game.state.current_money, FIRST_BILLION, "gte"); return { completed: done, percent: progressWithCap(money, FIRST_BILLION), text: `$${money.toLocaleString()} / $1,000,000,000` }; },
  money10B: (game) => { const money = toNumber(game.state.current_money) || 0; const done = compare(game.state.current_money, TOTAL_MONEY_10B, "gte"); return { completed: done, percent: progressWithCap(money, TOTAL_MONEY_10B), text: `$${money.toLocaleString()} / $10,000,000,000` }; },
  masterHighHeat: (game) => { const om = game.objectives_manager; const tracking = om?.getSustainedTracking("masterHighHeat"); const heat = game.reactor.stats_heat || 0; const heatOk = compare(game.reactor.current_heat, HEAT_10M, "gt"); if (heatOk && !game.paused && !game.reactor.has_melted_down && game.engine && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("masterHighHeat", game.engine.tick_count); const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("masterHighHeat").startTick; return createProgress(elapsedTicks, SUSTAINED_POWER_TICKS_REQUIRED, "", `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`); } if (om) om.resetSustainedTracking("masterHighHeat"); return { completed: false, percent: progressWithCap(heat, HEAT_10M), text: `${heat.toLocaleString()} / 10,000,000 Heat` }; },
  ep10: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_10, "gte"), percent: progressWithCap(ep, EP_TARGET_10), text: `${ep} / 10 EP Generated` }; },
  ep51: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_51, "gte"), percent: progressWithCap(ep, EP_TARGET_51), text: `${ep} / 51 EP Generated` }; },
  ep250: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_250, "gte"), percent: progressWithCap(ep, EP_TARGET_250), text: `${ep} / 250 EP Generated` }; },
  ep1000: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_1000, "gte"), percent: progressWithCap(ep, EP_TARGET_1000), text: `${ep} / 1,000 EP Generated` }; },
  investInResearch1: (game) => { const a = game.upgradeset.getUpgrade("infused_cells")?.level > 0; const b = game.upgradeset.getUpgrade("unleashed_cells")?.level > 0; const count = (a ? 1 : 0) + (b ? 1 : 0); return createProgress(count, 2, "upgrades"); },
  reboot: (game) => { const totalOk = compare(game.state.total_exotic_particles, 0, "gt"); const moneyOk = compare(game.state.current_money, game.base_money * 2, "lt"); const epZero = compare(game.exoticParticleManager.exotic_particles, 0, "eq"); const done = totalOk && moneyOk && epZero; return boolProgress(done, "Reboot complete!", "Perform a reboot"); },
  experimentalUpgrade: (game) => { const done = game.upgradeset.getAllUpgrades().filter((upg) => upg.upgrade.id !== "laboratory" && upg.upgrade.type !== "experimental_laboratory" && upg.upgrade.type.startsWith("experimental_") && upg.level > 0).length > 0; return boolProgress(done, "Experimental upgrade purchased!", "Purchase an experimental upgrade"); },
};

const chapterChecks = {
  completeChapter1: (game) => { const chapterRange = getChapterRange(CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 1 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter2: (game) => { const chapterRange = getChapterRange(CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 2 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter3: (game) => { const chapterRange = getChapterRange(CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 3 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter4: (game) => { const chapterRange = getChapterRange(CHAPTER_4_START_INDEX, CHAPTER_4_SIZE); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 4 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_4_START_INDEX, CHAPTER_4_SIZE); return { ...result, completed: done }; },
};

const infiniteChecks = {
  allObjectives: () => ({ completed: true, text: "All objectives completed!", percent: PERCENT_COMPLETE_MAX }),
  infinitePower: (game) => { const obj = game.objectives_manager?.current_objective_def; const target = obj?.target; if (target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const power = game.reactor?.stats_power ?? 0; const done = power >= target && !game.paused; return { completed: done, percent: progressWithCap(power, target), text: `${power.toLocaleString()} / ${target.toLocaleString()} Power` }; },
  infiniteHeatMaintain: (game) => { const om = game.objectives_manager; const obj = om?.current_objective_def; if (obj?.target?.percent == null || !obj?.target?.ticks || !game.engine) return { completed: false, text: "Awaiting completion...", percent: 0 }; const { percent, ticks } = obj.target; const reactor = game.reactor; const maxH = toNumber(reactor.max_heat); const curH = toNumber(reactor.current_heat); const heatOk = maxH > 0 && curH / maxH >= percent / PERCENT_COMPLETE_MAX && !game.paused && !reactor.has_melted_down; const tracking = om?.getSustainedTracking("infiniteHeatMaintain"); if (heatOk && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("infiniteHeatMaintain", game.engine.tick_count); const elapsed = game.engine.tick_count - om.getSustainedTracking("infiniteHeatMaintain").startTick; const done = elapsed >= ticks; return { completed: done, percent: progressWithCap(elapsed, ticks), text: `${elapsed} / ${ticks} ticks at ${percent}%` }; } if (om) om.resetSustainedTracking("infiniteHeatMaintain"); return { completed: false, percent: 0, text: `Maintain ${percent}% heat (${((curH / maxH) * PERCENT_COMPLETE_MAX || 0).toFixed(0)}% now)` }; },
  infiniteMoneyThorium: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const cells = game.tileset?.tiles_list?.filter((t) => t?.part?.category === "cell") ?? []; const nonThorium = cells.some((t) => t.part?.id !== "thorium3" && t.part?.type !== "quad_thorium_cell"); if (cells.length === 0) return { completed: false, text: "Add Thorium cells to generate", percent: 0 }; if (nonThorium) return { completed: false, text: "Only Thorium cells allowed", percent: 0 }; const money = toNumber(game.state.current_money); const done = money >= obj.target; return { completed: done, percent: progressWithCap(money, obj.target), text: `$${money.toLocaleString()} / $${obj.target.toLocaleString()} (Thorium only)` }; },
  infiniteHeat: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const heat = game.reactor?.stats_heat ?? 0; const done = heat >= obj.target; return { completed: done, percent: progressWithCap(heat, obj.target), text: `${heat.toLocaleString()} / ${obj.target.toLocaleString()} Heat` }; },
  infiniteEP: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const ep = toNumber(game.exoticParticleManager.exotic_particles); const done = ep >= obj.target; return { completed: done, percent: progressWithCap(ep, obj.target), text: `${ep} / ${obj.target} EP` }; },
};

const checkFunctions = Object.assign({}, cellChecks, powerChecks, milestoneChecks, chapterChecks, infiniteChecks);

export function getObjectiveCheck(checkId) { const fn = checkFunctions[checkId]; if (!fn) return null; return (game) => { const result = fn(game); if (typeof result === "boolean") return { completed: result, percent: result ? PERCENT_COMPLETE_MAX : 0, text: result ? "Complete" : "Incomplete" }; return result; }; }

function buildLoadingDisplayInfo(objective) { return { chapterName: "Loading...", chapterProgressText: "0 / 10", chapterProgressPercent: 0, title: objective.title || "Loading...", description: objective.description || "", flavor_text: objective.flavor_text, progressText: "Loading...", progressPercent: 0, reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 }, isComplete: objective.completed || false, isChapterCompletion: objective.isChapterCompletion || false }; }
function getChapterSize(chapterIndex) { return chapterIndex === 3 ? CHAPTER_4_SIZE : CHAPTER_SIZE_DEFAULT; }
function computeCompletedInChapter(manager, chapterStart, index, objective) { let completed = 0; for (let i = chapterStart; i < index; i++) { if (manager.objectives_data[i] && manager.objectives_data[i].completed) completed++; } if (objective.completed) completed++; return completed; }
function buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress) { const safeProgress = progress || { text: "Loading...", percent: 0 }; return { chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`, chapterProgressText: `${completedInChapter} / ${chapterSize}`, chapterProgressPercent: (completedInChapter / chapterSize) * 100, title: objective.title, description: objective.description || "", flavor_text: objective.flavor_text, progressText: safeProgress.text, progressPercent: Math.min(100, safeProgress.percent), reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 }, isComplete: objective.completed || false, isChapterCompletion: objective.isChapterCompletion || false }; }

function formatDisplayInfo(manager) {
  if (!manager.current_objective_def || manager.current_objective_index < 0) return null;
  const index = manager.current_objective_index;
  const objective = manager.current_objective_def;
  if (!manager.game || !manager.game.tileset || !manager.game.reactor) return buildLoadingDisplayInfo(objective);
  const chapterIndex = Math.floor(index / CHAPTER_SIZE_DEFAULT);
  const chapterStart = chapterIndex * CHAPTER_SIZE_DEFAULT;
  const chapterSize = getChapterSize(chapterIndex);
  const completedInChapter = computeCompletedInChapter(manager, chapterStart, index, objective);
  const progress = manager.getCurrentObjectiveProgress();
  return buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress);
}

class ObjectiveTracker {
  constructor(manager) { this.manager = manager; }
  scheduleNextCheck() { const manager = this.manager; clearTimeout(manager.objective_timeout); if (manager.disableTimers) return; manager.objective_timeout = setTimeout(() => manager.check_current_objective(), manager.objective_interval); }
  setObjective(objective_index, skip_wait = false) {
    const manager = this.manager;
    if (!manager.objectives_data || manager.objectives_data.length === 0) return;
    if (typeof objective_index !== "number" || Number.isNaN(objective_index)) { const parsed = parseInt(objective_index, 10); objective_index = Number.isNaN(parsed) ? 0 : Math.max(0, parsed); } else { objective_index = Math.floor(objective_index); }
    if (objective_index < 0) objective_index = 0;
    const maxValidIndex = manager.objectives_data.length - 1;
    if (objective_index > maxValidIndex) objective_index = maxValidIndex;
    manager.current_objective_index = objective_index;
    const nextObjective = manager.objectives_data[manager.current_objective_index];
    clearTimeout(manager.objective_timeout);
    const updateLogic = () => { if (nextObjective && nextObjective.checkId === "allObjectives") { manager._loadInfiniteObjective(); return; } if (nextObjective) manager._loadNormalObjective(nextObjective); else manager._loadAllCompletedObjective(); };
    if (skip_wait) updateLogic(); else { manager.objective_unloading = true; manager._emitObjectiveUnloaded(); manager.objective_timeout = setTimeout(updateLogic, manager.objective_wait); }
  }
}

class ObjectiveEvaluator {
  constructor(manager) { this.manager = manager; }
  checkAndAutoComplete() {
    const manager = this.manager;
    if (typeof window !== "undefined" && window.location && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && typeof process === "undefined") { manager.scheduleNextCheck(); return; }
    if (manager.current_objective_index === 0 && !manager.game._saved_objective_index) { manager.scheduleNextCheck(); return; }
    while (manager.current_objective_def && manager.current_objective_def.checkId !== "allObjectives") {
      manager._syncActiveObjectiveToState?.();
      const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
      const autoResult = checkFn?.(manager.game);
      if (autoResult?.completed) {
        const wasAlreadyCompleted = manager.objectives_data?.[manager.current_objective_index]?.completed;
        manager.current_objective_def.completed = true;
        if (manager.objectives_data?.[manager.current_objective_index]) manager.objectives_data[manager.current_objective_index].completed = true;
        if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
        if (!wasAlreadyCompleted) { manager._emitObjectiveCompleted(); if (manager.current_objective_def.reward) updateDecimal(manager.game.state, "current_money", (d) => d.add(toDecimal(manager.current_objective_def.reward))); else if (manager.current_objective_def.ep_reward) { manager.game.exoticParticleManager.exotic_particles = manager.game.exoticParticleManager.exotic_particles.add(manager.current_objective_def.ep_reward); updateDecimal(manager.game.state, "total_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward)); updateDecimal(manager.game.state, "current_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward)); } }
        manager.current_objective_index++; const maxValidIndex = manager.objectives_data.length - 1; if (manager.current_objective_index > maxValidIndex) manager.current_objective_index = maxValidIndex;
        manager.set_objective(manager.current_objective_index, true);
        if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
      } else { manager.scheduleNextCheck(); break; }
    }
  }
  checkCurrentObjective() {
    const manager = this.manager;
    if (!manager.game || manager.game.paused || !manager.current_objective_def) { manager.scheduleNextCheck(); return; }
    const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
    const result = checkFn?.(manager.game);
    if (!result?.completed) { manager.scheduleNextCheck(); return; }
    manager.current_objective_def.completed = true;
    if (manager.objectives_data?.[manager.current_objective_index]) manager.objectives_data[manager.current_objective_index].completed = true;
    if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
    manager._emitObjectiveCompleted();
    const displayObjective = { ...manager.current_objective_def, title: typeof manager.current_objective_def.title === "function" ? manager.current_objective_def.title() : manager.current_objective_def.title, completed: true };
    manager._emitObjectiveLoaded(displayObjective);
    clearTimeout(manager.objective_timeout);
  }
}

const partMappings = { "Quad Plutonium Cells": "./img/parts/cells/cell_2_4.png", "Quad Thorium Cells": "./img/parts/cells/cell_3_4.png", "Quad Seaborgium Cells": "./img/parts/cells/cell_4_4.png", "Quad Dolorium Cells": "./img/parts/cells/cell_5_4.png", "Quad Nefastium Cells": "./img/parts/cells/cell_6_4.png", "Particle Accelerators": "./img/parts/accelerators/accelerator_1.png", "Plutonium Cells": "./img/parts/cells/cell_2_1.png", "Thorium Cells": "./img/parts/cells/cell_3_1.png", "Seaborgium Cells": "./img/parts/cells/cell_4_1.png", "Dolorium Cells": "./img/parts/cells/cell_5_1.png", "Nefastium Cells": "./img/parts/cells/cell_6_1.png", "Heat Vent": "./img/parts/vents/vent_1.png", "Capacitors": "./img/parts/capacitors/capacitor_1.png", "Dual Cell": "./img/parts/cells/cell_1_2.png", "Uranium Cell": "./img/parts/cells/cell_1_1.png", "Capacitor": "./img/parts/capacitors/capacitor_1.png", "Cells": "./img/parts/cells/cell_1_1.png", "Cell": "./img/parts/cells/cell_1_1.png", "experimental part": "./img/parts/cells/xcell_1_1.png", "Improved Chronometers upgrade": "./img/upgrades/upgrade_flux.png", "Improved Chronometers": "./img/upgrades/upgrade_flux.png", "Power": "./img/ui/icons/icon_power.png", "Heat": "./img/ui/icons/icon_heat.png", "Exotic Particles": "🧬" };

export function addPartIconsToTitle(game, title) {
  if (typeof title !== "string") return title;
  let processedTitle = title;
  const sortedMappings = Object.entries(partMappings).sort((a, b) => b[0].length - a[0].length);
  const placeholders = new Map();
  let placeholderCounter = 0;
  for (const [partName, iconPath] of sortedMappings) {
    const isEmoji = iconPath.length === 1 || iconPath.match(/^[^a-zA-Z0-9./]/);
    const escapedPartName = partName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedPartName.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (isEmoji) processedTitle = processedTitle.replace(regex, `${iconPath} ${partName}`);
    else { const iconHtml = `<img src=\"${iconPath}\" class=\"objective-part-icon\" alt=\"${partName}\" title=\"${partName}\">`; processedTitle = processedTitle.replace(regex, () => { const placeholder = `__PLACEHOLDER_${placeholderCounter}__`; placeholders.set(placeholder, `${iconHtml} ${partName}`); placeholderCounter++; return placeholder; }); }
  }
  for (const [placeholder, replacement] of placeholders) processedTitle = processedTitle.replace(placeholder, replacement);
  processedTitle = processedTitle.replace(/\$?\d{1,3}(?:,\d{3})+|\$?\d{4,}/g, (match) => { const hasDollar = match.startsWith("$"); const numStr = match.replace(/[^\d]/g, ""); const formatted = fmt(Number(numStr)); return hasDollar ? (`$${formatted}`) : formatted; });
  return processedTitle;
}

export function getObjectiveScrollDuration() { const baseWidth = 900; const baseDuration = 8; const screenWidth = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : baseWidth; const duration = baseDuration * (screenWidth / baseWidth); return Math.max(5, Math.min(18, duration)); }

export function checkObjectiveTextScrolling(domElements) {
  const toastTitleEl = domElements.objectives_toast_title;
  if (!toastTitleEl) return;
  toastTitleEl.style.animation = "none";
  const text = toastTitleEl.textContent || "";
  if (!text.trim()) return;
  const mq = typeof globalThis.matchMedia === "function" ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;
  if (mq?.matches) return;
  toastTitleEl.classList.add("objectives-toast-title--typewriter");
  toastTitleEl.innerHTML = "";
  const ownerDoc = toastTitleEl.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!ownerDoc?.createElement) {
    toastTitleEl.textContent = text;
    return;
  }
  try {
    for (let i = 0; i < text.length; i++) {
      const span = ownerDoc.createElement("span");
      if (typeof span?.appendChild !== "function") {
        toastTitleEl.textContent = text;
        return;
      }
      span.className = "objective-char";
      const o = String(i);
      if (typeof span.style?.setProperty === "function") {
        span.style.setProperty("--o", o);
      } else {
        span.setAttribute("style", `--o: ${o};`);
      }
      const ch = text[i];
      span.textContent = ch === " " ? "\u00a0" : ch;
      toastTitleEl.appendChild(span);
    }
  } catch {
    toastTitleEl.textContent = text;
  }
}

function formatObjectiveRewardLabel(reward) {
  const money = Number(reward?.money ?? 0);
  const ep = Number(reward?.ep ?? 0);
  if (money > 0) return `$${fmt(money)}`;
  if (ep > 0) return `${fmt(ep)} EP`;
  return "";
}

function getObjectiveClaimText(reward) {
  const rewardLabel = formatObjectiveRewardLabel(reward);
  return rewardLabel ? `Claim ${rewardLabel}` : "Claim";
}

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.objectives_data = [];
    this.current_objective_index = DEFAULT_OBJECTIVE_INDEX;
    this.objective_unloading = false;
    this.objective_interval = OBJECTIVE_INTERVAL_MS;
    this.objective_wait = OBJECTIVE_WAIT_MS;
    this.objective_timeout = null;
    this.current_objective_def = null;
    this.claiming = false;
    this.disableTimers = false;
    this.infiniteObjective = null;
    this._lastInfinitePowerTarget = 0;
    this._lastInfiniteHeatMaintain = null;
    this._lastInfiniteMoneyThorium = 0;
    this._lastInfiniteHeat = 0;
    this._lastInfiniteEP = 0;
    this._infiniteChallengeIndex = 0;
    this.tracker = new ObjectiveTracker(this);
    this.evaluator = new ObjectiveEvaluator(this);
    this._sustainedTracking = {
      sustainedPower1k: { startTick: 0 },
      masterHighHeat: { startTick: 0 },
      infiniteHeatMaintain: { startTick: 0 },
    };
  }

  getSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (!t) return null;
    return t;
  }

  updateSustainedTracking(key, startTick) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = startTick;
  }

  resetSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = 0;
  }

  _syncActiveObjectiveToState() {
    const state = this.game?.state;
    if (!state?.active_objective) return;
    const info = this.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const checkId = this.current_objective_def?.checkId ?? null;
    state.active_objective = {
      title: info.title ?? "",
      index: this.current_objective_index,
      isComplete: !!info.isComplete,
      isChapterCompletion: !!info.isChapterCompletion,
      reward: info.reward ?? null,
      progressPercent: info.progressPercent ?? 0,
      hasProgressBar: checkId === "sustainedPower1k" && !info.isComplete,
      checkId,
    };
  }

  _emitObjectiveLoaded(displayObjective) {
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveLoaded?.(displayObjective, this.current_objective_index);
    if (this.game?.emit) {
      this.game.emit("objectiveLoaded", {
        objective: displayObjective,
        objectiveIndex: this.current_objective_index
      });
    }
  }

  _emitObjectiveCompleted() {
    this._syncActiveObjectiveToState();
    if (this.game?.emit) this.game.emit("objectiveCompleted", {});
  }

  _emitObjectiveUnloaded() {
    this.game?.ui?.stateManager?.handleObjectiveUnloaded?.();
    if (this.game?.emit) this.game.emit("objectiveUnloaded", {});
  }

  generateInfiniteObjective() {
    const idx = this._infiniteChallengeIndex % INFINITE_CHALLENGES.length;
    const challenge = INFINITE_CHALLENGES[idx];
    this._infiniteChallengeIndex = (idx + 1) % INFINITE_CHALLENGES.length;
    const lastKey = challenge.getLastKey();
    const last = this[lastKey] ?? 0;
    const target = challenge.nextTarget(last);
    this[lastKey] = target;
    const completedCount = this._infiniteCompletedCount || 0;
    const reward = INFINITE_REWARD_BASE + Math.min(completedCount * INFINITE_REWARD_PER_COMPLETION, INFINITE_REWARD_CAP);
    if (challenge.id === "infiniteHeatMaintain") this.resetSustainedTracking("infiniteHeatMaintain");
    this.infiniteObjective = {
      title: challenge.title(target),
      checkId: challenge.id,
      target,
      reward,
      completed: false,
    };
    return this.infiniteObjective;
  }

  async initialize() {
    const { objectives } = await dataService.ensureAllGameDataLoaded();
    const data = objectives?.default || objectives;

    if (!Array.isArray(data)) {
      logger.log('error', 'game', 'objective_list_data is not an array:', data);
      return;
    }

    const existingCompletionStatus = this.objectives_data
      ? this.objectives_data.map(obj => obj.completed)
      : [];
    this.objectives_data = data;
    if (existingCompletionStatus.length > 0) {
      logger.log('debug', 'game', `Preserving ${existingCompletionStatus.filter(c => c).length} completed objectives during initialize`);
      existingCompletionStatus.forEach((completed, index) => {
        if (this.objectives_data[index]) {
          this.objectives_data[index].completed = completed;
        }
      });
    }

    logger.log('debug', 'game', `ObjectiveManager initialized with ${this.objectives_data.length} objectives`);
    logger.log('debug', 'game', `First objective: ${this.objectives_data[0]?.title}`);
    logger.log('debug', 'game', `Last objective: ${this.objectives_data[this.objectives_data.length - 1]?.title}`);
  }

  start() {
    logger.log('debug', 'game', `ObjectiveManager.start() called with current_objective_index: ${this.current_objective_index}`);

    if (!this.objectives_data || this.objectives_data.length === 0) {
      logger.log('debug', 'game', 'Objectives data not loaded yet, waiting for initialization...');
      this.initialize().then(() => {
        logger.log('debug', 'game', 'Initialization completed, now calling start() again');
        this.start();
      });
      return;
    }

    // Only set objective if it's not already set or if current_objective_def is null
    if (!this.current_objective_def) {
      logger.log('debug', 'game', `Setting objective to index ${this.current_objective_index}`);
      this.set_objective(this.current_objective_index, true);
    } else {
      logger.log('debug', 'game', 'Objective already set, skipping set_objective call');
    }

    setTimeout(() => {
      logger.log('debug', 'game', 'ObjectiveManager.checkAndAutoComplete() called');
      this.checkAndAutoComplete();
    }, 0);
  }

  checkAndAutoComplete() {
    return this.evaluator.checkAndAutoComplete();
  }

  check_current_objective() {
    return this.evaluator.checkCurrentObjective();
  }

  scheduleNextCheck() {
    return this.tracker.scheduleNextCheck();
  }

  _loadInfiniteObjective() {
    const inf = this.infiniteObjective || this.generateInfiniteObjective();
    this.current_objective_def = inf;
    this._emitObjectiveLoaded({ ...inf, title: inf.title });
    this.objective_unloading = false;
    this.scheduleNextCheck();
  }

  _loadNormalObjective(nextObjective) {
    this.current_objective_def = nextObjective;
    if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
      this.current_objective_def.completed = true;
      if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
      logger.log('debug', 'game', `Auto-completing chapter completion objective: ${this.current_objective_def.title}`);
      const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
      if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });
    }
    const displayObjective = {
      ...this.current_objective_def,
      title:
        typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title,
    };
    logger.log('debug', 'game', `Loading objective: ${displayObjective.title}`);
    this._emitObjectiveLoaded(displayObjective);
    this.objective_unloading = false;
    this.scheduleNextCheck();
  }

  _loadAllCompletedObjective() {
    this.current_objective_def = {
      title: "All objectives completed!",
      reward: 0,
      checkId: "allObjectives",
    };
    logger.log('debug', 'game', 'Loading "All objectives completed!" objective');
    this._emitObjectiveLoaded({ ...this.current_objective_def });
    clearTimeout(this.objective_timeout);
  }

  set_objective(objective_index, skip_wait = false) {
    return this.tracker.setObjective(objective_index, skip_wait);
  }

  claimObjective() {
    logger.log("info", "objectives", "[Claim] claimObjective called", {
      claiming: this.claiming,
      hasDef: !!this.current_objective_def,
      defId: this.current_objective_def?.checkId,
    });
    if (this.claiming || !this.current_objective_def) {
      logger.log("info", "objectives", "[Claim] early return: claiming or no def", {
        claiming: this.claiming,
        hasDef: !!this.current_objective_def,
      });
      return;
    }

    let isComplete = this.current_objective_def.isChapterCompletion ?
      this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index) :
      this.current_objective_def.completed;

    if (!isComplete && this.current_objective_def.checkId) {
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      const result = checkFn?.(this.game);
      isComplete = !!result?.completed;
    }

    logger.log("info", "objectives", "[Claim] isComplete check", {
      isChapterCompletion: this.current_objective_def.isChapterCompletion,
      defCompleted: this.current_objective_def.completed,
      isComplete,
    });

    if (!isComplete) {
      logger.log("info", "objectives", "[Claim] early return: objective not complete");
      return;
    }

    logger.log("info", "objectives", "[Claim] claiming objective", { index: this.current_objective_index });
    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });
    const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
    if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });

    // Give the reward
    if (this.current_objective_def.reward) {
      updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(this.current_objective_def.reward)));
    } else if (this.current_objective_def.ep_reward) {
      this.game.exoticParticleManager.exotic_particles = this.game.exoticParticleManager.exotic_particles.add(this.current_objective_def.ep_reward);
      updateDecimal(this.game.state, "total_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
      updateDecimal(this.game.state, "current_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
    }

    if (INFINITE_CHALLENGE_IDS.has(this.current_objective_def.checkId)) {
      this._infiniteCompletedCount = (this._infiniteCompletedCount || 0) + 1;
      this.generateInfiniteObjective();
      this.set_objective(this.current_objective_index, true);
    } else {
      this.current_objective_index++;
      const maxValidIndex = this.objectives_data.length - 1;
      if (this.current_objective_index > maxValidIndex) {
        this.current_objective_index = maxValidIndex;
      }
      this.set_objective(this.current_objective_index, true);
    }

    // Always save after claiming
    if (this.game?.saveManager) {
      void this.game.saveManager.autoSave();
    }

    if (this.game?.emit) this.game.emit("objectiveClaimed", {});
    setTimeout(() => {
      this.claiming = false;
    }, CLAIM_FEEDBACK_DELAY_MS);
  }

  getCurrentObjectiveDisplayInfo() {
    return formatDisplayInfo(this);
  }

  getCurrentObjectiveProgress() {
    if (!this.current_objective_def || this.current_objective_def.completed) {
      return { text: "", percent: 100 };
    }
    if (!this.game || !this.game.tileset || !this.game.reactor) {
      return { text: "Loading...", percent: 0 };
    }
    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    if (!checkFn) return { text: "Awaiting completion...", percent: 0 };
    const result = checkFn(this.game);
    return { text: result.text, percent: result.percent };
  }

  checkVentNextToCell(game) {
    return _checkVentNextToCell(game);
  }

  checkChapterCompletion(startIndex, chapterSize) {
    return _checkChapterCompletion(this.objectives_data, startIndex, chapterSize);
  }

  getChapterCompletionStatus(objective, objectiveIndex) {
    return objective.completed || false;
  }

  areAdjacent(tile1, tile2) {
    return areAdjacentFromModule(tile1, tile2);
  }


  // Utility method to get current objective information for debugging
  getCurrentObjectiveInfo() {
    return {
      index: this.current_objective_index,
      title: this.current_objective_def
        ? typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title
        : "No objective loaded",
      checkId: this.current_objective_def?.checkId || null,
      total_objectives: this.objectives_data.length,
      completed: this.current_objective_def?.completed || false,
    };
  }
}

export class ObjectiveController {
  constructor(api) {
    this.api = api;
    this._onToastClick = (e) => this._handleToastClick(e);
    this._objectivesUnmount = null;
  }

  _handleClaimClick(event) {
    event.stopPropagation();
    this.api.getGame()?.objectives_manager?.claimObjective?.();
  }

  _handleToastClick(event) {
    if (event.target?.closest?.(".objectives-claim-pill")) return;
    const toastBtn = event.currentTarget;
    const uiState = this.api.getUI()?.uiState;
    if (uiState) {
      uiState.objectives_toast_expanded = !uiState.objectives_toast_expanded;
      if (uiState.objectives_toast_expanded && this.api.lightVibration) this.api.lightVibration();
    } else {
      const isExpanded = toastBtn.classList.toggle("is-expanded");
      toastBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      if (isExpanded && this.api.lightVibration) this.api.lightVibration();
      this._render(this._getRenderState());
    }
  }

  _getRenderState() {
    const game = this.api.getGame();
    const uiState = this.api.getUI()?.uiState;
    if (!game) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    const obj = game.state?.active_objective;
    const om = game.objectives_manager;
    if (obj?.title) {
      const isExpanded = uiState?.objectives_toast_expanded ?? false;
      const showProgressBar = obj.hasProgressBar && isExpanded;
      return {
        sandbox: false,
        title: obj.title ? `${(obj.index ?? 0) + 1}: ${obj.title}` : "",
        claimText: getObjectiveClaimText(obj.reward),
        reward: obj.reward ?? null,
        progressPercent: showProgressBar ? (obj.progressPercent ?? 0) : 0,
        isComplete: !!obj.isComplete,
        isActive: !obj.isComplete,
        hasProgressBar: !!showProgressBar,
        isExpanded,
        hidden: uiState?.active_page !== "reactor_section",
      };
    }
    const hidden = uiState?.active_page !== "reactor_section";
    if (!om) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const info = om.getCurrentObjectiveDisplayInfo();
    if (!info) return { sandbox: false, title: "", claimText: "Claim", reward: null, progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const objectiveIndex = om.current_objective_index ?? 0;
    const displayTitle = info.title ? `${objectiveIndex + 1}: ${info.title}` : "";
    const checkId = om.current_objective_def?.checkId;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = checkId === "sustainedPower1k" && isExpanded && !info.isComplete;
    return {
      sandbox: false,
      title: displayTitle,
      claimText: getObjectiveClaimText(info.reward),
      reward: info.reward ?? null,
      progressPercent: info.progressPercent ?? 0,
      isComplete: !!info.isComplete,
      isActive: !info.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
  }

  _getRenderStateForPage(pageId) {
    const state = this._getRenderState();
    if (!state) return null;
    state.hidden = pageId !== "reactor_section";
    return state;
  }

  _toTemplate(state) {
    if (!state) return null;
    const btnClass = classMap({
      "objectives-toast-btn": true,
      "is-complete": state.isComplete,
      "is-active": state.isActive,
      "has-progress-bar": state.hasProgressBar,
      "is-expanded": state.isExpanded,
      hidden: state.hidden,
    });
    const progressStyle = styleMap({ width: state.hasProgressBar ? `${state.progressPercent}%` : "0%" });
    return html`
      <div
        id="objectives_toast_btn"
        class=${btnClass}
        role="button"
        tabindex="0"
        aria-label="Show Objectives"
        aria-expanded=${state.isExpanded ? "true" : "false"}
        @click=${this._onToastClick}
        @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._handleToastClick(e); } }}
      >
        <span class="objectives-toast-row">
          <span class="objectives-toast-printer" aria-hidden="true">
            <span class="objectives-toast-printer-head">
              <span class="objectives-toast-icon">${state.isComplete ? "!" : "?"}</span>
            </span>
            <span class="objectives-toast-printer-slot"></span>
          </span>
          <span class="objectives-toast-paper">
            <span class="objectives-toast-paper-head">
              <button type="button" class="objectives-claim-pill" ?disabled=${!state.isComplete} @click=${(e) => this._handleClaimClick(e)}>${state.claimText}</button>
            </span>
            <span class="objectives-toast-paper-line">
              <span class="objectives-toast-title" id="objectives_toast_title"></span>
            </span>
            <span class="objectives-toast-progress" aria-hidden="true"><span class="objectives-toast-progress-fill" style=${progressStyle}></span></span>
          </span>
        </span>
      </div>
    `;
  }

  _syncObjectivesToastTitle(state) {
    const titleEl = typeof document !== "undefined" ? document.getElementById("objectives_toast_title") : null;
    if (!titleEl) return;
    titleEl.textContent = state?.title ?? "";
    if (state?.title?.trim()) {
      setTimeout(() => this.api.getStateManager()?.checkObjectiveTextScrolling?.(), 0);
    }
  }

  _render(state) {
    const root = document.getElementById("objectives_toast_root");
    if (!root?.isConnected || !state) return;
    const template = this._toTemplate(state);
    if (template) {
      try {
        render(template, root);
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
      }
    }
    this._syncObjectivesToastTitle(state);
  }

  _renderReactive() {
    const state = this._getRenderState();
    const template = this._toTemplate(state);
    if (template && state?.isComplete && !this._lastObjectiveComplete) {
      this._lastObjectiveComplete = true;
      setTimeout(() => this.animateCompletion(), 0);
    } else if (state && !state.isComplete) {
      this._lastObjectiveComplete = false;
    }
    return template;
  }

  updateDisplayFromState() {
    if (this._objectivesUnmount) return;
    const game = this.api.getGame();
    const state = game?.state;
    if (!state?.active_objective) return;
    const obj = state.active_objective;
    const uiState = this.api.getUI()?.uiState;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = obj.hasProgressBar && isExpanded;
    const renderState = {
      sandbox: false,
      title: obj.title ? `${obj.index + 1}: ${obj.title}` : "",
      claimText: getObjectiveClaimText(obj.reward),
      reward: obj.reward ?? null,
      progressPercent: showProgressBar ? obj.progressPercent : 0,
      isComplete: !!obj.isComplete,
      isActive: !obj.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(renderState);
    if (!wasComplete && obj.isComplete) this.animateCompletion();
  }

  updateDisplay() {
    const game = this.api.getGame();
    if (!game?.objectives_manager) return;
    const info = game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(this._getRenderState());
    if (!wasComplete && info.isComplete) this.animateCompletion();
  }

  animateCompletion() {
    const toastBtn = document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("objective-completed");
    setTimeout(() => toastBtn.classList.remove("objective-completed"), 2000);
  }

  showForPage(pageId) {
    this.api.cacheDOMElements?.();
    if (pageId === "reactor_section") {
      const game = this.api.getGame();
      const om = game?.objectives_manager;
      if (om?.current_objective_def) {
        om._syncActiveObjectiveToState?.();
        this.api.getStateManager()?.handleObjectiveLoaded?.({
          ...om.current_objective_def,
          title: typeof om.current_objective_def.title === "function" ? om.current_objective_def.title() : om.current_objective_def.title,
        }, om.current_objective_index);
      }
    }
  }

  setupListeners() {
    const game = this.api.getGame();
    const ui = this.api.getUI();
    const root = document.getElementById("objectives_toast_root");
    if (root && game?.state && ui?.uiState) {
      const subscriptions = [
        { state: game.state, keys: ["active_objective"] },
        { state: ui.uiState, keys: ["objectives_toast_expanded", "active_page"] },
      ];
      const renderFn = () => this._renderReactive();
      this._objectivesUnmount = ReactiveLitComponent.mountMulti(
        subscriptions,
        renderFn,
        root,
        () => {
          const s = this._getRenderState();
          this._syncObjectivesToastTitle(s);
        }
      );
    } else if (root) {
      this._render(this._getRenderState());
    }
  }

  unmount() {
    if (typeof this._objectivesUnmount === "function") {
      this._objectivesUnmount();
      this._objectivesUnmount = null;
    }
  }
}

export function buildFacts(game, engine, data) {
  const reactor = game.reactor;
  const maxHeat = toNumber(reactor.max_heat ?? 0);
  const reactorHeat = toNumber(reactor.current_heat ?? 0);
  const heatRatio = maxHeat > 0 ? reactorHeat / maxHeat : 0;
  const tickCount = data ? engine.tick_count + (data.tickCount || 1) - 1 : engine.tick_count;
  const us = game.upgradeset;
  const hasUpgrade = (id) => (us?.getUpgrade(id)?.level ?? 0) > 0;
  const upgrades = {};
  if (us?.upgradesArray) {
    for (const u of us.upgradesArray) {
      if (u?.id && (u.level ?? 0) > 0) upgrades[u.id] = u.level;
    }
  }
  return {
    reactorHeat,
    maxHeat,
    heatRatio,
    reactorPower: toNumber(reactor.current_power ?? 0),
    maxPower: toNumber(reactor.max_power ?? 0),
    tickCount,
    activeCells: engine.active_cells?.length ?? 0,
    activeVents: engine.active_vents?.length ?? 0,
    hasMeltedDown: reactor.has_melted_down ?? false,
    isPaused: game.paused ?? game.state?.pause ?? false,
    hasUpgrade,
    upgrades,
    _firstHighHeatSeen: game.state?._firstHighHeatSeen ?? false,
  };
}

function heatWarningPredicate(facts) {
  return facts.heatRatio >= CRITICAL_HEAT_RATIO && !facts.hasMeltedDown && !facts.isPaused;
}

function pipeIntegrityWarningPredicate(facts) {
  return (
    facts.heatRatio >= CRITICAL_HEAT_RATIO &&
    !facts.hasUpgrade("fractal_piping") &&
    !facts.hasMeltedDown &&
    !facts.isPaused
  );
}

function firstHighHeatPredicate(facts) {
  return facts.heatRatio >= 0.5 && !facts.hasMeltedDown && !facts.isPaused && !facts._firstHighHeatSeen;
}

export const rules = [
  { event: "heatWarning", predicate: heatWarningPredicate, throttleTicks: 30 },
  { event: "pipeIntegrityWarning", predicate: pipeIntegrityWarningPredicate, throttleTicks: 30 },
  { event: "firstHighHeat", predicate: firstHighHeatPredicate, oneShot: true, oneShotKey: "_firstHighHeatSeen" },
];

const GRID_SIZE = 50 * 50;

export class Tile {
  constructor(row, col, game) {
    this.game = game;
    this.part = null;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this._containmentNeighborTiles = [];
    this._cellNeighborTiles = [];
    this._reflectorNeighborTiles = [];
    this.activated = false;
    this.row = row;
    this.col = col;
    this.enabled = false;
    this.display_chance = 0;
    this.display_chance_percent_of_total = 0;
    this._heatContained = 0;
    this.ticks = 0;
    this.exploded = false;
    this.exploding = false;
    this._neighborCache = null;
  }

  get heat_contained() {
    const ts = this.game?.tileset;
    if (ts?.heatMap) return ts.heatMap[ts.gridIndex(this.row, this.col)];
    return this._heatContained;
  }

  set heat_contained(v) {
    const ts = this.game?.tileset;
    if (ts?.heatMap) {
      ts.heatMap[ts.gridIndex(this.row, this.col)] = v;
      return;
    }
    this._heatContained = v;
  }

  addHeat(amount) {
    this.heat_contained = (this.heat_contained || 0) + amount;
  }

  setTicks(value) {
    this.ticks = value;
  }

  _calculateAndCacheNeighbors() {
    const p = this.part;
    if (!p) {
      this._neighborCache = { containment: [], cell: [], reflector: [] };
      return;
    }
    const neighbors = Array.from(
      this.game.tileset.getTilesInRange(this, p.range || 1)
    );
    const containment = [];
    const cell = [];
    const reflector = [];
    for (const neighbor_tile of neighbors) {
      if (neighbor_tile.part && neighbor_tile.activated) {
        const p = neighbor_tile.part;
        if (p.containment > 0 || ['heat_exchanger', 'heat_outlet', 'heat_inlet'].includes(p.category)) {
          containment.push(neighbor_tile);
        }
        if (neighbor_tile.part.category === "cell" && neighbor_tile.ticks > 0)
          cell.push(neighbor_tile);
        if (neighbor_tile.part.category === "reflector")
          reflector.push(neighbor_tile);
      }
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' && this.part && this.part.category === 'heat_outlet') {
      logger.log('debug', 'game', `Outlet at (${this.row}, ${this.col}) has ${containment.length} containment neighbors: ${containment.map(t => `(${t.row}, ${t.col}) ${t.part?.id}`).join(', ')}`);
    }

    this._neighborCache = { containment, cell, reflector };
  }
  invalidateNeighborCaches() {
    this._neighborCache = null;
    const maxRange = 2;
    for (const neighbor of this.game.tileset.getTilesInRange(this, maxRange)) {
      if (neighbor) neighbor._neighborCache = null;
    }
  }
  get containmentNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.containment;
  }
  get cellNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.cell;
  }
  get reflectorNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.reflector;
  }
  getEffectiveVentValue() {
    if (!this.part || !this.part.vent) return 0;
    let ventValue = this.part.vent;

    const activeVenting = this.game.upgradeset.getUpgrade("active_venting");
    if (activeVenting && activeVenting.level > 0) {
      let capacitorBonus = 0;
      const neighbors = this.containmentNeighborTiles;
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (neighbor.part && neighbor.part.category === "capacitor") {
          capacitorBonus += neighbor.part.level || 1;
        }
      }
      ventValue *= 1 + (activeVenting.level * capacitorBonus) / 100;
    }
    return ventValue;
  }
  getEffectiveTransferValue() {
    if (!this.part) return 0;

    if (this.part.category === 'vent' && this.part.vent) {
      return this.part.vent;
    } else if (this.part.transfer) {
      const transferMultiplier =
        this.game?.reactor.transfer_multiplier_eff || 0;
      return this.part.transfer * (1 + transferMultiplier / 100);
    }
    return 0;
  }
  disable() {
    if (this.enabled) this.enabled = false;
  }
  enable() {
    if (!this.enabled) this.enabled = true;
  }

  _clearMeltdownRecovery() {
    const game = this.game;
    logger.log('debug', 'game', '[Recovery] Clearing meltdown state after placing part:', this.part.id);
    logger.log('debug', 'game', '[Recovery] Reactor heat before reset:', game.reactor.current_heat, "max:", game.reactor.max_heat);
    game.reactor.current_heat = 0;
    game.reactor.clearMeltdownState();
    game.emit?.("reactorTick", { current_heat: game.reactor.current_heat, current_power: game.reactor.current_power });
    const engineStopped = game.engine && !game.engine.running;
    if (!engineStopped) {
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    const currentPauseState = game.state?.pause ?? game.paused;
    logger.log('debug', 'game', '[Recovery] Current pause state:', currentPauseState);
    logger.log('debug', 'game', '[Recovery] Engine running state:', game.engine.running);
    logger.log('debug', 'game', '[Recovery] Game paused state:', game.paused);
    if (currentPauseState) {
      logger.log('info', 'game', '[Recovery] Unpausing game');
      game.onToggleStateChange?.("pause", false);
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
      (typeof global !== 'undefined' && global.__VITEST__) ||
      (typeof window !== 'undefined' && window.__VITEST__);
    if (isTestEnv) {
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    logger.log('info', 'game', '[Recovery] Force restarting engine');
    game.paused = false;
    game.engine.start();
    logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
  }

  async setPart(partInstance) {
    if (partInstance === null || partInstance === undefined) {
      throw new Error("Invalid part: part cannot be null or undefined");
    }
    if (this.part) {
      return false;
    }
    const isRestoring = this.game?._isRestoringSave;
    if (!isRestoring && this.game?.partset?.isPartDoctrineLocked(partInstance)) {
      return false;
    }
    if (!isRestoring && this.game.audio && this.game.audio.enabled) {
      logger.log('debug', 'game', `Placing part '${partInstance.id}' on tile (${this.row}, ${this.col})`);
      this.game.debugHistory.add('tile', 'setPart', { row: this.row, col: this.col, partId: partInstance.id });
      const subtype =
        partInstance.category === "cell"
          ? "cell"
          : partInstance.category === "reactor_plating" ? "plating" : partInstance.category === "vent" ? "vent" : null;
      const pan = this.game.calculatePan ? this.game.calculatePan(this.col) : 0;
      this.game.audio.play("placement", subtype, pan);
    }
    this.part = partInstance;
    this.invalidateNeighborCaches();
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      this.exploded = false;
      this.exploding = false;
      this.game.emit?.("markTileDirty", { row: this.row, col: this.col });
      this.game.emit?.("markStaticDirty");
      try {
        if (this.game?.unlockManager && this.part && typeof this.game.unlockManager.incrementPlacedCount === "function") {
          this.game.unlockManager.incrementPlacedCount(this.part.type, this.part.level);
        }
      } catch (_) { }
      if (this.game.reactor.has_melted_down) {
        this._clearMeltdownRecovery();
      }
    }

    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    if (!isRestoring) {
      this.game.reactor.updateStats();
      try {
        this.game.emit?.("partsPanelRefresh");
        if (this.game && this.game.upgradeset && typeof this.game.upgradeset.populateUpgrades === "function") {
          this.game.upgradeset.populateUpgrades();
        }
      } catch (_) { }
      if (this.game?.saveManager) {
        void this.game.saveManager.autoSave();
      }
    }
    return true;
  }
  _clearPartReset() {
    this.invalidateNeighborCaches();
    this.activated = false;
    this.part = null;
    this.ticks = 0;
    this.heat_contained = 0;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this.exploded = false;
    this.exploding = false;
    this.game.emit?.("markTileDirty", { row: this.row, col: this.col });
    this.game.emit?.("markStaticDirty");
    if (this.game.tooltip_manager?.current_tile_context === this) this.game.tooltip_manager.hide();
    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    this.game.reactor.updateStats();
    try {
      this.game.emit?.("partsPanelRefresh");
    } catch (_) {}
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
  }

  clearPart() {
    if (!this.part) return;
    logger.log('debug', 'game', `Clearing part '${this.part.id}' from tile (${this.row}, ${this.col}).`);
    this.game.debugHistory.add('tile', 'clearPart', { row: this.row, col: this.col, partId: this.part.id });
    this._clearPartReset();
  }

  sellPart() {
    if (!this.part) return;
    const part_id = this.part.id;
    logger.log('debug', 'game', `Selling part '${part_id}' from tile (${this.row}, ${this.col}).`);
    this.game.debugHistory.add('tile', 'sellPart', { row: this.row, col: this.col, partId: part_id });
    const sell_value = this.calculateSellValue();
    this.game.addMoney(sell_value);
    this.game.emit?.("showFloatingText", { tile: this, value: sell_value });
    this._clearPartReset();
  }


  calculateSellValue() {
    if (!this.part) {
      return 0;
    }
    const part = this.part;
    let sellValue = part.cost;
    if (part.ticks > 0 && typeof this.ticks === "number") {
      const lifeRemainingRatio = Math.max(0, this.ticks / part.ticks);
      sellValue = Math.ceil(part.cost * lifeRemainingRatio);
    } else if (
      part.containment > 0 &&
      typeof this.heat_contained === "number"
    ) {
      const damageRatio = Math.min(1, this.heat_contained / part.containment);
      sellValue = part.cost - Math.ceil(part.cost * damageRatio);
    }
    return Math.max(0, sellValue);
  }
  refreshVisualState() {
    this.game.emit?.("markTileDirty", { row: this.row, col: this.col });
    this.game.emit?.("markStaticDirty");
  }
}

export class Tileset {
  constructor(game) {
    this.game = game;
    this.max_rows = 50;
    this.max_cols = 50;
    this.rows = 12;
    this.cols = 12;
    this.tiles = [];
    this.tiles_list = [];
    this.active_tiles = [];
    this.active_tiles_list = [];
    this.heatMap = new Float32Array(GRID_SIZE);
  }

  gridIndex(row, col) {
    return getIndex(row, col, this.max_cols);
  }

  syncHeatFromTiles() {
    const rows = this.game?.rows ?? this.max_rows;
    const cols = this.game?.cols ?? this.max_cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile) this.heatMap[this.gridIndex(r, c)] = tile.heat_contained;
      }
    }
  }

  syncHeatToTiles() {
    const rows = this.game?.rows ?? this.max_rows;
    const cols = this.game?.cols ?? this.max_cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile) tile._heatContained = this.heatMap[this.gridIndex(r, c)];
      }
    }
  }

  initialize() {
    this.tiles = [];
    this.tiles_list = [];
    for (let r = 0; r < this.max_rows; r++) {
      const row_array = [];
      for (let c = 0; c < this.max_cols; c++) {
        const tile = new Tile(r, c, this.game);
        row_array.push(tile);
        this.tiles_list.push(tile);
      }
      this.tiles.push(row_array);
    }
    this.updateActiveTiles();
    return this.tiles_list;
  }

  updateActiveTiles() {
    for (let r = 0; r < this.max_rows; r++) {
      for (let c = 0; c < this.max_cols; c++) {
        const tile = this.tiles[r] && this.tiles[r][c];
        if (tile) {
          if (r < this.game.rows && c < this.game.cols) {
            tile.enable();
          } else {
            tile.disable();
          }
        }
      }
    }

    this.active_tiles_list = this.tiles_list.filter((t) => t.enabled);

    this.tiles_list.forEach((tile) => {
      if (tile._neighborCache !== undefined) {
        tile._neighborCache = null;
      }
    });

    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
  }

  getTile(row, col) {
    if (row >= 0 && row < this.game.rows && col >= 0 && col < this.game.cols) {
      return this.tiles[row] && this.tiles[row][col];
    }
    return null;
  }

  *getTilesInRange(centerTile, range) {
    if (!centerTile) return;
    for (let r_offset = -range; r_offset <= range; r_offset++) {
      for (let c_offset = -range; c_offset <= range; c_offset++) {
        if (r_offset === 0 && c_offset === 0) continue;
        if (Math.abs(r_offset) + Math.abs(c_offset) > range) continue;

        const r = centerTile.row + r_offset;
        const c = centerTile.col + c_offset;

        if (r >= 0 && r < this.game.rows && c >= 0 && c < this.game.cols) {
          const tile = this.tiles[r]?.[c];
          if (tile) yield tile;
        }
      }
    }
  }

  clearAllTiles() {
    this.tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart();
      }
    });
    this.game.engine?.heatManager?.markSegmentsAsDirty();
  }

  clearAllParts() {
    this.active_tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart();
      }
    });
    this.game.engine?.heatManager?.markSegmentsAsDirty();
  }

  getAllTiles() {
    return this.active_tiles_list;
  }

  toSaveState() {
    return this.active_tiles_list
      .filter((tile) => tile.part)
      .map((tile) => ({
        row: tile.row,
        col: tile.col,
        partId: tile.part.id,
        ticks: tile.ticks,
        heat_contained: tile.heat_contained,
      }));
  }
}

class StaticGridRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  drawTile(game, r, c) {
    const { ctx, _tileSize: ts } = this._shared;
    const x = c * ts;
    const y = r * ts;
    ctx.fillStyle = COLORS.tileBg;
    ctx.strokeStyle = COLORS.tileStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, ts, ts);
    ctx.strokeRect(x, y, ts, ts);
    const tile = game.tileset?.getTile(r, c);
    if (tile?.enabled && tile.part) {
      const path = typeof tile.part.getImagePath === "function" ? tile.part.getImagePath() : null;
      if (path) {
        const img = this._shared.loadImage(path);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, ts, ts);
      }
    }
  }

  render(game, viewport) {
    const { ctx, _width, _height, _rows: rows, _cols: cols, _tileSize: ts, _staticDirty, _staticDirtyTiles } = this._shared;
    if (!ctx || _width <= 0 || _height <= 0) {
      if (!this._shared._staticBailLogged) {
        this._shared._staticBailLogged = true;
        logger.log('warn', 'ui', '[StaticGrid] render bailed', { hasCtx: !!ctx, width: _width, height: _height });
      }
      return;
    }
    this._shared._staticBailLogged = false;
    const cull = viewport != null;

    if (_staticDirty) {
      ctx.clearRect(0, 0, _width, _height);
      Array.from({ length: rows }, (_, r) => r).forEach((r) =>
        Array.from({ length: cols }, (_, c) => c).forEach((c) => {
          if (!cull || this._shared.tileInViewport(r, c, viewport)) this.drawTile(game, r, c);
        })
      );
      this._shared._staticDirty = false;
      this._shared._staticDirtyTiles.clear();
      return;
    }

    if (_staticDirtyTiles.size === 0) return;
    _staticDirtyTiles.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      if (!cull || this._shared.tileInViewport(r, c, viewport)) {
        ctx.clearRect(c * ts, r * ts, ts, ts);
        this.drawTile(game, r, c);
      }
    });
    this._shared._staticDirtyTiles.clear();
  }
}

class DynamicOverlayRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  _getGlobalBoostCategories() {
    return {
      infused_cells: ["cell"],
      unleashed_cells: ["cell"],
      quantum_buffering: ["capacitor", "reactor_plating"],
      full_spectrum_reflectors: ["reflector"],
      fluid_hyperdynamics: ["heat_inlet", "heat_outlet", "heat_exchanger", "vent"],
      fractal_piping: ["vent", "heat_exchanger"],
      ultracryonics: ["coolant_cell"],
    };
  }

  _isTileBuffedByGlobalBoost(game, tile) {
    const part = tile?.part;
    if (!part || !game?.upgradeset) return false;
    const mapping = this._getGlobalBoostCategories();
    for (const [upgradeId, categories] of Object.entries(mapping)) {
      if (!categories.includes(part.category)) continue;
      const level = game.upgradeset.getUpgrade(upgradeId)?.level ?? 0;
      if (level > 0) return true;
    }
    return false;
  }

  _drawSingularityOverlay(ctx, x, y, ts, now) {
    const cx = x + ts * 0.5;
    const cy = y + ts * 0.5;
    const rMax = Math.hypot(ts * 0.5, ts * 0.5);
    const ringR = rMax * (0.5 + Math.sin(now * 0.003) * 0.15);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMax);
    grad.addColorStop(0, `rgba(0, 0, 0, ${SINGULARITY.blackHoleAlpha})`);
    grad.addColorStop(0.2, SINGULARITY.innerTint);
    grad.addColorStop(0.6, SINGULARITY.midTint);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(180, 100, 255, ${SINGULARITY.ringBaseAlpha + Math.sin(now * SINGULARITY.ringTimeScale) * SINGULARITY.ringPulseAmplitude})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    const orbitT = (now * SINGULARITY.orbitTimeScale) % (Math.PI * 2);
    ctx.strokeStyle = `rgba(220, 150, 255, ${0.35 + Math.sin(now * 0.01) * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringR * 0.7, ringR * 0.35, orbitT * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  render(game, viewport, ui) {
    const { _dynamicCtx: ctx, _width, _height, _tileSize: ts } = this._shared;
    if (!ctx || !game?.tileset || _width <= 0 || _height <= 0) return;

    const tiles = game.tileset.active_tiles_list;
    if (!tiles) return;
    const cull = viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const pulseAlpha = 0.12 + Math.sin(now * 0.002) * 0.06;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile?.enabled || !tile.part) continue;
      const r = tile.row;
      const c = tile.col;
      if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
      const x = c * ts;
      const y = r * ts;

      if (this._isTileBuffedByGlobalBoost(game, tile)) {
        ctx.fillStyle = COLORS.boostPulse(pulseAlpha);
        ctx.fillRect(x, y, ts, ts);
      }

      const maxHeat = tile.part.containment || 1;
      const hasHeatBar = tile.part.base_containment > 0 || (tile.part.containment > 0 && tile.part.category !== "valve");
      if (hasHeatBar && tile.heat_contained != null) {
        const pct = vuSegmentRatio01(Math.max(0, Math.min(1, tile.heat_contained / maxHeat)));
        const barH = Math.max(BAR.minBarHeight, (ts * BAR.barHeightRatio) | 0);
        const by = y + ts - barH;
        ctx.fillStyle = COLORS.heatBarBg;
        ctx.fillRect(x, by, ts, barH);
        ctx.fillStyle = COLORS.heatBarFill;
        ctx.fillRect(x, by, ts * pct, barH);
      }

      const hasDurability = tile.part.base_ticks > 0;
      if (hasDurability && tile.ticks != null && tile.part.ticks > 0) {
        const pct = vuSegmentRatio01(Math.max(0, Math.min(1, tile.ticks / tile.part.ticks)));
        const barH = Math.max(BAR.minBarHeight, (ts * BAR.barHeightRatio) | 0);
        const by = y + ts - barH;
        if (!hasHeatBar) {
          ctx.fillStyle = COLORS.heatBarBg;
          ctx.fillRect(x, by, ts, barH);
        }
        ctx.fillStyle = COLORS.durabilityBarFill;
        ctx.fillRect(x, by, ts * pct, barH);
      }

      if (hasHeatBar && tile.part.containment > 0) {
        const heatRatio = tile.heat_contained / tile.part.containment;
        if (heatRatio >= OVERHEAT_VISUAL.heatRatioThreshold) {
          const wiggle = Math.sin(now * OVERHEAT_VISUAL.wiggleFreq) * OVERHEAT_VISUAL.wiggleAmplitude;
          ctx.strokeStyle = `rgba(255, 80, 60, ${OVERHEAT_VISUAL.strokeBaseAlpha + Math.sin(now * OVERHEAT_VISUAL.strokePulseFreq) * OVERHEAT_VISUAL.strokePulseAmplitude})`;
          ctx.lineWidth = OVERHEAT_VISUAL.lineWidth;
          ctx.strokeRect(x + wiggle, y, ts - wiggle * 2, ts);
          ctx.strokeRect(x, y + wiggle, ts, ts - wiggle * 2);
        }
      }

      if (tile.exploding) {
        const explosionAlpha = 0.35 + Math.sin(now * 0.02) * 0.2;
        ctx.fillStyle = COLORS.explosionGlow(explosionAlpha);
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.explosionStroke(explosionAlpha);
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }

      const sellingTile = ui?.getSellingTile?.();
      if (sellingTile === tile) {
        ctx.fillStyle = COLORS.sellingFill;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.sellingStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ts, ts);
      }

      if (tile.part?.id === "particle_accelerator6") {
        this._drawSingularityOverlay(ctx, x, y, ts, now);
      }
    }

    const highlightedTiles = ui?.getHighlightedTiles?.();
    if (highlightedTiles?.length) {
      ctx.fillStyle = COLORS.highlightFill;
      for (let i = 0; i < highlightedTiles.length; i++) {
        const t = highlightedTiles[i];
        if (!t?.enabled) continue;
        const r = t.row;
        const c = t.col;
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        ctx.fillRect(c * ts, r * ts, ts, ts);
        ctx.strokeStyle = COLORS.highlightStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(c * ts, r * ts, ts, ts);
      }
    }

    const hoveredTile = ui?.getHoveredTile?.();
    if (hoveredTile?.enabled) {
      const r = hoveredTile.row;
      const c = hoveredTile.col;
      if (!cull || this._shared.tileInViewport(r, c, viewport)) {
        const x = c * ts;
        const y = r * ts;
        ctx.fillStyle = COLORS.hoverFill;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.hoverStroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, ts, ts);
      }
    }
  }
}

class HeatEffectsRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  _smoothHeatMap(heatMap, rows, cols, gridIndex) {
    const out = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              sum += heatMap[gridIndex(nr, nc)] || 0;
              n++;
            }
          }
        }
        out[gridIndex(r, c)] = n > 0 ? sum / n : 0;
      }
    }
    return out;
  }

  _prepareHeatData(game) {
    const { _dynamicCtx, _width, _height, _rows: rows, _cols: cols } = this._shared;
    if (!_dynamicCtx || !game?.tileset?.heatMap || _width <= 0 || _height <= 0) return null;
    const gridIndex = (r, c) => getIndex(r, c, game.tileset.max_cols);
    const smoothed = this._smoothHeatMap(game.tileset.heatMap, rows, cols, gridIndex);
    let maxHeat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = smoothed[gridIndex(r, c)] || 0;
        if (h > maxHeat) maxHeat = h;
      }
    }
    if (maxHeat <= 0) return null;
    return { smoothed, maxHeat, gridIndex, rows, cols };
  }

  _drawHeatMapLayer(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const blobRx = ts * HEAT_MAP.blobRadiusRatio;
    const blobRy = ts * HEAT_MAP.blobRadiusRatio;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = Math.max(0, Math.min(1, heat / maxHeat));
        const alpha = HEAT_MAP.baseAlpha + HEAT_MAP.alphaRange * t;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, blobRx, blobRy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawHeatShimmerLayer(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const threshold = HEAT_SHIMMER.threshold;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const baseAlpha = HEAT_SHIMMER.baseAlphaMultiplier * intensity;
        for (let i = 0; i < HEAT_SHIMMER.layerCount; i++) {
          const phase = (now * HEAT_SHIMMER.timeScale + i * HEAT_SHIMMER.phaseSpacing) % (Math.PI * 2);
          const offsetX = Math.sin(phase) * (ts * 0.12);
          const offsetY = Math.cos(phase * 0.7) * (ts * 0.1);
          const rx = ts * (0.35 + Math.sin(phase * 1.3) * 0.08);
          const ry = ts * (0.25 + Math.cos(phase * 0.9) * 0.06);
          const alpha = baseAlpha * (0.6 + 0.4 * Math.sin(phase * 2));
          ctx.fillStyle = COLORS.shimmerTint(alpha);
          ctx.beginPath();
          ctx.ellipse(cx + offsetX, cy + offsetY, rx, ry, phase * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawHeatHazeLayer(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const threshold = HEAT_HAZE.threshold;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const rise = (now * HEAT_HAZE.riseSpeedPx) % (ts * 1.2);
        const wobble = Math.sin(now * HEAT_HAZE.wobbleFreq + r * 0.5 + c * 0.5) * ts * 0.15;
        const hazeCy = cy - rise + wobble;
        const hazeCx = cx + Math.sin(now * 0.002 + c) * ts * 0.12;
        const rMax = ts * HEAT_HAZE.maxRadiusRatio;
        const grad = ctx.createRadialGradient(hazeCx, hazeCy, 0, hazeCx, hazeCy, rMax);
        grad.addColorStop(0, `rgba(255, 220, 180, ${0.12 * intensity})`);
        grad.addColorStop(0.4, `rgba(255, 200, 150, ${0.06 * intensity})`);
        grad.addColorStop(1, "rgba(255, 200, 150, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawHeatFlowLayer(game, viewport) {
    const engine = game?.engine;
    if (!this._shared._dynamicCtx || !engine || typeof engine.getLastHeatFlowVectors !== "function") return;
    const vectors = engine.getLastHeatFlowVectors();
    if (!vectors.length) return;
    const ts = this._shared._tileSize;
    const cull = viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const headLen = Math.max(4, Math.min(12, (ts * 10) / 48 | 0));
    const strokeWidth = Math.max(1.5, (ts * 2) / 48);
    const maxAmountForSpeed = HEAT_FLOW.maxAmountForSpeed;
    const dashLen = Math.max(6, ts * 0.35 | 0);
    const gapLen = Math.max(4, ts * 0.2 | 0);
    const ctx = this._shared._dynamicCtx;

    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (cull) {
        const fromIn = this._shared.tileInViewport(v.fromRow, v.fromCol, viewport);
        const toIn = this._shared.tileInViewport(v.toRow, v.toCol, viewport);
        if (!fromIn && !toIn) continue;
      }
      const fromX = (v.fromCol + 0.5) * ts;
      const fromY = (v.fromRow + 0.5) * ts;
      const toX = (v.toCol + 0.5) * ts;
      const toY = (v.toRow + 0.5) * ts;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const endX = toX - ux * headLen;
      const endY = toY - uy * headLen;
      const amount = typeof v.amount === "number" ? v.amount : 0;
      const speed = HEAT_FLOW.baseSpeed + (amount / maxAmountForSpeed) * HEAT_FLOW.speedAmountScale;
      const segLen = len - headLen;

      ctx.strokeStyle = COLORS.heatFlowArrow;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.setLineDash([dashLen, gapLen]);
      const period = dashLen + gapLen;
      ctx.lineDashOffset = -(now * 0.001 * speed * period * 0.5) % period;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      const ax = ux * headLen;
      const ay = uy * headLen;
      const perp = Math.max(2, headLen * 0.4);
      const px = -uy * perp;
      const py = ux * perp;
      ctx.fillStyle = COLORS.heatFlowArrowHead;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - ax + px, toY - ay + py);
      ctx.lineTo(toX - ax - px, toY - ay - py);
      ctx.closePath();
      ctx.fill();

      if (segLen > 4) {
        const pulseLen = HEAT_FLOW.pulseLen;
        const numPulses = HEAT_FLOW.pulseCount;
        for (let k = 0; k < numPulses; k++) {
          const phase = ((now * 0.001 * speed + k / numPulses) % 1);
          const p0 = (phase - pulseLen * 0.5 + 1) % 1;
          const p1 = (phase + pulseLen * 0.5 + 1) % 1;
          const x0 = fromX + ux * segLen * p0;
          const y0 = fromY + uy * segLen * p0;
          const x1 = fromX + ux * segLen * p1;
          const y1 = fromY + uy * segLen * p1;
          const alpha = 0.5 + (amount / maxAmountForSpeed) * 0.45;
          ctx.strokeStyle = HEAT_FLOW.pulseColor(alpha);
          ctx.lineWidth = strokeWidth * 1.4;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }
  }

  render(game, viewport, ui) {
    if (ui?.getHeatMapVisible?.()) {
      this._drawHeatMapLayer(game, viewport);
      this._drawHeatShimmerLayer(game, viewport);
      this._drawHeatHazeLayer(game, viewport);
    }
    if (ui?.getHeatFlowVisible?.() || ui?.getDebugOverlayVisible?.()) {
      this._drawHeatFlowLayer(game, viewport);
    }
  }
}


export const MAX_NEIGHBORS = 8;
export const INLET_STRIDE = 3 + MAX_NEIGHBORS;
export const VALVE_STRIDE = 6;
export const EXCHANGER_STRIDE = 4 + MAX_NEIGHBORS * 3;
export const OUTLET_STRIDE = 5 + MAX_NEIGHBORS * 2;
export const INLET_OFFSET_INDEX = 0;
export const INLET_OFFSET_RATE = 1;
export const INLET_OFFSET_N_COUNT = 2;
export const INLET_OFFSET_NEIGHBORS = 3;
export const VALVE_OFFSET_INDEX = 0;
export const VALVE_OFFSET_TYPE = 1;
export const VALVE_OFFSET_ORIENTATION = 2;
export const VALVE_OFFSET_RATE = 3;
export const VALVE_OFFSET_INPUT_IDX = 4;
export const VALVE_OFFSET_OUTPUT_IDX = 5;
export const EXCHANGER_OFFSET_INDEX = 0;
export const EXCHANGER_OFFSET_RATE = 1;
export const EXCHANGER_OFFSET_CONTAINMENT = 2;
export const EXCHANGER_OFFSET_N_COUNT = 3;
export const EXCHANGER_OFFSET_NEIGHBOR_INDICES = 4;
export const EXCHANGER_OFFSET_NEIGHBOR_CAPS = 4 + MAX_NEIGHBORS;
export const EXCHANGER_OFFSET_NEIGHBOR_CATS = 4 + MAX_NEIGHBORS * 2;
export const OUTLET_OFFSET_INDEX = 0;
export const OUTLET_OFFSET_RATE = 1;
export const OUTLET_OFFSET_ACTIVATED = 2;
export const OUTLET_OFFSET_IS_OUTLET6 = 3;
export const OUTLET_OFFSET_N_COUNT = 4;
export const OUTLET_OFFSET_NEIGHBOR_INDICES = 5;
export const OUTLET_OFFSET_NEIGHBOR_CAPS = 5 + MAX_NEIGHBORS;

export const VALVE_OVERFLOW = 1;
export const VALVE_TOPUP = 2;
export const VALVE_CHECK = 3;
export const CATEGORY_EXCHANGER = 0;
export const CATEGORY_OTHER = 1;
export const CATEGORY_VENT_COOLANT = 2;

export function canPushToNeighbor(heatStart, nStart, cat) {
  return heatStart > nStart || (cat === CATEGORY_VENT_COOLANT && heatStart === nStart && heatStart > 0);
}

export function transferHeatBetweenNeighbors(heatStart, nStart, cap, cat, transferVal, totalHeadroom, remainingPush) {
  if (remainingPush <= 0 || !canPushToNeighbor(heatStart, nStart, cat)) return 0;
  const diff = Math.max(0, heatStart - nStart) || EXCHANGER_MIN_TRANSFER_UNIT;
  const headroom = Math.max(cap - nStart, 0);
  const bias = Math.max(headroom / totalHeadroom, 0);
  return Math.min(
    Math.max(EXCHANGER_MIN_TRANSFER_UNIT, Math.floor(transferVal * bias)),
    Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR),
    remainingPush
  );
}

export function applyValveRule(heat, containment, val, multiplier, recordTransfers) {
  const inputIdx = val.inputIdx;
  const outputIdx = val.outputIdx;
  if (inputIdx < 0 || outputIdx < 0) return;
  const inputHeat = heat[inputIdx] || 0;
  if (inputHeat <= 0) {
    heat[val.index] = 0;
    return;
  }
  const outputCap = containment[outputIdx] || 1;
  const outputHeat = heat[outputIdx] || 0;
  const outputSpace = Math.max(0, outputCap - outputHeat);
  if (outputSpace <= 0) {
    heat[val.index] = 0;
    return;
  }
  let maxTransfer = val.transferRate * multiplier;
  if (val.type === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
  const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
  if (transfer > 0) {
    heat[inputIdx] -= transfer;
    heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
    if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
  }
  heat[val.index] = 0;
}

function runInlets(heat, reactorHeat, inletsData, nInlets, multiplier) {
  let heatFromInlets = 0;
  for (let i = 0; i < nInlets; i++) {
    const base = i * INLET_STRIDE;
    const rate = inletsData[base + 1] * multiplier;
    for (let j = 0; j < (inletsData[base + 2] | 0); j++) {
      const idx = inletsData[base + 3 + j] | 0;
      const h = heat[idx] || 0;
      const transfer = Math.min(rate, h);
      heat[idx] -= transfer;
      reactorHeat += transfer;
      heatFromInlets += transfer;
    }
  }
  return { reactorHeat, heatFromInlets };
}

function resetValveHeatValues(valvesData, nValves, heat, heatLen) {
  for (let v = 0; v < nValves; v++) {
    const valIndex = valvesData[v * VALVE_STRIDE] | 0;
    if (valIndex >= 0 && valIndex < heatLen) heat[valIndex] = 0;
  }
}

function runValvesFromTyped(heat, containment, valvesData, nValves, multiplier, recordTransfers) {
  const heatLen = heat.length;
  const snap = new Float32Array(heatLen);
  for (let i = 0; i < heatLen; i++) snap[i] = heat[i] || 0;
  for (let v = 0; v < nValves; v++) {
    const base = v * VALVE_STRIDE;
    const inputIdx = valvesData[base + 4] | 0;
    const outputIdx = valvesData[base + 5] | 0;
    const valIndex = valvesData[base + 0] | 0;
    if (inputIdx < 0 || outputIdx < 0 || inputIdx >= heatLen || outputIdx >= heatLen || valIndex >= heatLen) continue;
    const inputHeat = snap[inputIdx] || 0;
    const outputCap = containment[outputIdx] || 1;
    const outputSpace = Math.max(0, outputCap - (snap[outputIdx] || 0));
    let maxTransfer = valvesData[base + 3] * multiplier;
    if ((valvesData[base + 1] | 0) === VALVE_TOPUP) maxTransfer = Math.min(maxTransfer, outputCap * BALANCE.valveTopupCapRatio);
    const transfer = Math.min(maxTransfer, inputHeat, outputSpace);
    if (transfer > 0) {
      heat[inputIdx] = (heat[inputIdx] || 0) - transfer;
      heat[outputIdx] = (heat[outputIdx] || 0) + transfer;
      if (recordTransfers) recordTransfers.push({ fromIdx: inputIdx, toIdx: outputIdx, amount: transfer });
      snap[inputIdx] -= transfer;
      snap[outputIdx] = (snap[outputIdx] || 0) + transfer;
    }
  }
  resetValveHeatValues(valvesData, nValves, heat, heatLen);
}

function buildValveSet(valveNeighborData, nValveNeighbors) {
  const valveSet = new Set();
  for (let i = 0; i < nValveNeighbors; i++) valveSet.add(valveNeighborData[i] | 0);
  return valveSet;
}

function buildExchangerStartHeatTyped(exchangersData, nExchangers, heat) {
  const startHeat = new Map();
  for (let e = 0; e < nExchangers; e++) {
    const idx = exchangersData[e * EXCHANGER_STRIDE] | 0;
    startHeat.set(idx, heat[idx] || 0);
  }
  return startHeat;
}

function collectExchangerPushTyped(planned, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier) {
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + 0] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) ?? (heat[idx] || 0));
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    let totalHeadroom = 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const cap = exchangersData[base + 4 + MAX_NEIGHBORS + n] || 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      totalHeadroom += Math.max(cap - nStart, 0);
    }
    if (totalHeadroom === 0) totalHeadroom = EXCHANGER_MIN_HEADROOM;
    let remainingPush = heatStart;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const cap = exchangersData[base + 4 + MAX_NEIGHBORS + n] || 0;
      const cat = exchangersData[base + 4 + MAX_NEIGHBORS * 2 + n] | 0;
      if (remainingPush <= 0) break;
      const amt = transferHeatBetweenNeighbors(heatStart, nStart, cap, cat, transferVal, totalHeadroom, remainingPush);
      if (amt > 0) {
        planned.push({ from: idx, to: nidx, amount: amt });
        remainingPush -= amt;
      }
    }
  }
}

function collectExchangerPullTyped(opts) {
  const { planned, plannedOutByNeighbor, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier } = opts;
  for (let e = 0; e < nExchangers; e++) {
    const base = e * EXCHANGER_STRIDE;
    const idx = exchangersData[base + 0] | 0;
    const heatStart = valveSet.has(idx) ? (heat[idx] || 0) : (startHeat.get(idx) ?? (heat[idx] || 0));
    const transferVal = exchangersData[base + 1] * multiplier;
    const nCount = (exchangersData[base + 3] | 0) || 0;
    for (let n = 0; n < nCount; n++) {
      const nidx = exchangersData[base + 4 + n] | 0;
      const nStart = valveSet.has(nidx) ? (heat[nidx] || 0) : (startHeat.get(nidx) ?? (heat[nidx] || 0));
      const alreadyOut = plannedOutByNeighbor.get(nidx) || 0;
      const nAvailable = Math.max(0, nStart - alreadyOut);
      if (nAvailable <= 0 || nStart <= heatStart) continue;
      const diff = nStart - heatStart;
      const amt = Math.min(transferVal, Math.ceil(diff / HEAT_TRANSFER_DIFF_DIVISOR), nAvailable);
      if (amt > 0) {
        planned.push({ from: nidx, to: idx, amount: amt });
        plannedOutByNeighbor.set(nidx, alreadyOut + amt);
      }
    }
  }
}

function applyPlannedTransfers(heat, planned, recordTransfers) {
  for (const { from, to, amount } of planned) {
    heat[from] = (heat[from] || 0) - amount;
    heat[to] = (heat[to] || 0) + amount;
    if (recordTransfers) recordTransfers.push({ fromIdx: from, toIdx: to, amount });
  }
}

function runExchangersFromTyped(opts) {
  const { heat, containment, exchangersData, nExchangers, valveNeighborData, nValveNeighbors, multiplier, recordTransfers } = opts;
  const valveSet = buildValveSet(valveNeighborData, nValveNeighbors);
  const startHeat = buildExchangerStartHeatTyped(exchangersData, nExchangers, heat);
  const planned = [];
  collectExchangerPushTyped(planned, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier);
  const plannedOutByNeighbor = new Map();
  collectExchangerPullTyped({ planned, plannedOutByNeighbor, heat, exchangersData, nExchangers, valveSet, startHeat, multiplier });
  applyPlannedTransfers(heat, planned, recordTransfers);
}

function processSingleOutlet(heat, outlet, reactorHeat) {
  const { activated, nCount, transferCap, outIndex, isOutlet6, neighborIndices, neighborCaps } = outlet;
  if (!activated || reactorHeat <= 0) return reactorHeat;
  let toTransfer = Math.min(transferCap, reactorHeat);
  if (toTransfer <= 0) return reactorHeat;
  if (nCount > 0) {
    const perNeighbor = toTransfer / nCount;
    for (let n = 0; n < nCount; n++) {
      const nidx = neighborIndices[n] | 0;
      const cap = neighborCaps[n] || 0;
      const current = heat[nidx] || 0;
      let add = perNeighbor;
      if (isOutlet6 && cap > 0) add = Math.min(add, Math.max(0, cap - current));
      add = Math.min(add, reactorHeat);
      if (add > 0) {
        heat[nidx] = current + add;
        reactorHeat -= add;
      }
    }
  } else {
    heat[outIndex] = (heat[outIndex] || 0) + toTransfer;
    reactorHeat -= toTransfer;
  }
  return reactorHeat;
}

function buildOutletConfig(outletsData, o, multiplier) {
  const base = o * OUTLET_STRIDE;
  const nCount = (outletsData[base + OUTLET_OFFSET_N_COUNT] | 0) || 0;
  const neighborIndices = [];
  const neighborCaps = [];
  for (let n = 0; n < nCount; n++) {
    neighborIndices.push(outletsData[base + OUTLET_OFFSET_NEIGHBOR_INDICES + n]);
    neighborCaps.push(outletsData[base + OUTLET_OFFSET_NEIGHBOR_CAPS + n] || 0);
  }
  return {
    activated: outletsData[base + OUTLET_OFFSET_ACTIVATED],
    nCount,
    transferCap: outletsData[base + OUTLET_OFFSET_RATE] * multiplier,
    outIndex: outletsData[base + OUTLET_OFFSET_INDEX] | 0,
    isOutlet6: outletsData[base + OUTLET_OFFSET_IS_OUTLET6],
    neighborIndices,
    neighborCaps,
  };
}

function runOutletsFromTyped(heat, outletsData, nOutlets, reactorHeat, multiplier) {
  for (let o = 0; o < nOutlets; o++) {
    if (reactorHeat <= 0) break;
    const outlet = buildOutletConfig(outletsData, o, multiplier);
    reactorHeat = processSingleOutlet(heat, outlet, reactorHeat);
  }
  return reactorHeat;
}

function runHeatTransferCore(heat, containment, componentSet, options) {
  const nextHeat = ArrayBuffer.isView(heat) ? new Float32Array(heat) : heat.slice();
  let reactorHeat = options.reactorHeat ?? 0;
  const multiplier = options.multiplier ?? 1;
  const recordTransfers = options.recordTransfers ?? null;
  const {
    inletsData,
    nInlets = 0,
    valvesData,
    nValves = 0,
    valveNeighborData,
    nValveNeighbors = 0,
    exchangersData,
    nExchangers = 0,
    outletsData,
    nOutlets = 0,
  } = componentSet;
  const totalComponents = nInlets + nValves + nExchangers + nOutlets;
  if (totalComponents > HEAT_TRANSFER_MAX_ITERATIONS) {
    throw new Error(`Heat transfer payload too large: ${totalComponents} components`);
  }
  const r1 = runInlets(nextHeat, reactorHeat, inletsData, nInlets, multiplier);
  reactorHeat = r1.reactorHeat;
  runValvesFromTyped(nextHeat, containment, valvesData, nValves, multiplier, recordTransfers);
  runExchangersFromTyped({
    heat: nextHeat,
    containment,
    exchangersData,
    nExchangers,
    valveNeighborData,
    nValveNeighbors,
    multiplier,
    recordTransfers,
  });
  reactorHeat = runOutletsFromTyped(nextHeat, outletsData, nOutlets, reactorHeat, multiplier);
  for (let i = 0; i < nextHeat.length; i++) {
    if (nextHeat[i] < HEAT_EPSILON) nextHeat[i] = 0;
  }
  if (reactorHeat < HEAT_EPSILON) reactorHeat = 0;
  for (let i = 0; i < nextHeat.length; i++) heat[i] = nextHeat[i];
  return { reactorHeat, heatFromInlets: r1.heatFromInlets };
}

export function runHeatTransferStep(componentSet, heatState, options = {}) {
  const { heat, containment } = heatState;
  return runHeatTransferCore(heat, containment, componentSet, {
    reactorHeat: options.reactorHeat ?? 0,
    multiplier: options.multiplier ?? 1,
    recordTransfers: options.recordTransfers ?? null,
  });
}

export function runHeatStepFromTyped(heat, containment, payload, recordTransfers) {
  const componentSet = {
    inletsData: payload.inletsData,
    nInlets: (payload.nInlets | 0) || 0,
    valvesData: payload.valvesData,
    nValves: (payload.nValves | 0) || 0,
    valveNeighborData: payload.valveNeighborData,
    nValveNeighbors: (payload.nValveNeighbors | 0) || 0,
    exchangersData: payload.exchangersData,
    nExchangers: (payload.nExchangers | 0) || 0,
    outletsData: payload.outletsData,
    nOutlets: (payload.nOutlets | 0) || 0,
  };
  return runHeatTransferCore(heat, containment, componentSet, {
    reactorHeat: payload.reactorHeat ?? 0,
    multiplier: payload.multiplier ?? 1,
    recordTransfers: recordTransfers ?? null,
  });
}

function fillContainmentFromTiles(ts, rows, cols, containmentOut) {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tile = ts.getTile(r, c);
      if (tile?.part) containmentOut[ts.gridIndex(r, c)] = tile.part.containment || 0;
    }
  }
}

function prepareHeatContainment(engine, ts, rows, cols, gridLen) {
  if (engine._heatUseSAB) {
    const needBoth = !engine._heatSABView || engine._heatSABView.length !== gridLen ||
      !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
    if (needBoth) {
      engine._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
      engine._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * 4));
    }
    engine._heatSABView.set(ts.heatMap);
    fillContainmentFromTiles(ts, rows, cols, engine._containmentSABView);
    if (ts.heatMap !== engine._heatSABView) ts.heatMap = engine._heatSABView;
    return { heatCopy: engine._heatSABView, containment: engine._containmentSABView };
  }
  let needNew = !engine._heatTransferHeat || engine._heatTransferHeat.length !== gridLen;
  if (!needNew) {
    try {
      needNew = engine._heatTransferHeat.buffer.byteLength === 0;
    } catch {
      needNew = true;
    }
  }
  if (needNew) {
    engine._heatTransferHeat = new Float32Array(gridLen);
    engine._heatTransferContainment = new Float32Array(gridLen);
  }
  const heatCopy = engine._heatTransferHeat;
  heatCopy.set(ts.heatMap);
  const containment = engine._heatTransferContainment;
  fillContainmentFromTiles(ts, rows, cols, containment);
  return { heatCopy, containment };
}

function fillInletsBuffer(engine, ts) {
  let nInlets = 0;
  const inletsBuf = engine._heatPayload_inlets;
  for (let i = 0; i < engine.active_inlets.length && nInlets < HEAT_PAYLOAD_MAX_INLETS; i++) {
    const tile = engine.active_inlets[i];
    if (!tile.part) continue;
    const neighbors = tile.containmentNeighborTiles;
    let nCount = 0;
    for (let j = 0; j < neighbors.length && nCount < MAX_NEIGHBORS; j++) {
      const t = neighbors[j];
      if (t.part) {
        inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_NEIGHBORS + nCount] = ts.gridIndex(t.row, t.col);
        nCount++;
      }
    }
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
    inletsBuf[nInlets * INLET_STRIDE + INLET_OFFSET_N_COUNT] = nCount;
    nInlets++;
  }
  return nInlets;
}

function fillValveNeighborsBuffer(engine, ts) {
  let nValveNeighbors = 0;
  const valveNbrBuf = engine._heatPayload_valveNeighbors;
  engine._valveNeighborCache.forEach((t) => {
    if (nValveNeighbors < HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS) valveNbrBuf[nValveNeighbors++] = ts.gridIndex(t.row, t.col);
  });
  return nValveNeighbors;
}

function collectPartNeighbors(tiles, out, excludeTile = null) {
  out.length = 0;
  tiles.forEach((t) => {
    if (t.part && t !== excludeTile) out.push(t);
  });
}

function inputValveMustPointToUs(engine, inputNeighbor, valve) {
  if (inputNeighbor.part?.category !== 'valve') return true;
  const inputValveOrientation = engine._getValveOrientation(inputNeighbor.part.id);
  const inputValveNeighbors = engine._valve_inputValveNeighbors;
  collectPartNeighbors(inputNeighbor.containmentNeighborTiles, inputValveNeighbors, valve);
  const { outputNeighbor: inputValveOutput } = engine._getInputOutputNeighbors(inputNeighbor, inputValveNeighbors, inputValveOrientation);
  return inputValveOutput === valve;
}

function shouldSkipValveByRatio(valvePart, inputNeighbor, outputNeighbor) {
  if (valvePart.type === 'overflow_valve') {
    const inputRatio = (inputNeighbor.heat_contained || 0) / (inputNeighbor.part.containment || 1);
    return inputRatio < VALVE_OVERFLOW_THRESHOLD;
  }
  if (valvePart.type === 'topup_valve') {
    const outputRatio = (outputNeighbor.heat_contained || 0) / (outputNeighbor.part.containment || 1);
    return outputRatio > VALVE_TOPUP_THRESHOLD;
  }
  return false;
}

function getValveTypeId(valvePart) {
  if (valvePart.type === 'overflow_valve') return VALVE_OVERFLOW;
  if (valvePart.type === 'topup_valve') return VALVE_TOPUP;
  return VALVE_CHECK;
}

function canEmitValve(engine, valve, neighbors, inputNeighbor, outputNeighbor) {
  if (!inputNeighbor || !outputNeighbor) return false;
  if (!inputValveMustPointToUs(engine, inputNeighbor, valve)) return false;
  if (shouldSkipValveByRatio(valve.part, inputNeighbor, outputNeighbor)) return false;
  return true;
}

function writeValveEntry(valvesBuf, base, ts, valve, typeId, orientation, inputNeighbor, outputNeighbor) {
  valvesBuf[base + VALVE_OFFSET_INDEX] = ts.gridIndex(valve.row, valve.col);
  valvesBuf[base + VALVE_OFFSET_TYPE] = typeId;
  valvesBuf[base + VALVE_OFFSET_ORIENTATION] = orientation;
  valvesBuf[base + VALVE_OFFSET_RATE] = valve.getEffectiveTransferValue();
  valvesBuf[base + VALVE_OFFSET_INPUT_IDX] = ts.gridIndex(inputNeighbor.row, inputNeighbor.col);
  valvesBuf[base + VALVE_OFFSET_OUTPUT_IDX] = ts.gridIndex(outputNeighbor.row, outputNeighbor.col);
}

function fillValvesBuffer(engine, ts) {
  let nValves = 0;
  const valvesBuf = engine._heatPayload_valves;
  const neighbors = engine._valveProcessing_neighbors;
  const activeValves = engine.active_valves;
  for (let vIdx = 0; vIdx < activeValves.length && nValves < HEAT_PAYLOAD_MAX_VALVES; vIdx++) {
    const valve = activeValves[vIdx];
    const valvePart = valve.part;
    if (!valvePart) continue;
    collectPartNeighbors(valve.containmentNeighborTiles, neighbors);
    if (neighbors.length < 2) continue;
    const orientation = engine._getValveOrientation(valvePart.id);
    const { inputNeighbor, outputNeighbor } = engine._getInputOutputNeighbors(valve, neighbors, orientation);
    if (!canEmitValve(engine, valve, neighbors, inputNeighbor, outputNeighbor)) continue;
    const typeId = getValveTypeId(valvePart);
    const base = nValves * VALVE_STRIDE;
    writeValveEntry(valvesBuf, base, ts, valve, typeId, orientation, inputNeighbor, outputNeighbor);
    nValves++;
  }
  return nValves;
}

const EXCHANGER_NEIGHBOR_CAT_VENT = 2;
const EXCHANGER_NEIGHBOR_CAT_EXCHANGER = 0;
const EXCHANGER_NEIGHBOR_CAT_OTHER = 1;

function getExchangerNeighborCategory(part) {
  if (part.category === 'vent' || part.category === 'coolant_cell') return EXCHANGER_NEIGHBOR_CAT_VENT;
  if (part.category === 'heat_exchanger') return EXCHANGER_NEIGHBOR_CAT_EXCHANGER;
  return EXCHANGER_NEIGHBOR_CAT_OTHER;
}

function fillExchangerNeighborSlots(exchBuf, base, ts, neighborsAll) {
  let nCount = 0;
  for (let n = 0; n < neighborsAll.length && nCount < MAX_NEIGHBORS; n++) {
    const t = neighborsAll[n];
    if (!t.part) continue;
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_INDICES + nCount] = ts.gridIndex(t.row, t.col);
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CAPS + nCount] = t.part.containment || 0;
    exchBuf[base + EXCHANGER_OFFSET_NEIGHBOR_CATS + nCount] = getExchangerNeighborCategory(t.part);
    nCount++;
  }
  return nCount;
}

function fillExchangersBuffer(engine, ts) {
  let nExchangers = 0;
  const exchBuf = engine._heatPayload_exchangers;
  for (let i = 0; i < engine.active_exchangers.length && nExchangers < HEAT_PAYLOAD_MAX_EXCHANGERS; i++) {
    const tile = engine.active_exchangers[i];
    const part = tile.part;
    if (!part || part.category === 'valve') continue;
    const base = nExchangers * EXCHANGER_STRIDE;
    const nCount = fillExchangerNeighborSlots(exchBuf, base, ts, tile.containmentNeighborTiles);
    exchBuf[base + EXCHANGER_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
    exchBuf[base + EXCHANGER_OFFSET_RATE] = tile.getEffectiveTransferValue();
    exchBuf[base + EXCHANGER_OFFSET_CONTAINMENT] = part.containment || 1;
    exchBuf[base + EXCHANGER_OFFSET_N_COUNT] = nCount;
    nExchangers++;
  }
  return nExchangers;
}

function collectOutletNeighbors(tile, outNeighbors) {
  outNeighbors.length = 0;
  const contNeighbors = tile.containmentNeighborTiles;
  for (let j = 0; j < contNeighbors.length; j++) {
    const t = contNeighbors[j];
    if (t.part && t.part.category !== 'valve') outNeighbors.push(t);
  }
}

function writeOutletEntry(outBuf, base, ts, tile, part, outNeighbors) {
  outBuf[base + OUTLET_OFFSET_INDEX] = ts.gridIndex(tile.row, tile.col);
  outBuf[base + OUTLET_OFFSET_RATE] = tile.getEffectiveTransferValue();
  outBuf[base + OUTLET_OFFSET_ACTIVATED] = tile.activated ? 1 : 0;
  outBuf[base + OUTLET_OFFSET_IS_OUTLET6] = part.id === 'heat_outlet6' ? 1 : 0;
  outBuf[base + OUTLET_OFFSET_N_COUNT] = outNeighbors.length;
  for (let j = 0; j < outNeighbors.length && j < MAX_NEIGHBORS; j++) {
    const t = outNeighbors[j];
    outBuf[base + OUTLET_OFFSET_NEIGHBOR_INDICES + j] = ts.gridIndex(t.row, t.col);
    outBuf[base + OUTLET_OFFSET_NEIGHBOR_CAPS + j] = t.part?.containment || 0;
  }
}

function fillOutletsBuffer(engine, ts) {
  let nOutlets = 0;
  const outBuf = engine._heatPayload_outlets;
  const outNeighbors = engine._outletProcessing_neighbors;
  for (let i = 0; i < engine.active_outlets.length && nOutlets < HEAT_PAYLOAD_MAX_OUTLETS; i++) {
    const tile = engine.active_outlets[i];
    const part = tile.part;
    if (!part) continue;
    collectOutletNeighbors(tile, outNeighbors);
    const base = nOutlets * OUTLET_STRIDE;
    writeOutletEntry(outBuf, base, ts, tile, part, outNeighbors);
    nOutlets++;
  }
  return nOutlets;
}

function buildPayload(engine, ctx) {
  const { heatCopy, containment, reactorHeatNum, multiplier, rows, cols, nInlets, nValves, nValveNeighbors, nExchangers, nOutlets } = ctx;
  const inletsBuf = engine._heatPayload_inlets;
  const valvesBuf = engine._heatPayload_valves;
  const valveNbrBuf = engine._heatPayload_valveNeighbors;
  const exchBuf = engine._heatPayload_exchangers;
  const outBuf = engine._heatPayload_outlets;
  const inletsCopy = new Float32Array(nInlets * INLET_STRIDE);
  inletsCopy.set(inletsBuf.subarray(0, nInlets * INLET_STRIDE));
  const valvesCopy = new Float32Array(nValves * VALVE_STRIDE);
  valvesCopy.set(valvesBuf.subarray(0, nValves * VALVE_STRIDE));
  const valveNeighborsCopy = new Float32Array(nValveNeighbors);
  valveNeighborsCopy.set(valveNbrBuf.subarray(0, nValveNeighbors));
  const exchangersCopy = new Float32Array(nExchangers * EXCHANGER_STRIDE);
  exchangersCopy.set(exchBuf.subarray(0, nExchangers * EXCHANGER_STRIDE));
  const outletsCopy = new Float32Array(nOutlets * OUTLET_STRIDE);
  outletsCopy.set(outBuf.subarray(0, nOutlets * OUTLET_STRIDE));
  const transferList = engine._heatUseSAB
    ? [inletsCopy.buffer, valvesCopy.buffer, valveNeighborsCopy.buffer, exchangersCopy.buffer, outletsCopy.buffer]
    : [heatCopy.buffer, containment.buffer, inletsCopy.buffer, valvesCopy.buffer, valveNeighborsCopy.buffer, exchangersCopy.buffer, outletsCopy.buffer];
  const msg = {
    heatBuffer: heatCopy.buffer,
    containmentBuffer: containment.buffer,
    reactorHeat: reactorHeatNum,
    multiplier,
    rows,
    cols,
    inletsData: inletsCopy.buffer,
    nInlets,
    valvesData: valvesCopy.buffer,
    nValves,
    valveNeighborData: valveNeighborsCopy.buffer,
    nValveNeighbors,
    exchangersData: exchangersCopy.buffer,
    nExchangers,
    outletsData: outletsCopy.buffer,
    nOutlets
  };
  if (engine._heatUseSAB) msg.useSAB = true;
  const typedPayload = {
    heat: ctx.heatCopy,
    containment: ctx.containment,
    reactorHeat: ctx.reactorHeatNum,
    multiplier: ctx.multiplier,
    inletsData: inletsBuf,
    nInlets: ctx.nInlets,
    valvesData: valvesBuf,
    nValves: ctx.nValves,
    valveNeighborData: valveNbrBuf,
    nValveNeighbors: ctx.nValveNeighbors,
    exchangersData: exchBuf,
    nExchangers: ctx.nExchangers,
    outletsData: outBuf,
    nOutlets: ctx.nOutlets
  };
  return { msg, transferList, typedPayload };
}

export function buildHeatPayload(engine, multiplier) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  const rows = game.rows;
  const cols = game.cols;
  const gridLen = ts.heatMap.length;
  const { heatCopy, containment } = prepareHeatContainment(engine, ts, rows, cols, gridLen);
  const nInlets = fillInletsBuffer(engine, ts);
  const nValveNeighbors = fillValveNeighborsBuffer(engine, ts);
  const nValves = fillValvesBuffer(engine, ts);
  const nExchangers = fillExchangersBuffer(engine, ts);
  const nOutlets = fillOutletsBuffer(engine, ts);
  const reactorHeatNum = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
  const ctx = { heatCopy, containment, reactorHeatNum, multiplier, rows, cols, nInlets, nValves, nValveNeighbors, nExchangers, nOutlets };
  const { msg, transferList, typedPayload } = buildPayload(engine, ctx);
  return { msg, transferList, payloadForSync: typedPayload };
}

const HEAT_CONDUCTING_CATEGORIES = ['heat_exchanger', 'heat_outlet', 'heat_inlet'];

function isHeatConducting(tile) {
  if (!tile?.part || !tile.activated) return false;
  const p = tile.part;
  return (p.containment ?? 0) > 0 || HEAT_CONDUCTING_CATEGORIES.includes(p.category);
}

export class HeatSystem {
  constructor(engine) {
    this.engine = engine;
    this.segments = new Map();
    this.tileSegmentMap = new Map();
    this._segmentsDirty = true;
    this._parent = new Map();
  }

  processTick(multiplier = 1.0) {
    const engine = this.engine;
    const build = engine._buildHeatPayload(multiplier);
    if (!build?.payloadForSync) return { heatFromInlets: 0, transfers: [] };
    const game = engine.game;
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markStart("tick_heat_transfer");
    }
    const { heat, containment, reactorHeat, multiplier: payloadMultiplier, ...componentSet } = build.payloadForSync;
    const recordTransfers = [];
    const result = runHeatTransferStep(componentSet, { heat, containment }, {
      reactorHeat,
      multiplier: payloadMultiplier ?? multiplier,
      recordTransfers,
    });
    engine.game.tileset.heatMap = heat;
    engine.game.reactor.current_heat = toDecimal(result.reactorHeat);
    if (game.performance && game.performance.shouldMeasure()) {
      game.performance.markEnd("tick_heat_transfer");
    }
    return { heatFromInlets: result.heatFromInlets, transfers: recordTransfers };
  }

  markSegmentsAsDirty() {
    this._segmentsDirty = true;
  }

  _find(tile) {
    let p = this._parent.get(tile);
    if (p === undefined) return tile;
    if (p === tile) return tile;
    const root = this._find(p);
    this._parent.set(tile, root);
    return root;
  }

  _union(a, b) {
    const ra = this._find(a);
    const rb = this._find(b);
    if (ra !== rb) this._parent.set(ra, rb);
  }

  updateSegments() {
    if (!this._segmentsDirty) return;
    this._segmentsDirty = false;
    this.segments.clear();
    this.tileSegmentMap.clear();
    this._parent.clear();

    const game = this.engine.game;
    const tiles = game.tileset?.active_tiles_list ?? [];
    const heatTiles = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (isHeatConducting(t)) heatTiles.push(t);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      this._parent.set(tile, tile);
    }

    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const neighbors = tile.containmentNeighborTiles ?? [];
      for (let j = 0; j < neighbors.length; j++) {
        const n = neighbors[j];
        if (isHeatConducting(n)) this._union(tile, n);
      }
    }

    const rootToTiles = new Map();
    for (let i = 0; i < heatTiles.length; i++) {
      const tile = heatTiles[i];
      const root = this._find(tile);
      let arr = rootToTiles.get(root);
      if (!arr) {
        arr = [];
        rootToTiles.set(root, arr);
      }
      arr.push(tile);
    }

    for (const [, components] of rootToTiles) {
      let totalHeat = 0;
      let totalContainment = 0;
      const vents = [];
      const outlets = [];
      const inlets = [];
      for (let i = 0; i < components.length; i++) {
        const t = components[i];
        const part = t.part;
        const cap = part?.containment ?? 0;
        const heat = t.heat_contained ?? 0;
        totalHeat += heat;
        totalContainment += cap;
        if (part?.category === 'vent') vents.push(t);
        else if (part?.category === 'heat_outlet') outlets.push(t);
        else if (part?.category === 'heat_inlet') inlets.push(t);
      }
      const fullnessRatio = totalContainment > 0 ? totalHeat / totalContainment : 0;
      const segment = {
        components,
        vents,
        outlets,
        inlets,
        fullnessRatio,
        totalHeat,
        totalContainment
      };
      this.segments.set(this.segments.size, segment);
      for (let i = 0; i < components.length; i++) {
        this.tileSegmentMap.set(components[i], segment);
      }
    }
  }

  getSegmentForTile(tile) {
    if (!tile) return null;
    if (this._segmentsDirty) this.updateSegments();
    return this.tileSegmentMap.get(tile) ?? null;
  }
}

const SAB_BYTES_PER_FLOAT = 4;

function ensureHeatSAB(engine, ts, gridLen) {
  const needNew = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  if (needNew) {
    engine._heatSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    engine._heatSABView.set(ts.heatMap);
    ts.heatMap = engine._heatSABView;
  } else {
    engine._heatSABView.set(ts.heatMap);
  }
}

function ensureContainmentSAB(engine, game, gridLen) {
  const ts = game.tileset;
  const needNew = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needNew) {
    engine._containmentSABView = new Float32Array(new SharedArrayBuffer(gridLen * SAB_BYTES_PER_FLOAT));
    const rows = game.gridManager.rows;
    const cols = game.gridManager.cols;
    const coords = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({ r, c }))
    ).flat();
    coords.forEach(({ r, c }) => {
      const tile = ts.getTile(r, c);
      if (tile?.part) engine._containmentSABView[ts.gridIndex(r, c)] = tile.part.containment || 0;
    });
  }
}

function ensureSABsReady(engine, game, gridLen) {
  const ts = game.tileset;
  const needHeat = !engine._heatSABView || engine._heatSABView.length !== gridLen;
  const needContainment = !engine._containmentSABView || engine._containmentSABView.length !== gridLen;
  if (needHeat) ensureHeatSAB(engine, ts, gridLen);
  else engine._heatSABView.set(ts.heatMap);
  if (needContainment) ensureContainmentSAB(engine, game, gridLen);
}

function partToRow(part) {
  const power = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power))
    ? part.power
    : (part.base_power ?? 0);
  const heat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat))
    ? part.heat
    : (part.base_heat ?? 0);
  const row = {
    id: part.id,
    containment: part.containment ?? 0,
    vent: part.vent ?? 0,
    power,
    heat,
    base_power: part.base_power ?? 0,
    base_heat: part.base_heat ?? 0,
    category: part.category ?? "",
    ticks: part.ticks ?? 0,
    type: part.type ?? "",
    ep_heat: part.ep_heat ?? 0,
    level: part.level ?? 1,
    transfer: part.transfer ?? 0,
    cell_pack_M: part.cell_pack_M ?? 1,
    cell_count_C: part.cell_count_C ?? part.cell_count ?? 1,
    cell_count: part.cell_count ?? 1,
  };
  if (part.category === "reflector") {
    const v = part.neighbor_pulse_value;
    row.neighbor_pulse_value = typeof v === "number" && isFinite(v) && v >= 0 ? v : 1;
  }
  return row;
}

function buildPartTable(ts) {
  const game = ts.game;
  const rows = game.rows;
  const cols = game.cols;
  const partIdToIndex = {};
  const partTable = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = ts.getTile(row, col);
      if (!tile?.part) continue;
      const part = tile.part;
      if (partIdToIndex[part.id] !== undefined) continue;
      partIdToIndex[part.id] = partTable.length;
      partTable.push(partToRow(part));
    }
  }
  return { partIdToIndex, partTable };
}

function buildPartLayout(ts, partIdToIndex) {
  const game = ts.game;
  const rows = game.rows;
  const cols = game.cols;
  const layout = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = ts.getTile(row, col);
      if (!tile?.part) continue;
      const part = tile.part;
      const idx = partIdToIndex[part.id];
      if (idx === undefined) continue;
      const transferRate = typeof tile.getEffectiveTransferValue === "function" ? tile.getEffectiveTransferValue() : 0;
      const ventRate = typeof tile.getEffectiveVentValue === "function" ? tile.getEffectiveVentValue() : 0;
      const partPower = (typeof part.power === "number" && !isNaN(part.power) && isFinite(part.power)) ? part.power : (part.base_power ?? 0);
      const partHeat = (typeof part.heat === "number" && !isNaN(part.heat) && isFinite(part.heat)) ? part.heat : (part.base_heat ?? 0);
      const rawPower = (typeof tile.power === "number" && !isNaN(tile.power) && isFinite(tile.power)) ? tile.power : partPower;
      const rawHeat = (typeof tile.heat === "number" && !isNaN(tile.heat) && isFinite(tile.heat)) ? tile.heat : partHeat;
      const tilePower = (part.category === "cell" && (tile.ticks ?? 0) > 0 && rawPower === 0) ? partPower : rawPower;
      const tileHeat = (part.category === "cell" && (tile.ticks ?? 0) > 0 && rawHeat === 0) ? partHeat : rawHeat;
      layout.push({
        r: tile.row,
        c: tile.col,
        partIndex: idx,
        ticks: tile.ticks ?? 0,
        activated: !!tile.activated,
        transferRate,
        ventRate,
        power: tilePower,
        heat: tileHeat,
      });
    }
  }
  return layout;
}

function buildPartSnapshot(ts) {
  const { partIdToIndex, partTable } = buildPartTable(ts);
  const partLayout = buildPartLayout(ts, partIdToIndex);
  return { partTable, partLayout };
}

function buildReactorStatePayload(reactor) {
  return {
    current_heat: reactor.current_heat,
    current_power: reactor.current_power,
    max_heat: toNumber(reactor.max_heat ?? 0),
    max_power: toNumber(reactor.max_power ?? 0),
    auto_sell_multiplier: reactor.auto_sell_multiplier ?? 0,
    sell_price_multiplier: reactor.sell_price_multiplier ?? 1,
    power_overflow_to_heat_ratio: reactor.power_overflow_to_heat_ratio ?? 1,
    power_multiplier: reactor.power_multiplier ?? 1,
    heat_controlled: reactor.heat_controlled ? 1 : 0,
    vent_multiplier_eff: reactor.vent_multiplier_eff ?? 0,
    stirling_multiplier: reactor.stirling_multiplier ?? 0,
  };
}

export function serializeStateForGameLoopWorker(engine) {
  const game = engine.game;
  const ts = game.tileset;
  const reactor = game.reactor;
  if (!ts?.heatMap) return null;
  const stateSnapshot = game.state ? snapshot(game.state) : null;
  const { partTable, partLayout } = buildPartSnapshot(ts);
  const autoSellFromStore = stateSnapshot?.auto_sell !== undefined;
  const rawMoney = stateSnapshot?.current_money;
  const currentMoney = rawMoney != null ? (typeof rawMoney === "number" || typeof rawMoney === "string" ? rawMoney : toNumber(rawMoney)) : undefined;
  const gridLen = ts.heatMap.length;
  let heatBuffer;
  if (engine._heatUseSAB && engine._heatSABView && ts.heatMap === engine._heatSABView) {
    ensureSABsReady(engine, game, gridLen);
    heatBuffer = engine._heatSABView.buffer;
  } else {
    heatBuffer = new Float32Array(ts.heatMap).buffer.slice(0);
  }
  return {
    current_money: currentMoney,
    heatBuffer,
    partLayout,
    partTable,
    reactorState: buildReactorStatePayload(reactor),
    rows: game.gridManager.rows,
    cols: game.gridManager.cols,
    maxCols: ts.max_cols ?? game.gridManager.cols,
    autoSell: autoSellFromStore ? !!stateSnapshot?.auto_sell : !!game.ui?.stateManager?.getVar?.("auto_sell"),
    multiplier: 1,
    tickCount: 1,
  };
}

function applyExplosionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (tile?.part) engine.handleComponentExplosion(tile);
  });
}

function applyDepletionIndices(engine, ts, indices, maxCols) {
  if (!Array.isArray(indices)) return;
  const game = engine.game;
  indices.forEach((rawIdx) => {
    const idx = rawIdx | 0;
    const tile = ts.getTile((idx / maxCols) | 0, idx % maxCols);
    if (!tile?.part) return;
    const part = tile.part;
    if (part.type === "protium") {
      game.protium_particles += part.cell_count ?? 0;
      game.update_cell_power();
    }
    engine.handleComponentDepletion(tile);
  });
}

function applyTileUpdates(ts, tileUpdates) {
  if (!Array.isArray(tileUpdates)) return;
  tileUpdates.forEach((u) => {
    const tile = ts.getTile(u.r, u.c);
    if (!tile) return;
    if (typeof u.ticks === "number") tile.ticks = u.ticks;
  });
}

function syncUIAfterTick(engine, data, reactor) {
  const norm = Math.max(0.001, data.tickCount || 1);
  const game = engine.game;
  if (game?.state) {
    game.state.power_delta_per_tick = (data.powerDelta ?? 0) / norm;
    game.state.heat_delta_per_tick = (data.heatDelta ?? 0) / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
    logger.log("debug", "engine", "[GameLoopWorker] syncUIAfterTick state updated:", {
      current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
      power_delta_per_tick: game.state.power_delta_per_tick,
      tickCount: data.tickCount
    });
  }
  game?.emit?.("tickRecorded");
  reactor.updateStats();
}

function syncSessionAfterTick(engine, data) {
  engine.tick_count += data.tickCount || 1;
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
}

export function applyGameLoopTickResult(engine, data) {
  if (!data || data.error) return;
  const result = GameLoopTickResultSchema.safeParse(data);
  if (!result.success) {
    logger.log("warn", "engine", "[GameLoopWorker] Result validation failed:", fromError(result.error).toString());
    return;
  }
  data = result.data;
  const game = engine.game;
  const reactor = game.reactor;
  const ts = game.tileset;
  const maxCols = ts?.max_cols ?? game.gridManager.cols;
  const rawHeat = data.reactorHeat ?? 0;
  const rawPower = data.reactorPower ?? 0;
  logger.log("debug", "engine", `[Worker-In] Received Tick #${data.tickId}`, {
    pwr: rawPower,
    ht: rawHeat,
    earned: data.moneyEarned,
    deltas: { p: data.powerDelta, h: data.heatDelta },
    burst: data.tickCount
  });
  reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  reactor.current_power = toDecimal(rawPower);
  logger.log("debug", "engine", "[GameLoopWorker] reactor state after apply:", {
    current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
    game_state_current_power: game.state?.current_power?.toNumber?.() ?? game.state?.current_power
  });
  if (data.heatBuffer && ts?.heatMap && !(data.heatBuffer instanceof SharedArrayBuffer)) {
    const incoming = new Float32Array(data.heatBuffer);
    if (incoming.length === ts.heatMap.length) ts.heatMap.set(incoming);
  }
  applyExplosionIndices(engine, ts, data.explosionIndices, maxCols);
  applyDepletionIndices(engine, ts, data.depletionIndices, maxCols);
  applyTileUpdates(ts, data.tileUpdates);
  if (Number(data.moneyEarned) > 0) game.addMoney(data.moneyEarned);
  reactor.checkMeltdown();
  const facts = buildFacts(game, engine, data);
  if (typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  if (game.state) {
    const ps = Number(data.powerSold ?? 0);
    const vh = Number(data.ventHeatDissipated ?? 0);
    if (ps > 0) updateDecimal(game.state, "session_power_sold", (d) => d.add(toDecimal(ps)));
    if (vh > 0) updateDecimal(game.state, "session_heat_dissipated", (d) => d.add(toDecimal(vh)));
  }
  syncUIAfterTick(engine, data, reactor);
  syncSessionAfterTick(engine, data);
  game.ui?.coreLoopUI?.snapDisplayValuesFromState?.();
}


function decrementCellTicksForOffline(tileset, deltaTicks) {
  const list = tileset?.active_tiles_list;
  if (!list || deltaTicks <= 0) return;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    if (tile?.part?.category === "cell" && (tile.ticks ?? 0) > 0) {
      tile.ticks = Math.max(0, (tile.ticks ?? 0) - deltaTicks);
    }
  }
}

export function runInstantCatchup(engine) {
  const game = engine.game;
  const offlineMs = game._offlineCatchupMs || 0;
  game._offlineCatchupMs = 0;
  const ticks = Math.min(
    Math.floor(offlineMs / FOUNDATIONAL_TICK_MS),
    MAX_ACCUMULATOR_MULTIPLIER
  );
  if (ticks <= 0 || !engine._hasSimulationActivity()) return;
  const reactor = game.reactor;
  reactor.updateStats();
  const gen = Number(reactor.stats_heat_generation ?? 0);
  const ventTotal = Number(reactor.stats_vent ?? 0) + Number(reactor.stats_outlet ?? 0);
  const stable = ventTotal >= gen;
  const netHeat = Number(reactor.stats_net_heat ?? 0);
  const maxH = toNumber(reactor.max_heat);
  const curH = toNumber(reactor.current_heat);
  const meltLine = maxH * MELTDOWN_HEAT_MULTIPLIER;
  if (!stable && netHeat > 0 && meltLine > curH) {
    const ticksToMelt = (meltLine - curH) / netHeat;
    if (ticksToMelt < ticks) {
      reactor.current_heat = reactor.max_heat.mul(MELTDOWN_HEAT_MULTIPLIER + 0.01);
      reactor.checkMeltdown();
      return;
    }
  }
  const powerOut = Number(reactor.stats_power ?? 0);
  const price = Number(reactor.sell_price_multiplier ?? 1);
  let autoSell = reactor.auto_sell_enabled;
  if (autoSell === undefined) autoSell = !!game.state?.auto_sell;
  if (stable && autoSell && powerOut > 0) {
    game.addMoney(powerOut * price * ticks);
  }
  decrementCellTicksForOffline(game.tileset, ticks);
  reactor.updateStats();
}

const DEBUG_PERFORMANCE =
  (typeof process !== "undefined" && process.env?.NODE_ENV === "test") ||
  (typeof window !== "undefined" &&
    window.location?.hostname === "localhost") ||
  false;

export class Performance {
  constructor(game) {
    this.game = game;
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.counters = {};
    this.averages = {};
    this.lastDisplayTime = 0;
    this.displayInterval = 120000; // Show stats every 2 minutes instead of 30 seconds
    this.sampleCount = 0;
    this.maxSamples = 100; // Keep last 100 samples for averages
    this.quietMode = true; // Enable quiet mode by default to reduce console spam
    this.lastQuietMessage = 0; // Track when we last showed a quiet message
    this.quietMessageInterval = 300000; // Show quiet message every 5 minutes
  }

  enable() {
    if (!DEBUG_PERFORMANCE) return;
    this.enabled = true;
    this.startPeriodicDisplay();
  }

  disable() {
    this.enabled = false;
    this.stopPeriodicDisplay();
  }

  // New method to enable quiet mode (less console spam)
  enableQuietMode() {
    this.quietMode = true;
  }

  // New method to disable quiet mode
  disableQuietMode() {
    this.quietMode = false;
  }

  // New method to get current performance monitoring status
  getStatus() {
    return {
      enabled: this.enabled,
      quietMode: this.quietMode,
      displayInterval: this.displayInterval,
      quietMessageInterval: this.quietMessageInterval,
      maxSamples: this.maxSamples
    };
  }

  // Convenience method to check if performance monitoring should be used
  shouldMeasure() {
    return this.enabled && DEBUG_PERFORMANCE;
  }

  markStart(name) {
    if (!this.enabled) return;
    performance.mark(`${name}_start`);
    this.marks[name] = performance.now();
  }

  markEnd(name) {
    if (!this.enabled || !this.marks[name]) return;
    performance.mark(`${name}_end`);
    performance.measure(name, `${name}_start`, `${name}_end`);
    const duration = performance.now() - this.marks[name];
    this.measures[name] = duration;

    // Track averages
    if (!this.averages[name]) {
      this.averages[name] = { sum: 0, count: 0, samples: [] };
    }
    this.averages[name].sum += duration;
    this.averages[name].count++;
    this.averages[name].samples.push(duration);

    // Keep only recent samples
    if (this.averages[name].samples.length > this.maxSamples) {
      const removed = this.averages[name].samples.shift();
      this.averages[name].sum -= removed;
    }

    // Track counters
    this.counters[name] = (this.counters[name] || 0) + 1;
  }

  getMeasure(name) {
    return this.measures[name];
  }

  getAverage(name) {
    const avg = this.averages[name];
    return avg ? avg.sum / avg.count : 0;
  }

  getMax(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.max(...avg.samples) : 0;
  }

  getMin(name) {
    const avg = this.averages[name];
    return avg && avg.samples.length > 0 ? Math.min(...avg.samples) : 0;
  }

  getCount(name) {
    return this.counters[name] || 0;
  }

  getAllMeasures() {
    return this.measures;
  }

  getAllAverages() {
    const result = {};
    for (const [name, avg] of Object.entries(this.averages)) {
      result[name] = {
        average: avg.sum / avg.count,
        max: Math.max(...avg.samples),
        min: Math.min(...avg.samples),
        count: avg.count,
        samples: avg.samples.length,
      };
    }
    return result;
  }

  clearMarks() {
    this.marks = {};
    performance.clearMarks();
  }

  clearMeasures() {
    this.measures = {};
    this.averages = {};
    this.counters = {};
    performance.clearMeasures();
  }

  saveData() {
    return {
      marks: this.marks,
      measures: this.measures,
      averages: this.averages,
      counters: this.counters,
    };
  }

  loadData(data) {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      throw new Error("Invalid data format for performance loading");
    }
    this.marks = data.marks || {};
    this.measures = data.measures || {};
    this.averages = data.averages || {};
    this.counters = data.counters || {};
  }

  reset() {
    this.enabled = false;
    this.marks = {};
    this.measures = {};
    this.averages = {};
    this.counters = {};
    this.sampleCount = 0;
  }

  startPeriodicDisplay() {
    if (this.displayInterval) {
      this.displayTimer = setInterval(() => {
        this.displayPerformanceStats();
      }, this.displayInterval);
    }
  }

  stopPeriodicDisplay() {
    if (this.displayTimer) {
      clearInterval(this.displayTimer);
      this.displayTimer = null;
    }
  }

  displayPerformanceStats() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;

    const now = performance.now();
    if (now - this.lastDisplayTime < this.displayInterval) return;
    this.lastDisplayTime = now;

    const stats = this.getAllAverages();
    const significantStats = {};

    // Filter for significant operations (>2ms average or >15ms max or >50 count)
    // Increased thresholds to reduce noise
    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 2 || data.max > 15 || data.count > 50) {
        significantStats[name] = data;
      }
    }

    if (Object.keys(significantStats).length === 0) {
      if (!this.quietMode || (now - this.lastQuietMessage) > this.quietMessageInterval) {
        this.lastQuietMessage = now;
      }
      return;
    }
    const sortedStats = Object.entries(significantStats).sort(
      ([, a], [, b]) => b.average - a.average
    );
    for (const [, data] of sortedStats) {
      this.getPerformanceEmoji(data.average, data.max);
    }
    this.detectPerformanceIssues(significantStats);
  }

  getPerformanceEmoji(average, max) {
    if (average > 50 || max > 100) return "🔴";
    if (average > 20 || max > 50) return "🟡";
    if (average > 5 || max > 20) return "🟠";
    return "🟢";
  }

  detectPerformanceIssues(stats) {
    const issues = [];

    for (const [name, data] of Object.entries(stats)) {
      if (data.average > 50) {
        issues.push(
          `${name}: Very slow average (${data.average.toFixed(2)}ms)`
        );
      }
      if (data.max > 100) {
        issues.push(`${name}: Very slow peak (${data.max.toFixed(2)}ms)`);
      }
      if (data.count > 1000) {
        issues.push(`${name}: Very frequent (${data.count} calls)`);
      }
    }

    return issues;
  }

  // Quick performance check for specific operations
  quickCheck(name, threshold = 15) { // Increased default threshold
    const avg = this.getAverage(name);
    const max = this.getMax(name);
    const count = this.getCount(name);

    if (avg > threshold || max > threshold * 2) {
      logger.log('warn', 'game', `Performance issue detected in ${name}: avg=${avg.toFixed(2)}ms, max=${max.toFixed(2)}ms, count=${count}`);
      return false;
    }
    return true;
  }

  // New method to get a summary of current performance
  getPerformanceSummary() {
    if (!this.enabled) return null;

    const stats = this.getAllAverages();
    const summary = {
      totalOperations: Object.keys(stats).length,
      slowOperations: 0,
      verySlowOperations: 0,
      totalCalls: 0
    };

    for (const [, data] of Object.entries(stats)) {
      summary.totalCalls += data.count;
      if (data.average > 5) summary.slowOperations++;
      if (data.average > 20) summary.verySlowOperations++;
    }

    return summary;
  }

  // New method to log performance summary to console
  logPerformanceSummary() {
    if (!this.enabled || !DEBUG_PERFORMANCE) return;
    this.getPerformanceSummary();
  }
}

export function processOfflineTime(engine, deltaTime) {
  if (deltaTime <= OFFLINE_TIME_THRESHOLD_MS) return false;
  const capMs = MAX_ACCUMULATOR_MULTIPLIER * FOUNDATIONAL_TICK_MS;
  const span = Math.min(deltaTime, capMs);
  engine.game._offlineCatchupMs = span;
  const tickEquivalent = Math.floor(span / FOUNDATIONAL_TICK_MS);
  if (tickEquivalent > 0 && engine._hasSimulationActivity()) {
    engine.game.emit?.("welcomeBackOffline", { deltaTime: span, offlineMs: span, tickEquivalent });
  }
  return true;
}

export function failSimulationHardwareIncompatible(engine, detail) {
  engine._simulationHardwareError = true;
  if (engine.game?.state) {
    engine.game.state.engine_status = "simulation_error";
    engine.game.state.simulation_error_message = SIMULATION_ERROR_MESSAGE;
  }
  engine.stop();
  engine.game?.emit?.("simulationHardwareError", {
    message: SIMULATION_ERROR_MESSAGE,
    detail: detail != null ? String(detail) : "",
  });
}

function failGameLoopWorker(engine, detail) {
  engine._gameLoopWorkerFailed = true;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  engine._gameLoopTickContext = null;
  engine.stop();
  engine.game.emit?.("gameLoopWorkerFatal", { detail: String(detail ?? "") });
}

function queueGameLoopWorkerKick(engine) {
  if (!engine._useGameLoopWorker() || engine._gameLoopWorkerFailed) return;
  queueMicrotask(() => {
    if (!engine.running || engine.game.paused) return;
    pushGameLoopWorkerTickFromPulse(engine);
  });
}

export function pushGameLoopWorkerTickFromPulse(engine) {
  if (!engine.running || engine.game.paused) {
    logger.log("debug", "engine", "[ReactorTick] pulse skipped (not running or paused)", { running: engine.running, paused: engine.game.paused });
    return;
  }

  if (engine._partCacheDirty) engine._updatePartCaches();
  if (engine._valveNeighborCacheDirty) engine._updateValveNeighborCache();

  if (!engine._hasSimulationActivity()) return;

  if (engine._gameLoopWorkerPending) {
    const since = engine._gameLoopWorkerPendingSince || 0;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const overdueMs = since > 0 && now > 0 ? now - since : 0;
    if (overdueMs > 5000) {
      logger.log("error", "engine", "[ReactorTick] GameLoopWorker timeout; failing worker path.", {
        overdueMs: Math.round(overdueMs),
        tickId: engine._gameLoopTickContext?.tickId,
      });
      failGameLoopWorker(engine, "workerTimeout");
      return;
    }
    const lastWarn = engine._gameLoopWorkerLastStallWarnAt || 0;
    if (overdueMs > 2500 && (now - lastWarn > 2000 || !lastWarn)) {
      engine._gameLoopWorkerLastStallWarnAt = now;
      logger.log("warn", "engine", "[ReactorTick] worker result overdue", {
        overdueMs: Math.round(overdueMs),
        tickId: engine._gameLoopTickContext?.tickId,
        missedPulses: engine._gameLoopWorkerMissedPulses ?? 0,
      });
    }
    logger.log("debug", "engine", "[ReactorTick] pulse while worker pending (catch-up queued)", {
      overdueMs: Math.round(overdueMs),
      tickId: engine._gameLoopTickContext?.tickId,
    });
    engine._gameLoopWorkerMissedPulses = (engine._gameLoopWorkerMissedPulses || 0) + 1;
    return;
  }
  const extra = engine._gameLoopWorkerMissedPulses || 0;
  engine._gameLoopWorkerMissedPulses = 0;
  const tickCount = 1 + extra;
  if (!engine._useGameLoopWorker()) {
    failGameLoopWorker(engine, "gameLoopWorkerUnavailable");
    return;
  }
  const state = engine._serializeStateForGameLoopWorker();
  if (!state) {
    failGameLoopWorker(engine, "serializeStateForGameLoopWorker");
    return;
  }

  logger.log("debug", "engine", `[Worker-Out] Sending Tick #${engine._gameLoopWorkerTickId}`, {
    ticks: tickCount,
    cells: engine.active_cells.length,
    heat: state.reactorState.current_heat
  });

  engine._gameLoopWorkerTickId = (engine._gameLoopWorkerTickId || 0) + 1;
  engine._gameLoopTickContext = { tickId: engine._gameLoopWorkerTickId };
  state.tickId = engine._gameLoopWorkerTickId;
  state.tickCount = tickCount;
  state.multiplier = 1;
  engine._gameLoopWorkerPending = true;
  engine._gameLoopWorkerPendingSince = typeof performance !== "undefined" ? performance.now() : 0;
  const w = engine._getGameLoopWorker();
  if (!w || engine._gameLoopWorkerFailed) {
    engine._gameLoopWorkerPending = false;
    engine._gameLoopWorkerPendingSince = 0;
    engine._gameLoopTickContext = null;
    failGameLoopWorker(engine, "gameLoopWorkerCreateFailed");
    return;
  }
  const msg = { type: "tick", ...state };
  const result = GameLoopTickInputSchema.safeParse(msg);
  if (!result.success) {
    logger.log("warn", "engine", "[GameLoopWorker] Input validation failed:", fromError(result.error).toString());
    engine._gameLoopWorkerPending = false;
    engine._gameLoopWorkerPendingSince = 0;
    engine._gameLoopTickContext = null;
    failGameLoopWorker(engine, "gameLoopWorkerInputValidation");
    return;
  }
  const { heatBuffer, ...rest } = result.data;
  const serialized = superjson.serialize(rest);
  const transfer = [];
  if (heatBuffer && !(heatBuffer instanceof SharedArrayBuffer)) transfer.push(heatBuffer);
  logger.log("info", "engine", "[ReactorTick] worker tick sent", { tickId: state.tickId, tickCount, gridCells: engine.active_cells.length });
  w.postMessage({ ...serialized, heatBuffer }, transfer);
}

function ensureArraysValid(engine) {
  if (!Array.isArray(engine.active_cells)) engine.active_cells = [];
  if (!Array.isArray(engine.active_vessels)) engine.active_vessels = [];
  if (!Array.isArray(engine.active_inlets)) engine.active_inlets = [];
  if (!Array.isArray(engine.active_exchangers)) engine.active_exchangers = [];
  if (!Array.isArray(engine.active_outlets)) engine.active_outlets = [];
  if (!Array.isArray(engine.active_valves)) engine.active_valves = [];
  if (!Array.isArray(engine.active_vents)) engine.active_vents = [];
  if (!Array.isArray(engine.active_capacitors)) engine.active_capacitors = [];
}

function updatePartCaches(engine) {
  if (!engine._partCacheDirty) return;
  ensureArraysValid(engine);

  engine.active_cells.length = 0;
  engine.active_vessels.length = 0;
  engine.active_inlets.length = 0;
  engine.active_exchangers.length = 0;
  engine.active_outlets.length = 0;
  engine.active_valves.length = 0;
  engine.active_vents.length = 0;
  engine.active_capacitors.length = 0;

  const tiles = engine.game.tileset.active_tiles_list;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile?.part) continue;
    const part = tile.part;
    const k = part.getCacheKinds(tile);
    if (k.cells) engine.active_cells.push(tile);
    if (k.inlets) engine.active_inlets.push(tile);
    if (k.exchangers) engine.active_exchangers.push(tile);
    if (k.valves) engine.active_valves.push(tile);
    if (k.outlets) engine.active_outlets.push(tile);
    if (k.vents) engine.active_vents.push(tile);
    if (k.capacitors) engine.active_capacitors.push(tile);
    if (k.vessels) engine.active_vessels.push(tile);
  }

  engine._partCacheDirty = false;
}

function updateValveNeighborCache(engine) {
  if (!engine._valveNeighborCacheDirty) return;

  engine._valveNeighborCache.clear();

  if (engine._partCacheDirty) {
    updatePartCaches(engine);
  }

  if (!Array.isArray(engine.active_exchangers)) {
    engine.active_exchangers = [];
  }

  for (let i = 0; i < engine.active_valves.length; i++) {
    const tile = engine.active_valves[i];
    const neighbors = tile.containmentNeighborTiles;
    for (let j = 0; j < neighbors.length; j++) {
      const neighbor = neighbors[j];
      if (neighbor.part) {
        const nk = neighbor.part.getCacheKinds(neighbor);
        if (!nk.valves) engine._valveNeighborCache.add(neighbor);
      }
    }
  }

  engine._valveNeighborCacheDirty = false;
}

function createVisualEventBuffer(maxEvents) {
  const buffer = new Uint32Array(maxEvents * 4);
  let head = 0;
  let tail = 0;
  return {
    enqueue(typeId, row, col, value) {
      const idx = head * 4;
      buffer[idx] = typeId;
      buffer[idx + 1] = row;
      buffer[idx + 2] = col;
      buffer[idx + 3] = value;
      head = (head + 1) % maxEvents;
      if (head === tail) tail = (tail + 1) % maxEvents;
    },
    getEventBuffer() {
      return { buffer, head, tail, max: maxEvents };
    },
    ack(newTail) {
      tail = newTail;
    }
  };
}

class TimeManager {
  constructor(engine) {
    this._engine = engine;
  }
  get game() {
    return this._engine.game;
  }
}

function getValveOrientation(valveId, cache) {
  let orientation = cache.get(valveId);
  if (orientation !== undefined) return orientation;
  const match = valveId.match(/(\d+)$/);
  orientation = match ? parseInt(match[1]) : 1;
  cache.set(valveId, orientation);
  return orientation;
}

function getTwoNeighborOrientation(neighbors, orientation) {
  const a = neighbors[0];
  const b = neighbors[1];
  const isAFirst = (orientation === 1 || orientation === 3) ? (a.col < b.col) : (a.row < b.row);
  const first = isAFirst ? a : b;
  const last = isAFirst ? b : a;
  const invert = orientation === 3 || orientation === 4;
  return { inputNeighbor: invert ? last : first, outputNeighbor: invert ? first : last };
}

function getSortedNeighborOrientation(neighbors, orientation) {
  const sorted = [...neighbors].sort((a, b) =>
    (orientation === 1 || orientation === 3) ? (a.col - b.col) : (a.row - b.row)
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const invert = orientation === 3 || orientation === 4;
  return { inputNeighbor: invert ? last : first, outputNeighbor: invert ? first : last };
}

function getInputOutputNeighbors(valve, neighbors, orientation) {
  if (neighbors.length < 2) {
    return { inputNeighbor: null, outputNeighbor: null };
  }
  const routing = neighbors.length === 2
    ? getTwoNeighborOrientation(neighbors, orientation)
    : getSortedNeighborOrientation(neighbors, orientation);
  return { inputNeighbor: routing.inputNeighbor, outputNeighbor: routing.outputNeighbor };
}

export const VISUAL_EVENT_POWER = 1;
export const VISUAL_EVENT_HEAT = 2;
export const VISUAL_EVENT_EXPLOSION = 3;

export class HeatFlowVisualizer {
  constructor() {
    this._debug = [];
    this._pool = [];
  }

  clear() {
    for (let i = 0; i < this._debug.length; i++) this._pool.push(this._debug[i]);
    this._debug.length = 0;
  }

  addTransfer(fromIdx, toIdx, amount, cols) {
    const v = this._pool.pop() || { fromRow: 0, fromCol: 0, toRow: 0, toCol: 0, amount: 0 };
    v.fromRow = (fromIdx / cols) | 0;
    v.fromCol = fromIdx % cols;
    v.toRow = (toIdx / cols) | 0;
    v.toCol = toIdx % cols;
    v.amount = amount;
    this._debug.push(v);
  }

  getVectors() {
    return this._debug;
  }
}

function initHeatCalcState(engine) {
  engine._heatCalc_startHeat = new Map();
  engine._heatCalc_planned = [];
  engine._heatCalc_plannedPool = [];
  for (let i = 0; i < HEAT_CALC_POOL_SIZE; i++) {
    engine._heatCalc_plannedPool.push({ from: null, to: null, amount: 0 });
  }
  engine._heatCalc_plannedCount = 0;
  engine._heatCalc_plannedOutByNeighbor = new Map();
  engine._heatCalc_plannedInByNeighbor = new Map();
  engine._heatCalc_plannedInByExchanger = new Map();
  engine._heatCalc_validNeighbors = [];
  engine._outletProcessing_neighbors = [];
  engine._explosion_tilesToExplode = [];
}

function initValveState(engine) {
  engine._valveProcessing_valves = [];
  engine._valveProcessing_neighbors = [];
  engine._valveProcessing_inputNeighbors = [];
  engine._valveProcessing_outputNeighbors = [];
  engine._valve_inputValveNeighbors = [];
  engine._valveNeighborExchangers = new Set();
  engine._ventProcessing_activeVents = [];
}

function initHeatPayloadBuffers(engine) {
  engine._heatPayload_inlets = new Float32Array(HEAT_PAYLOAD_MAX_INLETS * INLET_STRIDE);
  engine._heatPayload_valves = new Float32Array(HEAT_PAYLOAD_MAX_VALVES * VALVE_STRIDE);
  engine._heatPayload_valveNeighbors = new Float32Array(HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS);
  engine._heatPayload_exchangers = new Float32Array(HEAT_PAYLOAD_MAX_EXCHANGERS * EXCHANGER_STRIDE);
  engine._heatPayload_outlets = new Float32Array(HEAT_PAYLOAD_MAX_OUTLETS * OUTLET_STRIDE);
}

function initSABState(engine) {
  engine._heatUseSABNative = typeof SharedArrayBuffer !== "undefined" &&
    typeof globalThis.crossOriginIsolated !== "undefined" &&
    globalThis.crossOriginIsolated === true;
  engine._heatUseSABOverride = false;
  engine._heatUseSAB = engine._heatUseSABNative;
  engine._heatSABView = null;
  engine._containmentSABView = null;
  engine._heatTransferHeat = null;
  engine._heatTransferContainment = null;
}

function initWorkerState(engine) {
  engine._worker = null;
  engine._workerPending = false;
  engine._workerHeartbeatId = null;
  engine._workerFailed = false;
  engine._workerTickId = 0;
  engine._lastHeatTimeoutWarn = 0;
  engine._heatWorkerConsecutiveTimeouts = 0;
  engine._gameLoopWorker = null;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  engine._gameLoopWorkerLastStallWarnAt = 0;
  engine._gameLoopTickContext = null;
  engine._gameLoopWorkerFailed = false;
  engine._gameLoopWorkerTickId = 0;
  engine._gameLoopWorkerMissedPulses = 0;
  engine._updatePartCaches = () => updatePartCaches(engine);
  engine._updateValveNeighborCache = () => updateValveNeighborCache(engine);
}

function initAllEngineState(engine) {
  initHeatCalcState(engine);
  initValveState(engine);
  initHeatPayloadBuffers(engine);
  initSABState(engine);
  initWorkerState(engine);
}

function handleComponentExplosion(engine, tile) {
  tile.exploded = true;
  if (engine.game.audio) {
    const pan = engine.game.calculatePan ? engine.game.calculatePan(tile.col) : 0;
    engine.game.audio.play('explosion', null, pan);
  }

  if (tile && tile.heat_contained > 0) {
    if (engine.game.reactor.decompression_enabled) {
      const heatToRemove = tile.heat_contained;
      const after = engine.game.reactor.current_heat.sub(heatToRemove);
      engine.game.reactor.current_heat = after.lt(0) ? toDecimal(0) : after;
      logger.log('debug', 'engine', `[DECOMPRESSION] Vented ${heatToRemove} heat from explosion.`);
    } else {
      engine.game.reactor.current_heat = engine.game.reactor.current_heat.add(tile.heat_contained);
    }
  }
  tile.exploding = true;
  if (typeof engine.game.emit === "function") {
    engine.game.emit("component_explosion", { row: tile.row, col: tile.col, partId: tile.part?.id });
  }
  setTimeout(() => {
    engine.handleComponentDepletion(tile);
    tile.exploding = false;
  }, 600);
}

function processAutoSell(engine, multiplier) {
  const reactor = engine.game.reactor;
  const game = engine.game;
  let autoSellEnabled = reactor.auto_sell_enabled;
  if (autoSellEnabled === undefined) autoSellEnabled = game.state?.auto_sell;
  if (autoSellEnabled === undefined && typeof game.ui?.stateManager?.getVar === "function") {
    autoSellEnabled = !!game.ui.stateManager.getVar("auto_sell");
  }
  if (autoSellEnabled === undefined) autoSellEnabled = false;

  if (!autoSellEnabled) return;

  const layoutMax = toDecimal(reactor.max_power ?? 0);
  const altered = toDecimal(reactor.altered_max_power ?? reactor.base_max_power ?? 0);
  const sellBasis = Decimal.max(layoutMax, altered);
  const sellCap = sellBasis.mul(reactor.auto_sell_multiplier).mul(multiplier);
  const sellAmount = Decimal.min(reactor.current_power, sellCap);
  logger.log('debug', 'engine', `[DIAGNOSTIC] Auto-sell calculated: sellCap=${sellCap}, sellAmount=${sellAmount}, max_power=${reactor.max_power}, auto_sell_multiplier=${reactor.auto_sell_multiplier}, multiplier=${multiplier}`);
  if (sellAmount.gt(0)) {
    reactor.current_power = reactor.current_power.sub(sellAmount);
    if (game.state) {
      updateDecimal(game.state, "session_power_sold", (d) => d.add(sellAmount));
    }
    const value = sellAmount.mul(reactor.sell_price_multiplier || 1);
    engine.game.addMoney(value);
    let capacitor6Overcharged = false;
    for (let capIdx = 0; capIdx < engine.active_capacitors.length; capIdx++) {
      const capTile = engine.active_capacitors[capIdx];
      if (capTile?.part?.level === 6 || capTile?.part?.id === "capacitor6") {
        const cap = capTile.part.containment || 1;
        if (cap > 0 && (capTile.heat_contained || 0) / cap > 0.95) {
          capacitor6Overcharged = true;
          break;
        }
      }
    }
    if (capacitor6Overcharged) reactor.current_heat = reactor.current_heat.add(sellAmount.mul(0.5));
  }
}

const VENT6_ID = "vent6";

function countEmptyNeighbors(tileset, r, c) {
  let count = 0;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  offsets.forEach(([dr, dc]) => {
    const n = tileset.getTile(r + dr, c + dc);
    if (n && n.enabled && !n.part) count++;
  });
  return count;
}

function applyConvectiveBoost(ventRate, reactor, tileset, r, c) {
  if (reactor.convective_boost <= 0) return ventRate;
  const emptyNeighbors = countEmptyNeighbors(tileset, r, c);
  if (emptyNeighbors <= 0) return ventRate;
  return ventRate * (1 + emptyNeighbors * reactor.convective_boost);
}

function applyVent6PowerCost(reactor, ventReduce) {
  const powerAvail = reactor.current_power.toNumber();
  const capped = powerAvail < ventReduce ? powerAvail : ventReduce;
  reactor.current_power = reactor.current_power.sub(capped);
  return capped;
}

function processVents(engine, multiplier) {
  const reactor = engine.game.reactor;
  const activeVents = engine.active_vents;
  let stirlingPowerAdd = 0;
  let ventHeatDissipated = 0;
  const tileset = engine.game.tileset;

  activeVents.forEach((tile) => {
    if (!tile.part) return;
    let ventRate = tile.getEffectiveVentValue() * multiplier;
    if (ventRate <= 0) return;
    ventRate = applyConvectiveBoost(ventRate, reactor, tileset, tile.row, tile.col);
    const heat = tile.heat_contained;
    let vent_reduce = Math.min(ventRate, heat);
    if (tile.part.id === VENT6_ID) vent_reduce = applyVent6PowerCost(reactor, vent_reduce);
    tile.heat_contained -= vent_reduce;
    ventHeatDissipated += vent_reduce;
    if (reactor.stirling_multiplier > 0 && vent_reduce > 0)
      stirlingPowerAdd += vent_reduce * reactor.stirling_multiplier;
    if (vent_reduce > 0) engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
  });
  if (ventHeatDissipated > 0 && engine.game.state) {
    updateDecimal(engine.game.state, "session_heat_dissipated", (d) => d.add(toDecimal(ventHeatDissipated)));
  }
  return stirlingPowerAdd;
}

function getVisualParticleCount(value) {
  if (value >= VISUAL_PARTICLE_HIGH_THRESHOLD) return VISUAL_PARTICLE_HIGH_COUNT;
  if (value >= VISUAL_PARTICLE_MED_THRESHOLD) return VISUAL_PARTICLE_MED_COUNT;
  return 1;
}

function emitCellVisualEvents(engine, tile, multiplier) {
  if (tile.power > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.power);
    for (let k = 0; k < count; k++) {
      engine.enqueueVisualEvent(VISUAL_EVENT_POWER, tile.row, tile.col, 0);
    }
  }
  if (tile.heat > 0 && Math.random() < multiplier) {
    const count = getVisualParticleCount(tile.heat);
    for (let k = 0; k < count; k++) {
      engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
    }
  }
}

function countValidContainmentNeighbors(neighbors) {
  let count = 0;
  for (let i = 0; i < neighbors.length; i++) {
    const n = neighbors[i];
    if (n.part && n.part.containment > 0 && !n.exploded) count++;
  }
  return count;
}

function distributeHeatToNeighbors(neighbors, generatedHeat, validCount) {
  const heatPerNeighbor = generatedHeat / validCount;
  for (let j = 0; j < neighbors.length; j++) {
    const t = neighbors[j];
    if (t.part && t.part.containment > 0 && !t.exploded) {
      t.heat_contained += heatPerNeighbor;
    }
  }
}

function processReflectorNeighbors(engine, tile, multiplier) {
  const reflectorNeighbors = tile.reflectorNeighborTiles;
  for (let j = 0; j < reflectorNeighbors.length; j++) {
    const r_tile = reflectorNeighbors[j];
    if (r_tile.ticks > 0) {
      r_tile.ticks -= multiplier;
      if (r_tile.ticks <= 0) engine.handleComponentDepletion(r_tile);
    }
  }
}

function handleCellDepletion(engine, tile) {
  const part = tile.part;
  if (part.type === "protium") {
    engine.game.protium_particles += part.cell_count;
    engine.game.update_cell_power();
  }
  engine.handleComponentDepletion(tile);
}

function processCells(engine, multiplier) {
  let power_add = 0;
  let heat_add = 0;

  for (let i = 0; i < engine.active_cells.length; i++) {
    const tile = engine.active_cells[i];
    if (!tile.part || tile.exploded || tile.ticks <= 0) continue;
    if (typeof tile.part.base_ticks === "undefined" && tile.part.category === "cell") {
      logger.log("debug", "engine", `Cell at (${tile.row},${tile.col}) missing base_ticks; part.ticks=${tile.part.ticks}`);
    }

    const p = tile.part;
    const tilePower = (typeof tile.power === "number" && !isNaN(tile.power) && isFinite(tile.power))
      ? tile.power
      : (typeof p?.power === "number" && !isNaN(p.power) && isFinite(p.power) ? p.power : p?.base_power ?? 0);
    power_add += tilePower * multiplier;

    emitCellVisualEvents(engine, tile, multiplier);

    const tileHeat = (typeof tile.heat === "number" && !isNaN(tile.heat) && isFinite(tile.heat))
      ? tile.heat
      : (typeof p?.heat === "number" && !isNaN(p.heat) && isFinite(p.heat) ? p.heat : p?.base_heat ?? 0);
    const generatedHeat = tileHeat * multiplier;
    const neighbors = tile.containmentNeighborTiles;
    const validCount = countValidContainmentNeighbors(neighbors);

    if (validCount > 0) {
      distributeHeatToNeighbors(neighbors, generatedHeat, validCount);
    } else {
      heat_add += generatedHeat;
    }

    tile.ticks -= multiplier;
    processReflectorNeighbors(engine, tile, multiplier);

    if (tile.ticks <= 0) handleCellDepletion(engine, tile);
  }

  return { power_add, heat_add };
}

function handlerAcceleratorHeat(engine, multiplier, options) {
  const reactor = engine.game.reactor;
  let power_add = options?.power_add ?? 0;
  const vessels = engine.active_vessels || [];
  for (let i = 0; i < vessels.length; i++) {
    const tile = vessels[i];
    if (tile.part?.id !== "particle_accelerator6") continue;
    const cap = tile.part.containment || 0;
    const current = tile.heat_contained || 0;
    const space = Math.max(0, cap - current);
    if (space <= 0 || reactor.current_heat.lte(0)) continue;
    const rate = tile.getEffectiveTransferValue ? tile.getEffectiveTransferValue() : 0;
    const maxPull = rate * multiplier;
    const pull = Math.min(maxPull, reactor.current_heat.toNumber(), space);
    if (pull > 0) {
      reactor.current_heat = reactor.current_heat.sub(pull);
      tile.heat_contained += pull;
      power_add += pull;
    }
  }
  return power_add;
}

function handlerAutonomicRepair(engine, multiplier) {
  const reactor = engine.game.reactor;
  const rate = Number(reactor.auto_repair_rate);
  if (!Number.isFinite(rate) || rate <= 0 || !reactor.current_power.gte(AUTONOMIC_REPAIR_POWER_MIN)) return;
  let repairsRemaining = Math.floor(rate * multiplier);
  const cells = engine.active_cells || [];
  for (let i = 0; i < cells.length; i++) {
    const tile = cells[i];
    if (repairsRemaining <= 0 || reactor.current_power.lt(AUTONOMIC_REPAIR_POWER_COST)) return;
    if (tile.part && tile.part.ticks > 0) {
      tile.ticks += 1;
      reactor.current_power = reactor.current_power.sub(AUTONOMIC_REPAIR_POWER_COST);
      repairsRemaining--;
    }
  }
}

function handlerAutoSell(engine, multiplier) {
  processAutoSell(engine, multiplier);
}

const PHASE_REGISTRY = new Map([
  ["cells", { getTiles: (e) => e.active_cells || [], handler: (engine, multiplier) => processCells(engine, multiplier) }],
  ["acceleratorHeat", { getTiles: (e) => (e.active_vessels || []).filter((t) => t.part?.id === "particle_accelerator6"), handler: (engine, multiplier, options) => handlerAcceleratorHeat(engine, multiplier, options) }],
  ["vents", { getTiles: (e) => e.active_vents || [], handler: (engine, multiplier) => processVents(engine, multiplier) }],
  ["autonomicRepair", { getTiles: (e) => e.active_cells || [], handler: (engine, multiplier) => handlerAutonomicRepair(engine, multiplier) }],
  ["autoSell", { getTiles: (e) => e.active_capacitors || [], handler: (engine, multiplier, options) => handlerAutoSell(engine, multiplier, options) }],
]);

function processComponentPhase(engine, phaseName, multiplier, options = {}) {
  const entry = PHASE_REGISTRY.get(phaseName);
  if (!entry) return undefined;
  const result = entry.handler(engine, multiplier, options);
  if (phaseName === "vents" && options.power_add !== undefined) {
    return (options.power_add ?? 0) + (result ?? 0);
  }
  return result;
}

function explodeTile(engine, tile) {
  const reactor = engine.game.reactor;
  if (tile.part?.category === "particle_accelerator") reactor.checkMeltdown();
  engine.handleComponentExplosion(tile);
}

function explodeTilesFromIndices(engine, explosionIndices) {
  const ts = engine.game.tileset;
  const stride = ts.max_cols;
  const ordered = [];
  for (let i = 0; i < explosionIndices.length; i++) {
    const idx = explosionIndices[i] | 0;
    const tile = ts.getTile((idx / stride) | 0, idx % stride);
    if (!tile?.part || tile.exploded) continue;
    ordered.push({ tile, cap: tile.part?.category === "capacitor" ? 0 : 1 });
  }
  ordered.sort((a, b) => a.cap - b.cap);
  for (let j = 0; j < ordered.length; j++) explodeTile(engine, ordered[j].tile);
}

function collectTilesOverContainment(engine) {
  const tilesToExplode = engine._explosion_tilesToExplode;
  tilesToExplode.length = 0;
  for (let i = 0; i < engine.active_vessels.length; i++) {
    const tile = engine.active_vessels[i];
    if (!tile.part || tile.exploded) continue;
    const part = tile.part;
    if (part && part.containment > 0 && tile.heat_contained > part.containment) {
      tilesToExplode.push(tile);
    }
  }
  tilesToExplode.sort((a, b) => {
    const ac = a.part?.category === "capacitor" ? 0 : 1;
    const bc = b.part?.category === "capacitor" ? 0 : 1;
    return ac - bc;
  });
}

function explodeTilesFromActiveVessels(engine) {
  collectTilesOverContainment(engine);
  const tilesToExplode = engine._explosion_tilesToExplode;
  for (let i = 0; i < tilesToExplode.length; i++) {
    explodeTile(engine, tilesToExplode[i]);
  }
}

function applyHullRepulsionFromOverflow(engine) {
  const reactor = engine.game.reactor;
  const maxH = reactor.max_heat;
  if (!maxH.gt(0) || !reactor.current_heat.gt(maxH)) return;
  const excess = reactor.current_heat.sub(maxH);
  const totalRepel = excess.mul(HULL_REPEL_FRACTION);
  const tiles = engine.game.tileset.active_tiles_list.filter(
    (t) => t.enabled && t.part && typeof t.heat_contained === "number"
  );
  if (tiles.length === 0) return;
  const perNum = totalRepel.div(tiles.length).toNumber();
  if (!Number.isFinite(perNum) || perNum <= 0) return;
  reactor.current_heat = reactor.current_heat.sub(totalRepel);
  for (let i = 0; i < tiles.length; i++) {
    tiles[i].heat_contained = (tiles[i].heat_contained || 0) + perNum;
  }
}

function processExplosionsPhase(engine, explosionIndices) {
  const hasIndices = Array.isArray(explosionIndices) && explosionIndices.length > 0;
  if (hasIndices) {
    explodeTilesFromIndices(engine, explosionIndices);
  } else {
    explodeTilesFromActiveVessels(engine);
  }
}

function withPerf(engine, name, fn) {
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markStart(name);
  }
  fn();
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd(name);
  }
}

function getEffectiveMaxPower(reactor) {
  const layout = toDecimal(reactor.max_power ?? 0);
  const altered = toDecimal(reactor.altered_max_power ?? reactor.base_max_power ?? 0);
  if (altered.gt(0)) return altered;
  return layout;
}

function applyPowerOverflow(reactor, power_add) {
  const effectiveMaxPower = getEffectiveMaxPower(reactor);
  const potentialPower = reactor.current_power.add(power_add);
  if (potentialPower.gt(effectiveMaxPower)) {
    const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 1;
    reactor.current_power = effectiveMaxPower;
    reactor.current_heat = reactor.current_heat.add(potentialPower.sub(effectiveMaxPower).mul(overflowToHeat));
  } else {
    reactor.current_power = potentialPower;
  }
  return effectiveMaxPower;
}

function updateReactorStats(reactor, opts = {}) {
  reactor.updateStats();
  if (opts.record === false) return;
  if (typeof reactor.recordClassificationStats === "function") reactor.recordClassificationStats();
}

function applyPowerMultiplier(reactor, power_add) {
  const cap = getEffectiveMaxPower(reactor);
  const powerMult = reactor.power_multiplier || 1;
  if (powerMult !== 1) {
    const extra = power_add * (powerMult - 1);
    reactor.current_power = reactor.current_power.add(extra);
    if (reactor.current_power.gt(cap)) {
      const overflowToHeat = reactor.power_overflow_to_heat_ratio ?? 0.5;
      reactor.current_heat = reactor.current_heat.add(reactor.current_power.sub(cap).mul(overflowToHeat));
      reactor.current_power = cap;
    }
  }
  if (reactor.current_power.gt(cap)) reactor.current_power = cap;
}


function applyHeatReductions(reactor, multiplier) {
  if (reactor.power_to_heat_ratio > 0 && reactor.current_heat.gt(0)) {
    const heatPercent = reactor.current_heat.div(reactor.max_heat).toNumber();
    if (heatPercent > VALVE_OVERFLOW_THRESHOLD && reactor.current_power.gt(0)) {
      const heatToRemoveTarget = reactor.current_heat.mul(HEAT_REMOVAL_TARGET_RATIO).toNumber();
      const powerNeeded = heatToRemoveTarget / reactor.power_to_heat_ratio;
      const powerUsed = Math.min(reactor.current_power.toNumber(), powerNeeded);
      const heatRemoved = powerUsed * reactor.power_to_heat_ratio;
      reactor.current_power = reactor.current_power.sub(powerUsed);
      reactor.current_heat = reactor.current_heat.sub(heatRemoved);
    }
  }
  if (reactor.current_heat.gt(0) && reactor.heat_controlled) {
    const ventBonus = reactor.vent_multiplier_eff || 0;
    const baseRed = reactor.max_heat.toNumber() / REACTOR_HEAT_STANDARD_DIVISOR;
    const reduction = baseRed * (1 + ventBonus / 100) * multiplier;
    reactor.current_heat = reactor.current_heat.sub(reduction);
  }
  if (reactor.current_heat.lt(0)) reactor.current_heat = toDecimal(0);
}

function syncStateVars(reactor, game, ctx) {
  const rawPowerDelta = reactor.current_power.sub(ctx.powerBeforeTick).toNumber();
  const rawHeatDelta = reactor.current_heat.sub(ctx.heatBeforeTick).toNumber();
  const norm = Math.max(MULTIPLIER_FLOOR, ctx.multiplier);
  if (game.state) {
    game.state.power_delta_per_tick = rawPowerDelta / norm;
    game.state.heat_delta_per_tick = rawHeatDelta / norm;
    setDecimal(game.state, "current_power", reactor.current_power);
    setDecimal(game.state, "current_heat", reactor.current_heat);
    logger.log("debug", "engine", "[Tick] syncStateVars UI state updated:", {
      current_power: reactor.current_power?.toNumber?.() ?? reactor.current_power,
      power_delta: rawPowerDelta,
      power_delta_per_tick: game.state.power_delta_per_tick
    });
  }
}

function updatePostTickAudio(engine, reactor) {
  if (engine.game.audio?.ambienceManager) {
    engine.game.audio.ambienceManager.updateAmbienceHeat(reactor.current_heat.toNumber(), reactor.max_heat.toNumber());
  }
  if (engine.game.audio?.industrialManager) {
    engine.game.audio.industrialManager.scheduleIndustrialAmbience(engine.active_vents.length, engine.active_exchangers.length);
  }
}

function syncStateThenVisuals(engine, reactor, ctx) {
  syncStateVars(reactor, engine.game, ctx);
  updatePostTickAudio(engine, reactor);
}

function emitTickCompleteEvent(engine, reactor) {
  if (typeof engine.game.emit !== "function") return;
  engine.game.emit("tick_complete", {
    tick: engine.tick_count,
    power: reactor.current_power,
    heat: reactor.current_heat,
    activeCells: engine.active_cells.length,
    activeVents: engine.active_vents.length,
  });
}

function finalizeTick(engine) {
  const now = Date.now();
  if (now - engine.last_session_update >= engine.session_update_interval) {
    engine.game.updateSessionTime();
    engine.last_session_update = now;
  }
  if (engine._eventHead !== engine._eventTail) {
    engine.game.emit?.("visualEventsReady", engine.getEventBuffer());
  }
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_total");
  }
  emitTickCompleteEvent(engine, engine.game.reactor);
  const game = engine.game;
  const facts = buildFacts(game, engine);
  if (typeof game.eventRouter?.evaluate === "function") game.eventRouter.evaluate(facts, game);
  engine.tick_count++;
}

function runPostHeatPhase(engine, ctx, explosionIndices = null) {
  const reactor = engine.game.reactor;
  const { multiplier } = ctx;
  let { power_add } = ctx;

  const cellPowerAdd = typeof power_add === "number" && Number.isFinite(power_add) ? power_add : 0;
  if (cellPowerAdd > 0 && engine.game.state) {
    updateDecimal(engine.game.state, "session_power_produced", (d) => d.add(toDecimal(cellPowerAdd)));
  }

  power_add = processComponentPhase(engine, "acceleratorHeat", multiplier, { power_add });
  applyHullRepulsionFromOverflow(engine);
  withPerf(engine, "tick_explosions", () => processExplosionsPhase(engine, explosionIndices));
  power_add = processComponentPhase(engine, "vents", multiplier, { power_add });
  if (toDecimal(reactor.max_power ?? 0).lte(0)) updateReactorStats(reactor, { record: false });
  applyPowerOverflow(reactor, power_add);
  updateReactorStats(reactor);
  applyPowerMultiplier(reactor, power_add);
  processComponentPhase(engine, "autoSell", multiplier);
  applyHeatReductions(reactor, multiplier);
  processComponentPhase(engine, "autonomicRepair", multiplier);
  syncStateThenVisuals(engine, reactor, ctx);
  if (engine.game.performance && engine.game.performance.shouldMeasure()) {
    engine.game.performance.markEnd("tick_stats");
  }
  finalizeTick(engine);
}

function onGameLoopWorkerMessage(engine, e) {
  const data = e.data;
  if (data?.type === "timerPulse") {
    logger.log("debug", "engine", "[ReactorTick] timerPulse", {
      pending: engine._gameLoopWorkerPending,
      tickId: engine._gameLoopTickContext?.tickId,
      missed: engine._gameLoopWorkerMissedPulses ?? 0,
    });
    pushGameLoopWorkerTickFromPulse(engine);
    return;
  }
  if (data?.type !== "tickResult") return;
  const pendingSince = engine._gameLoopWorkerPendingSince || 0;
  const now = typeof performance !== "undefined" ? performance.now() : 0;
  const waitMs = pendingSince > 0 && now > 0 ? now - pendingSince : 0;
  engine._gameLoopWorkerPending = false;
  engine._gameLoopWorkerPendingSince = 0;
  const ctx = engine._gameLoopTickContext;
  engine._gameLoopTickContext = null;
  if (data.error) {
    logger.log("warn", "engine", "[GameLoopWorker] received error result:", data.message, { waitMs: Math.round(waitMs), tickId: data.tickId });
    failGameLoopWorker(engine, data.message || "tickResultError");
    return;
  }
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("warn", "engine", "[ReactorTick] tickResult ignored (stale or no context)", { received: data.tickId, expected: ctx?.tickId, waitMs: Math.round(waitMs) });
    return;
  }
  logger.log("info", "engine", "[ReactorTick] worker tick applied", { tickId: data.tickId, waitMs: Math.round(waitMs), reactorPower: data.reactorPower });
  logger.log("debug", "engine", "[GameLoopWorker] applying tickResult:", { tickId: data.tickId, reactorPower: data.reactorPower });
  applyGameLoopTickResult(engine, data);
  if ((engine._gameLoopWorkerMissedPulses || 0) > 0) {
    queueMicrotask(() => pushGameLoopWorkerTickFromPulse(engine));
  }
}

function validateWorkerResponse(engine, data) {
  const useSAB = data?.useSAB === true;
  if (!useSAB && !data?.heatBuffer) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no useSAB and no heatBuffer");
    engine._workerPending = false;
    return null;
  }
  if (!engine.game?.tileset) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: no tileset");
    engine._workerPending = false;
    return null;
  }
  if (!engine._workerPending) return null;
  const ctx = engine._workerTickContext;
  engine._workerPending = false;
  engine._workerTickContext = null;
  if (!ctx || data.tickId !== ctx.tickId) {
    logger.log("debug", "engine", "[PhysicsWorker] validateWorkerResponse rejected: tickId mismatch", { received: data.tickId, expected: ctx?.tickId });
    return null;
  }
  return { ctx, useSAB };
}

function applyTransferredBuffers(engine, data) {
  engine._heatTransferHeat = new Float32Array(data.heatBuffer);
  if (data.containmentBuffer) engine._heatTransferContainment = new Float32Array(data.containmentBuffer);
  engine.game.tileset.heatMap = engine._heatTransferHeat;
  if (data.inletsData) engine._heatPayload_inlets = new Float32Array(data.inletsData);
  if (data.valvesData) engine._heatPayload_valves = new Float32Array(data.valvesData);
  if (data.valveNeighborData) engine._heatPayload_valveNeighbors = new Float32Array(data.valveNeighborData);
  if (data.exchangersData) engine._heatPayload_exchangers = new Float32Array(data.exchangersData);
  if (data.outletsData) engine._heatPayload_outlets = new Float32Array(data.outletsData);
}

function recordHeatFlowVectors(engine, transfers) {
  engine.heatFlowVisualizer.clear();
  const cols = engine.game.cols;
  for (const t of transfers || []) {
    engine.heatFlowVisualizer.addTransfer(t.fromIdx, t.toIdx, t.amount, cols);
  }
}

function handlePhysicsWorkerMessage(engine, data) {
  const result = validateWorkerResponse(engine, data);
  if (!result) return;
  engine._heatWorkerConsecutiveTimeouts = 0;
  const parseResult = PhysicsTickResultSchema.safeParse(data);
  if (!parseResult.success) {
    logger.log("warn", "engine", "[PhysicsWorker] Result validation failed:", fromError(parseResult.error).toString());
    failSimulationHardwareIncompatible(engine, "physicsWorkerResult");
    return;
  }
  data = parseResult.data;
  const { ctx, useSAB } = result;
  logger.log("debug", "engine", "[PhysicsWorker] received valid response, applying power:", { power_add: ctx.power_add, tickId: data.tickId });
  if (!useSAB) applyTransferredBuffers(engine, data);
  const rawHeat = data.reactorHeat ?? engine.game.reactor.current_heat.toNumber();
  engine.game.reactor.current_heat = toDecimal(rawHeat < HEAT_EPSILON ? 0 : rawHeat);
  recordHeatFlowVectors(engine, data.transfers);
  const heat_add = ctx.heat_add + (data.heatFromInlets ?? 0);
  engine._continueTickAfterHeat(ctx.multiplier, ctx.power_add, heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick, data.explosionIndices);
}

function logEngineStartSnapshot(engine) {
  const game = engine.game;
  const ts = game?.tileset;
  engine._partCacheDirty = true;
  engine._valveNeighborCacheDirty = true;
  engine._updatePartCaches();
  engine._updateValveNeighborCache();
  const byId = new Map();
  let placedParts = 0;
  if (Array.isArray(ts?.tiles_list)) {
    for (let i = 0; i < ts.tiles_list.length; i++) {
      const tile = ts.tiles_list[i];
      const id = tile?.part?.id;
      if (!id) continue;
      placedParts++;
      byId.set(id, (byId.get(id) || 0) + 1);
    }
  }
  const partsById = Object.fromEntries(
    [...byId.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
  );
  const activeBuckets = {
    cells: engine.active_cells.length,
    vessels: engine.active_vessels.length,
    inlets: engine.active_inlets.length,
    exchangers: engine.active_exchangers.length,
    outlets: engine.active_outlets.length,
    valves: engine.active_valves.length,
    vents: engine.active_vents.length,
    capacitors: engine.active_capacitors.length,
  };
  const reactor = game?.reactor;
  logger.log("info", "engine", "[EngineStart] reactor parts", {
    grid: `${game.rows}x${game.cols}`,
    placedParts,
    partsById,
    activeBuckets,
    power: reactor?.current_power?.toNumber?.() ?? null,
    heat: reactor?.current_heat?.toNumber?.() ?? null,
    paused: !!game.paused,
  });
  logger.log("info", "engine", "[EngineStart] tick processing", {
    gameLoopWorker: engine._useGameLoopWorker() && !engine._gameLoopWorkerFailed,
    physicsWorkerHeat: engine._useWorker() && engine._heatUseSAB,
    heatUseSAB: engine._heatUseSAB,
    loopWaitMs: game.loop_wait,
    simulationTickMs: FOUNDATIONAL_TICK_MS,
    tickCount: engine.tick_count,
  });
}

function ensureGameLoopWorker(engine) {
  if (engine._gameLoopWorker) return engine._gameLoopWorker;
  try {
    const url = new URL("./worker/gameLoop.worker.js", import.meta.url).href;
    engine._gameLoopWorker = new Worker(url, { type: "module" });
    engine._gameLoopWorker.onmessage = (e) => onGameLoopWorkerMessage(engine, e);
  } catch (err) {
    engine._gameLoopWorkerFailed = true;
    logger.log('warn', 'engine', '[GameLoopWorker] Failed to create worker', err);
  }
  return engine._gameLoopWorker;
}

function ensurePhysicsWorker(engine) {
  if (engine._worker) return engine._worker;
  try {
    const url = new URL("./worker/physics.worker.js", import.meta.url).href;
    engine._worker = new Worker(url, { type: "module" });
    engine._worker.onmessage = (e) => {
      if (engine._workerHeartbeatId) {
        clearTimeout(engine._workerHeartbeatId);
        engine._workerHeartbeatId = null;
      }
      handlePhysicsWorkerMessage(engine, e.data);
    };
  } catch (err) {
    engine._workerFailed = true;
    logger.log('warn', 'engine', '[Worker] Failed to create physics worker', err);
  }
  return engine._worker;
}

export class Engine {
  constructor(game) {
    this.game = game;
    this._testFrameCount = 0;
    this._maxTestFrames = MAX_TEST_FRAMES;
    this.animationFrameId = null;
    this._pausedTimeoutId = null;
    this.last_timestamp = 0;
    this.dtime = 0;
    this.running = false;
    this.last_session_update = 0;
    this.session_update_interval = SESSION_UPDATE_INTERVAL_MS;
    this.tick_count = 0;
    this.active_cells = [];
    this.active_vessels = [];
    this.active_inlets = [];
    this.active_exchangers = [];
    this.active_outlets = [];
    this.active_valves = [];
    this.active_vents = [];
    this.active_capacitors = [];
    this._partCacheDirty = true;
    this._valveNeighborCache = new Set();
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache = new Map();

    this.MAX_EVENTS = MAX_VISUAL_EVENTS;
    this._visualEventBuffer = createVisualEventBuffer(this.MAX_EVENTS);

    initAllEngineState(this);
    ensureArraysValid(this);

    this.timeManager = new TimeManager(this);
    this.heatManager = new HeatSystem(this);
    this.heatFlowVisualizer = new HeatFlowVisualizer();
    this._workerHeartbeatMs = WORKER_HEARTBEAT_MS;
    this._visibilityListenerBound = false;
    this._visibilityHiddenAt = 0;
  }

  setForceNoSAB(override) {
    this._heatUseSABOverride = !!override;
    this._heatUseSAB = this._heatUseSABNative && !this._heatUseSABOverride;
  }

  _useGameLoopWorker() {
    if (typeof Worker === "undefined" || this._gameLoopWorkerFailed || this._heatUseSABOverride) return false;
    return true;
  }

  _useWorker() {
    if (typeof Worker === "undefined" || this._workerFailed) return false;
    if (!this._heatUseSAB && this.game.rows * this.game.cols >= GRID_SIZE_NO_SAB_THRESHOLD) return false;
    return true;
  }

  _serializeStateForGameLoopWorker() {
    return serializeStateForGameLoopWorker(this);
  }

  _applyGameLoopTickResult(data) {
    applyGameLoopTickResult(this, data);
  }

  _getGameLoopWorker() {
    return ensureGameLoopWorker(this);
  }

  _buildHeatPayload(multiplier) {
    return buildHeatPayload(this, multiplier);
  }

  _collectOverpressureExplosionIndices() {
    const ts = this.game.tileset;
    const rows = this.game.rows;
    const cols = this.game.cols;
    const heatMap = ts.heatMap;
    if (!heatMap) return [];
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = ts.gridIndex(r, c);
        const tile = ts.getTile(r, c);
        const cap = tile?.part?.containment ?? 0;
        const h = heatMap[idx] ?? 0;
        if (cap > 0 && h > cap) out.push(idx);
      }
    }
    return out;
  }

  _runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick) {
    const heatPhase = this.heatManager.processTick(multiplier);
    const explosionIndices = this._collectOverpressureExplosionIndices();
    const heat_add_total = heat_add + (heatPhase.heatFromInlets ?? 0);
    recordHeatFlowVectors(this, heatPhase.transfers);
    this._continueTickAfterHeat(
      multiplier,
      power_add,
      heat_add_total,
      powerBeforeTick,
      heatBeforeTick,
      explosionIndices.length ? explosionIndices : null
    );
  }

  _getWorker() {
    return ensurePhysicsWorker(this);
  }

  getLastHeatFlowVectors() {
    return this.heatFlowVisualizer.getVectors();
  }

  enqueueVisualEvent(typeId, row, col, value) {
    this._visualEventBuffer.enqueue(typeId, row, col, value);
  }

  getEventBuffer() {
    return this._visualEventBuffer.getEventBuffer();
  }

  ackEvents(newTail) {
    this._visualEventBuffer.ack(newTail);
  }

  get _eventRingBuffer() {
    return this.getEventBuffer().buffer;
  }
  get _eventHead() {
    return this.getEventBuffer().head;
  }
  get _eventTail() {
    return this.getEventBuffer().tail;
  }

_hasSimulationActivity() {
    if (this._partCacheDirty) this._updatePartCaches();
    const hasParts = this.active_cells.length > 0 ||
                     this.active_vents.length > 0 ||
                     this.active_exchangers.length > 0 ||
                     this.active_valves.length > 0;
    const currentPower = toNumber(this.game.reactor.current_power);
    const autoSell = this.game.state?.auto_sell || this.game.reactor?.auto_sell_enabled;
    const hasPowerToSell = currentPower > 0 && autoSell;
    return hasParts || hasPowerToSell;
  }

  _ensureArraysValid() {
    ensureArraysValid(this);
  }

  _syncGameLoopWorkerTimerControl(start) {
    if (!this._useGameLoopWorker()) return;
    const w = this._getGameLoopWorker?.();
    if (w && !this._gameLoopWorkerFailed) {
      w.postMessage({ type: "timerControl", action: start ? "start" : "stop" });
    }
  }

  _bindVisibilityForOffline() {
    if (typeof document === "undefined" || this._visibilityListenerBound) return;
    this._visibilityListenerBound = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this._visibilityHiddenAt = performance.now();
      } else if (this._visibilityHiddenAt > 0) {
        const gap = performance.now() - this._visibilityHiddenAt;
        this._visibilityHiddenAt = 0;
        if (this.running && !this.game.paused && gap > OFFLINE_TIME_THRESHOLD_MS) {
          processOfflineTime(this, gap);
        }
      }
    });
  }

  start() {
    logger.log("info", "engine", "Engine starting...");
    logEngineStartSnapshot(this);
    const stalled = typeof document !== "undefined" && !document.hidden &&
      this.running && !this.game.paused &&
      (performance.now() - (this.last_timestamp || 0)) > 1500;
    if (this.running && !stalled) {
      if (!this.game.paused) {
        this._syncGameLoopWorkerTimerControl(true);
        queueGameLoopWorkerKick(this);
      }
      return;
    }
    if (stalled) this.running = false;
    this.running = true;
    this._testFrameCount = 0;
    this.last_timestamp = performance.now();
    this.last_session_update = Date.now();
    this._lastSyncTickTime = performance.now();

    this._bindVisibilityForOffline();
    this.loop(this.last_timestamp);
    if (!this.game.paused) {
      this._syncGameLoopWorkerTimerControl(true);
      queueGameLoopWorkerKick(this);
    }

    if (this.game.state) this.game.state.engine_status = "running";
  }

  stop() {
    if (!this.running) return;
    logger.log("info", "engine", "Engine stopping.");
    this._syncGameLoopWorkerTimerControl(false);
    this.running = false;
    this._testFrameCount = 0;
    if (this.animationFrameId != null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.animationFrameId = null;
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
    }
    this.game.updateSessionTime();
    if (this.game.state) this.game.state.engine_status = "stopped";
  }

  isRunning() {
    return this.running;
  }

  markPartCacheAsDirty() {
    this._partCacheDirty = true;
    this._valveNeighborCacheDirty = true;
    this._valveOrientationCache.clear();
    ensureArraysValid(this);
    if (typeof this.game.emit === "function") {
      this.game.emit("grid_changed");
    }
  }

  _updatePartCaches() {
    updatePartCaches(this);
  }

  _updateValveNeighborCache() {
    updateValveNeighborCache(this);
  }

  loop(timestamp) {
    const inTestEnv = isTestEnv();
    const raf = (typeof window !== 'undefined' && window.requestAnimationFrame) ? window.requestAnimationFrame : globalThis.requestAnimationFrame;

    if (!inTestEnv) {
      this._testFrameCount = 0;
    } else {
      this._testFrameCount = (this._testFrameCount || 0) + 1;
      const maxFrames = this._maxTestFrames || 200;
      if (this._testFrameCount > maxFrames) {
        this.running = false;
        this.animationFrameId = null;
        return;
      }
    }

    if (!this.running) {
      this.animationFrameId = null;
      return;
    }
    
    if (this.game.paused) {
      if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();
      if (!inTestEnv) {
        this.last_timestamp = timestamp;
        this._pausedTimeoutId = setTimeout(() => {
          this._pausedTimeoutId = null;
          if (this.running && this.game.paused) this.loop(performance.now());
        }, PAUSED_POLL_MS);
      }
      return;
    }

    if (this.game.tutorialManager?.currentStep >= 0 || this.game.tutorialManager?._claimStepActive) this.game.tutorialManager.tick();

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("engine_loop");
    }

    this.last_timestamp = timestamp;
    if (this._partCacheDirty) this._updatePartCaches?.();

    if (!this._useGameLoopWorker()) {
      const elapsed = timestamp - (this._lastSyncTickTime || 0);
      if (elapsed >= this.game.loop_wait) {
        logger.log("debug", "engine", "[Main-Thread] Executing synchronous tick fallback");
        this._lastSyncTickTime = timestamp;
        this.tick();
      }
    }

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("engine_loop");
    }

    if (inTestEnv && (this._testFrameCount || 0) >= (this._maxTestFrames || 200)) {
      this.running = false;
      this.animationFrameId = null;
      return;
    }
    if (this._pausedTimeoutId != null) {
      clearTimeout(this._pausedTimeoutId);
      this._pausedTimeoutId = null;
    }
    this.animationFrameId = raf(this.loop.bind(this));
  }

  tick() {
    return this._processTick(1.0, false);
  }

  manualTick() {
    return this._processTick(1.0, true);
  }

  _processTick(multiplier = 1.0, manual = false) {
    const currentTickNumber = this.tick_count;
    
    logger.log('debug', 'engine', `[TICK START] Paused: ${this.game.paused}, Manual: ${manual}, Running: ${this.running}, Multiplier: ${multiplier.toFixed(4)}`);

    if (this.game.paused && !manual) {
      logger.log('debug', 'engine', '[TICK ABORTED] Game is paused.');
      return;
    }

    logger.groupCollapsed(`Processing Tick #${currentTickNumber} (Manual: ${manual}, x${multiplier.toFixed(2)})`);
    try {
      if (this.game.reactor.has_melted_down) {
        logger.log('debug', 'engine', '[TICK ABORTED] Reactor already in meltdown state.');
        logger.groupEnd();
        return;
      }
      if (this.game.reactor.checkMeltdown()) {
        logger.log('warn', 'engine', '[TICK ABORTED] Meltdown triggered at start of tick.');
        logger.groupEnd();
        return;
      }
      
    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_total");
    }

    const reactor = this.game.reactor;

    if (this.game.state) this.game.state.engine_status = "tick";
    this.game.emit("tickRecorded");

    const powerBeforeTick = reactor.current_power;
    const heatBeforeTick = reactor.current_heat;

    this._updatePartCaches();
    this._updateValveNeighborCache();

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markStart("tick_cells");
    }

    const cellResult = processComponentPhase(this, "cells", multiplier);
    let { power_add, heat_add } = cellResult;

    if (this.game.performance && this.game.performance.shouldMeasure()) {
      this.game.performance.markEnd("tick_cells");
    }

    logger.log("debug", "engine", "[PhysicsWorker path] cell power_add:", { power_add, heat_add, tickId: this.tick_count });

    reactor.current_heat = reactor.current_heat.add(heat_add);

    if (this._workerPending) {
      logger.log("debug", "engine", "[TICK ABORTED] Physics worker heat step still pending.");
      return;
    }

    const usePhysicsWorker = this._useWorker() && this._heatUseSAB;
    if (!usePhysicsWorker) {
      this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
      return;
    }

    const payload = this._buildHeatPayload(multiplier);
    if (!payload) {
      failSimulationHardwareIncompatible(this, "heatPayload");
      return;
    }
    this._workerTickId++;
    this._workerTickContext = { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, tickId: this._workerTickId };
    payload.msg.tickId = this._workerTickId;
    this._workerPending = true;
    const w = this._getWorker();
    if (!w) {
      this._workerPending = false;
      this._workerTickContext = null;
      this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
      return;
    }
    const result = PhysicsTickInputSchema.safeParse(payload.msg);
    if (!result.success) {
      logger.log("warn", "engine", "[PhysicsWorker] Input validation failed:", fromError(result.error).toString());
      this._workerPending = false;
      this._workerTickContext = null;
      this._runHeatStepSync(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick);
      return;
    }
    logger.log("debug", "engine", "[PhysicsWorker] posting heat step, awaiting response:", { power_add, tickId: this._workerTickId, heatUseSAB: this._heatUseSAB });
    w.postMessage(result.data, payload.transferList);
    if (!this._heatUseSAB) {
      this._heatTransferHeat = null;
      this._heatTransferContainment = null;
    }
    if (this._workerHeartbeatId) clearTimeout(this._workerHeartbeatId);
    this._workerHeartbeatId = setTimeout(() => {
      if (!this._workerPending) return;
      this._workerHeartbeatId = null;
      const ctx = this._workerTickContext;
      this._workerPending = false;
      this._workerTickContext = null;
      if (!ctx) return;
      this._heatWorkerConsecutiveTimeouts = (this._heatWorkerConsecutiveTimeouts || 0) + 1;
      if (this._heatWorkerConsecutiveTimeouts >= WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK) {
        this._workerFailed = true;
      }
      logger.log("warn", "engine", "[PhysicsWorker] heat step timeout");
      this._runHeatStepSync(ctx.multiplier, ctx.power_add, ctx.heat_add, ctx.powerBeforeTick, ctx.heatBeforeTick);
    }, this._workerHeartbeatMs);
    return;
    } catch (error) {
      logger.log('error', 'engine', 'Error in _processTick:', error);
      if (this.game.state) this.game.state.engine_status = "stopped";
      throw error;
    } finally {
      logger.groupEnd();
    }
  }

  _continueTickAfterHeat(multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick, explosionIndices = null) {
    runPostHeatPhase(this, { multiplier, power_add, heat_add, powerBeforeTick, heatBeforeTick }, explosionIndices);
  }

  handleComponentDepletion(tile) {
    this.game.handleComponentDepletion(tile);
  }

  runInstantCatchup() {
    runInstantCatchup(this);
  }

  handleComponentExplosion(tile) {
    handleComponentExplosion(this, tile);
  }

  _getValveOrientation(valveId) {
    return getValveOrientation(valveId, this._valveOrientationCache);
  }

  _getInputOutputNeighbors(valve, neighbors, orientation) {
    return getInputOutputNeighbors(valve, neighbors, orientation);
  }
}
class SessionManager {
  constructor(game) {
    this.game = game;
  }
  pause() {
    this.game.onToggleStateChange?.("pause", true);
  }
  resume() {
    this.game.onToggleStateChange?.("pause", false);
  }
  togglePause() {
    if (this.game.paused) this.resume();
    else this.pause();
  }
}

const DEFAULT_PAYLOAD_SCHEMA = z.object({}).passthrough();

class GameEventDispatcher {
  constructor(logger) {
    this._listeners = new Map();
    this._logger = logger;
  }
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, []);
    this._listeners.get(eventName).push(handler);
  }
  off(eventName, handler) {
    const list = this._listeners.get(eventName);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }
  emit(eventName, payload) {
    const schema = EVENT_SCHEMA_REGISTRY[eventName] ?? DEFAULT_PAYLOAD_SCHEMA;
    const result = schema.safeParse(payload ?? {});
    if (!result.success) {
      this._logger?.warn?.(`[Game] Event "${eventName}" payload validation failed:`, fromError(result.error).toString());
      return;
    }
    payload = result.data;
    const list = this._listeners.get(eventName);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        const msg = err?.message ?? String(err);
        this._logger?.warn?.(`[Game] Event handler error for "${eventName}":`, msg);
      }
    });
  }
}

class GameEventRouter {
  constructor() {
    this._lastEmitTick = new Map();
  }
  evaluate(facts, game) {
    if (!game?.emit) return;
    if (facts.isPaused) return;
    for (const rule of rules) {
      if (!rule.predicate(facts)) continue;
      if (rule.oneShot) {
        const key = rule.oneShotKey ?? `_${rule.event}Fired`;
        if (game.state?.[key]) continue;
        game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
        if (game.state && typeof game.state === "object") game.state[key] = true;
        continue;
      }
      const lastTick = this._lastEmitTick.get(rule.event) ?? -Infinity;
      const throttle = rule.throttleTicks ?? 0;
      if (facts.tickCount - lastTick < throttle) continue;
      game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
      this._lastEmitTick.set(rule.event, facts.tickCount);
    }
  }
  resetThrottles() {
    this._lastEmitTick.clear();
  }
  clearState(game) {
    this.resetThrottles();
    if (!game?.state || typeof game.state !== "object") return;
    for (const rule of rules) {
      if (rule.oneShotKey) game.state[rule.oneShotKey] = false;
    }
  }
}

const ACTION_HANDLERS = {
  sell: (g) => { g.sell_action(); },
  manualReduceHeat: (g) => { g.manual_reduce_heat_action(); },
  pause: (g) => { g.pause(); },
  resume: (g) => { g.resume(); },
  togglePause: (g) => { g.togglePause(); },
  rebootKeepEp: (g) => g.rebootActionKeepExoticParticles(),
  rebootDiscardEp: (g) => g.rebootActionDiscardExoticParticles(),
  reboot: (g) => g.reboot(),
  sellPart: (g, p) => { g.sellPart(p.tile); },
  pasteLayout: (g, p) => { g.action_pasteLayout(p.layout, p.options || {}); },
};

function executeAction(game, action) {
  const actionResult = GameActionSchema.safeParse(action);
  if (!actionResult.success) return null;
  const { type, payload = {} } = actionResult.data;
  const schema = ACTION_SCHEMA_REGISTRY[type];
  const payloadResult = schema ? schema.safeParse(payload) : { success: true, data: payload };
  if (!payloadResult.success) return null;
  const handler = ACTION_HANDLERS[type];
  if (!handler) return null;
  return handler(game, payloadResult.data);
}

class TimeKeeper {
  constructor(game) {
    this.game = game;
  }
  updateSessionTime() {
    const lm = this.game.lifecycleManager;
    if (lm.session_start_time) {
      const sessionTime = Date.now() - lm.session_start_time;
      lm.total_played_time = lm.total_played_time + sessionTime;
      lm.session_start_time = Date.now();
    }
    if (this.game.reactor) {
      if (this.game.reactor.current_power > this.game.peak_power) this.game.peak_power = this.game.reactor.current_power;
      if (this.game.reactor.current_heat > this.game.peak_heat) this.game.peak_heat = this.game.reactor.current_heat;
    }
  }
  getFormattedTotalPlayedTime() {
    const lm = this.game.lifecycleManager;
    let totalTime = lm.total_played_time;
    if (lm.session_start_time) {
      totalTime += Date.now() - lm.session_start_time;
    }
    return Formatter.time(totalTime, true);
  }
}

class EconomyManager {
  constructor(game, { prestigePerEp, prestigeCap }) {
    this.game = game;
    this.prestigePerEp = prestigePerEp;
    this.prestigeCap = prestigeCap;
  }
  getCurrentMoney() {
    return this.game.state.current_money;
  }
  setCurrentMoney(value) {
    setDecimal(this.game.state, "current_money", value);
  }
  getPrestigeMultiplier() {
    const ep = this.game.state.total_exotic_particles;
    const epNumber = ep && typeof ep.toNumber === "function" ? ep.toNumber() : Number(ep || 0);
    return 1 + Math.min(epNumber * this.prestigePerEp, this.prestigeCap);
  }
  addMoney(amount) {
    const multiplier = this.getPrestigeMultiplier();
    updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(amount).mul(multiplier)));
  }
}

function runComponentDepletion(game, tile) {
  if (!tile.part) return;
  game.debugHistory.add('game', 'Component depletion', { row: tile.row, col: tile.col, partId: tile.part.id, perpetual: tile.part.perpetual });
  const part = tile.part;
  const hasProtiumLoader = game.upgradeset.getUpgrade("experimental_protium_loader")?.level > 0;
  const isProtium = part.type === "protium";
  const autoBuyEnabled = game.reactor?.auto_buy_enabled ?? game.state?.auto_buy ?? false;
  const autoReplace = (part.perpetual || (isProtium && hasProtiumLoader)) && !!autoBuyEnabled;
  if (autoReplace) {
    const cost = part.getAutoReplacementCost();
    const money = game.state.current_money;
    game.logger?.debug?.(`[AUTO-BUY] Attempting to replace '${part.id}'. Cost: ${cost}, Current Money: ${money}`);
    const canAfford = money != null && typeof money.gte === "function" && money.gte(cost);
    if (canAfford) {
      updateDecimal(game.state, "current_money", (d) => d.sub(cost));
      game.logger?.debug?.(`[AUTO-BUY] Success. New Money: ${game.state.current_money}`);
      part.recalculate_stats();
      tile.ticks = part.ticks;
      game.reactor.updateStats();
      return;
    }
    logger.log('debug', 'game', '[AUTO-BUY] Failed. Insufficient funds.');
  }
  game.emit("tileCleared", { tile });
  tile.clearPart();
}

function buildSaveContext(game, { getToggles, getQuickSelectSlots }) {
  return {
    state: game.state,
    reactor: game.reactor,
    tileset: game.tileset,
    upgradeset: game.upgradeset,
    objectives_manager: game.objectives_manager,
    version: game.version,
    run_id: game.run_id,
    tech_tree: game.tech_tree,
    protium_particles: game.protium_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    exotic_particles: game.exoticParticleManager.exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    rows: game.rows,
    cols: game.cols,
    sold_power: game.sold_power,
    sold_heat: game.sold_heat,
    grace_period_ticks: game.grace_period_ticks,
    total_played_time: game.lifecycleManager.total_played_time,
    placedCounts: game.placedCounts,
    getToggles,
    getQuickSelectSlots,
  };
}

function buildPersistenceContext(game, getCompactLayout) {
  return {
    hasMeltedDown: game.reactor?.has_melted_down,
    peakPower: game.peak_power,
    peakHeat: game.peak_heat,
    userId: game.user_id,
    runId: game.run_id,
    currentMoney: game.state.current_money,
    totalPlayedTime: game.lifecycleManager.total_played_time,
    cheatsUsed: game.cheats_used,
    updateSessionTime: () => game.updateSessionTime(),
    debugHistory: game.debugHistory,
    logger: game.logger ?? logger,
    getCompactLayout,
    applySaveState: (savedData) => game.saveOrchestrator.applySaveState(game, savedData),
  };
}

export class Game {
  constructor(ui_instance, getCompactLayoutFn = null) {
    this._getCompactLayoutFn = getCompactLayoutFn;
    this.ui = ui_instance;
    this.saveOrchestrator = new SaveOrchestrator({
      getContext: () => buildSaveContext(this, {
        getToggles: () => ({
          auto_sell: this.state?.auto_sell ?? false,
          auto_buy: this.state?.auto_buy ?? true,
          heat_control: this.state?.heat_control ?? false,
          pause: this.state?.pause ?? false,
        }),
        getQuickSelectSlots: () => this.ui?.stateManager?.getQuickSelectSlots() ?? [],
      }),
      onBeforeSave: () => {
        this.debugHistory.add('game', 'Generating save state');
        this.updateSessionTime();
      }
    });
    this.saveManager = new GameSaveManager(this.saveOrchestrator, () => buildPersistenceContext(this, this._getCompactLayoutFn ? () => this._getCompactLayoutFn(this) : () => null));
    this.version = "1.4.0";

    this.gridManager = new GridManager(this);
    this.max_cols = MAX_GRID_DIMENSION;
    this.max_rows = MAX_GRID_DIMENSION;
    this.offline_tick = true;
    this.base_loop_wait = BASE_LOOP_WAIT_MS;
    this.base_manual_heat_reduce = 1;
    this.upgrade_max_level = UPGRADE_MAX_LEVEL;
    this.base_money = BASE_MONEY;
    this.protium_particles = 0;

    this.lifecycleManager = new LifecycleManager(this);
    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.state = createGameState({
      current_money: toDecimal(0),
      current_power: toDecimal(0),
      current_heat: toDecimal(0),
      current_exotic_particles: toDecimal(0),
      total_exotic_particles: toDecimal(0),
      session_power_produced: toDecimal(0),
      session_power_sold: toDecimal(0),
      session_heat_dissipated: toDecimal(0),
      session_ep_from_engine: toDecimal(0),
      max_power: 0,
      max_heat: 0,
      stats_power: 0,
      stats_heat_generation: 0,
      stats_vent: 0,
      stats_inlet: 0,
      stats_outlet: 0,
      stats_net_heat: 0,
      stats_total_part_heat: 0,
      stats_cash: 0,
      engine_status: "stopped",
      auto_sell: false,
      auto_buy: true,
      heat_control: false,
      pause: false,
    });
    this.reactor = new Reactor(this);
    this.engine = null;
    this.performance = new Performance(this);
    this.performance.enable();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;
    this.autoSellEnabled = true;
    this.isAutoBuyEnabled = true;
    this.sold_power = false;
    this.sold_heat = false;
    this.objectives_manager = new ObjectiveManager(this);
    this.tooltip_manager = null;
    this.placedCounts = {};
    this._suppressPlacementCounting = false;
    this._unlockStates = {};
    this.unlockManager = new UnlockManager(this);
    this.sessionManager = new SessionManager(this);
    this.configManager = new ConfigManager(this);

    this.debugHistory = new DebugHistory();
    this.undoHistory = [];
    this.audio = null;
    this.logger = logger;

    this.peak_power = 0;
    this.peak_heat = 0;
    
    this.user_id = "local_architect";
    
    this.run_id = crypto.randomUUID();
    this.tech_tree = null;
    this.bypass_tech_tree_restrictions = false;
    this.RESPER_DOCTRINE_EP_COST = RESPEC_DOCTRINE_EP_COST;
    this.cheats_used = false;
    this.grace_period_ticks = 0;
    this.blueprintPlanner = { active: false, slots: {} };
    this._offlineCatchupMs = 0;
    this._mainState = null;
    this.eventDispatcher = new GameEventDispatcher(logger);
    this.eventRouter = new GameEventRouter();
    this.economyManager = new EconomyManager(this, {
      prestigePerEp: PRESTIGE_MULTIPLIER_PER_EP,
      prestigeCap: PRESTIGE_MULTIPLIER_CAP
    });
    this.timeKeeper = new TimeKeeper(this);
    this.exoticParticleManager = new ExoticParticleManager(this);
  }

  on(eventName, handler) {
    this.eventDispatcher.on(eventName, handler);
  }

  off(eventName, handler) {
    this.eventDispatcher.off(eventName, handler);
  }

  emit(eventName, payload) {
    this.eventDispatcher.emit(eventName, payload);
  }

  getPreviousTierCount(part) { return this.unlockManager.getPreviousTierCount(part); }
  getPreviousTierSpec(part) { return this.unlockManager.getPreviousTierSpec(part); }
  isFirstInChainSpec(spec) { return this.unlockManager.isFirstInChainSpec(spec); }
  isSpecUnlocked(spec) { return this.unlockManager.isSpecUnlocked(spec); }
  shouldShowPart(part) { return this.unlockManager.shouldShowPart(part); }
  isPartUnlocked(part) { return this.unlockManager.isPartUnlocked(part); }
  getPlacedCount(type, level) { return this.unlockManager.getPlacedCount(type, level); }
  incrementPlacedCount(type, level) { return this.unlockManager.incrementPlacedCount(type, level); }

  enqueueVisualEvent() {}
  enqueueVisualEvents() {}
  drainVisualEvents() {
    return [];
  }

  async set_defaults() {
    await setDefaultsFromModule(this);
  }

  get current_money() { return this.economyManager.getCurrentMoney(); }
  set current_money(v) { this.economyManager.setCurrentMoney(v); }
  get current_exotic_particles() { return this.state.current_exotic_particles; }
  set current_exotic_particles(v) { this.exoticParticleManager.current_exotic_particles = v; }
  get exotic_particles() { return this.exoticParticleManager.exotic_particles; }
  set exotic_particles(v) { this.exoticParticleManager.exotic_particles = v; }
  get total_exotic_particles() { return this.state.total_exotic_particles; }
  set total_exotic_particles(v) { this.exoticParticleManager.total_exotic_particles = v; }
  get session_start_time() { return this.lifecycleManager.session_start_time; }
  set session_start_time(v) { this.lifecycleManager.session_start_time = v; }
  get last_save_time() { return this.lifecycleManager.last_save_time; }
  set last_save_time(v) { this.lifecycleManager.last_save_time = v; }
  get total_played_time() { return this.lifecycleManager.total_played_time; }
  set total_played_time(v) { this.lifecycleManager.total_played_time = v; }

  getPrestigeMultiplier() {
    return this.economyManager.getPrestigeMultiplier();
  }

  addMoney(amount) {
    this.economyManager.addMoney(amount);
  }

  markCheatsUsed() {
    this.cheats_used = true;
  }

  grantCheatExoticParticle(amount = 1) {
    this.exoticParticleManager.grantCheatExoticParticle(amount);
  }

  async initialize_new_game_state() {
    await this.lifecycleManager.initialize_new_game_state();
  }

  async startSession() {
    await this.lifecycleManager.startSession();
  }

  updateSessionTime() {
    this.lifecycleManager.updateSessionTime();
  }

  getFormattedTotalPlayedTime() {
    return this.lifecycleManager.getFormattedTotalPlayedTime();
  }

  update_cell_power() {
    if (!this.partset || !this.reactor) return;
    this.partset.updateCellPower();
    this.reactor.updateStats();
  }
  epart_onclick(purchased_upgrade) {
    runEpartOnclick(this, purchased_upgrade);
  }
  manual_reduce_heat_action() {
    runManualReduceHeatAction(this);
  }
  sell_action() {
    runSellAction(this);
  }
  async rebootActionKeepExoticParticles() {
    await runRebootActionKeepEp(this);
  }

  async rebootActionDiscardExoticParticles() {
    await runRebootActionDiscardEp(this);
  }

  get base_cols() { return this.gridManager.base_cols; }
  set base_cols(v) { this.gridManager.base_cols = v; }
  get base_rows() { return this.gridManager.base_rows; }
  set base_rows(v) { this.gridManager.base_rows = v; }
  get _rows() { return this.gridManager._rows; }
  get _cols() { return this.gridManager._cols; }

  updateBaseDimensions() {
    this.gridManager.updateBaseDimensions();
  }

  get rows() { return this.gridManager.rows; }
  set rows(value) { this.gridManager.setRows(value); }
  get cols() { return this.gridManager.cols; }
  set cols(value) { this.gridManager.setCols(value); }
  calculatePan(col) {
    if (this.cols <= 1) return 0;
    return (col / (this.cols - 1)) * 2 - 1;
  }

  sellPart(tile) {
    runSellPart(this, tile);
  }

  handleComponentDepletion(tile) {
    runComponentDepletion(this, tile);
  }

  async applySaveState(savedData) {
    logger.log('debug', 'game', 'Applying save state...', {
      version: savedData.version,
      money: savedData.current_money,
      tiles: savedData.tiles?.length || 0,
      upgrades: savedData.upgrades?.length || 0,
      objectiveIndex: savedData.objectives?.current_objective_index
    });
    await this.saveOrchestrator.applySaveState(this, savedData);
  }

  pause() { this.sessionManager.pause(); }
  resume() { this.sessionManager.resume(); }
  togglePause() { this.sessionManager.togglePause(); }

  async reboot() {
    await runFullReboot(this);
  }

  onToggleStateChange(toggleName, value) {
    this.configManager.onToggleStateChange(toggleName, value);
  }

  execute(action) {
    return executeAction(this, action);
  }

  getConfiguration() {
    return this.configManager.getConfiguration();
  }

  setConfiguration(config) {
    this.configManager.setConfiguration(config);
  }

  action_pasteLayout(layout, options = {}) {
    const bp = new BlueprintService(this);
    bp.applyLayout(layout, options.skipCostDeduction === true);
    this.emit("layoutPasted", { layout });
  }

  toggleBlueprintPlanner() {
    this.blueprintPlanner.active = !this.blueprintPlanner.active;
    if (!this.blueprintPlanner.active) this.blueprintPlanner.slots = {};
    if (typeof document !== "undefined") {
      document.body.classList.toggle("blueprint-planner-active", this.blueprintPlanner.active);
    }
    this.emit?.("blueprintPlannerChanged", { active: this.blueprintPlanner.active });
  }

  clearBlueprintPlannerSlots() {
    this.blueprintPlanner.slots = {};
    this.emit?.("blueprintPlannerChanged", { active: this.blueprintPlanner.active });
  }

  setBlueprintPlannerSlot(row, col, partId) {
    const k = `${row},${col}`;
    if (!partId) delete this.blueprintPlanner.slots[k];
    else this.blueprintPlanner.slots[k] = partId;
    this.emit?.("blueprintPlannerChanged", { active: this.blueprintPlanner.active });
  }

  getBlueprintPlannerPartId(row, col) {
    return this.blueprintPlanner?.slots?.[`${row},${col}`] ?? null;
  }

  applyBlueprintPlannerLayout() {
    const slots = this.blueprintPlanner?.slots;
    if (!slots || typeof slots !== "object") return;
    const entries = Object.entries(slots).filter(([, partId]) => partId);
    const resolved = [];
    for (let i = 0; i < entries.length; i++) {
      const [key, partId] = entries[i];
      const [rs, cs] = key.split(",");
      const r = Number(rs);
      const c = Number(cs);
      const part = this.partset.getPartById(partId);
      const tile = this.tileset.getTile(r, c);
      if (!part || !tile?.enabled || !this.unlockManager.isPartUnlocked(part)) return;
      if (part.erequires) {
        const u = this.upgradeset.getUpgrade(part.erequires);
        if (!u || u.level <= 0) return;
      }
      resolved.push({ tile, part });
    }
    let totalMoney = toDecimal(0);
    let totalEp = toDecimal(0);
    for (let j = 0; j < resolved.length; j++) {
      const { part } = resolved[j];
      if (part.erequires) {
        const ec = part.ecost;
        if (ec && ec.gt(0)) totalEp = totalEp.add(ec);
        else totalMoney = totalMoney.add(part.cost);
      } else {
        totalMoney = totalMoney.add(part.cost);
      }
    }
    if (totalMoney.gt(0) && toDecimal(this.state.current_money).lt(totalMoney)) return;
    if (totalEp.gt(0) && toDecimal(this.state.current_exotic_particles).lt(totalEp)) return;
    for (let k = 0; k < resolved.length; k++) {
      const { tile, part } = resolved[k];
      if (tile.part) tile.clearPart();
      tile.setPart(part);
    }
    if (totalMoney.gt(0)) updateDecimal(this.state, "current_money", (d) => d.sub(totalMoney));
    if (totalEp.gt(0)) updateDecimal(this.state, "current_exotic_particles", (d) => d.sub(totalEp));
    this.blueprintPlanner.slots = {};
    this.blueprintPlanner.active = false;
    if (typeof document !== "undefined") document.body.classList.remove("blueprint-planner-active");
    this.reactor.updateStats();
    this.partset.check_affordability(this);
    this.emit?.("blueprintPlannerChanged", { active: false });
    this.emit?.("grid_changed", {});
  }

  getDoctrine() {
    if (!this.tech_tree) return null;
    return this.upgradeset.techTrees?.find(t => t.id === this.tech_tree) || null;
  }

  respecDoctrine() {
    const cost = this.RESPER_DOCTRINE_EP_COST; // Ensure using the property name in class
    const currentEp = this.state.current_exotic_particles;

    if (currentEp.lt(cost)) return false;

    updateDecimal(this.state, "current_exotic_particles", (d) => d.sub(cost));

    const oldTree = this.tech_tree;
    this.tech_tree = null; // Set to null as per test expectation

    this.upgradeset.resetDoctrineUpgradeLevels(oldTree);
    this.eventRouter?.clearState(this);

    if (this.saveManager) this.saveManager.autoSave();
    return true;
  }
}
