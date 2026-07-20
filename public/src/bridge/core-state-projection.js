import { patchGameState } from "../state/patch-game-state.js";
import { bumpSnapshotRev } from "../state/snapshot-rev.js";
import { toDecimal, toNumber } from "../simUtils.js";
import { getActiveBridge } from "./active.js";

export function unlockedAchievementIds(achievements) {
  if (Array.isArray(achievements)) return achievements;
  if (achievements && typeof achievements === "object" && Array.isArray(achievements.unlocked)) {
    return achievements.unlocked;
  }
  return [];
}

export function hydrateAchievementsIntoSession(bridge) {
  if (!bridge?.session || !bridge.game?.state) return;
  const full = bridge.game.state.achievements;
  if (full && typeof full === "object" && !Array.isArray(full)) {
    bridge.session.systems.achievements?.deserialize?.(full);
    const ids = unlockedAchievementIds(full);
    bridge.session.achievements = ids;
    bridge.game.state.unlocked_achievements = ids;
    return;
  }
  const fromState = bridge.game.state.unlocked_achievements;
  const ids = Array.isArray(fromState)
    ? [...fromState]
    : [...(Array.isArray(bridge.session.achievements) ? bridge.session.achievements : [])];
  bridge.session.achievements = ids;
  bridge.session.systems.achievements?.deserialize?.(ids);
}

export function hydrateObjectivesIntoSession(bridge) {
  const objectives = bridge?.session?.systems?.objectives;
  const om = bridge?.game?.objectives_manager;
  if (!objectives || !om) return;
  const completed = [];
  const data = om.objectives_data || [];
  for (let i = 0; i < data.length; i++) {
    if (data[i]?.completed) completed.push(i);
  }
  const rawIndex = om.current_objective_index ?? 0;
  objectives.deserialize?.({
    currentIndex: rawIndex,
    completed,
    flags: {
      soldPower: !!bridge.game.sold_power,
      soldHeat: !!bridge.game.sold_heat,
    },
  });
  objectives.setIndex?.(rawIndex);
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
    melting_down: !!(snap.hasMeltedDown ?? tickResult?.meltdown),
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
  const prevFailure = game.state.failure_state;
  patchGameState(game, patch);
  if (patch.failure_state != null && patch.failure_state !== prevFailure) {
    game.emit?.("failureStateChanged", { state: game.state.failure_state });
  }
  bumpSnapshotRev(game);
}

export function projectHeatWarningUi(game, warnLevel) {
  const uiState = game?.ui?.uiState;
  if (!uiState) return;
  uiState.heat_critical = warnLevel === "critical";
  uiState.pipe_integrity_warning = warnLevel === "high" || warnLevel === "critical";
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
  if (coreStats.temp_vent_multiplier != null) {
    reactor.vent_multiplier_eff = coreStats.temp_vent_multiplier;
  } else if (coreStats.ventMultiplier != null) {
    reactor.vent_multiplier_eff = coreStats.ventMultiplier;
  }
  if (coreStats.temp_transfer_multiplier != null) {
    reactor.transfer_multiplier_eff = coreStats.temp_transfer_multiplier;
  } else if (coreStats.transferMultiplier != null) {
    reactor.transfer_multiplier_eff = coreStats.transferMultiplier;
  }
}

export function projectHeatMapToTileset(bridge) {
  const tileset = bridge?.game?.tileset;
  const grid = bridge?.session?.grid;
  const heatMap = grid?.tileHeatMap;
  if (!tileset?.heatMap || !heatMap) return;
  const host = tileset.heatMap;
  host.fill(0);
  const rows = Math.min(tileset.max_rows, heatMap.rows ?? grid.rows ?? 0);
  const cols = Math.min(tileset.max_cols, heatMap.cols ?? grid.cols ?? 0);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid.getComponentAt?.(r, c)) continue;
      host[tileset.gridIndex(r, c)] = heatMap.getHeat
        ? heatMap.getHeat(r, c)
        : grid.getTileHeat(r, c);
    }
  }
}

function clearOrphanSessionTileHeat(bridge) {
  const grid = bridge?.session?.grid;
  if (!grid?.tileHeatMap || !grid.getComponentAt) return;
  const rows = grid.rows ?? grid.tileHeatMap.rows ?? 0;
  const cols = grid.cols ?? grid.tileHeatMap.cols ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid.getComponentAt(r, c)) continue;
      if (grid.getTileHeat(r, c) > 0) grid.setTileHeat(r, c, 0);
    }
  }
}

export function projectTileRuntimeFromSnapshot(game, liveGrid, cellOutputs) {
  if (!game?.tileset || !liveGrid) return;

  const bridge = getActiveBridge(game);
  if (bridge?.session?.grid === liveGrid) {
    clearOrphanSessionTileHeat(bridge);
    projectHeatMapToTileset(bridge);
  } else if (liveGrid.tileHeatMap && game.tileset.heatMap) {
    projectHeatMapToTileset({ game, session: { grid: liveGrid } });
  } else {
    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        const tile = game.tileset.getTile(r, c);
        if (!tile?.part || tile.exploded || tile.exploding) continue;
        const tileHeat = liveGrid.getTileHeat(r, c);
        if (typeof tileHeat === "number") tile._setProjectedHeat(tileHeat);
      }
    }
  }

  if (!Array.isArray(cellOutputs)) return;
  applyCellOutputsToTiles(game.tileset, cellOutputs);
}

function applyCellOutputsToTiles(tileset, outputs) {
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
  const bridge = getActiveBridge(reactor.game);
  if (!bridge) return;
  const session = bridge.session;
  session?.grid?.recalculateCaps?.();
  const outputs = session.refreshCellOutputs?.()
    ?? session.getCellOutputs?.()
    ?? session.engine?.getLastCellOutputs?.()
    ?? [];
  applyCellOutputsToTiles(tileset, outputs);
}

export function projectObjectivesFromSnapshot(game, snap, liveObjectives) {
  const serialized = snap?.objectives;
  if (!serialized || !game.objectives_manager) return;

  const om = game.objectives_manager;
  const data = om.objectives_data;
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (data[i]) data[i].completed = false;
    }
  }

  const completedIndices = serialized.completed ?? [];
  for (let i = 0; i < completedIndices.length; i++) {
    const ci = completedIndices[i];
    if (data?.[ci]) data[ci].completed = true;
  }

  if (om.current_objective_def) {
    om.current_objective_def.completed = !!liveObjectives?.isComplete?.(om.current_objective_index);
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

  const protium = session.systems?.economy?.protiumParticles
    ?? snap?.economy?.protiumParticles;
  if (protium != null) game.protium_particles = toNumber(protium);
}
