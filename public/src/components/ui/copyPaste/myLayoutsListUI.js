import { html, render } from "lit-html";
import { repeat } from "../../../utils/litHelpers.js";

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

function layoutsListTemplate(ui, list, modalEl, fmt, onAfterDelete) {
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
                  <button class="pixel-btn my-layout-view-btn" type="button" @click=${() => ui.layoutModalUI.showLayoutModal(entry.data, {})}>View</button>
                  <button class="pixel-btn my-layout-load-btn" type="button" @click=${() => {
                    modalEl.classList.add("hidden");
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

export function renderMyLayoutsList(ui, list, containerEl, modalEl, fmt, onAfterDelete) {
  render(layoutsListTemplate(ui, list, modalEl, fmt, onAfterDelete), containerEl);
}
