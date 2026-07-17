import { safeCall } from "../core/teardown.js";
import { EngineStatus } from "../schema/stateSchemas.js";
import { resetHeatThresholdSignalState } from "../components/shell/heat-dom-sync.js";
import { proxy } from "valtio/vanilla";
import { toDecimal, BASE_LOOP_WAIT_MS } from "../simUtils.js";
import { logger } from "../core/logger.js";
import { formatTime } from "../core/numbers.js";
import { requireActiveBridge } from "../bridge/active.js";
import {
  UPGRADE_MAX_LEVEL,
  MAX_GRID_DIMENSION,
  BASE_MONEY,
  RESPEC_DOCTRINE_EP_COST,
} from "../constants/balance.js";
import {
  createGameState,
  UnlockManager,
  runRebootActionKeepEp,
  runRebootActionDiscardEp,
  runFullReboot,
  setDefaults,
  LifecycleManager,
  applyToggleStateChange,
  getGameConfiguration,
  setGameConfiguration,
  ExoticParticleManager,
  runSellAction,
  runManualReduceHeatAction,
  runEpartOnclick,
  setDecimal,
  assertHostEconomyWrite,
} from "../state.js";
import { Reactor } from "./reactor.js";
import { GridManager, Tileset } from "./grid.js";
import { PartSet } from "./part.js";
import { applyBlueprintLayoutDiff } from "./blueprint.js";
import { applyComputedModifiers } from "../bridge/bridge-mechanics.js";
import { drainGridIntentsAsync } from "../bridge/bridge-intents.js";
import { UpgradeSet } from "./upgrade.js";
import { ObjectiveManager } from "./objectives.js";
import { Performance, postGameLoopProjectionQuery } from "./engine.js";
import { bundledGameData } from "../generated/bundledStaticData.js";
import { AchievementListSchema } from "../schema/index.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { enqueueGameEffect } from "../state/game-effects.js";
import { unlockedAchievementIds } from "../bridge/core-state-projection.js";

const loadAchievementsFromBundle = () => AchievementListSchema.parse(bundledGameData.achievements);

class AchievementManager {
  constructor(game) {
    this.game = game;
    this.achievements_data = [];
    this._eventToAchievementIds = new Map();
    this._silentUnlockCount = 0;
    this._wasCatchingUp = false;
    this._unsubs = [];
  }

  async initialize() {
    this.achievements_data = loadAchievementsFromBundle();
    this._buildIndexes();
    logger.log("debug", "game", `AchievementManager initialized with ${this.achievements_data.length} achievements`);
  }

  _buildIndexes() {
    this._eventToAchievementIds.clear();
    for (let i = 0; i < this.achievements_data.length; i++) {
      const def = this.achievements_data[i];
      if (def.triggerType === "event" && def.triggerEvent) {
        const list = this._eventToAchievementIds.get(def.triggerEvent) ?? [];
        list.push(def.id);
        this._eventToAchievementIds.set(def.triggerEvent, list);
      }
    }
  }

  _getUnlockedSet() {
    const arr = this.game?.state?.unlocked_achievements;
    return new Set(Array.isArray(arr) ? arr : []);
  }

  _getUnlockedList() {
    const arr = this.game?.state?.unlocked_achievements;
    return Array.isArray(arr) ? arr : [];
  }

  isUnlocked(id) {
    return this._getUnlockedSet().has(id);
  }

  getDefinition(id) {
    return this.achievements_data.find((a) => a.id === id) ?? null;
  }

  restore(saved) {
    if (!this.game?.state) return;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      this.game.state.achievements = saved;
      this.game.state.unlocked_achievements = unlockedAchievementIds(saved);
    } else {
      const ids = Array.isArray(saved) ? saved.filter((x) => typeof x === "string") : [];
      this.game.state.unlocked_achievements = ids;
      this.game.state.achievements = undefined;
    }
    this.game.coreBridge?.hydrateAchievementsFromGame?.();
  }

  _isCatchUpSilent() {
    return !!this.game?.engine?._isCatchingUp;
  }

  notifyUnlock(id, { silent } = {}) {
    if (!id) return false;
    const def = this.getDefinition(id);
    if (!def) return false;
    if (!this.isUnlocked(id)) {
      const list = this._getUnlockedList();
      list.push(id);
      this.game.state.unlocked_achievements = list;
    }
    const isSilent = silent ?? this._isCatchUpSilent();
    if (isSilent) {
      this._silentUnlockCount++;
    } else {
      enqueueGameEffect(this.game, {
        kind: "notice",
        tag: "ACHIEVEMENT",
        body: `Unlocked: ${def.title}`,
      });
      this.game.emit?.("achievementUnlocked", { achievement: def, silent: false });
    }
    if (this.game?.saveManager && !this.game._isRestoringSave) {
      void this.game.saveManager.autoSave();
    }
    return true;
  }

  unlock(id, { silent } = {}) {
    if (!id || this.isUnlocked(id)) return false;
    if (!this.getDefinition(id)) return false;
    this.game.coreBridge?.session?.systems?.achievements?.unlock?.(id);
    return this.notifyUnlock(id, { silent });
  }

  onCatchUpEnded() {
    const count = this._silentUnlockCount;
    this._silentUnlockCount = 0;
    if (count > 0) {
      this.game.emit?.("achievementCatchUpSummary", { count });
    }
  }

  _handleCatchUpTransition() {
    const catchingUp = this._isCatchUpSilent();
    if (this._wasCatchingUp && !catchingUp) {
      this.onCatchUpEnded();
    }
    this._wasCatchingUp = catchingUp;
  }

  onTickRecorded() {
    if (!this.game) return;
    this._handleCatchUpTransition();
  }

  bind() {
    this.unbind();
    const g = this.game;
    if (!g?.state) return;
    this._unsubs.push(subscribeKey(g.state, "engine_tick_count", () => this.onTickRecorded()));
  }

  unbind() {
    for (let i = 0; i < this._unsubs.length; i++) {
      safeCall(() => { this._unsubs[i](); });
    }
    this._unsubs.length = 0;
  }

  start() {
    if (!this.achievements_data.length) {
      void this.initialize().then(() => this.bind());
      return;
    }
    this.bind();
  }
}

class SessionManager {
  constructor(game) {
    this.game = game;
  }
  pause() {
    this.game.onToggleStateChange?.("pause", true);
  }
  resume() {
    this.game.onToggleStateChange?.("pause", false);
  }
  togglePause() {
    if (this.game.paused) this.resume();
    else this.pause();
  }
}

const SIDE_EFFECT_EVENTS = new Set([
  "vibrationRequest", "achievementUnlocked", "achievementCatchUpSummary", "heatWarning",
  "pipeIntegrityWarning", "firstHighHeat", "saveLoaded", "component_explosion",
  "objectiveClaimed", "chapterCelebration",
  "layoutPasted", "blueprintApplyDeficit", "tileCleared",
  "welcomeBackOffline",
  "showContextModal", "markStaticDirty", "partsPanelRefresh",
  "upgradePurchased", "statePatch",
]);

class GameEventDispatcher {
  constructor(logger) {
    this._listeners = new Map();
    this._logger = logger;
  }
  on(eventName, handler) {
    if (!this._listeners.has(eventName)) this._listeners.set(eventName, []);
    this._listeners.get(eventName).push(handler);
  }
  off(eventName, handler) {
    const list = this._listeners.get(eventName);
    if (!list) return;
    const i = list.indexOf(handler);
    if (i !== -1) list.splice(i, 1);
  }
  emit(eventName, payload) {
    if (!SIDE_EFFECT_EVENTS.has(eventName) && typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
      this._logger?.warn?.(`[Game] Deprecated data-flow event "${eventName}" — use state instead`);
    }
    const list = this._listeners.get(eventName);
    if (!list) return;
    const data = payload ?? {};
    list.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        const msg = err?.message ?? String(err);
        this._logger?.warn?.(`[Game] Event handler error for "${eventName}":`, msg);
      }
    });
  }
}

class TimeKeeper {
  constructor(game) {
    this.game = game;
  }
  updateSessionTime() {
    const lm = this.game.lifecycleManager;
    if (lm.session_start_time) {
      const sessionTime = Date.now() - lm.session_start_time;
      lm.total_played_time = lm.total_played_time + sessionTime;
      lm.session_start_time = Date.now();
    }
    if (this.game.reactor) {
      if (this.game.reactor.current_power > this.game.peak_power) this.game.peak_power = this.game.reactor.current_power;
      if (this.game.reactor.current_heat > this.game.peak_heat) this.game.peak_heat = this.game.reactor.current_heat;
    }
  }
  getFormattedTotalPlayedTime() {
    const lm = this.game.lifecycleManager;
    let totalTime = lm.total_played_time;
    if (lm.session_start_time) {
      totalTime += Date.now() - lm.session_start_time;
    }
    return formatTime(totalTime);
  }
}

class EconomyManager {
  constructor(game) {
    this.game = game;
  }
  getCurrentMoney() {
    return this.game.state.current_money;
  }
  setCurrentMoney(value) {
    assertHostEconomyWrite(this.game, "current_money");
    setDecimal(this.game.state, "current_money", value);
  }
}

function runComponentDepletion(game, tile) {
  if (!tile?.part) return;
  game.emit("tileCleared", { tile });
  tile.clearPart();
}


export class Game {
  constructor(ui_instance, getCompactLayoutFn = null) {
    this._getCompactLayoutFn = getCompactLayoutFn;
    this.ui = ui_instance;
    this.saveManager = null;
    this.version = "1.4.0";

    this.gridManager = new GridManager(this);
    this.max_cols = MAX_GRID_DIMENSION;
    this.max_rows = MAX_GRID_DIMENSION;
    this.offline_tick = true;
    this.base_loop_wait = BASE_LOOP_WAIT_MS;
    this.base_manual_heat_reduce = 1;
    this.upgrade_max_level = UPGRADE_MAX_LEVEL;
    this.base_money = BASE_MONEY;
    this.protium_particles = 0;

    this.lifecycleManager = new LifecycleManager(this);
    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.state = createGameState({
      current_money: toDecimal(0),
      current_power: toDecimal(0),
      current_heat: toDecimal(0),
      current_exotic_particles: toDecimal(0),
      total_exotic_particles: toDecimal(0),
      session_power_produced: toDecimal(0),
      session_power_sold: toDecimal(0),
      session_heat_dissipated: toDecimal(0),
      max_power: 0,
      max_heat: 0,
      stats_power: 0,
      stats_heat_generation: 0,
      stats_vent: 0,
      stats_inlet: 0,
      stats_outlet: 0,
      stats_net_heat: 0,
      stats_total_part_heat: 0,
      stats_cash: 0,
      engine_status: EngineStatus.STOPPED,
      unlocked_achievements: [],
      auto_sell: false,
      auto_buy: true,
      heat_control: false,
      pause: false,
    });
    this.reactor = new Reactor(this);
    this.engine = null;
    this.performance = new Performance(this);
    this.performance.enable();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;
    this.autoSellEnabled = true;
    this.isAutoBuyEnabled = true;
    this.sold_power = false;
    this.sold_heat = false;
    this.objectives_manager = new ObjectiveManager(this);
    this.achievement_manager = new AchievementManager(this);
    this.placedCounts = {};
    this._unlockStates = {};
    this.unlockManager = new UnlockManager(this);
    this.sessionManager = new SessionManager(this);

    this.undoHistory = [];
    this.audio = null;
    this.logger = logger;

    this.peak_power = 0;
    this.peak_heat = 0;
    
    this.user_id = "local_architect";
    
    this.run_id = crypto.randomUUID();
    this.tech_tree = null;
    this.bypass_tech_tree_restrictions = false;
    this.RESPER_DOCTRINE_EP_COST = RESPEC_DOCTRINE_EP_COST;
    this.cheats_used = false;
    this.grace_period_ticks = 0;
    this.blueprintPlanner = proxy({ active: false, slots: {} });
    this._offlineCatchupMs = 0;
    this._mainState = null;
    this.eventDispatcher = new GameEventDispatcher(logger);
    this.economyManager = new EconomyManager(this);
    this.timeKeeper = new TimeKeeper(this);
    this.exoticParticleManager = new ExoticParticleManager(this);
  }

  on(eventName, handler) {
    this.eventDispatcher.on(eventName, handler);
  }

  off(eventName, handler) {
    this.eventDispatcher.off(eventName, handler);
  }

  emit(eventName, payload) {
    this.eventDispatcher.emit(eventName, payload);
  }

  getPreviousTierCount(part) { return this.unlockManager.getPreviousTierCount(part); }
  getPreviousTierSpec(part) { return this.unlockManager.getPreviousTierSpec(part); }
  isFirstInChainSpec(spec) { return this.unlockManager.isFirstInChainSpec(spec); }
  isSpecUnlocked(spec) { return this.unlockManager.isSpecUnlocked(spec); }
  shouldShowPart(part) { return this.unlockManager.shouldShowPart(part); }
  isPartUnlocked(part) { return this.unlockManager.isPartUnlocked(part); }
  getPlacedCount(type, level) { return this.unlockManager.getPlacedCount(type, level); }
  incrementPlacedCount(type, level) { return this.unlockManager.incrementPlacedCount(type, level); }

  enqueueVisualEvent() {}
  enqueueVisualEvents() {}
  drainVisualEvents() {
    return [];
  }

  async set_defaults() {
    await setDefaults(this);
  }

  syncModifiersFromUpgrades(opts) {
    applyComputedModifiers(this, opts);
  }

  get current_money() { return this.economyManager.getCurrentMoney(); }
  set current_money(v) { this.economyManager.setCurrentMoney(v); }
  get current_exotic_particles() { return this.state.current_exotic_particles; }
  set current_exotic_particles(v) { this.exoticParticleManager.current_exotic_particles = v; }
  get exotic_particles() { return this.exoticParticleManager.exotic_particles; }
  set exotic_particles(v) { this.exoticParticleManager.exotic_particles = v; }
  get total_exotic_particles() { return this.state.total_exotic_particles; }
  set total_exotic_particles(v) { this.exoticParticleManager.total_exotic_particles = v; }
  get session_start_time() { return this.lifecycleManager.session_start_time; }
  set session_start_time(v) { this.lifecycleManager.session_start_time = v; }
  get last_save_time() { return this.lifecycleManager.last_save_time; }
  set last_save_time(v) { this.lifecycleManager.last_save_time = v; }
  get total_played_time() { return this.lifecycleManager.total_played_time; }
  set total_played_time(v) { this.lifecycleManager.total_played_time = v; }

  getPrestigeMultiplier() {
    return requireActiveBridge(this, "getPrestigeMultiplier").getPrestigeMultiplier();
  }

  markCheatsUsed() {
    this.cheats_used = true;
  }

  grantCheatExoticParticle(amount = 1) {
    this.exoticParticleManager.grantCheatExoticParticle(amount);
  }

  bumpGridTileDirty(row, col) {
    const ui = this.ui;
    if (ui?.uiState) ui.uiState.grid_dirty_tile = row != null && col != null ? `${row},${col}` : null;
  }

  async initialize_new_game_state() {
    await this.lifecycleManager.initialize_new_game_state();
  }

  async startSession() {
    await this.lifecycleManager.startSession();
  }

  updateSessionTime() {
    this.lifecycleManager.updateSessionTime();
  }

  getFormattedTotalPlayedTime() {
    return this.lifecycleManager.getFormattedTotalPlayedTime();
  }

  update_cell_power() {
    if (!this.partset || !this.reactor) return;
    this.partset.updateCellPower();
    this.reactor.updateStats();
  }
  epart_onclick(purchased_upgrade) {
    runEpartOnclick(this, purchased_upgrade);
  }
  manual_reduce_heat_action() {
    runManualReduceHeatAction(this);
  }
  sell_action() {
    runSellAction(this);
  }
  async rebootActionKeepExoticParticles() {
    await runRebootActionKeepEp(this);
  }

  async rebootActionDiscardExoticParticles() {
    await runRebootActionDiscardEp(this);
  }

  get base_cols() { return this.gridManager.base_cols; }
  set base_cols(v) { this.gridManager.base_cols = v; }
  get base_rows() { return this.gridManager.base_rows; }
  set base_rows(v) { this.gridManager.base_rows = v; }
  get _rows() { return this.gridManager._rows; }
  get _cols() { return this.gridManager._cols; }

  updateBaseDimensions() {
    this.gridManager.updateBaseDimensions();
  }

  get rows() { return this.gridManager.rows; }
  set rows(value) { this.gridManager.setRows(value); }
  get cols() { return this.gridManager.cols; }
  set cols(value) { this.gridManager.setCols(value); }
  calculatePan(col) {
    if (this.cols <= 1) return 0;
    return (col / (this.cols - 1)) * 2 - 1;
  }

  async sellPart(tile) {
    if (!tile) return;
    return drainGridIntentsAsync(this, this.engine, [{
      action: "SELL_PART",
      payload: { row: tile.row, col: tile.col },
    }]);
  }

  handleComponentDepletion(tile) {
    runComponentDepletion(this, tile);
  }

  async applySaveState(savedData) {
    logger.log('debug', 'game', 'Applying save state...', {
      version: savedData.version,
      money: savedData.current_money,
      tiles: savedData.tiles?.length || 0,
      upgrades: savedData.upgrades?.length || 0,
      objectiveIndex: savedData.objectives?.current_objective_index
    });
    await this.saveManager.applySaveState(this, savedData);
  }

  pause() { this.sessionManager.pause(); }
  resume() { this.sessionManager.resume(); }
  togglePause() { this.sessionManager.togglePause(); }

  async reboot() {
    await runFullReboot(this);
  }

  onToggleStateChange(toggleName, value) {
    applyToggleStateChange(this, toggleName, value);
  }

  getConfiguration() {
    return getGameConfiguration(this);
  }

  setConfiguration(config) {
    setGameConfiguration(this, config);
  }

  action_pasteLayout(layout, options = {}) {
    const result = applyBlueprintLayoutDiff(this, layout, {
      skipCostDeduction: options.skipCostDeduction === true,
      partial: options.partial === true,
      sellExisting: options.sellExisting === true,
    });
    if (result.ok) this.emit("layoutPasted", { layout });
    return result;
  }

  toggleBlueprintPlanner() {
    this.blueprintPlanner.active = !this.blueprintPlanner.active;
    if (!this.blueprintPlanner.active) this.blueprintPlanner.slots = {};
    this._syncBlueprintPlannerUi();
  }

  clearBlueprintPlannerSlots() {
    this.blueprintPlanner.slots = {};
    this._syncBlueprintPlannerUi();
  }

  setBlueprintPlannerSlot(row, col, partId) {
    const k = `${row},${col}`;
    if (!partId) delete this.blueprintPlanner.slots[k];
    else this.blueprintPlanner.slots[k] = partId;
    this._syncBlueprintPlannerUi();
  }

  _syncBlueprintPlannerUi() {
    const d = this.ui?.uiState?.copy_paste_display;
    if (d) d.blueprintPlannerActive = !!this.blueprintPlanner.active;
  }

  getBlueprintPlannerPartId(row, col) {
    return this.blueprintPlanner?.slots?.[`${row},${col}`] ?? null;
  }

  buildGridProjectionSnapshot() {
    const rows = this.rows;
    const cols = this.cols;
    const partIds = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        partIds.push(this.getBlueprintPlannerPartId(r, c));
      }
    }
    return { rows, cols, partIds };
  }

  requestBlueprintProjectionSample(options = {}) {
    return postGameLoopProjectionQuery(this.engine, this, options);
  }

  requestLayoutProjectionSample(layout, options = {}) {
    return postGameLoopProjectionQuery(this.engine, this, { ...options, layout });
  }

  applyBlueprintPlannerLayout(options = {}) {
    return drainGridIntentsAsync(this, this.engine, [{
      action: "COMMIT_BLUEPRINT_PLANNER",
      payload: { partial: options.partial === true },
    }]);
  }

  getDoctrine() {
    if (!this.tech_tree) return null;
    return this.upgradeset.techTrees?.find(t => t.id === this.tech_tree) || null;
  }

  respecDoctrine() {
    const bridge = requireActiveBridge(this, "respecDoctrine");
    if (!bridge.respecDoctrine()) return false;
    resetHeatThresholdSignalState(this);
    if (this.saveManager) this.saveManager.autoSave();
    return true;
  }
}
