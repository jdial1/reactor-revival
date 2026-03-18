const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const uiModulePath = path.join(root, "public", "src", "components", "ui", "uiModule.js");
const uiModule = fs.readFileSync(uiModulePath, "utf8");
const lines = uiModule.split(/\r?\n/);

const upgradesHeader = [
  'import { html, render } from "lit-html";',
  'import { repeat, styleMap, numFormat as fmt, logger, classMap, StorageUtils, serializeSave, escapeHtml, unsafeHTML, toNumber, formatTime, getPartImagePath, toDecimal } from "../../utils/index.js";',
  'import { MODAL_IDS } from "../ModalManager.js";',
  'import { runCheckAffordability, calculateSectionCounts } from "../../core/upgrades_system.js";',
  'import { UpgradeCard, CloseButton, PartButton } from "../buttonFactory.js";',
  'import { BlueprintService } from "../../core/services/BlueprintService.js";',
  'import { setDecimal, preferences } from "../../core/store.js";',
  'import { MOBILE_BREAKPOINT_PX, REACTOR_HEAT_STANDARD_DIVISOR, VENT_BONUS_PERCENT_DIVISOR, BlueprintSchema, LegacyGridSchema } from "../../core/constants.js";',
  'import { leaderboardService } from "../../services/leaderboardService.js";',
  'import { BaseComponent } from "../../core/stateManager.js";',
  'import { ReactiveLitComponent } from "../ReactiveLitComponent.js";',
  "",
].join("\n");

const upgradesBody = lines.slice(18, 1253).join("\n");
const uiUpgradesPath = path.join(root, "public", "src", "components", "ui", "ui_upgrades.js");
fs.writeFileSync(uiUpgradesPath, upgradesHeader + upgradesBody);
console.log("Created ui_upgrades.js");

const beforeUpgrades = lines.slice(0, 18).join("\n");
const afterUpgrades = lines.slice(1253).join("\n");
const reexportUpgrades = [
  "",
  "export { mergeComponents, renderComponentIcons, ComponentRenderingUI, runPopulateUpgradeSection, updateSectionCountsState, mountSectionCountsReactive, UpgradesUI } from \"./ui_upgrades.js\";",
  "",
].join("\n");
const newUiModule = beforeUpgrades + reexportUpgrades + afterUpgrades;
fs.writeFileSync(uiModulePath, newUiModule);
console.log("Updated uiModule.js to re-export from ui_upgrades.js");
