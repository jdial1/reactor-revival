import { html, render } from "lit-html";
import { deserializeSave } from "../utils/util.js";
import { formatDuration, formatStatNum } from "../utils/formatUtils.js";
import { fetchResolvedSaves } from "./savesQuery.js";

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

function cloudConflictTemplate(cloud, local, onUseCloud, onUseLocal, onCancel) {
  return html`
    <div class="bios-overlay-content" style="max-width: 480px;">
      <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Cloud vs Local save</h2>
      <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 0.75rem;">Choose which save to use:</p>
      <div class="cloud-local-comparison" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 1rem; font-size: 0.65rem; margin-bottom: 1rem;">
        <span style="color: rgb(150 160 240); font-weight: bold;">Cloud</span>
        <span style="color: rgb(150 200 150); font-weight: bold;">Local</span>
        <span>$${cloud.money}</span>
        <span>$${local.money}</span>
        <span>${cloud.ep} EP</span>
        <span>${local.ep} EP</span>
        <span>${cloud.playtime}</span>
        <span>${local.playtime}</span>
        <span>${cloud.timestamp}</span>
        <span>${local.timestamp}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" class="splash-btn splash-btn-load" @click=${onUseCloud}>Use Cloud save</button>
        <button type="button" class="splash-btn" @click=${onUseLocal}>Keep Local save</button>
        <button type="button" class="splash-btn splash-btn-exit" @click=${onCancel}>Cancel</button>
      </div>
    </div>
  `;
}

function backupModalTemplate(onLoad, onCancel) {
  return html`
    <div class="bios-overlay-content" style="max-width: 420px;">
      <h2 style="margin-bottom: 0.75rem; font-size: 0.9rem;">Save file corrupted</h2>
      <p style="font-size: 0.65rem; color: rgb(180 190 170); margin-bottom: 1rem;">The current save could not be read. Load from backup?</p>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" class="splash-btn" @click=${onLoad}>Load backup</button>
        <button type="button" class="splash-btn splash-btn-exit" @click=${onCancel}>Cancel</button>
      </div>
    </div>
  `;
}

async function parseLocalSaveData() {
  const { dataJSON } = await fetchResolvedSaves();
  if (!dataJSON) return null;
  try {
    return deserializeSave(dataJSON);
  } catch (_) {
    return null;
  }
}

export async function showCloudVsLocalConflictModal(cloudSaveData) {
  const cloud = getSaveStats(cloudSaveData);
  const local = getSaveStats(await parseLocalSaveData());
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    const content = document.createElement("div");
    overlay.appendChild(content);
    render(
      cloudConflictTemplate(
        cloud,
        local,
        () => resolveAndClose("cloud"),
        () => resolveAndClose("local"),
        () => resolveAndClose("cancel")
      ),
      content
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose("cancel");
    });
    document.body.appendChild(overlay);
  });
}

export function showLoadBackupModal() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "game-setup-overlay bios-overlay";
    overlay.style.zIndex = "10001";
    const content = document.createElement("div");
    overlay.appendChild(content);
    const resolveAndClose = (value) => {
      overlay.remove();
      resolve(value);
    };
    render(
      backupModalTemplate(() => resolveAndClose(true), () => resolveAndClose(false)),
      content
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) resolveAndClose(false);
    });
    document.body.appendChild(overlay);
  });
}
