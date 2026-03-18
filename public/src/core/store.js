import { proxy, ref, snapshot, subscribe } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { derive } from "derive-valtio";
import { toDecimal, toNumber, StorageUtils } from "../utils/utils_constants.js";
import {
  MOBILE_BREAKPOINT_PX,
  UserPreferencesSchema,
} from "../utils/utils_constants.js";

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
