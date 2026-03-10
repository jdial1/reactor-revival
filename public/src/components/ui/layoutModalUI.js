import { html } from "lit-html";
import { styleMap } from "../../utils/litHelpers.js";
import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { BlueprintSchema } from "../../core/schemas.js";

export const layoutViewTemplate = (layoutJson, stats, game, onClose) => {
  try {
    const parsed = JSON.parse(layoutJson);
    const validation = BlueprintSchema.safeParse(parsed);
    if (!validation.success) {
      logger.log("error", "ui", "Invalid blueprint format:", validation.error);
      return html`
        <div class="layout-view-modal-overlay" style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.9);" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div class="layout-view-error" style="color: #fff; padding: 20px;">Invalid layout format</div>
        </div>
      `;
    }
    const { size, parts } = validation.data;
    const rows = size.rows;
    const cols = size.cols;
    const gridStyle = styleMap({
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 32px)`,
      gridTemplateRows: `repeat(${rows}, 32px)`,
      gap: "1px",
      backgroundColor: "#222",
      border: "2px solid #444",
      padding: "2px",
    });
    const partMap = new Map();
    parts.forEach((p) => partMap.set(`${p.r},${p.c}`, p));
    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let cellContent = "";
        const cellStyle = {
          width: "32px",
          height: "32px",
          backgroundColor: "#333",
          border: "1px solid #111",
          boxSizing: "border-box",
        };
        let title = `(${r}, ${c})`;
        const partData = partMap.get(`${r},${c}`);
        if (partData) {
          const partId = partData.id;
          const partDef = game?.partset?.getPartById(partId);
          if (partDef) {
            const imgPath = partDef.getImagePath();
            cellStyle.backgroundImage = `url('${imgPath}')`;
            cellStyle.backgroundSize = "contain";
            cellStyle.backgroundPosition = "center";
            cellStyle.backgroundRepeat = "no-repeat";
            title = `${partDef.title} (${r}, ${c})`;
            if (partDef.category === "cell") {
              cellStyle.backgroundColor = "#2a2a2a";
            }
          } else {
            cellContent = "?";
            cellStyle.display = "flex";
            cellStyle.alignItems = "center";
            cellStyle.justifyContent = "center";
            cellStyle.color = "#666";
            cellStyle.fontSize = "10px";
          }
        }
        cells.push(html`<div style=${styleMap(cellStyle)} title=${title}>${cellContent}</div>`);
      }
    }

    return html`
      <div
        class="layout-view-modal-overlay"
        style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; background: rgba(0, 0, 0, 0.9);"
        @click=${(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div style="display: flex; overflow: hidden; flex: 1; flex-direction: column; margin: auto; max-width: 90vw;">
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; border-bottom: 2px solid rgb(68, 68, 68);">
            <h3 style="margin: 0; color: rgb(255, 255, 255);">Reactor Layout</h3>
            <button
              title="Close"
              style="padding: 5px 15px; border: 1px solid rgb(102, 102, 102); background: rgb(68, 68, 68); color: rgb(255, 255, 255); cursor: pointer; font-size: 20px;"
              @click=${onClose}
            >
              ×
            </button>
          </div>
          <div style="display: flex; overflow: auto; flex: 1; align-items: center; justify-content: center; padding: 20px;">
            <div style=${gridStyle}>${cells}</div>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-around; padding: 15px; border-top: 2px solid rgb(68, 68, 68); background: rgb(26, 26, 26); color: rgb(255, 255, 255); font-size: 18px; flex-wrap: wrap; gap: 10px;">
            <div><strong>Money:</strong> $${fmt(stats?.money || 0)}</div>
            <div><strong>EP:</strong> ${fmt(stats?.ep || 0)}</div>
            <div><strong>Heat:</strong> ${fmt(stats?.heat || 0)}</div>
            <div><strong>Power:</strong> ${fmt(stats?.power || 0)}</div>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    logger.log("error", "ui", "Failed to render layout preview:", e);
    return html`
      <div class="layout-view-modal-overlay" style="position: fixed; z-index: 10000; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.9);" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div class="layout-view-error" style="color: #fff; padding: 20px;">Error rendering layout</div>
      </div>
    `;
  }
};
