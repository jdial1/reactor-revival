import { html, render } from "lit-html";
import { styleMap } from "../../utils/litHelpers.js";
import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { BlueprintSchema } from "../../core/schemas.js";

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
      const parsed = JSON.parse(layoutJson);
      const validation = BlueprintSchema.safeParse(parsed);
      if (!validation.success) {
        logger.log('error', 'ui', 'Invalid blueprint format:', validation.error);
        return;
      }

      const { size, parts } = validation.data;
      const rows = size.rows;
      const cols = size.cols;

      const gridStyle = styleMap({
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 32px)`,
        gridTemplateRows: `repeat(${rows}, 32px)`,
        gap: '1px',
        backgroundColor: '#222',
        border: '2px solid #444',
        padding: '2px'
      });

      const partMap = new Map();
      parts.forEach(p => partMap.set(`${p.r},${p.c}`, p));

      const cells = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let cellContent = '';
          const cellStyle = {
            width: '32px',
            height: '32px',
            backgroundColor: '#333',
            border: '1px solid #111',
            boxSizing: 'border-box'
          };
          let title = `(${r}, ${c})`;

          const partData = partMap.get(`${r},${c}`);
          if (partData) {
            const partId = partData.id;
            const partDef = ui.game?.partset?.getPartById(partId);
            if (partDef) {
              const imgPath = partDef.getImagePath();
              cellStyle.backgroundImage = `url('${imgPath}')`;
              cellStyle.backgroundSize = 'contain';
              cellStyle.backgroundPosition = 'center';
              cellStyle.backgroundRepeat = 'no-repeat';
              title = `${partDef.title} (${r}, ${c})`;
              if (partDef.category === 'cell') {
                cellStyle.backgroundColor = '#2a2a2a';
              }
            } else {
              cellContent = '?';
              cellStyle.display = 'flex';
              cellStyle.alignItems = 'center';
              cellStyle.justifyContent = 'center';
              cellStyle.color = '#666';
              cellStyle.fontSize = '10px';
            }
          }
          cells.push(html`<div style=${styleMap(cellStyle)} title=${title}>${cellContent}</div>`);
        }
      }

      render(html`<div style=${gridStyle}>${cells}</div>`, gridContainer);

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
