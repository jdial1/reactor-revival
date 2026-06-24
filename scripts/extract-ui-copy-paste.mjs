import fs from "fs";
import path from "path";

const compPath = path.resolve("public/src/components/ui-components.js");
const lines = fs.readFileSync(compPath, "utf8").split("\n");

function slice(a, b) {
  return lines.slice(a - 1, b).join("\n");
}

const layoutHeader = [
  'import { getPartImagePath } from "../utils.js";',
  "",
].join("\n");

fs.writeFileSync(
  path.resolve("public/src/components/ui-reactor-layout.js"),
  layoutHeader + slice(2176, 2293)
);

const copyHeader = [
  'import { html, render } from "lit-html";',
  'import { proxy, subscribe, previewBlueprintPlannerStats } from "../store.js";',
  'import { styleMap, numFormat as fmt, logger, StorageUtils, serializeSave, serializeReactor } from "../utils.js";',
  'import { bindLitRenderMulti } from "../dom/lit-reactive.js";',
  'import { clipToGrid } from "../domain/blueprint.js";',
  "import {",
  "  deserializeReactor,",
  "  filterLayoutByCheckedTypes,",
  "  renderComponentIcons,",
  "  calculateLayoutCostBreakdown,",
  "  calculateCurrentSellValue,",
  "  validatePasteResources,",
  "  buildPasteState,",
  "  buildAffordableLayout,",
  '} from "./ui-blueprint-helpers.js";',
  "import {",
  "  calculateLayoutCost,",
  "  buildPartSummary,",
  "  buildAffordableSet,",
  "  renderLayoutPreview,",
  '} from "./ui-reactor-layout.js";',
  "import {",
  "  copyPasteNoPartsTemplate,",
  "  copyPasteCostDisplayTemplate,",
  "  copyPasteSellOptionTemplate,",
  "  copyPasteModalCostContentTemplate,",
  "  copyPasteStatusMessageTemplate,",
  "  copyPasteRenderedContentTemplate,",
  "  copyPasteSelectedPartsCostTemplate,",
  "  plainTextTemplate,",
  '} from "../templates/uiComponentsTemplates.js";',
  "",
  "function startRenderLoop(ui, timestamp = 0) {",
  "  if (typeof ui.startRenderLoop === 'function') ui.startRenderLoop(timestamp);",
  "}",
  "",
].join("\n");

fs.writeFileSync(
  path.resolve("public/src/components/ui-copy-paste.js"),
  copyHeader + slice(2333, 2835) + "\n\n" + slice(2906, 2920)
);

const remove = [
  [2176, 2293],
  [2295, 2330],
  [2333, 2835],
  [2906, 2920],
];
let out = lines;
for (const [a, b] of remove.sort((x, y) => y[0] - x[0])) {
  out = [...out.slice(0, a - 1), ...out.slice(b)];
}

const reExp = [
  "export {",
  "  calculateLayoutCost,",
  "  renderLayoutPreview,",
  "  buildPartSummary,",
  "  buildAffordableSet,",
  '} from "./ui-reactor-layout.js";',
  'export { getCompactLayout, serializeReactor } from "../utils.js";',
  "export {",
  "  CopyPasteUI,",
  "  hideCopyPasteModal,",
  "  setupCopyAction,",
  "  setupPasteAction,",
  '} from "./ui-copy-paste.js";',
  "",
].join("\n");

const idx = out.findIndex((l) => l.includes("export class UserAccountUI"));
out.splice(idx, 0, reExp);
fs.writeFileSync(compPath, out.join("\n"));
console.log("ui extraction done", out.length, "lines");
