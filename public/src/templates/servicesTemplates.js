import { html } from "lit-html";

export const updateToastTemplate =(onRefresh, onClose, { summary, bullets = [] } = {}) => {
  const text = summary ?? "New content available, click to reload.";
  return html`
    <div class="update-toast-content">
      <div class="update-toast-message">
        <span class="update-toast-text">${text}</span>
        ${bullets.length
          ? html`<ul class="update-toast-bullets">${bullets.map((b) => html`<li>${b}</li>`)}</ul>`
          : null}
      </div>
      <button class="update-toast-button" @click=${onRefresh}>Reload</button>
      <button class="update-toast-close" @click=${onClose}>×</button>
    </div>
  `;
};

export const changelogModalTemplate =({ title, entries, onClose, onReload }) => {
  return html`
    <div class="changelog-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div class="changelog-modal pixel-panel" role="dialog" aria-labelledby="changelog_modal_title">
        <h2 id="changelog_modal_title">${title}</h2>
        <div class="changelog-modal-body">
          ${entries.length === 0
            ? html`<p class="changelog-empty">No changelog entries available.</p>`
            : entries.map((entry) => html`
              <section class="changelog-entry">
                <h3 class="changelog-entry-version">${entry.version}${entry.date ? html`<span class="changelog-entry-date">${entry.date}</span>` : null}</h3>
                <ul class="changelog-entry-bullets">
                  ${entry.bullets.map((b) => html`<li>${b}</li>`)}
                </ul>
              </section>
            `)}
        </div>
        <div class="changelog-modal-actions">
          ${onReload ? html`<button type="button" class="pixel-btn nav-btn btn-start" @click=${onReload}>Reload</button>` : null}
          <button type="button" class="pixel-btn nav-btn" @click=${onClose}>Close</button>
        </div>
      </div>
    </div>
  `;
};

export const versionCheckToastTemplate =(borderColor, icon, message, onClose) => {
  return html`
    <div class="version-check-toast" style="border: 2px solid ${borderColor};">
      <div class="version-check-toast-content">
      <div class="version-check-toast-message">
        <span class="version-check-toast-icon">${icon}</span>
        <span class="version-check-toast-text">${message}</span>
      </div>
      <button class="version-check-toast-close" @click=${onClose}>×</button>
    </div>
    </div>
  `;
};

