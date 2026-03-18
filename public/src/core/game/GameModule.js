import { StorageUtilsAsync, logger, toDecimal, toNumber } from "../../utils/utils_constants.js";
import { snapshot, setDecimal } from "../store.js";
import { applySaveState as applySaveStateFromModule } from "../save_system.js";
import {
  MOBILE_BREAKPOINT_PX,
  DEFAULT_AUTOSAVE_INTERVAL_MS,
  FAILSAFE_MONEY_THRESHOLD,
  CRITICAL_HEAT_RATIO,
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "../../utils/utils_constants.js";
import { GameDimensionsSchema } from "../../utils/utils_constants.js";
import { leaderboardService } from "../../services/services_cloud.js";

function getPreviousTierSpec(part, partset) {
  if (!part) return null;
  if (part.level && part.level > 1) {
    return { type: part.type, level: part.level - 1, category: part.category };
  }
  const orderIdx = partset?.typeOrderIndex?.get(`${part.category}:${part.type}`);
  const typeOrder = partset?.categoryTypeOrder?.get(part.category) || [];
  if (typeof orderIdx !== 'number' || orderIdx <= 0) return null;
  const prevType = typeOrder[orderIdx - 1];
  const prevMaxLevel = Math.max(
    1,
    ...(partset?.getPartsByType(prevType)?.map((p) => p.level) || [1])
  );
  return { type: prevType, level: prevMaxLevel, category: part.category };
}

function isFirstInChainSpec(spec, partset) {
  if (!spec) return false;
  const idx = partset?.typeOrderIndex?.get(`${spec.category}:${spec.type}`);
  return (idx === 0) && spec.level === 1;
}

function isSpecUnlocked(spec, partset, getPlacedCount) {
  if (!spec) return false;
  const prev = getPreviousTierSpec({ type: spec.type, level: spec.level, category: spec.category }, partset);
  if (!prev) return true;
  return getPlacedCount(prev.type, prev.level) >= 10;
}

function shouldShowPart(part, partset, getPlacedCount) {
  if (!part) return false;
  if (part.category === 'valve') return true;
  const prevSpec = getPreviousTierSpec(part, partset);
  if (!prevSpec) return true;
  if (isSpecUnlocked(prevSpec, partset, getPlacedCount)) return true;
  return false;
}

function isPartUnlocked(part, ctx) {
  if (ctx.isSandbox) return true;
  if (ctx.partset?.isPartDoctrineLocked(part)) return false;
  if (!part || part.category === 'valve') {
    ctx.logger?.debug(`[UNLOCK] Part ${part?.id || 'null'}: Valve or null, unlocked by default.`);
    return true;
  }
  const prevSpec = getPreviousTierSpec(part, ctx.partset);
  if (!prevSpec) {
    ctx.logger?.debug(`[UNLOCK] Part '${part.id}' is a base part (no prerequisite). Unlocked by default.`);
    return true;
  }
  const count = ctx.getPlacedCount(prevSpec.type, prevSpec.level);
  const isUnlocked = count >= 10;
  const partId = part.id;
  const wasUnlocked = ctx._unlockStates[partId] || false;
  ctx._unlockStates[partId] = isUnlocked;
  ctx.logger?.debug(`[UNLOCK] Checking part '${part.id}': Requires 10 of '${prevSpec.type}:${prevSpec.level}'. Count: ${count}. Unlocked: ${isUnlocked}`);
  return isUnlocked;
}

function calculateBaseDimensions() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const raw = {
    base_cols: isMobile ? BASE_COLS_MOBILE : BASE_COLS_DESKTOP,
    base_rows: isMobile ? BASE_ROWS_MOBILE : BASE_ROWS_DESKTOP,
  };
  return GameDimensionsSchema.parse(raw);
}

function validateObjectiveState(game) {
  if (!game.objectives_manager || game._saved_objective_index === undefined) return;
  const currentIndex = game.objectives_manager.current_objective_index;
  const savedIndex = game._saved_objective_index;
  if (currentIndex !== savedIndex) {
    logger.log("warn", "game", `Objective state inconsistency detected: current=${currentIndex}, saved=${savedIndex}. Restoring...`);
    game.objectives_manager.current_objective_index = savedIndex;
    if (game.objectives_manager.set_objective && game.objectives_manager.objectives_data) {
      game.objectives_manager.set_objective(savedIndex, true);
    }
    setTimeout(() => void game.saveManager.autoSave(), 100);
  }
}

const EXPECTED_LEADERBOARD_ERROR_TERMS = [
  "SharedArrayBuffer",
  "Atomics",
  "COOP/COEP",
  "Cannot read properties",
  "can't access property",
];

function initLeaderboardSafe() {
  leaderboardService.init().catch((err) => {
    const errorMsg = err?.message || String(err);
    const isExpected = EXPECTED_LEADERBOARD_ERROR_TERMS.some((term) => errorMsg.includes(term));
    if (!isExpected) logger.log("warn", "game", "Leaderboard init failed:", errorMsg);
  });
}

export class GridManager {
  constructor(game) {
    this.game = game;
    const dimensions = calculateBaseDimensions();
    this.base_cols = dimensions.base_cols;
    this.base_rows = dimensions.base_rows;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
  }

  updateBaseDimensions() {
    const dimensions = calculateBaseDimensions();
    const oldBaseCols = this.base_cols;
    const oldBaseRows = this.base_rows;
    this.base_cols = dimensions.base_cols;
    this.base_rows = dimensions.base_rows;
    if (this.game.rows === oldBaseRows && this.game.cols === oldBaseCols) {
      this.setRows(this.base_rows);
      this.setCols(this.base_cols);
      return;
    }
    const rowDiff = this.base_rows - oldBaseRows;
    const colDiff = this.base_cols - oldBaseCols;
    if (rowDiff !== 0 || colDiff !== 0) {
      this.setRows(Math.max(this.base_rows, this._rows + rowDiff));
      this.setCols(Math.max(this.base_cols, this._cols + colDiff));
    }
  }

  setRows(value) {
    if (this._rows !== value) {
      this._rows = value;
      this.game.tileset.updateActiveTiles();
      this.game.reactor.updateStats();
      this.game.emit?.("gridResized");
    }
  }

  setCols(value) {
    if (this._cols !== value) {
      this._cols = value;
      this.game.tileset.updateActiveTiles();
      this.game.reactor.updateStats();
      this.game.emit?.("gridResized");
    }
  }

  get rows() {
    return this._rows;
  }

  get cols() {
    return this._cols;
  }
}

export class SaveOrchestrator {
  constructor({ getContext, onBeforeSave }) {
    this.getContext = getContext;
    this.onBeforeSave = onBeforeSave;
  }

  async getSaveState() {
    this.onBeforeSave?.();
    const ctx = this.getContext();
    const stateSnap = ctx.state ? snapshot(ctx.state) : null;
    const reactorState = typeof ctx.reactor?.toSaveState === "function" ? ctx.reactor.toSaveState() : {
      current_heat: ctx.reactor.current_heat,
      current_power: ctx.reactor.current_power,
      has_melted_down: ctx.reactor.has_melted_down,
      base_max_heat: ctx.reactor.base_max_heat,
      base_max_power: ctx.reactor.base_max_power,
      altered_max_heat: ctx.reactor.altered_max_heat,
      altered_max_power: ctx.reactor.altered_max_power,
    };
    const tileState = typeof ctx.tileset?.toSaveState === "function"
      ? ctx.tileset.toSaveState()
      : ctx.tileset.active_tiles_list
        .filter((tile) => tile.part)
        .map((tile) => ({
          row: tile.row,
          col: tile.col,
          partId: tile.part.id,
          ticks: tile.ticks,
          heat_contained: tile.heat_contained,
        }));
    const upgradeState = typeof ctx.upgradeset?.toSaveState === "function"
      ? ctx.upgradeset.toSaveState()
      : ctx.upgradeset.upgradesArray
        .filter((upg) => upg.level > 0)
        .map((upg) => ({ id: upg.id, level: upg.level }));
    const saveData = {
      version: ctx.version,
      run_id: ctx.run_id,
      tech_tree: ctx.tech_tree,
      current_money: stateSnap?.current_money ?? ctx.state?.current_money,
      protium_particles: ctx.protium_particles,
      total_exotic_particles: ctx.total_exotic_particles,
      exotic_particles: ctx.exotic_particles,
      current_exotic_particles: ctx.current_exotic_particles,
      rows: ctx.rows,
      cols: ctx.cols,
      sold_power: ctx.sold_power,
      sold_heat: ctx.sold_heat,
      grace_period_ticks: ctx.grace_period_ticks,
      total_played_time: ctx.total_played_time,
      last_save_time: Date.now(),
      reactor: reactorState,
      placedCounts: ctx.placedCounts,
      tiles: tileState,
      upgrades: upgradeState,
      objectives: this._buildObjectivesState(ctx),
      toggles: ctx.getToggles?.() ?? {},
      quick_select_slots: ctx.getQuickSelectSlots?.() ?? [],
      ui: {},
    };
    try {
      if (typeof indexedDB !== "undefined") {
        const keysToCheck = ["reactorGameSave", "reactorGameSave_1", "reactorGameSave_2", "reactorGameSave_3"];
        for (const key of keysToCheck) {
          const existingSave = await StorageUtilsAsync.get(key);
          if (existingSave && typeof existingSave === "object" && existingSave.isCloudSynced) {
            saveData.isCloudSynced = existingSave.isCloudSynced;
            saveData.cloudUploadedAt = existingSave.cloudUploadedAt;
            break;
          }
        }
      }
    } catch (error) {
      logger.log("warn", "game", "Could not preserve cloud sync flags:", error.message);
    }
    return saveData;
  }

  _buildObjectivesState(ctx) {
    const om = ctx.objectives_manager;
    const obj = {
      current_objective_index: om?.current_objective_index ?? 0,
      completed_objectives: (om?.objectives_data?.map((o) => o.completed) ?? []),
    };
    if (om?.infiniteObjective) {
      obj.infinite_objective = {
        ...om.infiniteObjective,
        _lastInfinitePowerTarget: om._lastInfinitePowerTarget,
        _lastInfiniteHeatMaintain: om._lastInfiniteHeatMaintain,
        _lastInfiniteMoneyThorium: om._lastInfiniteMoneyThorium,
        _lastInfiniteHeat: om._lastInfiniteHeat,
        _lastInfiniteEP: om._lastInfiniteEP,
        _infiniteChallengeIndex: om._infiniteChallengeIndex,
        _infiniteCompletedCount: om._infiniteCompletedCount,
      };
    }
    return obj;
  }

  async applySaveState(game, savedData) {
    game._isRestoringSave = true;
    try {
      await applySaveStateFromModule(game, savedData);
    } finally {
      game._isRestoringSave = false;
    }
  }
}

export class UnlockManager {
  constructor(game) {
    this.game = game;
  }

  getPlacedCount(type, level) {
    const counts = this.game.placedCounts ?? {};
    return counts[`${type}:${level}`] || 0;
  }

  incrementPlacedCount(type, level) {
    if (this.game._suppressPlacementCounting) return;
    const counts = this.game.placedCounts ?? {};
    const key = `${type}:${level}`;
    counts[key] = (counts[key] || 0) + 1;
    this.game.placedCounts = counts;
  }

  getPreviousTierCount(part) {
    const prevSpec = this.getPreviousTierSpec(part);
    if (!prevSpec) return 0;
    return this.getPlacedCount(prevSpec.type, prevSpec.level);
  }

  getPreviousTierSpec(part) {
    return getPreviousTierSpec(part, this.game.partset);
  }

  isFirstInChainSpec(spec) {
    return isFirstInChainSpec(spec, this.game.partset);
  }

  isSpecUnlocked(spec) {
    return isSpecUnlocked(spec, this.game.partset, (type, level) => this.getPlacedCount(type, level));
  }

  shouldShowPart(part) {
    return shouldShowPart(part, this.game.partset, (type, level) => this.getPlacedCount(type, level));
  }

  isPartUnlocked(part) {
    return isPartUnlocked(part, {
      isSandbox: this.game.isSandbox,
      partset: this.game.partset,
      getPlacedCount: (type, level) => this.getPlacedCount(type, level),
      _unlockStates: this.game._unlockStates,
      logger: this.game.logger,
    });
  }
}

function captureRebootState(game, keep_exotic_particles) {
  const savedTotalEp = game.state.total_exotic_particles;
  const savedCurrentEp = game.state.current_exotic_particles;
  const savedProtiumParticles = game.protium_particles;
  const preservedEpUpgrades = keep_exotic_particles
    ? game.upgradeset.getAllUpgrades()
        .filter((upg) => upg.base_ecost && upg.level > 0)
        .map((upg) => ({ id: upg.id, level: upg.level }))
    : [];
  return { savedTotalEp, savedCurrentEp, savedProtiumParticles, preservedEpUpgrades };
}

async function applyDefaults(game, savedProtiumParticles) {
  await game.set_defaults();
  game.protium_particles = savedProtiumParticles;
}

function clearState(game) {
  game.reactor.clearMeltdownState();
  game.emit?.("clearAnimations");
}

function restoreExoticParticles(game, keep_exotic_particles, savedTotalEp, savedCurrentEp, preservedEpUpgrades) {
  if (keep_exotic_particles) {
    setDecimal(game.state, "total_exotic_particles", savedTotalEp);
    setDecimal(game.state, "current_exotic_particles", savedCurrentEp);
  } else {
    setDecimal(game.state, "total_exotic_particles", toDecimal(0));
    setDecimal(game.state, "current_exotic_particles", toDecimal(0));
    setDecimal(game.state, "reality_flux", toDecimal(0));
  }
  if (keep_exotic_particles && preservedEpUpgrades.length > 0) {
    preservedEpUpgrades.forEach(({ id, level }) => {
      const upg = game.upgradeset.getUpgrade(id);
      if (upg) upg.setLevel(level);
    });
  }
}

function refreshUI(game) {
  const payload = {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    reality_flux: game.state.reality_flux,
  };
  game.emit?.("exoticParticlesChanged", payload);
  game.reactor.updateStats();
  game.emit?.("partsPanelRefresh");
}

function refreshObjective(game) {
  if (game.objectives_manager) game.objectives_manager.check_current_objective();
}

async function runRebootActionInternal(game, keep_exotic_particles) {
  game.debugHistory.add("game", "Reboot action initiated", { keep_exotic_particles });
  if (game.audio) game.audio.play("reboot");
  const { savedTotalEp, savedCurrentEp, savedProtiumParticles, preservedEpUpgrades } = captureRebootState(game, keep_exotic_particles);
  await applyDefaults(game, savedProtiumParticles);
  clearState(game);
  restoreExoticParticles(game, keep_exotic_particles, savedTotalEp, savedCurrentEp, preservedEpUpgrades);
  refreshUI(game);
  refreshObjective(game);
}

export async function runRebootActionKeepEp(game) {
  await runRebootActionInternal(game, true);
}

export async function runRebootActionDiscardEp(game) {
  await runRebootActionInternal(game, false);
}

export async function runRebootAction(game, keep_exotic_particles = false) {
  await runRebootActionInternal(game, keep_exotic_particles);
}

export async function runFullReboot(game) {
  if (game.engine && game.engine.running) game.engine.stop();
  game.paused = false;
  setDecimal(game.state, "current_money", 0);
  game.tech_tree = null;
  game.exoticParticleManager.exotic_particles = toDecimal(0);
  setDecimal(game.state, "current_exotic_particles", 0);
  game.protium_particles = 0;
  setDecimal(game.state, "total_exotic_particles", 0);
  setDecimal(game.state, "reality_flux", 0);
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
  if (game._test_grid_size) {
    game.gridManager.setRows(game._test_grid_size.rows);
    game.gridManager.setCols(game._test_grid_size.cols);
  }
  if (game.reactor) {
    game.reactor.current_heat = 0;
    game.reactor.current_power = 0;
    game.reactor.has_melted_down = false;
    if (game.emit) game.emit("meltdownResolved", { hasMeltedDown: false });
    game.reactor.updateStats();
  }
  if (game.tileset) game.tileset.clearAllTiles();
  if (game.upgradeset) {
    game.upgradeset.upgradesArray.forEach((upgrade) => {
      if (!upgrade.upgrade.type.includes("experimental")) upgrade.level = 0;
    });
  }
  const payload = {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    reality_flux: game.state.reality_flux,
  };
  game.emit?.("exoticParticlesChanged", payload);
}

function applyBaseDimensions(game, dimensions) {
  game.base_cols = dimensions.base_cols;
  game.base_rows = dimensions.base_rows;
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
}

function applyBaseResources(game) {
  setDecimal(game.state, "current_money", game.base_money);
  game.protium_particles = 0;
  setDecimal(game.state, "total_exotic_particles", 0);
  game.exoticParticleManager.exotic_particles = toDecimal(0);
  setDecimal(game.state, "current_exotic_particles", 0);
  setDecimal(game.state, "reality_flux", 0);
  game.sold_power = false;
  game.sold_heat = false;
}

async function resetSubsystems(game, bypass, preservedTechTree) {
  game.reactor.setDefaults();
  game.upgradeset.reset();
  game.partset.reset();
  game.tech_tree = preservedTechTree;
  await game.partset.initialize();
  await game.upgradeset.initialize();
  game.bypass_tech_tree_restrictions = bypass;
}

function recalculatePartStats(game) {
  if (game.partset?.partsArray?.length) {
    game.partset.partsArray.forEach((part) => {
      try {
        part.recalculate_stats();
      } catch (_) {}
    });
  }
  game.upgradeset.check_affordability(game);
}

function applyPlacementState(game) {
  game.placedCounts = {};
  game._suppressPlacementCounting = false;
}

function clearTilesThenVisuals(game) {
  game.tileset.clearAllTiles();
  game.emit?.("clearImageCache");
  game.reactor.updateStats();
  game.reactor.clearHeatVisualStates();
  game.emit?.("clearAnimations");
}

function applyPlacementThenTiles(game) {
  applyPlacementState(game);
  clearTilesThenVisuals(game);
}

function setLoopWait(game) {
  game.loop_wait = game.base_loop_wait;
}

function setPausedState(game) {
  game.paused = false;
}

function applyLoopThenPause(game) {
  setLoopWait(game);
  setPausedState(game);
}

function applyDoctrineFromTree(game) {
  const doctrine = game.getDoctrine();
  if (doctrine) game.applyDoctrineBonuses(doctrine);
}

function resetSessionTimes(game) {
  game.lifecycleManager.session_start_time = null;
  game.lifecycleManager.total_played_time = 0;
  game.lifecycleManager.last_save_time = null;
}

function applyDoctrineThenSession(game) {
  applyDoctrineFromTree(game);
  resetSessionTimes(game);
}

function resetObjectives(game) {
  if (game.objectives_manager) {
    game.objectives_manager.current_objective_index = 0;
    if (game.objectives_manager.objectives_data?.length) {
      game.objectives_manager.objectives_data.forEach((obj) => {
        obj.completed = false;
      });
      game.objectives_manager.set_objective(0, true);
    }
  }
}

function validateObjectiveStateIfNeeded(game) {
  if (game._saved_objective_index !== undefined) {
    game.debugHistory.add("game", "Validating objective state after default set");
    validateObjectiveState(game);
  }
}

export async function setDefaults(game) {
  const dimensions = calculateBaseDimensions();
  applyBaseDimensions(game, dimensions);
  applyBaseResources(game);
  const bypass = game.bypass_tech_tree_restrictions;
  const preservedTechTree = game.tech_tree;
  await resetSubsystems(game, bypass, preservedTechTree);
  recalculatePartStats(game);
  applyPlacementThenTiles(game);
  applyLoopThenPause(game);
  applyDoctrineThenSession(game);
  resetObjectives(game);
  validateObjectiveStateIfNeeded(game);
  game.eventRouter?.clearState?.(game);
}

export class LifecycleManager {
  constructor(game) {
    this.game = game;
    this.session_start_time = null;
    this.last_save_time = null;
    this.total_played_time = 0;
  }

  async initialize_new_game_state() {
    this.game.debugHistory.clear();
    await this.game.set_defaults();
    this.game.run_id = crypto.randomUUID();
    this.game.cheats_used = false;
    this.game.reactor.clearMeltdownState();
    initLeaderboardSafe();
    this.game.emit?.("clearAnimations");
    setDecimal(this.game.state, "current_money", this.game.base_money);
    this.game.state.stats_cash = this.game.state.current_money;
    this.game.emit("toggleStateChanged", { toggleName: "auto_sell", value: false });
    this.game.emit("toggleStateChanged", { toggleName: "auto_buy", value: false });
    this.game.emit("toggleStateChanged", { toggleName: "time_flux", value: false });
    const defaultQuickSelectIds = ["uranium1", "vent1", "heat_exchanger1", "heat_outlet1", "capacitor1"];
    const slots = defaultQuickSelectIds.map((partId) => ({ partId, locked: false }));
    this.game.emit("quickSelectSlotsChanged", { slots });
  }

  async startSession() {
    this.session_start_time = Date.now();
    if (!this.last_save_time) this.last_save_time = Date.now();
    initLeaderboardSafe();
    await this.game.objectives_manager.initialize();
    if (this.game._saved_objective_index === undefined) {
      this.game.objectives_manager.set_objective(0, true);
    }
    this.game.reactor.updateStats();
    this.game.upgradeset.check_affordability(this.game);
  }

  updateSessionTime() {
    this.game.timeKeeper.updateSessionTime();
  }

  getFormattedTotalPlayedTime() {
    return this.game.timeKeeper.getFormattedTotalPlayedTime();
  }
}

export class ConfigManager {
  constructor(game) {
    this.game = game;
    this._config = {};
  }

  getConfiguration() {
    return {
      gameSpeed: this.game.loop_wait,
      autoSave: this._config?.autoSave ?? true,
      soundEnabled: this._config?.soundEnabled ?? true,
      autoSaveInterval: this._config?.autoSaveInterval ?? DEFAULT_AUTOSAVE_INTERVAL_MS,
    };
  }

  setConfiguration(config) {
    if (config.gameSpeed !== undefined) this.game.loop_wait = config.gameSpeed;
    this._config = { ...this._config, ...config };
  }

  onToggleStateChange(toggleName, value) {
    if (this.game.state && this.game.state[toggleName] !== value) this.game.state[toggleName] = value;
    switch (toggleName) {
      case "auto_sell":
        if (this.game.reactor) this.game.reactor.auto_sell_enabled = value;
        break;
      case "auto_buy":
        if (this.game.reactor) this.game.reactor.auto_buy_enabled = value;
        break;
      case "heat_control":
        if (this.game.reactor) this.game.reactor.heat_controlled = value;
        break;
      case "time_flux":
        this.game.time_flux = value;
        break;
      case "pause":
        this.game.paused = value;
        if (this.game.router?.navigationPaused && !this.game.router.isNavigating) this.game.router.navigationPaused = false;
        if (this.game.engine) {
          if (value) this.game.engine.stop();
          else this.game.engine.start();
        }
        break;
      default:
        break;
    }
    this.game.emit?.("toggleStateChanged", { toggleName, value });
  }
}

function ensureDecimal(v) {
  return v != null && typeof v.gte === "function" ? v : toDecimal(v ?? 0);
}

export class ExoticParticleManager {
  constructor(game) {
    this.game = game;
    this._exotic_particles = toDecimal(0);
  }

  get total_exotic_particles() {
    return this.game.state.total_exotic_particles ?? toDecimal(0);
  }

  set total_exotic_particles(v) {
    setDecimal(this.game.state, "total_exotic_particles", ensureDecimal(v));
  }

  get exotic_particles() {
    return this._exotic_particles;
  }

  set exotic_particles(v) {
    this._exotic_particles = ensureDecimal(v);
  }

  get current_exotic_particles() {
    return this.game.state.current_exotic_particles;
  }

  set current_exotic_particles(v) {
    setDecimal(this.game.state, "current_exotic_particles", ensureDecimal(v));
  }

  get reality_flux() {
    return this.game.state.reality_flux ?? toDecimal(0);
  }

  set reality_flux(v) {
    setDecimal(this.game.state, "reality_flux", ensureDecimal(v));
  }

  grantCheatExoticParticle(amount = 1) {
    const delta = toDecimal(amount);
    this.game.markCheatsUsed();
    this.exotic_particles = this.exotic_particles.add(delta);
    this.total_exotic_particles = this.total_exotic_particles.add(delta);
    this.current_exotic_particles = this.current_exotic_particles.add(delta);
  }
}

export function runSellAction(game) {
  if (
    game.state.current_money !== Infinity &&
    game.state.current_money.lt(FAILSAFE_MONEY_THRESHOLD) &&
    game.reactor.current_power == 0
  ) {
    const hasPartsToSell = game.tileset.active_tiles_list.some((tile) => tile.part && !tile.part.isSpecialTile);
    if (!hasPartsToSell) {
      game.addMoney(FAILSAFE_MONEY_THRESHOLD);
      game.debugHistory.add("game", "Failsafe: +$10 added");
    }
  } else {
    game.reactor.sellPower();
  }
  game.reactor.updateStats();
}

export function runManualReduceHeatAction(game) {
  game.debugHistory.add("game", "Manual heat reduction");
  game.emit("vibrationRequest", { type: "heavy" });
  game.reactor.manualReduceHeat();
  game.reactor.updateStats();
}

export function runSellPart(game, tile) {
  if (tile && tile.part) {
    const sellValue = tile.calculateSellValue();
    game.debugHistory.add("game", "sellPart", { row: tile.row, col: tile.col, partId: tile.part.id, value: sellValue });
    game.emit("vibrationRequest", { type: "heavy" });
    if (game.audio) game.audio.play("sell", null, game.calculatePan(tile.col));
    tile.sellPart();
  }
}

export function runEpartOnclick(game, purchased_upgrade) {
  if (!purchased_upgrade || !purchased_upgrade.upgrade || purchased_upgrade.level <= 0) return;
  game.upgradeset.getAllUpgrades().forEach((upg) => {
    if (upg.upgrade.type === "experimental_parts" && upg.upgrade.id !== purchased_upgrade.upgrade.id) {
      upg.updateDisplayCost();
    }
  });
}

export function buildFacts(game, engine, data) {
  const reactor = game.reactor;
  const maxHeat = toNumber(reactor.max_heat ?? 0);
  const reactorHeat = toNumber(reactor.current_heat ?? 0);
  const heatRatio = maxHeat > 0 ? reactorHeat / maxHeat : 0;
  const tickCount = data ? engine.tick_count + (data.tickCount || 1) - 1 : engine.tick_count;
  const us = game.upgradeset;
  const hasUpgrade = (id) => (us?.getUpgrade(id)?.level ?? 0) > 0;
  const upgrades = {};
  if (us?.upgradesArray) {
    for (const u of us.upgradesArray) {
      if (u?.id && (u.level ?? 0) > 0) upgrades[u.id] = u.level;
    }
  }
  return {
    reactorHeat,
    maxHeat,
    heatRatio,
    reactorPower: toNumber(reactor.current_power ?? 0),
    maxPower: toNumber(reactor.max_power ?? 0),
    tickCount,
    activeCells: engine.active_cells?.length ?? 0,
    activeVents: engine.active_vents?.length ?? 0,
    hasMeltedDown: reactor.has_melted_down ?? false,
    isPaused: game.paused ?? game.state?.pause ?? false,
    isSandbox: game.isSandbox ?? false,
    hasUpgrade,
    upgrades,
    _firstHighHeatSeen: game.state?._firstHighHeatSeen ?? false,
  };
}

function heatWarningPredicate(facts) {
  return facts.heatRatio >= CRITICAL_HEAT_RATIO && !facts.hasMeltedDown && !facts.isPaused;
}

function pipeIntegrityWarningPredicate(facts) {
  return (
    facts.heatRatio >= CRITICAL_HEAT_RATIO &&
    !facts.hasUpgrade("fractal_piping") &&
    !facts.hasMeltedDown &&
    !facts.isPaused
  );
}

function firstHighHeatPredicate(facts) {
  return facts.heatRatio >= 0.5 && !facts.hasMeltedDown && !facts.isPaused && !facts._firstHighHeatSeen;
}

export const rules = [
  { event: "heatWarning", predicate: heatWarningPredicate, throttleTicks: 30 },
  { event: "pipeIntegrityWarning", predicate: pipeIntegrityWarningPredicate, throttleTicks: 30 },
  { event: "firstHighHeat", predicate: firstHighHeatPredicate, oneShot: true, oneShotKey: "_firstHighHeatSeen" },
];
