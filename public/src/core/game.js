import { Reactor } from "./reactor.js";
import { PartSet } from "./partset.js";
import { UpgradeSet } from "./upgradeset.js";
import { Tileset } from "./tileset.js";
import { ObjectiveManager } from "./objective.js";
import { Performance } from "./performance.js";
import { DebugHistory } from "../utils/debugHistory.js";
import { toDecimal } from "../utils/decimal.js";
import { GameSaveManager } from "./gameSaveManager.js";
import { SaveOrchestrator } from "./game/SaveOrchestrator.js";
import { BlueprintService } from "./services/BlueprintService.js";
import { getCompactLayout } from "../components/ui/copyPaste/layoutSerializer.js";
import { UnlockManager } from "./game/unlockManager.js";
import { SessionManager } from "./game/sessionManager.js";
import { runRebootActionKeepEp, runRebootActionDiscardEp, runFullReboot } from "./game/rebootProcessor.js";
import { getAuthenticatedUserId } from "./game/authHelper.js";
import { setDefaults as setDefaultsFromModule } from "./game/defaultsManager.js";
import { initLeaderboardSafe } from "./game/leaderboardInit.js";
import { EconomyManager } from "./game/economyManager.js";
import { TimeKeeper } from "./game/timeKeeper.js";
import { LifecycleManager } from "./game/LifecycleManager.js";
import { GridManager } from "./game/GridManager.js";
import { ConfigManager } from "./game/ConfigManager.js";
import { DoctrineManager } from "./game/DoctrineManager.js";
import { ExoticParticleManager } from "./game/ExoticParticleManager.js";
import { buildSaveContext, buildPersistenceContext } from "./game/SaveContextBuilder.js";
import { handleComponentDepletion as runComponentDepletion } from "./game/ComponentDepletionHandler.js";
import { runSellAction, runManualReduceHeatAction, runSellPart, runEpartOnclick } from "./game/playerActions.js";
import { executeAction } from "./game/GameActionDispatcher.js";
import { GameEventDispatcher } from "./game/GameEventDispatcher.js";
import { logger } from "../utils/logger.js";
import { createGameState } from "./store.js";
import {
  UPGRADE_MAX_LEVEL, MAX_GRID_DIMENSION, BASE_LOOP_WAIT_MS, BASE_MONEY,
  PRESTIGE_MULTIPLIER_PER_EP,
  PRESTIGE_MULTIPLIER_CAP, RESPEC_DOCTRINE_EP_COST,
  BASE_MAX_HEAT, BASE_MAX_POWER,
} from "./constants.js";

export class Game {
  constructor(ui_instance) {
    this.ui = ui_instance;
    this.router = null;
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
