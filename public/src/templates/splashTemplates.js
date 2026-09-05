import { html } from "lit-html";

// Splash start-menu and save-slot markup, extracted from services/app-services.js.
export const splashStartOptionsTemplate = ({
  mostRecentSave,
  onResume,
  onNewRun,
  onShowLoad,
  onShowSettings,
}) => {
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
};

export const saveSlotRowTemplate =({
  rowClasses,
  btnClasses,
  i,
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
}) => {
  return html`
    <div class=${rowClasses}>
      <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
        <button
          class=${btnClasses}
          type="button"
          data-slot=${i}
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
        ${!isEmpty
          ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>`
          : ""}
      </div>
    </div>
  `;
};

export const saveSlotMainTemplate =({
  localSlots,
  selectedSlot,
  onHeaderTouchStart,
  onHeaderTouchEnd,
  onClose,
  onFileChange,
  onRestore,
  onImportBackup,
  renderSlot,
}) => {
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
        <h2 class="save-slot-section-header">CORE BACKUPS</h2>
        ${localSlots.map((s, idx) => renderSlot(s, idx + 1))}
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
};

