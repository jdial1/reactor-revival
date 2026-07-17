import { bundledGameData } from "../generated/bundledStaticData.js";
import { numFormat as fmt } from "../core/numbers.js";
import { logger } from "../core/logger.js";
import { areAdjacent as areAdjacentFromModule } from "../core/grid-helpers.js";
import {
  CHAPTER_NAMES,
  DEFAULT_OBJECTIVE_INDEX,
  CHAPTER_SIZE_DEFAULT,
  CHAPTER_4_SIZE,
  CHAPTER_COMPLETION_OBJECTIVE_INDICES,
  CLAIM_FEEDBACK_DELAY_MS,
} from "../constants/objectives.js";
import { requireActiveBridge } from "../bridge/active.js";

function loadObjectiveList() {
  const objectives = bundledGameData.objectives;
  const list = objectives?.default || objectives;
  if (!Array.isArray(list)) return list;
  return list.map((obj) => ({ ...obj, completed: false }));
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
    const bridge = requireActiveBridge(game, "getObjectiveCheck");
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
    this.current_objective_def = null;
    this.claiming = false;
    this._autoCompleteTimer = null;
  }

  teardown() {
    if (this._autoCompleteTimer != null) {
      clearTimeout(this._autoCompleteTimer);
      this._autoCompleteTimer = null;
    }
  }

  _readSessionProgress() {
    return requireActiveBridge(this.game, "objective progress").getObjectiveProgress()
      || { completed: false, percent: 0, text: "Awaiting completion..." };
  }

  _isSessionComplete(index = this.current_objective_index) {
    const objectives = this.game?.coreBridge?.session?.systems?.objectives ?? null;
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
      this.set_objective(this.current_objective_index);
    }
    if (this._autoCompleteTimer != null) clearTimeout(this._autoCompleteTimer);
    this._autoCompleteTimer = setTimeout(() => {
      this._autoCompleteTimer = null;
      this.checkAndAutoComplete();
    }, 0);
  }

  checkAndAutoComplete() {
    const bridge = this.game?.coreBridge;
    bridge?.hydrateObjectivesFromGame?.();
    bridge?.syncObjectiveIndex?.(this.current_objective_index);
    while (this.current_objective_def && this.current_objective_def.checkId !== "allObjectives") {
      this._syncActiveObjectiveToState?.();
      const wasAlreadyCompleted = !!this.objectives_data?.[this.current_objective_index]?.completed;
      const result = bridge?.tryAutoCompleteCurrentObjective?.();

      if (!result?.advanced) {
        break;
      }

      if (result.newlyCompleted && !wasAlreadyCompleted) this._emitObjectiveCompleted();
      if (this.game?.saveManager) void this.game.saveManager.autoSave();
      this.set_objective(this.current_objective_index);
      if (this.game?.saveManager) void this.game.saveManager.autoSave();
      if (
        this.current_objective_def?.isChapterCompletion
        || this.current_objective_def?.checkId === "allObjectives"
      ) {
        break;
      }
    }
  }

  check_current_objective() {
    const bridge = this.game?.coreBridge;
    const objectives = bridge?.session?.systems?.objectives;
    if (bridge?.session && objectives) {
      bridge._syncForObjectiveEval?.();
      bridge.syncObjectiveIndex?.(this.current_objective_index);
      const idx = this.current_objective_index;
      if (!objectives.isComplete?.(idx)) {
        bridge.session.checkObjective?.(bridge._objectiveEvalContext?.() ?? {
          meltdown: !!this.game?.reactor?.has_melted_down,
          hasMeltedDown: !!this.game?.reactor?.has_melted_down,
          paused: !!this.game?.paused,
        });
      }
      if (objectives.isComplete?.(idx) || this._isSessionComplete(idx)) {
        if (this.objectives_data?.[idx]) this.objectives_data[idx].completed = true;
        if (this.current_objective_def) this.current_objective_def.completed = true;
      }
    }
    this._syncActiveObjectiveToState();
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
      title: typeof this.current_objective_def.title === "function" ? this.current_objective_def.title() : this.current_objective_def.title,
    };
    this._emitObjectiveLoaded(displayObjective);
  }

  _loadAllCompletedObjective() {
    this.current_objective_def = {
      title: "All objectives completed!",
      reward: 0,
      checkId: "allObjectives",
    };
    this._emitObjectiveLoaded({ ...this.current_objective_def });
  }

  set_objective(objective_index) {
    if (!this.objectives_data || this.objectives_data.length === 0) return;
    let idx = typeof objective_index !== "number" || Number.isNaN(objective_index)
      ? parseInt(objective_index, 10) || 0
      : Math.floor(objective_index);

    idx = Math.max(0, Math.min(idx, this.objectives_data.length - 1));

    this.current_objective_index = idx;
    this.game?.coreBridge?.syncObjectiveIndex?.(this.current_objective_index);
    const nextObjective = this.objectives_data[this.current_objective_index];

    if (nextObjective && nextObjective.checkId === "allObjectives") {
      this._loadAllCompletedObjective();
    } else if (nextObjective) {
      this._loadNormalObjective(nextObjective);
    } else {
      this._loadAllCompletedObjective();
    }
  }

  claimObjective() {
    if (this.claiming) return;
    if (!this.current_objective_def) return;

    let isComplete = this.current_objective_def.isChapterCompletion
      ? this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index)
      : this.current_objective_def.completed;

    if (!isComplete) isComplete = this._isSessionComplete();
    if (!isComplete) return;

    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });
    const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
    if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });

    const claimedIndex = this.current_objective_index;
    const bridge = this.game.coreBridge;
    const sessionObj = bridge?.session?.systems?.objectives?.getCurrentObjective?.();
    const def = this.current_objective_def;
    const hostOnlyClaim = !!(def?.checkId && sessionObj?.checkId && def.checkId !== sessionObj.checkId);

    if (hostOnlyClaim) {
      bridge.grantReward?.(def);
      bridge.syncObjectiveClaim?.(claimedIndex);
      this.current_objective_index = bridge.session?.systems?.objectives?.currentIndex ?? claimedIndex + 1;
    } else if (!bridge?.completeAndClaimObjective?.(claimedIndex)) {
      this.claiming = false;
      return;
    }

    this.set_objective(this.current_objective_index);
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
    if (this.game?.emit) this.game.emit("objectiveClaimed", {});

    setTimeout(() => { this.claiming = false; }, CLAIM_FEEDBACK_DELAY_MS);
  }

  getCurrentObjectiveDisplayInfo() { return formatDisplayInfo(this); }
  getCurrentObjectiveProgress() {
    if (!this.current_objective_def || this.current_objective_def.completed) return { text: "", percent: 100 };
    if (!this.game || !this.game.tileset || !this.game.reactor) return { text: "Loading...", percent: 0 };
    const result = this._readSessionProgress();
    return { text: result.text || "Awaiting completion...", percent: result.percent || 0 };
  }
  checkChapterCompletion(startIndex, chapterSize) { return _checkChapterCompletion(this.objectives_data, startIndex, chapterSize); }
  getChapterCompletionStatus(objective) { return objective.completed || false; }
  areAdjacent(tile1, tile2) { return areAdjacentFromModule(tile1, tile2); }
  getCurrentObjectiveInfo() {
    return {
      index: this.current_objective_index,
      title: this.current_objective_def ? (typeof this.current_objective_def.title === "function" ? this.current_objective_def.title() : this.current_objective_def.title) : "No objective loaded",
      checkId: this.current_objective_def?.checkId || null,
      total_objectives: this.objectives_data.length,
      completed: this.current_objective_def?.completed || false,
    };
  }
}
export { getObjectiveClaimText };
