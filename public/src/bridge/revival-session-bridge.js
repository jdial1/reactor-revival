import {
  createGameSession,
  computeBlueprintDiff,
  computePartSellValue,
} from "reactor-core";
import { toNumber } from "../simUtils.js";
import {
  applyHostStatePatch,
  buildHostStatePatch,
  hydrateAchievementsIntoSession,
  hydrateObjectivesIntoSession,
  projectHeatWarningUi,
  projectObjectivesFromSnapshot,
  projectReactorFromSnapshot,
  projectSessionMetaToGame,
  projectTileRuntimeFromSnapshot,
  resolveCoreSnapshot,
} from "./core-state-projection.js";
import { presentMeltdown, routeSessionEvents } from "./route-session-events.js";
import { assertNotTickInFlight, buildTickCommit } from "./tick-commit.js";
import { drainIntentQueue } from "./bridge-intents.js";
import {
  hydrateGridFromHost,
  syncGridToGame as syncGridLayoutToGame,
} from "./bridge-grid-sync.js";
import { hydrateUpgradeLevelsFromHost } from "./bridge-upgrades.js";
import { hydrateEconomyFromHost } from "./bridge-economy-sync.js";
import { syncHostSellOverridesToSession } from "./bridge-mechanics.js";
import {
  getHeatSegmentForTile,
  inspectExchangerPressureFlow,
} from "./bridge-heat.js";
import { getActiveBridge } from "./active.js";

function syncObjectiveFlagsFromGame(bridge) {
  const objectives = bridge.session?.systems?.objectives;
  if (!objectives || !bridge.game) return;
  objectives.setFlags?.({
    soldPower: !!bridge.game.sold_power,
    soldHeat: !!bridge.game.sold_heat,
  });
}

function syncTickMetaFromGame(bridge) {
  if (!bridge.session || !bridge.game) return;
  bridge.session.suppressExplosions = false;
  syncObjectiveFlagsFromGame(bridge);
}

function syncTogglesFromGame(bridge) {
  if (!bridge.session || !bridge.game?.state) return;
  const st = bridge.game.state;
  const reactor = bridge.game.reactor;
  bridge.session.toggles.auto_sell = !!(st.auto_sell || reactor?.auto_sell_enabled);
  bridge.session.toggles.auto_buy = !!st.auto_buy;
  bridge.session.toggles.heat_control = !!(st.heat_control || reactor?.heat_controlled);
  bridge.session.toggles.time_flux = st.time_flux !== false;
  bridge.session.setPaused(!!st.pause);
}

function syncMetaFromGame(bridge) {
  if (!bridge.session || !bridge.game) return;
  syncTickMetaFromGame(bridge);
  bridge.session.runId = bridge.game.run_id ?? bridge.session.runId;
  bridge.session.techTree = bridge.game.tech_tree ?? bridge.session.techTree;
  bridge.session.totalPlayedTime = bridge.game.lifecycleManager?.total_played_time ?? bridge.session.totalPlayedTime;
  bridge.session.lastSaveTime = bridge.game.lifecycleManager?.last_save_time ?? bridge.session.lastSaveTime;
  hydrateAchievementsIntoSession(bridge);
  if (bridge.game.blueprintPlanner) {
    const prevSlots = JSON.stringify(bridge.session.blueprintPlanner?.slots ?? {});
    bridge.session.blueprintPlanner = {
      slots: { ...(bridge.game.blueprintPlanner.slots ?? {}) },
      active: !!bridge.game.blueprintPlanner.active,
    };
    const nextSlots = JSON.stringify(bridge.session.blueprintPlanner.slots);
    if (prevSlots !== nextSlots) {
      const snapshot = bridge.session.getSnapshot?.();
      bridge.session.events?.emit("blueprintPlannerChanged", {
        netHeat: snapshot?.stats?.netHeat,
        power: snapshot?.stats?.power,
      });
    }
  }
}

class RevivalSessionBridge {
  constructor(game, _options = {}) {
    this.game = game;
    this.session = null;
    this._ready = false;
    this._initPromise = null;
  }

  get isActive() {
    return this._ready && this.session != null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = createGameSession({ gameId: "reactor_revival" }).then((session) => {
      this.session = session;
      this._ready = true;
      this._bindExplosionHullDump();
      this.hydrateFromHost();
      this.session.systems.failure?.setGracePeriodTicks?.(this.game.grace_period_ticks ?? 0);
      if (Object.keys(this.game.placedCounts || {}).length > 0) {
        this.session.setPlacedCounts(this.game.placedCounts);
      } else {
        this.session.rebuildPlacedCounts();
      }
      this.game.placedCounts = { ...(this.session.placedCounts || {}) };
      return session;
    });
    return this._initPromise;
  }

  _bindExplosionHullDump() {
    if (!this.session?.hooks?.on || this._explosionHullDumpBound) return;
    this._explosionHullDumpBound = true;
    this.session.hooks.on("game:componentExplosion", (payload) => {
      this._dumpExplodedTileHeatToHull(payload);
    });
  }

  _dumpExplodedTileHeatToHull(payload) {
    const row = payload?.row;
    const col = payload?.col;
    const grid = this.session?.grid;
    if (!grid || typeof row !== "number" || typeof col !== "number") return;
    const amount = toNumber(grid.getTileHeat(row, col));
    if (!(amount > 0)) return;
    grid.adjustCurrentHeat(amount);
    grid.setTileHeat(row, col, 0);
  }

  hydrateFromHost() {
    assertNotTickInFlight(this, "hydrateFromHost");
    if (!this.session || !this.game) return;
    hydrateUpgradeLevelsFromHost(this);
    hydrateGridFromHost(this);
    hydrateEconomyFromHost(this);
    syncMetaFromGame(this);
    syncTogglesFromGame(this);
    hydrateObjectivesIntoSession(this);
  }

  getSnapshot() {
    return this.session?.getSnapshot?.() ?? null;
  }

  projectLiveState() {
    if (!this.session) return;
    this.projectToGame();
  }

  _syncBeforeTick() {
    syncTickMetaFromGame(this);
    syncHostSellOverridesToSession(this);
  }

  resolveDisplayRatesForTile(tile) {
    if (!this.session || !tile) return null;
    const inst = this.session.grid.getComponentAt(tile.row, tile.col);
    if (inst?.definition) return this.session.resolveDisplayRates(inst);
    if (tile.part?.id) return this.session.resolveDisplayRates(tile.part.id);
    return null;
  }

  getHeatSegmentForTile(tile) {
    return getHeatSegmentForTile(this, tile);
  }

  inspectExchangerPressureFlow(tile) {
    return inspectExchangerPressureFlow(this, tile);
  }

  describeCellPulse(tile) {
    if (!this.session || !tile || typeof tile.row !== "number") return null;
    return this.session.describeCellPulse?.(tile.row, tile.col) ?? null;
  }

  hasTickActivity() {
    if (!this.session) return false;
    if ((this.session.pendingCommands ?? 0) > 0) return true;
    return !!this.session.hasTickActivity?.();
  }

  getPrestigeMultiplier() {
    if (!this.session) return 1;
    return this.session.getPrestigeMultiplier?.() ?? 1;
  }

  computeSellValueForTile(tile) {
    if (!this.session || !tile || typeof tile.row !== "number" || typeof tile.col !== "number") return 0;
    this.session.grid.recalculateCaps?.();
    return toNumber(this.session.computeSellValue(tile.row, tile.col));
  }

  computeSellValueForPart(partId) {
    if (!this.session || !partId) return 0;
    const def = this.session.getPart?.(partId);
    if (!def) return 0;
    return toNumber(computePartSellValue(def));
  }

  _syncBeforeSessionOp() {
    if (!this.session) return false;
    syncTickMetaFromGame(this);
    return true;
  }

  dispatch(command) {
    if (!this.session || !command?.type) return { ok: false, result: null };
    this._syncBeforeSessionOp();
    this.session.dispatch(command);
    const applied = this.drainPendingCommands();
    const entry = applied.find((e) => e.type === command.type);
    const result = entry?.result;
    const failed = result === false || result == null || result?.ok === false;
    if (failed) return { ok: false, result: result ?? null };
    syncGridLayoutToGame(this);
    if (this._deferIntentProject) return { ok: true, result };
    this.routeEvents();
    this.projectLiveState();
    return { ok: true, result };
  }

  _drainQueuedIntentsBeforeTick() {
    const game = this.game;
    if (!game?.state?.intent_queue?.length) return;
    this._deferIntentProject = true;
    let reboots = [];
    try {
      ({ reboots } = drainIntentQueue(game, game.engine));
    } finally {
      this._deferIntentProject = false;
    }
    this._pendingRebootIntents = reboots;
  }


  _syncForObjectiveEval() {
    syncMetaFromGame(this);
    syncObjectiveFlagsFromGame(this);
    this.session?.grid?.recalculateCaps?.();
  }

  _objectiveEvalContext() {
    const melted = !!this.game?.reactor?.has_melted_down;
    return {
      meltdown: melted,
      hasMeltedDown: melted,
      paused: !!this.game?.paused,
    };
  }

  getObjectiveProgress() {
    if (!this.session) return null;
    this._syncForObjectiveEval();
    return this.session.getObjectiveProgress(this._objectiveEvalContext());
  }

  evaluateObjectiveCheck(checkId) {
    const objectives = this.session?.systems?.objectives;
    if (!objectives || !checkId) return null;
    this._syncForObjectiveEval();
    const list = objectives.objectives || [];
    const idx = list.findIndex((o) => o.checkId === checkId);
    if (idx < 0) return { completed: false, percent: 0, text: "Awaiting completion..." };
    const prev = objectives.currentIndex;
    objectives.setIndex(idx);
    const progress = objectives.getCurrentProgress(this.session, this._objectiveEvalContext());
    objectives.setIndex(prev);
    return progress;
  }

  processTick(multiplier = 1) {
    if (!this.session) return null;
    const heatBefore = toNumber(this.game?.reactor?.current_heat ?? 0);
    const powerBefore = toNumber(this.game?.reactor?.current_power ?? 0);
    this._drainQueuedIntentsBeforeTick();
    this._syncBeforeTick();
    this._tickInFlight = true;
    let result;
    let commit;
    try {
      result = this.session.tick({ multiplier });
      const events = this.session.drainEvents?.() || [];
      this._ensureExplosionHeatDumped(events);
      commit = buildTickCommit(this.session, result, { heatBefore, powerBefore, multiplier }, events);
    } finally {
      this._tickInFlight = false;
    }
    const econ = this.session.systems?.economy;
    if (econ && typeof econ.protiumParticles === "number") {
      this.game.protium_particles = econ.protiumParticles;
    }
    syncGridLayoutToGame(this);
    this.projectToGame(commit.tickResult, commit.tickMeta, commit.stateSnapshot);
    routeSessionEvents(this, commit.events);
    if (commit.stateSnapshot?.hasMeltedDown || commit.tickResult?.meltdown) {
      presentMeltdown(this.game);
    }
    if (econ && typeof econ.protiumParticles === "number") {
      this.game.protium_particles = econ.protiumParticles;
    }
    this.game.reactor?.updateStats?.({ fromSession: true });
    const pendingReboots = this._pendingRebootIntents;
    this._pendingRebootIntents = null;
    if (pendingReboots?.length) {
      void (async () => {
        for (let i = 0; i < pendingReboots.length; i++) {
          const keepEp = pendingReboots[i].payload?.keepEp === true;
          if (keepEp) await this.game.rebootActionKeepExoticParticles();
          else await this.game.rebootActionDiscardExoticParticles();
        }
      })();
    }
    return result;
  }

  _ensureExplosionHeatDumped(events) {
    if (!this.session?.grid || !Array.isArray(events)) return;
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (event?.type !== "componentExplosion") continue;
      const row = event.payload?.row;
      const col = event.payload?.col;
      if (typeof row !== "number" || typeof col !== "number") continue;
      const amount = toNumber(this.session.grid.getTileHeat(row, col));
      if (!(amount > 0)) continue;
      this.session.grid.adjustCurrentHeat(amount);
      this.session.grid.setTileHeat(row, col, 0);
      if (event.payload && typeof event.payload === "object") {
        event.payload.heatDumped = amount;
      }
    }
  }

  projectToGame(tickResult, tickMeta = {}, snapOverride = null) {
    const game = this.game;
    const session = this.session;
    if (!game?.state || !session) return;

    const snap = snapOverride ?? resolveCoreSnapshot(session, tickResult);
    applyHostStatePatch(game, buildHostStatePatch(snap, tickResult, tickMeta));
    projectHeatWarningUi(game, snap?.heatWarningLevel ?? tickResult?.heatWarningLevel ?? null);
    projectSessionMetaToGame(game, session, snap);
    projectReactorFromSnapshot(game, snap);
    projectTileRuntimeFromSnapshot(
      game,
      session.grid,
      tickResult?.cellOutputs ?? snap?.cellOutputs,
    );
    projectObjectivesFromSnapshot(game, snap, session.systems.objectives);
  }

  routeEvents() {
    routeSessionEvents(this);
  }

  loadLegacySave(savedData) {
    if (!this.session) return;
    this.session.loadLegacySave(savedData);
    syncGridLayoutToGame(this);
    this.projectLiveState();
  }

  drainPendingCommands() {
    if (typeof this.session?.drainCommands === "function") return this.session.drainCommands();
    if (!this.session?.commands) return [];
    return this.session.commands.drain(this.session);
  }

  getPlacedCount(type, level) {
    return this.session?.getPlacedCount?.(type, level) ?? 0;
  }

  previewBlueprintDiff(layout) {
    if (!this.session || !layout) {
      return { toRemove: [], toPlace: [], unchanged: [], breakdown: { money: 0, ep: 0 } };
    }
    this._syncBeforeSessionOp();
    return computeBlueprintDiff(this.session, layout);
  }

  previewPartialBlueprint(layout, options = {}) {
    if (!this.session || !layout) {
      return {
        toRemove: [],
        toPlace: [],
        unchanged: [],
        breakdown: { money: 0, ep: 0 },
        affordable: [],
        deferred: [],
        affordableBreakdown: { money: 0, ep: 0 },
        deficit: null,
      };
    }
    this._syncBeforeSessionOp();
    return this.session.previewPartialBlueprint(layout, options);
  }

  layoutCost(layout) {
    if (!this.session || !layout) return { breakdown: { money: 0, ep: 0 }, items: [] };
    this._syncBeforeSessionOp();
    return this.session.layoutCost(layout);
  }

  async sampleLayoutProjection({ layout = null, recordTicks = false } = {}) {
    if (!this.session) return null;
    const tickCount = recordTicks === true ? 30 : (typeof recordTicks === "number" ? Math.max(1, recordTicks | 0) : 8);
    const sampleSession = await createGameSession({ gameId: "reactor_revival" });
    const normalizePartIds = (raw) => {
      if (!raw) return null;
      if (raw.partIds && raw.rows != null && raw.cols != null) return raw;
      if (!Array.isArray(raw) || !Array.isArray(raw[0])) return null;
      const rows = raw.length;
      const cols = raw[0].length;
      const partIds = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = raw[r][c];
          partIds.push(cell?.id ?? cell?.t ?? (typeof cell === "string" ? cell : null));
        }
      }
      return { rows, cols, partIds };
    };
    try {
      sampleSession.load(this.session.save());
      const normalized = normalizePartIds(layout);
      if (normalized) {
        const { rows, cols, partIds } = normalized;
        if (sampleSession.grid.rows !== rows || sampleSession.grid.cols !== cols) {
          sampleSession.grid.resize(rows, cols);
        }
        sampleSession.grid.clearGrid();
        let i = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const id = partIds[i++];
            if (id) sampleSession.placeComponent(r, c, id);
          }
        }
        sampleSession.grid.recalculateCaps?.();
      }
      const tick_series = [];
      for (let t = 0; t < tickCount; t++) {
        sampleSession.tick();
        const snap = sampleSession.getSnapshot();
        const stats = snap?.stats ?? {};
        tick_series.push({
          tick: t,
          power: stats.power ?? 0,
          net_heat: stats.netHeat ?? 0,
          heat: snap?.grid?.currentHeat ?? 0,
          meltdown: !!(snap?.hasMeltedDown ?? snap?.engine?.meltdown),
        });
      }
      const snap = sampleSession.getSnapshot();
      const stats = snap?.stats ?? {};
      return {
        stats,
        stats_power: stats.power ?? 0,
        stats_net_heat: stats.netHeat ?? 0,
        stats_ep: stats.cash ?? 0,
        tick_series: recordTicks ? tick_series : undefined,
        meltdown: !!(snap?.hasMeltedDown),
        heatRatio: snap?.heatRatio ?? 0,
      };
    } catch (_) {
      return null;
    }
  }

  computeGridSellCredit(sellMultiplier, options) {
    if (!this.session) return { total: 0, items: [], sellMultiplier: sellMultiplier ?? 0.5 };
    return this.session.computeGridSellCredit(sellMultiplier, options);
  }

  previewUpgrade(id) {
    if (!this.session || !id) return null;
    return this.session.previewUpgrade(id);
  }

  isUpgradeAvailable(id) {
    if (!this.session || !id) return false;
    this.session.techTree = this.game.tech_tree ?? this.session.techTree;
    return this.session.isUpgradeAvailable(id);
  }

  listUpgrades() {
    if (!this.session) return [];
    this.session.techTree = this.game.tech_tree ?? this.session.techTree;
    return this.session.listUpgrades();
  }

  queryNeighbors(row, col, options) {
    if (!this.session) return { containment: [], cell: [], reflector: [] };
    return this.session.queryNeighbors(row, col, options);
  }

  getUpgradeLevel(id) {
    return this.session?.getUpgradeLevel?.(id) ?? 0;
  }

}

export async function attachCoreBridge(game, options = {}) {
  const existing = getActiveBridge(game);
  if (existing) return existing;
  const bridge = new RevivalSessionBridge(game, options);
  game.coreBridge = bridge;
  await bridge.init();
  return bridge;
}
