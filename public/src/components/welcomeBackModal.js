import { html } from "lit-html";
import { Format } from "../utils/formatUtils.js";

export const welcomeBackModalTemplate = (payload, onInstant, onFastForward, onDismiss) => {
  const { offlineMs = 0, queuedTicks = 0 } = payload ?? {};
  const durationStr = Format.time(offlineMs, false);
  const tickStr = queuedTicks.toLocaleString();
  return html`
    <div class="welcome-back-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="welcome-back-modal pixel-panel">
        <h2 class="welcome-back-title">Welcome Back!</h2>
        <p class="welcome-back-message">You were away for <strong>${durationStr}</strong> (~${tickStr} ticks).</p>
        <p class="welcome-back-sub">Choose how to catch up:</p>
        <div class="welcome-back-actions">
          <button type="button" class="pixel-btn welcome-back-instant" @click=${onInstant}>Instant Catch-up</button>
          <button type="button" class="pixel-btn welcome-back-ff" @click=${onFastForward}>Fast-Forward</button>
        </div>
        <p class="welcome-back-hint">Instant: apply average income/heat immediately (analytical solve for long durations). Fast-Forward: process 100 ticks per frame until caught up.</p>
      </div>
    </div>
  `;
};
