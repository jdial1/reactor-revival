import { MODAL_IDS } from "../modalIds.js";
import { deserializeReactor, calculateLayoutCostFromData } from "../domain/blueprint.js";
import {
  emptyLayoutsListTemplate,
  myLayoutsModalTemplate,
  myLayoutsTableRowTemplate,
  layoutViewModalTemplate,
  layoutsListTemplate as myLayoutsListTemplate,
} from "../templates/uiComponentsTemplates.js";
import { addToMyLayouts, removeFromMyLayouts } from "./ui-layout-storage.js";

function getLayoutCost(entryData, game, fmtFn) {
  return calculateLayoutCostFromData(entryData, game, fmtFn);
}

function layoutsListTemplate(ui, list, fmtFn, onAfterDelete) {
  if (list.length === 0) {
    return emptyLayoutsListTemplate();
  }
  return myLayoutsListTemplate({
    list,
    renderRow: (entry) => {
      const costStr = getLayoutCost(entry.data, ui.game, fmtFn);
      return myLayoutsTableRowTemplate({
        entryId: entry.id,
        name: entry.name,
        costStr,
        onView: () => ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, { layoutJson: entry.data, stats: {} }),
        onLoad: () => {
          ui.modalOrchestrator.hideModal(MODAL_IDS.MY_LAYOUTS);
          ui._showPasteModalWithData(entry.data);
        },
        onDelete: () => {
          removeFromMyLayouts(entry.id);
          if (typeof onAfterDelete === "function") onAfterDelete();
        },
      });
    },
  });
}

export function myLayoutsTemplate(ui, list, fmtFn, onClose) {
  const onSaveFromClipboard = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    const data = result.success ? result.data : "";
    const layout = deserializeReactor(data);
    if (!layout) return;

    const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
    addToMyLayouts(name.trim() || defaultName, data);
    ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  };

  return myLayoutsModalTemplate({
    onClose,
    onSaveFromClipboard,
    listContent: layoutsListTemplate(ui, list, fmtFn, () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS)),
  });
}
const heatVisualOverlays = new WeakMap();

export const layoutViewTemplate = (layoutJson, stats, game, onClose) => {
  let parsed = null;
  try {
    parsed = typeof layoutJson === "string" ? JSON.parse(layoutJson) : layoutJson;
  } catch (_) {}
  const jsonText = parsed ? JSON.stringify(parsed, null, 2) : "Invalid layout format";
  return layoutViewModalTemplate({ onClose, jsonText, stats });
};
