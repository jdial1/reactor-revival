import { toDecimal } from "../utils/decimal.js";
import { updateDecimal } from "./store.js";
import dataService from "../services/dataService.js";
import { getObjectiveCheck } from "./objectiveActions.js";
import { CHAPTER_NAMES, INFINITE_REWARD_BASE, INFINITE_REWARD_PER_COMPLETION, INFINITE_REWARD_CAP, INFINITE_CHALLENGES, INFINITE_CHALLENGE_IDS, OBJECTIVE_INTERVAL_MS, OBJECTIVE_WAIT_MS, PERCENT_COMPLETE_MAX, DEFAULT_OBJECTIVE_INDEX, CHAPTER_COMPLETION_OBJECTIVE_INDICES, CLAIM_FEEDBACK_DELAY_MS } from "./objective/objectiveConstants.js";
import { formatDisplayInfo } from "./objective/objectiveFormatter.js";
import { areAdjacent as areAdjacentFromModule } from "./logic/gridUtils.js";
import { checkVentNextToCell as checkVentNextToCellFromModule, checkChapterCompletion as checkChapterCompletionFromModule } from "./objectiveActions.js";
import { ObjectiveTracker } from "./objective/ObjectiveTracker.js";
import { ObjectiveEvaluator } from "./objective/ObjectiveEvaluator.js";
import { logger } from "../utils/logger.js";

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.objectives_data = [];
    this.current_objective_index = DEFAULT_OBJECTIVE_INDEX;
    this.objective_unloading = false;
    this.objective_interval = OBJECTIVE_INTERVAL_MS;
    this.objective_wait = OBJECTIVE_WAIT_MS;
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
    this.tracker = new ObjectiveTracker(this);
    this.evaluator = new ObjectiveEvaluator(this);
    this._sustainedTracking = {
      sustainedPower1k: { startTick: 0 },
      masterHighHeat: { startTick: 0 },
      infiniteHeatMaintain: { startTick: 0 },
    };
  }

  getSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (!t) return null;
    return t;
  }

  updateSustainedTracking(key, startTick) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = startTick;
  }

  resetSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = 0;
  }

  _syncActiveObjectiveToState() {
    const state = this.game?.state;
    if (!state?.active_objective) return;
    if (this.game?.isSandbox) {
      state.active_objective = {
        title: "Sandbox",
        index: 0,
        isComplete: false,
        isChapterCompletion: false,
        progressPercent: 0,
        hasProgressBar: false,
        checkId: null,
      };
      return;
    }
    const info = this.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const checkId = this.current_objective_def?.checkId ?? null;
    state.active_objective = {
      title: info.title ?? "",
      index: this.current_objective_index,
      isComplete: !!info.isComplete,
      isChapterCompletion: !!info.isChapterCompletion,
      progressPercent: info.progressPercent ?? 0,
      hasProgressBar: checkId === "sustainedPower1k" && !info.isComplete,
      checkId,
    };
  }

  _emitObjectiveLoaded(displayObjective) {
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveLoaded?.(displayObjective, this.current_objective_index);
    if (this.game?.emit) {
      this.game.emit("objectiveLoaded", {
        objective: displayObjective,
        objectiveIndex: this.current_objective_index
      });
    }
  }

  _emitObjectiveCompleted() {
    this._syncActiveObjectiveToState();
    if (this.game?.emit) this.game.emit("objectiveCompleted", {});
  }

  _emitObjectiveUnloaded() {
    this.game?.ui?.stateManager?.handleObjectiveUnloaded?.();
    if (this.game?.emit) this.game.emit("objectiveUnloaded", {});
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
    const reward = INFINITE_REWARD_BASE + Math.min(completedCount * INFINITE_REWARD_PER_COMPLETION, INFINITE_REWARD_CAP);
    if (challenge.id === "infiniteHeatMaintain") this.resetSustainedTracking("infiniteHeatMaintain");
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
    const { objectives } = await dataService.ensureAllGameDataLoaded();
    const data = objectives?.default || objectives;

    if (!Array.isArray(data)) {
      logger.log('error', 'game', 'objective_list_data is not an array:', data);
      return;
    }

    const existingCompletionStatus = this.objectives_data
      ? this.objectives_data.map(obj => obj.completed)
      : [];
    this.objectives_data = data;
    if (existingCompletionStatus.length > 0) {
      logger.log('debug', 'game', `Preserving ${existingCompletionStatus.filter(c => c).length} completed objectives during initialize`);
      existingCompletionStatus.forEach((completed, index) => {
        if (this.objectives_data[index]) {
          this.objectives_data[index].completed = completed;
        }
      });
    }

    logger.log('debug', 'game', `ObjectiveManager initialized with ${this.objectives_data.length} objectives`);
    logger.log('debug', 'game', `First objective: ${this.objectives_data[0]?.title}`);
    logger.log('debug', 'game', `Last objective: ${this.objectives_data[this.objectives_data.length - 1]?.title}`);
  }

  start() {
    logger.log('debug', 'game', `ObjectiveManager.start() called with current_objective_index: ${this.current_objective_index}`);

    if (!this.objectives_data || this.objectives_data.length === 0) {
      logger.log('debug', 'game', 'Objectives data not loaded yet, waiting for initialization...');
      this.initialize().then(() => {
        logger.log('debug', 'game', 'Initialization completed, now calling start() again');
        this.start();
      });
      return;
    }

    // Only set objective if it's not already set or if current_objective_def is null
    if (!this.current_objective_def) {
      logger.log('debug', 'game', `Setting objective to index ${this.current_objective_index}`);
      this.set_objective(this.current_objective_index, true);
    } else {
      logger.log('debug', 'game', 'Objective already set, skipping set_objective call');
    }

    setTimeout(() => {
      logger.log('debug', 'game', 'ObjectiveManager.checkAndAutoComplete() called');
      this.checkAndAutoComplete();
    }, 0);
  }

  checkAndAutoComplete() {
    return this.evaluator.checkAndAutoComplete();
  }

  check_current_objective() {
    return this.evaluator.checkCurrentObjective();
  }

  scheduleNextCheck() {
    return this.tracker.scheduleNextCheck();
  }

  _loadInfiniteObjective() {
    const inf = this.infiniteObjective || this.generateInfiniteObjective();
    this.current_objective_def = inf;
    this._emitObjectiveLoaded({ ...inf, title: inf.title });
    this.objective_unloading = false;
    this.scheduleNextCheck();
  }

  _loadNormalObjective(nextObjective) {
    this.current_objective_def = nextObjective;
    if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
      this.current_objective_def.completed = true;
      if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
      logger.log('debug', 'game', `Auto-completing chapter completion objective: ${this.current_objective_def.title}`);
      const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
      if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });
    }
    const displayObjective = {
      ...this.current_objective_def,
      title:
        typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title,
    };
    logger.log('debug', 'game', `Loading objective: ${displayObjective.title}`);
    this._emitObjectiveLoaded(displayObjective);
    this.objective_unloading = false;
    this.scheduleNextCheck();
  }

  _loadAllCompletedObjective() {
    this.current_objective_def = {
      title: "All objectives completed!",
      reward: 0,
      checkId: "allObjectives",
    };
    logger.log('debug', 'game', 'Loading "All objectives completed!" objective');
    this._emitObjectiveLoaded({ ...this.current_objective_def });
    clearTimeout(this.objective_timeout);
  }

  set_objective(objective_index, skip_wait = false) {
    return this.tracker.setObjective(objective_index, skip_wait);
  }

  claimObjective() {
    logger.log("info", "objectives", "[Claim] claimObjective called", {
      sandbox: this.game?.isSandbox,
      claiming: this.claiming,
      hasDef: !!this.current_objective_def,
      defId: this.current_objective_def?.checkId,
    });
    if (this.game?.isSandbox) {
      logger.log("info", "objectives", "[Claim] early return: sandbox");
      return;
    }
    if (this.claiming || !this.current_objective_def) {
      logger.log("info", "objectives", "[Claim] early return: claiming or no def", {
        claiming: this.claiming,
        hasDef: !!this.current_objective_def,
      });
      return;
    }

    let isComplete = this.current_objective_def.isChapterCompletion ?
      this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index) :
      this.current_objective_def.completed;

    if (!isComplete && this.current_objective_def.checkId) {
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      const result = checkFn?.(this.game);
      isComplete = !!result?.completed;
    }

    logger.log("info", "objectives", "[Claim] isComplete check", {
      isChapterCompletion: this.current_objective_def.isChapterCompletion,
      defCompleted: this.current_objective_def.completed,
      isComplete,
    });

    if (!isComplete) {
      logger.log("info", "objectives", "[Claim] early return: objective not complete");
      return;
    }

    logger.log("info", "objectives", "[Claim] claiming objective", { index: this.current_objective_index });
    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });
    const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
    if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });

    // Give the reward
    if (this.current_objective_def.reward) {
      updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(this.current_objective_def.reward)));
    } else if (this.current_objective_def.ep_reward) {
      this.game.exoticParticleManager.exotic_particles = this.game.exoticParticleManager.exotic_particles.add(this.current_objective_def.ep_reward);
      updateDecimal(this.game.state, "total_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
      updateDecimal(this.game.state, "current_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
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
    if (this.game?.saveManager) {
      void this.game.saveManager.autoSave();
    }

    if (this.game?.emit) this.game.emit("objectiveClaimed", {});
    setTimeout(() => {
      this.claiming = false;
    }, CLAIM_FEEDBACK_DELAY_MS);
  }

  getCurrentObjectiveDisplayInfo() {
    return formatDisplayInfo(this);
  }

  getCurrentObjectiveProgress() {
    if (!this.current_objective_def || this.current_objective_def.completed) {
      return { text: "", percent: 100 };
    }
    if (!this.game || !this.game.tileset || !this.game.reactor) {
      return { text: "Loading...", percent: 0 };
    }
    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    if (!checkFn) return { text: "Awaiting completion...", percent: 0 };
    const result = checkFn(this.game);
    return { text: result.text, percent: result.percent };
  }

  checkVentNextToCell(game) {
    return checkVentNextToCellFromModule(game);
  }

  checkChapterCompletion(startIndex, chapterSize) {
    return checkChapterCompletionFromModule(this.objectives_data, startIndex, chapterSize);
  }

  getChapterCompletionStatus(objective, objectiveIndex) {
    return objective.completed || false;
  }

  areAdjacent(tile1, tile2) {
    return areAdjacentFromModule(tile1, tile2);
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
