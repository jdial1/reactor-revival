import { html } from "lit-html";
import { styleMap } from "../../utils/litHelpers.js";
import { getValidatedPreferences } from "../../services/appConfig.js";

const HIDDEN_STYLE = { display: "none" };
const SECTION_HEAD = "margin-top: 0; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";
const SECTION_HEAD_MARGIN = "margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-success-color, rgb(93, 156, 81)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;";

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

function helpIcon(settingKey) {
  return html`
    <button type="button" class="setting-help-icon" data-setting-key=${settingKey} aria-label="Explain this setting">?</button>
  `;
}

function switchRow(id, label, checked, helpKey) {
  const key = helpKey ?? id.replace("setting-", "");
  return html`
    <tr class="settings-option-row" data-checkbox-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(key)}
      </td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" id=${id} ?checked=${checked} style=${styleMap(HIDDEN_STYLE)}>
          ${mechSwitch(id, checked)}
        </label>
      </td>
    </tr>
  `;
}

function selectRow(id, label, helpKey, content) {
  return html`
    <tr class="settings-option-row settings-option-select" data-select-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(helpKey)}
      </td>
      <td class="settings-visuals-control">${content}</td>
    </tr>
  `;
}

export function createVolumeSection() {
  const vol = getValidatedPreferences();
  const isMuted = vol.mute;
  return html`
    <div class="settings-section">
      <label class="setting-row mute-toggle settings-option-row" style="margin-bottom: 1.5rem;" role="button" tabindex="0">
        <span>Master Mute</span>
        <button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
          <span class="mute-icon">${isMuted ? "🔇" : "🔊"}</span>
        </button>
        <input type="checkbox" id="setting-mute" ?checked=${isMuted} style=${styleMap(HIDDEN_STYLE)}>
      </label>
      <div class="volume-setting"><label class="volume-label">Master Volume</label>${volumeStepper("master", vol.volumeMaster)}</div>
      <div class="volume-setting"><label class="volume-label">Effects Volume</label>${volumeStepper("effects", vol.volumeEffects)}</div>
      <div class="volume-setting"><label class="volume-label">Alerts Volume</label>${volumeStepper("alerts", vol.volumeAlerts)}</div>
      <div class="volume-setting"><label class="volume-label">System Volume</label>${volumeStepper("system", vol.volumeSystem)}</div>
      <div class="volume-setting" style="margin-bottom: 0;"><label class="volume-label">Background Volume</label>${volumeStepper("ambience", vol.volumeAmbience)}</div>
    </div>
  `;
}

export function createVisualSection() {
  const prefs = getValidatedPreferences();
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ACCESSIBILITY</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-motion", "Reduced Motion", prefs.reducedMotion, "reducedMotion")}
        ${selectRow("setting-number-format", "Number format", "numberFormat", html`
          <select id="setting-number-format" class="pixel-select settings-select" style="background: rgb(60,60,60); color: white; border: 2px solid var(--bevel-dark); padding: 4px;">
            <option value="default" ?selected=${prefs.numberFormat === "default"}>1,234 K</option>
            <option value="scientific" ?selected=${prefs.numberFormat === "scientific"}>1.23e3</option>
          </select>
        `)}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>UPGRADE PANEL</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-hide-upgrades", "Hide Unaffordable Upgrades", prefs.hideUnaffordableUpgrades, "hideUnaffordableUpgrades")}
        ${switchRow("setting-hide-research", "Hide Unaffordable Research", prefs.hideUnaffordableResearch, "hideUnaffordableResearch")}
        ${switchRow("setting-hide-max-upgrades", "Hide Max Upgrades", prefs.hideMaxUpgrades, "hideMaxUpgrades")}
        ${switchRow("setting-hide-max-research", "Hide Max Research", prefs.hideMaxResearch, "hideMaxResearch")}
        ${switchRow("setting-hide-other-doctrine", "Hide Other Doctrine Upgrades", prefs.hideOtherDoctrineUpgrades, "hideOtherDoctrineUpgrades")}
      </table>

      <h4 style=${SECTION_HEAD_MARGIN}>REACTOR VIEW</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-heat-flow", "Heat flow arrows", prefs.heatFlowVisible, "heatFlowVisible")}
        ${switchRow("setting-heat-map", "Heat map", prefs.heatMapVisible, "heatMapVisible")}
        ${switchRow("setting-debug-overlay", "Debug overlay (flow arrows)", prefs.debugOverlay, "debugOverlay")}
      </table>
    </div>
  `;
}

export function createSystemSection() {
  const prefs = getValidatedPreferences();
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>ENGINE & NOTIFICATIONS</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-force-no-sab", "Force No-SAB", prefs.forceNoSAB, "forceNoSAB")}
        ${switchRow("setting-notifications", "Update Notifications", false, "notifications")}
      </table>

      <h4 style="margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-warning-color, rgb(255, 160, 0)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;">POWER CYCLING</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="research_back_to_splash_btn" style="border-color: rgb(209, 107, 107) rgb(80, 30, 30) rgb(80, 30, 30) rgb(209, 107, 107); background: rgb(171, 63, 63);">QUIT TO TITLE</button>
      </div>

      <h4 style=${SECTION_HEAD_MARGIN}>SYSTEM INFO</h4>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Version: <span id="app_version" style="color: white;">Loading...</span></p>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Display Mode: <span id="app_display_mode" style="color: white;">Detecting...</span></p>

      <h4 style=${SECTION_HEAD_MARGIN}>LEGAL</h4>
      <div class="settings-legal-links" style="display: flex; flex-direction: column; gap: 0.5rem;">
        <a href="pages/about.html" class="settings-legal-link">About</a>
        <a href="pages/privacy-policy.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        <a href="pages/terms-of-service.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      </div>
    </div>
  `;
}

export function createDataSection() {
  return html`
    <div class="settings-section">
      <h4 style=${SECTION_HEAD}>LOCAL STORAGE</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="setting-export">Export</button>
        <button class="pixel-btn" id="setting-import">Import</button>
        <input type="file" id="setting-import-input" accept=".json" style=${styleMap(HIDDEN_STYLE)}>
      </div>

      <div id="setting-cloud-saves" class="settings-cloud-saves" style=${styleMap({ display: "none", marginTop: "2rem" })}>
        <h4 class="settings-cloud-heading" style=${SECTION_HEAD}>CLOUD UPLINK</h4>
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
  `;
}
