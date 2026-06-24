import { html } from "lit-html";

export function achievementToastTemplate({ title, description, group, icon }) {
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
}

export function achievementSummaryToastTemplate(count) {
  const label = count === 1 ? "1 achievement unlocked while offline." : `${count} achievements unlocked while offline.`;
  return html`
    <div class="achievement-toast achievement-toast--summary" role="status" aria-live="polite">
      <div class="achievement-toast__panel achievement-toast__panel--summary">
        <div class="achievement-toast__tag">OFFLINE</div>
        <div class="achievement-toast__body achievement-toast__body--summary">${label}</div>
      </div>
    </div>
  `;
}
