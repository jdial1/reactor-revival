import { html } from "lit-html";
import { repeat, styleMap } from "../utils.js";

export const settingsHelpShellTemplate = `<div class="settings-help-backdrop"></div>
<div class="settings-help-content pixel-panel">
  <div class="settings-help-body"></div>
  <button type="button" class="settings-help-close" aria-label="Close">×</button>
</div>`;

export const settingsHelpBodyTemplate = `<h4 class="settings-help-title">{{title}}</h4>
<p class="settings-help-text">{{content}}</p>`;

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

export function switchRowTemplate(id, label, checked, key, hiddenStyle, helpIcon, mechSwitch) {
  return html`
    <tr class="settings-option-row" data-checkbox-id=${id} role="button" tabindex="0">
      <td class="settings-visuals-label">
        <span>${label}</span>
        ${helpIcon(key)}
      </td>
      <td class="settings-visuals-control">
        <label class="mech-switch-row">
          <input type="checkbox" id=${id} ?checked=${checked} style=${styleMap(hiddenStyle)}>
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

export function volumeSectionTemplate(isMuted, vol, hiddenStyle, volumeStepper) {
  return html`
    <div class="settings-section">
      <label class="setting-row mute-toggle settings-option-row" style="margin-bottom: 1.5rem;" role="button" tabindex="0">
        <span>Master Mute</span>
        <button type="button" class="mute-btn" id="setting-mute-btn" aria-label="Toggle Mute">
          <span class="mute-icon">${isMuted ? "🔇" : "🔊"}</span>
        </button>
        <input type="checkbox" id="setting-mute" ?checked=${isMuted} style=${styleMap(hiddenStyle)}>
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
          <select id="setting-number-format" class="pixel-select settings-select" style="background: rgb(60,60,60); color: white; border: 2px solid var(--bevel-dark); padding: 4px;">
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
        ${switchRow("setting-hide-other-doctrine", "Hide Other Doctrine Upgrades", prefs.hideOtherDoctrineUpgrades, "hideOtherDoctrineUpgrades")}
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

      <h4 style="margin-top: 2rem; margin-bottom: 0.75rem; color: var(--game-warning-color, rgb(255, 160, 0)); font-size: 0.8rem; border-bottom: 2px solid rgb(68,68,68); padding-bottom: 4px;">POWER CYCLING</h4>
      <div class="data-buttons">
        <button class="pixel-btn" id="research_back_to_splash_btn" style="border-color: rgb(209, 107, 107) rgb(80, 30, 30) rgb(80, 30, 30) rgb(209, 107, 107); background: rgb(171, 63, 63);">QUIT TO TITLE</button>
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
  return html`
    <div class="settings-modal-overlay" @click=${(e) => {
      if (e.target === e.currentTarget || e.target.closest(".modal-close-btn")) onClose();
    }}>
      <div class="settings-modal pixel-panel" style="padding: 0; display: flex; flex-direction: column;">
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="settings-header" style="background: rgb(35, 39, 35); border-bottom: 4px solid var(--bevel-dark); padding: 12px 16px;">
          <h2 style="margin: 0; color: var(--game-success-color, rgb(143, 214, 148)); font-size: 1rem; text-shadow: 2px 2px 0px rgba(0,0,0,0.8);">[ DIAGNOSTIC TERMINAL ]</h2>
          <button class="close-btn modal-close-btn" aria-label="Close" @click=${onClose}>✖</button>
        </div>

        <div class="settings-tabs" role="tablist">
          <button class="settings-tab ${activeTab === "audio" ? "active" : ""}" role="tab" aria-selected=${activeTab === "audio"} aria-controls="settings_tab_audio" data-tab="audio" id="settings_tab_audio_btn" @click=${() => onTabClick("audio")}>AUDIO</button>
          <button class="settings-tab ${activeTab === "visuals" ? "active" : ""}" role="tab" aria-selected=${activeTab === "visuals"} aria-controls="settings_tab_visuals" data-tab="visuals" id="settings_tab_visuals_btn" @click=${() => onTabClick("visuals")}>VISUALS</button>
          <button class="settings-tab ${activeTab === "system" ? "active" : ""}" role="tab" aria-selected=${activeTab === "system"} aria-controls="settings_tab_system" data-tab="system" id="settings_tab_system_btn" @click=${() => onTabClick("system")}>SYS</button>
          <button class="settings-tab ${activeTab === "data" ? "active" : ""}" role="tab" aria-selected=${activeTab === "data"} aria-controls="settings_tab_data" data-tab="data" id="settings_tab_data_btn" @click=${() => onTabClick("data")}>DATA</button>
        </div>

        <div class="settings-content pixel-panel is-inset">
          <div id="settings_tab_audio" class="settings_tab_content ${activeTab === "audio" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_audio_btn" aria-hidden=${activeTab !== "audio"}>
            ${volumeTemplate}
          </div>
          <div id="settings_tab_visuals" class="settings_tab_content ${activeTab === "visuals" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_visuals_btn" aria-hidden=${activeTab !== "visuals"}>
            ${visualTemplate}
          </div>
          <div id="settings_tab_system" class="settings_tab_content ${activeTab === "system" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_system_btn" aria-hidden=${activeTab !== "system"}>
            ${systemTemplate}
          </div>
          <div id="settings_tab_data" class="settings_tab_content ${activeTab === "data" ? "active" : ""}" role="tabpanel" aria-labelledby="settings_tab_data_btn" aria-hidden=${activeTab !== "data"}>
            ${dataTemplate}
          </div>
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

export function harmonicDiagnosticsModalTemplate({ waveType, healthLabel, samples, onClose }) {
  const lastSample = samples[samples.length - 1] ?? { powerLevel: 0, heatLevel: 0, powerNet: 0, heatNet: 0, ventEff: 0, overflowRatio: 0.5 };
  const dataPoints = samples.map((sample, index) => {
    const x = samples.length > 1 ? (index / (samples.length - 1)) * 100 : 0;
    const powerY = 92 - Math.min(90, Math.max(0, sample.powerLevel * 90));
    const heatY = 92 - Math.min(90, Math.max(0, sample.heatLevel * 90));
    return `${x.toFixed(2)},${powerY.toFixed(2)} ${x.toFixed(2)},${heatY.toFixed(2)}`;
  });
  const powerPolyline = dataPoints.map((point) => point.split(" ")[0]).join(" ");
  const heatPolyline = dataPoints.map((point) => point.split(" ")[1]).join(" ");
  return html`
    <div class="harmonic-modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="harmonic-modal pixel-panel" role="dialog" aria-modal="true" aria-label="Harmonic diagnostics">
        <div class="harmonic-modal-header">
          <h2>Harmonic Health: ${healthLabel}</h2>
          <button type="button" class="close-btn" aria-label="Close diagnostics" @click=${onClose}>✖</button>
        </div>
        <div class="harmonic-modal-body">
          <div class="harmonic-readout-grid">
            <span>Channel</span><span>${waveType === "heat" ? "Heat" : "Power"}</span>
            <span>Net Power</span><span>${(lastSample.powerNet ?? 0).toFixed(2)}</span>
            <span>Net Heat</span><span>${(lastSample.heatNet ?? 0).toFixed(2)}</span>
            <span>Vent Eff.</span><span>${(lastSample.ventEff ?? 0).toFixed(2)}%</span>
            <span>Overflow Ratio</span><span>${(lastSample.overflowRatio ?? 0.5).toFixed(2)}</span>
          </div>
          <div class="harmonic-scope">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Power and heat waveform history">
              <polyline class="harmonic-trace-power" points=${powerPolyline}></polyline>
              <polyline class="harmonic-trace-heat" points=${heatPolyline}></polyline>
            </svg>
          </div>
        </div>
      </div>
    </div>
  `;
}
