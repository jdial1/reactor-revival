import { subscribeKey } from "valtio/vanilla/utils";
import { bundledGameData } from "../bundledStaticData.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { areAdjacent as areAdjacentFromModule } from "../core/grid-helpers.js";
import {
  CHAPTER_NAMES,
  OBJECTIVE_INTERVAL_MS,
  OBJECTIVE_WAIT_MS,
  DEFAULT_OBJECTIVE_INDEX,
  CHAPTER_SIZE_DEFAULT,
  CHAPTER_4_SIZE,
  CHAPTER_COMPLETION_OBJECTIVE_INDICES,
  CLAIM_FEEDBACK_DELAY_MS,
} from "../constants/objectives.js";

function loadObjectiveList() {
  const objectives = bundledGameData.objectives;
  return objectives?.default || objectives;
}

function _checkChapterCompletion(objectives_data, startIndex, chapterSize) {
  if (!objectives_data || objectives_data.length === 0) return { completed: false, text: "Loading...", percent: 0 };
  const endIndex = Math.min(startIndex + chapterSize, objectives_data.length);
  let completedCount = 0;
  let totalObjectives = 0;
  for (let i = startIndex; i < endIndex; i++) {
    const obj = objectives_data[i];
    if (!obj || obj.isChapterCompletion) continue;
    totalObjectives++;
    if (obj.completed) completedCount++;
  }
  const percent = totalObjectives > 0 ? (completedCount / totalObjectives) * 100 : 0;
  return { completed: completedCount >= totalObjectives, text: `${completedCount} / ${totalObjectives} Objectives Complete`, percent: Math.min(100, percent) };
}

const OBJECTIVE_VALTIO_WATCH_KEYS = [
  "current_money",
  "current_exotic_particles",
  "total_exotic_particles",
  "stats_power",
  "stats_heat_generation",
  "stats_cash",
  "current_heat",
  "current_power",
];
const OBJECTIVE_WATCH_THROTTLE_MS = 200;

function buildLoadingDisplayInfo(objective) {
  return {
    chapterName: "Loading...",
    chapterProgressText: "0 / 10",
    chapterProgressPercent: 0,
    title: objective.title || "Loading...",
    description: objective.description || "",
    flavor_text: objective.flavor_text,
    progressText: "Loading...",
    progressPercent: 0,
    reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 },
    isComplete: objective.completed || false,
    isChapterCompletion: objective.isChapterCompletion || false,
  };
}

function getChapterSize(chapterIndex) {
  return chapterIndex === 3 ? CHAPTER_4_SIZE : CHAPTER_SIZE_DEFAULT;
}

function computeCompletedInChapter(manager, chapterStart, index, objective) {
  let completed = 0;
  for (let i = chapterStart; i < index; i++) {
    if (manager.objectives_data[i]?.completed) completed++;
  }
  if (objective.completed) completed++;
  return completed;
}

function buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress) {
  const safeProgress = progress || { text: "Loading...", percent: 0 };
  return {
    chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`,
    chapterProgressText: `${completedInChapter} / ${chapterSize}`,
    chapterProgressPercent: (completedInChapter / chapterSize) * 100,
    title: objective.title,
    description: objective.description || "",
    flavor_text: objective.flavor_text,
    progressText: safeProgress.text,
    progressPercent: Math.min(100, safeProgress.percent),
    reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 },
    isComplete: objective.completed || false,
    isChapterCompletion: objective.isChapterCompletion || false,
  };
}

function formatDisplayInfo(manager) {
  if (!manager.current_objective_def || manager.current_objective_index < 0) return null;
  const index = manager.current_objective_index;
  const objective = manager.current_objective_def;
  if (!manager.game || !manager.game.tileset || !manager.game.reactor) return buildLoadingDisplayInfo(objective);
  const chapterIndex = Math.floor(index / CHAPTER_SIZE_DEFAULT);
  const chapterStart = chapterIndex * CHAPTER_SIZE_DEFAULT;
  const chapterSize = getChapterSize(chapterIndex);
  const completedInChapter = computeCompletedInChapter(manager, chapterStart, index, objective);
  const progress = manager.getCurrentObjectiveProgress();
  return buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress);
}

function formatObjectiveRewardLabel(reward) {
  const money = Number(reward?.money ?? 0);
  const ep = Number(reward?.ep ?? 0);
  if (money > 0) return `$${fmt(money)}`;
  if (ep > 0) return `${fmt(ep)} EP`;
  return "";
}

function getObjectiveClaimText(reward) {
  const rewardLabel = formatObjectiveRewardLabel(reward);
  return rewardLabel ? `Claim ${rewardLabel}` : "Claim";
}

export function getObjectiveCheck(checkId) {
  if (!checkId) return null;
  return (game) => {
    const bridge = game?.coreBridge;
    if (!bridge?.isActive) throw new Error("getObjectiveCheck requires an active core session");
    return bridge.evaluateObjectiveCheck(checkId) || {
      completed: false,
      percent: 0,
      text: "Awaiting completion...",
    };
  };
}

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
    this._objectiveWatchUnsubs = [];
    this._objectiveWatchLastFire = 0;
  }

  _clearObjectiveStateWatchers() {
    const u = this._objectiveWatchUnsubs;
    for (let i = 0; i < u.length; i++) {
      if (typeof u[i] === "function") u[i]();
    }
    this._objectiveWatchUnsubs = [];
  }

  _bindObjectiveStateWatchers() {
    this._clearObjectiveStateWatchers();
    const st = this.game?.state;
    if (!st || this.disableTimers) return;
    const fire = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - this._objectiveWatchLastFire < OBJECTIVE_WATCH_THROTTLE_MS) return;
      this._objectiveWatchLastFire = now;
      this.check_current_objective();
    };
    for (let i = 0; i < OBJECTIVE_VALTIO_WATCH_KEYS.length; i++) {
      const key = OBJECTIVE_VALTIO_WATCH_KEYS[i];
      try {
        this._objectiveWatchUnsubs.push(subscribeKey(st, key, fire));
      } catch (_) {}
    }
  }

  _sessionObjectives() {
    return this.game?.coreBridge?.session?.systems?.objectives ?? null;
  }

  _syncIndexToSession() {
    this.game?.coreBridge?.syncObjectiveIndex?.(this.current_objective_index);
  }

  _readSessionProgress() {
    const bridge = this.game?.coreBridge;
    if (!bridge?.isActive) throw new Error("objective progress requires an active core session");
    return bridge.getObjectiveProgress() || { completed: false, percent: 0, text: "Awaiting completion..." };
  }

  _isSessionComplete(index = this.current_objective_index) {
    const objectives = this._sessionObjectives();
    if (!objectives) return !!this.current_objective_def?.completed;
    if (objectives.isComplete(index)) return true;
    if (index !== this.current_objective_index) {
      return !!this.objectives_data?.[index]?.completed;
    }
    return !!this._readSessionProgress().completed;
  }

  _syncActiveObjectiveToState() {
    const state = this.game?.state;
    if (!state?.active_objective) return;
    const info = this.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const checkId = this.current_objective_def?.checkId ?? null;
    state.active_objective = {
      title: info.title ?? "",
      index: this.current_objective_index,
      isComplete: !!info.isComplete,
      isChapterCompletion: !!info.isChapterCompletion,
      reward: info.reward ?? null,
      progressPercent: info.progressPercent ?? 0,
      hasProgressBar: checkId === "sustainedPower1k" && !info.isComplete,
      checkId,
    };
  }

  _emitObjectiveLoaded(displayObjective) {
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveLoaded?.(displayObjective, this.current_objective_index);
  }

  _emitObjectiveCompleted() {
    const def = this.current_objective_def;
    const checkId = def?.checkId;
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveCompleted?.();
    const notifications = this.game?.state?.objective_notifications;
    if (notifications) {
      notifications.push({
        kind: "completed",
        checkId,
        flavorText: def?.flavor_text,
        isChapterCompletion: !!def?.isChapterCompletion,
      });
    }
  }

  _emitObjectiveUnloaded() {
    this._clearObjectiveStateWatchers();
    this.game?.ui?.stateManager?.handleObjectiveUnloaded?.();
  }

  async initialize() {
    const data = loadObjectiveList();
    if (!Array.isArray(data)) {
      logger.log("error", "game", "objective_list_data is not an array:", data);
      return;
    }
    const existingCompletionStatus = this.objectives_data
      ? this.objectives_data.map((obj) => obj.completed)
      : [];
    this.objectives_data = data;
    if (existingCompletionStatus.length > 0) {
      existingCompletionStatus.forEach((completed, index) => {
        if (this.objectives_data[index]) this.objectives_data[index].completed = completed;
      });
    }
    this.game?.coreBridge?.hydrateObjectivesFromGame?.();
  }

  start() {
    if (!this.objectives_data || this.objectives_data.length === 0) {
      this.initialize().then(() => this.start());
      return;
    }
    if (!this.current_objective_def) {
      this.set_objective(this.current_objective_index, true);
    }
    setTimeout(() => this.checkAndAutoComplete(), 0);
  }

  scheduleNextCheck() {
    clearTimeout(this.objective_timeout);
    if (this.disableTimers) return;
    this.objective_timeout = setTimeout(() => this.check_current_objective(), this.objective_interval);
  }

  checkAndAutoComplete() {
    if (typeof window !== "undefined" && window.location && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && typeof process === "undefined") {
      this.scheduleNextCheck();
      return;
    }
    if (this.current_objective_index === 0 && !this.game._saved_objective_index) {
      this.scheduleNextCheck();
      return;
    }
    const bridge = this.game?.coreBridge;
    bridge?.hydrateObjectivesFromGame?.();
    this._syncIndexToSession();
    while (this.current_objective_def && this.current_objective_def.checkId !== "allObjectives") {
      this._syncActiveObjectiveToState?.();
      const progress = this._readSessionProgress();
      if (progress?.completed || this._isSessionComplete()) {
        const wasAlreadyCompleted = this.objectives_data?.[this.current_objective_index]?.completed;
        this.current_objective_def.completed = true;
        if (this.objectives_data?.[this.current_objective_index]) {
          this.objectives_data[this.current_objective_index].completed = true;
        }
        bridge?.session?.systems?.objectives?.markComplete?.(this.current_objective_index);
        if (this.game?.saveManager) void this.game.saveManager.autoSave();
        if (!wasAlreadyCompleted) {
          this._emitObjectiveCompleted();
          this.game.coreBridge?.grantReward?.(this.current_objective_def);
        }
        this.current_objective_index++;
        const maxValidIndex = this.objectives_data.length - 1;
        if (this.current_objective_index > maxValidIndex) this.current_objective_index = maxValidIndex;
        this.set_objective(this.current_objective_index, true);
        if (this.game?.saveManager) void this.game.saveManager.autoSave();
        if (
          this.current_objective_def?.isChapterCompletion
          || this.current_objective_def?.checkId === "allObjectives"
        ) {
          break;
        }
      } else {
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
    this.game.coreBridge?.syncObjectiveFlagsFromGame?.();
    const progress = this._readSessionProgress();
    this._syncActiveObjectiveToState();
    if (!progress?.completed && !this._isSessionComplete()) {
      this.scheduleNextCheck();
      return;
    }
    this.current_objective_def.completed = true;
    if (this.objectives_data?.[this.current_objective_index]) {
      this.objectives_data[this.current_objective_index].completed = true;
    }
    this.game.coreBridge?.session?.systems?.objectives?.markComplete?.(this.current_objective_index);
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
    this._emitObjectiveCompleted();
    const displayObjective = {
      ...this.current_objective_def,
      title: typeof this.current_objective_def.title === "function" ? this.current_objective_def.title() : this.current_objective_def.title,
      completed: true,
    };
    this._emitObjectiveLoaded(displayObjective);
    clearTimeout(this.objective_timeout);
  }

  _loadNormalObjective(nextObjective) {
    this.current_objective_def = nextObjective;
    if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
      this.current_objective_def.completed = true;
      if (this.objectives_data?.[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
      this.game.coreBridge?.session?.systems?.objectives?.markComplete?.(this.current_objective_index);
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
    this._emitObjectiveLoaded(displayObjective);
    this.objective_unloading = false;
    this._bindObjectiveStateWatchers();
    this.scheduleNextCheck();
  }

  _loadAllCompletedObjective() {
    this._clearObjectiveStateWatchers();
    this.current_objective_def = {
      title: "All objectives completed!",
      reward: 0,
      checkId: "allObjectives",
    };
    this._emitObjectiveLoaded({ ...this.current_objective_def });
    clearTimeout(this.objective_timeout);
  }

  set_objective(objective_index, skip_wait = false) {
    if (!this.objectives_data || this.objectives_data.length === 0) return;
    if (typeof objective_index !== "number" || Number.isNaN(objective_index)) {
      const parsed = parseInt(objective_index, 10);
      objective_index = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    } else {
      objective_index = Math.floor(objective_index);
    }
    if (objective_index < 0) objective_index = 0;
    const maxValidIndex = this.objectives_data.length - 1;
    if (objective_index > maxValidIndex) objective_index = maxValidIndex;
    this.current_objective_index = objective_index;
    this._syncIndexToSession();
    const nextObjective = this.objectives_data[this.current_objective_index];
    clearTimeout(this.objective_timeout);
    const updateLogic = () => {
      if (nextObjective && nextObjective.checkId === "allObjectives") {
        this._loadAllCompletedObjective();
        return;
      }
      if (nextObjective) this._loadNormalObjective(nextObjective);
      else this._loadAllCompletedObjective();
    };
    if (skip_wait) updateLogic();
    else {
      this.objective_unloading = true;
      this._emitObjectiveUnloaded();
      this.objective_timeout = setTimeout(updateLogic, this.objective_wait);
    }
  }

  claimObjective() {
    if (this.claiming) {
      if (!this.disableTimers) return;
      this.claiming = false;
    }
    if (!this.current_objective_def) return;

    let isComplete = this.current_objective_def.isChapterCompletion
      ? this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index)
      : this.current_objective_def.completed;

    if (!isComplete) {
      isComplete = this._isSessionComplete();
    }

    if (!isComplete) return;

    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });
    const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
    if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });

    this.game.coreBridge?.grantReward?.(this.current_objective_def);

    const claimedIndex = this.current_objective_index;
    this.game.coreBridge?.syncObjectiveClaim?.(claimedIndex);

    this.current_objective_index++;
    const maxValidIndex = this.objectives_data.length - 1;
    if (this.current_objective_index > maxValidIndex) {
      this.current_objective_index = maxValidIndex;
    }
    this.set_objective(this.current_objective_index, true);

    if (this.game?.saveManager) void this.game.saveManager.autoSave();
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
    const result = this._readSessionProgress();
    return { text: result.text || "Awaiting completion...", percent: result.percent || 0 };
  }

  checkChapterCompletion(startIndex, chapterSize) {
    return _checkChapterCompletion(this.objectives_data, startIndex, chapterSize);
  }

  getChapterCompletionStatus(objective) {
    return objective.completed || false;
  }

  areAdjacent(tile1, tile2) {
    return areAdjacentFromModule(tile1, tile2);
  }

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

export { getObjectiveClaimText };
