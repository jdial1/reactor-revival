import { getObjectiveCheck } from "../objectiveActions.js";
import { toDecimal } from "../../utils/decimal.js";
import { updateDecimal } from "../store.js";
import { logger } from "../../utils/logger.js";

export class ObjectiveEvaluator {
  constructor(manager) {
    this.manager = manager;
  }

  checkAndAutoComplete() {
    const manager = this.manager;
    if (typeof window !== "undefined" && window.location &&
      (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") &&
      typeof process === "undefined") {
      logger.log('debug', 'game', 'Development mode detected, skipping auto-completion');
      manager.scheduleNextCheck();
      return;
    }

    if (manager.current_objective_index === 0 && !manager.game._saved_objective_index) {
      manager.scheduleNextCheck();
      return;
    }

    while (manager.current_objective_def && manager.current_objective_def.checkId !== "allObjectives") {
      manager._syncActiveObjectiveToState?.();
      const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
      const autoResult = checkFn?.(manager.game);
      if (autoResult?.completed) {
        const wasAlreadyCompleted = manager.objectives_data &&
          manager.objectives_data[manager.current_objective_index] &&
          manager.objectives_data[manager.current_objective_index].completed;

        manager.current_objective_def.completed = true;
        if (manager.objectives_data && manager.objectives_data[manager.current_objective_index]) {
          manager.objectives_data[manager.current_objective_index].completed = true;
        }

        if (manager.game?.saveManager) {
          void manager.game.saveManager.autoSave();
        }

        if (!wasAlreadyCompleted) {
          manager._emitObjectiveCompleted();
          logger.log('debug', 'game', `Giving reward for objective ${manager.current_objective_index}:`, {
            title: manager.current_objective_def.title,
            reward: manager.current_objective_def.reward,
            ep_reward: manager.current_objective_def.ep_reward,
            hasReward: !!manager.current_objective_def.reward,
            hasEpReward: !!manager.current_objective_def.ep_reward
          });
          if (manager.current_objective_def.reward) {
            logger.log('debug', 'game', `Giving money reward: ${manager.current_objective_def.reward}`);
            manager.game.debugHistory.add("objectives", "Claiming money reward", { index: manager.current_objective_index, reward: manager.current_objective_def.reward });
            updateDecimal(manager.game.state, "current_money", (d) => d.add(toDecimal(manager.current_objective_def.reward)));
          } else if (manager.current_objective_def.ep_reward) {
            manager.game.debugHistory.add("objectives", "Claiming EP reward", { index: manager.current_objective_index, ep_reward: manager.current_objective_def.ep_reward });
            manager.game.exoticParticleManager.exotic_particles = manager.game.exoticParticleManager.exotic_particles.add(manager.current_objective_def.ep_reward);
            updateDecimal(manager.game.state, "total_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward));
            updateDecimal(manager.game.state, "current_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward));
            manager.game.emit("exoticParticlesChanged", {
              exotic_particles: manager.game.exoticParticleManager.exotic_particles,
              current_exotic_particles: manager.game.state.current_exotic_particles,
              total_exotic_particles: manager.game.state.total_exotic_particles,
              reality_flux: manager.game.state.reality_flux
            });
          }
        }

        manager.current_objective_index++;
        const maxValidIndex = manager.objectives_data.length - 1;
        if (manager.current_objective_index > maxValidIndex) manager.current_objective_index = maxValidIndex;
        manager.set_objective(manager.current_objective_index, true);

        if (manager.game?.saveManager) {
          void manager.game.saveManager.autoSave();
        }
      } else {
        manager.scheduleNextCheck();
        break;
      }
    }
  }

  checkCurrentObjective() {
    const manager = this.manager;
    if (manager.game?.isSandbox) return;
    if (!manager.game || manager.game.paused || !manager.current_objective_def) {
      manager.scheduleNextCheck();
      return;
    }

    const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
    const result = checkFn?.(manager.game);
    if (!result?.completed) {
      manager.scheduleNextCheck();
      return;
    }

    manager.current_objective_def.completed = true;
    if (manager.objectives_data && manager.objectives_data[manager.current_objective_index]) {
      manager.objectives_data[manager.current_objective_index].completed = true;
    }
    if (manager.game?.saveManager) void manager.game.saveManager.autoSave();

    manager._emitObjectiveCompleted();
    const displayObjective = {
      ...manager.current_objective_def,
      title:
        typeof manager.current_objective_def.title === "function"
          ? manager.current_objective_def.title()
          : manager.current_objective_def.title,
      completed: true
    };
    manager._emitObjectiveLoaded(displayObjective);
    clearTimeout(manager.objective_timeout);
  }
}
