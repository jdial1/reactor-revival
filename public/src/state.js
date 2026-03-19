import { MutationObserver } from "@tanstack/query-core";
import { derive } from "derive-valtio";
import { render } from "lit-html";
import { subscribe, proxy, ref, snapshot } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { fromError } from "zod-validation-error";
import { queryClient, queryKeys, leaderboardService, supabaseSave } from "./services.js";
import {
  addPartIconsToTitle as addPartIconsToTitleHelper,
  getObjectiveScrollDuration as getObjectiveScrollDurationHelper,
  checkObjectiveTextScrolling as checkObjectiveTextScrollingHelper,
} from "./logic.js";
import {
  toDecimal,
  toNumber,
  StorageUtils,
  logger,
  StorageAdapter,
  deserializeSave,
  getBackupSaveForSlot1Async,
  StorageUtilsAsync,
  serializeSave,
  rotateSlot1ToBackupAsync,
  formatDuration,
  formatStatNum,
  BaseComponent,
  MOBILE_BREAKPOINT_PX,
  HEAT_EPSILON,
  TICKS_FULL_CYCLE,
  TICKS_10PCT,
  CRITICAL_HEAT_RATIO,
  REFERENCE_POWER,
  OVERRIDE_DURATION_MS,
  BASE_MAX_HEAT,
  BASE_MAX_POWER,
  CLASSIFICATION_HISTORY_MAX,
  MARK_II_E_THRESHOLD_CYCLES,
  MAX_SUBCLASS_CYCLES,
  REFLECTOR_COOLING_MIN_MULTIPLIER,
  HEAT_POWER_LOG_CAP,
  HEAT_POWER_LOG_BASE,
  PERCENT_DIVISOR,
  MELTDOWN_HEAT_MULTIPLIER,
  FLUX_ACCUMULATOR_POWER_RATIO_MIN,
  DEFAULT_AUTOSAVE_INTERVAL_MS,
  FAILSAFE_MONEY_THRESHOLD,
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "./utils.js";
import { interpolateTemplate } from "./templates/templateUtils.js";
import { cloudConflictModalTemplate, backupModalTemplate } from "./templates/stateTemplates.js";
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
  GameLoopTickInputSchema,
  GameLoopTickResultSchema,
  PhysicsTickInputSchema,
  PhysicsTickResultSchema,
  BlueprintSchema,
  LegacyGridSchema,
  EVENT_SCHEMA_REGISTRY,
  ACTION_SCHEMA_REGISTRY,
  GameActionSchema,
  UserPreferencesSchema,
  BalanceConfigSchema,
} from "../schema/index.js";

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
  GameLoopTickInputSchema,
  GameLoopTickResultSchema,
  PhysicsTickInputSchema,
  PhysicsTickResultSchema,
  BlueprintSchema,
  LegacyGridSchema,
  EVENT_SCHEMA_REGISTRY,
  ACTION_SCHEMA_REGISTRY,
  GameActionSchema,
  UserPreferencesSchema,
  BalanceConfigSchema,
};

const initDec = (val, fallback = 0) =>
  ref(val != null ? (typeof val?.gte === "function" ? val : toDecimal(val)) : toDecimal(fallback));

export function createGameState(initial = {}) {
  const baseState = proxy({
    current_money: initDec(initial.current_money),
    current_power: initDec(initial.current_power),
    current_heat: initDec(initial.current_heat),
    current_exotic_particles: initDec(initial.current_exotic_particles),
    total_exotic_particles: initDec(initial.total_exotic_particles),
    reality_flux: initDec(initial.reality_flux),
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
    engine_status: initial.engine_status ?? "stopped",
    power_delta_per_tick: initial.power_delta_per_tick ?? 0,
    heat_delta_per_tick: initial.heat_delta_per_tick ?? 0,
    auto_sell: initial.auto_sell ?? false,
    auto_buy: initial.auto_buy ?? true,
    heat_control: initial.heat_control ?? false,
    time_flux: initial.time_flux ?? true,
    pause: initial.pause ?? false,
    melting_down: initial.melting_down ?? false,
    manual_override_mult: initial.manual_override_mult ?? 0,
    override_end_time: initial.override_end_time ?? 0,
    power_to_heat_ratio: initial.power_to_heat_ratio ?? 0,
    flux_accumulator_level: initial.flux_accumulator_level ?? 0,
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
    parts_panel_version: initial.parts_panel_version ?? 0,
    upgrade_display: initial.upgrade_display ?? {},
    power_overflow_to_heat_ratio: initial.power_overflow_to_heat_ratio ?? 0.5,
    manual_heat_reduce: initial.manual_heat_reduce ?? initial.base_manual_heat_reduce ?? 1,
    auto_sell_multiplier: initial.auto_sell_multiplier ?? 0,
    heat_controlled: initial.heat_controlled ?? false,
    vent_multiplier_eff: initial.vent_multiplier_eff ?? 0,
  });

  derive({
    power_net_change: (get) => {
      const state = get(baseState);
      const statsPower = toNumber(state.stats_power ?? 0);
      const autoSellEnabled = !!state.auto_sell;
      const autoSellMultiplier = toNumber(state.auto_sell_multiplier ?? 0);
      return (autoSellEnabled && autoSellMultiplier > 0)
        ? statsPower - statsPower * autoSellMultiplier
        : statsPower;
    },
    heat_net_change: (get) => {
      const state = get(baseState);
      let baseNetHeat = state.stats_net_heat;
      if (typeof baseNetHeat !== "number" || isNaN(baseNetHeat)) {
        const totalHeat = toNumber(state.stats_heat_generation ?? 0);
        const statsVent = toNumber(state.stats_vent ?? 0);
        const statsOutlet = toNumber(state.stats_outlet ?? 0);
        baseNetHeat = totalHeat - statsVent - statsOutlet;
      }
      const currentPower = toNumber(state.current_power ?? 0);
      const statsPower = toNumber(state.stats_power ?? 0);
      const maxPower = toNumber(state.max_power ?? 0);
      const potentialPower = currentPower + statsPower;
      const excessPower = Math.max(0, potentialPower - maxPower);
      const overflowToHeat = Number(state.power_overflow_to_heat_ratio ?? 0.5) || 0.5;
      const overflowHeat = excessPower * overflowToHeat;
      const manualReduce = toNumber(state.manual_heat_reduce ?? 1);
      return baseNetHeat + overflowHeat - manualReduce;
    },
  }, { proxy: baseState });

  return baseState;
}

export function updateDecimal(state, key, fn) {
  const current = state[key];
  const decimal = (current != null && typeof current.gte === "function") ? current : toDecimal(current ?? 0);
  state[key] = ref(fn(decimal));
}

export function setDecimal(state, key, value) {
  state[key] = ref(toDecimal(value));
}

export { snapshot, subscribe, subscribeKey };

function tileKey(row, col) {
  return row != null && col != null ? `${row},${col}` : null;
}

export function createUIState() {
  const isMobileOnInit = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const copyPasteCollapsed = StorageUtils.get("reactor_copy_paste_collapsed") === true;
  return proxy({
    time_flux_queued_ticks: 0,
    performance_stats: { fps: 0, tps: 0, fps_color: "#4CAF50", tps_color: "#4CAF50" },
    stats: { vent: 0, power: 0, heat: 0, money: 0, ep: 0 },
    is_paused: false,
    is_melting_down: false,
    audio_muted: false,
    volume_master: 1,
    volume_effects: 1,
    volume_alerts: 1,
    volume_system: 1,
    volume_ambience: 1,
    reactor_failed_error: null,
    version: "",
    user_count: 0,
    leaderboard_display: { icon: "🏆", disabled: false },
    parts_panel_collapsed: isMobileOnInit,
    parts_panel_right_side: false,
    objectives_toast_expanded: false,
    copy_paste_collapsed: copyPasteCollapsed,
    active_modal_id: null,
    hovered_entity: null,
    active_parts_tab: "power",
    active_page: "reactor_section",
    interaction: {
      isDragging: false,
      hoveredTileKey: null,
      sellingTileKey: null,
      selectedPartId: null,
    },
    copy_paste_display: { isSandbox: false },
    user_account_display: { icon: "🔐", title: "Sign In" },
    copy_state_feedback: null,
    section_counts: {},
    has_affordable_upgrades: false,
    has_affordable_research: false,
    upgrades_banner_visibility: { upgradesHidden: true, researchHidden: true },
    version_display: { about: "", app: "" },
    sound_warning_value: 50,
    sell_modal_display: { title: "", confirmLabel: "" },
    user_account_feedback: { text: "", isError: false },
    fullscreen_display: { icon: "⛶", title: "Toggle Fullscreen" },
    copy_paste_modal_display: { title: "", confirmLabel: "" },
  });
}

export function resolveTileFromKey(game, key) {
  if (!key || !game?.tileset) return null;
  const [r, c] = key.split(",").map(Number);
  if (r == null || c == null || isNaN(r) || isNaN(c)) return null;
  return game.tileset.getTile(r, c) ?? null;
}

export { tileKey };

export function initUIStateSubscriptions(uiState, ui) {
  const unsubs = [];
  const syncCopyPasteCollapsed = () => {
    StorageUtils.set("reactor_copy_paste_collapsed", uiState.copy_paste_collapsed);
    const btns = document.getElementById("reactor_copy_paste_btns");
    if (btns) btns.classList.toggle("collapsed", uiState.copy_paste_collapsed);
  };
  const syncPartsPanelCollapsed = () => {
    const section = document.getElementById("parts_section");
    if (section) section.classList.toggle("collapsed", uiState.parts_panel_collapsed);
    ui.partsPanelUI?.updatePartsPanelBodyClass?.();
  };
  syncCopyPasteCollapsed();
  syncPartsPanelCollapsed();
  unsubs.push(subscribeKey(uiState, "copy_paste_collapsed", syncCopyPasteCollapsed));
  unsubs.push(subscribeKey(uiState, "parts_panel_collapsed", syncPartsPanelCollapsed));
  unsubs.push(subscribeKey(uiState, "active_parts_tab", (tabId) => {
    ui.partsPanelUI?.onActiveTabChanged?.(tabId);
  }));
  const syncPartActive = () => {
    const main = ui.registry?.get?.("CoreLoop")?.getElement?.("main") ?? ui.DOMElements?.main ?? document.getElementById("main");
    if (main) main.classList.toggle("part_active", !!uiState.interaction?.selectedPartId);
  };
  syncPartActive();
  unsubs.push(subscribeKey(uiState.interaction, "selectedPartId", syncPartActive));
  const syncNavAndPageClass = () => {
    const activePageId = uiState.active_page;
    if (!activePageId) return;
    const navSelectors = ["#main_top_nav", "#bottom_nav"];
    navSelectors.forEach((selector) => {
      const navContainer = typeof document !== "undefined" ? document.querySelector(selector) : null;
      if (navContainer) {
        navContainer.querySelectorAll("button[data-page]").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.page === activePageId);
        });
      }
    });
    if (typeof document !== "undefined" && document.body) {
      document.body.className = document.body.className.replace(/\bpage-\w+\b/g, "").trim();
      document.body.classList.add(`page-${activePageId.replace("_section", "")}`);
    }
  };
  syncNavAndPageClass();
  unsubs.push(subscribeKey(uiState, "active_page", (pageId) => {
    syncNavAndPageClass();
    if (pageId === "reactor_section") {
      ui.coreLoopUI?.cacheDOMElements?.();
      const om = ui.game?.objectives_manager;
      if (om?.current_objective_def) {
        om._syncActiveObjectiveToState?.();
        ui.stateManager?.handleObjectiveLoaded?.({
          ...om.current_objective_def,
          title: typeof om.current_objective_def.title === "function" ? om.current_objective_def.title() : om.current_objective_def.title,
        }, om.current_objective_index);
      }
    }
  }));
  const syncBodyClasses = () => {
    if (typeof document !== "undefined" && document.body) {
      document.body.classList.toggle("game-paused", !!uiState.is_paused);
      document.body.classList.toggle("reactor-meltdown", !!uiState.is_melting_down);
      const banner = document.getElementById("meltdown_banner");
      if (banner) banner.classList.toggle("hidden", !uiState.is_melting_down);
    }
  };
  syncBodyClasses();
  unsubs.push(subscribeKey(uiState, "is_paused", syncBodyClasses));
  unsubs.push(subscribeKey(uiState, "is_melting_down", syncBodyClasses));
  unsubs.push(subscribeKey(uiState, "is_paused", () => {
    ui.stateManager?.setVar?.("pause", !!uiState.is_paused);
  }));
  return () => unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
}

const PREF_STORAGE_MAP = {
  mute: "reactor_mute",
  reducedMotion: "reactor_reduced_motion",
  heatFlowVisible: "reactor_heat_flow_visible",
  heatMapVisible: "reactor_heat_map_visible",
  debugOverlay: "reactor_debug_overlay",
  forceNoSAB: "reactor_force_no_sab",
  numberFormat: "number_format",
  volumeMaster: "reactor_volume_master",
  volumeEffects: "reactor_volume_effects",
  volumeAlerts: "reactor_volume_alerts",
  volumeSystem: "reactor_volume_system",
  volumeAmbience: "reactor_volume_ambience",
  hideUnaffordableUpgrades: "reactor_hide_unaffordable_upgrades",
  hideUnaffordableResearch: "reactor_hide_unaffordable_research",
  hideMaxUpgrades: "reactor_hide_max_upgrades",
  hideMaxResearch: "reactor_hide_max_research",
  hideOtherDoctrineUpgrades: "reactor_hide_other_doctrine_upgrades",
};

const PREF_DEFAULTS = UserPreferencesSchema.parse({});

function hydrateFromStorage() {
  const raw = {};
  for (const [schemaKey, storageKey] of Object.entries(PREF_STORAGE_MAP)) {
    const val = StorageUtils.get(storageKey);
    if (val !== null && val !== undefined) raw[schemaKey] = val;
  }
  const result = UserPreferencesSchema.safeParse(raw);
  return result.success ? result.data : UserPreferencesSchema.parse({});
}

export const preferences = proxy({ ...PREF_DEFAULTS });

export function initPreferencesStore() {
  const hydrated = hydrateFromStorage();
  Object.keys(PREF_DEFAULTS).forEach((k) => {
    if (hydrated[k] !== undefined) preferences[k] = hydrated[k];
  });
  subscribe(preferences, () => {
    Object.entries(PREF_STORAGE_MAP).forEach(([schemaKey, storageKey]) => {
      const val = preferences[schemaKey];
      if (val !== undefined) StorageUtils.set(storageKey, val);
    });
  });
}

export function getAffordabilitySettings() {
  return {
    hideUpgrades: preferences.hideUnaffordableUpgrades !== false,
    hideResearch: preferences.hideUnaffordableResearch !== false,
    hideMaxUpgrades: preferences.hideMaxUpgrades !== false,
    hideMaxResearch: preferences.hideMaxResearch !== false,
    hideOtherDoctrine: preferences.hideOtherDoctrineUpgrades === true,
  };
}

export function getValidatedPreferences() {
  return { ...preferences };
}

export function getVolumePreferences() {
  const prefs = getValidatedPreferences();
  return {
    mute: prefs.mute,
    master: prefs.volumeMaster,
    effects: prefs.volumeEffects,
    alerts: prefs.volumeAlerts,
    system: prefs.volumeSystem,
    ambience: prefs.volumeAmbience,
  };
}


function applyReflectorEffects(tile, reactor, onReflectorPulse) {
  let reflector_power_bonus = 0;
  let reflector_heat_bonus = 0;
  let reflector_count = 0;
  tile.reflectorNeighborTiles.forEach((r_tile) => {
    if (r_tile.ticks > 0) {
      reflector_count++;
      reflector_power_bonus += r_tile.part.power_increase || 0;
      reflector_heat_bonus += r_tile.part.heat_increase || 0;
      if (onReflectorPulse) {
        try {
          onReflectorPulse(r_tile, tile);
        } catch (_) {}
      }
    }
  });
  if (typeof tile.power === "number" && !isNaN(tile.power)) {
    tile.power *= Math.max(0, 1 + reflector_power_bonus / PERCENT_DIVISOR);
  }
  if (typeof tile.heat === "number" && !isNaN(tile.heat)) {
    let heatMult = Math.max(0, 1 + reflector_heat_bonus / PERCENT_DIVISOR);
    if (reactor.reflector_cooling_factor > 0 && reflector_count > 0) {
      const coolingReduction = reflector_count * reactor.reflector_cooling_factor;
      heatMult *= Math.max(REFLECTOR_COOLING_MIN_MULTIPLIER, 1 - coolingReduction);
    }
    tile.heat *= heatMult;
  }
}

function applyCellMultipliers(tile, reactor) {
  if (reactor.heat_power_multiplier > 0 && reactor.current_heat.gt(HEAT_POWER_LOG_BASE)) {
    const heatForLog = Math.min(reactor.current_heat.toNumber(), HEAT_POWER_LOG_CAP);
    tile.power *= 1 + (reactor.heat_power_multiplier * (Math.log(heatForLog) / Math.log(HEAT_POWER_LOG_BASE) / PERCENT_DIVISOR));
    if (!Number.isFinite(tile.power)) {
      tile.power = (tile.part && Number.isFinite(tile.part.base_power)) ? tile.part.base_power : 0;
    }
  }
  if (reactor.manual_override_mult > 0 && Date.now() < reactor.override_end_time) {
    tile.power *= (1 + reactor.manual_override_mult);
  }
  if (reactor.thermal_feedback_rate > 0) {
    let feedbackBonus = 0;
    tile.containmentNeighborTiles.forEach((neighbor) => {
      if (neighbor.part && neighbor.part.category === "coolant_cell") {
        const ratio = neighbor.heat_contained / neighbor.part.containment;
        if (ratio > 0) feedbackBonus += (ratio * PERCENT_DIVISOR) * reactor.thermal_feedback_rate;
      }
    });
    if (feedbackBonus > 0) tile.power *= (1 + (feedbackBonus / PERCENT_DIVISOR));
  }
  if (reactor.volatile_tuning_max > 0) {
    const maxTicks = tile.part.ticks;
    if (maxTicks > 0 && tile.ticks >= 0) {
      const degradation = 1 - (tile.ticks / maxTicks);
      const bonus = reactor.volatile_tuning_max * degradation;
      if (bonus > 0 && typeof tile.power === "number" && !isNaN(tile.power)) tile.power *= (1 + bonus);
    }
  }
}

function computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum) {
  if (tile.part.category === "cell" && tile.ticks > 0) {
    accum.stats_power += tile.power || 0;
    accum.stats_heat_generation += tile.heat || 0;
  }
  if (tile.heat_contained > 0) accum.stats_total_part_heat += tile.heat_contained;
  if (!maxPowerSetExternally) {
    if (tile.part.reactor_power) accum.current_max_power = accum.current_max_power.add(tile.part.reactor_power);
    if (tile.part.id === "reactor_plating6") accum.current_max_power = accum.current_max_power.add(tile.part.reactor_heat);
  }
  if (!maxHeatSetExternally && tile.part.reactor_heat) {
    accum.current_max_heat = accum.current_max_heat.add(tile.part.reactor_heat);
  }
  if (tile.part.category === "capacitor") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_capacitor_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_capacitor_multiplier;
  } else if (tile.part.category === "reactor_plating") {
    accum.temp_transfer_multiplier += (tile.part.part.level || 1) * reactor.transfer_plating_multiplier;
    accum.temp_vent_multiplier += (tile.part.part.level || 1) * reactor.vent_plating_multiplier;
  }
}

function calculateStats(reactor, tileset, ui) {
  const maxPowerSetExternally =
    reactor.max_power.neq(reactor._last_calculated_max_power) &&
    reactor.max_power.neq(reactor.base_max_power);
  const maxHeatSetExternally =
    reactor.max_heat.neq(reactor._last_calculated_max_heat) &&
    reactor.max_heat.neq(reactor.base_max_heat);
  const alteredMaxPowerSet = toDecimal(reactor.altered_max_power).neq(reactor.base_max_power);
  const alteredMaxHeatSet = toDecimal(reactor.altered_max_heat).neq(reactor.base_max_heat);

  const accum = {
    stats_power: 0,
    stats_heat_generation: 0,
    stats_total_part_heat: 0,
    stats_vent: 0,
    stats_inlet: 0,
    stats_outlet: 0,
    current_max_power: maxPowerSetExternally
      ? reactor.max_power
      : (alteredMaxPowerSet ? toDecimal(reactor.altered_max_power) : toDecimal(reactor.base_max_power)),
    current_max_heat: maxHeatSetExternally
      ? reactor.max_heat
      : (alteredMaxHeatSet ? toDecimal(reactor.altered_max_heat) : toDecimal(reactor.base_max_heat)),
    temp_transfer_multiplier: 0,
    temp_vent_multiplier: 0,
  };

  const onReflectorPulse = (r_tile, tile) => {
    reactor.game?.emit?.("reflectorPulse", { r_tile, tile });
  };

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.powerOutput = 0;
      tile.heatOutput = 0;
      tile.display_power = 0;
      tile.display_heat = 0;
      const p = tile.part;
      if (p.category === "cell" && tile.ticks > 0) {
        tile.power = (typeof p.power === "number" && !isNaN(p.power) && isFinite(p.power)) ? p.power : p.base_power || 0;
        tile.heat = (typeof p.heat === "number" && !isNaN(p.heat) && isFinite(p.heat)) ? p.heat : p.base_heat || 0;
      }
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      if (tile.part.category === "cell" && tile.ticks > 0) {
        applyReflectorEffects(tile, reactor, onReflectorPulse);
        applyCellMultipliers(tile, reactor);
      }
      computeTileContributions(tile, reactor, maxPowerSetExternally, maxHeatSetExternally, accum);
    }
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (!tile.part) return;
    accum.stats_vent += tile.getEffectiveVentValue();
    if (tile.part.category === "heat_inlet") accum.stats_inlet += tile.getEffectiveTransferValue();
    if (tile.part.category === "heat_outlet") accum.stats_outlet += tile.getEffectiveTransferValue();
  });

  tileset.active_tiles_list.forEach((tile) => {
    if (tile.activated && tile.part) {
      tile.display_power = tile.power || 0;
      tile.display_heat = tile.heat || 0;
    }
  });

  accum.stats_power = Number(accum.stats_power || 0);
  accum.stats_heat_generation = Number(accum.stats_heat_generation || 0);
  accum.stats_total_part_heat = Number(accum.stats_total_part_heat || 0);
  if (!isFinite(accum.stats_power) || isNaN(accum.stats_power)) accum.stats_power = 0;
  accum.stats_net_heat = accum.stats_heat_generation - accum.stats_vent - accum.stats_outlet;
  accum.stats_cash = accum.current_max_power.mul(reactor.auto_sell_multiplier);

  return accum;
}

function applyStatsToReactor(reactor, stats) {
  reactor.stats_power = stats.stats_power;
  reactor.stats_heat_generation = stats.stats_heat_generation;
  reactor.stats_total_part_heat = stats.stats_total_part_heat;
  reactor.stats_vent = stats.stats_vent;
  reactor.stats_inlet = stats.stats_inlet;
  reactor.stats_outlet = stats.stats_outlet;
  reactor.stats_net_heat = stats.stats_net_heat;
  reactor.stats_cash = stats.stats_cash;
  reactor.vent_multiplier_eff = stats.temp_vent_multiplier;
  reactor.transfer_multiplier_eff = stats.temp_transfer_multiplier;
  reactor.max_power = stats.current_max_power;
  reactor.max_heat = stats.current_max_heat;
  reactor._last_calculated_max_power = reactor.max_power;
  reactor._last_calculated_max_heat = reactor.max_heat;
}

function computeActiveBuffs(state) {
  const buffs = [];
  const manualOverride = (state.manual_override_mult || 0) > 0 && Date.now() < (state.override_end_time || 0);
  if (manualOverride) {
    buffs.push({ id: "manual_override", icon: "img/ui/nav/nav_play.png", title: "Manual Override" });
  }
  if ((state.power_to_heat_ratio || 0) > 0) {
    const maxHeat = toNumber(state.max_heat ?? 0);
    const currentHeat = toNumber(state.current_heat ?? 0);
    const heatPercent = maxHeat > 0 ? currentHeat / maxHeat : 0;
    if (heatPercent > 0.8 && (toNumber(state.current_power ?? 0) || 0) > 0) {
      buffs.push({ id: "electro_thermal_conversion", icon: "img/parts/capacitors/capacitor_4.png", title: "Electro-Thermal Conversion" });
    }
  }
  const maxPower = toNumber(state.max_power ?? 0);
  if ((state.flux_accumulator_level || 0) > 0 && maxPower > 0) {
    const powerRatio = toNumber(state.current_power ?? 0) / maxPower;
    if (powerRatio >= FLUX_ACCUMULATOR_POWER_RATIO_MIN) {
      buffs.push({ id: "flux_accumulators", icon: "img/parts/capacitors/capacitor_6.png", title: "Flux Accumulators" });
    }
  }
  return buffs;
}

function syncStatsToUI(reactor, _stateManager) {
  const state = reactor.game?.state;
  if (state) {
    state.max_power = reactor.max_power;
    state.max_heat = reactor.max_heat;
    state.stats_power = reactor.stats_power;
    state.stats_heat_generation = reactor.stats_heat_generation;
    state.stats_vent = reactor.stats_vent;
    state.stats_inlet = reactor.stats_inlet;
    state.stats_outlet = reactor.stats_outlet;
    state.stats_net_heat = reactor.stats_net_heat;
    state.stats_cash = reactor.stats_cash;
    state.stats_total_part_heat = reactor.stats_total_part_heat;
    state.manual_override_mult = reactor.manual_override_mult;
    state.override_end_time = reactor.override_end_time;
    state.power_to_heat_ratio = reactor.power_to_heat_ratio;
    state.flux_accumulator_level = reactor.flux_accumulator_level;
    state.auto_sell_multiplier = reactor.auto_sell_multiplier;
    state.heat_controlled = reactor.heat_controlled;
    state.vent_multiplier_eff = reactor.vent_multiplier_eff;
    state.power_overflow_to_heat_ratio = reactor.power_overflow_to_heat_ratio ?? 0.5;
    state.manual_heat_reduce = toNumber(reactor.manual_heat_reduce ?? reactor.game?.base_manual_heat_reduce ?? 1);
    state.active_buffs = computeActiveBuffs(state);
  }
}

function shouldMeltdown(reactor) {
  if (reactor.has_melted_down) return false;
  if (reactor.game.grace_period_ticks > 0) {
    reactor.game.grace_period_ticks--;
    return false;
  }
  return reactor.current_heat.gt(reactor.max_heat.mul(MELTDOWN_HEAT_MULTIPLIER));
}

function executeMeltdown(reactor) {
  const game = reactor.game;
  logger.log('warn', 'engine', '[MELTDOWN] Condition met! Initiating meltdown sequence.');
  game.debugHistory.add('reactor', 'Meltdown triggered', { heat: reactor.current_heat, max_heat: reactor.max_heat });
  reactor.has_melted_down = true;

  if (game.emit) game.emit("meltdown", { hasMeltedDown: true });
  game.emit?.("vibrationRequest", { type: "meltdown" });
  if (game.tooltip_manager) game.tooltip_manager.hide();

  if (game.state) game.state.melting_down = true;

  if (game.engine) game.engine.stop();

  if (!game.isSandbox) {
    game.emit?.("meltdownStarted", {});
  }
  if (!game.isSandbox && !game.ui?.meltdownUI) {
    game.tileset.active_tiles_list.forEach((tile) => {
      if (tile.part) tile.clearPart();
    });
  }

  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
}

function clearMeltdown(reactor) {
  const game = reactor.game;
  reactor.has_melted_down = false;
  if (game.emit) game.emit("meltdownResolved", { hasMeltedDown: false });
  if (game.state) game.state.melting_down = false;
  game.partset.check_affordability(game);
  game.upgradeset.check_affordability(game);
  clearHeatVisualStates(reactor);
}

function clearHeatVisualStates(reactor) {
  const game = reactor.game;
  if (game.tileset && game.tileset.active_tiles_list) {
    game.tileset.active_tiles_list.forEach((tile) => { tile.exploding = false; });
  }
  game.emit?.("heatWarningCleared");
  if (game.engine && game.engine.heatManager) {
    game.engine.heatManager.segments.clear();
    game.engine.heatManager.tileSegmentMap.clear();
    game.engine.heatManager.markSegmentsAsDirty();
  }
}

export class Reactor {
  constructor(game) {
    "use strict";
    this.game = game;
    this.base_max_heat = BASE_MAX_HEAT;
    this.base_max_power = BASE_MAX_POWER;
    this.setDefaults();
  }

  setDefaults() {
    const zero = toDecimal(0);
    if (this.game?.state) {
      setDecimal(this.game.state, "current_heat", zero);
      setDecimal(this.game.state, "current_power", zero);
    }
    this._max_heat = toDecimal(this.base_max_heat);
    this.altered_max_heat = toDecimal(this.base_max_heat);
    this._max_power = toDecimal(this.base_max_power);
    this.altered_max_power = toDecimal(this.base_max_power);

    this.auto_sell_multiplier = 0;
    this.heat_power_multiplier = 0;
    this.heat_controlled = false;
    this.heat_outlet_controlled = false;
    this.vent_capacitor_multiplier = 0;
    this.vent_plating_multiplier = 0;
    this.transfer_capacitor_multiplier = 0;
    this.transfer_plating_multiplier = 0;

    this.stirling_multiplier = 0;
    this.sell_price_multiplier = 1;
    this.manual_vent_percent = 0;
    this.reflector_cooling_factor = 0;
    this.insurance_percentage = 0;
    this.manual_override_mult = 0;
    this.override_end_time = 0;
    this.convective_boost = 0;
    this.power_to_heat_ratio = 0;
    this.catalyst_reduction = 0;
    this.flux_accumulator_level = 0;
    this.thermal_feedback_rate = 0;
    this.auto_repair_rate = 0;
    this.volatile_tuning_max = 0;
    this.decompression_enabled = false;
    this.plating_transfer_rate = 0;

    this.has_melted_down = false;
    this.game.sold_power = false;
    this.game.sold_heat = false;

    this._last_calculated_max_power = toDecimal(this.base_max_power);
    this._last_calculated_max_heat = toDecimal(this.base_max_heat);
    this._classificationStatsHistory = [];
  }

  get current_heat() {
    const val = this.game?.state?.current_heat;
    return (val != null && typeof val.gt === "function") ? val : toDecimal(val ?? 0);
  }
  set current_heat(v) {
    const val = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) setDecimal(this.game.state, "current_heat", val);
    if (this.game?.emit) {
      this.game.emit("reactorTick", {
        current_heat: this.current_heat,
        current_power: this.current_power,
        max_heat: this.max_heat,
        max_power: this.max_power
      });
    }
  }
  get current_power() {
    const val = this.game?.state?.current_power;
    return (val != null && typeof val.gt === "function") ? val : toDecimal(val ?? 0);
  }
  set current_power(v) {
    const val = (v != null && typeof v.gt === 'function') ? v : toDecimal(v);
    if (this.game?.state) setDecimal(this.game.state, "current_power", val);
    if (this.game?.emit) {
      this.game.emit("reactorTick", {
        current_heat: this.current_heat,
        current_power: this.current_power,
        max_heat: this.max_heat,
        max_power: this.max_power
      });
    }
  }
  get max_heat() { return this._max_heat; }
  set max_heat(v) { this._max_heat = (v != null && typeof v.gt === 'function') ? v : toDecimal(v); }
  get max_power() { return this._max_power; }
  set max_power(v) { this._max_power = (v != null && typeof v.gt === 'function') ? v : toDecimal(v); }

  recordClassificationStats() {
    const h = this._classificationStatsHistory;
    h.push({
      netHeat: Number(this.stats_net_heat) || 0,
      power: Number(this.stats_power) || 0,
      inlet: Number(this.stats_inlet) || 0,
      outlet: Number(this.stats_outlet) || 0
    });
    if (h.length > CLASSIFICATION_HISTORY_MAX) h.shift();
  }

  getAveragedClassificationStats() {
    const h = this._classificationStatsHistory;
    if (!h.length) return null;
    const n = h.length;
    let netHeat = 0, power = 0, inlet = 0, outlet = 0;
    for (let i = 0; i < n; i++) {
      netHeat += h[i].netHeat;
      power += h[i].power;
      inlet += h[i].inlet;
      outlet += h[i].outlet;
    }
    return {
      netHeat: netHeat / n,
      power: power / n,
      inlet: inlet / n,
      outlet: outlet / n
    };
  }

  getClassification() {
    if (!this.game?.tileset) return null;
    if (typeof this.updateStats === "function") this.updateStats();
    const averaged = this.getAveragedClassificationStats && this.getAveragedClassificationStats();
    const netHeat = averaged ? averaged.netHeat : (Number(this.stats_net_heat) || 0);
    const maxHeat = Number(this.max_heat) || 1;
    const cellCount = this.game.tileset.active_tiles_list.filter((t) => t.part && t.part.category === "cell").length;
    const inletVal = averaged ? averaged.inlet : (Number(this.stats_inlet) || 0);
    const outletVal = averaged ? averaged.outlet : (Number(this.stats_outlet) || 0);
    const hasOutsideCooling = inletVal > 0 || outletVal > 0;
    const statsPower = averaged ? averaged.power : (Number(this.stats_power) || 0);
    let efficiencyNum = cellCount > 0 ? statsPower / (cellCount * REFERENCE_POWER) : 1;
    if (!isFinite(efficiencyNum) || efficiencyNum < 1) efficiencyNum = 1;
    let efficiencyLabel = "EE";
    if (efficiencyNum >= 4) efficiencyLabel = "EA";
    else if (efficiencyNum >= 3) efficiencyLabel = "EB";
    else if (efficiencyNum >= 2) efficiencyLabel = "EC";
    else if (efficiencyNum > 1) efficiencyLabel = "ED";
    const suffixes = [];
    if (hasOutsideCooling && netHeat <= 0) suffixes.push("SUC");
    let markLabel;
    let subClass = "";
    let summary = "";
    if (netHeat <= 0) {
      markLabel = "Mark I";
      subClass = hasOutsideCooling ? "O" : "I";
      summary = "Generates no excess heat; safe to run continuously.";
    } else {
      const heatPerTick = netHeat;
      const criticalHeat = CRITICAL_HEAT_RATIO * maxHeat;
      const ticksToCritical = heatPerTick > 0 ? criticalHeat / heatPerTick : Infinity;
      if (ticksToCritical >= TICKS_FULL_CYCLE) {
        markLabel = "Mark II";
        const fullCycles = Math.floor(ticksToCritical / TICKS_FULL_CYCLE);
        subClass = fullCycles >= MARK_II_E_THRESHOLD_CYCLES ? "E" : String(Math.min(fullCycles, MAX_SUBCLASS_CYCLES));
        summary = fullCycles >= MARK_II_E_THRESHOLD_CYCLES
          ? `Runs ${MARK_II_E_THRESHOLD_CYCLES}+ cycles before critical heat; nearly Mark I.`
          : `Runs ${subClass} full cycle(s) before cooldown needed.`;
      } else if (ticksToCritical >= TICKS_10PCT) {
        markLabel = "Mark III";
        summary = "Cannot complete a full cycle; shutdown mid-cycle required.";
      } else if (ticksToCritical > 0) {
        markLabel = "Mark IV";
        summary = "Reaches critical heat in under 10% of a cycle; component replacement may be needed.";
      } else {
        markLabel = "Mark V";
        summary = "Very short run before cooldown; precise timing required.";
      }
    }
    const mainLabel = subClass ? `${markLabel}-${subClass}` : markLabel;
    const suffixStr = suffixes.length ? " -" + suffixes.join(" -") : "";
    const classification = `${mainLabel} ${efficiencyLabel}${suffixStr}`.trim();
    return { classification, efficiencyLabel, suffixes, summary, markLabel, subClass };
  }

  updateStats() {
    if (!this.game.tileset) return;
    const stats = calculateStats(this, this.game.tileset, this.game?.ui);
    applyStatsToReactor(this, stats);
    syncStatsToUI(this, this.game.ui?.stateManager);
  }

  manualReduceHeat() {
    if (this.current_heat.gt(0)) {
      const previousHeat = this.current_heat;
      let reduction = this.manual_heat_reduce || this.game.base_manual_heat_reduce || 1;
      if (this.manual_vent_percent > 0) {
        reduction += this.max_heat.toNumber() * this.manual_vent_percent;
      }
      this.current_heat = this.current_heat.sub(reduction);
      if (this.current_heat.lt(0)) this.current_heat = toDecimal(0);
      const eps = toDecimal(HEAT_EPSILON);
      if (this.current_heat.lte(eps)) {
        this.current_heat = toDecimal(0);
        if (previousHeat.gt(eps)) this.game.sold_heat = true;
      }
      if (this.game.objectives_manager) {
        this.game.objectives_manager.check_current_objective();
      }

      this.updateStats();
    }
  }

  sellPower() {
    if (this.current_power.gt(0)) {
      const value = this.current_power.mul(this.sell_price_multiplier || 1);
      this.game.addMoney(value);
      this.current_power = toDecimal(0);
      this.game.sold_power = true;
      if (this.game.emit) this.game.emit("powerSold", {});

      if (this.manual_override_mult > 0) {
        this.override_end_time = Date.now() + OVERRIDE_DURATION_MS;
        this.updateStats();
      }

      // Check objectives after power selling
      if (this.game.objectives_manager) {
        this.game.objectives_manager.check_current_objective();
      }
    }
  }

  toSaveState() {
    return {
      current_heat: this.current_heat,
      current_power: this.current_power,
      has_melted_down: this.has_melted_down,
      base_max_heat: this.base_max_heat,
      base_max_power: this.base_max_power,
      altered_max_heat: this.altered_max_heat,
      altered_max_power: this.altered_max_power,
    };
  }

  checkMeltdown() {
    if (this.has_melted_down) {
      logger.log('debug', 'engine', '[MELTDOWN-CHECK] Already in meltdown state.');
      return false;
    }
    const isMeltdown = shouldMeltdown(this);
    logger.log('debug', 'engine', `[MELTDOWN-CHECK] Inside checkMeltdown. isMeltdown condition evaluated to: ${isMeltdown}. (Heat: ${this.current_heat.toFixed(2)} > 2 * Max Heat: ${this.max_heat.toFixed(2)})`);
    if (isMeltdown) {
      executeMeltdown(this);
      return true;
    }
    return false;
  }

  clearMeltdownState() {
    clearMeltdown(this);
  }

  clearHeatVisualStates() {
    clearHeatVisualStates(this);
  }
}

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
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
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
    const state = this.game?.state;
    const ui = this.ui;
    const config = ui?.var_objs_config;
    if (!state || !config) return;
    const coreLoopUI = ui?.coreLoopUI;
    const getDisplayValue = (key) => coreLoopUI?.getDisplayValue?.(this.game, key);
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
      this._stateUnsubscribes.push(unsub);
    }
    if (state.engine_status !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "engine_status", (val) => {
        if (val === "tick") {
          setTimeout(() => {
            const g = this.game;
            const status = g?.engine?.running ? (g?.paused ? "paused" : "running") : "stopped";
            this.setVar("engine_status", status);
          }, 100);
        }
      }));
    }
    const heatKeys = ["current_heat", "max_heat"];
    for (const key of heatKeys) {
      if (state[key] !== undefined) {
        this._stateUnsubscribes.push(subscribeKey(state, key, () => {
          ui.heatVisualsUI?.updateHeatVisuals?.();
          ui.deviceFeatures?.updateAppBadge?.();
        }));
      }
    }
    if (state.pause !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "pause", () => ui.deviceFeatures?.updateAppBadge?.()));
    }
    ui.deviceFeatures?.updateAppBadge?.();
    const runAffordabilityCascade = () => {
      const g = this.game;
      if (!g) return;
      try {
        const moneyVal = g.state?.current_money;
        const epVal = g.state?.current_exotic_particles;
        if (ui.last_money !== undefined) ui.last_money = moneyVal;
        if (ui.last_exotic_particles !== undefined) ui.last_exotic_particles = epVal;
        g.partset?.check_affordability?.(g);
        g.upgradeset?.check_affordability?.(g);
        if (g.tooltip_manager) g.tooltip_manager.updateUpgradeAffordability?.();
        if (ui.uiState) {
          ui.uiState.has_affordable_upgrades = g.upgradeset?.hasAffordableUpgrades?.() ?? false;
          ui.uiState.has_affordable_research = g.upgradeset?.hasAffordableResearch?.() ?? false;
        }
        ui.navIndicatorsUI?.updateNavIndicators?.();
        if (typeof ui.partsPanelUI?.updateQuickSelectSlots === "function") ui.partsPanelUI.updateQuickSelectSlots();
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };
    if (state.current_money !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_money", runAffordabilityCascade));
    }
    if (state.current_exotic_particles !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_exotic_particles", runAffordabilityCascade));
    }
    runAffordabilityCascade();
  }
  setVar(key, value) {
    if (!this.game?.state) return;
    if (key === "exotic_particles") {
      this.game.exoticParticleManager.exotic_particles = value;
      return;
    }
    if (key === "total_heat") {
      this.game.state.stats_heat_generation = value;
      return;
    }
    const oldValue = this.game.state[key];
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "time_flux", "heat_control"];
    const decimalKeys = ["current_heat", "current_power", "current_money", "current_exotic_particles", "total_exotic_particles", "reality_flux"];
    const isToggle = toggleKeys.includes(key);
    if (isToggle) value = Boolean(value);
    const isDecimalKey = decimalKeys.includes(key);
    if (!isDecimalKey && oldValue === value) return;

    if (isDecimalKey || (value != null && typeof value.gte === "function")) {
      setDecimal(this.game.state, key, value);
    } else {
      this.game.state[key] = value;
    }

    if (isToggle) {
      this.game.onToggleStateChange?.(key, value);
    }
  }
  getVar(key) {
    if (!this.game?.state) return undefined;
    if (key === "exotic_particles") return this.game.exoticParticleManager?.exotic_particles;
    if (key === "total_heat") return this.game.state.stats_heat_generation;
    return this.game.state[key];
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.ui?.uiState?.interaction) {
      this.ui.uiState.interaction.selectedPartId = part?.id ?? null;
    }
    if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
      this.game.state.parts_panel_version++;
    }
    if (this.game?.emit) this.game.emit("partSelected", { part });
    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile && part && !skipOpenPanel) {
      const uiState = this.ui?.uiState;
      if (uiState) uiState.parts_panel_collapsed = false;
      else {
        const partsSection = document.getElementById("parts_section");
        if (partsSection) partsSection.classList.remove("collapsed");
      }
      this.ui.partsPanelUI.updatePartsPanelBodyClass();
      const partsSection = document.getElementById("parts_section");
      if (partsSection) void partsSection.offsetHeight;
    }
    if (part) {
      const inQuickSelect = this.getQuickSelectSlots().some((s) => s.partId === part.id);
      if (!inQuickSelect) this.pushLastUsedPart(part);
    }
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.gridInteractionUI.clearSegmentHighlight();
    }
  }
  getClickedPart() {
    return this.clicked_part;
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
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
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
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setQuickSelectSlots(slots) {
    const normalized = Array.from({ length: 5 }, (_, i) => {
      const s = slots?.[i];
      return {
        partId: s?.partId ?? null,
        locked: !!s?.locked,
      };
    });
    this.quickSelectSlots = normalized;
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  updatePartsPanelToggleIcon(_part) {}

  handleObjectiveCompleted() {
    const objectives = this.ui.registry?.get?.("Objectives");
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
    const upgrades = this.ui.registry?.get?.("Upgrades");
    if (!upgrades?.getUpgradeContainer?.(locationKey)) {
      if (this.debugMode) {
        logger.log('warn', 'game', `Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
      }
      return;
    }
    const upgradeEl = upgrade_obj.createElement();
    if (upgradeEl) {
      upgrade_obj.$el = upgradeEl;
      upgradeEl.upgrade_object = upgrade_obj;
      upgrades.appendUpgrade(locationKey, upgradeEl);
    }
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    tile.tile_index = tile.row * game.max_cols + tile.col;
  }
  game_reset() {
    if (this.game?.state) {
      setDecimal(this.game.state, "current_money", this.game.base_money);
      setDecimal(this.game.state, "current_power", 0);
      setDecimal(this.game.state, "current_heat", 0);
      this.game.state.max_power = this.game.reactor.base_max_power;
      this.game.state.max_heat = this.game.reactor.base_max_heat;
    }
    // Ensure any progress-based gating resets as well
    try {
      if (this.game) {
        this.game.placedCounts = {};
        this.game._suppressPlacementCounting = false;
      }
    } catch (_) { }
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
      const toastBtn = this.ui.coreLoopUI?.getElement?.("objectives_toast_btn") ?? (typeof document !== "undefined" ? document.getElementById("objectives_toast_btn") : null);
      if (toastBtn) toastBtn.classList.remove("is-complete", "objective-completed");
    }
    if (objective?.title) {
      setTimeout(() => this.checkObjectiveTextScrolling(), 0);
    }
  }

  handleObjectiveUnloaded() {
    // No-op for now. Could add animation or clearing logic here if desired.
  }

  getObjectiveScrollDuration() {
    return getObjectiveScrollDurationHelper();
  }

  checkObjectiveTextScrolling() {
    const objectives = this.ui.registry?.get?.("Objectives");
    if (objectives?.checkTextScrolling) objectives.checkTextScrolling();
    else checkObjectiveTextScrollingHelper(this.ui.DOMElements);
  }
}


const LOCAL_SLOTS = [1, 2, 3];
const PENDING_SYNC_KEY = "reactor_pending_cloud_sync";
export function parseAndValidateSave(raw) {
  const parsed = typeof raw === "string" ? deserializeSave(raw) : raw;
  const result = SaveDataSchema.safeParse(parsed);
  if (!result.success) {
    logger.log("error", "game", "Save validation failed:", fromError(result.error).toString());
    throw new Error("Save corrupted: validation failed");
  }
  return result.data;
}

function applyCoreGameState(game, savedData) {
  setDecimal(game.state, "current_money", savedData.current_money);
  game.run_id = savedData.run_id;
  game.tech_tree = savedData.tech_tree ?? null;
  game.peak_power = savedData.reactor?.current_power != null ? savedData.reactor.current_power.toNumber() : 0;
  game.peak_heat = savedData.reactor?.current_heat != null ? savedData.reactor.current_heat.toNumber() : 0;
  game.base_rows = savedData.base_rows;
  game.base_cols = savedData.base_cols;
  game.protium_particles = savedData.protium_particles;
  setDecimal(game.state, "total_exotic_particles", savedData.total_exotic_particles);
  const epRaw = savedData.current_exotic_particles ?? savedData.exotic_particles;
  game.exoticParticleManager.exotic_particles = epRaw;
  setDecimal(game.state, "current_exotic_particles", epRaw);
  setDecimal(game.state, "reality_flux", savedData.reality_flux);
  game.emit?.("exoticParticlesChanged", {
    exotic_particles: game.exoticParticleManager.exotic_particles,
    current_exotic_particles: game.state.current_exotic_particles,
    total_exotic_particles: game.state.total_exotic_particles,
    reality_flux: game.state.reality_flux,
  });
  if (savedData.rows != null) game.gridManager.setRows(savedData.rows);
  if (savedData.cols != null) game.gridManager.setCols(savedData.cols);
  if (savedData.rows != null && game.rows !== savedData.rows) {
    game.gridManager.setRows(savedData.rows);
  }
  if (savedData.cols != null && game.cols !== savedData.cols) {
    game.gridManager.setCols(savedData.cols);
  }
  game.sold_power = savedData.sold_power;
  game.sold_heat = savedData.sold_heat;
  game.grace_period_ticks = savedData.grace_period_ticks ?? (game._isRestoringSave ? 30 : 0);
}

function applySessionMetadata(game, savedData) {
  game.lifecycleManager.total_played_time = savedData.total_played_time;
  game.lifecycleManager.last_save_time = savedData.last_save_time ?? null;
  game.lifecycleManager.session_start_time = null;
  game.placedCounts = savedData.placedCounts ?? game.placedCounts ?? {};
}

function applyReactorState(game, savedData) {
  if (!savedData.reactor) return;
  game.reactor.current_heat = savedData.reactor.current_heat;
  game.reactor.current_power = savedData.reactor.current_power;
  game.reactor.has_melted_down = savedData.reactor.has_melted_down ?? false;
  if (savedData.reactor.base_max_heat != null) game.reactor.base_max_heat = savedData.reactor.base_max_heat;
  if (savedData.reactor.base_max_power != null) game.reactor.base_max_power = savedData.reactor.base_max_power;
  if (savedData.reactor.altered_max_heat != null) game.reactor.altered_max_heat = savedData.reactor.altered_max_heat;
  if (savedData.reactor.altered_max_power != null) game.reactor.altered_max_power = savedData.reactor.altered_max_power;
  game.emit?.("meltdownStateChanged");
}

async function applyUpgrades(game, savedData) {
  game.upgradeset.reset();
  await game.upgradeset.initialize();
  if (savedData.upgrades) {
    savedData.upgrades.forEach((upgData) => {
      const upgrade = game.upgradeset.getUpgrade(upgData.id);
      if (upgrade) upgrade.setLevel(upgData.level);
    });
  }
  if (game.upgradeset && game.tech_tree) game.upgradeset.sanitizeDoctrineUpgradeLevelsOnLoad(game.tech_tree);
  game.reactor.updateStats();
}

async function restoreTiles(game, savedData) {
  if (!game.tileset.initialized) game.tileset.initialize();
  game.tileset.clearAllTiles();
  const tiles = savedData.tiles ?? [];
  const prevSuppress = game._suppressPlacementCounting;
  game._suppressPlacementCounting = true;
  await Promise.all(
    tiles.map(async (tileData) => {
      const tile = game.tileset.getTile(tileData.row, tileData.col);
      const part = game.partset.getPartById(tileData.partId);
      if (tile && part) {
        await tile.setPart(part);
        tile.ticks = tileData.ticks;
        tile.heat_contained = tileData.heat_contained;
      }
    })
  );
  game._suppressPlacementCounting = prevSuppress;
  const placedCounts = savedData.placedCounts ?? {};
  if (Object.keys(placedCounts).length === 0) {
    for (const tile of game.tileset.tiles_list) {
      if (tile.part) {
        const key = `${tile.part.type}:${tile.part.level}`;
        game.placedCounts[key] = (game.placedCounts[key] || 0) + 1;
      }
    }
  }
  game.reactor.updateStats();
}

function parseObjectiveIndex(v) {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseInt(v, 10) : Math.floor(Number(v));
  return Number.isNaN(n) ? 0 : Math.max(0, n);
}

function clampObjectiveIndex(game, savedData, savedIndex) {
  const rawNum = typeof savedIndex === "string" ? parseInt(savedIndex, 10) : Number(savedIndex);
  if (savedIndex != null && !Number.isNaN(rawNum) && rawNum < 0) {
    console.warn(`Negative objective index ${savedIndex}. Clamping to 0.`);
    return 0;
  }
  let idx = parseObjectiveIndex(savedIndex);
  if (!game.objectives_manager?.objectives_data?.length) return idx;
  const objectivesData = game.objectives_manager.objectives_data;
  const lastDef = objectivesData[objectivesData.length - 1];
  const maxValidIndex =
    lastDef && lastDef.checkId === "allObjectives" ? objectivesData.length - 2 : objectivesData.length - 1;
  if (idx < 0) return 0;
  if (idx > maxValidIndex) {
    logger.log(
      "warn",
      "game",
      `Objective index ${savedIndex} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`
    );
    return maxValidIndex;
  }
  return idx;
}

function applyInfiniteObjective(game, savedData) {
  const inf = savedData.objectives.infinite_objective;
  if (!inf || !game.objectives_manager) return;
  game.objectives_manager.infiniteObjective = {
    title: inf.title,
    checkId: inf.checkId,
    target: inf.target,
    reward: inf.reward,
    completed: !!inf.completed,
  };
  if (inf._lastInfinitePowerTarget != null) game.objectives_manager._lastInfinitePowerTarget = inf._lastInfinitePowerTarget;
  if (inf._lastInfiniteHeatMaintain != null) game.objectives_manager._lastInfiniteHeatMaintain = inf._lastInfiniteHeatMaintain;
  if (inf._lastInfiniteMoneyThorium != null) game.objectives_manager._lastInfiniteMoneyThorium = inf._lastInfiniteMoneyThorium;
  if (inf._lastInfiniteHeat != null) game.objectives_manager._lastInfiniteHeat = inf._lastInfiniteHeat;
  if (inf._lastInfiniteEP != null) game.objectives_manager._lastInfiniteEP = inf._lastInfiniteEP;
  if (inf._infiniteChallengeIndex != null) game.objectives_manager._infiniteChallengeIndex = inf._infiniteChallengeIndex;
  if (inf._infiniteCompletedCount != null) game.objectives_manager._infiniteCompletedCount = inf._infiniteCompletedCount;
}

function applyObjectives(game, savedData) {
  if (!savedData.objectives) return;
  const savedIndex = clampObjectiveIndex(game, savedData, savedData.objectives.current_objective_index);
  applyInfiniteObjective(game, savedData);
  const om = game.objectives_manager;
  if (savedData.objectives.completed_objectives?.length && om?.objectives_data) {
    savedData.objectives.completed_objectives.forEach((completed, index) => {
      if (om.objectives_data[index]) om.objectives_data[index].completed = completed;
    });
  }
  if (om) om.current_objective_index = savedIndex;
  game._saved_objective_index = savedIndex;
  if (om?.set_objective && om.objectives_data?.length) {
    om.set_objective(savedIndex, true);
    if (om.checkForChapterCompletion) om.checkForChapterCompletion();
  }
}

function applyUIState(game, savedData) {
  const toggles = savedData.toggles ?? {};
  game._pendingToggleStates = toggles;
  if (game.onToggleStateChange) {
    Object.entries(toggles).forEach(([key, value]) => game.onToggleStateChange(key, value));
  }
  game.emit?.("saveLoaded", {
    toggles,
    quick_select_slots: savedData.quick_select_slots,
  });
  game.reactor.updateStats();
}

const SYNC_HYDRATORS = [applyCoreGameState, applySessionMetadata, applyReactorState];
const ASYNC_HYDRATORS = [applyUpgrades, restoreTiles];
const POST_ASYNC_HYDRATORS = [applyObjectives, applyUIState];

export async function applySaveState(game, savedData) {
  if (!savedData || typeof savedData !== "object") {
    throw new Error("Save corrupted: invalid save data structure");
  }
  for (const fn of SYNC_HYDRATORS) fn(game, savedData);
  if (!game.partset.initialized) await game.partset.initialize();
  for (const fn of ASYNC_HYDRATORS) await fn(game, savedData);
  for (const fn of POST_ASYNC_HYDRATORS) fn(game, savedData);
}

function getCloudSaveProvider() {
  if (typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.()) {
    return createSupabaseProvider(supabaseSave);
  }
  if (typeof window !== "undefined" && window.googleDriveSave?.isSignedIn) {
    return createGoogleDriveProvider(window.googleDriveSave);
  }
  return null;
}

export function createSupabaseProvider(supabaseSaveInstance) {
  return {
    async getSaves() {
      return supabaseSaveInstance.getSaves();
    },
    async saveGame(slotId, saveData) {
      return supabaseSaveInstance.saveGame(slotId, saveData);
    },
    isSignedIn() {
      return typeof window !== "undefined" && window.supabaseAuth?.isSignedIn?.() === true;
    },
  };
}

export function createGoogleDriveProvider(googleDriveSaveInstance) {
  const DEFAULT_SLOT = 1;
  return {
    async getSaves() {
      if (!googleDriveSaveInstance?.isSignedIn) return [];
      try {
        const data = await googleDriveSaveInstance.load();
        if (!data) return [];
        return [{ slot_id: DEFAULT_SLOT, save_data: data, timestamp: Date.now() }];
      } catch {
        return [];
      }
    },
    async saveGame(slotId, saveData) {
      if (slotId !== DEFAULT_SLOT) return;
      await googleDriveSaveInstance.save(saveData, true);
    },
    isSignedIn() {
      return googleDriveSaveInstance?.isSignedIn === true;
    },
  };
}

async function pushPendingSync(entry) {
  try {
    const queue = (await StorageUtilsAsync.get(PENDING_SYNC_KEY)) || [];
    queue.push(entry);
    await StorageUtilsAsync.set(PENDING_SYNC_KEY, queue);
  } catch (e) {
    logger.log("error", "game", "Failed to queue cloud sync:", e);
  }
}

async function drainPendingSyncQueue() {
  try {
    const queue = (await StorageUtilsAsync.get(PENDING_SYNC_KEY)) || [];
    if (queue.length === 0) return;
    const provider = getCloudSaveProvider();
    if (!provider?.isSignedIn?.()) return;
    await StorageUtilsAsync.set(PENDING_SYNC_KEY, []);
    for (const { slot, saveData } of queue) {
      try {
        await provider.saveGame(slot, saveData);
      } catch (e) {
        logger.log("error", "game", "Failed to sync queued save to cloud:", e);
        await pushPendingSync({ slot, saveData });
        break;
      }
    }
  } catch (e) {
    logger.log("error", "game", "Failed to drain sync queue:", e);
  }
}

export function initCloudSyncQueue() {
  if (typeof window === "undefined") return;
  const drain = () => drainPendingSyncQueue();
  window.addEventListener("online", drain);
  drain();
}

async function performSave(slot, saveData, cloudProvider) {
  const validatedData = SaveDataSchema.parse(saveData);
  const saveKey = `reactorGameSave_${slot}`;
  await StorageAdapter.set(saveKey, validatedData);
  if (slot === 1) {
    await rotateSlot1ToBackupAsync(serializeSave(validatedData));
  }
  await StorageAdapter.set("reactorCurrentSaveSlot", slot);
  if (cloudProvider?.isSignedIn?.()) {
    try {
      await cloudProvider.saveGame(slot, validatedData);
    } catch (e) {
      logger.log("error", "game", "Cloud save failed, queuing for retry:", e);
      await pushPendingSync({ slot, saveData: validatedData });
    }
  }
  return slot;
}

export function createSaveMutation(cloudProvider = null) {
  const provider = cloudProvider ?? getCloudSaveProvider();
  return new MutationObserver(queryClient, {
    mutationFn: async ({ slot, saveData }) => performSave(slot, saveData, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
      queryClient.invalidateQueries({ queryKey: queryKeys.saves.cloud("supabase") });
    },
    onError: (error) => {
      logger.log("error", "game", "Save mutation failed:", error);
    },
  });
}

export async function saveGameMutation({ slot, saveData, getNextSaveSlot }) {
  if (typeof indexedDB === "undefined") return null;
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "test") return null;

  const effectiveSlot = slot ?? (await getNextSaveSlot());
  await performSave(effectiveSlot, saveData, getCloudSaveProvider());
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.resolved() });
  queryClient.invalidateQueries({ queryKey: queryKeys.saves.cloud("supabase") });
  return effectiveSlot;
}

async function fetchLocalSlotData(slotId) {
  try {
    const slotData = await StorageAdapter.get(`reactorGameSave_${slotId}`, SaveDataSchema);
    if (!slotData) return null;
    return {
      slot: slotId,
      exists: true,
      lastSaveTime: slotData.last_save_time || null,
      totalPlayedTime: slotData.total_played_time || 0,
      currentMoney: slotData.current_money || 0,
      exoticParticles: slotData.exotic_particles ?? slotData.total_exotic_particles ?? 0,
      data: slotData,
    };
  } catch (error) {
    logger.log("warn", "saves", `Failed to fetch local slot ${slotId}`, error);
    return null;
  }
}

async function fetchLegacySlotData() {
  try {
    const oldSaveData = await StorageAdapter.get("reactorGameSave", SaveDataSchema);
    if (!oldSaveData) return null;
    return {
      slot: "legacy",
      exists: true,
      lastSaveTime: oldSaveData.last_save_time || null,
      totalPlayedTime: oldSaveData.total_played_time || 0,
      currentMoney: oldSaveData.current_money || 0,
      exoticParticles: oldSaveData.exotic_particles ?? oldSaveData.total_exotic_particles ?? 0,
      data: oldSaveData,
    };
  } catch (error) {
    logger.log("warn", "saves", "Failed to fetch legacy save", error);
    return null;
  }
}

async function fetchCloudSaveData() {
  if (typeof window === "undefined" || !window.googleDriveSave?.isConfigured) {
    return { cloudSaveOnly: false, cloudSaveData: null };
  }
  try {
    const isSignedIn = await window.googleDriveSave.checkAuth(true);
    if (!isSignedIn) return { cloudSaveOnly: false, cloudSaveData: null };
    const fileFound = await window.googleDriveSave.findSaveFile();
    if (!fileFound) return { cloudSaveOnly: false, cloudSaveData: null };
    try {
      const cloudSaveData = await window.googleDriveSave.load();
      return { cloudSaveOnly: true, cloudSaveData };
    } catch (error) {
      logger.log("warn", "saves", "Failed to load found cloud save", error);
      return { cloudSaveOnly: true, cloudSaveData: null };
    }
  } catch (error) {
    logger.log("warn", "saves", "Error checking cloud auth", error);
    return { cloudSaveOnly: false, cloudSaveData: null };
  }
}

async function fetchResolvedSavesFn() {
  const slotPromises = LOCAL_SLOTS.map(fetchLocalSlotData);
  const results = await Promise.all(slotPromises);
  const saveSlots = results.filter(Boolean);

  if (saveSlots.length === 0) {
    const legacy = await fetchLegacySlotData();
    if (legacy) saveSlots.push(legacy);
  }

  const hasSave = saveSlots.length > 0;
  let maxLocalTime = 0;
  let mostRecentSlot = null;

  for (const slot of saveSlots) {
    const t = slot.lastSaveTime || 0;
    if (t > maxLocalTime) {
      maxLocalTime = t;
      mostRecentSlot = slot;
    }
  }

  let dataJSON = null;
  if (mostRecentSlot) {
    const key = mostRecentSlot.slot === "legacy" ? "reactorGameSave" : `reactorGameSave_${mostRecentSlot.slot}`;
    dataJSON = await StorageAdapter.getRaw(key);
  }

  let cloudInfo = { cloudSaveOnly: false, cloudSaveData: null };
  if (!hasSave) {
    cloudInfo = await fetchCloudSaveData();
  }

  let mostRecentSave = null;
  let recentTime = 0;
  for (const saveSlot of saveSlots) {
    if (saveSlot.lastSaveTime && saveSlot.lastSaveTime > recentTime) {
      recentTime = saveSlot.lastSaveTime;
      mostRecentSave = saveSlot;
    }
  }

  return {
    hasSave,
    saveSlots,
    cloudSaveOnly: cloudInfo.cloudSaveOnly,
    cloudSaveData: cloudInfo.cloudSaveData,
    mostRecentSave,
    maxLocalTime,
    dataJSON,
  };
}

export function fetchResolvedSaves() {
  return queryClient.fetchQuery({
    queryKey: queryKeys.saves.resolved(),
    queryFn: fetchResolvedSavesFn,
    staleTime: 10 * 1000,
  });
}

async function fetchCloudSaveSlotsFn() {
  if (!window.supabaseAuth?.isSignedIn?.()) return [];
  const rawCloudSaves = await supabaseSave.getSaves();
  return rawCloudSaves.map((s) => {
    let data = {};
    try {
      const deserialized = deserializeSave(s.save_data);
      const parsed = SaveDataSchema.safeParse(deserialized);
      if (parsed.success) data = parsed.data;
    } catch (_) {}
    return {
      slot: s.slot_id,
      exists: true,
      lastSaveTime: parseInt(s.timestamp),
      totalPlayedTime: data.total_played_time || 0,
      currentMoney: data.current_money || 0,
      exoticParticles: data.exotic_particles ?? data.total_exotic_particles ?? 0,
      data,
      isCloud: true,
    };
  });
}

export function fetchCloudSaveSlots() {
  return queryClient.fetchQuery({
    queryKey: queryKeys.saves.cloud("supabase"),
    queryFn: fetchCloudSaveSlotsFn,
    staleTime: 10 * 1000,
  });
}

export function getSaveStats(data) {
  if (!data || typeof data !== "object") {
    return { money: "0", ep: "0", playtime: "0", timestamp: "Unknown" };
  }
  const money = data.current_money != null ? formatStatNum(data.current_money) : "0";
  const ep =
    data.exotic_particles != null
      ? formatStatNum(data.exotic_particles)
      : data.total_exotic_particles != null
        ? formatStatNum(data.total_exotic_particles)
        : "0";
  const playtime = data.total_played_time != null ? formatDuration(data.total_played_time, false) : "0";
  const ts = data.last_save_time;
  const timestamp = ts ? new Date(Number(ts)).toLocaleString() : "Unknown";
  return { money, ep, playtime, timestamp };
}

function renderCloudConflictTemplate(content, cloud, local, onUseCloud, onUseLocal, onCancel) {
  content.innerHTML = interpolateTemplate(cloudConflictModalTemplate, {
    cloudMoney: cloud.money,
    localMoney: local.money,
    cloudEp: cloud.ep,
    localEp: local.ep,
    cloudPlaytime: cloud.playtime,
    localPlaytime: local.playtime,
    cloudTimestamp: cloud.timestamp,
    localTimestamp: local.timestamp,
  });
  content.querySelector('[data-action="use-cloud"]')?.addEventListener("click", onUseCloud);
  content.querySelector('[data-action="use-local"]')?.addEventListener("click", onUseLocal);
  content.querySelector('[data-action="cancel"]')?.addEventListener("click", onCancel);
}

function renderBackupModalTemplate(content, onLoad, onCancel) {
  content.innerHTML = backupModalTemplate;
  content.querySelector('[data-action="load-backup"]')?.addEventListener("click", onLoad);
  content.querySelector('[data-action="cancel"]')?.addEventListener("click", onCancel);
}

async function parseLocalSaveData() {
  const { dataJSON } = await fetchResolvedSaves();
  if (!dataJSON) return null;
  try {
    return deserializeSave(dataJSON);
  } catch (_) {
    return null;
  }
}

export async function showCloudVsLocalConflictModal(cloudSaveData) {
  const cloud = getSaveStats(cloudSaveData);
  const local = getSaveStats(await parseLocalSaveData());
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    const content = document.createElement("div");
    overlay.appendChild(content);
    renderCloudConflictTemplate(
      content,
      cloud,
      local,
      () => resolveAndClose("cloud"),
      () => resolveAndClose("local"),
      () => resolveAndClose("cancel")
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose("cancel");
    });
    document.body.appendChild(overlay);
  });
}

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    renderBackupModalTemplate(content, () => resolveAndClose(true), () => resolveAndClose(false));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose(false);
    });
    document.body.appendChild(overlay);
  });
}

export class GameSaveManager {
  constructor(saveOrchestrator, getPersistenceContext) {
    this.saveOrchestrator = saveOrchestrator;
    this.getPersistenceContext = getPersistenceContext;
  }

  async getSaveState() {
    return await this.saveOrchestrator.getSaveState();
  }

  async saveToSlot(slot) {
    const effectiveSlot = slot ?? (await this.getNextSaveSlot());
    await this._saveGame(effectiveSlot, false);
  }

  async autoSave() {
    await this._saveGame(null, true);
  }

  async _saveGame(slot = null, isAutoSave = false) {
    const ctx = this.getPersistenceContext();
    if (ctx.isSandbox) return;

    logger.log("debug", "game", `Attempting to save game. Meltdown state: ${ctx.hasMeltedDown}`);
    try {
      ctx.debugHistory.add("game", "saveGame called", { slot, isAutoSave, meltdown: ctx.hasMeltedDown });
      if (ctx.hasMeltedDown) {
        if ((ctx.peakPower > 0 || ctx.peakHeat > 0) && !ctx.cheatsUsed) {
          leaderboardService.saveRun({
            user_id: ctx.userId,
            run_id: ctx.runId,
            heat: ctx.peakHeat,
            power: ctx.peakPower,
            money:
              ctx.currentMoney && typeof ctx.currentMoney.toNumber === "function"
                ? ctx.currentMoney.toNumber()
                : Number(ctx.currentMoney),
            time: ctx.totalPlayedTime,
            layout: JSON.stringify(ctx.getCompactLayout()),
          });
        }
        return;
      }

      ctx.updateSessionTime();
      if ((ctx.peakPower > 0 || ctx.peakHeat > 0) && !ctx.cheatsUsed) {
        leaderboardService.saveRun({
          user_id: ctx.userId,
          run_id: ctx.runId,
          heat: ctx.peakHeat,
          power: ctx.peakPower,
          money:
            ctx.currentMoney && typeof ctx.currentMoney.toNumber === "function"
              ? ctx.currentMoney.toNumber()
              : Number(ctx.currentMoney),
          time: ctx.totalPlayedTime,
          layout: JSON.stringify(ctx.getCompactLayout()),
        });
      }

      const saveData = await this.getSaveState();
      const effectiveSlot = await saveGameMutation({
        slot,
        saveData,
        getNextSaveSlot: () => this.getNextSaveSlot(),
      });

      if (effectiveSlot != null) {
        logger.log("debug", "game", `Game state saved to slot ${effectiveSlot}.`);
        ctx.debugHistory.add("game", "Game saved", { slot: effectiveSlot });
      }
    } catch (error) {
      logger.log("error", "game", "Error saving game:", error);
    }
  }

  async getNextSaveSlot() {
    const currentSlot = Number((await StorageAdapter.get("reactorCurrentSaveSlot")) ?? 1);
    return (currentSlot % 3) + 1;
  }

  async getSaveSlotInfo(slot) {
    try {
      const savedData = await StorageAdapter.get(`reactorGameSave_${slot}`, SaveDataSchema);
      if (savedData != null) {
        return {
          exists: true,
          lastSaveTime: savedData.last_save_time || null,
          totalPlayedTime: savedData.total_played_time || 0,
          currentMoney: savedData.current_money || 0,
          exoticParticles: savedData.exotic_particles ?? savedData.total_exotic_particles ?? 0,
          data: savedData,
        };
      }
    } catch (error) {
      logger.log("error", "game", `Error reading save slot ${slot}:`, error);
    }
    return { exists: false };
  }

  async getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const slotInfo = await this.getSaveSlotInfo(i);
      slots.push({ slot: i, ...slotInfo });
    }
    return slots;
  }

  async loadGame(slot = null) {
    const ctx = this.getPersistenceContext();
    ctx.debugHistory.add("game", "loadGame called", { slot });

    try {
      let key;
      let rawData;

      if (slot !== null) {
        key = `reactorGameSave_${slot}`;
        rawData = await StorageAdapter.getRaw(key);
      } else {
        const slots = await this.getAllSaveSlots();
        const mostRecent = slots
          .filter((s) => s.exists)
          .sort((a, b) => (b.lastSaveTime || 0) - (a.lastSaveTime || 0))[0];
        if (mostRecent) {
          key = `reactorGameSave_${mostRecent.slot}`;
          rawData = await StorageAdapter.getRaw(key);
        } else {
          key = "reactorGameSave";
          rawData = await StorageAdapter.getRaw(key);
        }
      }

      if (!rawData) {
        if (slot === 1 && (await getBackupSaveForSlot1Async())) {
          return { success: false, parseError: true, backupAvailable: true };
        }
        return false;
      }

      const validatedData = parseAndValidateSave(rawData);
      ctx.debugHistory.add("game", "Applying save data from slot", { slot, version: validatedData.version });
      await ctx.applySaveState(validatedData);
      return true;
    } catch (error) {
      logger.log("error", "game", `Save corrupted or load failed for slot ${slot ?? "default"}:`, error);
      if (slot === 1 && (await getBackupSaveForSlot1Async())) {
        return { success: false, parseError: true, backupAvailable: true };
      }
      return false;
    }
  }

  validateSaveData(data) {
    return parseAndValidateSave(data);
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
      await applySaveState(game, savedData);
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

