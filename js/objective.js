import objective_list_data from "../data/objective_list.js";
import { getObjectiveCheck } from "./objectiveActions.js";

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.objectives_data = objective_list_data;
    this.current_objective_index = 0;
    this.objective_unloading = false;
    this.objective_interval = 2000;
    this.objective_wait = 3000;
    this.objective_timeout = null;
    this.current_objective_def = null;
  }

  start() {
    this.set_objective(this.current_objective_index, true);
  }

  check_current_objective() {
    if (!this.game || this.game.paused || !this.current_objective_def) {
      this.scheduleNextCheck();
      return;
    }

    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    if (checkFn && checkFn(this.game)) {
      this.game.ui.stateManager.handleObjectiveCompleted();
      this.current_objective_index++;
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

      this.set_objective(this.current_objective_index);

      // Auto-save the game after setting the new objective to ensure the completion is saved
      if (this.game && typeof this.game.saveGame === "function") {
        this.game.saveGame();
      }
    } else {
      this.scheduleNextCheck();
    }
  }

  scheduleNextCheck() {
    clearTimeout(this.objective_timeout);
    this.objective_timeout = setTimeout(
      () => this.check_current_objective(),
      this.objective_interval
    );
  }

  set_objective(objective_index, skip_wait = false) {
    this.current_objective_index = objective_index;
    const wait = skip_wait ? 0 : this.objective_wait;
    const nextObjective = this.objectives_data[this.current_objective_index];

    if (nextObjective) {
      if (!skip_wait) {
        this.objective_unloading = true;
        this.game.ui.stateManager.handleObjectiveUnloaded();
      }
      clearTimeout(this.objective_timeout);
      this.objective_timeout = setTimeout(() => {
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

        // Immediately check if this objective is already completed to prevent getting stuck
        const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
        if (checkFn) {
          const isCompleted = checkFn(this.game);
          if (isCompleted) {
            // Objective is already completed, advance immediately
            this.game.ui.stateManager.handleObjectiveCompleted();
            this.current_objective_index++;
            if (this.current_objective_def.reward) {
              this.game.current_money += this.current_objective_def.reward;
              this.game.ui.stateManager.setVar(
                "current_money",
                this.game.current_money,
                true
              );
            } else if (this.current_objective_def.ep_reward) {
              this.game.exotic_particles +=
                this.current_objective_def.ep_reward;
              this.game.ui.stateManager.setVar(
                "exotic_particles",
                this.game.exotic_particles,
                true
              );
            }

            // Recursively set the next objective
            this.set_objective(this.current_objective_index, true);

            // Auto-save after completing an already-satisfied objective
            if (this.game && typeof this.game.saveGame === "function") {
              this.game.saveGame();
            }
          } else {
            // Objective not yet completed, start normal checking
            this.check_current_objective();
          }
        } else {
          // Objective not yet completed, start normal checking
          this.check_current_objective();
        }
      }, wait);
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
    };
  }
}
