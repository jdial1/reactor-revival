import { Part } from "./domain/part.js";
import { Upgrade } from "./domain/upgrade.js";
import { attachPartPresentation } from "./components/part-presentation.js";
import { attachUpgradePresentation } from "./components/upgrade-presentation.js";

attachPartPresentation(Part);
attachUpgradePresentation(Upgrade);

export { computeModifiers, applyComputedModifiers } from "./domain/modifiers.js";
export { Upgrade, UpgradeSet, syncUpgradeDerivedEffects } from "./domain/upgrade.js";
export {
  CHAPTER_NAMES,
  OBJECTIVE_INTERVAL_MS,
  OBJECTIVE_WAIT_MS,
  PERCENT_COMPLETE_MAX,
  DEFAULT_OBJECTIVE_INDEX,
  CHAPTER_COMPLETION_OBJECTIVE_INDICES,
} from "./constants/objectives.js";
export { getObjectiveCheck, ObjectiveManager } from "./domain/objectives.js";
export { ObjectiveController } from "./components/objective-controller.js";
export { AchievementController } from "./components/achievement-controller.js";
export { AchievementManager } from "./domain/achievements.js";
export { Tile, Tileset } from "./domain/grid.js";

export { calculateSectionCounts } from "./logic-upgrade-sections.js";
export { BALANCE } from "./domain/balance.js";
export {
  Part,
  PartSet,
  resolveCellTierPartId,
  CELL_FORM_FACTORS,
} from "./domain/part.js";
export {
  applyCellMultipliers,
  applyReflectorEffects,
  deriveReactorStats,
  getCellHeatCoefficientH,
  getCellPowerCoefficientLP,
  resetHeatThresholdSignalState,
} from "./domain/reactor-stats.js";
export {
  addPartIconsToTitle,
  getObjectiveScrollDuration,
} from "./logic-objectives-ui.js";
export { checkObjectiveTextScrolling } from "./components/objective-controller.js";
export {
  getPartElement,
  bindPartElement,
  queryUpgradeElement,
  runCheckAffordability,
  computeAffordable,
  computeAffordProgress,
  getAffordanceFlags,
  setUpgradeCardRefreshHandler,
} from "./logic-upgrade-dom.js";
export {
  getUpgradeBonusLines,
  collectPartSemanticSegments,
  computeNeighborPulseNFromTile,
  calculateCellPulsePower,
  calculateCellPulseHeat,
} from "./logic-tooltip-stats.js";
export {
  runHeatStepFromTyped,
  runHeatTransferStep,
  canPushToNeighbor,
  transferHeatBetweenNeighbors,
  applyValveRule,
} from "./logic-heat-transfer.js";
export {
  MAX_NEIGHBORS,
  INLET_STRIDE,
  INLET_OFFSET_INDEX,
  INLET_OFFSET_RATE,
  INLET_OFFSET_N_COUNT,
  INLET_OFFSET_NEIGHBORS,
  VALVE_STRIDE,
  VALVE_OFFSET_INDEX,
  VALVE_OFFSET_TYPE,
  VALVE_OFFSET_ORIENTATION,
  VALVE_OFFSET_RATE,
  VALVE_OFFSET_INPUT_IDX,
  VALVE_OFFSET_OUTPUT_IDX,
  EXCHANGER_STRIDE,
  EXCHANGER_OFFSET_INDEX,
  EXCHANGER_OFFSET_RATE,
  EXCHANGER_OFFSET_CONTAINMENT,
  EXCHANGER_OFFSET_N_COUNT,
  EXCHANGER_OFFSET_NEIGHBOR_INDICES,
  EXCHANGER_OFFSET_NEIGHBOR_CAPS,
  EXCHANGER_OFFSET_NEIGHBOR_CATS,
  OUTLET_STRIDE,
  OUTLET_OFFSET_INDEX,
  OUTLET_OFFSET_RATE,
  OUTLET_OFFSET_ACTIVATED,
  OUTLET_OFFSET_IS_OUTLET6,
  OUTLET_OFFSET_N_COUNT,
  OUTLET_OFFSET_NEIGHBOR_INDICES,
  OUTLET_OFFSET_NEIGHBOR_CAPS,
  VALVE_OVERFLOW,
  VALVE_TOPUP,
  VALVE_CHECK,
  CATEGORY_EXCHANGER,
  CATEGORY_OTHER,
  CATEGORY_VENT_COOLANT,
} from "./constants/heat-transfer.js";
export { topologyNeighborCoords, TOPOLOGY_TYPES, Topology, computeWorkerNeighborPulseN } from "./logic-topology.js";
export { syncHeatThresholdEffects, buildHeatPayload, HeatSystem } from "./domain/heat.js";
export {
  Engine,
  Performance,
  HeatFlowVisualizer,
  postGameLoopProjectionQuery,
  serializeStateForGameLoopWorker,
  tryDeductMoneyGameLoop,
  requestTransactionGameLoop,
  tryCreditMoneyGameLoop,
  applyGameLoopTickResult,
  startOfflineFastForward,
  drainGridIntentsAsync,
  processOfflineTime,
  failSimulationHardwareIncompatible,
  pushGameLoopWorkerTickFromPulse,
  VISUAL_EVENT_POWER,
  VISUAL_EVENT_HEAT,
  VISUAL_EVENT_EXPLOSION,
} from "./domain/engine.js";
export { Game } from "./domain/game.js";
export {
  parseAndValidateSave,
  GameSaveManager,
  GridManager,
  UnlockManager,
  resetSessionCriticalityCounters,
  runRebootActionKeepEp,
  runRebootActionDiscardEp,
  runRebootAction,
  runFullReboot,
  setDefaults,
  LifecycleManager,
  applyToggleStateChange,
  getGameConfiguration,
  setGameConfiguration,
  ExoticParticleManager,
  runSellAction,
  runManualReduceHeatAction,
  runSellPart,
  runEpartOnclick,
  Reactor,
} from "./state.js";
