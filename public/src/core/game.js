import { PartSet, UpgradeSet, ObjectiveManager, BlueprintService, buildFacts, rules } from "./registry.js";
import { Tileset } from "../components/ui_grid.js";
import { Performance } from "./simulation.js";
import { DebugHistory, toDecimal, StorageUtils, Formatter } from "../utils.js";
import {
  GameSaveManager,
  SaveOrchestrator,
  UnlockManager,
  runRebootActionKeepEp,
  runRebootActionDiscardEp,
  runFullReboot,
  setDefaults as setDefaultsFromModule,
  LifecycleManager,
  GridManager,
  ConfigManager,
  ExoticParticleManager,
  runSellAction,
  runManualReduceHeatAction,
  runSellPart,
  runEpartOnclick,
  createGameState,
  setDecimal,
  updateDecimal,
  Reactor,
} from "../state.js";
import { getCompactLayout } from "../components/interface.js";
import { logger } from "../utils.js";
import { GameActionSchema, ACTION_SCHEMA_REGISTRY, EVENT_SCHEMA_REGISTRY } from "./schemas.js";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import {
  UPGRADE_MAX_LEVEL, MAX_GRID_DIMENSION, BASE_LOOP_WAIT_MS, BASE_MONEY,
  PRESTIGE_MULTIPLIER_PER_EP,
  PRESTIGE_MULTIPLIER_CAP, RESPEC_DOCTRINE_EP_COST, PERCENT_DIVISOR,
  BASE_MAX_HEAT, BASE_MAX_POWER,
} from "../utils.js";

function getAuthenticatedUserId() {
  if (window.googleDriveSave && window.googleDriveSave.isSignedIn) {
    const googleUserId = window.googleDriveSave.getUserId();
    if (googleUserId) return `google_${googleUserId}`;
  }
  if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
    const supabaseUserId = window.supabaseAuth.getUserId();
    if (supabaseUserId) return `supabase_${supabaseUserId}`;
  }
  let existingUserId = StorageUtils.get("reactor_user_id");
  if (!existingUserId) {
    existingUserId = crypto.randomUUID();
    StorageUtils.set("reactor_user_id", existingUserId);
  }
  return existingUserId;
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

const DEFAULT_PAYLOAD_SCHEMA = z.object({}).passthrough();

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
    const schema = EVENT_SCHEMA_REGISTRY[eventName] ?? DEFAULT_PAYLOAD_SCHEMA;
    const result = schema.safeParse(payload ?? {});
    if (!result.success) {
      this._logger?.warn?.(`[Game] Event "${eventName}" payload validation failed:`, fromError(result.error).toString());
      return;
    }
    payload = result.data;
    const list = this._listeners.get(eventName);
    if (!list) return;
    list.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        const msg = err?.message ?? String(err);
        this._logger?.warn?.(`[Game] Event handler error for "${eventName}":`, msg);
      }
    });
  }
}

class GameEventRouter {
  constructor() {
    this._lastEmitTick = new Map();
  }
  evaluate(facts, game) {
    if (!game?.emit) return;
    if (facts.isSandbox || facts.isPaused) return;
    for (const rule of rules) {
      if (!rule.predicate(facts)) continue;
      if (rule.oneShot) {
        const key = rule.oneShotKey ?? `_${rule.event}Fired`;
        if (game.state?.[key]) continue;
        game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
        if (game.state && typeof game.state === "object") game.state[key] = true;
        continue;
      }
      const lastTick = this._lastEmitTick.get(rule.event) ?? -Infinity;
      const throttle = rule.throttleTicks ?? 0;
      if (facts.tickCount - lastTick < throttle) continue;
      game.emit(rule.event, { heatRatio: facts.heatRatio, tickCount: facts.tickCount });
      this._lastEmitTick.set(rule.event, facts.tickCount);
    }
  }
  resetThrottles() {
    this._lastEmitTick.clear();
  }
  clearState(game) {
    this.resetThrottles();
    if (!game?.state || typeof game.state !== "object") return;
    for (const rule of rules) {
      if (rule.oneShotKey) game.state[rule.oneShotKey] = false;
    }
  }
}

const ACTION_HANDLERS = {
  sell: (g) => { g.sell_action(); },
  manualReduceHeat: (g) => { g.manual_reduce_heat_action(); },
  pause: (g) => { g.pause(); },
  resume: (g) => { g.resume(); },
  togglePause: (g) => { g.togglePause(); },
  rebootKeepEp: (g) => g.rebootActionKeepExoticParticles(),
  rebootDiscardEp: (g) => g.rebootActionDiscardExoticParticles(),
  reboot: (g) => g.reboot(),
  sellPart: (g, p) => { g.sellPart(p.tile); },
  pasteLayout: (g, p) => { g.action_pasteLayout(p.layout, p.options || {}); },
};

function executeAction(game, action) {
  const actionResult = GameActionSchema.safeParse(action);
  if (!actionResult.success) return null;
  const { type, payload = {} } = actionResult.data;
  const schema = ACTION_SCHEMA_REGISTRY[type];
  const payloadResult = schema ? schema.safeParse(payload) : { success: true, data: payload };
  if (!payloadResult.success) return null;
  const handler = ACTION_HANDLERS[type];
  if (!handler) return null;
  return handler(game, payloadResult.data);
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
    return Formatter.time(totalTime, true);
  }
}

class EconomyManager {
  constructor(game, { prestigePerEp, prestigeCap }) {
    this.game = game;
    this.prestigePerEp = prestigePerEp;
    this.prestigeCap = prestigeCap;
  }
  getCurrentMoney() {
    return this.game.isSandbox ? Infinity : this.game.state.current_money;
  }
  setCurrentMoney(value) {
    if (this.game.isSandbox) return;
    setDecimal(this.game.state, "current_money", value);
  }
  getPrestigeMultiplier() {
    const ep = this.game.state.total_exotic_particles;
    const epNumber = ep && typeof ep.toNumber === "function" ? ep.toNumber() : Number(ep || 0);
    return 1 + Math.min(epNumber * this.prestigePerEp, this.prestigeCap);
  }
  addMoney(amount) {
    if (this.game.isSandbox) return;
    const multiplier = this.getPrestigeMultiplier();
    updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(amount).mul(multiplier)));
  }
}

function runComponentDepletion(game, tile) {
  if (!tile.part) return;
  game.debugHistory.add('game', 'Component depletion', { row: tile.row, col: tile.col, partId: tile.part.id, perpetual: tile.part.perpetual });
  const part = tile.part;
  const hasProtiumLoader = game.upgradeset.getUpgrade("experimental_protium_loader")?.level > 0;
  const isProtium = part.type === "protium";
  const autoBuyEnabled = game.reactor?.auto_buy_enabled ?? game.state?.auto_buy ?? false;
  const autoReplace = (part.perpetual || (isProtium && hasProtiumLoader)) && !!autoBuyEnabled;
  if (autoReplace) {
    const cost = part.getAutoReplacementCost();
    const money = game.state.current_money;
    game.logger?.debug?.(`[AUTO-BUY] Attempting to replace '${part.id}'. Cost: ${cost}, Current Money: ${money}`);
    const canAfford = game.isSandbox || (money != null && typeof money.gte === "function" && money.gte(cost));
    if (canAfford) {
      if (!game.isSandbox) {
        updateDecimal(game.state, "current_money", (d) => d.sub(cost));
      }
      game.logger?.debug?.(`[AUTO-BUY] Success. New Money: ${game.state.current_money}`);
      part.recalculate_stats();
      tile.ticks = part.ticks;
      game.reactor.updateStats();
      return;
    }
    logger.log('debug', 'game', '[AUTO-BUY] Failed. Insufficient funds.');
  }
  game.emit("tileCleared", { tile });
  tile.clearPart();
}

class DoctrineManager {
  constructor(game) {
    this.game = game;
  }
  getDoctrine() {
    if (!this.game.tech_tree || !this.game.upgradeset?.treeList) return null;
    return this.game.upgradeset.treeList.find((t) => t.id === this.game.tech_tree) ?? null;
  }
  applyDoctrineBonuses(doctrine) {
    if (!doctrine?.bonuses || typeof doctrine.bonuses !== "object") return;
    const b = doctrine.bonuses;
    if (typeof b.heat_tolerance_percent === "number") {
      const mult = 1 + b.heat_tolerance_percent / PERCENT_DIVISOR;
      this.game.reactor.base_max_heat *= mult;
      this.game.reactor.altered_max_heat = this.game.reactor.base_max_heat;
    }
  }
  respecDoctrine() {
    if (!this.game.tech_tree) return false;
    const cost = this.game.RESPER_DOCTRINE_EP_COST ?? RESPEC_DOCTRINE_EP_COST;
    const ep = this.game.state?.current_exotic_particles;
    const epVal = (ep != null && typeof ep.lt === "function") ? ep : toDecimal(ep ?? 0);
    if (epVal.lt(cost)) return false;
    const doctrine = this.getDoctrine();
    if (doctrine?.bonuses && typeof doctrine.bonuses.heat_tolerance_percent === "number") {
      const mult = 1 + doctrine.bonuses.heat_tolerance_percent / PERCENT_DIVISOR;
      this.game.reactor.base_max_heat /= mult;
      this.game.reactor.altered_max_heat = this.game.reactor.base_max_heat;
    }
    updateDecimal(this.game.state, "current_exotic_particles", (d) => d.sub(cost));
    const previousTree = this.game.tech_tree;
    this.game.tech_tree = null;
    this.game.upgradeset.resetDoctrineUpgradeLevels(previousTree);
    this.game.reactor.updateStats();
    void this.game.saveManager.autoSave();
    return true;
  }
}

function buildSaveContext(game, { getToggles, getQuickSelectSlots }) {
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

function buildPersistenceContext(game, getCompactLayout) {
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

export class Game {
  constructor(ui_instance) {
    this.ui = ui_instance;
    this.saveOrchestrator = new SaveOrchestrator({
      getContext: () => buildSaveContext(this, {
        getToggles: () => ({
          auto_sell: this.state?.auto_sell ?? false,
          auto_buy: this.state?.auto_buy ?? true,
          heat_control: this.state?.heat_control ?? false,
          time_flux: this.state?.time_flux ?? true,
          pause: this.state?.pause ?? false,
        }),
        getQuickSelectSlots: () => this.ui?.stateManager?.getQuickSelectSlots() ?? [],
      }),
      onBeforeSave: () => {
        this.debugHistory.add('game', 'Generating save state');
        this.updateSessionTime();
      }
    });
    this.saveManager = new GameSaveManager(this.saveOrchestrator, () => buildPersistenceContext(this, () => getCompactLayout(this)));
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
      reality_flux: toDecimal(0),
      max_power: BASE_MAX_POWER,
      max_heat: BASE_MAX_HEAT,
      stats_power: 0,
      stats_heat_generation: 0,
      stats_vent: 0,
      stats_inlet: 0,
      stats_outlet: 0,
      stats_net_heat: 0,
      stats_total_part_heat: 0,
      stats_cash: 0,
      engine_status: "stopped",
      auto_sell: false,
      auto_buy: true,
      heat_control: false,
      time_flux: true,
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
    this.time_flux = true;
    this.sold_power = false;
    this.sold_heat = false;
    this.objectives_manager = new ObjectiveManager(this);
    this.tooltip_manager = null;
    this.placedCounts = {};
    this._suppressPlacementCounting = false;
    this._unlockStates = {};
    this.unlockManager = new UnlockManager(this);
    this.sessionManager = new SessionManager(this);
    this.configManager = new ConfigManager(this);
    this.doctrineManager = new DoctrineManager(this);

    this.debugHistory = new DebugHistory();
    this.undoHistory = [];
    this.audio = null;
    this.logger = logger;

    this.peak_power = 0;
    this.peak_heat = 0;
    
    this.user_id = getAuthenticatedUserId();
    
    this.run_id = crypto.randomUUID();
    this.tech_tree = null;
    this.bypass_tech_tree_restrictions = false;
    this.RESPER_DOCTRINE_EP_COST = RESPEC_DOCTRINE_EP_COST;
    this.cheats_used = false;
    this.grace_period_ticks = 0;
    this.isSandbox = false;
    this._sandboxState = null;
    this._mainState = null;
    this.eventDispatcher = new GameEventDispatcher(logger);
    this.eventRouter = new GameEventRouter();
    this.economyManager = new EconomyManager(this, {
      prestigePerEp: PRESTIGE_MULTIPLIER_PER_EP,
      prestigeCap: PRESTIGE_MULTIPLIER_CAP
    });
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
    await setDefaultsFromModule(this);
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
    return this.economyManager.getPrestigeMultiplier();
  }

  addMoney(amount) {
    this.economyManager.addMoney(amount);
  }

  markCheatsUsed() {
    this.cheats_used = true;
  }

  grantCheatExoticParticle(amount = 1) {
    this.exoticParticleManager.grantCheatExoticParticle(amount);
  }

  getDoctrine() { return this.doctrineManager.getDoctrine(); }
  applyDoctrineBonuses(doctrine) { this.doctrineManager.applyDoctrineBonuses(doctrine); }
  respecDoctrine() { return this.doctrineManager.respecDoctrine(); }

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

  sellPart(tile) {
    runSellPart(this, tile);
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
    await this.saveOrchestrator.applySaveState(this, savedData);
  }

  pause() { this.sessionManager.pause(); }
  resume() { this.sessionManager.resume(); }
  togglePause() { this.sessionManager.togglePause(); }

  async reboot() {
    await runFullReboot(this);
  }

  onToggleStateChange(toggleName, value) {
    this.configManager.onToggleStateChange(toggleName, value);
  }

  execute(action) {
    return executeAction(this, action);
  }

  getConfiguration() {
    return this.configManager.getConfiguration();
  }

  setConfiguration(config) {
    this.configManager.setConfiguration(config);
  }

  action_pasteLayout(layout, options = {}) {
    const bp = new BlueprintService(this);
    bp.applyLayout(layout, options.skipCostDeduction === true);
    this.emit("layoutPasted", { layout });
  }
}
