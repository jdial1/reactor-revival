import objective_list_data from "../data/objective_list.js";
import { getObjectiveCheck } from "./objectiveActions.js";

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    // Create a deep copy of the objectives data to prevent mutating the shared module.
    // This ensures each new game gets a completely fresh set of objectives.
    this.objectives_data = JSON.parse(JSON.stringify(objective_list_data));
    this.current_objective_index = 0;
    this.objective_unloading = false;
    this.objective_interval = 2000;
    this.objective_wait = 3000;
    this.objective_timeout = null;
    this.current_objective_def = null;
    this.claiming = false;
    this.disableTimers = false;
  }

  start() {
    this.set_objective(this.current_objective_index, true);

    // Wait for the objective to be loaded, then check for auto-completion
    setTimeout(() => {
      this.checkAndAutoComplete();
    }, 0);
  }

  checkAndAutoComplete() {
    // Check if the current objective is already completed (e.g., from a saved game)
    // and auto-advance through all completed objectives
    while (this.current_objective_def) {
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      if (checkFn && checkFn(this.game)) {
        // Mark objective as completed and claim reward
        this.current_objective_def.completed = true;

        // Call completion handler
        this.game.ui.stateManager.handleObjectiveCompleted();

        // Give the reward immediately
        if (this.current_objective_def.reward) {
          this.game.current_money += this.current_objective_def.reward;
          this.game.ui.stateManager.setVar(
            "current_money",
            this.game.current_money,
            true
          );
        } else if (this.current_objective_def.ep_reward) {
          this.game.exotic_particles += this.current_objective_def.ep_reward;
          this.game.ui.stateManager.setVar(
            "exotic_particles",
            this.game.exotic_particles,
            true
          );
        }

        // Advance to next objective
        this.current_objective_index++;
        this.set_objective(this.current_objective_index, true);

        // Auto-save after claiming
        if (this.game && typeof this.game.saveGame === "function") {
          this.game.saveGame();
        }
        // The recursive setTimeout has been removed. The while loop will continue to the next check.
      } else {
        // Current objective is not completed, start checking for completion
        this.scheduleNextCheck();
        break;
      }
    }
  }

  check_current_objective() {
    if (!this.game || this.game.paused || !this.current_objective_def) {
      this.scheduleNextCheck();
      return;
    }

    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    if (checkFn && checkFn(this.game)) {
      // Mark objective as completed but don't auto-advance
      this.current_objective_def.completed = true;
      this.game.ui.stateManager.handleObjectiveCompleted();

      // Update the UI to show completed state with claim button
      const displayObjective = {
        ...this.current_objective_def,
        title:
          typeof this.current_objective_def.title === "function"
            ? this.current_objective_def.title()
            : this.current_objective_def.title,
        completed: true
      };
      this.game.ui.stateManager.handleObjectiveLoaded(displayObjective);

      // Stop checking this objective since it's completed
      clearTimeout(this.objective_timeout);
    } else {
      this.scheduleNextCheck();
    }
  }

  scheduleNextCheck() {
    clearTimeout(this.objective_timeout);
    if (this.disableTimers) return; // <--- Skip timer scheduling if disabled
    this.objective_timeout = setTimeout(
      () => this.check_current_objective(),
      this.objective_interval
    );
  }

  set_objective(objective_index, skip_wait = false) {
    this.current_objective_index = objective_index;
    const nextObjective = this.objectives_data[this.current_objective_index];

    const updateLogic = () => {
      if (nextObjective) {
        this.current_objective_def = nextObjective;
        const displayObjective = {
          ...this.current_objective_def,
          title:
            typeof this.current_objective_def.title === "function"
              ? this.current_objective_def.title()
              : this.current_objective_def.title,
        };
        this.game.ui.stateManager.handleObjectiveLoaded(displayObjective);
        this.objective_unloading = false;
        this.scheduleNextCheck();
      } else {
        this.current_objective_def = {
          title: "All objectives completed!",
          reward: 0,
          checkId: "allObjectives",
        };
        this.game.ui.stateManager.handleObjectiveLoaded({
          ...this.current_objective_def,
        });
        clearTimeout(this.objective_timeout);
      }
    };

    clearTimeout(this.objective_timeout);
    if (skip_wait) {
      // When skipping the wait, update synchronously for tests.
      updateLogic();
    } else {
      // In the live game, unload the old objective and wait before loading the new one.
      this.objective_unloading = true;
      this.game.ui.stateManager.handleObjectiveUnloaded();
      this.objective_timeout = setTimeout(updateLogic, this.objective_wait);
    }
  }

  // Claim the current objective reward
  claimObjective() {
    // Prevent multiple rapid claims
    if (this.claiming || !this.current_objective_def || !this.current_objective_def.completed) {
      return;
    }

    this.claiming = true;

    // Give the reward
    if (this.current_objective_def.reward) {
      this.game.current_money += this.current_objective_def.reward;
      this.game.ui.stateManager.setVar(
        "current_money",
        this.game.current_money,
        true
      );
    } else if (this.current_objective_def.ep_reward) {
      this.game.exotic_particles += this.current_objective_def.ep_reward;
      this.game.ui.stateManager.setVar(
        "exotic_particles",
        this.game.exotic_particles,
        true
      );
    }

    // Advance to next objective immediately (skip wait)
    this.current_objective_index++;
    this.set_objective(this.current_objective_index, true);

    // Always save after claiming
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame();
    }

    // Reset claiming flag after a short delay to prevent rapid clicking
    setTimeout(() => {
      this.claiming = false;
    }, 500);
  }

  // Utility method to get current objective information for debugging
  getCurrentObjectiveInfo() {
    return {
      index: this.current_objective_index,
      title: this.current_objective_def
        ? typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title
        : "No objective loaded",
      checkId: this.current_objective_def?.checkId || null,
      total_objectives: this.objectives_data.length,
      completed: this.current_objective_def?.completed || false,
    };
  }
}
