import { logger } from "../../utils/logger.js";

export function buildSaveContext(game, { getToggles, getQuickSelectSlots }) {
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

export function buildPersistenceContext(game, getCompactLayout) {
  return {
    isSandbox: game.isSandbox,
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
