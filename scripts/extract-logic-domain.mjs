import fs from "fs";
import path from "path";

const root = path.resolve("public/src");
const logicPath = path.join(root, "logic.js");
const lines = fs.readFileSync(logicPath, "utf8").split("\n");

function slice(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function removeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => b[0] - a[0]);
  let out = lines;
  for (const [start, end] of sorted) {
    out = [...out.slice(0, start - 1), ...out.slice(end)];
  }
  return out;
}

const heatHeader = `import { buildFacts } from "./kernel/buildFacts.js";
import { heatSfxLastTick } from "./domain/reactor-stats.js";
import {
  runHeatTransferStep,
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
  canPushToNeighbor,
  transferHeatBetweenNeighbors,
  applyValveRule,
} from "./logic-heat-transfer.js";
import {
  toDecimal,
  logger,
  CRITICAL_HEAT_RATIO,
  HEAT_PAYLOAD_MAX_INLETS,
  HEAT_PAYLOAD_MAX_VALVES,
  HEAT_PAYLOAD_MAX_VALVE_NEIGHBORS,
  HEAT_PAYLOAD_MAX_EXCHANGERS,
  HEAT_PAYLOAD_MAX_OUTLETS,
} from "./utils.js";
import { enqueueGameEffect } from "./state/game-effects.js";

`;

const heatBody = slice(329, 846);
fs.writeFileSync(path.join(root, "domain/heat.js"), `${heatHeader}${heatBody}`);

const engineHeader = `${slice(1, 210)
  .replace('import { attachPartPresentation } from "./logic/part-presentation.js";\n', "")
  .replace("attachPartPresentation(Part);\n", "")
  .replace(/ {2}enqueueGameEffect,\n/, "")}import { Tileset } from "./domain/grid.js";
import { enqueueGameEffect } from "./state/game-effects.js";
import {
  buildHeatPayload,
  HeatSystem,
  applyHeatThresholdSignals,
  syncHeatThresholdEffects,
} from "./domain/heat.js";

const FRAGMENTATION_EXPLOSION_CHANCE = 0.12;

`;

fs.writeFileSync(path.join(root, "domain/engine.js"), `${engineHeader}${slice(848, 3555)}`);

const gameHeader = `${slice(1, 225)
  .replace('import { attachPartPresentation } from "./logic/part-presentation.js";\n', "")
  .replace("attachPartPresentation(Part);\n", "")
  .replace(/ {2}enqueueGameEffect,\n/, "")}import { applyComputedModifiers } from "./domain/modifiers.js";
import { UpgradeSet } from "./domain/upgrade.js";
import { ObjectiveManager } from "./domain/objectives.js";
import { Tileset } from "./domain/grid.js";
import { Engine } from "./domain/engine.js";
import { enqueueGameEffect } from "./state/game-effects.js";

`;

const gameBody = slice(3556, 4154).replace(/^class Game/m, "export class Game");
fs.writeFileSync(path.join(root, "domain/game.js"), `${gameHeader}${gameBody}`);

const logicRanges = [[4156, 4177], [3556, 4154], [848, 3555], [329, 846], [226, 226]];
const logicNew = removeRanges(logicRanges);

const reExportAnchor = logicNew.findIndex((l) => l.includes("export { topologyNeighborCoords"));
if (reExportAnchor >= 0) {
  logicNew.splice(
    reExportAnchor + 1,
    0,
    'export { syncHeatThresholdEffects, buildHeatPayload, HeatSystem } from "./domain/heat.js";',
    'export {',
    '  Engine,',
    '  Performance,',
    '  HeatFlowVisualizer,',
    '  postGameLoopProjectionQuery,',
    '  serializeStateForGameLoopWorker,',
    '  tryDeductMoneyGameLoop,',
    '  requestTransactionGameLoop,',
    '  tryCreditMoneyGameLoop,',
    '  applyGameLoopTickResult,',
    '  startOfflineFastForward,',
    '  processOfflineTime,',
    '  failSimulationHardwareIncompatible,',
    '  pushGameLoopWorkerTickFromPulse,',
    '  VISUAL_EVENT_POWER,',
    '  VISUAL_EVENT_HEAT,',
    '  VISUAL_EVENT_EXPLOSION,',
    '} from "./domain/engine.js";',
    'export { Game } from "./domain/game.js";',
    'export {',
    '  parseAndValidateSave,',
    '  GameSaveManager,',
    '  GridManager,',
    '  UnlockManager,',
    '  resetSessionCriticalityCounters,',
    '  runRebootActionKeepEp,',
    '  runRebootActionDiscardEp,',
    '  runRebootAction,',
    '  runFullReboot,',
    '  setDefaults,',
    '  LifecycleManager,',
    '  ConfigManager,',
    '  ExoticParticleManager,',
    '  runSellAction,',
    '  runManualReduceHeatAction,',
    '  runSellPart,',
    '  runEpartOnclick,',
    '  Reactor,',
    '} from "./state.js";'
  );
}

const stripFrom = logicNew.findIndex((l) => l.startsWith("const FRAGMENTATION"));
if (stripFrom >= 0) logicNew.splice(stripFrom);

fs.writeFileSync(logicPath, logicNew.join("\n"));
console.log("logic domain extraction complete");
