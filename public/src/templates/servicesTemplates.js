import { html } from "lit-html";

export function signedInTemplate(authLabel, onLogout) {
  return html`
    <div class="splash-auth-signed-in">
      ${authLabel ? html`<span class="splash-auth-signed-in-icon">${authLabel}</span>` : ""}
      <button class="splash-auth-icon-btn" title="Sign out" aria-label="Sign out" @click=${onLogout}>✕</button>
    </div>
  `;
}

export function commsButtonTemplate(googleLabel, emailLabel, onGoogleSignIn, onEmailSignIn) {
  return html`
    <div class="splash-auth-comms-wrap">
      <button class="splash-auth-comms-btn" title="Sign in" aria-label="Sign in options" aria-haspopup="true" aria-expanded="false">
        [ COMMS ]
      </button>
      <div class="splash-auth-comms-dropdown hidden">
        <div class="splash-auth-comms-prompt">> AWAITING OPERATOR CREDENTIALS</div>
        <button class="splash-auth-comms-option" @click=${onGoogleSignIn}>
          <span class="splash-auth-comms-icon">${googleLabel}</span> Sign in with Google
        </button>
        <button class="splash-auth-comms-option" @click=${onEmailSignIn}>
          <span class="splash-auth-comms-icon">${emailLabel}</span> Sign in with Email
        </button>
      </div>
    </div>
  `;
}

export function authFormTemplate(state, handlers, onBack) {
  const { onInput, onSignIn, onSignUp, onReset } = handlers;
  const { email, password, message, isError } = state;
  const msgColor = isError ? "#ff6666" : "var(--game-success-color)";
  return html`
    <div id="splash-email-auth-form" class="splash-auth-terminal-form">
      <div class="splash-auth-terminal-prompt">> AWAITING OPERATOR CREDENTIALS</div>
      ${onBack ? html`<button class="splash-auth-back-btn" @click=${onBack} type="button">&lt; Back</button>` : ""}
      <input
        type="email"
        id="splash-supabase-email"
        placeholder="Email"
        class="pixel-input splash-auth-input"
        .value=${email}
        @input=${(e) => onInput(e, "email")}
      />
      <input
        type="password"
        id="splash-supabase-password"
        placeholder="Password"
        class="pixel-input splash-auth-input"
        .value=${password}
        @input=${(e) => onInput(e, "password")}
      />
      <div class="splash-auth-form-actions">
        <button class="splash-btn splash-auth-form-btn" @click=${onSignIn}>Sign In</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onSignUp}>Sign Up</button>
        <button class="splash-btn splash-auth-form-btn" @click=${onReset}>Reset</button>
      </div>
      <div id="splash-supabase-message" class="splash-auth-message" style="color: ${msgColor}">${message}</div>
    </div>
  `;
}

export const noCloudSaveFoundTemplate = html`<div>No cloud save found.</div>`;
export const cloudCheckFailedTemplate = html`<div>Cloud check failed.</div>`;
export const googleDriveErrorTemplate = html`<div>Google Drive Error</div>`;

export function splashStartOptionsTemplate({
  mostRecentSave,
  cloudSaveOnly,
  cloudSaveData,
  hasSave,
  onResume,
  onCloudResume,
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

    ${cloudSaveOnly && cloudSaveData && !hasSave
      ? html`
          <button
            class="splash-btn splash-btn-load splash-btn-full-width splash-btn-resume-primary splash-btn-continue"
            @click=${onCloudResume}
          >
            <div class="load-game-header"><span>RESUME</span></div>
            <div class="continue-label"></div>
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
        <button id="splash-sandbox-btn" class="splash-btn splash-btn-sandbox" title="Sandbox">SANDBOX</button>
        <button
          class="splash-btn splash-btn-config"
          title="System configuration"
          @click=${onShowSettings}
        >
          SYS
        </button>
      </div>
    </div>

    <div id="splash-auth-in-footer" style="margin-top: 1rem;"></div>
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
            style="display:none;"
            @change=${onFileChange}
          />
          <button
            class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
            ?disabled=${selectedSlot == null}
            style="opacity: ${selectedSlot != null ? 1 : 0.5}"
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
        background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center;
        align-items: center; z-index: 10000; font-family: 'Press Start 2P', monospace;
      }
      .update-notification-content {
        background: #2a2a2a; border: 2px solid #4a4a4a; border-radius: 8px;
        padding: 20px; max-width: 400px; text-align: center; color: #fff;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      .update-notification-content h3 { margin: 0 0 15px 0; color: #4CAF50; font-size: 1.2em; }
      .version-comparison { margin: 15px 0; display: flex; justify-content: space-around; gap: 20px; }
      .version-item { display: flex; flex-direction: column; align-items: center; gap: 5px; }
      .version-label { font-size: 0.9em; color: #ccc; }
      .version-value { font-size: 1.1em; font-weight: bold; padding: 5px 10px; border-radius: 4px; }
      .version-value.current { background: #f44336; color: white; }
      .version-value.latest { background: #4CAF50; color: white; }
      .update-instruction { margin: 15px 0; font-size: 0.9em; line-height: 1.4; }
      .update-instruction a { color: #4CAF50; text-decoration: none; }
      .update-instruction a:hover { text-decoration: underline; }
      .update-actions { display: flex; gap: 10px; justify-content: center; margin-top: 20px; }
      .update-btn { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-family: 'Press Start 2P', monospace; font-size: 0.9em; transition: background-color 0.2s; }
      .update-btn.refresh { background: #4CAF50; color: white; }
      .update-btn.refresh:hover { background: #45a049; }
      .update-btn.dismiss { background: #666; color: white; }
      .update-btn.dismiss:hover { background: #777; }
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

export function updateToastTemplate(onRefresh, onClose) {
  return html`
    <style>
      .update-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid #4CAF50; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
      .update-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
      .update-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; color: #fff; }
      .update-toast-text { font-size: 0.9em; font-weight: 500; }
      .update-toast-button { background: #4CAF50; color: white; border: none; border-radius: 4px; padding: 8px 16px; font-family: 'Press Start 2P', monospace; font-size: 0.8em; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; }
      .update-toast-button:hover { background: #45a049; }
      .update-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
      .update-toast-close:hover { color: #fff; }
      @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      @media (max-width: 480px) { .update-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .update-toast-content { padding: 10px 12px; gap: 8px; } .update-toast-text { font-size: 0.8em; } .update-toast-button { padding: 6px 12px; font-size: 0.75em; } }
    </style>
    <div class="update-toast-content">
      <div class="update-toast-message">
        <span class="update-toast-text">New content available, click to reload.</span>
      </div>
      <button class="update-toast-button" @click=${onRefresh}>Reload</button>
      <button class="update-toast-close" @click=${onClose}>×</button>
    </div>
  `;
}

export function versionCheckToastTemplate(borderColor, icon, message, onClose) {
  return html`
    <style>
      .version-check-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #2a2a2a; border: 2px solid ${borderColor}; border-radius: 8px; padding: 0; z-index: 10000; font-family: 'Press Start 2P', monospace; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); animation: toast-slide-up 0.3s ease-out; max-width: 400px; width: 90%; }
      .version-check-toast-content { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; gap: 12px; }
      .version-check-toast-message { display: flex; align-items: center; gap: 8px; flex: 1; }
      .version-check-toast-icon { font-size: 1.2em; }
      .version-check-toast-text { color: #fff; font-size: 0.7em; line-height: 1.4; }
      .version-check-toast-close { background: transparent; color: #ccc; border: none; font-size: 1.2em; cursor: pointer; padding: 4px; line-height: 1; transition: color 0.2s; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
      .version-check-toast-close:hover { color: #fff; }
      @keyframes toast-slide-up { from { transform: translateX(-50%) translateY(100px); opacity: 0; } to { transform: translateX(-50%) translateY(0); opacity: 1; } }
      @media (max-width: 480px) { .version-check-toast { bottom: 10px; left: 10px; right: 10px; transform: none; max-width: none; width: auto; } .version-check-toast-content { padding: 10px 12px; gap: 8px; } .version-check-toast-text { font-size: 0.6em; } }
    </style>
    <div class="version-check-toast-content">
      <div class="version-check-toast-message">
        <span class="version-check-toast-icon">${icon}</span>
        <span class="version-check-toast-text">${message}</span>
      </div>
      <button class="version-check-toast-close" @click=${onClose}>×</button>
    </div>
  `;
}
