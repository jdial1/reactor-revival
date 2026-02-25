const EMPTY_MESSAGE = '<p style="color: rgb(180 180 180); margin: 0;">No saved layouts. Copy a reactor layout to add it here.</p>';

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

export function renderMyLayoutsList(ui, list, containerEl, modalEl, fmt, escapeHtml, onAfterDelete) {
  if (list.length === 0) {
    containerEl.innerHTML = EMPTY_MESSAGE;
    return;
  }
  let tableHtml = '<table id="my_layouts_list_table"><thead><tr><th>Name</th><th>Cost</th><th></th></tr></thead><tbody>';
  list.forEach((entry) => {
    const costStr = getLayoutCost(entry.data, ui, fmt);
    tableHtml += `<tr data-id="${escapeHtml(entry.id)}"><td>${escapeHtml(entry.name)}</td><td>${costStr}</td><td class="my-layout-actions"><button class="pixel-btn my-layout-view-btn" type="button">View</button><button class="pixel-btn my-layout-load-btn" type="button">Load</button><button class="pixel-btn my-layout-delete-btn" type="button">Delete</button></td></tr>`;
  });
  tableHtml += "</tbody></table>";
  containerEl.innerHTML = tableHtml;
  containerEl.querySelectorAll(".my-layout-view-btn").forEach((btn) => {
    const row = btn.closest("tr");
    const id = row?.dataset.id;
    const entry = list.find((e) => e.id === id);
    if (entry) btn.onclick = () => ui.layoutModalUI.showLayoutModal(entry.data, {});
  });
  containerEl.querySelectorAll(".my-layout-load-btn").forEach((btn) => {
    const row = btn.closest("tr");
    const id = row?.dataset.id;
    const entry = list.find((e) => e.id === id);
    if (entry) {
      btn.onclick = () => {
        modalEl.classList.add("hidden");
        ui._showPasteModalWithData(entry.data);
      };
    }
  });
  containerEl.querySelectorAll(".my-layout-delete-btn").forEach((btn) => {
    const row = btn.closest("tr");
    const id = row?.dataset.id;
    if (id) {
      btn.onclick = () => {
        ui.layoutStorageUI.removeFromMyLayouts(id);
        if (typeof onAfterDelete === "function") onAfterDelete();
      };
    }
  });
}
