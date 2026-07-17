import { Part } from "./domain/part.js";
import { Upgrade } from "./domain/upgrade.js";
import { attachPartPresentation, attachUpgradePresentation } from "./components/upgrades/presentation.js";

attachPartPresentation(Part);
attachUpgradePresentation(Upgrade);

export { CHAPTER_COMPLETION_OBJECTIVE_INDICES } from "./constants/objectives.js";
export { getObjectiveCheck, ObjectiveManager } from "./domain/objectives.js";
export { ObjectiveController } from "./components/objective-controller.js";
export { AchievementController } from "./components/achievement-controller.js";
export { Tileset } from "./domain/grid.js";
export { resetHeatThresholdSignalState } from "./components/shell/heat-dom-sync.js";
export { queryUpgradeElement } from "./components/upgrades/upgrade-dom.js";
export { Engine, startOfflineFastForward, processOfflineTime } from "./domain/engine.js";
export { Game } from "./domain/game.js";
