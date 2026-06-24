import { HEAT_EPSILON, MELTDOWN_HEAT_MULTIPLIER } from "../constants/sim.js";
import { topologyNeighborCoords } from "../logic-topology.js";
import { toNumber } from "../simUtils.js";

export const TICK_CHECK_THRESHOLDS = {
  repulsion_60ticks: 60,
  heat_95pct_120ticks: 120,
  max_heat_power_500k_10ticks: 10,
};

export const STATEFUL_TICK_CHECKS = new Set([
  "simultaneous_explosions_10",
  "criticality_recovery_auto",
]);

const EXPERIMENTAL_PART_UNLOCK_IDS = [
  "heat_reflection",
  "experimental_capacitance",
  "vortex_cooling",
  "underground_heat_extraction",
  "vortex_extraction",
  "explosive_ejection",
  "thermionic_conversion",
  "micro_capacitance",
  "singularity_harnessing",
];

function countVents(game) {
  return countPartsByCategory(game, "vent");
}

function countPartsByCategory(game, category) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i]?.part?.category === category) n++;
  }
  return n;
}

function countPartsById(game, id) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i]?.part?.id === id) n++;
  }
  return n;
}

function countActiveCellsByType(game, type) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return 0;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    const p = tile?.part;
    if (p?.category === "cell" && p?.type === type && tile.ticks > 0) n++;
  }
  return n;
}

function getStatsPower(game) {
  return Number(game.reactor?.stats_power ?? game.state?.stats_power ?? 0);
}

function getStatsCellPower(game) {
  return Number(game.reactor?.stats_cell_power ?? game.state?.stats_cell_power ?? 0);
}

function getStatsStirlingPower(game) {
  return Number(game.reactor?.stats_stirling_power ?? game.state?.stats_stirling_power ?? 0);
}

function getHeatRatio(game) {
  const hr = game.state?.heat_ratio;
  return typeof hr === "number" && isFinite(hr) ? hr : 0;
}

function isNotMeltingDown(game) {
  const st = game?.state;
  if (!st || st.melting_down || game.reactor?.has_melted_down) return false;
  return true;
}

function hasExchangerOrCoolant(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const cat = list[i]?.part?.category;
    if (cat === "heat_exchanger" || cat === "coolant_cell") return true;
  }
  return false;
}

function getOrthogonalNeighborTiles(game, tile) {
  const rows = game.rows ?? 0;
  const cols = game.cols ?? 0;
  const coords = topologyNeighborCoords("Orthogonal", tile.row, tile.col, 1, rows, cols);
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    const neighbor = game.tileset?.getTile(coords[i][0], coords[i][1]);
    if (neighbor?.part) out.push(neighbor);
  }
  return out;
}

function sumGridPartCost(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return 0;
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const cost = list[i]?.part?.base_cost;
    total += toNumber(cost);
  }
  return total;
}

function hasOnlyProtiumCells(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  let hasProtium = false;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    const p = tile?.part;
    if (p?.category !== "cell" || tile.ticks <= 0) continue;
    if (p.type !== "protium") return false;
    hasProtium = true;
  }
  return hasProtium;
}

export function isRepulsionActive(game) {
  const st = game?.state;
  if (!st || st.melting_down || game.reactor?.has_melted_down) return false;
  return st.failure_state === "repulsion" && (st.hull_integrity ?? 100) > 0;
}

export function isCriticalityNoVents(game) {
  if (getHeatRatio(game) < MELTDOWN_HEAT_MULTIPLIER) return false;
  return countVents(game) === 0;
}

export function isNetHeatZeroPower5k(game) {
  const reactor = game.reactor;
  if (!reactor) return false;
  const net = Number(reactor.stats_net_heat ?? game.state?.stats_net_heat ?? NaN);
  return Math.abs(net) < HEAT_EPSILON && getStatsPower(game) >= 5000;
}

export function isClosedLoopNoVents(game) {
  const reactor = game.reactor;
  if (!reactor || game.paused) return false;
  const net = Number(reactor.stats_net_heat ?? game.state?.stats_net_heat ?? NaN);
  if (net > HEAT_EPSILON) return false;
  if (countVents(game) > 0) return false;
  return hasExchangerOrCoolant(game);
}

export function isZeroHeatPower10k(game) {
  const reactor = game.reactor;
  if (!reactor) return false;
  if (toNumber(reactor.current_heat ?? game.state?.current_heat) !== 0) return false;
  return getStatsPower(game) > 10000;
}

export function isStirlingPower1k(game) {
  const stirling = getStatsStirlingPower(game);
  if (stirling < 1000) return false;
  return getStatsCellPower(game) < HEAT_EPSILON;
}

export function isStirlingExceedsCellPower(game) {
  const stirling = getStatsStirlingPower(game);
  const cellPower = getStatsCellPower(game);
  return stirling > 0 && cellPower > 0 && stirling > cellPower;
}

export function isHeat95PctActive(game) {
  if (!isNotMeltingDown(game)) return false;
  return getHeatRatio(game) >= 0.95;
}

export function isMaxHeatPower500kActive(game) {
  if (!isNotMeltingDown(game) || game.paused || game.state?.pause) return false;
  if (getHeatRatio(game) < 1) return false;
  return getStatsPower(game) >= 500000;
}

export function isSimultaneousExplosions10(_game, tracker) {
  return (tracker?.lastTickExplosions ?? 0) === 10;
}

export function isCriticalityRecoveryAuto(game, tracker) {
  if (!tracker) return false;
  if (!tracker.criticalityRecovery) {
    tracker.criticalityRecovery = { phase: "idle", soldHeatAtEntry: false };
  }
  const tr = tracker.criticalityRecovery;
  const ratio = getHeatRatio(game);

  if (tr.phase === "idle" && ratio > 1.5) {
    tr.phase = "critical";
    tr.soldHeatAtEntry = !!game.sold_heat;
    return false;
  }

  if (tr.phase !== "critical") return false;

  if (game.sold_heat && !tr.soldHeatAtEntry) {
    tr.phase = "idle";
    return false;
  }

  if (ratio < 0.8) {
    tr.phase = "idle";
    return true;
  }

  return false;
}

export function isPower100kGrid36(game) {
  if (getStatsPower(game) <= 100000) return false;
  return (game.rows ?? 0) * (game.cols ?? 0) <= 36;
}

export function isPower5mNoVents(game) {
  return getStatsPower(game) > 5_000_000 && countVents(game) === 0;
}

export function isHighPowerLowBudget(game) {
  return getStatsPower(game) > 1_000_000 && sumGridPartCost(game) < 50000;
}

export function isExchangersMaxCapacity(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  let count = 0;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    const p = tile?.part;
    if (p?.category !== "heat_exchanger") continue;
    const cap = Number(p.containment ?? 0);
    if (cap <= 0) return false;
    const fill = Number(tile.heat_contained ?? 0) / cap;
    if (fill < 1 - HEAT_EPSILON) return false;
    count++;
  }
  return count > 0;
}

export function isFourInletsOneCell(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const cellTile = list[i];
    const cp = cellTile?.part;
    if (cp?.category !== "cell" || cellTile.ticks <= 0) continue;
    const neighbors = getOrthogonalNeighborTiles(game, cellTile);
    if (neighbors.length !== 4) continue;
    let inletCount = 0;
    for (let j = 0; j < neighbors.length; j++) {
      if (neighbors[j].part?.category === "heat_inlet") inletCount++;
    }
    if (inletCount === 4) return true;
  }
  return false;
}

export function isHeatLockLoop(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const cellTile = list[i];
    const cp = cellTile?.part;
    if (cp?.category !== "cell" || cellTile.ticks <= 0) continue;
    const neighbors = getOrthogonalNeighborTiles(game, cellTile);
    if (neighbors.length !== 4) continue;
    let valveCount = 0;
    for (let j = 0; j < neighbors.length; j++) {
      const np = neighbors[j].part;
      if (np?.category === "valve" && np?.type === "check_valve") valveCount++;
    }
    if (valveCount === 4) return true;
  }
  return false;
}

export function isAccelerator6Count4(game) {
  return countPartsById(game, "particle_accelerator6") >= 4;
}

export function isLabUnlocked(game) {
  return (game.upgradeset?.getUpgrade("laboratory")?.level ?? 0) >= 1;
}

export function isProtiumCells10(game) {
  return countActiveCellsByType(game, "protium") >= 10;
}

export function isReflector6Count12(game) {
  return countPartsById(game, "reflector6") >= 12;
}

export function isCoolant6Count15(game) {
  return countPartsById(game, "coolant_cell6") >= 15;
}

export function isInlet6Outlet6Active(game) {
  return countPartsById(game, "heat_inlet6") >= 1 && countPartsById(game, "heat_outlet6") >= 1;
}

export function isVent6Count8(game) {
  return countPartsById(game, "vent6") >= 8;
}

export function isPower50mProtiumOnly(game) {
  return getStatsPower(game) > 50_000_000 && hasOnlyProtiumCells(game);
}

export function isSubAtomicCatalystsLvl10(game) {
  return (game.upgradeset?.getUpgrade("sub_atomic_catalysts")?.level ?? 0) >= 10;
}

export function isBlackHoleCritical(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    if (tile?.part?.id !== "particle_accelerator6") continue;
    const cap = Number(tile.part.containment ?? 0);
    if (cap <= 0) continue;
    if (Number(tile.heat_contained ?? 0) / cap >= 0.99) return true;
  }
  return false;
}

export function isAllExperimentalPartsUnlocked(game) {
  const us = game.upgradeset;
  if (!us) return false;
  for (let i = 0; i < EXPERIMENTAL_PART_UNLOCK_IDS.length; i++) {
    if ((us.getUpgrade(EXPERIMENTAL_PART_UNLOCK_IDS[i])?.level ?? 0) < 1) return false;
  }
  return true;
}

export function isSympatheticResonanceQuad(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const reflectorTile = list[i];
    if (reflectorTile?.part?.category !== "reflector") continue;
    const neighbors = getOrthogonalNeighborTiles(game, reflectorTile);
    if (neighbors.length !== 4) continue;
    let quadPlutonium = 0;
    for (let j = 0; j < neighbors.length; j++) {
      const np = neighbors[j].part;
      if (np?.id === "plutonium3" && neighbors[j].ticks > 0) quadPlutonium++;
    }
    if (quadPlutonium === 4) return true;
  }
  return false;
}

export function isFrozenFireNefastium(game) {
  const list = game.tileset?.active_tiles_list;
  if (!list) return false;
  for (let i = 0; i < list.length; i++) {
    const tile = list[i];
    const p = tile?.part;
    if (p?.id !== "nefastium3" || tile.ticks <= 0) continue;
    if (Number(tile.heat_contained ?? 0) === 0) return true;
  }
  return false;
}

const SUSTAINED_CONDITIONS = {
  repulsion_60ticks: isRepulsionActive,
  heat_95pct_120ticks: isHeat95PctActive,
  max_heat_power_500k_10ticks: isMaxHeatPower500kActive,
};

const INSTANT_CONDITIONS = {
  criticality_no_vents: isCriticalityNoVents,
  net_heat_zero_power_5k: isNetHeatZeroPower5k,
  closed_loop_no_vents: isClosedLoopNoVents,
  zero_heat_power_10k: isZeroHeatPower10k,
  stirling_power_1k: isStirlingPower1k,
  stirling_exceeds_cell_power: isStirlingExceedsCellPower,
  power_100k_grid_36: isPower100kGrid36,
  power_5m_no_vents: isPower5mNoVents,
  high_power_low_budget: isHighPowerLowBudget,
  exchangers_max_capacity: isExchangersMaxCapacity,
  four_inlets_one_cell: isFourInletsOneCell,
  heat_lock_loop: isHeatLockLoop,
  accelerator6_count_4: isAccelerator6Count4,
  lab_unlocked: isLabUnlocked,
  protium_cells_10: isProtiumCells10,
  reflector6_count_12: isReflector6Count12,
  coolant6_count_15: isCoolant6Count15,
  inlet6_outlet6_active: isInlet6Outlet6Active,
  vent6_count_8: isVent6Count8,
  power_50m_protium_only: isPower50mProtiumOnly,
  sub_atomic_catalysts_lvl_10: isSubAtomicCatalystsLvl10,
  black_hole_critical: isBlackHoleCritical,
  all_experimental_parts_unlocked: isAllExperimentalPartsUnlocked,
  sympathetic_resonance_quad: isSympatheticResonanceQuad,
  frozen_fire_nefastium: isFrozenFireNefastium,
  simultaneous_explosions_10: isSimultaneousExplosions10,
  criticality_recovery_auto: isCriticalityRecoveryAuto,
};

export function evaluateTickCheck(game, checkId, tracker) {
  if (INSTANT_CONDITIONS[checkId]) {
    return INSTANT_CONDITIONS[checkId](game, tracker);
  }
  const sustainedFn = SUSTAINED_CONDITIONS[checkId];
  const threshold = TICK_CHECK_THRESHOLDS[checkId];
  if (!sustainedFn || threshold == null) return false;
  if (!tracker) return false;
  if (sustainedFn(game)) {
    tracker.consecutiveTicks = (tracker.consecutiveTicks ?? 0) + 1;
  } else {
    tracker.consecutiveTicks = 0;
  }
  return tracker.consecutiveTicks >= threshold;
}

export function getAchievementIdsForCheckId(achievements, checkId) {
  const ids = [];
  for (let i = 0; i < achievements.length; i++) {
    const a = achievements[i];
    if (a.triggerType === "tick" && a.checkId === checkId) ids.push(a.id);
  }
  return ids;
}
