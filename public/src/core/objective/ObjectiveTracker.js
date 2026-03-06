import { logger } from "../../utils/logger.js";

export class ObjectiveTracker {
  constructor(manager) {
    this.manager = manager;
  }

  scheduleNextCheck() {
    const manager = this.manager;
    clearTimeout(manager.objective_timeout);
    if (manager.disableTimers) return;
    manager.objective_timeout = setTimeout(
      () => manager.check_current_objective(),
      manager.objective_interval
    );
  }

  setObjective(objective_index, skip_wait = false) {
    const manager = this.manager;
    logger.log('debug', 'game', `set_objective called with index: ${objective_index}, skip_wait: ${skip_wait}, current_objective_index: ${manager.current_objective_index}`);

    if (!manager.objectives_data || manager.objectives_data.length === 0) {
      logger.log('debug', 'game', `Cannot set objective ${objective_index}: objectives_data not loaded yet (length: ${manager.objectives_data?.length || 0})`);
      return;
    }

    if (typeof objective_index !== "number" || Number.isNaN(objective_index)) {
      const parsed = parseInt(objective_index, 10);
      objective_index = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    } else {
      objective_index = Math.floor(objective_index);
    }

    if (objective_index < 0) {
      logger.log('warn', 'game', `Objective index ${objective_index} is negative. Clamping to 0.`);
      objective_index = 0;
    }

    const maxValidIndex = manager.objectives_data.length - 1;
    if (objective_index > maxValidIndex) {
      logger.log('warn', 'game', `Objective index ${objective_index} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`);
      objective_index = maxValidIndex;
    }

    manager.current_objective_index = objective_index;
    const nextObjective = manager.objectives_data[manager.current_objective_index];
    if (manager.game.debugHistory) {
      manager.game.debugHistory.add("objectives", "Setting objective", { index: objective_index, id: nextObjective?.checkId });
    }
    logger.log('debug', 'game', `Setting objective ${objective_index}: ${nextObjective?.title || "undefined"}`);

    const updateLogic = () => {
      if (nextObjective && nextObjective.checkId === "allObjectives") {
        manager._loadInfiniteObjective();
        return;
      }
      if (nextObjective) {
        manager._loadNormalObjective(nextObjective);
      } else {
        manager._loadAllCompletedObjective();
      }
    };

    clearTimeout(manager.objective_timeout);
    if (skip_wait) {
      updateLogic();
    } else {
      manager.objective_unloading = true;
      manager._emitObjectiveUnloaded();
      manager.objective_timeout = setTimeout(updateLogic, manager.objective_wait);
    }
  }
}
