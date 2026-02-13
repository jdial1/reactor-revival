import { toDecimal } from "../utils/decimal.js";
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

const INFINITE_REWARD_BASE = 250;

const INFINITE_CHALLENGES = [
  {
    id: "infinitePower",
    nextTarget: (last) => (last < 5000 ? 5000 : last + 5000),
    title: (t) => `Generate ${Number(t).toLocaleString()} Power`,
    getLastKey: () => "_lastInfinitePowerTarget",
  },
  {
    id: "infiniteHeatMaintain",
    nextTarget: (last) => {
      const base = last ? last.ticks + 100 : 200;
      return { percent: 50, ticks: Math.min(base, 2000) };
    },
    title: (t) => `Maintain ${t.percent}% heat for ${t.ticks} ticks`,
    getLastKey: () => "_lastInfiniteHeatMaintain",
  },
  {
    id: "infiniteMoneyThorium",
    nextTarget: (last) => (last < 1e8 ? 1e8 : last * 2),
    title: (t) => `Generate $${Number(t).toLocaleString()} with only Thorium cells`,
    getLastKey: () => "_lastInfiniteMoneyThorium",
  },
  {
    id: "infiniteHeat",
    nextTarget: (last) => (last < 5e6 ? 5e6 : last * 2),
    title: (t) => `Reach ${Number(t).toLocaleString()} Heat`,
    getLastKey: () => "_lastInfiniteHeat",
  },
  {
    id: "infiniteEP",
    nextTarget: (last) => (last < 100 ? 100 : last * 2),
    title: (t) => `Generate ${Number(t).toLocaleString()} Exotic Particles`,
    getLastKey: () => "_lastInfiniteEP",
  },
];

const INFINITE_CHALLENGE_IDS = new Set(INFINITE_CHALLENGES.map((c) => c.id));

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
    this.infiniteObjective = null;
    this._lastInfinitePowerTarget = 0;
    this._lastInfiniteHeatMaintain = null;
    this._lastInfiniteMoneyThorium = 0;
    this._lastInfiniteHeat = 0;
    this._lastInfiniteEP = 0;
    this._infiniteChallengeIndex = 0;
  }

  generateInfiniteObjective() {
    const idx = this._infiniteChallengeIndex % INFINITE_CHALLENGES.length;
    const challenge = INFINITE_CHALLENGES[idx];
    this._infiniteChallengeIndex = (idx + 1) % INFINITE_CHALLENGES.length;
    const lastKey = challenge.getLastKey();
    const last = this[lastKey] ?? 0;
    const target = challenge.nextTarget(last);
    this[lastKey] = target;
    const completedCount = this._infiniteCompletedCount || 0;
    const reward = INFINITE_REWARD_BASE + Math.min(completedCount * 50, 500);
    if (challenge.id === "infiniteHeatMaintain") this.game.infiniteHeatMaintain = { startTick: 0 };
    this.infiniteObjective = {
      title: challenge.title(target),
      checkId: challenge.id,
      target,
      reward,
      completed: false,
    };
    return this.infiniteObjective;
  }

  async initialize() {
    await ensureDataLoaded();

    // Handle ES module format
    const data = objective_list_data.default || objective_list_data;

    if (!Array.isArray(data)) {
      this.game.logger?.error("objective_list_data is not an array:", data);
      return;
    }

    // Preserve existing completion status if objectives_data already exists
    const existingCompletionStatus = this.objectives_data ?
      this.objectives_data.map(obj => obj.completed) : [];

    // Store the data directly - no need for Objective class instances
    this.objectives_data = data;

    // Restore completion status if it existed
    if (existingCompletionStatus.length > 0) {
      this.game.logger?.debug(`Preserving ${existingCompletionStatus.filter(c => c).length} completed objectives during initialize`);
      existingCompletionStatus.forEach((completed, index) => {
        if (this.objectives_data[index]) {
          this.objectives_data[index].completed = completed;
        }
      });
    }

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

    // Only set objective if it's not already set or if current_objective_def is null
    if (!this.current_objective_def) {
      this.game.logger?.debug(`Setting objective to index ${this.current_objective_index}`);
      this.set_objective(this.current_objective_index, true);
    } else {
      this.game.logger?.debug(`Objective already set, skipping set_objective call`);
    }

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

        // Chapter completion objectives are now auto-completed when reached

        // Save the game after marking objective as completed
        if (this.game && this.game.saveGame) {
          this.game.saveGame();
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
            this.game.debugHistory.add('objectives', 'Claiming money reward', { index: this.current_objective_index, reward: this.current_objective_def.reward });
            this.game._current_money = this.game._current_money.add(toDecimal(this.current_objective_def.reward));
            this.game.ui.stateManager.setVar(
              "current_money",
              this.game._current_money,
              true
            );
          } else if (this.current_objective_def.ep_reward) {
            console.log(`[DEBUG] Giving EP reward: ${this.current_objective_def.ep_reward}`);
            this.game.debugHistory.add('objectives', 'Claiming EP reward', { index: this.current_objective_index, ep_reward: this.current_objective_def.ep_reward });
            this.game.exotic_particles = this.game.exotic_particles.add(this.current_objective_def.ep_reward);
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
          this.game.saveGame(null, true); // true = isAutoSave
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
    if (this.game?.isSandbox) return;
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

      // Save the game after marking objective as completed
      if (this.game && this.game.saveGame) {
        this.game.saveGame(null, true); // true = isAutoSave
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
    if (this.game.debugHistory) {
      this.game.debugHistory.add('objectives', 'Setting objective', { index: objective_index, id: nextObjective?.checkId });
    }
    this.game.logger?.debug(`Setting objective ${objective_index}: ${nextObjective?.title || 'undefined'}`);

    const updateLogic = () => {
      if (nextObjective && nextObjective.checkId === "allObjectives") {
        const inf = this.infiniteObjective || this.generateInfiniteObjective();
        this.current_objective_def = inf;
        const displayObjective = { ...inf, title: inf.title };
        this.game.ui.stateManager.handleObjectiveLoaded(displayObjective, this.current_objective_index);
        if (this.game.ui && typeof this.game.ui.updateObjectiveDisplay === "function") {
          this.game.ui.updateObjectiveDisplay();
        }
        this.objective_unloading = false;
        this.scheduleNextCheck();
        return;
      }
      if (nextObjective) {
        this.current_objective_def = nextObjective;

        if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
          this.current_objective_def.completed = true;
          // Also mark the corresponding entry in objectives_data as completed
          if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
            this.objectives_data[this.current_objective_index].completed = true;
          }
          this.game.logger?.debug(`Auto-completing chapter completion objective: ${this.current_objective_def.title}`);
          const chapterIdx = [9, 19, 29, 36].indexOf(this.current_objective_index);
          if (chapterIdx >= 0 && this.game.ui?.showChapterCelebration) {
            this.game.ui.showChapterCelebration(chapterIdx);
          }
        }

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

  claimObjective() {
    if (this.game?.isSandbox) return;
    if (this.claiming || !this.current_objective_def) {
      return;
    }

    // For chapter completion objectives, check the chapter completion status
    // For regular objectives, check the normal completed status
    const isComplete = this.current_objective_def.isChapterCompletion ?
      this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index) :
      this.current_objective_def.completed;

    if (!isComplete) {
      console.log(`[DEBUG] Cannot claim objective ${this.current_objective_index}: not complete`);
      return;
    }

    this.claiming = true;
    if (this.game.ui?.doublePulseVibration) this.game.ui.doublePulseVibration();
    const chapterIdx = [9, 19, 29, 36].indexOf(this.current_objective_index);
    if (chapterIdx >= 0 && this.game.ui?.showChapterCelebration) {
      this.game.ui.showChapterCelebration(chapterIdx);
    }

    // Give the reward
    if (this.current_objective_def.reward) {
      this.game._current_money = this.game._current_money.add(toDecimal(this.current_objective_def.reward));
      this.game.ui.stateManager.setVar(
        "current_money",
        this.game._current_money,
        true
      );
    } else if (this.current_objective_def.ep_reward) {
      this.game.exotic_particles = this.game.exotic_particles.add(this.current_objective_def.ep_reward);
      this.game.ui.stateManager.setVar(
        "exotic_particles",
        this.game.exotic_particles,
        true
      );
    }

    if (INFINITE_CHALLENGE_IDS.has(this.current_objective_def.checkId)) {
      this._infiniteCompletedCount = (this._infiniteCompletedCount || 0) + 1;
      this.generateInfiniteObjective();
      this.set_objective(this.current_objective_index, true);
    } else {
      this.current_objective_index++;
      const maxValidIndex = this.objectives_data.length - 1;
      if (this.current_objective_index > maxValidIndex) {
        this.current_objective_index = maxValidIndex;
      }
      this.set_objective(this.current_objective_index, true);
    }

    // Always save after claiming
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame(null, true); // true = isAutoSave
    }

    if (this.game?.emit) this.game.emit("objectiveClaimed", {});
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
        flavor_text: objective.flavor_text,
        progressText: "Loading...",
        progressPercent: 0,
        reward: {
          money: objective.reward || 0,
          ep: objective.ep_reward || 0
        },
        isComplete: objective.completed || false,
        isChapterCompletion: objective.isChapterCompletion || false
      };
    }

    const chapterIndex = Math.floor(index / 10);
    const chapterStart = chapterIndex * 10;

    // Calculate chapter size (last chapter has 7 objectives, others have 10)
    let chapterSize = 10;
    if (chapterIndex === 3) { // Chapter 4 (index 3)
      chapterSize = 7;
    }

    let completedInChapter = 0;
    for (let i = chapterStart; i < index; i++) {
      if (this.objectives_data[i] && this.objectives_data[i].completed) {
        completedInChapter++;
      }
    }
    if (objective.completed) completedInChapter++;


    const progress = this.getCurrentObjectiveProgress();

    // Ensure progress is always a valid object
    const safeProgress = progress || { text: "Loading...", percent: 0 };

    return {
      chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`,
      chapterProgressText: `${completedInChapter} / ${chapterSize}`,
      chapterProgressPercent: (completedInChapter / chapterSize) * 100,

      title: objective.title,
      description: objective.description || '',
      flavor_text: objective.flavor_text,

      progressText: safeProgress.text,
      progressPercent: Math.min(100, safeProgress.percent), // Clamp at 100%

      reward: {
        money: objective.reward || 0,
        ep: objective.ep_reward || 0
      },
      isComplete: objective.isChapterCompletion ?
        this.getChapterCompletionStatus(objective, index) :
        (objective.completed || false),
      isChapterCompletion: objective.isChapterCompletion || false
    };
  }

  // NEW METHOD to get specific progress for the current objective
  getCurrentObjectiveProgress() {
    const objective = this.current_objective_def;
    if (!objective || objective.completed) {
      return { text: "", percent: 100 };
    }

    const checkId = objective.checkId;
    const game = this.game;

    // Check if game is fully initialized
    if (!game || !game.tileset || !game.reactor) {
      return { text: "Loading...", percent: 0 };
    }

    // Check if objectives_data is available
    if (!this.objectives_data || this.objectives_data.length === 0) {
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

      case 'firstBillion': {
        const money = (game.current_money && typeof game.current_money.toNumber === 'function' ? game.current_money.toNumber() : Number(game.current_money)) || 0;
        return { text: `$${money.toLocaleString()} / $1,000,000,000`, percent: Math.min(100, (money / 1e9) * 100) };
      }
      case 'ep10': {
        const ep = (game.exotic_particles && typeof game.exotic_particles.toNumber === 'function' ? game.exotic_particles.toNumber() : Number(game.exotic_particles)) || 0;
        return { text: `${ep} / 10 EP Generated`, percent: Math.min(100, (ep / 10) * 100) };
      }
      case 'ep51': {
        const ep51 = (game.exotic_particles && typeof game.exotic_particles.toNumber === 'function' ? game.exotic_particles.toNumber() : Number(game.exotic_particles)) || 0;
        return { text: `${ep51} / 51 EP Generated`, percent: Math.min(100, (ep51 / 51) * 100) };
      }
      case 'ep250': {
        const ep250 = (game.exotic_particles && typeof game.exotic_particles.toNumber === 'function' ? game.exotic_particles.toNumber() : Number(game.exotic_particles)) || 0;
        return { text: `${ep250} / 250 EP Generated`, percent: Math.min(100, (ep250 / 250) * 100) };
      }
      case 'ep1000': {
        const ep1000 = (game.exotic_particles && typeof game.exotic_particles.toNumber === 'function' ? game.exotic_particles.toNumber() : Number(game.exotic_particles)) || 0;
        return { text: `${ep1000} / 1,000 EP Generated`, percent: Math.min(100, (ep1000 / 1000) * 100) };
      }

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

      case 'sustainedPower1k': {
        const TICKS_REQUIRED = 30;
        if (!game.sustainedPower1k) game.sustainedPower1k = { startTick: 0 };
        const state = game.sustainedPower1k;
        const powerOk = game.reactor.stats_power >= 1000 && !game.paused && game.engine;
        if (!powerOk) {
          const power = game.reactor.stats_power || 0;
          return { text: `${power.toLocaleString()} / 1,000 Power (hold 30 ticks)`, percent: 0 };
        }
        if (state.startTick === 0) state.startTick = game.engine.tick_count;
        const elapsedTicks = game.engine.tick_count - state.startTick;
        const percent = Math.min(100, (elapsedTicks / TICKS_REQUIRED) * 100);
        return { text: `${elapsedTicks} / ${TICKS_REQUIRED} ticks steady`, percent };
      }

      case 'heat10m':
        const heat = game.reactor.stats_heat || 0;
        return { text: `${heat.toLocaleString()} / 10,000,000 Heat`, percent: Math.min(100, (heat / 1e7) * 100) };
      case 'completeChapter1':
        return this.checkChapterCompletion(0, 10); // Chapter 1: objectives 0-9
      case 'completeChapter2':
        return this.checkChapterCompletion(10, 10); // Chapter 2: objectives 10-19
      case 'completeChapter3':
        return this.checkChapterCompletion(20, 10); // Chapter 3: objectives 20-29
      case 'completeChapter4':
        return this.checkChapterCompletion(30, 7); // Chapter 4: objectives 30-36

      case 'allObjectives':
        return { text: "All objectives completed!", percent: 100 };

      case 'infinitePower': {
        const target = objective.target;
        if (target == null) return { text: "Awaiting completion...", percent: 0 };
        const power = game.reactor?.stats_power ?? 0;
        const pct = Math.min(100, (power / target) * 100);
        return { text: `${power.toLocaleString()} / ${target.toLocaleString()} Power`, percent: pct };
      }

      case 'infiniteHeatMaintain': {
        const t = objective.target;
        if (!t?.percent || !t?.ticks || !game.engine) return { text: "Awaiting completion...", percent: 0 };
        const reactor = game.reactor;
        const maxH = reactor.max_heat && typeof reactor.max_heat.toNumber === "function" ? reactor.max_heat.toNumber() : Number(reactor.max_heat ?? 0);
        const curH = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
        const heatOk = maxH > 0 && curH / maxH >= t.percent / 100 && !game.paused && !reactor.has_melted_down;
        if (!heatOk) return { text: `Maintain ${t.percent}% heat (${((curH / maxH) * 100 || 0).toFixed(0)}% now)`, percent: 0 };
        if (!game.infiniteHeatMaintain) game.infiniteHeatMaintain = { startTick: 0 };
        if (game.infiniteHeatMaintain.startTick === 0) game.infiniteHeatMaintain.startTick = game.engine.tick_count;
        const elapsed = game.engine.tick_count - game.infiniteHeatMaintain.startTick;
        const pct = Math.min(100, (elapsed / t.ticks) * 100);
        return { text: `${elapsed} / ${t.ticks} ticks at ${t.percent}%`, percent: pct };
      }

      case 'infiniteMoneyThorium': {
        const target = objective.target;
        if (target == null) return { text: "Awaiting completion...", percent: 0 };
        const cells = game.tileset?.tiles_list?.filter((t) => t?.part?.category === "cell") ?? [];
        const nonThorium = cells.some((t) => t.part?.id !== "thorium3" && t.part?.type !== "quad_thorium_cell");
        const money = game.current_money && typeof game.current_money.toNumber === "function" ? game.current_money.toNumber() : Number(game.current_money ?? 0);
        if (cells.length === 0) return { text: "Add Thorium cells to generate", percent: 0 };
        if (nonThorium) return { text: "Only Thorium cells allowed", percent: 0 };
        const pct = Math.min(100, (money / target) * 100);
        return { text: `$${money.toLocaleString()} / $${target.toLocaleString()} (Thorium only)`, percent: pct };
      }

      case 'infiniteHeat': {
        const target = objective.target;
        if (target == null) return { text: "Awaiting completion...", percent: 0 };
        const heat = game.reactor?.stats_heat ?? 0;
        const pct = Math.min(100, (heat / target) * 100);
        return { text: `${heat.toLocaleString()} / ${target.toLocaleString()} Heat`, percent: pct };
      }

      case 'infiniteEP': {
        const target = objective.target;
        if (target == null) return { text: "Awaiting completion...", percent: 0 };
        const ep = game.exotic_particles && typeof game.exotic_particles.toNumber === "function" ? game.exotic_particles.toNumber() : Number(game.exotic_particles ?? 0);
        const pct = Math.min(100, (ep / target) * 100);
        return { text: `${ep} / ${target} EP`, percent: pct };
      }

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

  // Helper method to check chapter completion
  checkChapterCompletion(startIndex, chapterSize) {
    // Safety check for objectives_data
    if (!this.objectives_data || this.objectives_data.length === 0) {
      return { text: "Loading...", percent: 0 };
    }

    let completedCount = 0;
    const endIndex = Math.min(startIndex + chapterSize, this.objectives_data.length);

    for (let i = startIndex; i < endIndex; i++) {
      // Skip chapter completion objectives when counting
      if (this.objectives_data[i] && !this.objectives_data[i].isChapterCompletion && this.objectives_data[i].completed) {
        completedCount++;
      }
    }

    // Total objectives excluding chapter completion objectives
    let totalObjectives = 0;
    for (let i = startIndex; i < endIndex; i++) {
      if (this.objectives_data[i] && !this.objectives_data[i].isChapterCompletion) {
        totalObjectives++;
      }
    }

    const percent = totalObjectives > 0 ? (completedCount / totalObjectives) * 100 : 0;

    return {
      text: `${completedCount} / ${totalObjectives} Objectives Complete`,
      percent: Math.min(100, percent)
    };
  }

  // Helper method to determine if a chapter completion objective is complete
  getChapterCompletionStatus(objective, objectiveIndex) {
    // For regular objectives, use the normal completed status
    if (!objective.isChapterCompletion) {
      return objective.completed || false;
    }

    // For chapter completion objectives, simply return their completion status
    // They should be automatically marked as completed when reached
    return objective.completed || false;
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
