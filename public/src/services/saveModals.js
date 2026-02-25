import { StorageUtils } from "../utils/util.js";
import { escapeHtml } from "../utils/stringUtils.js";
import { formatDuration, formatStatNum } from "../utils/formatUtils.js";

export function getLocalSaveMaxTimestamp() {
  let maxTime = 0;
  let dataJSON = null;
  for (let i = 1; i <= 3; i++) {
    const data = StorageUtils.get(`reactorGameSave_${i}`);
    if (data) {
      try {
        const t = data.last_save_time || 0;
        if (t > maxTime) {
          maxTime = t;
          dataJSON = StorageUtils.getRaw(`reactorGameSave_${i}`);
        }
      } catch (_) {}
    }
  }
  const legacyData = StorageUtils.get("reactorGameSave");
  if (legacyData) {
    try {
      const t = legacyData.last_save_time || 0;
      if (t > maxTime) {
        maxTime = t;
        dataJSON = StorageUtils.getRaw("reactorGameSave");
      }
    } catch (_) {}
  }
  return { maxTime, dataJSON };
}

export function getSaveStats(data) {
  if (!data || typeof data !== "object") {
    return { money: "0", ep: "0", playtime: "0", timestamp: "Unknown" };
  }
  const money = data.current_money != null ? formatStatNum(data.current_money) : "0";
  const ep = data.exotic_particles != null ? formatStatNum(data.exotic_particles) : (data.total_exotic_particles != null ? formatStatNum(data.total_exotic_particles) : "0");
  const playtime = data.total_played_time != null ? formatDuration(data.total_played_time, false) : "0";
  const ts = data.last_save_time;
  const timestamp = ts ? new Date(Number(ts)).toLocaleString() : "Unknown";
  return { money, ep, playtime, timestamp };
}

function buildComparisonHtml(cloud, local) {
  return `
    <div class="bios-overlay-content" style="max-width: 480px;">
      <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Cloud vs Local save</h2>
      <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 0.75rem;">Choose which save to use:</p>
      <div class="cloud-local-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.65rem; margin-bottom: 1rem;">
        <span style="color: rgb(150 160 240); font-weight: bold;">Cloud</span>
        <span style="color: rgb(150 200 150); font-weight: bold;">Local</span>
        <span>$${escapeHtml(cloud.money)}</span>
        <span>$${escapeHtml(local.money)}</span>
        <span>${escapeHtml(cloud.ep)} EP</span>
        <span>${escapeHtml(local.ep)} EP</span>
        <span>${escapeHtml(cloud.playtime)}</span>
        <span>${escapeHtml(local.playtime)}</span>
        <span>${escapeHtml(cloud.timestamp)}</span>
        <span>${escapeHtml(local.timestamp)}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" class="splash-btn splash-btn-load" id="cloud-conflict-use-cloud">Use Cloud save</button>
        <button type="button" class="splash-btn" id="cloud-conflict-use-local">Keep Local save</button>
        <button type="button" class="splash-btn splash-btn-exit" id="cloud-conflict-cancel">Cancel</button>
      </div>
    </div>
  `;
}

function bindOverlayActions(overlay, resolve) {
  const resolveAndClose = (value) => {
    overlay.remove();
    resolve(value);
  };
  overlay.querySelector("#cloud-conflict-use-cloud").onclick = () => resolveAndClose("cloud");
  overlay.querySelector("#cloud-conflict-use-local").onclick = () => resolveAndClose("local");
  overlay.querySelector("#cloud-conflict-cancel").onclick = () => resolveAndClose("cancel");
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) resolveAndClose("cancel");
  });
}

function parseLocalSaveData() {
  const { dataJSON } = getLocalSaveMaxTimestamp();
  if (!dataJSON) return null;
  try {
    return JSON.parse(dataJSON);
  } catch (_) {
    return null;
  }
}

export function showCloudVsLocalConflictModal(cloudSaveData) {
  const cloud = getSaveStats(cloudSaveData);
  const local = getSaveStats(parseLocalSaveData());
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    overlay.innerHTML = buildComparisonHtml(cloud, local);
    bindOverlayActions(overlay, resolve);
    document.body.appendChild(overlay);
  });
}

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    overlay.innerHTML = `
      <div class="bios-overlay-content" style="max-width: 420px;">
        <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
        <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
        <div style="display: flex; flex-direction: column; gap: 0.5rem;">
          <button type="button" class="splash-btn" id="backup-modal-load">Load backup</button>
          <button type="button" class="splash-btn splash-btn-exit" id="backup-modal-cancel">Cancel</button>
        </div>
      </div>
    `;
    overlay.querySelector("#backup-modal-load").onclick = () => {
      overlay.remove();
      resolve(true);
    };
    overlay.querySelector("#backup-modal-cancel").onclick = () => {
      overlay.remove();
      resolve(false);
    };
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
    document.body.appendChild(overlay);
  });
}
