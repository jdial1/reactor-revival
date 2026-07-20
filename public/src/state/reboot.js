import { requireActiveBridge } from "../bridge/active.js";
import { hydrateObjectivesIntoSession } from "../bridge/core-state-projection.js";
import { projectUpgradeLevelsToHost } from "../bridge/bridge-upgrades.js";
import { toDecimal } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { recordSimEvent } from "../domain/sim-events.js";
import { withHostEconomyHydrate } from "./economy-hydrate.js";
import { enqueueClearAnimations } from "./game-effects.js";
import { flushGameEffects } from "./game-effects-flush.js";
import { setDecimal } from "./decimal-sync.js";

export function resetSessionCriticalityCounters(game) {
  if (!game?.state) return;
  setDecimal(game.state, "session_power_produced", 0);
  setDecimal(game.state, "session_power_sold", 0);
  setDecimal(game.state, "session_heat_dissipated", 0);
}

function clearState(game) {
  game.reactor.clearMeltdownState();
  game.reactor.current_heat = 0;
  game.reactor.current_power = 0;
  enqueueClearAnimations(game);
  flushGameEffects(game);
}

function refreshUI(game) {
  game.reactor.updateStats();
  game.emit?.("partsPanelRefresh");
}

function refreshObjective(game) {
  if (game.objectives_manager) game.objectives_manager.check_current_objective();
}

function resetObjectives(game) {
  if (!game.objectives_manager) return;
  game.objectives_manager.teardown?.();
  game.objectives_manager.current_objective_index = 0;
  if (game.objectives_manager.objectives_data?.length) {
    game.objectives_manager.objectives_data.forEach((obj) => {
      obj.completed = false;
    });
    game.objectives_manager.set_objective(0, true);
  }
  hydrateObjectivesIntoSession(game.coreBridge);
}

function dispatchReboot(bridge, keepEp) {
  const preview = bridge.session?.previewPrestige?.({ keepEp }) ?? {};
  const { result } = bridge.dispatch({
    type: "REBOOT",
    payload: { keepEp, refundEp: false },
  });
  projectUpgradeLevelsToHost(bridge);
  const earnedNum = Number(result);
  const earned = keepEp
    ? (Number.isFinite(earnedNum) ? earnedNum : Number(preview?.earned) || 0)
    : 0;
  return {
    earned,
    keepEp,
    fuelCellCount: preview?.fuelCellCount ?? 0,
    sessionPowerProduced: preview?.sessionPowerProduced ?? 0,
    sessionHeatDissipated: preview?.sessionHeatDissipated ?? 0,
  };
}

async function runCoreKeepEpPrestige(game, bridge) {
  const savedProtium = game.protium_particles;
  const result = dispatchReboot(bridge, true);
  game.protium_particles = savedProtium;
  const epFromWeave = result.earned;
  withHostEconomyHydrate(game, () => {
    game.exoticParticleManager.exotic_particles = toDecimal(epFromWeave);
  });
  clearState(game);
  resetObjectives(game);
  hydrateObjectivesIntoSession(bridge);
  game.state.last_prestige = {
    keepEp: true,
    epFromWeave,
    fuelCellCount: result.fuelCellCount,
    sessionPowerProduced: result.sessionPowerProduced,
    sessionHeatDissipated: result.sessionHeatDissipated,
  };
  game.state.prestige_seq = (game.state.prestige_seq ?? 0) + 1;
  refreshUI(game);
  refreshObjective(game);
}

async function runCoreDiscardEpReboot(game, bridge) {
  const savedProtium = game.protium_particles;
  dispatchReboot(bridge, false);
  game.protium_particles = savedProtium;
  withHostEconomyHydrate(game, () => {
    game.exoticParticleManager.exotic_particles = toDecimal(0);
  });
  clearState(game);
  resetObjectives(game);
  hydrateObjectivesIntoSession(bridge);
  refreshUI(game);
  refreshObjective(game);
}

async function runRebootActionInternal(game, keep_exotic_particles) {
  logger.log("debug", "game", "Reboot action initiated", { keep_exotic_particles });
  recordSimEvent(game, { type: "PRESTIGE_REBOOT_TRIGGERED" });
  flushGameEffects(game);
  const bridge = requireActiveBridge(game, "reboot");
  if (keep_exotic_particles) await runCoreKeepEpPrestige(game, bridge);
  else await runCoreDiscardEpReboot(game, bridge);
}

export async function runRebootActionKeepEp(game) {
  await runRebootActionInternal(game, true);
}

export async function runRebootActionDiscardEp(game) {
  await runRebootActionInternal(game, false);
}

export async function runRebootAction(game, keep_exotic_particles = false) {
  await runRebootActionInternal(game, keep_exotic_particles);
}

export async function runFullReboot(game) {
  if (game.engine && game.engine.running) game.engine.stop();
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
  if (game._test_grid_size) {
    game.gridManager.setRows(game._test_grid_size.rows);
    game.gridManager.setCols(game._test_grid_size.cols);
  }
  const bridge = requireActiveBridge(game, "runFullReboot");
  bridge.dispatch({ type: "SET_TOGGLE", payload: { toggleName: "pause", value: false } });
  if (bridge.session.grid.rows !== game.rows || bridge.session.grid.cols !== game.cols) {
    bridge.session.grid.resize(game.rows, game.cols);
  }
  game.tech_tree = null;
  bridge.session.techTree = null;
  game.protium_particles = 0;
  bridge.dispatch({ type: "REBOOT", payload: { keepEp: false, refundEp: false } });
  bridge.session.loadEconomyState({
    money: 0,
    currentExoticParticles: 0,
    totalExoticParticles: 0,
    sessionPowerProduced: 0,
    sessionPowerSold: 0,
    sessionHeatDissipated: 0,
    soldHeat: false,
    protiumParticles: 0,
  });
  const experimental = [];
  const upgrades = game.upgradeset?.upgradesArray || [];
  for (let i = 0; i < upgrades.length; i++) {
    const upg = upgrades[i];
    if (!upg?.upgrade?.type?.includes?.("experimental")) continue;
    const level = bridge.session.getUpgradeLevel?.(upg.id) ?? 0;
    if (level > 0) experimental.push({ id: upg.id, level });
  }
  bridge.session.setUpgradeLevels(experimental);
  projectUpgradeLevelsToHost(bridge);
  bridge.routeEvents();
  bridge.projectLiveState();
  game.reactor?.updateStats?.();
  resetSessionCriticalityCounters(game);
  if (game.reactor) {
    game.state.melting_down = false;
    game.reactor.updateStats();
  }
  game.syncModifiersFromUpgrades();
}

export { resetObjectives };
