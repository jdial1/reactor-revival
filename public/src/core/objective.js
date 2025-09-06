import dataService from "../services/dataService.js";
import { getObjectiveCheck } from "./objectiveActions.js";

// Chapter names for display
const CHAPTER_NAMES = [
  "Chapter 1: First Fission",
  "Chapter 2: Scaling Production",
  "Chapter 3: High-Energy Systems",
  "Chapter 4: The Experimental Frontier"
];

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
      // Only call updateObjectiveDisplay if it exists and game is initialized
      if (this.game.ui && typeof this.game.ui.updateObjectiveDisplay === 'function') {
        this.game.ui.updateObjectiveDisplay();
      }

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
        // Only call updateObjectiveDisplay if it exists and game is initialized
        if (this.game.ui && typeof this.game.ui.updateObjectiveDisplay === 'function') {
          this.game.ui.updateObjectiveDisplay();
        }
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
        this.game.ui.updateObjectiveDisplay(); // Add this line
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

  // NEW METHOD to get all relevant display data
  getCurrentObjectiveDisplayInfo() {
    if (!this.current_objective_def || this.current_objective_index < 0) {
      return null;
    }

    const index = this.current_objective_index;
    const objective = this.current_objective_def;

    // Check if game is fully initialized
    if (!this.game || !this.game.tileset || !this.game.reactor) {
      return {
        chapterName: "Loading...",
        chapterProgressText: "0 / 10",
        chapterProgressPercent: 0,
        title: objective.title || "Loading...",
        description: objective.description || '',
        progressText: "Loading...",
        progressPercent: 0,
        reward: {
          money: objective.reward || 0,
          ep: objective.ep_reward || 0
        },
        isComplete: objective.completed || false
      };
    }

    const chapterIndex = Math.floor(index / 10);
    const chapterStart = chapterIndex * 10;

    // Calculate chapter size (last chapter has 7 objectives, others have 10)
    let chapterSize = 10;
    if (chapterIndex === 3) { // Chapter 4 (index 3)
      chapterSize = 7;
    }

    const chapterEnd = Math.min(chapterStart + chapterSize, this.objectives_data.length);
    const chapterObjectives = this.objectives_data.slice(chapterStart, chapterEnd);

    let completedInChapter = 0;
    for (let i = chapterStart; i < index; i++) {
      if (this.objectives_data[i] && this.objectives_data[i].completed) {
        completedInChapter++;
      }
    }
    if (objective.completed) completedInChapter++;

    const progress = this.getCurrentObjectiveProgress();

    return {
      chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`,
      chapterProgressText: `${(index % 10) + 1} / ${chapterSize}`,
      chapterProgressPercent: ((index % 10) / chapterSize) * 100,

      title: objective.title,
      description: objective.description || '',

      progressText: progress.text,
      progressPercent: Math.min(100, progress.percent), // Clamp at 100%

      reward: {
        money: objective.reward || 0,
        ep: objective.ep_reward || 0
      },
      isComplete: objective.completed
    };
  }

  // NEW METHOD to get specific progress for the current objective
  getCurrentObjectiveProgress() {
    const objective = this.current_objective_def;
    if (!objective || objective.completed) {
      return { text: "Completed!", percent: 100 };
    }

    const checkId = objective.checkId;
    const game = this.game;

    // Check if game is fully initialized
    if (!game || !game.tileset || !game.reactor) {
      return { text: "Loading...", percent: 0 };
    }

    // This switch provides detailed progress for UI display
    switch (checkId) {
      case 'firstCell':
        const hasCell = game.tileset.getAllTiles().some(tile => tile.part && tile.part.category === 'cell');
        return { text: hasCell ? "1 / 1 Cell Placed" : "0 / 1 Cell Placed", percent: hasCell ? 100 : 0 };

      case 'sellPower':
        const currentPower = game.reactor.stats_power || 0;
        return { text: currentPower > 0 ? "Power available to sell" : "No power to sell", percent: currentPower > 0 ? 100 : 0 };

      case 'reduceHeat':
        const currentHeat = game.reactor.stats_heat || 0;
        return { text: `${currentHeat.toLocaleString()} / 0 Heat`, percent: currentHeat === 0 ? 100 : 0 };

      case 'ventNextToCell':
        const hasVentNextToCell = this.checkVentNextToCell(game);
        return { text: hasVentNextToCell ? "Vent placed next to Cell" : "Place a Vent next to a Cell", percent: hasVentNextToCell ? 100 : 0 };

      case 'tenActiveCells':
        const cellCount = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.category === 'cell').length;
        return { text: `${cellCount} / 10 Cells`, percent: Math.min(100, (cellCount / 10) * 100) };

      case 'powerPerTick200':
        const power = game.reactor.stats_power || 0;
        return { text: `${power.toLocaleString()} / 200 Power`, percent: Math.min(100, (power / 200) * 100) };

      case 'powerPerTick500':
        const power500 = game.reactor.stats_power || 0;
        return { text: `${power500.toLocaleString()} / 500 Power`, percent: Math.min(100, (power500 / 500) * 100) };

      case 'firstBillion':
        const money = game.current_money || 0;
        return { text: `$${money.toLocaleString()} / $1,000,000,000`, percent: Math.min(100, (money / 1e9) * 100) };

      case 'ep10':
        const ep = game.exotic_particles || 0;
        return { text: `${ep} / 10 EP Generated`, percent: Math.min(100, (ep / 10) * 100) };

      case 'ep51':
        const ep51 = game.exotic_particles || 0;
        return { text: `${ep51} / 51 EP Generated`, percent: Math.min(100, (ep51 / 51) * 100) };

      case 'ep250':
        const ep250 = game.exotic_particles || 0;
        return { text: `${ep250} / 250 EP Generated`, percent: Math.min(100, (ep250 / 250) * 100) };

      case 'ep1000':
        const ep1000 = game.exotic_particles || 0;
        return { text: `${ep1000} / 1,000 EP Generated`, percent: Math.min(100, (ep1000 / 1000) * 100) };

      case 'capacitorCount10':
        const capacitorCount = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.category === 'capacitor').length;
        return { text: `${capacitorCount} / 10 Capacitors`, percent: Math.min(100, (capacitorCount / 10) * 100) };

      case 'ventCount10':
        const ventCount = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.category === 'vent').length;
        return { text: `${ventCount} / 10 Vents`, percent: Math.min(100, (ventCount / 10) * 100) };

      case 'plutoniumCells5':
        const plutoniumCells = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.type === 'quad_plutonium_cell').length;
        return { text: `${plutoniumCells} / 5 Quad Plutonium Cells`, percent: Math.min(100, (plutoniumCells / 5) * 100) };

      case 'thoriumCells5':
        const thoriumCells = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.type === 'quad_thorium_cell').length;
        return { text: `${thoriumCells} / 5 Quad Thorium Cells`, percent: Math.min(100, (thoriumCells / 5) * 100) };

      case 'seaborgiumCells5':
        const seaborgiumCells = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.type === 'quad_seaborgium_cell').length;
        return { text: `${seaborgiumCells} / 5 Quad Seaborgium Cells`, percent: Math.min(100, (seaborgiumCells / 5) * 100) };

      case 'doloriumCells5':
        const doloriumCells = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.type === 'quad_dolorium_cell').length;
        return { text: `${doloriumCells} / 5 Quad Dolorium Cells`, percent: Math.min(100, (doloriumCells / 5) * 100) };

      case 'nefastiumCells5':
        const nefastiumCells = game.tileset.getAllTiles().filter(tile => tile.part && tile.part.type === 'quad_nefastium_cell').length;
        return { text: `${nefastiumCells} / 5 Quad Nefastium Cells`, percent: Math.min(100, (nefastiumCells / 5) * 100) };

      case 'income50k':
        const income = game.reactor.stats_power * game.sell_price || 0;
        return { text: `$${income.toLocaleString()} / $50,000 per tick`, percent: Math.min(100, (income / 50000) * 100) };

      case 'totalMoney10b':
        const totalMoney = game.total_money_earned || 0;
        return { text: `$${totalMoney.toLocaleString()} / $10,000,000,000`, percent: Math.min(100, (totalMoney / 1e10) * 100) };

      case 'sustainedPower1000':
        // This would need to track sustained power over time - simplified for now
        const sustainedPower = game.reactor.stats_power || 0;
        return { text: `${sustainedPower.toLocaleString()} / 1,000 Power (sustained)`, percent: Math.min(100, (sustainedPower / 1000) * 100) };

      case 'heat10m':
        const heat = game.reactor.stats_heat || 0;
        return { text: `${heat.toLocaleString()} / 10,000,000 Heat`, percent: Math.min(100, (heat / 1e7) * 100) };

      // Add more cases for other objectives with quantifiable progress...
      default:
        // For objectives that are simple true/false checks
        return { text: "Awaiting completion...", percent: 0 };
    }
  }

  // Helper method to check if a vent is next to a cell
  checkVentNextToCell(game) {
    const tiles = game.tileset.getAllTiles();
    const cellTiles = tiles.filter(tile => tile.part && tile.part.category === 'cell');
    const ventTiles = tiles.filter(tile => tile.part && tile.part.category === 'vent');

    for (const cellTile of cellTiles) {
      for (const ventTile of ventTiles) {
        if (this.areAdjacent(cellTile, ventTile)) {
          return true;
        }
      }
    }
    return false;
  }

  // Helper method to check if two tiles are adjacent
  areAdjacent(tile1, tile2) {
    const dx = Math.abs(tile1.col - tile2.col);
    const dy = Math.abs(tile1.row - tile2.row);
    return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
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
