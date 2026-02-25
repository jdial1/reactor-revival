import { Format, formatTime, formatDateTime, rotateSlot1ToBackup } from "../utils/util.js";
import { supabaseSave } from "./SupabaseSave.js";
import { logger } from "../utils/logger.js";
import { SaveDataSchema } from "../core/schemas.js";

const formatSlotNumber = (n) => Format.number(n, { places: 1 });

export class SplashSaveSlotUI {
  constructor(splashManager) {
    this.splashManager = splashManager;
  }

  generateSaveSlotHTML(saveSlots, isCloud) {
    let html = "";
    for (let i = 1; i <= 3; i++) {
      const slotData = saveSlots.find((slot) => slot.slot === i);
      const isEmpty = !slotData;
      const label = isCloud ? `Cloud Slot ${i}` : `Local Slot ${i}`;
      html += `
        <div class="save-slot-container">
          <button class="save-slot-button ${isEmpty ? "save-slot-button-disabled" : "save-slot-button-filled"}"
            data-slot="${i}"
            data-is-cloud="${isCloud}"
            ${isEmpty ? "disabled" : ""}>
            ${isEmpty
              ? `<div class="save-slot-row-1"><span class="save-slot-slot">${label}</span></div><div class="save-slot-empty">Empty</div>`
              : `
              <div class="save-slot-row-1">
                <span class="save-slot-slot">${label}</span>
                <span class="save-slot-time">${formatDateTime(slotData.lastSaveTime)}</span>
              </div>
              <div class="save-slot-row-2">
                <span class="save-slot-money">$${formatSlotNumber(Number(slotData.currentMoney))}</span>
                <span class="save-slot-ep">${formatSlotNumber(Number(slotData.exoticParticles))} EP</span>
                <span class="save-slot-playtime">Played: ${formatTime(Number(slotData.totalPlayedTime))}</span>
              </div>
              `}
          </button>
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

    if (window.supabaseAuth && window.supabaseAuth.isSignedIn()) {
      try {
        const rawCloudSaves = await supabaseSave.getSaves();
        cloudSaveSlots = rawCloudSaves.map((s) => {
          let data = {};
          try {
            data = JSON.parse(s.save_data);
          } catch (e) {}
          return {
            slot: s.slot_id,
            exists: true,
            lastSaveTime: parseInt(s.timestamp),
            totalPlayedTime: data.total_played_time || 0,
            currentMoney: data.current_money || 0,
            exoticParticles: data.exotic_particles || 0,
            data,
            isCloud: true,
          };
        });
        isCloudAvailable = true;
      } catch (e) {
        logger.log('error', 'splash', 'Failed to load cloud saves', e);
      }
    }

    const saveSlotScreen = document.createElement("main");
    saveSlotScreen.id = "save-slot-screen";
    saveSlotScreen.className = "splash-screen";
    saveSlotScreen.style.cssText =
      "position:fixed;top:0;left:0;width:100%;height:100%;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;";

    let html = "";
    if (isCloudAvailable) {
      html += '<h2 class="splash-menu-header" style="color:rgb(76 175 80);font-size:1rem;">CLOUD SAVES</h2>';
      html += this.generateSaveSlotHTML(cloudSaveSlots, true);
      html += '<h2 class="splash-menu-header" style="margin-top:1rem;color:rgb(170 170 170);font-size:1rem;">LOCAL SAVES</h2>';
    }
    html += this.generateSaveSlotHTML(localSaveSlots, false);

    saveSlotScreen.innerHTML = `
      <h1 class="splash-title">LOAD GAME</h1>
      <div class="splash-menu-panel" style="max-height:80vh;overflow-y:auto;">
        <div class="splash-start-options">
          ${html}
          <div class="splash-btn-row">
            <input type="file" id="load-from-file-input" accept=".json,.reactor,application/json" style="display:none;">
            <button class="splash-btn splash-btn-load" id="load-from-file-btn">Load file</button>
            <button class="splash-btn splash-btn-exit" id="back-to-splash">Back</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(saveSlotScreen);

    const loadFromFileBtn = saveSlotScreen.querySelector("#load-from-file-btn");
    const loadFromFileInput = saveSlotScreen.querySelector("#load-from-file-input");
    if (loadFromFileBtn && loadFromFileInput) {
      loadFromFileBtn.addEventListener("click", () => loadFromFileInput.click());
      loadFromFileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const saveData = event.target.result;
            const parsed = typeof saveData === "string" ? JSON.parse(saveData) : saveData;
            const result = SaveDataSchema.safeParse(parsed);
            if (!result.success) throw new Error('Save corrupted: validation failed');
            const validated = result.data;
            const str = typeof saveData === "string" ? saveData : JSON.stringify(validated);
            rotateSlot1ToBackup(str);
            await sm.loadFromSaveSlot(1);
          } catch (err) {
            logger.log('error', 'splash', 'Failed to load save from file:', err);
            logger.log('warn', 'splash', 'Failed to load save file. Ensure it is a valid Reactor save.');
          }
        };
        reader.readAsText(file);
      });
    }

    saveSlotScreen.querySelectorAll("button[data-slot]:not([disabled])").forEach((button) => {
      button.addEventListener("click", async (e) => {
        const slot = parseInt(e.currentTarget.dataset.slot);
        const isCloud = e.currentTarget.dataset.isCloud === "true";
        if (isCloud) {
          const save = cloudSaveSlots.find((s) => s.slot === slot);
          if (save) await sm.loadFromData(save.data);
        } else {
          await sm.loadFromSaveSlot(slot);
        }
      });
    });

    saveSlotScreen.querySelector("#back-to-splash").addEventListener("click", () => {
      saveSlotScreen.remove();
      if (sm.splashScreen) sm.splashScreen.style.display = "";
    });
  }
}
