import { renderSectionCounts } from "../components/ui/upgrades/sectionCountUpdaterUI.js";
import { MODAL_IDS } from "../components/ModalManager.js";

function applyStatePatch(ui, patch) {
  if (!ui?.stateManager || !patch || typeof patch !== "object") return;
  Object.entries(patch).forEach(([key, value]) => {
    ui.stateManager.setVar(key, value);
  });
}

function handleObjectiveLoaded(ui, payload) {
  if (!payload?.objective) return;
  ui.stateManager.handleObjectiveLoaded(payload.objective, payload.objectiveIndex);
  ui.objectivesUI?.updateObjectiveDisplayFromState?.();
}

function handleObjectiveCompleted(ui) {
  ui.stateManager.handleObjectiveCompleted();
  ui.objectivesUI?.updateObjectiveDisplayFromState?.();
}

function handleObjectiveUnloaded(ui) {
  ui.stateManager.handleObjectiveUnloaded();
}

export function attachGameEventListeners(game, ui) {
  if (!game || !ui) return () => {};

  const subscriptions = [];
  const on = (eventName, handler) => {
    game.on(eventName, handler);
    subscriptions.push(() => game.off(eventName, handler));
  };

  on("statePatch", (patch) => applyStatePatch(ui, patch));
  on("toggleStateChanged", ({ toggleName, value }) => {
    if (!ui?.stateManager) return;
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "time_flux", "heat_control"];
    const coerced = toggleKeys.includes(toggleName) ? Boolean(value) : value;
    ui.stateManager.setVar(toggleName, coerced);
  });
  on("quickSelectSlotsChanged", ({ slots }) => ui.stateManager.setQuickSelectSlots(slots));
  on("reactorTick", (payload) => {
    applyStatePatch(ui, payload);
    if (ui.heatVisualsUI?.updateHeatVisuals) ui.heatVisualsUI.updateHeatVisuals();
  });
  on("exoticParticleEmitted", ({ tile }) => {
    if (ui.gridController?.emitEP && tile) ui.gridController.emitEP(tile);
  });
  on("partClicked", ({ part }) => {
    if (part && ui.stateManager?.setClickedPart) ui.stateManager.setClickedPart(part);
  });
  on("reflectorPulse", ({ r_tile, tile }) => {
    if (ui.gridController?.pulseReflector && r_tile && tile) ui.gridController.pulseReflector(r_tile, tile);
  });
  on("gridResized", () => ui.resizeReactor?.());
  on("vibrationRequest", ({ type }) => {
    if (type === "heavy" && ui.deviceFeatures?.heavyVibration) ui.deviceFeatures.heavyVibration();
    if (type === "meltdown" && ui.deviceFeatures?.meltdownVibration) ui.deviceFeatures.meltdownVibration();
    if (type === "doublePulse" && ui.deviceFeatures?.doublePulseVibration) ui.deviceFeatures.doublePulseVibration();
  });
  on("heatWarningCleared", () => {
    if (ui.heatVisualsUI?.clearHeatWarningClasses) ui.heatVisualsUI.clearHeatWarningClasses();
    if (ui.gridInteractionUI) ui.gridInteractionUI.clearSegmentHighlight();
  });
  on("chapterCelebration", ({ chapterIdx }) => {
    if (ui.modalOrchestrationUI?.showChapterCelebration && chapterIdx >= 0) ui.modalOrchestrationUI.showChapterCelebration(chapterIdx);
  });
  on("welcomeBackOffline", ({ deltaTime, queuedTicks }) => {
    if (ui.modalOrchestrator?.showModal) ui.modalOrchestrator.showModal(MODAL_IDS.WELCOME_BACK, { offlineMs: deltaTime, queuedTicks });
  });
  on("upgradeAdded", ({ upgrade, game: g }) => {
    if (ui.stateManager?.handleUpgradeAdded && upgrade) ui.stateManager.handleUpgradeAdded(g, upgrade);
  });
  on("upgradePurchased", ({ upgrade }) => {
    if (upgrade?.$el) {
      upgrade.$el.classList.remove("upgrade-purchase-success");
      void upgrade.$el.offsetWidth;
      upgrade.$el.classList.add("upgrade-purchase-success");
    }
  });
  on("upgradesChanged", () => renderSectionCounts(game));
  on("upgradesAffordabilityChanged", ({ hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch }) => {
    if (typeof document === "undefined") return;
    const upgradesBanner = document.getElementById("upgrades_no_affordable_banner");
    if (upgradesBanner) {
      if (hasAnyUpgrade && !hasVisibleAffordableUpgrade) upgradesBanner.classList.remove("hidden");
      else upgradesBanner.classList.add("hidden");
    }
    const researchBanner = document.getElementById("research_no_affordable_banner");
    if (researchBanner) {
      if (hasAnyResearch && !hasVisibleAffordableResearch) researchBanner.classList.remove("hidden");
      else researchBanner.classList.add("hidden");
    }
  });
  on("saveLoaded", ({ toggles, quick_select_slots }) => {
    if (toggles && ui.stateManager) {
      Object.entries(toggles).forEach(([key, value]) => ui.stateManager.setVar(key, value));
    }
    if (quick_select_slots && ui.stateManager?.setQuickSelectSlots) ui.stateManager.setQuickSelectSlots(quick_select_slots);
    if (ui.controlDeckUI?.updateAllToggleBtnStates) ui.controlDeckUI.updateAllToggleBtnStates();
  });
  on("meltdown", () => ui.stateManager?.setVar("melting_down", true));
  on("meltdownResolved", () => ui.stateManager?.setVar("melting_down", false));
  on("meltdownStateChanged", () => {
    if (ui.meltdownUI?.updateMeltdownState) ui.meltdownUI.updateMeltdownState();
  });
  on("meltdownStarted", () => {
    if (ui.meltdownUI?.startMeltdownBuildup) {
      ui.meltdownUI.startMeltdownBuildup(() => ui.meltdownUI?.explodeAllPartsSequentially?.());
    } else if (ui.meltdownUI?.explodeAllPartsSequentially) {
      ui.meltdownUI.explodeAllPartsSequentially();
    }
  });
  on("visualEventsReady", (eventBuffer) => {
    if (ui._renderVisualEvents && eventBuffer) ui._renderVisualEvents(eventBuffer);
  });
  on("timeFluxSimulationUpdate", ({ progress, isCatchingUp }) => {
    if (ui.heatVisualsUI?.updateTimeFluxSimulation) ui.heatVisualsUI.updateTimeFluxSimulation(progress, isCatchingUp);
  });
  on("timeFluxButtonUpdate", ({ queuedTicks }) => {
    if (ui.infoBarUI?.updateTimeFluxButton) ui.infoBarUI.updateTimeFluxButton(queuedTicks);
  });
  on("tileCleared", ({ tile }) => {
    if (game.tooltip_manager?.current_tile_context === tile) game.tooltip_manager.hide();
  });
  on("clearAnimations", () => {
    if (ui.gridInteractionUI?.clearAllActiveAnimations) ui.gridInteractionUI.clearAllActiveAnimations();
  });
  on("clearImageCache", () => {
    if (ui.gridCanvasRenderer?.clearImageCache) ui.gridCanvasRenderer.clearImageCache();
  });
  on("partsPanelRefresh", () => {
    if (ui.partsPanelUI?.populateActiveTab) ui.partsPanelUI.populateActiveTab();
    if (ui.partsPanelUI?.refreshPartsPanel) ui.partsPanelUI.refreshPartsPanel();
  });
  on("markTileDirty", ({ row, col }) => {
    if (ui.gridCanvasRenderer?.markTileDirty) ui.gridCanvasRenderer.markTileDirty(row, col);
  });
  on("markStaticDirty", () => {
    if (ui.gridCanvasRenderer?.markStaticDirty) ui.gridCanvasRenderer.markStaticDirty();
  });
  on("showFloatingText", ({ tile, value }) => {
    if (ui.particleEffectsUI?.showFloatingTextAtTile && tile) ui.particleEffectsUI.showFloatingTextAtTile(tile, value);
  });
  on("objectiveLoaded", (payload) => handleObjectiveLoaded(ui, payload));
  on("objectiveCompleted", () => handleObjectiveCompleted(ui));
  on("objectiveUnloaded", () => handleObjectiveUnloaded(ui));

  return () => {
    for (let i = 0; i < subscriptions.length; i++) {
      try {
        subscriptions[i]();
      } catch (_) {}
    }
    subscriptions.length = 0;
  };
}
