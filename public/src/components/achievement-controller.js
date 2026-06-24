import { render } from "lit-html";
import { preferences } from "../state/preferences.js";
import { enqueueGameEffect } from "../state/game-effects.js";
import {
  achievementToastTemplate,
  achievementSummaryToastTemplate,
} from "../templates/achievementToastTemplates.js";

const TOAST_HOLD_MS = 4000;
const TOAST_ANIM_OUT_MS = 320;

const GROUP_AUDIO = {
  hazard: "tab_relay_thud",
  engineering: "click",
  discovery: "ep_spark",
  milestone: "sell",
};

export class AchievementController {
  constructor(api) {
    this.api = api;
    this._queue = [];
    this._showing = false;
    this._root = null;
    this._unsubs = [];
  }

  mount() {
    this._root = typeof document !== "undefined" ? document.getElementById("achievement_toast_root") : null;
    const game = this.api.getGame?.();
    if (!game?.on) return;
    const onSummary = (payload) => this._enqueueSummary(payload?.count ?? 0);
    game.on("achievementCatchUpSummary", onSummary);
    this._unsubs.push(() => game.off?.("achievementCatchUpSummary", onSummary));
  }

  unmount() {
    for (let i = 0; i < this._unsubs.length; i++) {
      try {
        this._unsubs[i]();
      } catch (_) {}
    }
    this._unsubs.length = 0;
    this._queue.length = 0;
    this._showing = false;
    if (this._root) this._root.innerHTML = "";
  }

  _enqueue(achievement) {
    if (!achievement?.id) return;
    this._queue.push({ type: "achievement", achievement });
    this._drain();
  }

  _enqueueSummary(count) {
    if (!count || count < 1) return;
    this._queue.push({ type: "summary", count });
    this._drain();
  }

  _drain() {
    if (this._showing || !this._queue.length || !this._root) return;
    const item = this._queue.shift();
    this._showing = true;
    if (item.type === "summary") {
      this._showSummary(item.count);
    } else {
      this._showAchievement(item.achievement);
    }
  }

  _playGroupAudio(group) {
    const game = this.api.getGame?.();
    if (!game) return;
    const id = GROUP_AUDIO[group];
    if (!id) return;
    enqueueGameEffect(game, { kind: "sfx", id, context: "global", vol: 0.55 });
  }

  _showAchievement(achievement) {
    const reduced = !!preferences.reducedMotion;
    const host = document.createElement("div");
    host.className = reduced ? "achievement-toast-host achievement-toast-host--reduced" : "achievement-toast-host";
    this._root.appendChild(host);
    render(
      achievementToastTemplate({
        title: achievement.title,
        description: achievement.description,
        group: achievement.group,
        icon: achievement.icon,
      }),
      host
    );
    const panel = host.querySelector(".achievement-toast");
    if (panel && !reduced) {
      panel.classList.add(`achievement-toast--animate-in`);
    }
    this._playGroupAudio(achievement.group);
    setTimeout(() => {
      if (panel) panel.classList.add("achievement-toast--animate-out");
      setTimeout(() => {
        host.remove();
        this._showing = false;
        this._drain();
      }, TOAST_ANIM_OUT_MS);
    }, TOAST_HOLD_MS);
  }

  _showSummary(count) {
    const host = document.createElement("div");
    host.className = "achievement-toast-host achievement-toast-host--summary";
    this._root.appendChild(host);
    render(achievementSummaryToastTemplate(count), host);
    setTimeout(() => {
      const panel = host.querySelector(".achievement-toast");
      if (panel) panel.classList.add("achievement-toast--animate-out");
      setTimeout(() => {
        host.remove();
        this._showing = false;
        this._drain();
      }, TOAST_ANIM_OUT_MS);
    }, TOAST_HOLD_MS);
  }
}
