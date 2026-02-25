import { html, render } from "lit-html";
import { getPartImagePath } from "../../utils/partImageUtils.js";

function mergeComponents(summary, checkedTypes) {
  const merged = {};
  summary.forEach(item => {
    const key = `${item.type}_${item.lvl}`;
    if (!merged[key]) {
      merged[key] = { ...item, count: 0, ids: [] };
    }
    merged[key].count += item.count ?? 1;
    merged[key].ids.push(item.id);
  });
  return merged;
}

export function renderComponentIcons(summary, options = {}, onSlotClick) {
  const { showCheckboxes = false, checkedTypes = {} } = options;
  const mergedComponents = mergeComponents(summary, checkedTypes);
  const items = Object.values(mergedComponents);
  if (items.length === 0) {
    return html`<div class="component-summary-section"></div>`;
  }
  return html`
    <div class="component-summary-section">
      <div class="component-header">
        <span class="component-title">Components</span>
      </div>
      <div class="component-grid">
        ${items.map(item => {
          const anyUnchecked = item.ids.some(id => checkedTypes[id] === false);
          const checked = !anyUnchecked;
          const isDisabled = showCheckboxes && !checked;
          const imagePath = getPartImagePath({ type: item.type, level: item.lvl });
          const fallbackChar = item.title ? item.title.charAt(0).toUpperCase() : "?";
          return html`
            <div class="component-slot ${isDisabled ? "component-disabled" : ""}"
                 data-ids="${item.ids.join(",")}"
                 data-type="${item.type}"
                 data-lvl="${String(item.lvl)}"
                 @click=${onSlotClick ? () => onSlotClick(item.ids, checked) : undefined}>
              <div class="component-icon">
                <img src="${imagePath}" alt="${item.title || ""}"
                     @error=${e => {
                       e.target.style.display = "none";
                       if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = "block";
                     }} />
                <div class="component-fallback" style="display: none;">${fallbackChar}</div>
              </div>
              <div class="component-count">${item.count}</div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

export class ComponentRenderingUI {
  constructor(ui) {
    this.ui = ui;
  }

  render(container, summary, options = {}, onSlotClick) {
    const template = renderComponentIcons(summary, options, onSlotClick);
    render(template, container);
  }
}
