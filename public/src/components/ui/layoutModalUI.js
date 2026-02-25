import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

export class LayoutModalUI {
  constructor(ui) {
    this.ui = ui;
  }

  showLayoutModal(layoutJson, stats = {}) {
    const ui = this.ui;
    const modal = document.getElementById("layout_view_modal");
    const gridContainer = document.getElementById("layout_view_grid");
    if (!modal || !gridContainer) return;

    try {
      const layout = JSON.parse(layoutJson);
      const { size, parts } = layout;
      const rows = size.rows;
      const cols = size.cols;

      gridContainer.innerHTML = '';
      gridContainer.style.display = 'grid';
      gridContainer.style.gridTemplateColumns = `repeat(${cols}, 32px)`;
      gridContainer.style.gridTemplateRows = `repeat(${rows}, 32px)`;
      gridContainer.style.gap = '1px';
      gridContainer.style.backgroundColor = '#222';
      gridContainer.style.border = '2px solid #444';
      gridContainer.style.padding = '2px';

      const partMap = new Map();
      parts.forEach(p => partMap.set(`${p.r},${p.c}`, p));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('div');
          cell.style.width = '32px';
          cell.style.height = '32px';
          cell.style.backgroundColor = '#333';
          cell.style.border = '1px solid #111';
          cell.style.boxSizing = 'border-box';
          cell.title = `(${r}, ${c})`;

          const partData = partMap.get(`${r},${c}`);
          if (partData) {
            const partId = partData.id;
            const partDef = ui.game?.partset?.getPartById(partId);

            if (partDef) {
              const imgPath = partDef.getImagePath();
              cell.style.backgroundImage = `url('${imgPath}')`;
              cell.style.backgroundSize = 'contain';
              cell.style.backgroundPosition = 'center';
              cell.style.backgroundRepeat = 'no-repeat';
              cell.title = `${partDef.title} (${r}, ${c})`;

              if (partDef.category === 'cell') {
                cell.style.backgroundColor = '#2a2a2a';
              }
            } else {
              cell.textContent = '?';
              cell.style.display = 'flex';
              cell.style.alignItems = 'center';
              cell.style.justifyContent = 'center';
              cell.style.color = '#666';
              cell.style.fontSize = '10px';
            }
          }

          gridContainer.appendChild(cell);
        }
      }

      const moneyEl = document.getElementById("layout_stats_money");
      const epEl = document.getElementById("layout_stats_ep");
      const heatEl = document.getElementById("layout_stats_heat");
      const powerEl = document.getElementById("layout_stats_power");

      if (moneyEl) moneyEl.textContent = `$${fmt(stats.money || 0)}`;
      if (epEl) epEl.textContent = fmt(stats.ep || 0);
      if (heatEl) heatEl.textContent = fmt(stats.heat || 0);
      if (powerEl) powerEl.textContent = fmt(stats.power || 0);

      modal.dataset.layout = layoutJson;
      modal.style.display = 'flex';
      modal.classList.remove("hidden");
      const layoutCloseBtn = document.getElementById("layout_view_close_btn");
      if (layoutCloseBtn) layoutCloseBtn.onclick = () => { modal.classList.add("hidden"); modal.style.display = "none"; };

    } catch (e) {
      logger.log('error', 'ui', 'Failed to render layout preview:', e);
    }
  }
}
