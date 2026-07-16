import { patchGameState } from "../state.js";
import { toDecimal, toNumber } from "../simUtils.js";

export function unlockedAchievementIds(achievements) {
  if (Array.isArray(achievements)) return achievements;
  if (achievements && typeof achievements === "object" && Array.isArray(achievements.unlocked)) {
    return achievements.unlocked;
  }
  return [];
}

export function resolveCoreSnapshot(session, tickResult) {
  return tickResult?.stateSnapshot ?? session?.getSnapshot?.() ?? null;
}

export function buildHostStatePatch(snap, tickResult = {}, tickMeta = {}) {
  if (!snap) return null;

  const grid = snap.grid ?? {};
  const economy = snap.economy ?? {};
  const coreStats = snap.stats;
  const toggles = snap.toggles ?? {};
  const warnLevel = snap.heatWarningLevel ?? tickResult.heatWarningLevel ?? null;

  const patch = {
    current_heat: grid.currentHeat ?? 0,
    current_power: grid.currentPower ?? 0,
    current_money: economy.money ?? 0,
    current_exotic_particles: economy.currentExoticParticles ?? 0,
    total_exotic_particles: economy.totalExoticParticles ?? 0,
    session_power_produced: economy.sessionPowerProduced ?? 0,
    session_power_sold: economy.sessionPowerSold ?? 0,
    session_heat_dissipated: economy.sessionHeatDissipated ?? 0,
    max_heat: grid.maxHeat ?? 0,
    max_power: grid.maxPower ?? 0,
    ui_heat_critical: warnLevel === "critical",
    ui_pipe_integrity_warning: warnLevel === "high" || warnLevel === "critical",
    melting_down: snap.hasMeltedDown ?? tickResult.meltdown ?? false,
    failure_state: snap.failureState ?? "nominal",
    hull_integrity: snap.hullIntegrity ?? 100,
    auto_sell: !!toggles.auto_sell,
    auto_buy: !!toggles.auto_buy,
    heat_control: !!toggles.heat_control,
    time_flux: toggles.time_flux !== false,
    pause: !!snap.paused,
    unlocked_achievements: [...unlockedAchievementIds(snap.achievements)],
    core_power_net_change: snap.powerNetChange ?? coreStats?.powerNetChange ?? 0,
    core_heat_net_change: snap.heatNetChange ?? coreStats?.heatNetChange ?? 0,
  };

  if (typeof snap.heatRatio === "number") {
    patch.core_heat_ratio = snap.heatRatio;
  } else if (typeof tickResult.heatRatio === "number") {
    patch.core_heat_ratio = tickResult.heatRatio;
  }

  if (coreStats) {
    patch.stats_power = coreStats.power;
    patch.stats_heat_generation = coreStats.heatGeneration;
    patch.stats_net_heat = coreStats.netHeat;
    patch.stats_vent = coreStats.vent;
    patch.stats_inlet = coreStats.inlet;
    patch.stats_outlet = coreStats.outlet;
    patch.stats_total_part_heat = coreStats.totalPartHeat;
    patch.stats_cash = coreStats.cash;
  } else {
    patch.stats_vent = tickResult.ventedHeat ?? 0;
    patch.stats_cash = toNumber(economy.money);
  }

  const norm = tickMeta.multiplier && tickMeta.multiplier !== 0 ? tickMeta.multiplier : 1;
  if (tickMeta.heatBefore != null) {
    patch.heat_delta_per_tick = (toNumber(grid.currentHeat ?? 0) - tickMeta.heatBefore) / norm;
  }
  if (tickMeta.powerBefore != null) {
    patch.power_delta_per_tick = (toNumber(grid.currentPower ?? 0) - tickMeta.powerBefore) / norm;
  }

  return patch;
}

export function applyHostStatePatch(game, patch) {
  if (!game?.state || !patch) return;
  patchGameState(game, patch);
}

export function projectReactorFromSnapshot(game, snap) {
  if (!game?.reactor || !snap) return;
  const grid = snap.grid ?? {};
  const coreStats = snap.stats;
  const reactor = game.reactor;
  const toggles = snap.toggles ?? {};

  reactor.current_heat = toDecimal(grid.currentHeat ?? 0);
  reactor.current_power = toDecimal(grid.currentPower ?? 0);
  reactor.max_heat = grid.maxHeat ?? 0;
  reactor.max_power = grid.maxPower ?? 0;
  reactor.has_melted_down = !!snap.hasMeltedDown;
  reactor.heat_controlled = !!toggles.heat_control;
  if ("auto_sell_enabled" in reactor) {
    reactor.auto_sell_enabled = !!toggles.auto_sell;
  }

  if (!coreStats) {
    reactor.stats_vent = game.state.stats_vent;
    reactor.stats_cash = game.state.stats_cash;
    return;
  }

  reactor.stats_power = coreStats.power;
  reactor.stats_cell_power = coreStats.cellPower;
  reactor.stats_stirling_power = coreStats.stirlingPower;
  reactor.stats_heat_generation = coreStats.heatGeneration;
  reactor.stats_net_heat = coreStats.netHeat;
  reactor.stats_vent = coreStats.vent;
  reactor.stats_inlet = coreStats.inlet;
  reactor.stats_outlet = coreStats.outlet;
  reactor.stats_total_part_heat = coreStats.totalPartHeat;
  reactor.stats_cash = coreStats.cash;
}

export function projectTileRuntimeFromSnapshot(game, liveGrid, cellOutputs) {
  if (!game?.tileset || !liveGrid) return;

  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const tile = game.tileset.getTile(r, c);
      if (!tile?.part || tile.exploded || tile.exploding) continue;
      const tileHeat = liveGrid.getTileHeat(r, c);
      if (typeof tileHeat === "number") tile.heat_contained = toDecimal(tileHeat);
    }
  }

  if (!Array.isArray(cellOutputs)) return;
  applyCellOutputsToTiles(game.tileset, cellOutputs);
}

export function applyCellOutputsToTiles(tileset, outputs) {
  if (!tileset || !Array.isArray(outputs)) return;
  const byKey = new Map();
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i];
    byKey.set(`${out.row},${out.col}`, out);
  }
  const tiles = tileset.active_tiles_list;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile?.activated || !tile.part) continue;
    tile.powerOutput = 0;
    tile.heatOutput = 0;
    const out = byKey.get(`${tile.row},${tile.col}`);
    if (out) {
      tile.power = out.power;
      tile.heat = out.heat;
      tile.display_power = out.power || 0;
      tile.display_heat = out.heat || 0;
      continue;
    }
    const p = tile.part;
    tile.power = typeof p.power === "number" ? p.power : 0;
    tile.heat = typeof p.heat === "number" ? p.heat : 0;
    tile.display_power = 0;
    tile.display_heat = 0;
  }
}

export function syncTilePulseDisplays(reactor) {
  const tileset = reactor?.game?.tileset;
  if (!tileset) return;
  const bridge = reactor.game.coreBridge;
  if (!bridge?.isActive) return;
  bridge.syncForStatsRead();
  const session = bridge.session;
  const outputs = session.refreshCellOutputs?.()
    ?? session.getCellOutputs?.()
    ?? session.engine?.getLastCellOutputs?.()
    ?? [];
  applyCellOutputsToTiles(tileset, outputs);
}

export function projectObjectivesFromSnapshot(game, snap, liveObjectives) {
  const serialized = snap?.objectives;
  if (!serialized || !game.objectives_manager) return;

  const completedIndices = serialized.completed ?? [];
  for (let i = 0; i < completedIndices.length; i++) {
    const ci = completedIndices[i];
    if (game.objectives_manager.objectives_data?.[ci]) {
      game.objectives_manager.objectives_data[ci].completed = true;
    }
  }

  const om = game.objectives_manager;
  if (om.current_objective_def && liveObjectives?.isComplete?.(om.current_objective_index)) {
    om.current_objective_def.completed = true;
  }

  const objectiveFlags = serialized.flags ?? {};
  game.sold_power = !!objectiveFlags.soldPower;
  game.sold_heat = !!objectiveFlags.soldHeat;
}

export function projectSessionMetaToGame(game, session, snap) {
  if (!game || !session) return;

  game.paused = session.paused;
  if (session.paused && game.engine?.running) {
    game.engine.stop?.();
  } else if (!session.paused && game.engine && !game.engine.running && game.reactor && !game.reactor.has_melted_down) {
    game.engine.start?.();
  }

  if (game.lifecycleManager) {
    game.lifecycleManager.total_played_time = snap?.totalPlayedTime ?? session.totalPlayedTime;
  }

  game.run_id = session.runId;
  game.tech_tree = snap?.techTree ?? session.techTree;
  game.placedCounts = { ...(snap?.placedCounts ?? session.placedCounts) };
  game.grace_period_ticks = snap?.gracePeriodTicks ?? session.systems.failure?.gracePeriodTicks ?? game.grace_period_ticks;
  game.offline_tick = snap?.isCatchingUp ?? session.isCatchingUp;
  game.tick_count = snap?.engine?.tickCount ?? session.engine.tickCount;
  game._coreSnapshot = snap;

  const protium = snap?.economy?.protiumParticles;
  if (protium != null) game.protium_particles = protium;
}
