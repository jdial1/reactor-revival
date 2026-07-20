import { bundledGameData } from "../generated/bundledStaticData.js";
import { logger } from "../core/logger.js";
import {
  DEFAULT_OBJECTIVE_INDEX,
  CLAIM_FEEDBACK_DELAY_MS,
} from "../constants/objectives.js";
import { requireActiveBridge } from "../bridge/active.js";
import { hydrateObjectivesIntoSession } from "../bridge/core-state-projection.js";
import { bumpSnapshotRev } from "../state/snapshot-rev.js";

function loadObjectiveList() {
  const objectives = bundledGameData.objectives;
  const list = objectives?.default || objectives;
  if (!Array.isArray(list)) return list;
  return list.map((obj) => ({ ...obj, completed: false }));
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

function objectiveEvalContext(game) {
  const melted = !!game?.reactor?.has_melted_down;
  return {
    meltdown: melted,
    hasMeltedDown: melted,
    paused: !!game?.paused,
  };
}

function syncObjectiveIndex(bridge, index) {
  const objectives = bridge?.session?.systems?.objectives;
  if (!objectives || typeof objectives.setIndex !== "function") return;
  const list = objectives.objectives || [];
  if (list[index]?.checkId === "allObjectives") return;
  objectives.setIndex(index);
}

function completeAndClaimViaSession(bridge, om, expectedIndex) {
  const objectives = bridge?.session?.systems?.objectives;
  if (!objectives || !bridge?.session) return false;
  bridge._syncForObjectiveEval();
  const idx = expectedIndex ?? om?.current_objective_index ?? objectives.currentIndex;
  syncObjectiveIndex(bridge, idx);
  if (objectives.currentIndex !== idx) return false;
  const ctx = objectiveEvalContext(bridge.game);
  const already = objectives.isComplete(idx);
  if (!already) {
    if (!bridge.session.checkObjective?.(ctx)) return false;
  }
  if (!objectives.isComplete(idx)) return false;
  if (!objectives.claimCurrent?.()) return false;
  if (om) {
    if (om.objectives_data?.[idx]) om.objectives_data[idx].completed = true;
    om.current_objective_index = objectives.currentIndex;
  }
  bridge.routeEvents();
  bridge.projectLiveState();
  return true;
}

function tryAutoCompleteCurrentObjective(om) {
  const bridge = om?.game?.coreBridge;
  const objectives = bridge?.session?.systems?.objectives;
  if (!objectives || !bridge?.session) return null;
  bridge._syncForObjectiveEval();
  syncObjectiveIndex(bridge, om.current_objective_index);
  const idx = objectives.currentIndex;
  const alreadyCompleted = objectives.isComplete(idx);
  if (!alreadyCompleted && !bridge.session.checkObjective?.(objectiveEvalContext(om.game))) {
    return null;
  }
  if (!objectives.claimCurrent?.()) return null;
  if (om.objectives_data?.[idx]) om.objectives_data[idx].completed = true;
  om.current_objective_index = objectives.currentIndex;
  bridge.routeEvents();
  bridge.projectLiveState();
  return { advanced: true, newlyCompleted: !alreadyCompleted };
}

export function readObjectiveProgress(manager) {
  if (!manager?.current_objective_def || manager.current_objective_def.completed) {
    return { text: "", percent: 100 };
  }
  if (!manager.game?.tileset || !manager.game?.reactor) {
    return { text: "Loading...", percent: 0 };
  }
  const result = requireActiveBridge(manager.game, "objective progress").getObjectiveProgress()
    || { completed: false, percent: 0, text: "Awaiting completion..." };
  return { text: result.text || "Awaiting completion...", percent: result.percent || 0 };
}

export function syncActiveObjectiveToState(manager) {
  const state = manager?.game?.state;
  if (!state?.active_objective) return;
  const def = manager.current_objective_def;
  if (!def) return;
  const checkId = def.checkId ?? null;
  const isComplete = !!def.completed;
  const progress = readObjectiveProgress(manager);
  state.active_objective = {
    title: typeof def.title === "function" ? def.title() : (def.title ?? ""),
    index: manager.current_objective_index,
    isComplete,
    isChapterCompletion: !!def.isChapterCompletion,
    reward: { money: def.reward || 0, ep: def.ep_reward || 0 },
    progressPercent: Math.min(100, progress?.percent ?? 0),
    hasProgressBar: checkId === "sustainedPower1k" && !isComplete,
    checkId,
  };
  bumpSnapshotRev(manager.game);
}

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.objectives_data = [];
    this.current_objective_index = DEFAULT_OBJECTIVE_INDEX;
    this.current_objective_def = null;
    this.claiming = false;
  }

  _isSessionComplete(index = this.current_objective_index) {
    const objectives = this.game?.coreBridge?.session?.systems?.objectives ?? null;
    if (objectives?.isComplete?.(index)) return true;
    return !!this.objectives_data?.[index]?.completed
      || (index === this.current_objective_index && !!this.current_objective_def?.completed);
  }

  _emitObjectiveLoaded(displayObjective) {
    syncActiveObjectiveToState(this);
    this.game?.emit?.("objectiveLoaded", {
      objective: displayObjective,
      index: this.current_objective_index,
    });
  }

  _emitObjectiveCompleted() {
    const def = this.current_objective_def;
    const checkId = def?.checkId;
    syncActiveObjectiveToState(this);
    this.game?.emit?.("objectiveCompleted", {
      checkId,
      flavorText: def?.flavor_text,
      isChapterCompletion: !!def?.isChapterCompletion,
    });
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
    hydrateObjectivesIntoSession(this.game?.coreBridge);
  }

  start() {
    if (!this.objectives_data || this.objectives_data.length === 0) {
      this.initialize().then(() => this.start());
      return;
    }
    if (!this.current_objective_def) {
      this.set_objective(this.current_objective_index);
    }
    if (this.disableTimers) return;
    this.checkAndAutoComplete();
  }

  checkAndAutoComplete() {
    const bridge = this.game?.coreBridge;
    hydrateObjectivesIntoSession(bridge);
    syncObjectiveIndex(bridge, this.current_objective_index);
    while (this.current_objective_def && this.current_objective_def.checkId !== "allObjectives") {
      syncActiveObjectiveToState(this);
      const wasAlreadyCompleted = !!this.objectives_data?.[this.current_objective_index]?.completed;
      const result = tryAutoCompleteCurrentObjective(this);

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
    const idx = this.current_objective_index;
    if (this.current_objective_def?.checkId === "allObjectives") {
      this.current_objective_def.completed = true;
      if (this.objectives_data?.[idx]) this.objectives_data[idx].completed = true;
      syncActiveObjectiveToState(this);
      return;
    }
    if (bridge?.session && objectives) {
      bridge._syncForObjectiveEval?.();
      syncObjectiveIndex(bridge, idx);
      if (!objectives.isComplete?.(idx)) {
        bridge.session.checkObjective?.(objectiveEvalContext(this.game));
      }
      if (objectives.isComplete?.(idx)) {
        if (this.objectives_data?.[idx]) this.objectives_data[idx].completed = true;
        if (this.current_objective_def) this.current_objective_def.completed = true;
      }
    }
    syncActiveObjectiveToState(this);
  }

  _loadNormalObjective(nextObjective) {
    this.current_objective_def = nextObjective;
    if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
      this.current_objective_def.completed = true;
      if (this.objectives_data?.[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
      this.game.coreBridge?.session?.systems?.objectives?.markComplete?.(this.current_objective_index);
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
      completed: true,
    };
    const idx = this.current_objective_index;
    if (this.objectives_data?.[idx]) this.objectives_data[idx].completed = true;
    this._emitObjectiveLoaded({ ...this.current_objective_def });
  }

  set_objective(objective_index) {
    if (!this.objectives_data || this.objectives_data.length === 0) return;
    let idx = typeof objective_index !== "number" || Number.isNaN(objective_index)
      ? parseInt(objective_index, 10) || 0
      : Math.floor(objective_index);

    idx = Math.max(0, Math.min(idx, this.objectives_data.length - 1));

    this.current_objective_index = idx;
    syncObjectiveIndex(this.game?.coreBridge, this.current_objective_index);
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

    let isComplete = !!this.current_objective_def.completed;

    if (!isComplete) isComplete = this._isSessionComplete();
    if (!isComplete) return;

    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });

    const claimedIndex = this.current_objective_index;
    const bridge = this.game.coreBridge;
    const def = this.current_objective_def;

    if (def?.checkId === "allObjectives") {
      this.set_objective(claimedIndex);
      if (this.game?.saveManager) void this.game.saveManager.autoSave();
      if (this.game?.emit) this.game.emit("objectiveClaimed", {});
      setTimeout(() => { this.claiming = false; }, CLAIM_FEEDBACK_DELAY_MS);
      return;
    }

    if (!completeAndClaimViaSession(bridge, this, claimedIndex)) {
      this.claiming = false;
      return;
    }

    const sessionIndex = bridge?.session?.systems?.objectives?.currentIndex;
    if (typeof sessionIndex === "number") this.current_objective_index = sessionIndex;
    this.set_objective(this.current_objective_index);
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
    if (this.game?.emit) this.game.emit("objectiveClaimed", {});

    setTimeout(() => { this.claiming = false; }, CLAIM_FEEDBACK_DELAY_MS);
  }
}

