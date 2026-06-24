import { EngineStatus } from "../schema/stateSchemas.js";
import { buildFacts } from "../kernel/buildFacts.js";
import { grantReward as applyGrantReward } from "./rewards.js";
import { creditMoneyWithPrestige } from "./economy-intents.js";
import {
  heatSfxLastTick,
  resetHeatThresholdSignalState,
} from "./reactor-stats.js";
import { calculateSectionCounts } from "../logic-upgrade-sections.js";
import {
  runHeatStepFromTyped,
  runHeatTransferStep,
  MAX_NEIGHBORS,
  INLET_STRIDE,
  INLET_OFFSET_INDEX,
  INLET_OFFSET_RATE,
  INLET_OFFSET_N_COUNT,
  INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE,
  VALVE_OFFSET_INDEX,
  VALVE_OFFSET_TYPE,
  VALVE_OFFSET_ORIENTATION,
  VALVE_OFFSET_RATE,
  VALVE_OFFSET_INPUT_IDX,
  VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE,
  EXCHANGER_OFFSET_INDEX,
  EXCHANGER_OFFSET_RATE,
  EXCHANGER_OFFSET_CONTAINMENT,
  EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES,
  EXCHANGER_OFFSET_NEIGHBOR_CAPS,
  EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE,
  OUTLET_OFFSET_INDEX,
  OUTLET_OFFSET_RATE,
  OUTLET_OFFSET_ACTIVATED,
  OUTLET_OFFSET_IS_OUTLET6,
  OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES,
  OUTLET_OFFSET_NEIGHBOR_CAPS,
  VALVE_OVERFLOW,
  VALVE_TOPUP,
  VALVE_CHECK,
  CATEGORY_EXCHANGER,
  CATEGORY_OTHER,
  CATEGORY_VENT_COOLANT,
  canPushToNeighbor,
  transferHeatBetweenNeighbors,
  applyValveRule,
} from "../logic-heat-transfer.js";
import {
  topologyNeighborCoords,
  TOPOLOGY_TYPES,
  Topology,
  computeWorkerNeighborPulseN,
} from "../logic-topology.js";
import {
  computeAffordable,
} from "../logic-upgrade-dom.js";
import {
  getUpgradeBonusLines,
  computeNeighborPulseNFromTile,
  calculateCellPulsePower,
  calculateCellPulseHeat,
} from "../logic-tooltip-stats.js";
import { hasTrait, compileTraitBitmask } from "../traits.js";
import { StatDispatcher } from "../statDispatcher.js";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { html, render } from "lit-html";
import { classMap, styleMap } from "../dom/lit.js";
import { proxy } from "valtio/vanilla";
import { StorageUtils } from "../storage/index.js";
import Decimal from "../core/decimal-proxy.js";
import {
  toDecimal,
  toNumber,
  getDecimal,
  isTestEnv,
  getIndex,
  isInBounds,
  BASE_LOOP_WAIT_MS,
  FOUNDATIONAL_TICK_MS,
} from "../simUtils.js";
import { logger } from "../core/logger.js";
import { formatTime, numFormat as fmt } from "../format/numbers.js";
import {
  HEAT_TRANSFER_DIFF_DIVISOR,
  EXCHANGER_MIN_TRANSFER_UNIT,
  EXCHANGER_MIN_HEADROOM,
  HEAT_TRANSFER_MAX_ITERATIONS,
  VALVE_OVERFLOW_THRESHOLD,
  VALVE_TOPUP_THRESHOLD,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
  HULL_REPEL_FRACTION,
  CRITICAL_HEAT_RATIO,
} from "../constants/sim.js";
import {
  GRID_SIZE_PHYSICS_WORKER_MAX_CELLS,
  WORKER_HEARTBEAT_MS,
  WORKER_HEAT_TIMEOUTS_BEFORE_FALLBACK,
  PAUSED_POLL_MS,
  MAX_TEST_FRAMES,
  SESSION_UPDATE_INTERVAL_MS,
  MAX_VISUAL_EVENTS,
  MAX_VISUAL_REFLECTOR_PAIRS_PER_FRAME,
  MAX_VISUAL_EXPLOSION_FLASHES_PER_FRAME,
  HEAT_CALC_POOL_SIZE,
  AUTONOMIC_REPAIR_POWER_COST,
  AUTONOMIC_REPAIR_POWER_MIN,
  EP_HEAT_SAFE_CAP,
  HEAT_REMOVAL_TARGET_RATIO,
  MULTIPLIER_FLOOR,
  VISUAL_PARTICLE_HIGH_THRESHOLD,
  VISUAL_PARTICLE_MED_THRESHOLD,
  VISUAL_PARTICLE_HIGH_COUNT,
  VISUAL_PARTICLE_MED_COUNT,
  OFFLINE_TIME_THRESHOLD_MS,
  MAX_ACCUMULATOR_MULTIPLIER,
  MAX_LIVE_TICKS,
  MAX_CATCHUP_TICKS,
  GRID_TARGET_TOTAL_TILES,
  GRID_MIN_DIMENSION,
  GRID_MAX_DISPLAY_DIMENSION,
  ZOOM_DAMPING_FACTOR,
  PINCH_DISTANCE_THRESHOLD_PX,
  MOMENTUM_DECAY_FACTOR,
  SNAP_BACK_THRESHOLD_RATIO,
  SNAP_BACK_SPRING_CONSTANT,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  BALANCE_POWER_THRESHOLD_10K,
  BASE_MAX_POWER,
  BASE_MAX_HEAT,
  SIMULATION_ERROR_MESSAGE,
  HULL_HEAT_PER_PLATING_TILE,
  POWER_STORAGE_PER_CAPACITOR_TILE,
  POWER_STORAGE_CHARGED_PLATING_EXTRA,
  MAX_PART_VARIANTS,
  UPGRADE_MAX_LEVEL,
  MAX_GRID_DIMENSION,
  BASE_MONEY,
  PRESTIGE_MULTIPLIER_PER_EP,
  PRESTIGE_MULTIPLIER_CAP,
  RESPEC_DOCTRINE_EP_COST,
  WEAVE_QUANTUM,
  GRID,
} from "../constants/balance.js";
import {
  COLORS,
  OVERHEAT_VISUAL,
  BAR,
  SINGULARITY,
  HEAT_MAP,
  HEAT_SHIMMER,
  HEAT_HAZE,
  HEAT_FLOW,
} from "../constants/heat-visual.js";
import { getPartImagePath } from "../core/part-images.js";
import { MOBILE_BREAKPOINT_PX, RESIZE_DELAY_MS } from "../constants/ui-constants.js";
import { getNeighborKeys, areAdjacent as areAdjacentFromModule } from "../core/grid-helpers.js";
import { vuSegmentRatio01 } from "../core/math-helpers.js";
import { SpatialRegistry } from "../spatial-adjacency.js";
import {
  GameActionSchema,
  ACTION_SCHEMA_REGISTRY,
  EVENT_SCHEMA_REGISTRY,
  snapshot,
  createGameState,
  UnlockManager,
  runRebootActionKeepEp,
  runRebootActionDiscardEp,
  runRebootAction,
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
  resetSessionCriticalityCounters,
  updateDecimal,
  setDecimal,
} from "../state.js";
import { Reactor } from "./reactor.js";
import { GridManager } from "./grid.js";
import { parseAndValidateSave } from "./game-save.js";
import { BALANCE } from "./balance.js";
import {
  Part,
  PartSet,
  resolveCellTierPartId,
  CELL_FORM_FACTORS,
} from "./part.js";
import {
  GameLoopTickInputSchema,
  GameLoopTickResultSchema,
  PhysicsTickInputSchema,
  PhysicsTickResultSchema,
} from "../schema/index.js";
import { getValidatedGameData } from "../services-audio.js";
import { renderToNode, PartButton, UpgradeCard } from "../components/button-factory.js";
import { applyBlueprintLayoutDiff } from "./blueprint.js";
import { applyComputedModifiers } from "./modifiers.js";
import { UpgradeSet } from "./upgrade.js";
import { ObjectiveManager } from "./objectives.js";
import { AchievementManager } from "./achievements.js";
import { Tileset } from "./grid.js";
import { Engine, Performance, postGameLoopProjectionQuery } from "./engine.js";
import { recordSimEvent } from "./sim-events.js";

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

const SIDE_EFFECT_EVENTS = new Set([
  "vibrationRequest", "achievementUnlocked", "achievementCatchUpSummary", "heatWarning",
  "pipeIntegrityWarning", "firstHighHeat", "saveLoaded", "component_explosion",
  "objectiveClaimed", "chapterCelebration",
  "layoutPasted", "blueprintApplyDeficit", "tileCleared",
  "welcomeBackOffline",
  "showContextModal", "markStaticDirty", "partsPanelRefresh",
  "upgradePurchased", "prestigeCompleted", "statePatch", "quickSelectSlotsChanged",
]);

export class GameEventDispatcher {
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

const ACTION_INTENT_BUILDERS = {
  sell: () => ({ action: "SELL_POWER" }),
  manualReduceHeat: () => ({ action: "VENT_HEAT" }),
  pause: () => ({ action: "SET_TOGGLE", payload: { toggleName: "pause", value: true } }),
  resume: () => ({ action: "SET_TOGGLE", payload: { toggleName: "pause", value: false } }),
  togglePause: () => ({ action: "PAUSE_TOGGLE" }),
  rebootKeepEp: () => ({ action: "REBOOT", payload: { keepEp: true } }),
  rebootDiscardEp: () => ({ action: "REBOOT", payload: { keepEp: false } }),
  reboot: () => ({ action: "REBOOT", payload: { keepEp: false } }),
  sellPart: (_g, p) => ({ action: "SELL_PART", payload: { row: p.tile?.row, col: p.tile?.col } }),
  pasteLayout: (_g, p) => ({
    action: "APPLY_BLUEPRINT",
    payload: {
      layout: p.layout,
      skipCostDeduction: p.options?.skipCostDeduction === true,
      partial: p.options?.partial === true,
    },
  }),
};

function pushGameIntent(game, intent) {
  if (!game?.state) return null;
  game.state.intent_queue.push({ ...intent, timestamp: Date.now() });
  void game.engine?.consumeIntentQueueAsync?.();
  return true;
}

function executeAction(game, action) {
  const actionResult = GameActionSchema.safeParse(action);
  if (!actionResult.success) return null;
  const { type, payload = {} } = actionResult.data;
  const schema = ACTION_SCHEMA_REGISTRY[type];
  const payloadResult = schema ? schema.safeParse(payload) : { success: true, data: payload };
  if (!payloadResult.success) return null;
  const builder = ACTION_INTENT_BUILDERS[type];
  if (!builder) return null;
  return pushGameIntent(game, builder(game, payloadResult.data));
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
  constructor(game, { prestigePerEp, prestigeCap }) {
    this.game = game;
    this.prestigePerEp = prestigePerEp;
    this.prestigeCap = prestigeCap;
  }
  getCurrentMoney() {
    return this.game.state.current_money;
  }
  setCurrentMoney(value) {
    setDecimal(this.game.state, "current_money", value);
  }
  getPrestigeMultiplier() {
    const ep = this.game.state.total_exotic_particles;
    const epNumber = ep && typeof ep.toNumber === "function" ? ep.toNumber() : Number(ep || 0);
    return 1 + Math.min(epNumber * this.prestigePerEp, this.prestigeCap);
  }
  addMoney(amount) {
    creditMoneyWithPrestige(this.game, amount);
  }
}

function runComponentDepletion(game, tile) {
  if (!tile.part) return;
  game.logger?.debug?.(`[AUTO-BUY] Component depletion at (${tile.row}, ${tile.col})`, { partId: tile.part.id, perpetual: tile.part.perpetual });
  const part = tile.part;
  const hasProtiumLoader = game.upgradeset.getUpgrade("experimental_protium_loader")?.level > 0;
  const isProtium = part.type === "protium";
  const autoBuyEnabled = game.reactor?.auto_buy_enabled ?? game.state?.auto_buy ?? false;
  const autoReplace = (part.perpetual || (isProtium && hasProtiumLoader)) && !!autoBuyEnabled;
  if (autoReplace) {
    const cost = part.getAutoReplacementCost();
    const money = game.state.current_money;
    game.logger?.debug?.(`[AUTO-BUY] Attempting to replace '${part.id}'. Cost: ${cost}, Current Money: ${money}`);
    const canAfford = money != null && typeof money.gte === "function" && money.gte(cost);
    if (canAfford) {
      updateDecimal(game.state, "current_money", (d) => d.sub(cost));
      game.logger?.debug?.(`[AUTO-BUY] Success. New Money: ${game.state.current_money}`);
      part.recalculate_stats();
      tile.ticks = part.ticks;
      recordSimEvent(game, {
        type: "AUTO_BUY_DEBIT",
        row: tile.row,
        col: tile.col,
        text: `-$${Number(cost) || 0}`,
      });
      game.reactor.updateStats();
      return;
    }
    logger.log('debug', 'game', '[AUTO-BUY] Failed. Insufficient funds.');
  }
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
    this.economyManager = new EconomyManager(this, {
      prestigePerEp: PRESTIGE_MULTIPLIER_PER_EP,
      prestigeCap: PRESTIGE_MULTIPLIER_CAP
    });
    this.timeKeeper = new TimeKeeper(this);
    this.exoticParticleManager = new ExoticParticleManager(this);
    this.statDispatcher = new StatDispatcher(this);
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

  grantReward(reward) {
    applyGrantReward(this, reward);
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
    if (!tile || !this.state) return;
    this.state.intent_queue.push({
      action: "SELL_PART",
      timestamp: Date.now(),
      payload: { row: tile.row, col: tile.col },
    });
    if (this.engine?.consumeIntentQueueAsync) {
      return this.engine.consumeIntentQueueAsync();
    }
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

  execute(action) {
    return executeAction(this, action);
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
    if (!this.engine) return null;
    this.state.intent_queue.push({
      action: "COMMIT_BLUEPRINT_PLANNER",
      payload: { partial: options.partial === true },
    });
    return this.engine.consumeIntentQueueAsync();
  }

  getDoctrine() {
    if (!this.tech_tree) return null;
    return this.upgradeset.techTrees?.find(t => t.id === this.tech_tree) || null;
  }

  respecDoctrine() {
    const cost = this.RESPER_DOCTRINE_EP_COST; // Ensure using the property name in class
    const currentEp = this.state.current_exotic_particles;

    if (currentEp.lt(cost)) return false;

    updateDecimal(this.state, "current_exotic_particles", (d) => d.sub(cost));

    const oldTree = this.tech_tree;
    this.tech_tree = null; // Set to null as per test expectation

    this.upgradeset.resetDoctrineUpgradeLevels(oldTree);
    resetHeatThresholdSignalState(this);

    if (this.saveManager) this.saveManager.autoSave();
    return true;
  }
}
