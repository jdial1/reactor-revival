import { StateManager, applyBodyClassesFromUiState, subscribeKey, preferences } from "../../store.js";
import { ObjectiveController, AchievementController } from "../../logic.js";
import { checkObjectiveTextScrolling as applyObjectiveToastTitleStyles } from "../objective-controller.js";
import { getUiElement } from "../ui-components.js";
import { installDeviceService } from "./device.js";
import { resolveAudioService } from "../../services/app-services.js";
import { InputHandler } from "./input-manager.js";
import { createModalOrchestrator } from "../modals/ui-modals.js";
import { getGridCanvasRenderer, initGridCanvasService, teardownGridCanvasService } from "../grid/grid-canvas-service.js";
import { GridScaler } from "../grid/ui-grid.js";
import { HeatVisualsUI, GridInteractionUI } from "../grid/ui-heat-visuals.js";
import { MeltdownUI } from "./ui-meltdown.js";
import { safeCall, teardownAll } from "../../core/teardown.js";

class AudioController {
  constructor(api) {
    this.api = api;
    this.unsubs = [];
  }

  attach(game) {
    if (!game || this._attached) return;
    this._attached = true;
    const audio = this.api.getAudioService?.();
    if (audio) game.audio = audio;

    const syncVolumes = () => {
      if (!game.audio) return;
      game.audio.setVolume?.("master", preferences.volumeMaster ?? 1);
      game.audio.setVolume?.("effects", preferences.volumeEffects ?? 1);
      game.audio.setVolume?.("alerts", preferences.volumeAlerts ?? 1);
      game.audio.setVolume?.("system", preferences.volumeSystem ?? 1);
      game.audio.setVolume?.("ambience", preferences.volumeAmbience ?? 1);
      game.audio.toggleMute?.(!!preferences.mute);
    };
    syncVolumes();
    for (const key of ["volumeMaster", "volumeEffects", "volumeAlerts", "volumeSystem", "volumeAmbience", "mute"]) {
      this.unsubs.push(subscribeKey(preferences, key, syncVolumes));
    }

    if (game.state) {
      const syncHeatBalanced = (balanced) => {
        game.audio?.warningManager?.setHeatBalanced?.(!!balanced);
      };
      this.unsubs.push(subscribeKey(game.state, "heat_balanced", syncHeatBalanced));
      syncHeatBalanced(game.state.heat_balanced);

      const syncAmbience = () => {
        const vc = game.state.active_vent_count ?? 0;
        const ec = game.state.active_exchanger_count ?? 0;
        game.audio?.industrialManager?.scheduleIndustrialAmbience(vc, ec);
      };
      this.unsubs.push(subscribeKey(game.state, "active_vent_count", syncAmbience));
      this.unsubs.push(subscribeKey(game.state, "active_exchanger_count", syncAmbience));
      syncAmbience();
    }
  }

  detach(game) {
    teardownAll(this.unsubs);
    this.unsubs.length = 0;
    game?.audio?.teardownInitListeners?.();
    if (game) game.audio = null;
    this._attached = false;
  }
}

export class ObjectivesUI {
  constructor(ui, controller = null) {
    this.ui = ui;
    this.controller = controller;
  }
  checkTextScrolling() {
    const toastTitleEl = getUiElement(this.ui, "objectives_toast_title") ?? document.getElementById("objectives_toast_title");
    applyObjectiveToastTitleStyles(toastTitleEl);
  }
  markComplete() {
    const toastBtn = getUiElement(this.ui, "objectives_toast_btn") ?? document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("is-complete");
    if (typeof this.animateObjectiveCompletion === "function") this.animateObjectiveCompletion();
  }
  updateObjectiveDisplay() {
    if (this.controller) return this.controller.updateDisplay();
  }
  updateObjectiveDisplayFromState() {
    if (this.controller) return this.controller.updateDisplayFromState();
  }
  animateObjectiveCompletion() {
    if (this.controller) return this.controller.animateCompletion();
  }
  showObjectivesForPage(pageId) {
    if (this.ui?.uiState) {
      this.ui.uiState.active_page = pageId;
      this.ui.uiState.active_route = pageId;
    }
    if (this.controller) return this.controller.showForPage(pageId);
  }
  setupObjectivesListeners() {
    if (this.controller) return this.controller.setupListeners();
  }
}

export class PauseStateUI {
  constructor(ui) {
    this.ui = ui;
  }
  updatePauseState() {
    if (!this.ui.game?.state) return;
    const statePaused = this.ui.game.state.pause;
    const isPaused = statePaused === undefined ? !!this.ui.game?.paused : !!statePaused;
    if (this.ui.uiState) {
      this.ui.uiState.is_paused = !!isPaused;
      applyBodyClassesFromUiState(this.ui.uiState);
    }
  }
}

export function wireUiShell(ui) {
  if (ui.modalOrchestrator) return;
  ui.modalOrchestrator = createModalOrchestrator();
  ui.gridScaler = new GridScaler(ui);
  initGridCanvasService(ui);
  Object.defineProperty(ui, "gridCanvasRenderer", {
    configurable: true,
    enumerable: true,
    get: getGridCanvasRenderer,
  });
}

export function teardownUiShell(ui) {
  ui.modalOrchestrator = null;
  ui.gridScaler = null;
  if (Object.getOwnPropertyDescriptor(ui, "gridCanvasRenderer")?.get) {
    delete ui.gridCanvasRenderer;
  }
  teardownGridCanvasService();
}

export function wireRenderingSubsystems(ui) {
  if (ui.heatVisualsUI) return;
  ui.heatVisualsUI = new HeatVisualsUI(ui);
  ui.gridInteractionUI = new GridInteractionUI(ui);
  ui.meltdownUI = new MeltdownUI(ui);
}

export function teardownRenderingSubsystems(ui) {
  ui.meltdownUI?.cleanup?.();
  ui.heatVisualsUI = null;
  ui.gridInteractionUI = null;
  ui.meltdownUI = null;
}

export function wireUiDomSubsystems(ui) {
  wireUiShell(ui);
  wireRenderingSubsystems(ui);
}

export function teardownUiDomSubsystems(ui) {
  teardownRenderingSubsystems(ui);
  teardownUiShell(ui);
}

export function wireGameServices(ui, game) {
  teardownGameServices(ui, game);
  if (ui._deviceServiceTeardown) {
    safeCall(() => { ui._deviceServiceTeardown(); });
    ui._deviceServiceTeardown = null;
  }
  const deviceInstall = installDeviceService(ui, game);
  ui.deviceFeatures = deviceInstall.features;
  ui._deviceServiceTeardown = deviceInstall.teardown;
  ui.stateManager = new StateManager(ui);
  ui.stateManager.setGame(game);
  ui.inputHandler = new InputHandler(ui);
  ui.inputHandler.setup();
  ui.modalOrchestrator?.init?.(ui);
  ui.meltdownUI?.subscribeToMeltdownEvents?.(game);
  ui.gridInteractionUI?.clearAllActiveAnimations?.();
  if (!ui._gameServiceUnsubs) ui._gameServiceUnsubs = [];
  return {
    stateManager: ui.stateManager,
    inputHandler: ui.inputHandler,
  };
}

export function teardownGameServices(ui, game) {
  if (ui._deviceServiceTeardown) {
    safeCall(() => { ui._deviceServiceTeardown(); });
    ui._deviceServiceTeardown = null;
  }
  if (ui._gameServiceUnsubs?.length) {
    teardownAll(ui._gameServiceUnsubs);
    ui._gameServiceUnsubs = [];
  }
  ui.meltdownUI?.cleanup?.();
  ui.stateManager?.teardown?.();
  ui.stateManager = null;
  ui.inputHandler = null;
}

export function wireAppControllers(ui, game) {
  teardownAppControllers(ui, game);
  ui.audioController = new AudioController({
    getAudioService: () => resolveAudioService(game?.audio),
    getUI: () => ui,
  });
  ui.audioController.attach(game);
  return {
    audioController: ui.audioController,
  };
}

export function teardownAppControllers(ui, game) {
  ui.audioController?.detach?.(game);
  ui.audioController = null;
}

export function wireAppPresenters(ui, game) {
  teardownAppPresenters(ui);
  ui.objectiveController = new ObjectiveController({
    getGame: () => game,
    getUI: () => ui,
    getStateManager: () => ui.stateManager,
    lightVibration: () => ui.deviceFeatures?.lightVibration?.(),
  });
  ui.achievementController = new AchievementController({
    getGame: () => game,
  });
  ui.objectivesUI = new ObjectivesUI(ui, ui.objectiveController);
  ui.pauseStateUI = new PauseStateUI(ui);
  return {
    objectiveController: ui.objectiveController,
    achievementController: ui.achievementController,
    objectivesUI: ui.objectivesUI,
    pauseStateUI: ui.pauseStateUI,
  };
}

export function teardownAppPresenters(ui) {
  if (ui.objectiveController?.unmount) ui.objectiveController.unmount();
  ui.achievementController?.unmount?.();
  ui.objectiveController = null;
  ui.achievementController = null;
  ui.objectivesUI = null;
  ui.pauseStateUI = null;
}

export function wireAppSubsystems(ui, game) {
  wireUiDomSubsystems(ui);
  const services = wireGameServices(ui, game);
  const controllers = wireAppControllers(ui, game);
  const presenters = wireAppPresenters(ui, game);
  return { ...services, ...controllers, ...presenters };
}

export function teardownAppSubsystems(ui, game) {
  teardownAppPresenters(ui);
  teardownAppControllers(ui, game);
  teardownGameServices(ui, game);
}

export function teardownAllUiSubsystems(ui, game) {
  teardownAppSubsystems(ui, game);
  teardownUiDomSubsystems(ui);
}
