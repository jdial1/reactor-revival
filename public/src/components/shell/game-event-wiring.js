import { StorageUtils } from "../../storage/index.js";
import { teardownAll } from "../../core/teardown.js";
import { EngineStatus } from "../../schema/stateSchemas.js";
import { actions, patchGameState } from "../../store.js";
import { loadFailureFlavor, getFailureFlavorMessage } from "../../domain/failure-flavor.js";
import { resetHeatThresholdSignalState, clearTileExplodingFlags } from "../../domain/heat-signals.js";
import { saveRecoveredBlueprint } from "../blueprints/ui-layout-storage.js";
import { enqueueAndDrain } from "../../state/game-effects-flush.js";
import { showStatusNotice } from "./ui-notices.js";
import { MODAL_IDS } from "../../constants/modal-ids.js";

function handleObjectiveCompleted(ui, payload) {
  ui.stateManager.handleObjectiveCompleted();
  const flavor = payload?.flavorText?.trim();
  if (flavor && payload?.isChapterCompletion) {
    showStatusNotice({
      tag: "CHAPTER COMPLETE",
      body: flavor,
      durationMs: 5500,
    });
  }
  if (payload?.checkId === "completeChapter1" && !StorageUtils.get("reactor_save_export_hint_seen")) {
    StorageUtils.set("reactor_save_export_hint_seen", true);
    const showSaveHint = () => showStatusNotice({
      tag: "TIP // SAVE BACKUP",
      body: "Export your save from Settings ? Export Save for backup or other devices.",
    });
    if (flavor && payload?.isChapterCompletion) {
      setTimeout(showSaveHint, 5600);
    } else {
      showSaveHint();
    }
  }
}

export function attachGameEventListeners(game, ui) {
  if (!game || !ui) return () => {};

  const unsubs = [];
  let failureFlavorMap = loadFailureFlavor();
  let lastFailureState = game.state?.failure_state ?? "nominal";

  const handleFailureState = (state) => {
    if (!state || state === lastFailureState) return;
    lastFailureState = state;
    const msg = getFailureFlavorMessage(failureFlavorMap ?? {}, state);
    if (msg && state !== "nominal") {
      showStatusNotice({
        tag: `WARN // ${String(state).toUpperCase()}`,
        body: msg,
      });
    }
    ui.updateFailurePhaseSensory?.(state);
  };

  const on = (eventName, handler) => {
    game.on(eventName, handler);
    unsubs.push(() => game.off(eventName, handler));
  };

  on("failureStateChanged", ({ state }) => handleFailureState(state));
  on("partClicked", ({ part }) => {
    if (part && ui.stateManager?.setClickedPart) ui.stateManager.setClickedPart(part);
  });
  on("vibrationRequest", ({ type }) => {
    const patterns = { heavy: 50, meltdown: 200, doublePulse: [30, 80, 30] };
    const pattern = patterns[type];
    if (pattern != null) actions.enqueueEffect(game, { kind: "haptic", pattern });
  });
  on("heatWarningCleared", () => {
    clearTileExplodingFlags(ui.game);
    if (ui.gridInteractionUI) ui.gridInteractionUI.clearSegmentHighlight();
  });
  on("welcomeBackOffline", ({ offlineMs, tickEquivalent }) => {
    ui.modalOrchestrator?.showModal?.(MODAL_IDS.WELCOME_BACK, { offlineMs, tickEquivalent });
  });
  on("simulationHardwareError", ({ message }) => {
    if (!ui.game?.state) return;
    ui.game.state.engine_status = EngineStatus.SIMULATION_ERROR;
    ui.game.state.simulation_error_message = message ?? "";
  });
  on("upgradePurchased", ({ upgrade }) => {
    if (!upgrade?.id) return;
    const id = String(upgrade.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    enqueueAndDrain(game, {
      kind: "dom_pulse",
      selector: `.page:not(.hidden) .upgrade-group [data-id="${id}"]`,
      className: "upgrade-purchase-success",
      durationMs: 400,
    });
  });
  on("upgradesChanged", () => ui.updateSectionCountsState(game));
  on("saveLoaded", ({ toggles, quick_select_slots }) => {
    if (toggles && ui.game) {
      patchGameState(ui.game, toggles);
    }
    if (quick_select_slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(quick_select_slots, { skipStateSync: true });
    resetHeatThresholdSignalState(game);
  });
  on("tileCleared", ({ tile }) => {
    const entity = ui.uiState?.hovered_entity;
    if (entity?.tile === tile) ui.uiState.hovered_entity = null;
  });
  on("partsPanelRefresh", () => {
    ui.refreshPartsPanel?.();
  });
  on("objectiveLoaded", ({ objective, index }) => {
    ui.stateManager?.handleObjectiveLoaded?.(objective, index);
  });
  on("objectiveCompleted", (payload) => {
    handleObjectiveCompleted(ui, payload ?? {});
  });
  on("meltdownRecoveredBlueprint", ({ layout }) => {
    if (layout) saveRecoveredBlueprint(layout);
  });
  ui.updateFailurePhaseSensory?.(game.state?.failure_state ?? "nominal");

  return () => {
    teardownAll(unsubs);
    unsubs.length = 0;
  };
}
