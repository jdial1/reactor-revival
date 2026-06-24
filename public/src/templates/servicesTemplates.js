import { html } from "lit-html";

export function splashStartOptionsTemplate({
  mostRecentSave,
  hasSave,
  onResume,
  onNewRun,
  onShowLoad,
  onShowSettings,
}) {
  return html`
    ${mostRecentSave
      ? html`
          <button
            class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
            @click=${onResume}
          >
            <div class="load-game-header"><span>RESUME</span></div>
          </button>
        `
      : ""}

    <div class="splash-btn-actions-grid">
      <div class="splash-btn-row-secondary">
        <button
          id="splash-new-game-btn"
          class="splash-btn splash-btn-start ${!mostRecentSave ? "splash-btn-resume-primary" : ""}"
          @click=${onNewRun}
        >
          NEW RUN
        </button>
        <button class="splash-btn splash-btn-load" @click=${onShowLoad}>
          <div class="load-game-header"><span>LOAD</span></div>
        </button>
      </div>
      <div class="splash-btn-row-tertiary">
        <button
          class="splash-btn splash-btn-config splash-btn-row-tertiary-single"
          title="System configuration"
          @click=${onShowSettings}
        >
          SYS
        </button>
      </div>
    </div>
  `;
}

export function saveSlotRowTemplate({
  rowClasses,
  btnClasses,
  i,
  isCloud,
  isEmpty,
  logId,
  isSelected,
  slotData,
  onSwipeStart,
  onSwipeEnd,
  onSlotClick,
  onDeleteClick,
  formatPlaytimeLog,
  formatSlotNumber,
}) {
  return html`
    <div class=${rowClasses}>
      <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
        <button
          class=${btnClasses}
          type="button"
          data-slot=${i}
          data-is-cloud=${isCloud}
          data-is-empty=${isEmpty}
          @click=${onSlotClick}
        >
          ${isEmpty
            ? html`
                <div class="save-slot-row-top">
                  <span class="save-slot-log-id save-slot-log-id-empty">${logId}</span>
                  <span class="save-slot-right">EMPTY</span>
                </div>
                <div class="save-slot-row-bottom">
                  <span class="save-slot-ttime">--:--:--</span>
                </div>
              `
            : html`
                <span class="save-slot-tape-icon" aria-hidden="true"></span>
                <span class="save-slot-select-arrow ${isSelected ? "visible" : ""}" aria-hidden="true">&#x25B6;</span>
                <div class="save-slot-row-top">
                  <span class="save-slot-log-id">${logId}</span>
                </div>
                <div class="save-slot-row-meta">
                  <span class="save-slot-ttime">T+ ${formatPlaytimeLog(Number(slotData.totalPlayedTime))}</span>
                </div>
                <div class="save-slot-row-bottom">
                  <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span>
                  <span class="save-slot-sep">|</span>
                  <span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
                </div>
              `}
        </button>
        ${!isCloud && !isEmpty
          ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>`
          : ""}
      </div>
    </div>
  `;
}

export function saveSlotMainTemplate({
  isCloudAvailable,
  cloudSlots,
  localSlots,
  selectedSlot,
  onHeaderTouchStart,
  onHeaderTouchEnd,
  onClose,
  onFileChange,
  onRestore,
  onImportBackup,
  renderSlot,
}) {
  return html`
    <header
      class="save-slot-screen-header"
      @touchstart=${onHeaderTouchStart}
      @touchend=${onHeaderTouchEnd}
    >
      <div class="modal-swipe-handle" aria-hidden="true"></div>
      <div class="save-slot-header-row">
        <h1 class="save-slot-title">SYSTEM LOGS</h1>
        <button class="save-slot-back-btn" title="Cancel" aria-label="Cancel" @click=${onClose}>&#x2715;</button>
      </div>
    </header>
    <div class="save-slot-panel">
      <div class="save-slot-options">
        ${isCloudAvailable
          ? html`
              <h2 class="save-slot-section-header">CLOUD BACKUPS</h2>
              ${cloudSlots.map((s, idx) => renderSlot(s, idx + 1, true))}
              <h2 class="save-slot-section-header save-slot-section-secondary">CORE BACKUPS</h2>
            `
          : html` <h2 class="save-slot-section-header">CORE BACKUPS</h2> `}
        ${localSlots.map((s, idx) => renderSlot(s, idx + 1, false))}
        <div class="save-slot-actions">
          <input
            type="file"
            id="load-from-file-input"
            accept=".json,.reactor,application/json"
            style="display: none;"
            @change=${onFileChange}
          />
          <button
            class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
            ?disabled=${selectedSlot == null}
            style="opacity: ${selectedSlot != null ? 1 : 0.5};"
            @click=${onRestore}
          >
            RESTORE
          </button>
          <button class="save-slot-import-btn" @click=${onImportBackup}>IMPORT BACKUP</button>
          <button class="save-slot-back-action" @click=${onClose}>BACK</button>
        </div>
      </div>
    </div>
  `;
}

export function updateNotificationModalTemplate(currentVersion, newVersion, onReloadNow, onDismiss) {
  return html`
    <style>
 .update-notification-modal {
  position: fixed; top: 0; left: 0; width: 100%; height: 100%;
  background: rgb(0 0 0 / 80%); display: flex; justify-content: center;
  align-items: center; z-index: 10000; font-family: 'Press Start 2P', monospace;
 }

 .update-notification-content {
  background: var(--alert-panel-bg); border: 2px solid var(--neutral-550); border-radius: 8px;
  padding: 20px; max-width: 400px; text-align: center; color: var(--text-primary);
  box-shadow: 0 4px 20px var(--alpha-black-50);
 }
 .update-notification-content h3 { margin: 0 0 15px; color: var(--status-success); font-size: 1.2em; }
 .version-comparison { margin: 15px 0; display: flex; justify-content: space-around; gap: 20px; }
 .version-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
 .version-label { font-size: 0.9em; color: var(--neutral-200); }
 .version-value { font-size: 1.1em; font-weight: bold; padding: 5px 10px; border-radius: 4px; }
 .version-value.current { background: var(--status-danger); color: var(--text-primary); }
 .version-value.latest { background: var(--status-success); color: var(--text-primary); }
 .update-instruction { margin: 15px 0; font-size: 0.9em; line-height: 1.4; }
 .update-instruction a { color: var(--status-success); text-decoration: none; }
 .update-instruction a:hover { text-decoration: underline; }
 .update-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
 .update-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.9em; transition: background-color 0.2s; }
 .update-btn.refresh { background: var(--status-success); color: var(--text-primary); }
 .update-btn.refresh:hover { background: var(--alert-success-hover); }
 .update-btn.dismiss { background: var(--neutral-450); color: var(--text-primary); }
 .update-btn.dismiss:hover { background: var(--neutral-400); }
    </style>
    <div class="update-notification-content">
      <h3>🚀 Update Available!</h3>
      <p>A new version of Reactor Revival is available:</p>
      <div class="version-comparison">
        <div class="version-item">
          <span class="version-label">Current:</span>
          <span class="version-value current">${currentVersion}</span>
        </div>
        <div class="version-item">
          <span class="version-label">Latest:</span>
          <span class="version-value latest">${newVersion}</span>
        </div>
      </div>
      <p class="update-instruction">
        To get the latest version, refresh your browser or check for updates.
      </p>
      <div class="update-actions">
        <button class="update-btn refresh" @click=${onReloadNow}>🔄 Refresh Now</button>
        <button class="update-btn dismiss" @click=${onDismiss}>✕ Dismiss</button>
      </div>
    </div>
  `;
}

export function updateToastTemplate(onRefresh, onClose, { summary, bullets = [] } = {}) {
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
}

export function changelogModalTemplate({ title, entries, onClose, onReload }) {
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
}

export function versionCheckToastTemplate(borderColor, icon, message, onClose) {
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
}
