import { Part } from "./domain/part.js";
import { Upgrade } from "./domain/upgrade.js";
import { attachPartPresentation } from "./components/part-presentation.js";
import { attachUpgradePresentation } from "./components/upgrade-presentation.js";

attachPartPresentation(Part);
attachUpgradePresentation(Upgrade);

export { CHAPTER_COMPLETION_OBJECTIVE_INDICES } from "./constants/objectives.js";
export { getObjectiveCheck, ObjectiveManager } from "./domain/objectives.js";
export { ObjectiveController } from "./components/objective-controller.js";
export { AchievementController } from "./components/achievement-controller.js";
export { Tileset } from "./domain/grid.js";
export { BALANCE } from "./domain/balance.js";
export { resetHeatThresholdSignalState } from "./domain/reactor-stats.js";
export { queryUpgradeElement } from "./logic-upgrade-dom.js";
export { computeNeighborPulseNFromTile } from "./logic-tooltip-stats.js";
export { Engine, startOfflineFastForward, processOfflineTime } from "./domain/engine.js";
export { Game } from "./domain/game.js";
