export {
  preferences,
  modalUi,
  enqueueGameEffect,
  runSellAction,
  runManualReduceHeatAction,
  runSellPart,
  runEpartOnclick,
  getValidatedPreferences,
  initPreferencesStore,
  getVolumePreferences,
  parseAndValidateSave,
  showLoadBackupModal,
  setDecimal,
  updateDecimal,
  patchGameState,
  syncReducedMotionDOM,
  tileKey,
  resolveTileFromKey,
  BlueprintSchema,
  LegacyGridSchema,
  previewBlueprintPlannerStats,
  StateManager,
  createUIState,
  initUIStateSubscriptions,
} from "./state.js";
export { subscribe, proxy, snapshot, ref } from "valtio/vanilla";
export { subscribeKey } from "valtio/vanilla/utils";

import {
  runSellAction as runSellActionImpl,
  runManualReduceHeatAction as runManualReduceHeatActionImpl,
  enqueueGameEffect as enqueueGameEffectImpl,
} from "./state.js";

export const actions = {
  sellPower(game) {
    runSellActionImpl(game);
  },
  manualVent(game) {
    runManualReduceHeatActionImpl(game);
  },
  enqueueEffect(game, effect) {
    enqueueGameEffectImpl(game, effect);
  },
};
