import { html } from "lit-html";
import { formatPrestigeNumber } from "../utils/formatUtils.js";

export const prestigeModalTemplate = (payload, onConfirm, onCancel) => {
  const { mode, totalEp, preservedUpgrades, prestigeMultiplier } = payload;

  const title = mode === "refund" ? "Full Refund" : "Prestige";
  const body = mode === "refund"
    ? html`You will reset: all Exotic Particles, all progress, reactor, and money.`
    : html`
      <div>You will keep: <strong>${formatPrestigeNumber(totalEp)} Total EP</strong>, <strong>${preservedUpgrades} Research</strong>. Reactor and money reset.</div>
      <div style="margin-top: 0.75rem;">Money multiplier: ×${prestigeMultiplier.toFixed(2)} (from Total EP)</div>
    `;

  return html`
    <div class="prestige-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="prestige-modal pixel-panel">
        <h2 id="prestige_modal_title">${title}</h2>
        <div id="prestige_modal_body">${body}</div>
        <div class="prestige-modal-actions">
          <button id="prestige_modal_cancel" class="pixel-btn nav-btn" type="button" @click=${onCancel}>Cancel</button>
          ${mode === "refund"
            ? html`<button id="prestige_modal_confirm_refund" class="pixel-btn nav-btn" type="button" @click=${() => onConfirm("refund")}>Confirm Refund</button>`
            : html`<button id="prestige_modal_confirm_prestige" class="pixel-btn nav-btn btn-start" type="button" @click=${() => onConfirm("prestige")}>Confirm Prestige</button>`
          }
        </div>
      </div>
    </div>
  `;
};
