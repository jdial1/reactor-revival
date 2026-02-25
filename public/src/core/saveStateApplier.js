import { toDecimal } from "../utils/decimal.js";
import { logger } from "../utils/logger.js";
import { setDecimal } from "./store.js";

function applyCoreGameState(game, savedData) {
  setDecimal(game.state, "current_money", savedData.current_money !== undefined ? savedData.current_money : game.base_money);
  game.run_id = savedData.run_id || crypto.randomUUID();
  game.tech_tree = savedData.tech_tree || null;
  game.peak_power = (savedData.reactor?.current_power != null ? toDecimal(savedData.reactor.current_power).toNumber() : 0);
  game.peak_heat = (savedData.reactor?.current_heat != null ? toDecimal(savedData.reactor.current_heat).toNumber() : 0);
  game.base_rows = savedData.base_rows ?? 12;
  game.base_cols = savedData.base_cols ?? 12;
  game.protium_particles = savedData.protium_particles || 0;
  setDecimal(game.state, "total_exotic_particles", savedData.total_exotic_particles ?? 0);
  const epRaw = savedData.current_exotic_particles ?? savedData.exotic_particles ?? 0;
  game.exoticParticleManager.exotic_particles = toDecimal(epRaw);
  setDecimal(game.state, "current_exotic_particles", epRaw);
  setDecimal(game.state, "reality_flux", savedData.reality_flux ?? 0);
  game.emit?.("exoticParticlesChanged", {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    reality_flux: game.state.reality_flux,
  });
  game.gridManager.setRows(savedData.rows || game.base_rows);
  game.gridManager.setCols(savedData.cols || game.base_cols);
  game.sold_power = savedData.sold_power || false;
  game.sold_heat = savedData.sold_heat || false;
  game.grace_period_ticks = savedData.grace_period_ticks ?? (game._isRestoringSave ? 30 : 0);
}

function applySessionMetadata(game, savedData) {
  game.lifecycleManager.total_played_time = savedData.total_played_time || 0;
  game.lifecycleManager.last_save_time = savedData.last_save_time || null;
  game.lifecycleManager.session_start_time = null;
  game.placedCounts = savedData.placedCounts ?? {};
}

function applyReactorState(game, savedData) {
  if (!savedData.reactor) return;
  game.reactor.current_heat = toDecimal(savedData.reactor.current_heat ?? 0);
  game.reactor.current_power = toDecimal(savedData.reactor.current_power ?? 0);
  game.reactor.has_melted_down = savedData.reactor.has_melted_down || false;
  if (savedData.reactor.base_max_heat != null) game.reactor.base_max_heat = savedData.reactor.base_max_heat;
  if (savedData.reactor.base_max_power != null) game.reactor.base_max_power = savedData.reactor.base_max_power;
  if (savedData.reactor.altered_max_heat != null) game.reactor.altered_max_heat = savedData.reactor.altered_max_heat;
  if (savedData.reactor.altered_max_power != null) game.reactor.altered_max_power = savedData.reactor.altered_max_power;
  game.emit?.("meltdownStateChanged");
}

async function applyUpgrades(game, savedData) {
  game.upgradeset.reset();
  await game.upgradeset.initialize();
  if (savedData.upgrades) {
    savedData.upgrades.forEach((upgData) => {
      const upgrade = game.upgradeset.getUpgrade(upgData.id);
      if (upgrade) upgrade.setLevel(upgData.level);
    });
  }
  if (game.upgradeset && game.tech_tree) game.upgradeset.sanitizeDoctrineUpgradeLevelsOnLoad(game.tech_tree);
  game.reactor.updateStats();
}

async function restoreTiles(game, savedData) {
  if (!game.tileset.initialized) game.tileset.initialize();
  game.tileset.clearAllTiles();
  if (!savedData.tiles) return;
  const prevSuppress = game._suppressPlacementCounting;
  game._suppressPlacementCounting = true;
  await Promise.all(
    savedData.tiles.map(async (tileData) => {
      const tile = game.tileset.getTile(tileData.row, tileData.col);
      const part = game.partset.getPartById(tileData.partId);
      if (tile && part) {
        await tile.setPart(part);
        tile.ticks = tileData.ticks;
        tile.heat_contained = tileData.heat_contained;
      }
    })
  );
  game._suppressPlacementCounting = prevSuppress;
  if (!savedData.placedCounts) {
    for (const tile of game.tileset.tiles_list) {
      if (tile.part) {
        const key = `${tile.part.type}:${tile.part.level}`;
        game.placedCounts[key] = (game.placedCounts[key] || 0) + 1;
      }
    }
  }
}

function parseObjectiveIndex(savedData) {
  let savedIndex = savedData.objectives.current_objective_index;
  if (savedIndex === null || savedIndex === undefined) return 0;
  const parsedIndex = parseInt(savedIndex, 10);
  if (isNaN(parsedIndex)) {
    logger.log('warn', 'game', `Invalid objective index "${savedData.objectives.current_objective_index}" in save data. Defaulting to 0.`);
    return 0;
  }
  return Math.floor(parsedIndex);
}

function clampObjectiveIndex(game, savedData, savedIndex) {
  if (!game.objectives_manager?.objectives_data?.length) return savedIndex;
  const objectivesData = game.objectives_manager.objectives_data;
  const lastDef = objectivesData[objectivesData.length - 1];
  const maxValidIndex = (lastDef && lastDef.checkId === "allObjectives") ? objectivesData.length - 2 : objectivesData.length - 1;
  if (savedIndex < 0) {
    console.warn(`Negative objective index ${savedIndex}. Clamping to 0.`);
    return 0;
  }
  if (savedIndex > maxValidIndex) {
    logger.log('warn', 'game', `Objective index ${savedIndex} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`);
    return maxValidIndex;
  }
  return savedIndex;
}

function applyInfiniteObjective(game, savedData) {
  const inf = savedData.objectives.infinite_objective;
  if (!inf || !game.objectives_manager) return;
  game.objectives_manager.infiniteObjective = {
    title: inf.title,
    checkId: inf.checkId,
    target: inf.target,
    reward: inf.reward,
    completed: !!inf.completed,
  };
  if (inf._lastInfinitePowerTarget != null) game.objectives_manager._lastInfinitePowerTarget = inf._lastInfinitePowerTarget;
  if (inf._lastInfiniteHeatMaintain != null) game.objectives_manager._lastInfiniteHeatMaintain = inf._lastInfiniteHeatMaintain;
  if (inf._lastInfiniteMoneyThorium != null) game.objectives_manager._lastInfiniteMoneyThorium = inf._lastInfiniteMoneyThorium;
  if (inf._lastInfiniteHeat != null) game.objectives_manager._lastInfiniteHeat = inf._lastInfiniteHeat;
  if (inf._lastInfiniteEP != null) game.objectives_manager._lastInfiniteEP = inf._lastInfiniteEP;
  if (inf._infiniteChallengeIndex != null) game.objectives_manager._infiniteChallengeIndex = inf._infiniteChallengeIndex;
  if (inf._infiniteCompletedCount != null) game.objectives_manager._infiniteCompletedCount = inf._infiniteCompletedCount;
}

function applyObjectives(game, savedData) {
  if (!savedData.objectives) {
    game._saved_objective_index = 0;
    if (game.objectives_manager) game.objectives_manager.current_objective_index = 0;
    return;
  }
  let savedIndex = clampObjectiveIndex(game, savedData, parseObjectiveIndex(savedData));
  applyInfiniteObjective(game, savedData);
  if (savedData.objectives.completed_objectives?.length) {
    savedData.objectives.completed_objectives.forEach((completed, index) => {
      if (game.objectives_manager.objectives_data[index]) game.objectives_manager.objectives_data[index].completed = completed;
    });
  }
  game.objectives_manager.current_objective_index = savedIndex;
  game._saved_objective_index = savedIndex;
  if (game.objectives_manager?.set_objective && game.objectives_manager.objectives_data?.length) {
    game.objectives_manager.set_objective(savedIndex, true);
    if (game.objectives_manager.checkForChapterCompletion) game.objectives_manager.checkForChapterCompletion();
  }
}

function applyUIState(game, savedData) {
  game._pendingToggleStates = savedData.toggles;
  const toggles = savedData.toggles || {};
  if (game.onToggleStateChange) {
    Object.entries(toggles).forEach(([key, value]) => game.onToggleStateChange(key, value));
  }
  game.emit?.("saveLoaded", {
    toggles,
    quick_select_slots: savedData.quick_select_slots,
  });
  game.reactor.updateStats();
}

const SYNC_HYDRATORS = [applyCoreGameState, applySessionMetadata, applyReactorState];
const ASYNC_HYDRATORS = [applyUpgrades, restoreTiles];
const POST_ASYNC_HYDRATORS = [applyObjectives, applyUIState];

export async function applySaveState(game, savedData) {
  if (!savedData || typeof savedData !== "object") {
    throw new Error("Save corrupted: invalid save data structure");
  }
  for (const fn of SYNC_HYDRATORS) fn(game, savedData);
  if (!game.partset.initialized) await game.partset.initialize();
  for (const fn of ASYNC_HYDRATORS) await fn(game, savedData);
  for (const fn of POST_ASYNC_HYDRATORS) fn(game, savedData);
}
