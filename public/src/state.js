import { EngineStatus } from "./schema/stateSchemas.js";
import { safeCall, teardownAll } from "./core/teardown.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { leaderboardService } from "./services/leaderboard.js";
import {
  addPartIconsToTitle as addPartIconsToTitleHelper,
  getObjectiveScrollDuration as getObjectiveScrollDurationHelper,
} from "./components/objectives-ui.js";
import { resetHeatThresholdSignalState, clearHeatVisualStates } from "./domain/heat-signals.js";
import { setDecimal } from "./state/decimal-sync.js";
import { withHostEconomyHydrate, assertHostEconomyWrite } from "./state/economy-hydrate.js";
import { resetSessionCriticalityCounters, resetObjectives } from "./state/reboot.js";
import { calculateBaseDimensions } from "./domain/grid.js";
import { normalizeSavedTechTreeId } from "./schema/saveMigration.js";
import { BaseComponent } from "./dom/lit.js";
import { toNumber } from "./simUtils.js";
import { formatTime } from "./core/numbers.js";
import { logger } from "./core/logger.js";
import { requireActiveBridge } from "./bridge/active.js";
import { hydrateObjectivesIntoSession } from "./bridge/core-state-projection.js";
import { MOBILE_BREAKPOINT_PX } from "./constants/ui-constants.js";
import {
  DEFAULT_AUTOSAVE_INTERVAL_MS,
} from "./constants/balance.js";
import { recordSimEvent } from "./domain/sim-events.js";
import { enqueueClearAnimations, enqueueClearImageCache } from "./state/game-effects.js";
import { flushGameEffects } from "./state/game-effects-flush.js";
import { hudViewFromSnapshot, resolveSessionSnapshot } from "./components/shell/hud-from-snapshot.js";
import { bumpSnapshotRev } from "./state/snapshot-rev.js";

export {
  preferences,
  initPreferencesStore,
  getValidatedPreferences,
  getVolumePreferences,
  syncReducedMotionDOM,
} from "./state/preferences.js";
export {
  parseAndValidateSave,
} from "./domain/game-save.js";
export { showLoadBackupModal } from "./state/save-ui.js";
export { setDecimal } from "./state/decimal-sync.js";

const initNum = (val, fallback = 0) =>
  (val != null ? toNumber(val) : toNumber(fallback));

export function createGameState(initial = {}) {
  return {
    current_money: initNum(initial.current_money),
    current_power: initNum(initial.current_power),
    current_heat: initNum(initial.current_heat),
    current_exotic_particles: initNum(initial.current_exotic_particles),
    total_exotic_particles: initNum(initial.total_exotic_particles),
    session_power_produced: initNum(initial.session_power_produced),
    session_power_sold: initNum(initial.session_power_sold),
    session_heat_dissipated: initNum(initial.session_heat_dissipated),
    max_power: initial.max_power ?? 0,
    max_heat: initial.max_heat ?? 0,
    stats_power: initial.stats_power ?? 0,
    stats_heat_generation: initial.stats_heat_generation ?? 0,
    stats_vent: initial.stats_vent ?? 0,
    stats_inlet: initial.stats_inlet ?? 0,
    stats_outlet: initial.stats_outlet ?? 0,
    stats_net_heat: initial.stats_net_heat ?? 0,
    stats_total_part_heat: initial.stats_total_part_heat ?? 0,
    stats_cash: initial.stats_cash ?? 0,
    engine_status: initial.engine_status ?? EngineStatus.STOPPED,
    power_delta_per_tick: initial.power_delta_per_tick ?? 0,
    heat_delta_per_tick: initial.heat_delta_per_tick ?? 0,
    auto_sell: initial.auto_sell ?? false,
    auto_buy: initial.auto_buy ?? false,
    heat_control: initial.heat_control ?? false,
    pause: initial.pause ?? false,
    melting_down: initial.melting_down ?? false,
    active_objective: initial.active_objective ?? {
      title: "",
      index: 0,
      isComplete: false,
      isChapterCompletion: false,
      progressPercent: 0,
      hasProgressBar: false,
      checkId: null,
    },
    unlocked_achievements: initial.unlocked_achievements ?? [],
    power_overflow_to_heat_ratio: initial.power_overflow_to_heat_ratio ?? 1,
    manual_heat_reduce: initial.manual_heat_reduce ?? initial.base_manual_heat_reduce ?? 1,
    auto_sell_multiplier: initial.auto_sell_multiplier ?? 0,
    heat_controlled: initial.heat_controlled ?? false,
    hull_integrity: initial.hull_integrity ?? 100,
    failure_state: initial.failure_state ?? "nominal",
    meltdown_seq: initial.meltdown_seq ?? 0,
    prestige_seq: initial.prestige_seq ?? 0,
    last_prestige: initial.last_prestige ?? null,
    quick_select_slots: initial.quick_select_slots ?? [],
    base_max_heat: initial.base_max_heat ?? 0,
    base_max_power: initial.base_max_power ?? 0,
    effect_queue: [],
    sim_event_queue: [],
    intent_queue: [],
  };
}

export { enqueueAndDrain } from "./state/game-effects-flush.js";
export { withHostEconomyHydrate, assertHostEconomyWrite } from "./state/economy-hydrate.js";
export { patchGameState } from "./state/patch-game-state.js";
export { applyToggleStateChange } from "./state/toggle-state.js";

export { EngineStatus } from "./schema/stateSchemas.js";
export { createUIState, initUIStateSubscriptions, applyBodyClassesFromUiState, buildShellClassMap, buildShellStyleMap, shellHeatRatioAttr, resolveTileFromKey, tileKey, modalUi, pwaState } from "./state/ui-state.js";

export class StateManager extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.quickSelectSlots = Array.from({ length: 5 }, () => ({ partId: null, locked: false }));
    this._stateUnsubscribes = [];
  }
  teardown() {
    const unsubs = this._stateUnsubscribes;
    if (unsubs.length) {
      teardownAll(unsubs);
      unsubs.length = 0;
    }
  }
  setGame(gameInstance) {
    this.teardown();
    this.game = gameInstance;
    if (this.ui) this.ui._firstFrameSyncDone = false;
    if (!gameInstance?.state) return;
    this.setupStateSubscriptions();
  }

  setupStateSubscriptions() {
    this.teardown();
    const unsubs = this._stateUnsubscribes;
    const ui = this.ui;
    const uiState = ui?.uiState;
    if (!this.game || !uiState) return;
    let lastPause = null;
    let lastMelting = null;
    const runFromSnapshot = () => {
      const g = this.game;
      if (!g || !ui.stateManager || ui.stateManager !== this) return;
      const view = hudViewFromSnapshot(resolveSessionSnapshot(g), g);
      const config = ui.var_objs_config;
      if (config?.pause?.onupdate && view.pause !== lastPause) {
        lastPause = view.pause;
        config.pause.onupdate(view.pause);
      }
      if (config?.melting_down?.onupdate && view.melting_down !== lastMelting) {
        lastMelting = view.melting_down;
        config.melting_down.onupdate(view.melting_down);
      }
      ui.deviceFeatures?.updateAppBadge?.();
      try {
        g.partset?.check_affordability?.(g);
        g.upgradeset?.check_affordability?.(g);
        if (ui.tooltipManager) ui.tooltipManager.updateUpgradeAffordability?.();
        uiState.has_affordable_upgrades = g.upgradeset?.hasAffordableUpgrades?.() ?? false;
        uiState.has_affordable_research = g.upgradeset?.hasAffordableResearch?.() ?? false;
        ui.updateNavIndicators?.();
        if (typeof ui.updateQuickSelectSlots === "function") ui.updateQuickSelectSlots();
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };
    unsubs.push(subscribeKey(uiState, "snapshot_rev", runFromSnapshot));
    ui.deviceFeatures?.updateAppBadge?.();
    runFromSnapshot();
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.ui?.uiState?.interaction) {
      this.ui.uiState.interaction.selectedPartId = part?.id ?? null;
    }
    bumpSnapshotRev(this.game);
    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile && part && !skipOpenPanel) {
      const uiState = this.ui?.uiState;
      if (uiState) uiState.parts_panel_collapsed = false;
      this.ui.updatePartsPanelBodyClass();
    }
    if (part) {
      const inQuickSelect = this.getQuickSelectSlots().some((s) => s.partId === part.id);
      if (!inQuickSelect) this.pushLastUsedPart(part);
    }
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.gridInteractionUI.clearSegmentHighlight();
    }
  }
  getClickedPart() {
    return this.clicked_part;
  }

  syncQuickSelectSlotsToGameState() {
    if (!this.game?.state) return;
    this.game.state.quick_select_slots = this.getQuickSelectSlots();
  }

  pushLastUsedPart(part) {
    const id = part?.id;
    if (!id) return;
    const slots = this.quickSelectSlots;
    const seen = new Set();
    const order = [id, ...slots.map((s) => s.partId).filter(Boolean).filter((pid) => {
      if (pid === id || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    })].slice(0, 5);
    const lockedPartIds = new Set(slots.map((s, i) => slots[i].locked && s.partId).filter(Boolean));
    const available = order.filter((pid) => !lockedPartIds.has(pid));
    for (let i = 0; i < 5; i++) {
      if (slots[i].locked) continue;
      slots[i].partId = available.shift() ?? null;
    }
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
    this.syncQuickSelectSlotsToGameState();
  }

  getQuickSelectSlots() {
    return this.quickSelectSlots.map((s) => ({ partId: s.partId, locked: s.locked }));
  }

  normalizeQuickSelectSlotsForUnlock() {
    const unlockManager = this.game?.unlockManager;
    if (!this.game?.partset || !unlockManager) return;
    for (let i = 0; i < this.quickSelectSlots.length; i++) {
      const s = this.quickSelectSlots[i];
      if (!s.partId) continue;
      const part = this.game.partset.getPartById(s.partId);
      if (!part || !unlockManager.isPartUnlocked(part)) {
        this.quickSelectSlots[i] = { partId: null, locked: false };
      }
    }
  }

  setQuickSelectLock(index, locked) {
    if (index < 0 || index > 4) return;
    this.quickSelectSlots[index].locked = locked;
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
    this.syncQuickSelectSlotsToGameState();
  }

  setQuickSelectSlots(slots, options = {}) {
    const normalized = Array.from({ length: 5 }, (_, i) => {
      const s = slots?.[i];
      return {
        partId: s?.partId ?? null,
        locked: !!s?.locked,
      };
    });
    this.quickSelectSlots = normalized;
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
    if (!options.skipStateSync) this.syncQuickSelectSlotsToGameState();
  }

  updatePartsPanelToggleIcon(_part) {}

  handleObjectiveCompleted() {
    const objectives = this.ui.objectivesUI;
    if (objectives?.markComplete) objectives.markComplete();
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    tile.tile_index = tile.row * game.max_cols + tile.col;
  }
  game_reset() {
    if (this.game?.state) {
      withHostEconomyHydrate(this.game, () => {
        setDecimal(this.game.state, "current_money", this.game.base_money);
        setDecimal(this.game.state, "current_power", 0);
        setDecimal(this.game.state, "current_heat", 0);
      });
      this.game.coreBridge?.hydrateFromHost?.();
      this.game.reactor.updateStats();
    }
    safeCall(() => {
      if (this.game) {
        this.game.placedCounts = {};
        const bridge = this.game.coreBridge;
        if (bridge?.session?.clearPlacedCounts) {
          bridge.session.clearPlacedCounts();
          this.game.placedCounts = { ...(bridge.session.placedCounts || {}) };
        }
      }
    }, "game_reset gating");
  }

  getAllVars() {
    return { ...this.game?.state };
  }

  // Function to add part icons to objective titles
  addPartIconsToTitle(title) {
    return addPartIconsToTitleHelper(this.game, title);
  }

  handleObjectiveLoaded(objective, objectiveIndex = null) {
    const isNewGame = objectiveIndex === 0 && !this.game?._saved_objective_index;
    if (isNewGame && this.ui.uiState) {
      this.ui.uiState.objectives_toast_expanded = true;
    }
    if (objective?.title) {
      setTimeout(() => this.checkObjectiveTextScrolling(), 0);
    }
  }

  getObjectiveScrollDuration() {
    return getObjectiveScrollDurationHelper();
  }

  checkObjectiveTextScrolling() {
    this.ui.objectivesUI?.checkTextScrolling?.();
  }
}




function applyBaseDimensions(game, dimensions) {
  game.base_cols = dimensions.base_cols;
  game.base_rows = dimensions.base_rows;
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
}

function applyBaseResources(game) {
  withHostEconomyHydrate(game, () => {
    setDecimal(game.state, "current_money", game.base_money);
    game.protium_particles = 0;
    setDecimal(game.state, "total_exotic_particles", 0);
    game.exoticParticleManager.exotic_particles = 0;
    setDecimal(game.state, "current_exotic_particles", 0);
  });
  resetSessionCriticalityCounters(game);
  game.sold_power = false;
  game.sold_heat = false;
  game.coreBridge?.hydrateFromHost?.();
}

async function resetSubsystems(game, bypass, preservedTechTree) {
  game.reactor.setDefaults();
  game.upgradeset.reset();
  game.partset.reset();
  game.tech_tree = normalizeSavedTechTreeId(preservedTechTree ?? null);
  await game.partset.initialize();
  await game.upgradeset.initialize();
  game.bypass_tech_tree_restrictions = bypass;
}

function refreshAllPartStatsForGame(game) {
  game.upgradeset.check_affordability(game);
}

function applyPlacementState(game) {
  game.placedCounts = {};
  const bridge = game.coreBridge;
  if (bridge?.session?.clearPlacedCounts) {
    bridge.session.clearPlacedCounts();
    game.placedCounts = { ...(bridge.session.placedCounts || {}) };
  }
}

function clearTilesThenVisuals(game) {
  game.tileset.clearAllTiles();
  enqueueClearImageCache(game);
  game.reactor.updateStats();
  clearHeatVisualStates(game);
  enqueueClearAnimations(game);
  flushGameEffects(game);
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
  if (game.state) game.state.pause = false;
  const session = game.coreBridge?.session;
  if (session) {
    if (typeof session.setPaused === "function") session.setPaused(false);
    else if (session.toggles) session.toggles.pause = false;
  }
  bumpSnapshotRev(game);
}

function applyLoopThenPause(game) {
  setLoopWait(game);
  setPausedState(game);
}

function resetSessionTimes(game) {
  game.lifecycleManager.session_start_time = null;
  game.lifecycleManager.total_played_time = 0;
  game.lifecycleManager.last_save_time = null;
}

function applyDoctrineThenSession(game) {
  resetSessionTimes(game);
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

function validateObjectiveStateIfNeeded(game) {
  if (game._saved_objective_index !== undefined) {
    logger.log("debug", "game", "Validating objective state after default set");
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
  game.syncModifiersFromUpgrades();
  refreshAllPartStatsForGame(game);
  applyPlacementThenTiles(game);
  applyLoopThenPause(game);
  applyDoctrineThenSession(game);
  resetObjectives(game);
  validateObjectiveStateIfNeeded(game);
  resetHeatThresholdSignalState(game);
}

export class LifecycleManager {
  constructor(game) {
    this.game = game;
    this.session_start_time = null;
    this.last_save_time = null;
    this.total_played_time = 0;
  }

  async initialize_new_game_state() {
    await this.game.set_defaults();
    this.game.run_id = crypto.randomUUID();
    this.game.cheats_used = false;
    this.game.reactor.clearMeltdownState();
    hydrateObjectivesIntoSession(this.game.coreBridge);
    initLeaderboardSafe();
    enqueueClearAnimations(this.game);
    flushGameEffects(this.game);
    setDecimal(this.game.state, "current_money", this.game.base_money);
    this.game.state.stats_cash = this.game.state.current_money;
    this.game.coreBridge?.hydrateFromHost?.();
    this.game.onToggleStateChange?.("auto_sell", false);
    this.game.onToggleStateChange?.("auto_buy", false);
    const defaultQuickSelectIds = ["uranium1", "vent1", "heat_exchanger1", "heat_outlet1", "capacitor1"];
    const slots = defaultQuickSelectIds.map((partId) => ({ partId, locked: false }));
    this.game.state.quick_select_slots = slots;
    this.game.ui?.stateManager?.setQuickSelectSlots(slots, { skipStateSync: true });
    this.game.state.unlocked_achievements = [];
    this.game.achievement_manager?.restore?.([]);
  }

  async startSession() {
    this.session_start_time = Date.now();
    if (!this.last_save_time) this.last_save_time = Date.now();
    initLeaderboardSafe();
    await this.game.objectives_manager.initialize();
    if (this.game.achievement_manager) {
      await this.game.achievement_manager.initialize();
    }
    if (this.game._saved_objective_index === undefined) {
      this.game.objectives_manager.set_objective(0, true);
    }
    this.game.reactor.updateStats();
    this.game.upgradeset.check_affordability(this.game);
  }

  updateSessionTime() {
    if (this.session_start_time) {
      this.total_played_time += Date.now() - this.session_start_time;
      this.session_start_time = Date.now();
    }
    const reactor = this.game.reactor;
    if (reactor) {
      if (reactor.current_power > this.game.peak_power) this.game.peak_power = reactor.current_power;
      if (reactor.current_heat > this.game.peak_heat) this.game.peak_heat = reactor.current_heat;
    }
  }

  getFormattedTotalPlayedTime() {
    let totalTime = this.total_played_time;
    if (this.session_start_time) totalTime += Date.now() - this.session_start_time;
    return formatTime(totalTime);
  }
}

const gameConfigStore = new WeakMap();

export function getGameConfiguration(game) {
  const stored = gameConfigStore.get(game) ?? {};
  return {
    gameSpeed: game.loop_wait,
    autoSave: stored.autoSave ?? true,
    soundEnabled: stored.soundEnabled ?? true,
    autoSaveInterval: stored.autoSaveInterval ?? DEFAULT_AUTOSAVE_INTERVAL_MS,
  };
}

export function setGameConfiguration(game, config) {
  if (!config) return;
  if (config.gameSpeed !== undefined) game.loop_wait = config.gameSpeed;
  const prev = gameConfigStore.get(game) ?? {};
  gameConfigStore.set(game, { ...prev, ...config });
}

export class ExoticParticleManager {
  constructor(game) {
    this.game = game;
    this._exotic_particles = 0;
  }

  get total_exotic_particles() {
    return toNumber(this.game.state.total_exotic_particles ?? 0);
  }

  set total_exotic_particles(v) {
    assertHostEconomyWrite(this.game, "total_exotic_particles");
    setDecimal(this.game.state, "total_exotic_particles", v);
  }

  get exotic_particles() {
    return this._exotic_particles;
  }

  set exotic_particles(v) {
    assertHostEconomyWrite(this.game, "exotic_particles");
    this._exotic_particles = toNumber(v);
  }

  get current_exotic_particles() {
    return toNumber(this.game.state.current_exotic_particles ?? 0);
  }

  set current_exotic_particles(v) {
    assertHostEconomyWrite(this.game, "current_exotic_particles");
    setDecimal(this.game.state, "current_exotic_particles", v);
  }

  grantCheatExoticParticle(amount = 1) {
    const bridge = requireActiveBridge(this.game, "grantCheatExoticParticle");
    const n = toNumber(amount);
    this.game.markCheatsUsed();
    if (!(n > 0)) return;
    bridge.session.creditExoticParticles(n);
    bridge.routeEvents();
    bridge.projectToGame(bridge.session.engine.getLastResult());
  }
}

export function runSellAction(game) {
  const bridge = requireActiveBridge(game, "runSellAction");
  if (!(toNumber(bridge.session.grid.currentPower) > 0)) return;
  const { ok } = bridge.dispatch({ type: "SELL_POWER" });
  if (!ok) return;
  game.reactor?.updateStats?.({ fromSession: true });
}

export function runManualReduceHeatAction(game) {
  logger.log("debug", "game", "Manual heat reduction");
  recordSimEvent(game, { type: "MANUAL_HEAT_REDUCE" });
  flushGameEffects(game);
  const bridge = requireActiveBridge(game, "runManualReduceHeatAction");
  if (!(toNumber(bridge.session.grid.currentHeat) > 0)) return;
  const { ok } = bridge.dispatch({ type: "VENT_HEAT" });
  if (ok) game.reactor?.updateStats?.({ fromSession: true });
}

