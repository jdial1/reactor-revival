import { proxy } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import { render } from "lit-html";
import { StorageUtils } from "../storage/index.js";
import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import { syncReactorHeatVisualDom } from "../components/shell/heat-dom-sync.js";
import { getUiElement, isShopOverlayPage, isSimVisiblePage } from "../components/shell/page-dom.js";
import { dispatchToggleIntent } from "../components/grid/ui-intents.js";
import { statusNoticeSlotTemplate } from "../templates/pageShellTemplates.js";
import { teardownAll } from "../core/teardown.js";

const LEGAL_PAGE_IDS = new Set(["privacy_policy_section", "terms_of_service_section"]);

function tileKey(row, col) {
  return row != null && col != null ? `${row},${col}` : null;
}

export function createUIState() {
  const isMobileOnInit = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const copyPasteCollapsed = StorageUtils.get("reactor_copy_paste_collapsed") !== false;
  return proxy({
    performance_stats: { fps: 0, tps: 0, fps_color: "rgb(93 156 81)", tps_color: "rgb(93 156 81)" },
    stats: { vent: 0, power: 0, heat: 0, money: 0, ep: 0 },
    is_paused: false,
    is_melting_down: false,
    meltdown_buildup: false,
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
    leaderboard_sort: "power",
    parts_panel_collapsed: isMobileOnInit,
    parts_panel_right_side: false,
    objectives_toast_expanded: false,
    copy_paste_collapsed: copyPasteCollapsed,
    active_modal_id: null,
    hovered_entity: null,
    active_parts_tab: "power",
    active_page: "reactor_section",
    active_route: "reactor_section",
    interaction: {
      isDragging: false,
      hoveredTileKey: null,
      sellingTileKey: null,
      selectedPartId: null,
      selectedUpgradeId: null,
      placementMacro: null,
    },
    copy_paste_display: { blueprintPlannerActive: false },
    layout_css_grid: true,
    grid_layout: { cols: 0, rows: 0, tile_size_px: 0 },
    grid_shell_width: 0,
    grid_shell_height: 0,
    user_account_display: { icon: "💾", title: "Local saves" },
    copy_state_feedback: null,
    section_counts: {},
    core_danger: 0,
    heat_ratio: 0,
    has_affordable_upgrades: false,
    has_affordable_research: false,
    upgrades_banner_visibility: { upgradesHidden: true, researchHidden: true },
    version_display: { about: "", app: "" },
    sound_warning_value: 50,
    sell_modal_display: { title: "", confirmLabel: "" },
    user_account_feedback: { text: "", isError: false },
    fullscreen_display: { icon: "⛶", title: "Toggle Fullscreen" },
    copy_paste_modal_display: { title: "", confirmLabel: "" },
    tutorial_claim_step: false,
    active_notice: null,
    grid_dirty_tile: null,
    visual_fx: [],
    tile_fx: [],
    is_mobile_viewport: isMobileOnInit,
  });
}

export function resolveTileFromKey(game, key) {
  if (!key || !game?.tileset) return null;
  const [r, c] = key.split(",").map(Number);
  if (r == null || c == null || isNaN(r) || isNaN(c)) return null;
  return game.tileset.getTile(r, c) ?? null;
}

export { tileKey };

export function buildShellClassMap(uiState, shellModalUi = modalUi, { hasSession = true, game = null } = {}) {
  const activePageId = uiState?.active_page ?? "reactor_section";
  const pageBase = activePageId.replace("_section", "");
  const heatRatio = uiState?.heat_ratio ?? 0;
  const heatBalanced = game?.state?.heat_balanced;
  return {
    hidden: !hasSession,
    "game-paused": !!uiState?.is_paused,
    "reactor-meltdown": !!uiState?.is_melting_down,
    "meltdown-buildup": !!uiState?.meltdown_buildup,
    "crt-heat-tearing": heatRatio >= 1.3 && heatBalanced === false,
    "blueprint-planner-active": !!uiState?.copy_paste_display?.blueprintPlannerActive,
    "parts-panel-open": !uiState?.parts_panel_collapsed,
    "parts-panel-right": !!uiState?.parts_panel_right_side,
    "copy-paste-collapsed": !!uiState?.copy_paste_collapsed,
    "reactor-engineering-mode": !uiState?.parts_panel_collapsed,
    "tutorial-claim-step": !!uiState?.tutorial_claim_step,
    "modal-drawer-open": !!shellModalUi?.drawerOpen,
    [`page-${pageBase}`]: true,
    "page-legal": LEGAL_PAGE_IDS.has(activePageId),
    "shop-overlay-open": isShopOverlayPage(activePageId),
    "page-reactor": isSimVisiblePage(activePageId),
  };
}

export function buildShellStyleMap(uiState, game = null) {
  const cd = uiState?.core_danger ?? 0;
  const heatRatio = uiState?.heat_ratio ?? 0;
  const heatNorm = Math.min(1, Math.max(0, heatRatio / 1.5));
  const dur = `${20 - heatNorm * 12}s`;

  let doctrineColor = undefined;
  if (game?.tech_tree && game.upgradeset?.techTrees) {
    const tree = game.upgradeset.techTrees.find(t => t.id === game.tech_tree);
    if (tree?.color) doctrineColor = tree.color;
  }

  return {
    "--core-danger": String(cd),
    "--crt-heat": String(heatNorm),
    "--crt-jitter-duration": dur,
    "--heat-ratio": String(cd),
    ...(doctrineColor ? { "--doctrine-color": doctrineColor } : {}),
  };
}

export function applyBodyClassesFromUiState(_uiState) {}

function resolveSubscriptionDom(ui, dom, key, id) {
  const cached = dom[key];
  if (cached?.isConnected) return cached;
  const el = getUiElement(ui, id);
  dom[key] = el;
  return el;
}

export function initUIStateSubscriptions(uiState, ui) {
  const unsubs = [];
  const dom = {
    reactorBackground: getUiElement(ui, "reactor_background"),
    main: getUiElement(ui, "main"),
    mainTopNav: getUiElement(ui, "main_top_nav"),
    bottomNav: getUiElement(ui, "bottom_nav"),
    appRoot: getUiElement(ui, "app_root"),
  };
  const persistCopyPasteCollapsed = () => {
    StorageUtils.set("reactor_copy_paste_collapsed", uiState.copy_paste_collapsed);
  };
  persistCopyPasteCollapsed();
  unsubs.push(subscribeKey(uiState, "copy_paste_collapsed", persistCopyPasteCollapsed));
  const syncPartsPanelDerived = () => {
    ui.updatePartsPanelBodyClass?.();
  };
  syncPartsPanelDerived();
  unsubs.push(subscribeKey(uiState, "parts_panel_collapsed", syncPartsPanelDerived));
  unsubs.push(subscribeKey(uiState, "active_parts_tab", () => {
    ui.refreshPartsPanel?.();
  }));
  const syncPartActive = () => {
    const main = resolveSubscriptionDom(ui, dom, "main", "main");
    if (main) main.classList.toggle("part_active", !!uiState.interaction?.selectedPartId);
  };
  syncPartActive();
  unsubs.push(subscribeKey(uiState.interaction, "selectedPartId", syncPartActive));
  const syncMobileViewport = () => {
    if (typeof window === "undefined") return;
    uiState.is_mobile_viewport = window.innerWidth <= MOBILE_BREAKPOINT_PX;
    const mobileTopBar = getUiElement(ui, "mobile_top_bar");
    if (mobileTopBar) {
      mobileTopBar.classList.toggle("active", uiState.is_mobile_viewport);
      mobileTopBar.setAttribute("aria-hidden", uiState.is_mobile_viewport ? "false" : "true");
    }
  };
  syncMobileViewport();
  if (typeof window !== "undefined") {
    const onResize = () => syncMobileViewport();
    window.addEventListener("resize", onResize);
    unsubs.push(() => window.removeEventListener("resize", onResize));
  }
  const syncNavAndPageClass = () => {
    const activePageId = uiState.active_page;
    if (!activePageId) return;
    const topNav = resolveSubscriptionDom(ui, dom, "mainTopNav", "main_top_nav");
    const bottomNav = resolveSubscriptionDom(ui, dom, "bottomNav", "bottom_nav");
    [topNav, bottomNav].forEach((navContainer) => {
      if (!navContainer) return;
      navContainer.querySelectorAll("button[data-page]").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.page === activePageId);
      });
    });
  };
  syncNavAndPageClass();
  unsubs.push(subscribeKey(uiState, "active_route", (route) => {
    if (typeof window === "undefined" || !route) return;
    const cur = window.location.hash.replace(/^#/, "");
    if (cur !== route) window.location.hash = route;
  }));
  unsubs.push(subscribeKey(uiState, "active_page", (pageId) => {
    syncNavAndPageClass();
    if (pageId !== "upgrades_section" && pageId !== "experimental_upgrades_section") {
      uiState.interaction.selectedUpgradeId = null;
    }
    if (pageId === "reactor_section") {
      dom.reactorBackground = getUiElement(ui, "reactor_background");
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
  unsubs.push(subscribeKey(uiState, "grid_dirty_tile", (key) => {
    if (!key) return;
    const [r, c] = key.split(",").map(Number);
    if (Number.isFinite(r) && Number.isFinite(c)) ui.gridCanvasRenderer?.markTileDirty?.(r, c);
  }));
  unsubs.push(subscribeKey(uiState, "is_paused", (val) => {
    if (!ui.game?.state || !!ui.game.state.pause === !!val) return;
    dispatchToggleIntent(ui.game, "pause", !!val);
  }));
  unsubs.push(subscribeKey(uiState, "heat_ratio", (heatRatio) => {
    const st = ui.game?.state;
    syncReactorHeatVisualDom(ui, heatRatio, st?.stats_net_heat, st?.stats_heat_generation);
  }));
  if (ui.game?.state) {
    const syncHeatBalanced = () => {
      const st = ui.game.state;
      const heatRatio = uiState.heat_ratio;
      syncReactorHeatVisualDom(ui, heatRatio, st.stats_net_heat, st.stats_heat_generation);
    };
    unsubs.push(subscribeKey(ui.game.state, "stats_net_heat", syncHeatBalanced));
    unsubs.push(subscribeKey(ui.game.state, "stats_heat_generation", syncHeatBalanced));
    unsubs.push(subscribeKey(ui.game.state, "heat_balanced", syncHeatBalanced));
  }
  syncReactorHeatVisualDom(ui, uiState.heat_ratio, ui.game?.state?.stats_net_heat, ui.game?.state?.stats_heat_generation);
  const syncStatusNotice = () => {
    const root = getUiElement(ui, "status_notice_root");
    if (!root) return;
    render(statusNoticeSlotTemplate(uiState.active_notice), root);
    const inner = root.querySelector("#status_notice_inner");
    if (inner) {
      requestAnimationFrame(() => inner.classList.add("decompression-saved-toast__panel--visible"));
    }
  };
  syncStatusNotice();
  unsubs.push(subscribeKey(uiState, "active_notice", syncStatusNotice));
  return () => teardownAll(unsubs);
}

export const modalUi = proxy({ activeModal: null, payload: null, drawerOpen: false });

export const pwaState = proxy({
  installPromptAvailable: false,
  updateAvailable: false,
  updateVersion: "",
  currentVersion: "",
  changelogOpen: false,
  changelogPayload: null,
  versionCheckToast: null,
  versionCheckRequested: false,
  hasAcknowledgedUpdate: false,
});
