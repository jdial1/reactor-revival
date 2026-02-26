import { toDecimal } from "../../utils/decimal.js";
import { MOBILE_BREAKPOINT_PX } from "../constants.js";
import { GameDimensionsSchema } from "../schemas.js";
import { setDecimal } from "../store.js";
import { validateObjectiveState } from "./ObjectiveStateValidator.js";

function applyBaseDimensions(game, dimensions) {
  game.base_cols = dimensions.base_cols;
  game.base_rows = dimensions.base_rows;
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
}

function applyBaseResources(game) {
  setDecimal(game.state, "current_money", game.base_money);
  game.protium_particles = 0;
  setDecimal(game.state, "total_exotic_particles", 0);
  game.exoticParticleManager.exotic_particles = toDecimal(0);
  setDecimal(game.state, "current_exotic_particles", 0);
  setDecimal(game.state, "reality_flux", 0);
  game.sold_power = false;
  game.sold_heat = false;
}

async function resetSubsystems(game, bypass, preservedTechTree) {
  game.reactor.setDefaults();
  game.upgradeset.reset();
  game.partset.reset();
  game.tech_tree = preservedTechTree;
  await game.partset.initialize();
  await game.upgradeset.initialize();
  game.bypass_tech_tree_restrictions = bypass;
}

function recalculatePartStats(game) {
  if (game.partset?.partsArray?.length) {
    game.partset.partsArray.forEach((part) => {
      try {
        part.recalculate_stats();
      } catch (_) {}
    });
  }
  game.upgradeset.check_affordability(game);
}

function applyPlacementState(game) {
  game.placedCounts = {};
  game._suppressPlacementCounting = false;
}

function clearTilesThenVisuals(game) {
  game.tileset.clearAllTiles();
  game.emit?.("clearImageCache");
  game.reactor.updateStats();
  game.reactor.clearHeatVisualStates();
  game.emit?.("clearAnimations");
}

function applyPlacementThenTiles(game) {
  applyPlacementState(game);
  clearTilesThenVisuals(game);
}

function setLoopWait(game) {
  game.loop_wait = game.base_loop_wait;
}

function setPausedState(game) {
  game.paused = false;
}

function applyLoopThenPause(game) {
  setLoopWait(game);
  setPausedState(game);
}

function applyDoctrineFromTree(game) {
  const doctrine = game.getDoctrine();
  if (doctrine) game.applyDoctrineBonuses(doctrine);
}

function resetSessionTimes(game) {
  game.lifecycleManager.session_start_time = null;
  game.lifecycleManager.total_played_time = 0;
  game.lifecycleManager.last_save_time = null;
}

function applyDoctrineThenSession(game) {
  applyDoctrineFromTree(game);
  resetSessionTimes(game);
}

function resetObjectives(game) {
  if (game.objectives_manager) {
    game.objectives_manager.current_objective_index = 0;
    if (game.objectives_manager.objectives_data) {
      game.objectives_manager.objectives_data.forEach((obj) => {
        obj.completed = false;
      });
    }
    game.objectives_manager.set_objective(0, true);
  }
}

function validateObjectiveStateIfNeeded(game) {
  if (game._saved_objective_index !== undefined) {
    game.debugHistory.add("game", "Validating objective state after default set");
    validateObjectiveState(game);
  }
}

function calculateBaseDimensions() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const raw = { base_cols: isMobile ? 10 : 12, base_rows: isMobile ? 14 : 12 };
  return GameDimensionsSchema.parse(raw);
}

export async function setDefaults(game) {
  const dimensions = calculateBaseDimensions();
  applyBaseDimensions(game, dimensions);
  applyBaseResources(game);
  const bypass = game.bypass_tech_tree_restrictions;
  const preservedTechTree = game.tech_tree;
  await resetSubsystems(game, bypass, preservedTechTree);
  recalculatePartStats(game);
  applyPlacementThenTiles(game);
  applyLoopThenPause(game);
  applyDoctrineThenSession(game);
  resetObjectives(game);
  validateObjectiveStateIfNeeded(game);
}
