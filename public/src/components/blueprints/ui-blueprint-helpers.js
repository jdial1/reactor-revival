import { getPartImagePath } from "../../core/part-images.js";
import {
  componentSummaryEmptyTemplate,
  componentSummaryTemplate,
} from "../../templates/uiComponentsTemplates.js";

export const renderComponentIcons = (summary, options = {}, onSlotClick) => {
  const { showCheckboxes = false, checkedTypes = {} } = options;
  const merged = {};
  summary.forEach((item) => {
    const key = `${item.type}_${item.lvl}`;
    if (!merged[key]) merged[key] = { ...item, count: 0, ids: [] };
    merged[key].count += item.count ?? 1;
    merged[key].ids.push(item.id);
  });
  const items = Object.values(merged);
  if (items.length === 0) return componentSummaryEmptyTemplate();
  return componentSummaryTemplate({
    items,
    checkedTypes,
    showCheckboxes,
    onSlotClick,
    getImagePath: getPartImagePath,
  });
};
