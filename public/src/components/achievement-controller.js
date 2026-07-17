import { html, render } from "lit-html";
import { preferences } from "../state/preferences.js";
import { enqueueGameEffect } from "../state/game-effects.js";

const TOAST_HOLD_MS = 4000;
const TOAST_ANIM_OUT_MS = 320;

const GROUP_AUDIO = {
  hazard: "tab_relay_thud",
  engineering: "click",
  discovery: "ep_spark",
  milestone: "sell",
};

const achievementToastTemplate = ({ title, description, group, icon }) => {
  const iconSrc = icon || "img/ui/icons/icon_power.png";
  return html`
    <div class="achievement-toast achievement-toast--${group}" role="status" aria-live="polite">
      <div class="achievement-toast__panel">
        <div class="achievement-toast__tag">ACHIEVEMENT</div>
        <div class="achievement-toast__body">
          <img class="achievement-toast__icon" src="${iconSrc}" alt="" />
          <div class="achievement-toast__text">
            <div class="achievement-toast__title">${title}</div>
            <div class="achievement-toast__description">${description}</div>
          </div>
        </div>
      </div>
    </div>
  `;
};

const achievementSummaryToastTemplate = (count) => {
  const label = count === 1 ? "1 achievement unlocked while offline." : `${count} achievements unlocked while offline.`;
  return html`
    <div class="achievement-toast achievement-toast--summary" role="status" aria-live="polite">
      <div class="achievement-toast__panel achievement-toast__panel--summary">
        <div class="achievement-toast__tag">OFFLINE</div>
        <div class="achievement-toast__body achievement-toast__body--summary">${label}</div>
      </div>
    </div>
  `;
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
      host,
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
