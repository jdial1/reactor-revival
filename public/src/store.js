export {
  preferences,
  modalUi,
  pwaState,
  enqueueAndDrain,
  runSellAction,
  runManualReduceHeatAction,
  getValidatedPreferences,
  initPreferencesStore,
  getVolumePreferences,
  parseAndValidateSave,
  showLoadBackupModal,
  setDecimal,
  patchGameState,
  syncReducedMotionDOM,
  tileKey,
  resolveTileFromKey,
  StateManager,
  createUIState,
  initUIStateSubscriptions,
  applyBodyClassesFromUiState,
  buildShellClassMap,
  buildShellStyleMap,
  shellHeatRatioAttr,
  EngineStatus,
} from "./state.js";
export { BlueprintSchema, LegacyGridSchema } from "./schema/index.js";
export { enqueueGameEffect } from "./state/game-effects.js";
export { subscribe, proxy, snapshot, ref } from "valtio/vanilla";
import { subscribeKey as valtioSubscribeKey } from "valtio/vanilla/utils";

export function subscribeKey(proxyObject, key, callback) {
  return valtioSubscribeKey(proxyObject, key, callback);
}

import {
  runSellAction as runSellActionImpl,
  runManualReduceHeatAction as runManualReduceHeatActionImpl,
  enqueueAndDrain as enqueueAndDrainImpl,
} from "./state.js";

export const actions = {
  sellPower(game) {
    runSellActionImpl(game);
  },
  manualVent(game) {
    runManualReduceHeatActionImpl(game);
  },
  enqueueEffect(game, effect) {
    enqueueAndDrainImpl(game, effect);
  },
};
