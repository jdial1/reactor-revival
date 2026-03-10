import { proxy } from "valtio/vanilla";
import { subscribeKey } from "./store.js";
import { StorageUtils } from "../utils/util.js";
import { MOBILE_BREAKPOINT_PX } from "./constants.js";

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
