import { html } from "lit-html";
import { repeat, styleMap } from "../utils.js";

const SETTINGS_MODAL_TABS = [
  { tab: "audio", label: "AUDIO", panelId: "settings_tab_audio", btnId: "settings_tab_audio_btn" },
  { tab: "visuals", label: "VISUALS", panelId: "settings_tab_visuals", btnId: "settings_tab_visuals_btn" },
  { tab: "system", label: "SYS", panelId: "settings_tab_system", btnId: "settings_tab_system_btn" },
  { tab: "data", label: "DATA", panelId: "settings_tab_data", btnId: "settings_tab_data_btn" },
];

export const settingsHelpShellTemplate = `<div class="settings-help-backdrop"></div>
<div class="settings-help-content pixel-panel">
  <div class="settings-help-body"></div>
  <button type="button" class="settings-help-close" aria-label="Close">×</button>
</div>`;

export function volumeStepperTemplate(key, step) {
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

export function mechSwitchTemplate(id, checked) {
  return html`
    <button type="button" class="mech-switch ${checked ? "mech-switch-on-active" : ""}" role="switch" aria-checked=${checked} data-checkbox-id=${id} tabindex="0">
      <span class="mech-switch-off">OFF</span>
      <span class="mech-switch-track"><span class="mech-switch-thumb"></span></span>
      <span class="mech-switch-on">ON</span>
    </button>
  `;
}

export function helpIconTemplate(settingKey) {
  return html`
    <button type="button" class="setting-help-icon" data-setting-key=${settingKey} aria-label="Explain this setting">?</button>
  `;
}

export function switchRowTemplate(id, label, checked, key, helpIcon, mechSwitch) {
  return html`
    <tr class="settings-option-row" data-checkbox-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(key)}
      </td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" class="settings-mech-checkbox" id=${id} ?checked=${checked}>
          ${mechSwitch(id, checked)}
        </label>
      </td>
    </tr>
  `;
}

export function selectRowTemplate(id, label, helpKey, content, helpIcon) {
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

export function volumeSectionTemplate(isMuted, vol, volumeStepper) {
  return html`
    <div class="settings-section">
      <label class="setting-row mute-toggle settings-option-row" style="margin-bottom: 1.5rem;" role="button" tabindex="0">
        <span>Master Mute</span>
        <button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
          <span class="mute-icon">${isMuted ? "🔇" : "🔊"}</span>
        </button>
        <input type="checkbox" class="settings-mech-checkbox" id="setting-mute" ?checked=${isMuted}>
      </label>
      <div class="volume-setting"><label class="volume-label">Master Volume</label>${volumeStepper("master", vol.volumeMaster)}</div>
      <div class="volume-setting"><label class="volume-label">Effects Volume</label>${volumeStepper("effects", vol.volumeEffects)}</div>
      <div class="volume-setting"><label class="volume-label">Alerts Volume</label>${volumeStepper("alerts", vol.volumeAlerts)}</div>
      <div class="volume-setting"><label class="volume-label">System Volume</label>${volumeStepper("system", vol.volumeSystem)}</div>
      <div class="volume-setting" style="margin-bottom: 0;"><label class="volume-label">Background Volume</label>${volumeStepper("ambience", vol.volumeAmbience)}</div>
    </div>
  `;
}

export function visualSectionTemplate(prefs, sectionHead, sectionHeadMargin, switchRow, selectRow) {
  return html`
    <div class="settings-section">
      <h4 style=${sectionHead}>ACCESSIBILITY</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-motion", "Reduced Motion", prefs.reducedMotion, "reducedMotion")}
        ${selectRow("setting-number-format", "Number format", "numberFormat", html`
          <select id="setting-number-format" class="pixel-select settings-select" style="background: rgb(60 60 60); color: white; border: 2px solid var(--bevel-dark); padding: 4px;">
            <option value="default" ?selected=${prefs.numberFormat === "default"}>1,234 K</option>
            <option value="scientific" ?selected=${prefs.numberFormat === "scientific"}>1.23e3</option>
          </select>
        `)}
      </table>

      <h4 style=${sectionHeadMargin}>UPGRADE PANEL</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-hide-upgrades", "Hide Unaffordable Upgrades", prefs.hideUnaffordableUpgrades, "hideUnaffordableUpgrades")}
        ${switchRow("setting-hide-research", "Hide Unaffordable Research", prefs.hideUnaffordableResearch, "hideUnaffordableResearch")}
        ${switchRow("setting-hide-max-upgrades", "Hide Max Upgrades", prefs.hideMaxUpgrades, "hideMaxUpgrades")}
        ${switchRow("setting-hide-max-research", "Hide Max Research", prefs.hideMaxResearch, "hideMaxResearch")}
      </table>

      <h4 style=${sectionHeadMargin}>REACTOR VIEW</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-heat-flow", "Heat flow arrows", prefs.heatFlowVisible, "heatFlowVisible")}
        ${switchRow("setting-heat-map", "Heat map", prefs.heatMapVisible, "heatMapVisible")}
        ${switchRow("setting-debug-overlay", "Debug overlay (flow arrows)", prefs.debugOverlay, "debugOverlay")}
      </table>
    </div>
  `;
}

export function systemSectionTemplate(prefs, notificationsChecked, sectionHead, sectionHeadMargin, switchRow) {
  return html`
    <div class="settings-section">
      <h4 style=${sectionHead}>ENGINE & NOTIFICATIONS</h4>
      <table class="settings-visuals-table">
        ${switchRow("setting-force-no-sab", "Force No-SAB", prefs.forceNoSAB, "forceNoSAB")}
        ${switchRow("setting-notifications", "Update Notifications", notificationsChecked, "notifications")}
      </table>

      <h4 style="margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-warning-color, rgb(255 160 0)); font-size: 0.8rem; border-bottom: 2px solid rgb(68 68 68); padding-bottom: 4px;">POWER CYCLING</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="research_back_to_splash_btn" style="border-color: rgb(209 107 107) rgb(80 30 30) rgb(80 30 30) rgb(209 107 107); background: rgb(171 63 63);">QUIT TO TITLE</button>
      </div>

      <h4 style=${sectionHeadMargin}>SYSTEM INFO</h4>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Version: <span id="app_version" style="color: white;">Loading...</span></p>
      <p style="margin: 0.5rem 0; font-size: 0.65rem; color: #ccc;">Display Mode: <span id="app_display_mode" style="color: white;">Detecting...</span></p>

      <h4 style=${sectionHeadMargin}>LEGAL</h4>
      <div class="settings-legal-links" style="display: flex; flex-direction: column; gap: 0.5rem;">
        <a href="#about_section" data-page="about_section" class="settings-legal-link">About</a>
        <a href="privacy-policy.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        <a href="terms-of-service.html" class="settings-legal-link" target="_blank" rel="noopener noreferrer">Terms of Service</a>
      </div>
    </div>
  `;
}

export function dataSectionTemplate(sectionHead, hiddenStyle) {
  return html`
    <div class="settings-section">
      <h4 style=${sectionHead}>LOCAL STORAGE</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="setting-export">Export</button>
        <button class="pixel-btn" id="setting-import">Import</button>
        <input type="file" id="setting-import-input" accept=".json" style=${styleMap(hiddenStyle)}>
      </div>

      <div id="setting-cloud-saves" class="settings-cloud-saves" style=${styleMap({ display: "none", marginTop: "2rem" })}>
        <h4 class="settings-cloud-heading" style=${sectionHead}>CLOUD UPLINK</h4>
        <div class="cloud-slot-list">
          ${repeat([1, 2, 3], (slot) => slot, (slot) => html`
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

export function settingsModalTemplate({
  activeTab,
  volumeTemplate,
  visualTemplate,
  systemTemplate,
  dataTemplate,
  onTabClick,
  onClose,
}) {
  const panelByTab = { audio: volumeTemplate, visuals: visualTemplate, system: systemTemplate, data: dataTemplate };
  return html`
    <div class="settings-modal-overlay modal-drawer-overlay">
      <div class="modal-drawer-scrim" @click=${onClose}></div>
      <div class="settings-modal pixel-panel modal-drawer-panel" style="padding: 0; display: flex; flex-direction: column;" @click=${(e) => e.stopPropagation()}>
        <div class="modal-drawer-metal-handle" aria-hidden="true"></div>
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="settings-header" style="background: rgb(35 39 35); border-bottom: 4px solid var(--bevel-dark); padding: 12px 16px;">
          <h2 style="margin: 0; color: var(--game-success-color, rgb(143 214 148)); font-size: 1rem; text-shadow: 2px 2px 0 rgb(0 0 0 / 80%);">[ DIAGNOSTIC TERMINAL ]</h2>
          <button type="button" class="close-btn modal-close-btn modal-latch-close" aria-label="Close" @click=${onClose}><span class="modal-latch-arm" aria-hidden="true"></span><span class="modal-latch-body"></span></button>
        </div>

        <div class="settings-tabs" role="tablist">
          ${SETTINGS_MODAL_TABS.map(
            ({ tab, label, panelId, btnId }) => html`
              <button
                class="settings-tab ${activeTab === tab ? "active" : ""}"
                role="tab"
                aria-selected=${activeTab === tab}
                aria-controls=${panelId}
                data-tab=${tab}
                id=${btnId}
                @click=${() => onTabClick(tab)}
              >${label}</button>
            `
          )}
        </div>

        <div class="settings-content pixel-panel is-inset">
          ${SETTINGS_MODAL_TABS.map(
            ({ tab, panelId, btnId }) => html`
              <div
                id=${panelId}
                class="settings_tab_content ${activeTab === tab ? "active" : ""}"
                role="tabpanel"
                aria-labelledby=${btnId}
                aria-hidden=${activeTab !== tab}
              >
                ${panelByTab[tab]}
              </div>
            `
          )}
        </div>
      </div>
    </div>
  `;
}

export function reactorFailedToStartTemplate({ errorMessage, defaultMessage, onTryAgain, onDismiss }) {
  return html`
    <div class="reactor-failed-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="reactor-failed-modal pixel-panel">
        <h2 class="reactor-failed-title">Reactor Failed to Start</h2>
        <p class="reactor-failed-message">${errorMessage ?? defaultMessage}</p>
        <div class="reactor-failed-actions">
          <button type="button" class="pixel-btn" @click=${onTryAgain}>Try Again</button>
          <button type="button" class="pixel-btn secondary" @click=${onDismiss}>Dismiss (Pause)</button>
        </div>
      </div>
    </div>
  `;
}

export function welcomeBackModalTemplate({ durationStr, tickStr, onInstant, onFastForward, onDismiss }) {
  return html`
    <div class="welcome-back-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div class="welcome-back-modal pixel-panel">
        <h2 class="welcome-back-title">Welcome Back!</h2>
        <p class="welcome-back-message">You were away for <strong>${durationStr}</strong> (~${tickStr} ticks).</p>
        <p class="welcome-back-sub">Choose how to catch up:</p>
        <div class="welcome-back-actions">
          <button type="button" class="pixel-btn welcome-back-instant" @click=${onInstant}>Instant Catch-up</button>
          <button type="button" class="pixel-btn welcome-back-ff" @click=${onFastForward}>Fast-Forward</button>
        </div>
        <p class="welcome-back-hint">Instant: apply average income/heat immediately (analytical solve for long durations). Fast-Forward: process 100 ticks per frame until caught up.</p>
      </div>
    </div>
  `;
}

export function prestigeModalTemplate({ mode, title, body, onConfirm, onCancel }) {
  return html`
    <div class="prestige-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div class="prestige-modal pixel-panel">
        <h2 id="prestige_modal_title">${title}</h2>
        <div id="prestige_modal_body">${body}</div>
        <div class="prestige-modal-actions">
          <button id="prestige_modal_cancel" class="pixel-btn nav-btn" type="button" @click=${onCancel}>Cancel</button>
          ${mode === "refund"
            ? html`<button id="prestige_modal_confirm_refund" class="pixel-btn nav-btn" type="button" @click=${() => onConfirm("refund")}>Confirm Refund</button>`
            : html`<button id="prestige_modal_confirm_prestige" class="pixel-btn nav-btn btn-start" type="button" @click=${() => onConfirm("prestige")}>Confirm Prestige</button>`
          }
        </div>
      </div>
    </div>
  `;
}

export function contextModalTemplate({ partTitle, bodyContent, onClose, onSell }) {
  return html`
    <div id="context_modal" class="context-modal" role="dialog" aria-modal="true">
      <div class="context-modal-handle"></div>
      <div class="context-modal-content">
        <div class="context-modal-header">
          <h3 class="context-modal-title">${partTitle}</h3>
          <button class="context-modal-close" aria-label="Close" @click=${onClose}>×</button>
        </div>
        <div class="context-modal-body">${bodyContent}</div>
        <div class="context-modal-actions">
          <button class="context-modal-sell-btn" @click=${onSell}>Sell/Destroy</button>
        </div>
      </div>
    </div>
  `;
}

