import {
  createGameSession,
  computeBlueprintDiff,
  computePartSellValue,
} from "reactor-core";
import { toNumber } from "../simUtils.js";
import { OVERRIDE_DURATION_MS } from "../constants/balance.js";
import {
  applyHostStatePatch,
  buildHostStatePatch,
  projectObjectivesFromSnapshot,
  projectReactorFromSnapshot,
  projectSessionMetaToGame,
  projectTileRuntimeFromSnapshot,
  resolveCoreSnapshot,
  unlockedAchievementIds,
} from "./core-state-projection.js";
import { routeSessionEvents } from "./route-session-events.js";
import {
  syncGridCheap,
  syncGridFromGame as syncGridLayoutFromGame,
  syncGridToGame as syncGridLayoutToGame,
  syncReactorScalarsFromGame,
} from "./bridge-grid-sync.js";
import {
  hydrateUpgradeLevelsFromHost as pushHostUpgradeLevelsForLoadFn,
  projectUpgradeLevelsToHost,
} from "./bridge-upgrades.js";
import { syncHostSellOverridesToSession } from "./bridge-mechanics.js";
import {
  getHeatSegmentForTile,
  inspectExchangerPressureFlow,
} from "./bridge-heat.js";

export class RevivalSessionBridge {
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
      this.pushHostUpgradeLevelsForLoad();
      this.session.systems.failure?.setGracePeriodTicks?.(this.game.grace_period_ticks ?? 0);
      this.syncGridFromGame();
      this.syncTogglesFromGame();
      this.syncMetaFromGame();
      this.loadEconomyFromHost();
      if (Object.keys(this.game.placedCounts || {}).length > 0) {
        this.setPlacedCounts(this.game.placedCounts);
      } else {
        this.rebuildPlacedCounts();
      }
      return session;
    });
    return this._initPromise;
  }

  pushHostUpgradeLevelsForLoad() {
    pushHostUpgradeLevelsForLoadFn(this);
  }

  projectUpgradeLevelsToHost() {
    projectUpgradeLevelsToHost(this);
  }

  syncUpgradesFromGame() {
    this.pushHostUpgradeLevelsForLoad();
  }

  _syncBeforeTick() {
    this.syncTickMetaFromGame();
    this.syncTogglesFromGame();
    syncGridCheap(this);
    syncHostSellOverridesToSession(this);
    syncReactorScalarsFromGame(this);
  }

  syncTickMetaFromGame() {
    if (!this.session || !this.game) return;
    this.session.suppressExplosions = false;
    this.syncObjectiveFlagsFromGame();
  }

  loadEconomyFromHost() {
    if (!this.session?.loadEconomyState || !this.game) return;
    this.session.loadEconomyState({
      money: toNumber(this.game.state?.current_money ?? this.game.current_money),
      currentExoticParticles: toNumber(
        this.game.current_exotic_particles ?? this.game.state?.current_exotic_particles,
      ),
      totalExoticParticles: toNumber(this.game.state?.total_exotic_particles),
      sessionPowerProduced: toNumber(this.game.state?.session_power_produced),
      sessionPowerSold: toNumber(this.game.state?.session_power_sold),
      sessionHeatDissipated: toNumber(this.game.state?.session_heat_dissipated),
      soldHeat: this.game.sold_heat,
      protiumParticles: toNumber(this.game.protium_particles ?? 0),
    });
  }

  syncForStatsRead() {
    if (!this.session) return;
    syncGridCheap(this);
    this.session.grid.recalculateCaps?.();
    syncReactorScalarsFromGame(this);
    this.syncCompiledPartsFromSession();
  }

  syncCompiledPartsFromSession() {
    if (!this.session || !this.game?.partset) return;
    const parts = this.game.partset.partsArray || [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part) part.recalculate_stats();
    }
  }

  resolveDisplayRatesForTile(tile) {
    if (!this.session || !tile) return null;
    syncGridCheap(this);
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
    syncGridCheap(this);
    return this.session.describeCellPulse?.(tile.row, tile.col) ?? null;
  }

  hasTickActivity() {
    if (!this.session) return false;
    if ((this.session.pendingCommands ?? 0) > 0) return true;
    syncReactorScalarsFromGame(this);
    this.syncTogglesFromGame();
    return !!this.session.hasTickActivity?.();
  }

  grantReward(payload = {}) {
    if (!this.session) return false;
    const money = payload.money ?? payload.reward;
    const ep = payload.ep ?? payload.ep_reward;
    if (typeof this.session.grantReward === "function") {
      const result = this.session.grantReward({
        money: money != null ? toNumber(money) : undefined,
        ep: ep != null ? toNumber(ep) : undefined,
        applyPrestige: !!payload.applyPrestige,
      });
      this.routeEvents();
      this.projectToGame(this.session.engine.getLastResult());
      return !!(result && result.ok !== false);
    }
    const { ok } = this._dispatchAndProject("GRANT_REWARD", {
      money: money != null ? toNumber(money) : undefined,
      ep: ep != null ? toNumber(ep) : undefined,
      applyPrestige: !!payload.applyPrestige,
    });
    return ok;
  }

  creditMoney(amount, { applyPrestige = false } = {}) {
    if (!this.session) return false;
    const n = toNumber(amount);
    if (!(n > 0)) return false;
    if (typeof this.session.creditMoney === "function") {
      this.session.creditMoney(n, { applyPrestige });
      this.routeEvents();
      this.projectToGame(this.session.engine.getLastResult());
      return true;
    }
    const { ok } = this._dispatchAndProject("CREDIT_MONEY", { amount: n, applyPrestige });
    return ok;
  }

  getPrestigeMultiplier() {
    if (!this.session) return 1;
    this.loadEconomyFromHost();
    return this.session.getPrestigeMultiplier?.() ?? 1;
  }

  debitMoney(amount) {
    if (!this.session) return false;
    const n = toNumber(amount);
    if (!(n > 0)) return false;
    if (typeof this.session.debitMoney === "function") {
      const ok = this.session.debitMoney(n);
      if (ok) {
        this.routeEvents();
        this.projectToGame(this.session.engine.getLastResult());
      }
      return !!ok;
    }
    const { ok } = this._dispatchAndProject("DEBIT_MONEY", { amount: n });
    return ok;
  }

  computeSellValueForTile(tile) {
    if (!this.session || !tile || typeof tile.row !== "number" || typeof tile.col !== "number") return 0;
    this.syncForStatsRead();
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
    syncGridCheap(this);
    this.syncTickMetaFromGame();
    this.syncTogglesFromGame();
    syncReactorScalarsFromGame(this);
    return true;
  }

  _dispatchAndProject(type, payload, options = {}) {
    if (!this.session) return { ok: false, result: null };
    this.session.dispatch(payload !== undefined ? { type, payload } : { type });
    const applied = this.drainPendingCommands();
    const entry = applied.find((e) => e.type === type);
    const result = entry?.result;
    const failed = options.requireOk
      ? !result?.ok
      : result === false || result == null;
    if (failed) return { ok: false, result: result ?? null };
    if (options.grid) syncGridLayoutToGame(this);
    this.routeEvents();
    this.projectToGame(this.session.engine.getLastResult());
    return { ok: true, result };
  }

  _syncGridCheap() {
    syncGridCheap(this);
  }

  _syncForObjectiveEval() {
    this.syncMetaFromGame();
    this.syncObjectiveFlagsFromGame();
    this.syncForStatsRead();
  }

  syncGridFromGame() {
    syncGridLayoutFromGame(this);
  }

  syncGridToGame() {
    syncGridLayoutToGame(this);
  }

  syncReactorScalarsFromGame() {
    syncReactorScalarsFromGame(this);
  }

  syncMetaFromGame() {
    if (!this.session || !this.game) return;
    this.syncTickMetaFromGame();
    this.session.runId = this.game.run_id ?? this.session.runId;
    this.session.techTree = this.game.tech_tree ?? this.session.techTree;
    this.session.totalPlayedTime = this.game.lifecycleManager?.total_played_time ?? this.session.totalPlayedTime;
    this.session.lastSaveTime = this.game.lifecycleManager?.last_save_time ?? this.session.lastSaveTime;
    this.hydrateAchievementsFromGame();
    if (this.game.blueprintPlanner) {
      const prevSlots = JSON.stringify(this.session.blueprintPlanner?.slots ?? {});
      this.session.blueprintPlanner = {
        slots: { ...(this.game.blueprintPlanner.slots ?? {}) },
        active: !!this.game.blueprintPlanner.active,
      };
      const nextSlots = JSON.stringify(this.session.blueprintPlanner.slots);
      if (prevSlots !== nextSlots) {
        const snapshot = this.session.getSnapshot?.();
        this.session.events?.emit('blueprintPlannerChanged', {
          netHeat: snapshot?.stats?.netHeat,
          power: snapshot?.stats?.power,
        });
      }
    }
  }

  placePart(row, col, partId) {
    if (!this.session || !partId) return null;
    this._syncBeforeSessionOp();
    const { ok } = this._dispatchAndProject("PLACE_PART_PAID", { row, col, id: partId }, {
      requireOk: true,
      grid: true,
    });
    if (!ok) return null;
    const part = this.game.partset?.getPartById?.(partId);
    return part ? { row, col, part } : { row, col, part: null };
  }

  sellPart(row, col) {
    if (!this.session) return null;
    const tile = this.game.tileset?.getTile(row, col);
    if (!tile?.part) return null;
    this._syncBeforeSessionOp();
    const { ok } = this._dispatchAndProject("SELL_PART", { row, col }, { grid: true });
    return ok ? { row, col } : null;
  }

  syncTogglesFromGame() {
    if (!this.session || !this.game?.state) return;
    const st = this.game.state;
    const reactor = this.game.reactor;
    this.session.toggles.auto_sell = !!(st.auto_sell || reactor?.auto_sell_enabled);
    this.session.toggles.auto_buy = !!st.auto_buy;
    this.session.toggles.heat_control = !!(st.heat_control || reactor?.heat_controlled);
    this.session.toggles.time_flux = st.time_flux !== false;
    this.session.setPaused(!!st.pause);
  }

  syncObjectiveClaim(claimedIndex) {
    const objectives = this.session?.systems?.objectives;
    if (!objectives) return;
    if (!objectives.isComplete(claimedIndex)) objectives.markComplete(claimedIndex);
    if (objectives.currentIndex === claimedIndex) objectives.claimCurrent();
  }

  syncObjectiveIndex(index) {
    const objectives = this.session?.systems?.objectives;
    if (!objectives || typeof objectives.setIndex !== "function") return;
    const list = objectives.objectives || [];
    if (list[index]?.checkId === "allObjectives") return;
    objectives.setIndex(index);
  }

  syncObjectiveFlagsFromGame() {
    const objectives = this.session?.systems?.objectives;
    if (!objectives || !this.game) return;
    objectives.setFlags?.({
      soldPower: !!this.game.sold_power,
      soldHeat: !!this.game.sold_heat,
    });
    if (typeof this.game.paused === "boolean") {
      this.session.setPaused?.(!!this.game.paused);
    }
  }

  _objectiveEvalContext() {
    const melted = !!this.game?.reactor?.has_melted_down;
    return {
      meltdown: melted,
      hasMeltedDown: melted,
      paused: !!this.game?.paused,
    };
  }

  hydrateAchievementsFromGame() {
    if (!this.session || !this.game?.state) return;
    const full = this.game.state.achievements;
    if (full && typeof full === "object" && !Array.isArray(full)) {
      this.session.systems.achievements?.deserialize?.(full);
      const ids = unlockedAchievementIds(full);
      this.session.achievements = ids;
      this.game.state.unlocked_achievements = ids;
      return;
    }
    const fromState = this.game.state.unlocked_achievements;
    const ids = Array.isArray(fromState)
      ? [...fromState]
      : [...(Array.isArray(this.session.achievements) ? this.session.achievements : [])];
    this.session.achievements = ids;
    this.session.systems.achievements?.deserialize?.(ids);
  }

  hydrateObjectivesFromGame() {
    const objectives = this.session?.systems?.objectives;
    const om = this.game?.objectives_manager;
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
        soldPower: !!this.game.sold_power,
        soldHeat: !!this.game.sold_heat,
      },
    });
    objectives.setIndex?.(rawIndex);
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
    this._syncBeforeTick();
    const result = this.session.tick({ multiplier });
    syncGridLayoutToGame(this);
    this.routeEvents();
    this.projectToGame(result, { heatBefore, powerBefore, multiplier });
    this.game.reactor?.updateStats?.({ fromSession: true });
    return result;
  }

  projectToGame(tickResult, tickMeta = {}) {
    const game = this.game;
    const session = this.session;
    if (!game?.state || !session) return;

    const snap = resolveCoreSnapshot(session, tickResult);
    applyHostStatePatch(game, buildHostStatePatch(snap, tickResult, tickMeta));
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
    this.syncGridToGame();
    this.projectToGame(this.session.engine.getLastResult());
  }

  drainPendingCommands() {
    if (typeof this.session?.drainCommands === "function") return this.session.drainCommands();
    if (!this.session?.commands) return [];
    return this.session.commands.drain(this.session);
  }

  getPlacedCount(type, level) {
    return this.session?.getPlacedCount?.(type, level) ?? 0;
  }

  incrementPlacedCount(type, level, amount = 1) {
    if (!this.session?.incrementPlacedCount) return 0;
    const n = this.session.incrementPlacedCount(type, level, amount);
    this.game.placedCounts = { ...(this.session.placedCounts || {}) };
    return n;
  }

  rebuildPlacedCounts() {
    if (!this.session?.rebuildPlacedCounts) return {};
    syncGridCheap(this);
    const counts = this.session.rebuildPlacedCounts();
    this.game.placedCounts = { ...counts };
    return counts;
  }

  setPlacedCounts(counts = {}) {
    if (!this.session?.setPlacedCounts) return {};
    const next = this.session.setPlacedCounts(counts);
    this.game.placedCounts = { ...next };
    return next;
  }

  clearPlacedCounts() {
    if (!this.session?.clearPlacedCounts) return {};
    const next = this.session.clearPlacedCounts();
    this.game.placedCounts = { ...(next || {}) };
    return next;
  }

  sellPower() {
    if (!this.session) return false;
    this.syncReactorScalarsFromGame();
    this.syncTogglesFromGame();
    if (toNumber(this.game.reactor.current_power) <= 0) return false;
    const { ok } = this._dispatchAndProject("SELL_POWER");
    if (!ok) return false;
    const reactor = this.game.reactor;
    if (reactor.manual_override_mult > 0) {
      reactor.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
    }
    return true;
  }

  ventHeat() {
    if (!this.session || !this.game?.reactor) return false;
    this.syncReactorScalarsFromGame();
    if (toNumber(this.session.grid.currentHeat) <= 0) return false;
    const { ok } = this._dispatchAndProject("VENT_HEAT");
    return !!ok;
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

  computeGridSellCredit(sellMultiplier, options) {
    if (!this.session) return { total: 0, items: [], sellMultiplier: sellMultiplier ?? 0.5 };
    this._syncGridCheap();
    return this.session.computeGridSellCredit(sellMultiplier, options);
  }

  applyBlueprint(payload = {}) {
    if (!this.session || !payload?.layout) return { ok: false, reason: "invalid" };
    this._syncBeforeSessionOp();
    const { ok, result } = this._dispatchAndProject("APPLY_BLUEPRINT", payload, {
      requireOk: true,
      grid: true,
    });
    return ok ? result : (result ?? { ok: false, reason: "rejected" });
  }

  commitBlueprintPlanner(payload = {}) {
    if (!this.session) return { ok: false, reason: "invalid" };
    this._syncBeforeSessionOp();
    const { ok, result } = this._dispatchAndProject("COMMIT_BLUEPRINT_PLANNER", payload, {
      requireOk: true,
      grid: true,
    });
    if (!ok) return result ?? { ok: false, reason: "rejected" };
    const planner = this.session.blueprintPlanner;
    if (this.game.blueprintPlanner) {
      this.game.blueprintPlanner.slots = { ...(planner?.slots ?? {}) };
      this.game.blueprintPlanner.active = !!planner?.active;
      this.game._syncBlueprintPlannerUi?.();
    }
    return result;
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
    syncGridCheap(this);
    return this.session.queryNeighbors(row, col, options);
  }

  getUpgradeLevel(id) {
    return this.session?.getUpgradeLevel?.(id) ?? 0;
  }

  purchaseUpgrade(id) {
    if (!this.session || !this.game?.upgradeset) return false;
    const upgradeset = this.game.upgradeset;
    const upgrade = upgradeset.getUpgrade(id);
    if (!upgrade) return false;
    if (!this.session.systems?.upgrades?.getDefinition?.(id)) return false;

    this.loadEconomyFromHost();
    this.session.dispatch({ type: "PURCHASE_UPGRADE", payload: { id } });
    const applied = this.drainPendingCommands();
    const purchaseEntry = applied.find((entry) => entry.type === "PURCHASE_UPGRADE");
    if (!purchaseEntry?.result) return false;

    const newLevel = this.session.getUpgradeLevel?.(id);
    if (typeof newLevel === "number") upgrade.setLevel(newLevel, { deferSync: true, skipSessionSync: true });
    if (upgrade.upgrade?.type === "experimental_parts") {
      this.game.epart_onclick?.(upgrade);
    }
    upgradeset.updateSectionCounts();
    void this.game.saveManager?.autoSave?.();

    this.syncTogglesFromGame();
    this._syncGridCheap();
    this.syncReactorScalarsFromGame();
    this.routeEvents();
    this.projectToGame(this.session.engine.getLastResult());
    this.game.syncModifiersFromUpgrades?.({ skipGrid: true });
    return true;
  }

  syncUpgradeLevelsToGame() {
    projectUpgradeLevelsToHost(this);
  }

  prestige(options = {}) {
    if (!this.session) return null;
    const preview = this.session.previewPrestige({ keepEp: true });
    const earned = this.session.prestige(options);
    syncGridLayoutToGame(this);
    this.projectUpgradeLevelsToHost();
    this.routeEvents();
    this.projectToGame(this.session.getSnapshot?.() ?? this.session.engine.getLastResult());
    this.syncCompiledPartsFromSession();
    this.game.reactor?.updateStats?.();
    return {
      earned: toNumber(earned) || toNumber(preview?.earned),
      keepEp: true,
      fuelCellCount: preview?.fuelCellCount ?? 0,
      sessionPowerProduced: preview?.sessionPowerProduced ?? 0,
      sessionHeatDissipated: preview?.sessionHeatDissipated ?? 0,
    };
  }

  reboot(options = {}) {
    if (!this.session) return null;
    const keepEp = options.keepEp === true;
    const preview = this.session.previewPrestige({ keepEp });
    const earned = this.session.reboot({ keepEp, refundEp: false, ...options });
    syncGridLayoutToGame(this);
    this.projectUpgradeLevelsToHost();
    this.routeEvents();
    this.projectToGame(this.session.getSnapshot?.() ?? this.session.engine.getLastResult());
    this.syncCompiledPartsFromSession();
    this.game.reactor?.updateStats?.();
    return {
      earned: keepEp ? (toNumber(earned) || toNumber(preview?.earned)) : 0,
      keepEp,
      fuelCellCount: preview?.fuelCellCount ?? 0,
      sessionPowerProduced: preview?.sessionPowerProduced ?? 0,
      sessionHeatDissipated: preview?.sessionHeatDissipated ?? 0,
    };
  }

}

export async function attachCoreBridge(game, options = {}) {
  if (game.coreBridge?.isActive) return game.coreBridge;
  const bridge = new RevivalSessionBridge(game, options);
  game.coreBridge = bridge;
  await bridge.init();
  return bridge;
}
