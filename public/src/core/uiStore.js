import { proxy } from "valtio/vanilla";
import { subscribeKey } from "./store.js";
import { StorageUtils } from "../utils/util.js";
import { MOBILE_BREAKPOINT_PX } from "./constants.js";

export function createUIState() {
  const isMobileOnInit = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const copyPasteCollapsed = StorageUtils.get("reactor_copy_paste_collapsed") === true;
  return proxy({
    parts_panel_collapsed: isMobileOnInit,
    parts_panel_right_side: false,
    objectives_toast_expanded: false,
    copy_paste_collapsed: copyPasteCollapsed,
    active_modal_id: null,
    hovered_entity: null,
    active_parts_tab: "power",
    active_page: "reactor_section",
  });
}

export function initUIStateSubscriptions(uiState, ui) {
  const unsubs = [];
  unsubs.push(subscribeKey(uiState, "copy_paste_collapsed", () => {
    StorageUtils.set("reactor_copy_paste_collapsed", uiState.copy_paste_collapsed);
    const btns = document.getElementById("reactor_copy_paste_btns");
    if (btns) btns.classList.toggle("collapsed", uiState.copy_paste_collapsed);
  }));
  unsubs.push(subscribeKey(uiState, "parts_panel_collapsed", () => {
    const section = document.getElementById("parts_section");
    if (section) section.classList.toggle("collapsed", uiState.parts_panel_collapsed);
    ui.partsPanelUI?.updatePartsPanelBodyClass?.();
  }));
  unsubs.push(subscribeKey(uiState, "active_parts_tab", (tabId) => {
    const partsTabsContainer = document.querySelector(".parts_tabs");
    if (!partsTabsContainer) return;
    const tabButtons = partsTabsContainer.querySelectorAll(".parts_tab");
    const tabContents = document.querySelectorAll(".parts_tab_content");
    tabButtons.forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tab") === tabId);
    });
    tabContents.forEach((c) => {
      const contentTabId = c.id?.replace("parts_tab_", "") ?? "";
      c.classList.toggle("active", contentTabId === tabId);
    });
    ui.partsPanelUI?.onActiveTabChanged?.(tabId);
  }));
  return () => unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
}
