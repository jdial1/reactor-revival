import {
  getPreviousTierSpec as getPreviousTierSpecUtil,
  isFirstInChainSpec as isFirstInChainSpecUtil,
  isSpecUnlocked as isSpecUnlockedUtil,
  shouldShowPart as shouldShowPartUtil,
  isPartUnlocked as isPartUnlockedUtil,
} from "../partProgression.js";

export class UnlockManager {
  constructor(game) {
    this.game = game;
  }

  getPlacedCount(type, level) {
    const counts = this.game.placedCounts ?? {};
    return counts[`${type}:${level}`] || 0;
  }

  incrementPlacedCount(type, level) {
    if (this.game._suppressPlacementCounting) return;
    const counts = this.game.placedCounts ?? {};
    const key = `${type}:${level}`;
    counts[key] = (counts[key] || 0) + 1;
    this.game.placedCounts = counts;
  }

  getPreviousTierCount(part) {
    const prevSpec = this.getPreviousTierSpec(part);
    if (!prevSpec) return 0;
    return this.getPlacedCount(prevSpec.type, prevSpec.level);
  }

  getPreviousTierSpec(part) {
    return getPreviousTierSpecUtil(part, this.game.partset);
  }

  isFirstInChainSpec(spec) {
    return isFirstInChainSpecUtil(spec, this.game.partset);
  }

  isSpecUnlocked(spec) {
    return isSpecUnlockedUtil(spec, this.game.partset, (type, level) => this.getPlacedCount(type, level));
  }

  shouldShowPart(part) {
    return shouldShowPartUtil(part, this.game.partset, (type, level) => this.getPlacedCount(type, level));
  }

  isPartUnlocked(part) {
    return isPartUnlockedUtil(part, {
      isSandbox: this.game.isSandbox,
      partset: this.game.partset,
      getPlacedCount: (type, level) => this.getPlacedCount(type, level),
      _unlockStates: this.game._unlockStates,
      logger: this.game.logger,
    });
  }
}
