import { createGameSession, runBatchTicks } from "reactor-core";
import { setDecimal } from "../state.js";
import { toDecimal, toNumber } from "../simUtils.js";
import { recordSimEvent } from "../domain/sim-events.js";
import { syncActivePartsAtTickBoundary, bumpGridPartsRevision } from "../domain/part-classification.js";
import { OVERRIDE_DURATION_MS } from "../constants/balance.js";

const INTENT_COMMAND_MAP = {
  PLACE_PART: (payload) => ({ type: "PLACE_PART", payload }),
  SELL_PART: (payload) => ({ type: "SELL_PART", payload }),
  SELL_POWER: () => ({ type: "SELL_POWER" }),
  VENT_HEAT: () => ({ type: "VENT_HEAT" }),
  PURCHASE_UPGRADE: (payload) => ({ type: "PURCHASE_UPGRADE", payload }),
  PAUSE_TOGGLE: () => ({ type: "PAUSE_TOGGLE" }),
  SET_TOGGLE: (payload) => ({ type: "SET_TOGGLE", payload }),
  REBOOT: (payload) => ({ type: "REBOOT", payload }),
  DEBIT_MONEY: (payload) => ({ type: "DEBIT_MONEY", payload }),
  CREDIT_MONEY: (payload) => ({ type: "CREDIT_MONEY", payload }),
  GRANT_REWARD: () => null,
  APPLY_BLUEPRINT: (payload) => ({ type: "APPLY_BLUEPRINT", payload }),
  COMMIT_BLUEPRINT_PLANNER: (payload) => ({ type: "COMMIT_BLUEPRINT_PLANNER", payload }),
  DEBIT_LAYOUT_COST: (payload) => ({ type: "DEBIT_LAYOUT_COST", payload }),
};

export class RevivalSessionBridge {
  constructor(game, options = {}) {
    this.game = game;
    this.session = null;
    this._ready = false;
    this._initPromise = null;
    this.authoritativeTicks = options.authoritativeTicks !== false;
  }

  get isActive() {
    return this._ready && this.session != null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = createGameSession({ gameId: "reactor_revival" }).then((session) => {
      this.session = session;
      this._ready = true;
      this._defaultExplosionHandler = this.game?.engine?.handleComponentExplosion;
      this.syncGridFromGame();
      this.syncTogglesFromGame();
      this.syncMetaFromGame();
      return session;
    });
    return this._initPromise;
  }

  syncUpgradesFromGame() {
    const store = this.session?.systems?.upgrades;
    const upgradeset = this.game?.upgradeset;
    if (!store || !upgradeset?.upgradesArray) return;
    const levels = [];
    for (let i = 0; i < upgradeset.upgradesArray.length; i++) {
      const upg = upgradeset.upgradesArray[i];
      if (upg.level > 0) levels.push({ id: upg.id, level: upg.level });
    }
    store.deserialize(levels);
    this.session.recompileModifiers?.();
  }

  syncMechanicsOverridesFromGame() {
    if (!this.session || !this.game?.reactor) return;
    const reactor = this.game.reactor;
    const perpetualCategories = {};
    const perpetualPartIds = new Set();
    const autoReplaceCosts = {};
    const upgradeset = this.game.upgradeset;
    const parts = this.game.partset?.partsArray || this.game.partset?.parts || [];
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part?.perpetual && part.id) perpetualPartIds.add(part.id);
      if (part?.id && typeof part.getAutoReplacementCost === 'function') {
        autoReplaceCosts[part.id] = toNumber(part.getAutoReplacementCost());
      }
    }
    if ((upgradeset?.getUpgrade("perpetual_reflectors")?.level ?? 0) > 0) perpetualCategories.reflector = true;
    if ((upgradeset?.getUpgrade("perpetual_capacitors")?.level ?? 0) > 0) perpetualCategories.capacitor = true;
    if ((upgradeset?.getUpgrade("uranium1_cell_perpetual")?.level ?? 0) > 0) perpetualPartIds.add("uranium1");
    const alteredMax = toNumber(reactor.altered_max_power ?? reactor.max_power);
    const maxPower = toNumber(reactor.max_power ?? this.session.grid.maxPower);
    const maxHeat = toNumber(reactor.max_heat ?? this.session.grid.maxHeat);
    this.session.mechanicsOverrides = {
      autoSellPercent: toNumber(reactor.auto_sell_multiplier) * 100,
      sellPriceMultiplier: toNumber(reactor.sell_price_multiplier) || 1,
      powerOverflowToHeatRatio: toNumber(reactor.power_overflow_to_heat_ratio ?? 1),
      powerMultiplier: toNumber(reactor.power_multiplier) || 1,
      alteredMaxPower: alteredMax > 0 ? alteredMax : maxPower,
      powerToHeatRatio: toNumber(reactor.power_to_heat_ratio) || 0,
      ventMultiplierEff: toNumber(reactor.vent_multiplier_eff) || 0,
      stirlingMultiplier: toNumber(reactor.stirling_multiplier) || 0,
      convectiveBoost: toNumber(reactor.convective_boost) || 0,
      reflectorCoolingFactor: toNumber(reactor.reflector_cooling_factor) || 0,
      heatPowerMultiplier: toNumber(reactor.heat_power_multiplier) || 0,
      perpetualCategories,
      perpetualPartIds,
      autoReplaceCosts,
      hasProtiumLoader: (upgradeset?.getUpgrade("experimental_protium_loader")?.level ?? 0) > 0,
    };
    this.session.grid.maxHeat = maxHeat;
    this.session.grid.maxPower = maxPower;
  }

  prepareCoreStatsRead(fromSession = false) {
    if (!this.session) return null;
    if (!fromSession) {
      this.syncUpgradesFromGame();
      this.syncMechanicsOverridesFromGame();
      if (this._gameGridDiffersFromSession()) this.syncGridFromGame();
    }
    return this.session.getSnapshot()?.stats ?? null;
  }

  _gameGridDiffersFromSession() {
    const game = this.game;
    const grid = this.session?.grid;
    if (!game?.tileset || !grid) return false;
    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        const tile = game.tileset.getTile(r, c);
        const gameId = tile?.part?.id ?? null;
        const sessionId = grid.getComponentAt(r, c)?.definition?.id ?? null;
        if (gameId !== sessionId) return true;
      }
    }
    return false;
  }

  syncMetaFromGame() {
    if (!this.session || !this.game) return;
    this.syncUpgradesFromGame();
    this.syncMechanicsOverridesFromGame();
    this.session.suppressExplosions = false;
    this.session.runId = this.game.run_id ?? this.session.runId;
    this.session.techTree = this.game.tech_tree ?? this.session.techTree;
    this.session.totalPlayedTime = this.game.lifecycleManager?.total_played_time ?? this.session.totalPlayedTime;
    this.session.lastSaveTime = this.game.lifecycleManager?.last_save_time ?? this.session.lastSaveTime;
    this.session.achievements = [...(this.game.state?.unlocked_achievements ?? this.session.achievements ?? [])];
    this.session.placedCounts = { ...(this.game.placedCounts ?? {}) };
    const economy = this.session.systems.economy;
    if (economy?.deserialize) {
      const money = toNumber(this.game.state?.current_money ?? this.game.current_money);
      economy.deserialize({
        money,
        currentExoticParticles: this.game.current_exotic_particles ?? this.game.state?.current_exotic_particles,
        totalExoticParticles: this.game.state?.total_exotic_particles,
        sessionPowerProduced: this.game.state?.session_power_produced,
        sessionPowerSold: this.game.state?.session_power_sold,
        sessionHeatDissipated: this.game.state?.session_heat_dissipated,
        soldHeat: this.game.sold_heat,
        protiumParticles: this.game.protium_particles ?? 0,
      });
    }
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
    this.session.systems.failure?.setGracePeriodTicks?.(this.game.grace_period_ticks ?? 0);
    this.session.systems.objectives?.setFlags?.({
      soldPower: !!this.game.sold_power,
      soldHeat: !!this.game.sold_heat,
    });
  }

  _copyTileStateToInstance(tile, inst, row, col) {
    if (tile.heat_contained != null) {
      this.session.grid.setTileHeat(row, col, toNumber(tile.heat_contained));
    }
    if (tile.ticks != null) inst.ticks = tile.ticks;
    else if (tile.part?.ticks) inst.ticks = tile.part.ticks;
    if (this.session.grid.tileHeatMap) {
      this.session.grid.tileHeatMap.setActivated(row, col, tile.activated !== false);
    }
    if (typeof tile.getEffectiveVentValue === 'function') {
      inst._effectiveVent = tile.getEffectiveVentValue();
    } else if (typeof tile.part?.vent === 'number') {
      inst._effectiveVent = tile.part.vent;
    }
    if (typeof tile.getEffectiveTransferValue === 'function') {
      inst._effectiveTransfer = tile.getEffectiveTransferValue();
    } else if (typeof tile.part?.transfer === 'number') {
      inst._effectiveTransfer = tile.part.transfer;
    }
    if (typeof tile.part?.containment === 'number') {
      inst._effectiveContainment = tile.part.containment;
    }
    if (typeof tile.power === 'number' && Number.isFinite(tile.power) && tile.power > 0) {
      inst._effectivePower = tile.power;
      if (typeof tile.heat === 'number' && Number.isFinite(tile.heat)) {
        inst._effectiveHeat = tile.heat;
      } else {
        delete inst._effectiveHeat;
      }
    } else {
      delete inst._effectivePower;
      delete inst._effectiveHeat;
    }
  }

  shouldSyncPlacementsToSession() {
    return this.isActive && this.authoritativeTicks !== false;
  }

  syncTileFromGame(row, col) {
    if (!this.session || !this.game?.tileset) return;
    const tile = this.game.tileset.getTile(row, col);
    if (tile?.exploded || tile?.exploding) return;
    const partId = tile?.part?.id;
    if (partId) {
      this.session.placeComponent(row, col, partId);
      const inst = this.session.grid.getComponentAt(row, col);
      if (inst) this._copyTileStateToInstance(tile, inst, row, col);
    } else {
      this.session.removeComponent(row, col);
    }
  }

  syncGridFromGame() {
    if (!this.session || !this.game?.tileset) return;
    const { tileset, rows, cols } = this.game;
    if (this.session.grid.rows !== rows || this.session.grid.cols !== cols) {
      this.session.grid.resize(rows, cols);
    }
    this.session.grid.clearGrid();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tileset.getTile(r, c);
        const partId = tile?.part?.id;
        if (partId) {
          this.session.placeComponent(r, c, partId);
          const inst = this.session.grid.getComponentAt(r, c);
          if (inst) this._copyTileStateToInstance(tile, inst, r, c);
        }
      }
    }
    this.session.grid.currentHeat = toNumber(this.game.reactor?.current_heat ?? 0);
    this.session.grid.currentPower = toNumber(this.game.reactor?.current_power ?? 0);
    this.session.grid.recalculateCaps();
    const maxHeat = toNumber(this.game.reactor?.max_heat);
    const maxPower = toNumber(this.game.reactor?.max_power);
    const altered = toNumber(this.game.reactor?.altered_max_power);
    if (maxHeat > 0) this.session.grid.maxHeat = maxHeat;
    if (altered > 0) this.session.grid.maxPower = altered;
    else if (maxPower > 0) this.session.grid.maxPower = maxPower;
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

  drainIntents() {
    if (!this.session || !this.game?.state?.intent_queue) return;
    const queue = this.game.state.intent_queue;
    while (queue.length) {
      const intent = queue.shift();
      const mapper = INTENT_COMMAND_MAP[intent.action];
      if (!mapper) continue;
      const command = mapper(intent.payload);
      if (command) this.session.dispatch(command);
    }
  }

  syncObjectiveClaim(claimedIndex) {
    const objectives = this.session?.systems?.objectives;
    if (!objectives) return;
    if (!objectives.isComplete(claimedIndex)) objectives.markComplete(claimedIndex);
    if (objectives.currentIndex === claimedIndex) objectives.claimCurrent();
  }

  processTick(multiplier = 1) {
    if (!this.session) return null;
    const heatBefore = toNumber(this.game?.reactor?.current_heat ?? 0);
    const powerBefore = toNumber(this.game?.reactor?.current_power ?? 0);
    this.drainIntents();
    this.syncGridFromGame();
    this.syncMetaFromGame();
    this.syncTogglesFromGame();
    const result = this.session.tick({ multiplier });
    this.syncGridToGame();
    this.routeEvents();
    this.projectToGame(result, { heatBefore, powerBefore, multiplier });
    this.game.reactor?.updateStats?.({ fromSession: true });
    return result;
  }

  processBatchTicks(count) {
    if (!this.session) return { ticksProcessed: 0 };
    const heatBefore = toNumber(this.game?.reactor?.current_heat ?? 0);
    const powerBefore = toNumber(this.game?.reactor?.current_power ?? 0);
    this.drainIntents();
    this.syncGridFromGame();
    this.syncMetaFromGame();
    this.syncTogglesFromGame();
    const batch = runBatchTicks(this.session, count);
    this.syncGridToGame();
    this.routeEvents();
    this.projectToGame(this.session.engine.getLastResult(), { heatBefore, powerBefore, multiplier: 1 });
    this.game.reactor?.updateStats?.({ fromSession: true });
    return batch;
  }

  projectToGame(tickResult, tickMeta = {}) {
    const game = this.game;
    const session = this.session;
    if (!game?.state || !session) return;

    const grid = session.grid;
    const economy = session.systems.economy;
    const failure = session.systems.failure;
    const objectives = session.systems.objectives;
    const snap = session.getSnapshot();

    setDecimal(game.state, "current_heat", grid.currentHeat);
    setDecimal(game.state, "current_power", grid.currentPower);
    setDecimal(game.state, "current_money", economy?.money ?? game.state.current_money);
    setDecimal(game.state, "current_exotic_particles", economy?.currentExoticParticles ?? 0);
    setDecimal(game.state, "total_exotic_particles", economy?.totalExoticParticles ?? 0);
    setDecimal(game.state, "session_power_produced", economy?.sessionPowerProduced ?? 0);
    setDecimal(game.state, "session_power_sold", economy?.sessionPowerSold ?? 0);
    setDecimal(game.state, "session_heat_dissipated", economy?.sessionHeatDissipated ?? 0);

    game.state.max_heat = grid.maxHeat;
    game.state.max_power = grid.maxPower;
    const coreStats = snap?.stats;
    if (coreStats) {
      game.state.stats_power = coreStats.power;
      game.state.stats_heat_generation = coreStats.heatGeneration;
      game.state.stats_net_heat = coreStats.netHeat;
      game.state.stats_vent = coreStats.vent;
      game.state.stats_inlet = coreStats.inlet;
      game.state.stats_outlet = coreStats.outlet;
      game.state.stats_total_part_heat = coreStats.totalPartHeat;
      game.state.stats_cash = coreStats.cash;
    } else {
      game.state.stats_vent = tickResult?.ventedHeat ?? 0;
      game.state.stats_cash = toNumber(economy?.money);
    }
    game.state.melting_down = failure?.hasMeltedDown ?? tickResult?.meltdown ?? false;
    game.state.failure_state = failure?.failureState ?? "nominal";
    game.state.hull_integrity = failure?.hullIntegrity ?? 100;
    game.state.auto_sell = !!session.toggles.auto_sell;
    game.state.auto_buy = !!session.toggles.auto_buy;
    game.state.heat_control = !!session.toggles.heat_control;
    game.state.time_flux = session.toggles.time_flux !== false;
    game.state.pause = session.paused;
    game.paused = session.paused;
    if (session.paused && game.engine?.running) {
      game.engine.stop?.();
    } else if (!session.paused && game.engine && !game.engine.running && game.reactor && !game.reactor.has_melted_down) {
      game.engine.start?.();
    }
    if (game.reactor) {
      game.reactor.heat_controlled = !!session.toggles.heat_control;
      if ('auto_sell_enabled' in game.reactor) {
        game.reactor.auto_sell_enabled = !!session.toggles.auto_sell;
      }
    }
    game.state.unlocked_achievements = [...(session.achievements ?? [])];

    if (game.reactor) {
      game.reactor.current_heat = toDecimal(grid.currentHeat);
      game.reactor.current_power = toDecimal(grid.currentPower);
      game.reactor.max_heat = grid.maxHeat;
      game.reactor.max_power = grid.maxPower;
      game.reactor.has_melted_down = game.state.melting_down;
      if (coreStats) {
        game.reactor.stats_power = coreStats.power;
        game.reactor.stats_cell_power = coreStats.cellPower;
        game.reactor.stats_stirling_power = coreStats.stirlingPower;
        game.reactor.stats_heat_generation = coreStats.heatGeneration;
        game.reactor.stats_net_heat = coreStats.netHeat;
        game.reactor.stats_vent = coreStats.vent;
        game.reactor.stats_inlet = coreStats.inlet;
        game.reactor.stats_outlet = coreStats.outlet;
        game.reactor.stats_total_part_heat = coreStats.totalPartHeat;
        game.reactor.stats_cash = coreStats.cash;
      } else {
        game.reactor.stats_vent = game.state.stats_vent;
        game.reactor.stats_cash = game.state.stats_cash;
      }
    }

    if (game.tileset) {
      for (let r = 0; r < game.rows; r++) {
        for (let c = 0; c < game.cols; c++) {
          const tile = game.tileset.getTile(r, c);
          if (!tile?.part || tile.exploded || tile.exploding) continue;
          const tileHeat = grid.getTileHeat(r, c);
          if (typeof tileHeat === 'number') tile.heat_contained = toDecimal(tileHeat);
        }
      }
    }

    if (objectives && game.objectives_manager) {
      const serialized = objectives.serialize?.() ?? {};
      const completedIndices = serialized.completed ?? [];
      for (let i = 0; i < completedIndices.length; i++) {
        const ci = completedIndices[i];
        if (game.objectives_manager.objectives_data?.[ci]) {
          game.objectives_manager.objectives_data[ci].completed = true;
        }
      }
      const om = game.objectives_manager;
      if (om.current_objective_def && objectives.isComplete(om.current_objective_index)) {
        om.current_objective_def.completed = true;
      }
      const objectiveFlags = serialized.flags ?? {};
      if (objectiveFlags.soldPower) game.sold_power = true;
      if (objectiveFlags.soldHeat) game.sold_heat = true;
    }

    if (game.lifecycleManager) {
      game.lifecycleManager.total_played_time = session.totalPlayedTime;
    }
    game.run_id = session.runId;
    game.tech_tree = session.techTree;
    game.placedCounts = { ...session.placedCounts };
    game.grace_period_ticks = failure?.gracePeriodTicks ?? game.grace_period_ticks;
    game.offline_tick = session.isCatchingUp;

    game.tick_count = session.engine.tickCount;
    game._coreSnapshot = snap;
    if (economy?.protiumParticles != null) {
      game.protium_particles = economy.protiumParticles;
    }

    const heatAfter = toNumber(game.reactor?.current_heat ?? grid.currentHeat);
    const powerAfter = toNumber(game.reactor?.current_power ?? grid.currentPower);
    const norm = tickMeta.multiplier && tickMeta.multiplier !== 0 ? tickMeta.multiplier : 1;
    if (tickMeta.heatBefore != null) {
      game.state.heat_delta_per_tick = (heatAfter - tickMeta.heatBefore) / norm;
    }
    if (tickMeta.powerBefore != null) {
      game.state.power_delta_per_tick = (powerAfter - tickMeta.powerBefore) / norm;
    }
  }

  routeEvents() {
    const events = this.session?.drainEvents?.() || [];
    for (const event of events) {
      if (event.type === "sellPower") {
        this.game.sold_power = true;
        recordSimEvent(this.game, "power_sold", event.payload);
      }
      if (event.type === "ventHeat") {
        this.game.sold_heat = true;
        recordSimEvent(this.game, "heat_vented", event.payload);
      }
      if (event.type === "partSold") recordSimEvent(this.game, "part_sold", event.payload);
      if (event.type === "upgradePurchased") this.game.emit?.("upgradePurchased", event.payload);
      if (event.type === "objectiveComplete") {
        const idx = event.payload?.index;
        const om = this.game.objectives_manager;
        if (om && typeof idx === "number") {
          if (om.objectives_data?.[idx]) om.objectives_data[idx].completed = true;
          if (om.current_objective_index === idx && om.current_objective_def) {
            om.current_objective_def.completed = true;
            om._emitObjectiveCompleted?.();
          }
        }
      }
      if (event.type === "automationReplace") {
        const replacements = event.payload?.replacements;
        if (Array.isArray(replacements)) {
          for (let i = 0; i < replacements.length; i++) {
            const rep = replacements[i];
            recordSimEvent(this.game, {
              type: "AUTO_BUY_DEBIT",
              row: rep.row,
              col: rep.col,
            });
          }
        }
      }
      if (event.type === "reboot") this.game.emit?.("statePatch", { type: "reboot" });
      if (event.type === "blueprintPlannerCommitted") this.game.emit?.("grid_changed", {});
      if (event.type === "componentExplosion") {
        const row = event.payload?.row;
        const col = event.payload?.col;
        const tile = this.game.tileset?.getTile(row, col);
        if (tile) {
          this.game.engine?.handleComponentExplosion?.(tile);
          if (tile.exploded) {
            const inst = this.session?.grid?.getComponentAt(row, col);
            if (inst) inst.pendingDestruction = true;
          }
          const partId = event.payload?.id || tile.part?.id;
          if (partId?.startsWith("particle_accelerator") || tile.part?.category === "particle_accelerator") {
            this.game.reactor?.checkMeltdown?.();
          }
        }
      }
      if (event.type === "meltdown") {
        this.game.reactor.has_melted_down = true;
        this.game.state.melting_down = true;
        this.game.engine?.stop?.();
        if (!this.game.ui?.meltdownUI) {
          this.session?.grid?.clearGrid?.();
          this.syncGridToGame();
        }
      }
    }
  }

  loadLegacySave(savedData) {
    if (!this.session) return;
    this.session.loadLegacySave(savedData);
    this.syncGridToGame();
    this.projectToGame(this.session.engine.getLastResult());
  }

  save() {
    this.syncMetaFromGame();
    return this.session?.save?.() ?? null;
  }

  syncGridToGame() {
    const game = this.game;
    const session = this.session;
    if (!game?.tileset || !session) return;
    const { tileset, partset, rows, cols } = game;
    const grid = session.grid;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tileset.getTile(r, c);
        if (tile?.exploded || tile?.exploding) continue;
        const inst = grid.getComponentAt(r, c);
        if (!inst) {
          if (tile?.part) {
            tile.part = null;
            tile.ticks = 0;
            tile.heat_contained = toDecimal(0);
            tile.activated = false;
          }
          continue;
        }
        const part = partset.getPartById(inst.definition.id);
        if (!part) continue;
        const tileHeat = grid.getTileHeat(r, c);
        tile.applySessionSync(part, inst, typeof tileHeat === 'number' ? tileHeat : 0);
      }
    }
    bumpGridPartsRevision(tileset);
    game.tileset.updateActiveTiles?.();
    syncActivePartsAtTickBoundary(game.engine);
    game.reactor?.updateStats?.({ fromSession: true });
  }

  dispatchIntent(intent) {
    if (!this.session) return false;
    const mapper = INTENT_COMMAND_MAP[intent.action];
    if (!mapper) return false;
    const command = mapper(intent.payload);
    if (!command) return false;
    return this.session.dispatch(command);
  }

  syncReactorScalarsFromGame() {
    if (!this.session || !this.game?.reactor) return;
    const reactor = this.game.reactor;
    this.session.grid.currentHeat = toNumber(reactor.current_heat);
    this.session.grid.currentPower = toNumber(reactor.current_power);
  }

  drainPendingCommands() {
    if (!this.session?.commands) return [];
    return this.session.commands.drain(this.session);
  }

  sellPower() {
    if (!this.session) return false;
    this.syncMechanicsOverridesFromGame();
    this.syncReactorScalarsFromGame();
    if (toNumber(this.game.reactor.current_power) <= 0) return false;
    this.session.dispatch({ type: "SELL_POWER" });
    const applied = this.drainPendingCommands();
    const sellEntry = applied.find((entry) => entry.type === "SELL_POWER");
    if (!sellEntry?.result) return false;
    const reactor = this.game.reactor;
    if (reactor.manual_override_mult > 0) {
      reactor.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
    }
    this.routeEvents();
    this.projectToGame(this.session.engine.getLastResult());
    return true;
  }

  ventHeat() {
    if (!this.session) return false;
    const reactor = this.game.reactor;
    if (!reactor.current_heat.gt(0)) return false;
    reactor.manualReduceHeat();
    this.syncReactorScalarsFromGame();
    this.session.systems.objectives?.setFlags?.({
      soldHeat: !!this.game.sold_heat,
    });
    this.projectToGame(this.session.engine.getLastResult());
    return true;
  }

  reboot(options) {
    if (!this.session) return 0;
    const earned = this.session.reboot(options);
    this.syncGridToGame();
    this.projectToGame(this.session.engine.getLastResult());
    return earned;
  }

  purchaseUpgrade(id) {
    if (!this.session) return false;
    const ok = this.session.purchaseUpgrade(id);
    if (ok) this.projectToGame(this.session.engine.getLastResult());
    return ok;
  }

  runOfflineCatchup(elapsedMs) {
    if (!this.session) return { ticksProcessed: 0 };
    this.syncGridFromGame();
    this.syncMetaFromGame();
    this.syncTogglesFromGame();
    const result = this.session.runOffline(elapsedMs);
    this.syncGridToGame();
    this.routeEvents();
    this.projectToGame(this.session.engine.getLastResult());
    this.game.reactor?.updateStats?.();
    return result;
  }

}

export async function attachCoreBridge(game, options = {}) {
  const bridge = new RevivalSessionBridge(game, options);
  game.coreBridge = bridge;
  await bridge.init();
  return bridge;
}
