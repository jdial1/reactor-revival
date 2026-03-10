import { html } from "lit-html";
import { repeat } from "../../../utils/litHelpers.js";
import { MODAL_IDS } from "../../ModalManager.js";

function getLayoutCost(entryData, ui, fmt) {
  try {
    const parsed = typeof entryData === "string" ? JSON.parse(entryData) : entryData;
    const layout2D = ui.sandboxUI.compactTo2DLayout(parsed);
    if (!layout2D || !ui.game?.partset) return "-";
    const cost = layout2D.flatMap((row) => row || []).filter((cell) => cell?.id).reduce((sum, cell) => {
      const part = ui.game.partset.parts.get(cell.id);
      return sum + (part ? part.cost * (cell.lvl || 1) : 0);
    }, 0);
    return cost > 0 ? fmt(cost) : "-";
  } catch {
    return "-";
  }
}

function layoutsListTemplate(ui, list, fmt, onAfterDelete) {
  if (list.length === 0) {
    return html`<p style="color: rgb(180 180 180); margin: 0;">No saved layouts. Copy a reactor layout to add it here.</p>`;
  }
  return html`
    <table id="my_layouts_list_table">
      <thead><tr><th>Name</th><th>Cost</th><th></th></tr></thead>
      <tbody>
        ${repeat(
          list,
          (e) => e.id,
          (entry) => {
            const costStr = getLayoutCost(entry.data, ui, fmt);
            return html`
              <tr data-id=${entry.id}>
                <td>${entry.name}</td>
                <td>${costStr}</td>
                <td class="my-layout-actions">
                  <button class="pixel-btn my-layout-view-btn" type="button" @click=${() => ui.modalOrchestrator.showModal(MODAL_IDS.LAYOUT_VIEW, { layoutJson: entry.data, stats: {} })}>View</button>
                  <button class="pixel-btn my-layout-load-btn" type="button" @click=${() => {
                    ui.modalOrchestrator.hideModal(MODAL_IDS.MY_LAYOUTS);
                    ui._showPasteModalWithData(entry.data);
                  }}>Load</button>
                  <button class="pixel-btn my-layout-delete-btn" type="button" @click=${() => {
                    ui.layoutStorageUI.removeFromMyLayouts(entry.id);
                    if (typeof onAfterDelete === "function") onAfterDelete();
                  }}>Delete</button>
                </td>
              </tr>
            `;
          }
        )}
      </tbody>
    </table>
  `;
}

export const myLayoutsTemplate = (ui, list, fmt, onClose) => {
  const onSaveFromClipboard = async () => {
    const result = await ui.clipboardUI.readFromClipboard();
    const data = result.success ? result.data : "";
    const BlueprintService = (await import("../../../core/services/BlueprintService.js")).BlueprintService;
    const bpService = new BlueprintService(ui.game);
    const layout = bpService.deserialize(data);
    if (!layout) return;

    const defaultName = `Layout ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
    ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, data);
    ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS);
  };

  return html`
    <div
      id="my_layouts_modal"
      class="modal-overlay"
      style="position: fixed; z-index: 1000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background-color: rgb(0 0 0 / 80%);"
      @click=${(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="modal-content" style="position: relative; max-width: 90%; max-height: 90%; padding: 0; border: 2px solid rgb(51, 51, 51); border-radius: 8px; background-color: rgb(26, 26, 26); overflow-y: auto;">
        <div class="modal-header" style="display: flex; align-items: center; justify-content: space-between; padding: 15px 20px; border-radius: 8px 8px 0 0; border-bottom: 1px solid rgb(51, 51, 51); background: rgb(34, 34, 34);">
          <h3 style="margin: 0; color: rgb(74, 158, 255); font-size: 18px;">My Layouts</h3>
          <button id="my_layouts_close_btn" title="Close" aria-label="Close" style="background:transparent; border:none; color:white; font-size:1.2rem; cursor:pointer;" @click=${onClose}>×</button>
        </div>
        <div class="my-layouts-toolbar" style="display: flex; padding: 12px 20px; border-bottom: 1px solid rgb(51, 51, 51); background: rgb(34, 34, 34);">
          <button id="my_layouts_save_from_clipboard_btn" class="pixel-btn" type="button" @click=${onSaveFromClipboard}>Save from Clipboard</button>
        </div>
        <div id="my_layouts_list" style="padding: 20px;">
          ${layoutsListTemplate(ui, list, fmt, () => ui.modalOrchestrator.showModal(MODAL_IDS.MY_LAYOUTS))}
        </div>
      </div>
    </div>
  `;
};
