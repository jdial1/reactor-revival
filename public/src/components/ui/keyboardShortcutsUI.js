import { logger } from "../../utils/logger.js";

function handleSpacePause(ui, e) {
  if (!e.target.matches("input, textarea, [contenteditable]")) {
    e.preventDefault();
    if (ui.uiState) ui.uiState.is_paused = !ui.uiState.is_paused;
    else {
      const currentPauseState = ui.stateManager.getVar("pause");
      ui.stateManager.setVar("pause", !currentPauseState);
    }
  }
}

function cheatAddMoney(ui, amount) {
  ui.game.markCheatsUsed();
  ui.game.addMoney(amount);
  ui.navIndicatorsUI.updateLeaderboardIcon();
}

function handleExoticParticleCheat(ui) {
  ui.game.grantCheatExoticParticle(1);
  ui.navIndicatorsUI.updateLeaderboardIcon();
  ui.stateManager.setVar("exotic_particles", ui.game.exoticParticleManager.exotic_particles);
  ui.stateManager.setVar("total_exotic_particles", ui.game.state.total_exotic_particles);
  ui.stateManager.setVar("current_exotic_particles", ui.game.state.current_exotic_particles);
  ui.game.upgradeset.check_affordability(ui.game);
}

function handleCompleteObjectiveCheat(ui) {
  if (ui.game.objectives_manager && ui.game.objectives_manager.current_objective_def) {
    ui.game.objectives_manager.current_objective_def.completed = true;
    ui.stateManager.handleObjectiveCompleted();
    const displayObjective = {
      ...ui.game.objectives_manager.current_objective_def,
      title: typeof ui.game.objectives_manager.current_objective_def.title === "function"
        ? ui.game.objectives_manager.current_objective_def.title()
        : ui.game.objectives_manager.current_objective_def.title,
      completed: true
    };
    ui.stateManager.handleObjectiveLoaded(displayObjective, ui.game.objectives_manager.current_objective_index);
  }
}

function handleAddTimeTicks(ui) {
  logger.log('debug', 'ui', 'CTRL+0 pressed');
  if (ui.game.engine) ui.game.engine.addTimeTicks(1000);
}

const MONEY_CHEATS = { "1": 10, "2": 100, "3": 1000, "4": 10000, "5": 100000, "6": 1000000, "7": 10000000, "8": 100000000 };

const CTRL_KEY_HANDLERS = {
  "9": (ui, e) => {
    e.preventDefault();
    ui.game.markCheatsUsed();
    ui.startCtrl9MoneyIncrease();
    ui.navIndicatorsUI.updateLeaderboardIcon();
  },
  "e": (ui, e) => { e.preventDefault(); handleExoticParticleCheat(ui); },
  "E": (ui, e) => { e.preventDefault(); handleExoticParticleCheat(ui); },
  "x": (ui, e) => { e.preventDefault(); handleCompleteObjectiveCheat(ui); },
  "X": (ui, e) => { e.preventDefault(); handleCompleteObjectiveCheat(ui); },
  "u": (ui, e) => { e.preventDefault(); ui.partsPanelUI.unlockAllPartsForTesting(); },
  "U": (ui, e) => { e.preventDefault(); ui.partsPanelUI.unlockAllPartsForTesting(); },
  "h": (ui, e) => { e.preventDefault(); ui.gridController.clearReactorHeat(); },
  "H": (ui, e) => { e.preventDefault(); ui.gridController.clearReactorHeat(); },
  "0": (ui, e) => { e.preventDefault(); handleAddTimeTicks(ui); },
};

export function setupKeyboardShortcuts(ui) {
  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      handleSpacePause(ui, e);
      return;
    }
    if (!e.ctrlKey) return;
    const amount = MONEY_CHEATS[e.key];
    if (amount != null) {
      e.preventDefault();
      cheatAddMoney(ui, amount);
      return;
    }
    const handler = CTRL_KEY_HANDLERS[e.key];
    if (handler) handler(ui, e);
  });
}

export function setupCtrl9Handlers(ui) {
  document.addEventListener("keyup", (e) => {
    if (e.ctrlKey && e.key === "9") {
      ui.stopCtrl9MoneyIncrease();
    }
  });
}

export function startCtrl9MoneyIncrease(ui) {
  stopCtrl9MoneyIncrease(ui);
  ui.ctrl9HoldStartTime = Date.now();
  ui.game.addMoney(ui.ctrl9BaseAmount);
  ui.ctrl9MoneyInterval = setInterval(() => {
    const holdDuration = Date.now() - ui.ctrl9HoldStartTime;
    const secondsHeld = holdDuration / 1000;
    const exponentialAmount = Math.floor(ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, secondsHeld));
    ui.game.addMoney(exponentialAmount);
  }, ui.ctrl9IntervalMs);
}

export function stopCtrl9MoneyIncrease(ui) {
  if (ui.ctrl9MoneyInterval) {
    clearInterval(ui.ctrl9MoneyInterval);
    ui.ctrl9MoneyInterval = null;
  }
  ui.ctrl9HoldStartTime = null;
}
