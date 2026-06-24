import { getPartImagePath } from "../core/part-images.js";
import {
  componentSummaryEmptyTemplate,
  componentSummaryTemplate,
} from "../templates/uiComponentsTemplates.js";

export function mergeComponents(summary, checkedTypes) {
  const merged = {};
  summary.forEach((item) => {
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
    return componentSummaryEmptyTemplate();
  }
  return componentSummaryTemplate({
    items,
    checkedTypes,
    showCheckboxes,
    onSlotClick,
    getImagePath: getPartImagePath,
  });
}
