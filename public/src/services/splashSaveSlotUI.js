import { html, render } from "lit-html";
import { classMap } from "../utils/litHelpers.js";
import { Format, formatPlaytimeLog, rotateSlot1ToBackupAsync, deserializeSave, serializeSave, StorageAdapter } from "../utils/util.js";
import { fetchCloudSaveSlots } from "./savesQuery.js";
import { logger } from "../utils/logger.js";
import { SaveDataSchema } from "../core/schemas.js";

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

export class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
    this.container = null;
    this.state = {
      localSaveSlots: [],
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set()
    };
  }

  _slotTemplate(slotData, i, isCloud) {
    const isEmpty = !slotData || !slotData.exists;
    const prefix = isCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(i).padStart(2, "0")}`;
    const swipeKey = `${isCloud ? "c" : "l"}_${i}`;
    const isSwiped = this.state.swipedSlots.has(swipeKey);
    const isSelected = this.state.selectedSlot === i && this.state.selectedIsCloud === isCloud;

    const rowClasses = classMap({
      "save-slot-row": true,
      "save-slot-row-deletable": !isCloud && !isEmpty,
      "swiped": isSwiped
    });

    const btnClasses = classMap({
      "save-slot-button": true,
      "save-slot-button-empty": isEmpty,
      "save-slot-button-filled": !isEmpty,
      "selected": isSelected
    });

    const onSlotClick = (e) => {
      e.preventDefault();
      if (isSwiped) return;

      const now = Date.now();
      const isDoubleTap = isSelected && this._lastTap && (now - this._lastTap < 400);
      this._lastTap = now;

      if (isDoubleTap) {
        this._handleRestore();
      } else {
        this.state.selectedSlot = isSelected ? null : i;
        this.state.selectedIsCloud = isCloud;
        this.render();
      }
    };

    const onSwipeStart = (e) => {
      if (isCloud || isEmpty) return;
      this._swipeStartX = e.touches[0].clientX;
    };

    const onSwipeEnd = (e) => {
      if (isCloud || isEmpty) return;
      const endX = e.changedTouches[0].clientX;
      if (this._swipeStartX - endX > 80) {
        this.state.swipedSlots.add(swipeKey);
        this.render();
      } else if (endX - this._swipeStartX > 40) {
        this.state.swipedSlots.delete(swipeKey);
        this.render();
      }
    };

    const onDeleteClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
      try {
        await StorageAdapter.remove(`reactorGameSave_${i}`);
        this.state.swipedSlots.delete(swipeKey);
        const targetSlot = this.state.localSaveSlots.find(s => s.slot === i);
        if (targetSlot) targetSlot.exists = false;

        if (this.state.selectedSlot === i && !this.state.selectedIsCloud) {
          this.state.selectedSlot = null;
        }
        this.render();
      } catch (err) {
        logger.log("error", "splash", "Failed to delete save slot", err);
      }
    };

    return html`
      <div class=${rowClasses}>
        <div class="save-slot-swipe-wrapper" @touchstart=${onSwipeStart} @touchend=${onSwipeEnd}>
          <button class=${btnClasses} type="button" data-slot=${i} data-is-cloud=${isCloud} data-is-empty=${isEmpty} @click=${onSlotClick}>
            ${isEmpty ? html`
              <div class="save-slot-row-top">
                <span class="save-slot-log-id save-slot-log-id-empty">${logId}</span>
                <span class="save-slot-right">EMPTY</span>
              </div>
              <div class="save-slot-row-bottom">
                <span class="save-slot-ttime">--:--:--</span>
              </div>
            ` : html`
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
          ${(!isCloud && !isEmpty) ? html`<button class="save-slot-delete" type="button" aria-label="Delete" @click=${onDeleteClick}>DEL</button>` : ""}
        </div>
      </div>
    `;
  }

  _mainTemplate() {
    const cloudSlots = [1, 2, 3].map(i => this.state.cloudSaveSlots.find(s => s.slot === i));
    const localSlots = [1, 2, 3].map(i => this.state.localSaveSlots.find(s => s.slot === i));

    const onFileChange = async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const saveData = event.target.result;
          const parsed = typeof saveData === "string" ? deserializeSave(saveData) : saveData;
          const result = SaveDataSchema.safeParse(parsed);
          if (!result.success) throw new Error("Save corrupted: validation failed");
          const validated = result.data;
          await rotateSlot1ToBackupAsync(serializeSave(validated));
          await this.splashManager.loadFromSaveSlot(1);
        } catch (err) {
          logger.log("error", "splash", "Failed to load save from file:", err);
          logger.log("warn", "splash", "Failed to load save file. Ensure it is a valid Reactor save.");
        }
      };
      reader.readAsText(file);
    };

    const triggerFileInput = () => {
      this.container.querySelector("#load-from-file-input")?.click();
    };

    return html`
      <header class="save-slot-screen-header" @touchstart=${(e) => { this._headerStartY = e.touches[0].clientY; }} @touchend=${(e) => {
        if (e.changedTouches[0].clientY - this._headerStartY > 60) this._close();
      }}>
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="save-slot-header-row">
          <h1 class="save-slot-title">SYSTEM LOGS</h1>
          <button class="save-slot-back-btn" title="Cancel" aria-label="Cancel" @click=${() => this._close()}>&#x2715;</button>
        </div>
      </header>
      <div class="save-slot-panel">
        <div class="save-slot-options">
          ${this.state.isCloudAvailable ? html`
            <h2 class="save-slot-section-header">CLOUD BACKUPS</h2>
            ${cloudSlots.map((s, idx) => this._slotTemplate(s, idx + 1, true))}
            <h2 class="save-slot-section-header save-slot-section-secondary">CORE BACKUPS</h2>
          ` : html`
            <h2 class="save-slot-section-header">CORE BACKUPS</h2>
          `}
          ${localSlots.map((s, idx) => this._slotTemplate(s, idx + 1, false))}
          <div class="save-slot-actions">
            <input type="file" id="load-from-file-input" accept=".json,.reactor,application/json" style="display:none;" @change=${onFileChange}>
            <button class="splash-btn splash-btn-resume-primary save-slot-restore-btn"
              ?disabled=${this.state.selectedSlot == null}
              style="opacity: ${this.state.selectedSlot != null ? 1 : 0.5}"
              @click=${() => this._handleRestore()}>RESTORE</button>
            <button class="save-slot-import-btn" @click=${triggerFileInput}>IMPORT BACKUP</button>
            <button class="save-slot-back-action" @click=${() => this._close()}>BACK</button>
          </div>
        </div>
      </div>
    `;
  }

  async _handleRestore() {
    if (this.state.selectedSlot == null) return;
    const prefix = this.state.selectedIsCloud ? "CLD" : "LOG";
    const logId = `${prefix} ${String(this.state.selectedSlot).padStart(2, "0")}`;
    if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;

    if (this.state.selectedIsCloud) {
      const save = this.state.cloudSaveSlots.find(s => s.slot === this.state.selectedSlot);
      if (save) await this.splashManager.loadFromData(save.data);
    } else {
      await this.splashManager.loadFromSaveSlot(this.state.selectedSlot);
    }
  }

  _close() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
    if (this.splashManager.splashScreen) this.splashManager.splashScreen.style.display = "";
  }

  render() {
    if (this.container) {
      render(this._mainTemplate(), this.container);
    }
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    this.state = {
      localSaveSlots,
      cloudSaveSlots: [],
      isCloudAvailable: false,
      selectedSlot: null,
      selectedIsCloud: false,
      swipedSlots: new Set()
    };

    if (window.supabaseAuth?.isSignedIn?.()) {
      try {
        this.state.cloudSaveSlots = await fetchCloudSaveSlots();
        this.state.isCloudAvailable = true;
      } catch (e) {
        logger.log("error", "splash", "Failed to load cloud saves", e);
      }
    }

    this.container = document.createElement("main");
    this.container.id = "save-slot-screen";
    this.container.className = "splash-screen";
    this.container.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";
    document.body.appendChild(this.container);

    const allSlots = [...(this.state.isCloudAvailable ? this.state.cloudSaveSlots : []), ...this.state.localSaveSlots];
    const firstFilled = allSlots.find(s => s && s.exists);
    if (firstFilled) {
      this.state.selectedSlot = firstFilled.slot;
      this.state.selectedIsCloud = !!firstFilled.isCloud;
    }

    this.render();
  }
}
