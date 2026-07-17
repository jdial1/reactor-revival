import { EngineStatus } from "./schema/stateSchemas.js";
import { safeCall, teardownAll } from "./core/teardown.js";
import { derive } from "./state/derive.js";
import { render } from "lit-html";
import { subscribe, proxy, ref, snapshot } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { calculateWeaveEp } from "reactor-core";
import { leaderboardService } from "./services/leaderboard.js";
import {
  addPartIconsToTitle as addPartIconsToTitleHelper,
  getObjectiveScrollDuration as getObjectiveScrollDurationHelper,
} from "./components/objectives-ui.js";
import { isHeatNetBalanced, resetHeatThresholdSignalState, syncReactorHeatVisualDom } from "./components/shell/heat-dom-sync.js";
import { preferences } from "./state/preferences.js";
import { saveGameMutation } from "./state/save-query.js";
import { setDecimal, updateDecimal } from "./state/decimal-sync.js";
import { calculateBaseDimensions } from "./domain/grid.js";
import { normalizeSavedTechTreeId } from "./domain/game-save.js";
import { StorageUtils,
  StorageAdapter,
  deserializeSave,
  getBackupSaveForSlot1Async,
  serializeSave,
  rotateSlot1ToBackup,
} from "./storage/index.js";
import { BaseComponent } from "./dom/lit.js";
import { toDecimal, toNumber } from "./simUtils.js";
import { logger } from "./core/logger.js";
import { getActiveBridge, requireActiveBridge } from "./bridge/active.js";
import { MOBILE_BREAKPOINT_PX } from "./constants/ui-constants.js";
import {
  OVERRIDE_DURATION_MS,
  HEAT_POWER_LOG_CAP,
  HEAT_POWER_LOG_BASE,
  DEFAULT_AUTOSAVE_INTERVAL_MS,
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
  BASE_MAX_POWER,
  BASE_MAX_HEAT,
  WEAVE_QUANTUM,
} from "./constants/balance.js";
import { recordSimEvent } from "./domain/sim-events.js";
import { drainGameEffects } from "./effect-orchestrator.js";
import { enqueueGameEffect, enqueueClearAnimations, enqueueClearImageCache } from "./state/game-effects.js";
import {
  NumericLike,
  DecimalLike,
  GridCoordinate,
  DecimalSchema,
  SaveDecimalSchema,
  ObjectiveIndexSchema,
  NumericToNumber,
  TechTreeDoctrineSchema,
  TechTreeSchema,
  ObjectiveDefinitionSchema,
  ObjectiveListSchema,
  GameDimensionsSchema,
  DifficultyPresetSchema,
  HelpTextSchema,
  VersionSchema,
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TileSchema,
  SaveDataSchema,
  BlueprintSchema,
  LegacyGridSchema,
  UserPreferencesSchema,
  BalanceConfigSchema,
  SaveDataWriteSchema,
} from "./schema/index.js";
import { SAVE_FORMAT_VERSION_LATEST, buildPartTable, encodeTilesCompact, migrateSave } from "./schema/saveMigration.js";

export {
  NumericLike,
  DecimalLike,
  GridCoordinate,
  DecimalSchema,
  SaveDecimalSchema,
  ObjectiveIndexSchema,
  NumericToNumber,
  TechTreeDoctrineSchema,
  TechTreeSchema,
  ObjectiveDefinitionSchema,
  ObjectiveListSchema,
  GameDimensionsSchema,
  DifficultyPresetSchema,
  HelpTextSchema,
  VersionSchema,
  PartDefinitionSchema,
  UpgradeDefinitionSchema,
  TileSchema,
  SaveDataSchema,
  SaveDataWriteSchema,
  BlueprintSchema,
  LegacyGridSchema,
  UserPreferencesSchema,
  BalanceConfigSchema,
};

export {
  preferences,
  initPreferencesStore,
  getValidatedPreferences,
  getVolumePreferences,
  getAffordabilitySettings,
  syncReducedMotionDOM,
} from "./state/preferences.js";
export { fetchResolvedSaves, saveGameMutation } from "./state/save-query.js";
export {
  parseAndValidateSave,
  applySaveState,
  normalizeSavedTechTreeId,
  GameSaveManager,
} from "./domain/game-save.js";
export { showLoadBackupModal } from "./state/save-ui.js";
export { setDecimal, updateDecimal, syncReactorToUIState } from "./state/decimal-sync.js";
export { Reactor } from "./domain/reactor.js";
export { GridManager, calculateBaseDimensions } from "./domain/grid.js";

const initDec = (val, fallback = 0) =>
  ref(val != null ? (typeof val?.gte === "function" ? val : toDecimal(val)) : toDecimal(fallback));

export function createGameState(initial = {}) {
  const baseState = proxy({
    current_money: initDec(initial.current_money),
    current_power: initDec(initial.current_power),
    current_heat: initDec(initial.current_heat),
    current_exotic_particles: initDec(initial.current_exotic_particles),
    total_exotic_particles: initDec(initial.total_exotic_particles),
    session_power_produced: initDec(initial.session_power_produced),
    session_power_sold: initDec(initial.session_power_sold),
    session_heat_dissipated: initDec(initial.session_heat_dissipated),
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
    manual_override_mult: initial.manual_override_mult ?? 0,
    override_end_time: initial.override_end_time ?? 0,
    power_to_heat_ratio: initial.power_to_heat_ratio ?? 0,
    active_objective: initial.active_objective ?? {
      title: "",
      index: 0,
      isComplete: false,
      isChapterCompletion: false,
      progressPercent: 0,
      hasProgressBar: false,
      checkId: null,
    },
    active_buffs: initial.active_buffs ?? [],
    unlocked_achievements: initial.unlocked_achievements ?? [],
    parts_panel_version: initial.parts_panel_version ?? 0,
    upgrade_display: initial.upgrade_display ?? {},
    power_overflow_to_heat_ratio: initial.power_overflow_to_heat_ratio ?? 1,
    manual_heat_reduce: initial.manual_heat_reduce ?? initial.base_manual_heat_reduce ?? 1,
    auto_sell_multiplier: initial.auto_sell_multiplier ?? 0,
    heat_controlled: initial.heat_controlled ?? false,
    hull_integrity: initial.hull_integrity ?? 100,
    failure_state: initial.failure_state ?? "nominal",
    engine_tick_count: initial.engine_tick_count ?? 0,
    meltdown_seq: initial.meltdown_seq ?? 0,
    prestige_seq: initial.prestige_seq ?? 0,
    last_prestige: initial.last_prestige ?? null,
    quick_select_slots: initial.quick_select_slots ?? [],
    base_max_heat: initial.base_max_heat ?? 0,
    base_max_power: initial.base_max_power ?? 0,
    effect_queue: [],
    sim_event_queue: [],
    objective_notifications: proxy([]),
    ui_heat_critical: initial.ui_heat_critical ?? false,
    ui_pipe_integrity_warning: initial.ui_pipe_integrity_warning ?? false,
    active_vent_count: initial.active_vent_count ?? 0,
    active_exchanger_count: initial.active_exchanger_count ?? 0,
  });

  derive({
    power_net_change: (get) => {
      const v = get(baseState).core_power_net_change;
      return typeof v === "number" && !Number.isNaN(v) ? v : 0;
    },
    session_ep_weave: (get) => {
      const state = get(baseState);
      return calculateWeaveEp(
        state.session_power_produced ?? 0,
        state.session_heat_dissipated ?? 0,
        WEAVE_QUANTUM,
      );
    },
    heat_net_change: (get) => {
      const v = get(baseState).core_heat_net_change;
      return typeof v === "number" && !Number.isNaN(v) ? v : 0;
    },
    heat_ratio: (get) => {
      const state = get(baseState);
      const ch = toNumber(state.current_heat ?? 0);
      const mh = Math.max(1e-12, toNumber(state.max_heat ?? 1));
      return ch / mh;
    },
    heat_balanced: (get) => {
      const state = get(baseState);
      return isHeatNetBalanced(state.stats_net_heat, state.stats_heat_generation);
    },
  }, { proxy: baseState });

  return baseState;
}

export { enqueueGameEffect } from "./state/game-effects.js";

const PATCH_TOGGLE_KEYS = new Set(["pause", "auto_sell", "auto_buy", "heat_control"]);
const PATCH_DECIMAL_KEYS = new Set([
  "current_heat",
  "current_power",
  "current_money",
  "current_exotic_particles",
  "total_exotic_particles",
  "session_power_produced",
  "session_power_sold",
  "session_heat_dissipated",
]);

export function patchGameState(game, patch) {
  if (!game?.state || !patch || typeof patch !== "object") return;
  const st = game.state;
  for (const [key, value] of Object.entries(patch)) {
    if (key === "exotic_particles") {
      if (game.exoticParticleManager) {
        withHostEconomyHydrate(game, () => {
          game.exoticParticleManager.exotic_particles = value;
        });
      }
      continue;
    }
    if (key === "total_heat") {
      st.stats_heat_generation = value;
      continue;
    }
    let v = value;
    if (PATCH_TOGGLE_KEYS.has(key)) v = Boolean(v);
    const oldValue = st[key];
    const isDecimalKey = PATCH_DECIMAL_KEYS.has(key);
    if (!isDecimalKey && oldValue === v) continue;
    if (isDecimalKey || (v != null && typeof v?.gte === "function")) {
      setDecimal(st, key, v);
    } else {
      st[key] = v;
    }
    if (PATCH_TOGGLE_KEYS.has(key)) game.onToggleStateChange?.(key, st[key]);
  }
}

export { snapshot, subscribe, subscribeKey };
export { EngineStatus } from "./schema/stateSchemas.js";
export { createUIState, initUIStateSubscriptions, applyBodyClassesFromUiState, buildShellClassMap, buildShellStyleMap, resolveTileFromKey, tileKey, modalUi, pwaState } from "./state/ui-state.js";

export { BaseComponent };
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
    const state = this.game?.state;
    const ui = this.ui;
    const config = ui?.var_objs_config;
    if (!state || !config) return;
    const getDisplayValue = (key) => {
      if (key === "exotic_particles") return this.game?.exoticParticleManager?.exotic_particles;
      return this.game?.state?.[key];
    };
    const stateKeyMap = {
      total_heat: "stats_heat_generation",
    };
    for (const configKey of Object.keys(config)) {
      const stateKey = stateKeyMap[configKey] ?? configKey;
      if (state[stateKey] === undefined) continue;
      const cfg = config[configKey];
      if (!cfg?.onupdate) continue;
      const unsub = subscribeKey(state, stateKey, () => {
        const val = getDisplayValue(configKey);
        if (val !== undefined) cfg.onupdate(val);
      });
      unsubs.push(unsub);
    }
    if (state.engine_status !== undefined) {
      unsubs.push(subscribeKey(state, "engine_status", (val) => {
        if (val === EngineStatus.TICK) {
          setTimeout(() => {
            const g = this.game;
            const status = g?.engine?.running ? (g?.paused ? EngineStatus.PAUSED : EngineStatus.RUNNING) : EngineStatus.STOPPED;
            this.game.state.engine_status = status;
          }, 100);
        }
      }));
    }
    const heatKeys = ["current_heat", "max_heat"];
    for (const key of heatKeys) {
      if (state[key] !== undefined) {
        unsubs.push(subscribeKey(state, key, () => {
          const hr = ui.game?.state?.heat_ratio;
          const ratio = typeof hr === "number" && Number.isFinite(hr) ? hr : 0;
          ui.heatVisualsUI?._applyHeatFromRatio?.(ratio);
          ui.deviceFeatures?.updateAppBadge?.();
        }));
      }
    }
    if (state.pause !== undefined) {
      unsubs.push(subscribeKey(state, "pause", () => ui.deviceFeatures?.updateAppBadge?.()));
    }
    ui.deviceFeatures?.updateAppBadge?.();
    const runAffordabilityCascade = () => {
      const g = this.game;
      if (!g || !ui.stateManager || ui.stateManager !== this) return;
      try {
        const moneyVal = g.state?.current_money;
        const epVal = g.state?.current_exotic_particles;
        if (ui.last_money !== undefined) ui.last_money = moneyVal;
        if (ui.last_exotic_particles !== undefined) ui.last_exotic_particles = epVal;
        g.partset?.check_affordability?.(g);
        g.upgradeset?.check_affordability?.(g);
        if (ui.tooltipManager) ui.tooltipManager.updateUpgradeAffordability?.();
        if (ui.uiState) {
          ui.uiState.has_affordable_upgrades = g.upgradeset?.hasAffordableUpgrades?.() ?? false;
          ui.uiState.has_affordable_research = g.upgradeset?.hasAffordableResearch?.() ?? false;
        }
        ui.updateNavIndicators?.();
        if (typeof ui.updateQuickSelectSlots === "function") ui.updateQuickSelectSlots();
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };
    if (state.current_money !== undefined) {
      unsubs.push(subscribeKey(state, "current_money", runAffordabilityCascade));
    }
    if (state.current_exotic_particles !== undefined) {
      unsubs.push(subscribeKey(state, "current_exotic_particles", runAffordabilityCascade));
    }
    runAffordabilityCascade();
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.ui?.uiState?.interaction) {
      this.ui.uiState.interaction.selectedPartId = part?.id ?? null;
    }
    if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
      this.game.state.parts_panel_version++;
    }
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
  handleUpgradeAdded(game, upgrade_obj) {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    if (expandUpgradeIds.includes(upgrade_obj.upgrade.id)) {
      return;
    }
    const normalizeKey = (key) => {
      const map = {
        cell_power: "cell_power_upgrades",
        cell_tick: "cell_tick_upgrades",
        cell_perpetual: "cell_perpetual_upgrades",
        exchangers: "exchanger_upgrades",
        vents: "vent_upgrades",
        other: "other_upgrades",
      };
      return map[key] || key;
    };
    const locationKey = normalizeKey(upgrade_obj.upgrade.type);
    if (!this.ui.getUpgradeContainer?.(locationKey)) {
      if (this.debugMode) {
        logger.log('warn', 'game', `Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
      }
      return;
    }
    const upgradeEl = upgrade_obj.createElement();
    if (upgradeEl) {
      upgradeEl.upgrade_object = upgrade_obj;
      this.ui.appendUpgrade(locationKey, upgradeEl);
    }
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
      this.game.coreBridge?.loadEconomyFromHost?.();
      this.game.reactor.updateStats();
    }
    safeCall(() => {
      if (this.game) {
        this.game.placedCounts = {};
        this.game.coreBridge?.clearPlacedCounts?.();
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
    if (!objective?.completed) {
      const toastBtn = this.ui.getUiElement?.("objectives_toast_btn") ?? (typeof document !== "undefined" ? document.getElementById("objectives_toast_btn") : null);
      if (toastBtn) toastBtn.classList.remove("is-complete", "objective-completed");
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


export class UnlockManager {
  constructor(game) {
    this.game = game;
  }

  getPlacedCount(type, level) {
    return requireActiveBridge(this.game, "getPlacedCount").getPlacedCount(type, level);
  }

  incrementPlacedCount(type, level) {
    requireActiveBridge(this.game, "incrementPlacedCount").incrementPlacedCount(type, level);
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
      partset: this.game.partset,
      getPlacedCount: (type, level) => this.getPlacedCount(type, level),
      _unlockStates: this.game._unlockStates,
      logger: this.game.logger,
    });
  }
}

export function resetSessionCriticalityCounters(game) {
  if (!game?.state) return;
  setDecimal(game.state, "session_power_produced", 0);
  setDecimal(game.state, "session_power_sold", 0);
  setDecimal(game.state, "session_heat_dissipated", 0);
}

function clearState(game) {
  game.reactor.clearMeltdownState();
  game.reactor.current_heat = 0;
  game.reactor.current_power = 0;
  enqueueClearAnimations(game);
}

function refreshUI(game) {
  game.reactor.updateStats();
  game.emit?.("partsPanelRefresh");
}

function refreshObjective(game) {
  if (game.objectives_manager) game.objectives_manager.check_current_objective();
}

async function runCoreKeepEpPrestige(game, bridge) {
  const savedProtium = game.protium_particles;
  const result = bridge.prestige();
  game.protium_particles = savedProtium;
  const epFromWeave = result?.earned ?? 0;
  withHostEconomyHydrate(game, () => {
    game.exoticParticleManager.exotic_particles = toDecimal(epFromWeave);
  });
  clearState(game);
  resetObjectives(game);
  bridge.hydrateObjectivesFromGame?.();
  game.state.last_prestige = {
    keepEp: true,
    epFromWeave,
    fuelCellCount: result?.fuelCellCount ?? 0,
    sessionPowerProduced: result?.sessionPowerProduced ?? 0,
    sessionHeatDissipated: result?.sessionHeatDissipated ?? 0,
  };
  game.state.prestige_seq = (game.state.prestige_seq ?? 0) + 1;
  refreshUI(game);
  refreshObjective(game);
}

async function runCoreDiscardEpReboot(game, bridge) {
  const savedProtium = game.protium_particles;
  bridge.reboot({ keepEp: false });
  game.protium_particles = savedProtium;
  withHostEconomyHydrate(game, () => {
    game.exoticParticleManager.exotic_particles = toDecimal(0);
  });
  clearState(game);
  resetObjectives(game);
  bridge.hydrateObjectivesFromGame?.();
  refreshUI(game);
  refreshObjective(game);
}

async function runRebootActionInternal(game, keep_exotic_particles) {
  logger.log("debug", "game", "Reboot action initiated", { keep_exotic_particles });
  recordSimEvent(game, { type: "PRESTIGE_REBOOT_TRIGGERED" });
  drainGameEffects(game, () => game?.ui);
  const bridge = requireActiveBridge(game, "reboot");
  if (keep_exotic_particles) await runCoreKeepEpPrestige(game, bridge);
  else await runCoreDiscardEpReboot(game, bridge);
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
  game.gridManager.setRows(game.base_rows);
  game.gridManager.setCols(game.base_cols);
  if (game._test_grid_size) {
    game.gridManager.setRows(game._test_grid_size.rows);
    game.gridManager.setCols(game._test_grid_size.cols);
  }
  const bridge = requireActiveBridge(game, "runFullReboot");
  if (bridge.session.grid.rows !== game.rows || bridge.session.grid.cols !== game.cols) {
    bridge.session.grid.resize(game.rows, game.cols);
  }
  bridge.hardReset();
  resetSessionCriticalityCounters(game);
  if (game.reactor) {
    game.state.melting_down = false;
    game.reactor.updateStats();
  }
  game.syncModifiersFromUpgrades();
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
    game.exoticParticleManager.exotic_particles = toDecimal(0);
    setDecimal(game.state, "current_exotic_particles", 0);
  });
  resetSessionCriticalityCounters(game);
  game.sold_power = false;
  game.sold_heat = false;
  game.coreBridge?.loadEconomyFromHost?.();
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
  if (game.partset?.partsArray?.length) {
    game.partset.partsArray.forEach((part) => {
      safeCall(() => { part.recalculate_stats(); });
    });
  }
  game.upgradeset.check_affordability(game);
}

function applyPlacementState(game) {
  game.placedCounts = {};
  game.coreBridge?.clearPlacedCounts?.();
}

function clearTilesThenVisuals(game) {
  game.tileset.clearAllTiles();
  enqueueClearImageCache(game);
  game.reactor.updateStats();
  game.reactor.clearHeatVisualStates();
  enqueueClearAnimations(game);
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

function resetSessionTimes(game) {
  game.lifecycleManager.session_start_time = null;
  game.lifecycleManager.total_played_time = 0;
  game.lifecycleManager.last_save_time = null;
}

function applyDoctrineThenSession(game) {
  resetSessionTimes(game);
}

function resetObjectives(game) {
  if (game.objectives_manager) {
    game.objectives_manager.teardown?.();
    game.objectives_manager.current_objective_index = 0;
    if (game.objectives_manager.objectives_data?.length) {
      game.objectives_manager.objectives_data.forEach((obj) => {
        obj.completed = false;
      });
      game.objectives_manager.set_objective(0, true);
    }
    game.coreBridge?.hydrateObjectivesFromGame?.();
  }
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
    this.game.coreBridge?.syncGridFromGame?.();
    this.game.coreBridge?.hydrateObjectivesFromGame?.();
    initLeaderboardSafe();
    enqueueClearAnimations(this.game);
    setDecimal(this.game.state, "current_money", this.game.base_money);
    this.game.state.stats_cash = this.game.state.current_money;
    this.game.coreBridge?.loadEconomyFromHost?.();
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
    this.game.timeKeeper.updateSessionTime();
  }

  getFormattedTotalPlayedTime() {
    return this.game.timeKeeper.getFormattedTotalPlayedTime();
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

export function withHostEconomyHydrate(game, fn) {
  if (!game) return fn();
  game._hostEconomyWrite = (game._hostEconomyWrite | 0) + 1;
  try {
    return fn();
  } finally {
    game._hostEconomyWrite = Math.max(0, (game._hostEconomyWrite | 0) - 1);
  }
}

export function assertHostEconomyWrite(game, label) {
  if (game?._hostEconomyWrite || game?._isRestoringSave) return;
  if (typeof process !== "undefined" && process.env?.VITEST) return;
  throw new Error(`Host economy write outside hydrate: ${label}`);
}

export function applyToggleStateChange(game, toggleName, value) {
  if (game.state && game.state[toggleName] !== value) game.state[toggleName] = value;
  if (toggleName === "heat_control" && game.reactor) game.reactor.heat_controlled = !!value;
  const bridge = getActiveBridge(game);
  if (bridge?.session?.toggles && toggleName in bridge.session.toggles) {
    bridge.session.toggles[toggleName] = !!value;
  }
  if (toggleName !== "pause") return;
  game.paused = value;
  if (game.router?.navigationPaused && !game.router.isNavigating) game.router.navigationPaused = false;
  if (!game.engine) return;
  if (value) game.engine.stop();
  else game.engine.start();
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
    assertHostEconomyWrite(this.game, "total_exotic_particles");
    setDecimal(this.game.state, "total_exotic_particles", ensureDecimal(v));
  }

  get exotic_particles() {
    return this._exotic_particles;
  }

  set exotic_particles(v) {
    assertHostEconomyWrite(this.game, "exotic_particles");
    this._exotic_particles = ensureDecimal(v);
  }

  get current_exotic_particles() {
    return this.game.state.current_exotic_particles;
  }

  set current_exotic_particles(v) {
    assertHostEconomyWrite(this.game, "current_exotic_particles");
    setDecimal(this.game.state, "current_exotic_particles", ensureDecimal(v));
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
  if (bridge.sellPower()) {
    game.reactor?.updateStats?.({ fromSession: true });
  }
}

export function runManualReduceHeatAction(game) {
  logger.log("debug", "game", "Manual heat reduction");
  recordSimEvent(game, { type: "MANUAL_HEAT_REDUCE" });
  drainGameEffects(game, () => game?.ui);
  const bridge = requireActiveBridge(game, "runManualReduceHeatAction");
  if (bridge.ventHeat()) {
    game.reactor?.updateStats?.({ fromSession: true });
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


