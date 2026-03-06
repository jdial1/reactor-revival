import { Format, formatPlaytimeLog, rotateSlot1ToBackupAsync, deserializeSave, serializeSave, StorageAdapter } from "../utils/util.js";
import { fetchCloudSaveSlots } from "./savesQuery.js";
import { logger } from "../utils/logger.js";
import { SaveDataSchema } from "../core/schemas.js";

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

export class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
  }

  generateSaveSlotHTML(saveSlots, isCloud) {
    let html = "";
    const prefix = isCloud ? "CLD" : "LOG";
    for (let i = 1; i <= 3; i++) {
      const slotData = saveSlots.find((slot) => slot.slot === i);
      const isEmpty = !slotData;
      const logId = `${prefix} ${String(i).padStart(2, "0")}`;
      const swipeDelete = !isCloud && !isEmpty;
      html += `
        <div class="save-slot-row ${swipeDelete ? "save-slot-row-deletable" : ""}">
          <div class="save-slot-swipe-wrapper">
            <button class="save-slot-button ${isEmpty ? "save-slot-button-empty" : "save-slot-button-filled"}"
            data-slot="${i}"
            data-is-cloud="${isCloud}"
            data-is-empty="${isEmpty}"
            type="button">
            ${isEmpty
              ? `<div class="save-slot-row-top"><span class="save-slot-log-id save-slot-log-id-empty">${logId}</span><span class="save-slot-right">EMPTY</span></div><div class="save-slot-row-bottom"><span class="save-slot-ttime">--:--:--</span></div>`
              : `
            <span class="save-slot-tape-icon" aria-hidden="true"></span>
            <span class="save-slot-select-arrow" aria-hidden="true">&#x25B6;</span>
            <div class="save-slot-row-top">
              <span class="save-slot-log-id">${logId}</span>
            </div>
            <div class="save-slot-row-meta">
              <span class="save-slot-ttime">T+ ${formatPlaytimeLog(Number(slotData.totalPlayedTime))}</span>
            </div>
            <div class="save-slot-row-bottom">
              <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span><span class="save-slot-sep">|</span><span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
            </div>
              `}
          </button>
          ${swipeDelete ? `<button class="save-slot-delete" data-slot="${i}" type="button" aria-label="Delete">DEL</button>` : ""}
          </div>
        </div>
      `;
    }
    return html;
  }

  async showSaveSlotSelection(localSaveSlots) {
    const sm = this.splashManager;
    if (sm.splashScreen) sm.splashScreen.style.display = "none";

    let cloudSaveSlots = [];
    let isCloudAvailable = false;

    if (window.supabaseAuth?.isSignedIn?.()) {
      try {
        cloudSaveSlots = await fetchCloudSaveSlots();
        isCloudAvailable = true;
      } catch (e) {
        logger.log("error", "splash", "Failed to load cloud saves", e);
      }
    }

    const saveSlotScreen = document.createElement("main");
    saveSlotScreen.id = "save-slot-screen";
    saveSlotScreen.className = "splash-screen";
    saveSlotScreen.style.cssText = "position:fixed;inset:0;width:100%;height:100%;z-index:999;";

    let html = "";
    if (isCloudAvailable) {
      html += '<h2 class="save-slot-section-header">CLOUD BACKUPS</h2>';
      html += this.generateSaveSlotHTML(cloudSaveSlots, true);
      html += '<h2 class="save-slot-section-header save-slot-section-secondary">CORE BACKUPS</h2>';
    } else {
      html += '<h2 class="save-slot-section-header">CORE BACKUPS</h2>';
    }
    html += this.generateSaveSlotHTML(localSaveSlots, false);

    saveSlotScreen.innerHTML = `
      <header class="save-slot-screen-header">
        <div class="modal-swipe-handle" id="save-slot-swipe-handle" aria-hidden="true"></div>
        <div class="save-slot-header-row">
          <h1 class="save-slot-title">SYSTEM LOGS</h1>
          <button class="save-slot-back-btn" id="back-to-splash" title="Cancel" aria-label="Cancel">&#x2715;</button>
        </div>
      </header>
      <div class="save-slot-panel">
        <div class="save-slot-options">
          ${html}
          <div class="save-slot-actions">
            <input type="file" id="load-from-file-input" accept=".json,.reactor,application/json" style="display:none;">
            <button class="splash-btn splash-btn-resume-primary save-slot-restore-btn" id="restore-btn">RESTORE</button>
            <button class="save-slot-import-btn" id="load-from-file-btn">IMPORT BACKUP</button>
            <button class="save-slot-back-action" id="back-to-splash-action">BACK</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(saveSlotScreen);

    let selectedSlot = null;
    let selectedIsCloud = false;

    const restoreBtn = saveSlotScreen.querySelector("#restore-btn");

    const updateSelection = (slotBtn) => {
      saveSlotScreen.querySelectorAll(".save-slot-button-filled.selected").forEach((b) => b.classList.remove("selected"));
      saveSlotScreen.querySelectorAll(".save-slot-select-arrow").forEach((el) => el.classList.remove("visible"));
      if (slotBtn?.classList.contains("save-slot-button-filled")) {
        slotBtn.classList.add("selected");
        slotBtn.querySelector(".save-slot-select-arrow")?.classList.add("visible");
        selectedSlot = parseInt(slotBtn.dataset.slot);
        selectedIsCloud = slotBtn.dataset.isCloud === "true";
      } else {
        selectedSlot = null;
      }
      if (restoreBtn) {
        restoreBtn.disabled = selectedSlot == null;
        restoreBtn.style.opacity = selectedSlot != null ? "1" : "0.5";
      }
    };

    const loadFromFileBtn = saveSlotScreen.querySelector("#load-from-file-btn");
    const loadFromFileInput = saveSlotScreen.querySelector("#load-from-file-input");

    restoreBtn?.addEventListener("click", async () => {
      if (selectedSlot == null) return;
      const prefix = selectedIsCloud ? "CLD" : "LOG";
      const logId = `${prefix} ${String(selectedSlot).padStart(2, "0")}`;
      if (!confirm(`Restore ${logId}? Current unsaved progress will be lost.`)) return;
      if (selectedIsCloud) {
        const save = cloudSaveSlots.find((s) => s.slot === selectedSlot);
        if (save) await sm.loadFromData(save.data);
      } else {
        await sm.loadFromSaveSlot(selectedSlot);
      }
    });

    if (loadFromFileBtn && loadFromFileInput) {
      loadFromFileBtn.addEventListener("click", (e) => {
        e.preventDefault();
        loadFromFileInput.click();
      });
      loadFromFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const saveData = event.target.result;
            const parsed = typeof saveData === "string" ? deserializeSave(saveData) : saveData;
            const result = SaveDataSchema.safeParse(parsed);
            if (!result.success) throw new Error('Save corrupted: validation failed');
            const validated = result.data;
            await rotateSlot1ToBackupAsync(serializeSave(validated));
            await sm.loadFromSaveSlot(1);
          } catch (err) {
            logger.log('error', 'splash', 'Failed to load save from file:', err);
            logger.log('warn', 'splash', 'Failed to load save file. Ensure it is a valid Reactor save.');
          }
        };
        reader.readAsText(file);
      });
    }

    saveSlotScreen.querySelectorAll(".save-slot-button-filled").forEach((button) => {
      let lastTap = 0;
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const row = button.closest(".save-slot-row-deletable");
        if (row?.classList.contains("swiped")) return;
        const now = Date.now();
        const wasSelected = button.classList.contains("selected");
        const isDoubleTap = wasSelected && (now - lastTap) < 400;
        lastTap = now;
        updateSelection(button);
        if (isDoubleTap && restoreBtn && !restoreBtn.disabled) {
          restoreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        }
      });
    });

    saveSlotScreen.querySelectorAll(".save-slot-row-deletable").forEach((row) => {
      const wrapper = row.querySelector(".save-slot-swipe-wrapper");
      const btn = row.querySelector(".save-slot-button");
      const deleteBtn = row.querySelector(".save-slot-delete");
      if (!wrapper || !btn || !deleteBtn) return;
      let startX = 0;
      wrapper.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
      wrapper.addEventListener("touchend", (e) => {
        const endX = e.changedTouches[0].clientX;
        if (startX - endX > 80) row.classList.add("swiped");
        else if (endX - startX > 40) row.classList.remove("swiped");
      }, { passive: true });
      deleteBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const slot = parseInt(deleteBtn.dataset.slot);
        const logId = `LOG ${String(slot).padStart(2, "0")}`;
        if (!confirm(`Delete ${logId}? This cannot be undone.`)) return;
        try {
          await StorageAdapter.remove(`reactorGameSave_${slot}`);
          row.classList.remove("swiped", "save-slot-row-deletable");
          btn.outerHTML = `
            <button class="save-slot-button save-slot-button-empty" data-slot="${slot}" data-is-cloud="false" data-is-empty="true" type="button">
              <div class="save-slot-row-top"><span class="save-slot-log-id save-slot-log-id-empty">LOG ${String(slot).padStart(2, "0")}</span><span class="save-slot-right">EMPTY</span></div>
              <div class="save-slot-row-bottom"><span class="save-slot-ttime">--:--:--</span></div>
            </button>
          `;
          deleteBtn.remove();
          updateSelection(null);
        } catch (err) {
          logger.log("error", "splash", "Failed to delete save slot", err);
        }
      });
    });

    const firstFilled = saveSlotScreen.querySelector(".save-slot-button-filled");
    if (firstFilled) {
      updateSelection(firstFilled);
    } else {
      updateSelection(null);
    }

    const closeSaveSlot = () => {
      saveSlotScreen.remove();
      if (sm.splashScreen) sm.splashScreen.style.display = "";
    };

    saveSlotScreen.querySelector("#back-to-splash").addEventListener("click", closeSaveSlot);
    saveSlotScreen.querySelector("#back-to-splash-action")?.addEventListener("click", closeSaveSlot);

    const header = saveSlotScreen.querySelector(".save-slot-screen-header");
    if (header) {
      let startY = 0;
      header.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
      header.addEventListener("touchend", (e) => {
        if (e.changedTouches[0].clientY - startY > 60) closeSaveSlot();
      }, { passive: true });
    }
  }
}
