import { bundledGameData } from "../bundledStaticData.js";
import { AchievementListSchema } from "../schema/index.js";
import { logger } from "../core/logger.js";
import { subscribeKey } from "valtio/vanilla/utils";
import { enqueueGameEffect } from "../state/game-effects.js";
import { unlockedAchievementIds } from "../bridge/core-state-projection.js";

function loadAchievementsFromBundle() {
  return AchievementListSchema.parse(bundledGameData.achievements);
}

export class AchievementManager {
  constructor(game) {
    this.game = game;
    this.achievements_data = [];
    this._eventToAchievementIds = new Map();
    this._silentUnlockCount = 0;
    this._wasCatchingUp = false;
    this._unsubs = [];
  }

  async initialize() {
    this.achievements_data = loadAchievementsFromBundle();
    this._buildIndexes();
    logger.log("debug", "game", `AchievementManager initialized with ${this.achievements_data.length} achievements`);
  }

  _buildIndexes() {
    this._eventToAchievementIds.clear();
    for (let i = 0; i < this.achievements_data.length; i++) {
      const def = this.achievements_data[i];
      if (def.triggerType === "event" && def.triggerEvent) {
        const list = this._eventToAchievementIds.get(def.triggerEvent) ?? [];
        list.push(def.id);
        this._eventToAchievementIds.set(def.triggerEvent, list);
      }
    }
  }

  _getUnlockedSet() {
    const arr = this.game?.state?.unlocked_achievements;
    return new Set(Array.isArray(arr) ? arr : []);
  }

  _getUnlockedList() {
    const arr = this.game?.state?.unlocked_achievements;
    return Array.isArray(arr) ? arr : [];
  }

  isUnlocked(id) {
    return this._getUnlockedSet().has(id);
  }

  getDefinition(id) {
    return this.achievements_data.find((a) => a.id === id) ?? null;
  }

  restore(saved) {
    if (!this.game?.state) return;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      this.game.state.achievements = saved;
      this.game.state.unlocked_achievements = unlockedAchievementIds(saved);
    } else {
      const ids = Array.isArray(saved) ? saved.filter((x) => typeof x === "string") : [];
      this.game.state.unlocked_achievements = ids;
      this.game.state.achievements = undefined;
    }
    this.game.coreBridge?.hydrateAchievementsFromGame?.();
  }

  _isCatchUpSilent() {
    return !!this.game?.engine?._isCatchingUp;
  }

  _syncUnlockToCore(id) {
    this.game.coreBridge?.session?.systems?.achievements?.unlock?.(id);
  }

  unlock(id, { silent } = {}) {
    if (!id || this.isUnlocked(id)) return false;
    const def = this.getDefinition(id);
    if (!def) return false;

    const list = this._getUnlockedList();
    list.push(id);
    this.game.state.unlocked_achievements = list;
    this._syncUnlockToCore(id);

    const isSilent = silent ?? this._isCatchUpSilent();
    if (isSilent) {
      this._silentUnlockCount++;
    } else {
      enqueueGameEffect(this.game, {
        kind: "notice",
        tag: "ACHIEVEMENT",
        body: `Unlocked: ${def.title}`,
      });
      this.game.emit?.("achievementUnlocked", { achievement: def, silent: false });
    }

    if (this.game?.saveManager && !this.game._isRestoringSave) {
      void this.game.saveManager.autoSave();
    }
    return true;
  }

  onCatchUpEnded() {
    const count = this._silentUnlockCount;
    this._silentUnlockCount = 0;
    if (count > 0) {
      this.game.emit?.("achievementCatchUpSummary", { count });
    }
  }

  _handleCatchUpTransition() {
    const catchingUp = this._isCatchUpSilent();
    if (this._wasCatchingUp && !catchingUp) {
      this.onCatchUpEnded();
    }
    this._wasCatchingUp = catchingUp;
  }

  onTickRecorded() {
    if (!this.game) return;
    this._handleCatchUpTransition();
  }

  bind() {
    this.unbind();
    const g = this.game;
    if (!g?.state) return;
    this._unsubs.push(subscribeKey(g.state, "engine_tick_count", () => this.onTickRecorded()));
  }

  unbind() {
    for (let i = 0; i < this._unsubs.length; i++) {
      try {
        this._unsubs[i]();
      } catch (_) {}
    }
    this._unsubs.length = 0;
  }

  start() {
    if (!this.achievements_data.length) {
      void this.initialize().then(() => this.bind());
      return;
    }
    this.bind();
  }
}
