import dataService from "../services/dataService.js";
import { getObjectiveCheck } from "./objectiveActions.js";

// Load objective data
let objective_list_data = [];
let dataLoaded = false;

async function ensureDataLoaded() {
  if (!dataLoaded) {
    try {
      objective_list_data = await dataService.loadObjectiveList();
      if (objective_list_data.length === 0) {
        this.game.logger?.error("Failed to load objective list:", objective_list_data);
        return;
      }
      dataLoaded = true;
    } catch (error) {
      this.game.logger?.warn("Failed to load objective list:", error);
      objective_list_data = [];
      dataLoaded = true;
    }
  }
  return objective_list_data;
}

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
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

  async initialize() {
    await ensureDataLoaded();

    // Handle ES module format
    const data = objective_list_data.default || objective_list_data;

    if (!Array.isArray(data)) {
      this.game.logger?.error("objective_list_data is not an array:", data);
      return;
    }

    // Store the data directly - no need for Objective class instances
    this.objectives_data = data;
    this.game.logger?.debug(`ObjectiveManager initialized with ${this.objectives_data.length} objectives`);
    this.game.logger?.debug(`First objective: ${this.objectives_data[0]?.title}`);
    this.game.logger?.debug(`Last objective: ${this.objectives_data[this.objectives_data.length - 1]?.title}`);
  }

  start() {
    this.game.logger?.debug(`ObjectiveManager.start() called with current_objective_index: ${this.current_objective_index}`);

    // Ensure data is loaded before setting objectives
    if (!this.objectives_data || this.objectives_data.length === 0) {
      this.game.logger?.debug(`Objectives data not loaded yet, waiting for initialization...`);
      // Wait for initialization to complete, then call start again
      this.initialize().then(() => {
        this.game.logger?.debug(`Initialization completed, now calling start() again`);
        this.start();
      });
      return;
    }

    this.set_objective(this.current_objective_index, true);

    // Wait for the objective to be loaded, then check for auto-completion
    setTimeout(() => {
      this.game.logger?.debug(`ObjectiveManager.checkAndAutoComplete() called`);
      this.checkAndAutoComplete();
    }, 0);
  }

  checkAndAutoComplete() {
    // Disable auto-completion in development mode (but allow in test environment)
    if (typeof window !== 'undefined' && window.location &&
      (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') &&
      typeof process === 'undefined') { // Allow in Node.js/test environment
      this.game.logger?.debug('Development mode detected, skipping auto-completion');
      this.scheduleNextCheck();
      return;
    }

    // Only auto-complete objectives if we're loading from a saved game
    // and the current objective index is greater than 0 (meaning we've made progress)
    if (this.current_objective_index === 0 && !this.game._saved_objective_index) {
      // This is a fresh game, don't auto-complete anything
      this.scheduleNextCheck();
      return;
    }

    // Check if the current objective is already completed (e.g., from a saved game)
    // and auto-advance through all completed objectives
    while (this.current_objective_def && this.current_objective_def.checkId !== "allObjectives") {
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      if (checkFn && checkFn(this.game)) {
        // Check if this objective was already completed (from save data)
        // Use the objectives_data array to get the accurate completion status
        const wasAlreadyCompleted = this.objectives_data &&
          this.objectives_data[this.current_objective_index] &&
          this.objectives_data[this.current_objective_index].completed;

        // Mark objective as completed
        this.current_objective_def.completed = true;
        // Also mark the corresponding entry in objectives_data as completed
        if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
          this.objectives_data[this.current_objective_index].completed = true;
        }

        // Only give rewards and call completion handler if this objective wasn't already completed
        if (!wasAlreadyCompleted) {
          // Call completion handler
          this.game.ui.stateManager.handleObjectiveCompleted();

          // Give the reward immediately
          this.game.logger?.debug(`Giving reward for objective ${this.current_objective_index}:`, {
            title: this.current_objective_def.title,
            reward: this.current_objective_def.reward,
            ep_reward: this.current_objective_def.ep_reward,
            hasReward: !!this.current_objective_def.reward,
            hasEpReward: !!this.current_objective_def.ep_reward
          });
          if (this.current_objective_def.reward) {
            this.game.logger?.debug(`Giving money reward: ${this.current_objective_def.reward}`);
            this.game.current_money += this.current_objective_def.reward;
            this.game.ui.stateManager.setVar(
              "current_money",
              this.game.current_money,
              true
            );
          } else if (this.current_objective_def.ep_reward) {
            console.log(`[DEBUG] Giving EP reward: ${this.current_objective_def.ep_reward}`);
            this.game.exotic_particles += this.current_objective_def.ep_reward;
            this.game.ui.stateManager.setVar(
              "exotic_particles",
              this.game.exotic_particles,
              true
            );
          }
        } else {
          console.log(`[DEBUG] Skipping reward for objective ${this.current_objective_index} - already completed`);
        }

        // Advance to next objective
        this.current_objective_index++;

        // Safeguard: Ensure we don't go beyond the valid range
        const maxValidIndex = this.objectives_data.length - 1;
        if (this.current_objective_index > maxValidIndex) {
          console.warn(`[DEBUG] Auto-completion would advance beyond valid range (${this.current_objective_index} > ${maxValidIndex}). Clamping to ${maxValidIndex}.`);
          this.current_objective_index = maxValidIndex;
        }

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
      // Also mark the corresponding entry in objectives_data as completed
      if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
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
      this.game.ui.stateManager.handleObjectiveLoaded(displayObjective, this.current_objective_index);

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
    this.game.logger?.debug(`set_objective called with index: ${objective_index}, skip_wait: ${skip_wait}, current_objective_index: ${this.current_objective_index}`);

    if (!this.objectives_data || this.objectives_data.length === 0) {
      this.game.logger?.warn(`Cannot set objective ${objective_index}: objectives_data not loaded yet (length: ${this.objectives_data?.length || 0})`);
      return;
    }

    // Ensure index is a number before clamping
    if (typeof objective_index !== 'number' || isNaN(objective_index)) {
      objective_index = 0;
    }

    if (objective_index < 0) {
      this.game.logger?.warn(`Objective index ${objective_index} is negative. Clamping to 0.`);
      objective_index = 0;
    }

    // The maximum valid index is length - 1, which includes the "All objectives completed!" objective
    const maxValidIndex = this.objectives_data.length - 1;
    if (objective_index > maxValidIndex) {
      this.game.logger?.warn(`Objective index ${objective_index} is beyond valid range (0-${maxValidIndex}). Clamping to ${maxValidIndex}.`);
      objective_index = maxValidIndex;
    }

    this.current_objective_index = objective_index;
    const nextObjective = this.objectives_data[this.current_objective_index];
    this.game.logger?.debug(`Setting objective ${objective_index}: ${nextObjective?.title || 'undefined'}`);

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
        this.game.logger?.debug(`Loading objective: ${displayObjective.title}`);
        this.game.ui.stateManager.handleObjectiveLoaded(displayObjective, this.current_objective_index);
        this.objective_unloading = false;
        this.scheduleNextCheck();
      } else { // This block is now reachable
        this.current_objective_def = {
          title: "All objectives completed!",
          reward: 0,
          checkId: "allObjectives",
        };
        this.game.logger?.debug(`Loading "All objectives completed!" objective`);
        this.game.ui.stateManager.handleObjectiveLoaded({
          ...this.current_objective_def,
        }, this.current_objective_index);
        clearTimeout(this.objective_timeout);
      }
    };

    clearTimeout(this.objective_timeout);
    if (skip_wait) {
      updateLogic();
    } else {
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

    // Safeguard: Ensure we don't go beyond the valid range
    const maxValidIndex = this.objectives_data.length - 1; // Include "All objectives completed!"
    if (this.current_objective_index > maxValidIndex) {
      console.warn(`[DEBUG] Claiming would advance beyond valid range (${this.current_objective_index} > ${maxValidIndex}). Clamping to ${maxValidIndex}.`);
      this.current_objective_index = maxValidIndex;
    }

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
