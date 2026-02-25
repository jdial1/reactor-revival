import { html } from "lit-html";
import { StorageUtils } from "../../utils/util.js";

function volToStep(v) {
  return Math.min(10, Math.round(v * 10));
}

function volumeStepper(key, value) {
  const step = volToStep(value);
  return html`
    <div class="volume-stepper" data-volume-key=${key}>
      <div class="volume-blocks" role="slider" aria-valuemin="0" aria-valuemax="10" aria-valuenow=${step} tabindex="0">
        ${Array.from({ length: 11 }, (_, i) => html`
          <button type="button" class="volume-block" data-step=${i} aria-label="${i * 10}%" ?data-active=${i <= step}></button>
        `)}
      </div>
      <span class="volume-stepper-val">${step * 10}%</span>
    </div>
  `;
}

function mechSwitch(id, checked) {
  return html`
    <button type="button" class="mech-switch" role="switch" aria-checked=${checked} data-checkbox-id=${id} tabindex="0">
      <span class="mech-switch-off">OFF</span>
      <span class="mech-switch-track"><span class="mech-switch-thumb"></span></span>
      <span class="mech-switch-on">ON</span>
    </button>
  `;
}

function switchRow(id, label, checked) {
  return html`
    <tr>
      <td class="settings-visuals-label"><span>${label}</span></td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" id=${id} ?checked=${checked} style="display: none;">
          ${mechSwitch(id, checked)}
        </label>
      </td>
    </tr>
  `;
}

export function createVolumeSection() {
  const isMuted = StorageUtils.get("reactor_mute") === true;
  const masterVol = Number(StorageUtils.get("reactor_volume_master", 0.25));
  const effectsVol = Number(StorageUtils.get("reactor_volume_effects", 0.50));
  const alertsVol = Number(StorageUtils.get("reactor_volume_alerts", 0.50));
  const systemVol = Number(StorageUtils.get("reactor_volume_system", 0.50));
  const ambienceVol = Number(StorageUtils.get("reactor_volume_ambience", 0.12));
  return html`
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>Audio</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <label class="setting-row mute-toggle">
          <span>Mute</span>
          <button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
            <span class="mute-icon">${isMuted ? "🔇" : "🔊"}</span>
          </button>
          <input type="checkbox" id="setting-mute" ?checked=${isMuted} style="display: none;">
        </label>
        <div class="volume-setting"><label class="volume-label">Master Volume</label>${volumeStepper("master", masterVol)}</div>
        <div class="volume-setting"><label class="volume-label">Effects Volume</label>${volumeStepper("effects", effectsVol)}</div>
        <div class="volume-setting"><label class="volume-label">Alerts Volume</label>${volumeStepper("alerts", alertsVol)}</div>
        <div class="volume-setting"><label class="volume-label">System Volume</label>${volumeStepper("system", systemVol)}</div>
        <div class="volume-setting"><label class="volume-label">Background Volume</label>${volumeStepper("ambience", ambienceVol)}</div>
      </div>
    </div>
  `;
}

export function createToggleSection() {
  const isReducedMotion = StorageUtils.get("reactor_reduced_motion") === true;
  const hideUnaffordableUpgrades = StorageUtils.get("reactor_hide_unaffordable_upgrades", true) !== false;
  const hideUnaffordableResearch = StorageUtils.get("reactor_hide_unaffordable_research", true) !== false;
  const hideMaxUpgrades = StorageUtils.get("reactor_hide_max_upgrades", true) !== false;
  const hideMaxResearch = StorageUtils.get("reactor_hide_max_research", true) !== false;
  const hideOtherDoctrineUpgrades = StorageUtils.get("reactor_hide_other_doctrine_upgrades", false) === true;
  const heatFlowVisible = StorageUtils.get("reactor_heat_flow_visible", true) !== false;
  const heatMapVisible = StorageUtils.get("reactor_heat_map_visible", false) === true;
  const numberFormat = StorageUtils.get("number_format", "default");
  const debugOverlay = StorageUtils.get("reactor_debug_overlay") === true;
  const forceNoSab = StorageUtils.get("reactor_force_no_sab") === true;
  return html`
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>Visuals</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <table class="settings-visuals-table">
          ${switchRow("setting-motion", "Reduced Motion", isReducedMotion)}
          ${switchRow("setting-hide-upgrades", "Hide Unaffordable Upgrades", hideUnaffordableUpgrades)}
          ${switchRow("setting-hide-research", "Hide Unaffordable Research", hideUnaffordableResearch)}
          ${switchRow("setting-hide-max-upgrades", "Hide Max Upgrades", hideMaxUpgrades)}
          ${switchRow("setting-hide-max-research", "Hide Max Research", hideMaxResearch)}
          ${switchRow("setting-hide-other-doctrine", "Hide Other Doctrine Upgrades", hideOtherDoctrineUpgrades)}
          ${switchRow("setting-heat-flow", "Heat flow arrows", heatFlowVisible)}
          ${switchRow("setting-heat-map", "Heat map", heatMapVisible)}
          ${switchRow("setting-debug-overlay", "Debug overlay (flow arrows)", debugOverlay)}
          <tr>
            <td class="settings-visuals-label"><span>Number format</span></td>
            <td class="settings-visuals-control">
              <select id="setting-number-format" class="pixel-select">
                <option value="default" ?selected=${numberFormat === "default"}>1,234 K</option>
                <option value="scientific" ?selected=${numberFormat === "scientific"}>1.23e3</option>
              </select>
            </td>
          </tr>
        </table>
      </div>
    </div>
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>System</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <table class="settings-visuals-table">
          ${switchRow("setting-force-no-sab", "Force No-SAB", forceNoSab)}
          ${switchRow("setting-notifications", "Update Notifications", false)}
        </table>
      </div>
    </div>
  `;
}

export function createExportSection() {
  return html`
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>Data</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <div class="data-buttons">
          <button class="pixel-btn" id="setting-export">Export</button>
          <button class="pixel-btn" id="setting-import">Import</button>
          <input type="file" id="setting-import-input" accept=".json" style="display: none;">
        </div>
        <div id="setting-cloud-saves" class="settings-cloud-saves" style="display: none;">
          <h4 class="settings-cloud-heading">Cloud Saves</h4>
          <div class="cloud-slot-list">
            ${[1, 2, 3].map(slot => html`
              <div class="cloud-slot-row" data-slot=${slot}>
                <div class="cloud-slot-info">
                  <span class="cloud-slot-label">Slot ${slot}</span>
                  <span class="cloud-slot-meta">—</span>
                </div>
                <div class="cloud-slot-actions">
                  <button type="button" class="pixel-btn pixel-btn-small setting-cloud-save" data-slot=${slot}>Save</button>
                  <button type="button" class="pixel-btn pixel-btn-small setting-cloud-load" data-slot=${slot} disabled>Load</button>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function createNavAboutSection() {
  return html`
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>Navigation</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <div class="data-buttons">
          <button class="pixel-btn" id="research_back_to_splash_btn">Quit Game</button>
        </div>
      </div>
    </div>
    <div class="settings-group settings-group-collapsed">
      <button type="button" class="settings-group-header" aria-expanded="false">
        <h3>About</h3>
        <span class="settings-group-chevron" aria-hidden="true"></span>
      </button>
      <div class="settings-group-body">
        <p style="margin: 0.5rem 0; font-size: 0.6rem;">Version: <span id="app_version">Loading...</span></p>
        <p style="margin: 0.5rem 0; font-size: 0.6rem;">Display Mode: <span id="app_display_mode">Detecting...</span></p>
      </div>
    </div>
  `;
}
