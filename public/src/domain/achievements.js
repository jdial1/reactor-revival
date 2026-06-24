import { bundledGameData } from "../bundledStaticData.js";
import { AchievementListSchema } from "../schema/index.js";
import { logger } from "../core/logger.js";
import { subscribe } from "valtio/vanilla";
import { subscribeKey } from "valtio/vanilla/utils";
import {
  evaluateTickCheck,
  TICK_CHECK_THRESHOLDS,
  STATEFUL_TICK_CHECKS,
} from "../logic/achievement-checks.js";
import { enqueueGameEffect } from "../state/game-effects.js";

function loadAchievementsFromBundle() {
  return AchievementListSchema.parse(bundledGameData.achievements);
}

export class AchievementManager {
  constructor(game) {
    this.game = game;
    this.achievements_data = [];
    this.trackers = new Map();
    this.pendingTickChecks = new Set();
    this._checkIdToAchievementIds = new Map();
    this._eventToAchievementIds = new Map();
    this._silentUnlockCount = 0;
    this._wasCatchingUp = false;
    this._explosionsThisTick = 0;
    this._unsubs = [];
  }

  async initialize() {
    this.achievements_data = loadAchievementsFromBundle();
    this._buildIndexes();
    this._rebuildPendingTickChecks();
    logger.log("debug", "game", `AchievementManager initialized with ${this.achievements_data.length} achievements`);
  }

  _buildIndexes() {
    this._checkIdToAchievementIds.clear();
    this._eventToAchievementIds.clear();
    for (let i = 0; i < this.achievements_data.length; i++) {
      const def = this.achievements_data[i];
      if (def.triggerType === "tick" && def.checkId) {
        const list = this._checkIdToAchievementIds.get(def.checkId) ?? [];
        list.push(def.id);
        this._checkIdToAchievementIds.set(def.checkId, list);
        if (TICK_CHECK_THRESHOLDS[def.checkId] != null || STATEFUL_TICK_CHECKS.has(def.checkId)) {
          if (!this.trackers.has(def.checkId)) {
            this.trackers.set(def.checkId, { consecutiveTicks: 0 });
          }
        }
      }
      if (def.triggerType === "event" && def.triggerEvent) {
        const list = this._eventToAchievementIds.get(def.triggerEvent) ?? [];
        list.push(def.id);
        this._eventToAchievementIds.set(def.triggerEvent, list);
      }
    }
  }

  _rebuildPendingTickChecks() {
    this.pendingTickChecks.clear();
    const unlocked = this._getUnlockedSet();
    for (let i = 0; i < this.achievements_data.length; i++) {
      const def = this.achievements_data[i];
      if (def.triggerType === "tick" && def.checkId && !unlocked.has(def.id)) {
        this.pendingTickChecks.add(def.checkId);
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

  restore(savedIds) {
    if (!this.game?.state) return;
    const ids = Array.isArray(savedIds) ? savedIds.filter((x) => typeof x === "string") : [];
    this.game.state.unlocked_achievements = ids;
    this._rebuildPendingTickChecks();
  }

  _isCatchUpSilent() {
    return !!this.game?.engine?._isCatchingUp;
  }

  unlock(id, { silent } = {}) {
    if (!id || this.isUnlocked(id)) return false;
    const def = this.getDefinition(id);
    if (!def) return false;

    const list = this._getUnlockedList();
    list.push(id);
    this.game.state.unlocked_achievements = list;

    if (def.checkId) this.pendingTickChecks.delete(def.checkId);

    const isSilent = silent ?? this._isCatchUpSilent();
    if (isSilent) {
      this._silentUnlockCount++;
    } else {
      enqueueGameEffect(this.game, {
        kind: "notice",
        tag: "ACHIEVEMENT",
        body: `Unlocked: ${def.title}`,
      });
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
    const explosionTracker = this.trackers.get("simultaneous_explosions_10");
    if (explosionTracker) {
      explosionTracker.lastTickExplosions = this._explosionsThisTick;
    }
    this._explosionsThisTick = 0;
    if (this.pendingTickChecks.size === 0) return;
    const silent = this._isCatchUpSilent();
    const toUnlock = [];
    for (const checkId of this.pendingTickChecks) {
      const tracker = this.trackers.get(checkId) ?? { consecutiveTicks: 0 };
      if (evaluateTickCheck(this.game, checkId, tracker)) {
        const ids = this._checkIdToAchievementIds.get(checkId) ?? [];
        for (let i = 0; i < ids.length; i++) {
          if (!this.isUnlocked(ids[i])) toUnlock.push(ids[i]);
        }
      }
    }
    for (let i = 0; i < toUnlock.length; i++) {
      this.unlock(toUnlock[i], { silent });
    }
  }

  _tryUnlockEventAchievements(eventName, predicate) {
    const ids = this._eventToAchievementIds.get(eventName) ?? [];
    const silent = this._isCatchUpSilent();
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (this.isUnlocked(id)) continue;
      if (predicate && !predicate(id)) continue;
      this.unlock(id, { silent });
    }
  }

  _onMeltdownStarted() {
    this._tryUnlockEventAchievements("meltdownStarted");
  }

  _onComponentExplosion() {
    this._explosionsThisTick++;
    this._tryUnlockEventAchievements("component_explosion");
  }

  _onBlueprintPlannerChanged() {
    if (this._blueprintAchieveTimer) clearTimeout(this._blueprintAchieveTimer);
    this._blueprintAchieveTimer = setTimeout(async () => {
      this._blueprintAchieveTimer = null;
      const res = await this.game.requestBlueprintProjectionSample?.();
      const stats = res?.projectionPlannerSample;
      if (!stats || stats.stats_net_heat > 0 || stats.stats_power <= 0) return;
      this._tryUnlockEventAchievements("blueprintPlannerChanged");
    }, 150);
  }

  _onPrestigeCompleted(payload) {
    if (!payload?.keepEp) return;
    this._tryUnlockEventAchievements("prestigeCompleted", (id) => {
      if (id === "ach_nuclear_disarmament") {
        return (payload.fuelCellCount ?? 0) === 1;
      }
      if (id === "ach_perfect_weave") {
        const power = Number(payload.sessionPowerProduced ?? 0);
        const heat = Number(payload.sessionHeatDissipated ?? 0);
        if (power <= 0 || heat <= 0) return false;
        const spread = Math.abs(power - heat);
        const basis = Math.max(power, heat);
        return spread / basis <= 0.001;
      }
      return false;
    });
  }

  bind() {
    this.unbind();
    const g = this.game;
    if (!g?.on) return;

    const handlers = [
      ["component_explosion", () => this._onComponentExplosion()],
    ];

    for (let i = 0; i < handlers.length; i++) {
      const [event, fn] = handlers[i];
      g.on(event, fn);
      this._unsubs.push(() => g.off?.(event, fn));
    }
    if (g.blueprintPlanner) {
      this._unsubs.push(subscribe(g.blueprintPlanner, () => this._onBlueprintPlannerChanged()));
    }
    if (g.state) {
      let lastMeltdownSeq = g.state.meltdown_seq | 0;
      this._unsubs.push(subscribeKey(g.state, "meltdown_seq", (seq) => {
        const n = seq | 0;
        if (n > lastMeltdownSeq) {
          lastMeltdownSeq = n;
          this._onMeltdownStarted();
        }
      }));
      let lastPrestigeSeq = g.state.prestige_seq | 0;
      this._unsubs.push(subscribeKey(g.state, "prestige_seq", (seq) => {
        const n = seq | 0;
        if (n > lastPrestigeSeq) {
          lastPrestigeSeq = n;
          this._onPrestigeCompleted(g.state.last_prestige);
        }
      }));
      this._unsubs.push(subscribeKey(g.state, "engine_tick_count", () => this.onTickRecorded()));
    }
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
