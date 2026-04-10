import { html } from "lit-html";
import { repeat, classMap } from "../utils.js";

export function infoBarTemplate({
  powerClass,
  heatClass,
  powerBarStyle,
  heatBarStyle,
  powerTextDesktop,
  powerTextMobile,
  maxPowerDesktop,
  maxPowerMobile,
  heatTextDesktop,
  heatTextMobile,
  maxHeatDesktop,
  maxHeatMobile,
  epContentStyle,
  epVisible,
  activeBuffs,
  onSell,
  onVent,
  onVentMobile,
}) {
  const buffIcons = (buff) => html`
    <div class="buff-icon active" title=${buff.title} aria-label=${buff.title}>
      <img src=${buff.icon} alt=${buff.title} />
    </div>
  `;
  return html`
    <div class="info-bar-desktop">
      <button class=${powerClass} id="info_bar_power_btn_desktop" type="button" tabindex="0" aria-label="Sell Power" style=${powerBarStyle} @click=${onSell}>
        <img src="img/ui/icons/icon_power.png" class="icon" alt="Power" />
        <span class="value" id="info_power_desktop">${powerTextDesktop}</span>
        <span class="denom" id="info_power_denom_desktop">/${maxPowerDesktop}</span>
      </button>
      <span class="info-item money">
        <img src="img/ui/icons/icon_cash.png" class="icon" alt="Cash" />
        <span class="value cathode-readout" id="info_money_desktop"></span>
      </span>
      <span class="info-item ep" id="info_ep_desktop">
        <span class="ep-content" style=${epContentStyle} ?hidden=${!epVisible}>
          <span class="icon">🧬</span>
          <span class="value cathode-readout" id="info_ep_value_desktop"></span>
        </span>
      </span>
      <div class="info-item buffs">${repeat(activeBuffs, (b) => b.id, buffIcons)}</div>
      <button class=${heatClass} id="info_bar_heat_btn_desktop" type="button" tabindex="0" aria-label="Reduce Heat" style=${heatBarStyle} @click=${onVent}>
        <img src="img/ui/icons/icon_heat.png" class="icon" alt="Heat" />
        <span class="value" id="info_heat_desktop">${heatTextDesktop}</span>
        <span class="denom" id="info_heat_denom_desktop">/${maxHeatDesktop}</span>
      </button>
    </div>
    <div class="info-bar-mobile" style="display: none;">
      <div class="info-row info-main">
        <button class=${powerClass} id="info_bar_power_btn" type="button" tabindex="0" aria-label="Sell Power" style=${powerBarStyle} @click=${onSell}>
          <img src="img/ui/icons/icon_power.png" class="icon" alt="Power" />
          <span class="value" id="info_power">${powerTextMobile}</span>
        </button>
        <span class="info-item money">
          <img src="img/ui/icons/icon_cash.png" class="icon" alt="Cash" />
          <span class="value cathode-readout" id="info_money"></span>
        </span>
        <button class=${heatClass} id="info_bar_heat_btn" type="button" tabindex="0" aria-label="Reduce Heat" style=${heatBarStyle} @click=${onVentMobile}>
          <img src="img/ui/icons/icon_heat.png" class="icon" alt="Heat" />
          <span class="value" id="info_heat">${heatTextMobile}</span>
        </button>
      </div>
      <div class="info-row info-denom">
        <span class="info-item power"><span class="denom" id="info_power_denom">/${maxPowerMobile}</span></span>
        <div class="info-item center-content">
          <span class="info-item ep" id="info_ep">
            <span class="ep-content" style=${epContentStyle} ?hidden=${!epVisible}>
              <span class="icon">🧬</span>
              <span class="value cathode-readout" id="info_ep_value"></span>
            </span>
          </span>
          <div class="info-item buffs">${repeat(activeBuffs, (b) => b.id, buffIcons)}</div>
        </div>
        <span class="info-item heat"><span class="denom" id="info_heat_denom">/${maxHeatMobile}</span></span>
      </div>
    </div>
  `;
}

export function mobileControlDeckTemplate({
  powerCapacitorClass,
  heatVentClass,
  powerRateText,
  heatRateText,
  autoRateClass,
  autoHeatRateClass,
  autoSellRateContent,
  autoHeatRateContent,
  powerFillStyle,
  heatFillStyle,
  architectMetricsText,
  tickCadenceText,
  powerCurrentText,
  heatCurrentText,
  maxPowerText,
  maxHeatText,
  moneyValueText,
  onSellPower,
  onVentHeat,
}) {
  return html`
    <div class="control-deck-architect" aria-label="Per-tick reactor metrics">
      <span class="control-deck-architect-metrics">${architectMetricsText}</span>
      <span id="control_deck_tick_line" class="control-deck-tick-line">${tickCadenceText}</span>
    </div>
    <button class=${powerCapacitorClass} id="control_deck_power_btn" type="button" tabindex="0" aria-label="Sell Power" @click=${onSellPower}>
      <div class="control-deck-auto-sell-led" id="control_deck_auto_sell_led" aria-hidden="true"></div>
      <span class="control-deck-rate" id="control_deck_power_rate" aria-hidden="true">${powerRateText}</span>
      <span class=${autoRateClass} id="control_deck_auto_sell_rate" aria-hidden="true">${autoSellRateContent}</span>
      <div class="control-deck-fill power-fill" style=${powerFillStyle}></div>
      <div class="control-deck-content">
        <img src="img/ui/icons/icon_power.png" alt="Power" class="control-deck-icon" />
        <span class="control-deck-value" id="control_deck_power">${powerCurrentText}</span>
        <span class="control-deck-denom" id="control_deck_power_denom">/${maxPowerText}</span>
      </div>
    </button>

    <div class="control-deck-item money-scoreboard" id="control_deck_money">
      <div class="control-deck-content">
        <img src="img/ui/icons/icon_cash.png" alt="Cash" class="control-deck-icon" />
        <span class="control-deck-value" id="control_deck_money_value">${moneyValueText}</span>
      </div>
      <div class="floating-text-container" id="floating_text_container"></div>
    </div>

    <button class=${heatVentClass} id="control_deck_heat_btn" type="button" tabindex="0" aria-label="Vent Heat" @click=${onVentHeat}>
      <span class="control-deck-rate" id="control_deck_heat_rate" aria-hidden="true">${heatRateText}</span>
      <span class=${autoHeatRateClass} id="control_deck_auto_heat_rate" aria-hidden="true">${autoHeatRateContent}</span>
      <div class="control-deck-fill heat-fill" style=${heatFillStyle}></div>
      <div class="control-deck-hazard-stripes"></div>
      <div class="control-deck-content">
        <img src="img/ui/icons/icon_heat.png" alt="Heat" class="control-deck-icon" />
        <span class="control-deck-value" id="control_deck_heat">${heatCurrentText}</span>
        <span class="control-deck-denom" id="control_deck_heat_denom">/${maxHeatText}</span>
      </div>
      <div class="steam-particles" id="steam_particles"></div>
    </button>
  `;
}

export function mobilePassiveBarTemplate({
  epText,
  moneyText,
  pauseClass,
  pauseAriaLabel,
  pauseTitle,
  onPauseClick,
}) {
  return html`
    <span class="passive-top-ep">
      <span class="passive-top-icon" aria-hidden="true">&#129516;</span>
      <span id="mobile_passive_ep">${epText}</span>
    </span>
    <span class="passive-top-money">
      <span id="mobile_passive_money_value">${moneyText}</span>
    </span>
    <button
      type="button"
      id="mobile_passive_pause_btn"
      class=${pauseClass}
      aria-label=${pauseAriaLabel}
      title=${pauseTitle}
      @click=${onPauseClick}
    >
      <img src="img/ui/nav/nav_pause.png" alt="" class="passive-pause-icon pause-icon" />
      <img src="img/ui/nav/nav_play.png" alt="" class="passive-pause-icon play-icon" />
    </button>
  `;
}

export function partsPanelLayoutTemplate({
  powerActive,
  heatActive,
  helpModeActive,
  onSwitchPower,
  onSwitchHeat,
  onHelpToggle,
  tabContent,
  moduleInfoContent,
}) {
  return html`
    <div class="parts_header">
      <div class="parts_tabs parts_categories_carousel">
        <button
          class="parts_tab ${powerActive ? "active" : ""}"
          @click=${onSwitchPower}
          title="Power Creation"
          aria-label="Power Creation"
        >
          <img src="img/ui/icons/icon_power.png" alt="Power" />
          <span class="parts_tab_label">Power</span>
        </button>
        <button
          class="parts_tab ${heatActive ? "active" : ""}"
          @click=${onSwitchHeat}
          title="Heat Management"
          aria-label="Heat Management"
        >
          <img src="img/ui/icons/icon_heat.png" alt="Heat" />
          <span class="parts_tab_label">Heat</span>
        </button>
        <button
          id="parts_help_toggle"
          class="parts_help_btn ${helpModeActive ? "active" : ""}"
          title="Toggle help mode - click to show part information instead of placing parts"
          aria-label="Toggle help mode"
          @click=${onHelpToggle}
        >
          ?
        </button>
      </div>
    </div>
    <div id="parts_tab_contents">
      ${tabContent}
    </div>
    <div id="parts_module_info" class="parts-module-info-panel" aria-live="polite">
      ${moduleInfoContent}
    </div>
  `;
}

export function partsPanelEmptyTabContentTemplate() {
  return html`
    <div id="parts_tab_power" class="parts_tab_content active"><div id="cells" class="item-grid"></div><div id="reflectors" class="item-grid"></div><div id="capacitors" class="item-grid"></div><div id="particleAccelerators" class="item-grid"></div></div>
    <div id="parts_tab_heat" class="parts_tab_content"><div id="vents" class="item-grid"></div><div id="heatExchangers" class="item-grid"></div><div id="heatInlets" class="item-grid"></div><div id="heatOutlets" class="item-grid"></div><div id="coolantCells" class="item-grid"></div><div id="reactorPlatings" class="item-grid"></div><div id="overflowValves" class="item-grid"></div><div id="topupValves" class="item-grid"></div><div id="checkValves" class="item-grid"></div></div>
  `;
}

export function partsPanelTabContentTemplate({
  powerActive,
  heatActive,
  grid,
}) {
  return html`
    <div id="parts_tab_power" class="parts_tab_content ${powerActive ? "active" : ""}">
      <hgroup><h4>Cells</h4><h6>Generate power and heat.</h6></hgroup>
      ${grid("cells")}
      <hgroup><h4>Reflectors</h4><h6>Boost adjacent cell output.</h6></hgroup>
      ${grid("reflectors")}
      <hgroup><h4>Capacitors</h4><h6>Increase reactor power capacity.</h6></hgroup>
      ${grid("capacitors")}
      <hgroup><h4>Particle Accelerators</h4><h6>Generate Exotic Particles from heat.</h6></hgroup>
      ${grid("particleAccelerators")}
    </div>
    <div id="parts_tab_heat" class="parts_tab_content ${heatActive ? "active" : ""}">
      <hgroup><h4>Vents</h4><h6>Actively cool components.</h6></hgroup>
      ${grid("vents")}
      <hgroup><h4>Heat Exchangers</h4><h6>Distribute heat between components.</h6></hgroup>
      ${grid("heatExchangers")}
      <hgroup><h4>Heat Inlets</h4><h6>Move heat into the reactor core.</h6></hgroup>
      ${grid("heatInlets")}
      <hgroup><h4>Heat Outlets</h4><h6>Move heat out of the reactor core.</h6></hgroup>
      ${grid("heatOutlets")}
      <hgroup><h4>Coolant Cells</h4><h6>Absorb and contain heat.</h6></hgroup>
      ${grid("coolantCells")}
      <hgroup><h4>Reactor Plating</h4><h6>Increase reactor heat capacity.</h6></hgroup>
      ${grid("reactorPlatings")}
      <hgroup><h4>Overflow Valves</h4><h6>Transfer heat when input exceeds 80% containment.</h6></hgroup>
      ${grid("overflowValves")}
      <hgroup><h4>Top-up Valves</h4><h6>Transfer heat when output drops below 20% containment.</h6></hgroup>
      ${grid("topupValves")}
      <hgroup><h4>Check Valves</h4><h6>Transfer heat in one direction only.</h6></hgroup>
      ${grid("checkValves")}
    </div>
  `;
}

export function controlDeckStatsBarTemplate() {
  return html`
    <li><strong title="Total heat venting per tick"><img src="img/ui/icons/icon_vent.png" alt="Vent" class="icon-inline" /><span id="stats_vent" class="cathode-readout"></span></strong></li>
    <li><strong title="Power per tick"><img src="img/ui/icons/icon_power.png" alt="Power" class="icon-inline" /><span id="stats_power" class="cathode-readout"></span></strong></li>
    <li><strong title="Heat per tick"><img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon-inline" /><span id="stats_heat" class="cathode-readout"></span></strong></li>
    <li><strong title="Reactor hull fill"><span class="stats-inline-label">Hull</span> <span id="stats_hull" class="cathode-readout"></span></strong></li>
  `;
}

export function controlDeckExoticParticlesTemplate({
  currentEp,
  totalEp,
}) {
  return html`
    <div class="grid">
      <div>Current 🧬 EP: <strong><span id="current_exotic_particles">${currentEp}</span></strong></div>
      <div>Total 🧬 EP: <strong><span id="total_exotic_particles">${totalEp}</span></strong></div>
    </div>
  `;
}

function controlDeckMechSwitch(id, checked, onClick, caption, title, wrapClass) {
  const aria = `${caption}, ${checked ? "on" : "off"}`;
  return html`
    <div class=${`control-deck-mech-wrap ${wrapClass || ""}`} title=${title}>
      <span class="control-deck-mech-cap">${caption}</span>
      <button type="button" class=${`mech-switch mech-switch--compact ${checked ? "mech-switch-on-active" : ""}`} id=${id} role="switch" aria-checked=${checked} aria-label=${aria} @click=${onClick}>
        <span class="mech-switch-off">OFF</span>
        <span class="mech-switch-track"><span class="mech-switch-thumb"></span></span>
        <span class="mech-switch-on">ON</span>
      </button>
    </div>
  `;
}

export function controlDeckControlsNavTemplate({
  autoSellOn,
  autoBuyOn,
  heatControlOn,
  pauseOn,
  accountTitle,
  accountIcon,
  onToggleAutoSell,
  onToggleAutoBuy,
  onToggleHeatControl,
  onTogglePause,
}) {
  const pauseCaption = pauseOn ? "Paused" : "Running";
  const pauseHint = pauseOn ? "Resume simulation" : "Pause simulation";
  return html`
    ${controlDeckMechSwitch("auto_sell_toggle", autoSellOn, onToggleAutoSell, "Auto sell", "Sell power automatically when the capacitor is full", "")}
    ${controlDeckMechSwitch("auto_buy_toggle", autoBuyOn, onToggleAutoBuy, "Auto buy", "Buy fuel and parts automatically when affordable", "")}
    ${controlDeckMechSwitch("heat_control_toggle", heatControlOn, onToggleHeatControl, "Auto heat", "Automatically vent heat toward the target level", "")}
    ${controlDeckMechSwitch("pause_toggle", pauseOn, onTogglePause, pauseCaption, pauseHint, pauseOn ? "paused" : "")}
    <button id="user_account_btn_mobile" class="pixel-btn" title=${accountTitle}>
      <span class="control-icon" style="font-size: 1.5em;">${accountIcon}</span>
      <span class="control-text">Account</span>
    </button>
  `;
}

export function debugVariablesSectionTemplate({
  fileName,
  sortedEntries,
  escapeKey,
  renderValue,
}) {
  return html`
    <div class="debug-section">
      <h4>${fileName}</h4>
      <div class="debug-variables-list">
        ${repeat(sortedEntries, ([k]) => k, ([key, value]) => html`
          <div class="debug-variable">
            <span class="debug-key">${escapeKey(key)}:</span>
            <span class="debug-value">${renderValue(value)}</span>
          </div>
        `)}
      </div>
    </div>
  `;
}

export function debugVariablesTemplate({
  entries,
  renderSection,
}) {
  return html`${repeat(entries, ([fileName]) => fileName, renderSection)}`;
}

export function emptyLayoutsListTemplate() {
  return html`<p style="color: rgb(180 180 180); margin: 0;">No saved layouts. Copy a reactor layout to add it here.</p>`;
}

export function layoutsListTemplate({
  list,
  renderRow,
}) {
  return html`
    <table id="my_layouts_list_table">
      <thead><tr><th>Name</th><th>Cost</th><th></th></tr></thead>
      <tbody>
        ${repeat(list, (entry) => entry.id, renderRow)}
      </tbody>
    </table>
  `;
}

export function myLayoutsModalTemplate({
  onClose,
  onSaveFromClipboard,
  listContent,
}) {
  return html`
    <div
      id="my_layouts_modal"
      class="modal-overlay modal-drawer-overlay"
    >
      <div class="modal-drawer-scrim" @click=${onClose}></div>
      <div class="modal-content modal-drawer-panel" @click=${(e) => e.stopPropagation()}>
        <div class="modal-drawer-metal-handle" aria-hidden="true"></div>
        <div class="modal-header">
          <h3>My Layouts</h3>
          <button id="my_layouts_close_btn" title="Close" aria-label="Close" @click=${onClose}>×</button>
        </div>
        <div class="my-layouts-toolbar">
          <button id="my_layouts_save_from_clipboard_btn" class="pixel-btn" type="button" @click=${onSaveFromClipboard}>Save from Clipboard</button>
        </div>
        <div id="my_layouts_list">
          ${listContent}
        </div>
      </div>
    </div>
  `;
}

export function copyPasteNoPartsTemplate({
  messageStyle,
}) {
  return html`<div style=${messageStyle}>No parts found in layout</div>`;
}

export function copyPasteCostDisplayTemplate({
  containerStyle,
  showMoney,
  moneyStyle,
  moneyText,
  showEp,
  epStyle,
  epText,
}) {
  return html`
    <div style=${containerStyle}>
      ${showMoney ? html`<span style=${moneyStyle}>${moneyText}</span>` : ""}
      ${showEp ? html`<span style=${epStyle}>${epText}</span>` : ""}
    </div>
  `;
}

export function copyPasteSellOptionTemplate({
  boxStyle,
  labelStyle,
  inputStyle,
  checked,
  onSellChange,
  textStyle,
  text,
}) {
  return html`
    <div style=${boxStyle}>
      <label style=${labelStyle}>
        <input type="checkbox" id="sell_existing_checkbox" style=${inputStyle} ?checked=${checked} @change=${onSellChange}>
        <span style=${textStyle}>${text}</span>
      </label>
    </div>
  `;
}

export function copyPasteModalCostContentTemplate({
  componentTemplate,
  costTemplate,
}) {
  return html`${componentTemplate}${costTemplate}`;
}

export function copyPasteStatusMessageTemplate({
  message,
}) {
  return html`${message}`;
}

export function copyPasteRenderedContentTemplate({
  componentTemplate,
  sellOptionTemplate,
  costTemplate,
}) {
  return html`${componentTemplate}${sellOptionTemplate}${costTemplate}`;
}

export function copyPasteSelectedPartsCostTemplate({
  costStyle,
  text,
}) {
  return html`<div style=${costStyle}>${text}</div>`;
}

export function myLayoutsTableRowTemplate({
  entryId,
  name,
  costStr,
  onView,
  onLoad,
  onDelete,
}) {
  return html`
    <tr data-id=${entryId}>
      <td>${name}</td>
      <td>${costStr}</td>
      <td class="my-layout-actions">
        <button class="pixel-btn my-layout-view-btn" type="button" @click=${onView}>View</button>
        <button class="pixel-btn my-layout-load-btn" type="button" @click=${onLoad}>Load</button>
        <button class="pixel-btn my-layout-delete-btn" type="button" @click=${onDelete}>Delete</button>
      </td>
    </tr>
  `;
}

export function componentSummaryEmptyTemplate() {
  return html`<div class="component-summary-section"></div>`;
}

export function componentSummaryTemplate({
  items,
  checkedTypes,
  showCheckboxes,
  onSlotClick,
  getImagePath,
}) {
  return html`
    <div class="component-summary-section">
      <div class="component-header">
        <span class="component-title">Components</span>
      </div>
      <div class="component-grid">
        ${items.map((item) => {
          const anyUnchecked = item.ids.some((id) => checkedTypes[id] === false);
          const checked = !anyUnchecked;
          const isDisabled = showCheckboxes && !checked;
          const imagePath = getImagePath({ type: item.type, level: item.lvl });
          const fallbackChar = item.title ? item.title.charAt(0).toUpperCase() : "?";
          return html`
            <div class="component-slot ${isDisabled ? "component-disabled" : ""}"
                 data-ids="${item.ids.join(",")}"
                 data-type="${item.type}"
                 data-lvl="${String(item.lvl)}"
                 @click=${onSlotClick ? () => onSlotClick(item.ids, checked) : undefined}>
              <div class="component-icon">
                <img src="${imagePath}" alt="${item.title || ""}"
                     @error=${(e) => {
                       e.target.style.display = "none";
                       if (e.target.nextElementSibling) e.target.nextElementSibling.style.display = "block";
                     }} />
                <div class="component-fallback" style="display: none;">${fallbackChar}</div>
              </div>
              <div class="component-count">${item.count}</div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
}

export function leaderboardStatusRowTemplate({
  text,
}) {
  return html`<tr><td colspan="7" style="text-align: center;">${text}</td></tr>`;
}

export function leaderboardRowTemplate({
  rank,
  date,
  powerClass,
  heatClass,
  moneyClass,
  powerText,
  heatText,
  moneyText,
  timeText,
  viewCellContent,
}) {
  return html`
    <tr>
      <td>${rank}</td>
      <td>${date}</td>
      <td class=${powerClass}>${powerText}</td>
      <td class=${heatClass}>${heatText}</td>
      <td class=${moneyClass}>${moneyText}</td>
      <td class="leaderboard-col-time" style="display: none;">${timeText}</td>
      <td>${viewCellContent}</td>
    </tr>
  `;
}

export function layoutViewModalTemplate({
  onClose,
  jsonText,
  stats,
}) {
  return html`
    <div
      class="layout-view-modal-overlay"
      @click=${(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div style="display: flex; flex-direction: column; gap: 12px; max-width: 90vw; max-height: 90vh; padding: 16px; border: 1px solid rgb(90,90,90); background: rgb(26,26,26); color: white; overflow: auto;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <h3 style="margin: 0;">Reactor Layout</h3>
          <button type="button" @click=${() => onClose?.()} style="padding: 5px 10px;">×</button>
        </div>
        <pre style="margin: 0; white-space: pre-wrap; word-break: break-word;">${String(jsonText).slice(0, 4000)}</pre>
        ${stats ? html`<div style="opacity: 0.8; font-size: 0.8rem;">${stats.money ?? ""}</div>` : ""}
      </div>
    </div>
  `;
}

export function quickStartTemplate({
  page,
  onClose,
  onMoreDetails,
  onBack,
}) {
  const p1 = classMap({ "quick-start-screen": true, hidden: page !== 1 });
  const p2 = classMap({ "quick-start-screen": true, hidden: page !== 2 });
  return html`
    <div
      id="quick-start-modal"
      class="quick-start-overlay"
      @click=${(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div id="quick-start-page-1" class=${p1}>
        <div class="modal-swipe-handle" id="quick-start-swipe-handle" aria-hidden="true"></div>
        <div class="quick-start-header">
          <span>PROTOCOL_01</span>
          <span class="quick-start-version">v25.07</span>
        </div>
        <div class="bios-content">
          <div class="qs-section qs-accordion qs-accordion-expanded">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">1. OUTPUT CYCLE</div>
            <div class="qs-accordion-body">
              <div class="qs-flow">
                <div class="qs-flow-diagram">
                  <span class="qs-flow-icon qs-flow-fuel"><img src="img/parts/cells/cell_1_1.png" alt="FUEL" class="qs-icon" /></span>
                  <span class="qs-flow-arrow">▶</span>
                  <span class="qs-flow-icon qs-flow-power"><img src="img/ui/icons/icon_power.png" alt="POWER" class="qs-icon" /></span>
                  <span class="qs-flow-plus">+</span>
                  <span class="qs-flow-icon qs-flow-heat"><img src="img/ui/icons/icon_heat.png" alt="HEAT" class="qs-icon" /></span>
                </div>
                <div class="qs-flow-caption">Generates Power & Heat</div>
              </div>
            </div>
          </div>
          <div class="qs-section qs-accordion">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">2. MANUAL OVERRIDE</div>
            <div class="qs-accordion-body">
              <div class="qs-action-cards">
                <div class="qs-action-row qs-action-depressible">
                  <span class="qs-action-icon qs-power"><img src="img/ui/icons/icon_power.png" alt="" class="qs-icon" /></span>
                  <span class="qs-action-arrow">▶</span>
                  <span class="qs-action-result">SELL ($)</span>
                </div>
                <div class="qs-action-row qs-action-depressible">
                  <span class="qs-action-icon qs-heat"><img src="img/ui/icons/icon_heat.png" alt="" class="qs-icon" /></span>
                  <span class="qs-action-arrow">▶</span>
                  <span class="qs-action-result">VENT HEAT</span>
                </div>
              </div>
            </div>
          </div>
          <div class="qs-warning">Excess Heat causes Critical Failure.</div>
        </div>
        <footer class="qs-footer">
          <button type="button" id="quick-start-close" class="qs-btn-primary" @click=${() => onClose?.()}>INITIATE REACTOR</button>
          <button type="button" id="quick-start-more-details" class="qs-btn-ghost" @click=${() => onMoreDetails?.()}>READ FULL MANUAL</button>
        </footer>
      </div>
      <div id="quick-start-page-2" class=${p2}>
        <div class="modal-swipe-handle" aria-hidden="true"></div>
        <div class="quick-start-header">
          <span>OPERATOR_MANUAL</span>
          <span class="quick-start-version">v25.07</span>
        </div>
        <div class="bios-content">
          <div class="qs-section qs-accordion qs-accordion-expanded">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">[ FIRST STEPS ]</div>
            <div class="quick-start-list qs-accordion-body">
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Start with $10 - buy a <img src="img/parts/cells/cell_1_1.png" class="objective-part-icon" alt="Uranium Cell" title="Uranium Cell" />URANIUM CELL</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Open Parts panel to find components</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Cells: Single, Dual, Quad configs</span></div>
            </div>
          </div>
          <div class="qs-section qs-accordion">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">[ POWER SYSTEM ]</div>
            <div class="quick-start-list qs-accordion-body">
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_power.png" class="objective-part-icon" alt="POWER" title="POWER" /><span class="qs-amber">POWER</span>: Generated by cells</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/capacitors/capacitor_1.png" class="objective-part-icon" alt="Capacitors" title="Capacitors" />CAPACITORS increase storage</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>Sell power before capacity fills!</span></div>
            </div>
          </div>
          <div class="qs-section qs-accordion">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">[ HEAT SYSTEM ]</div>
            <div class="quick-start-list qs-accordion-body">
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/ui/icons/icon_heat.png" class="objective-part-icon" alt="HEAT" title="HEAT" /><span class="qs-orange">HEAT</span>: Also generated by cells</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/platings/plating_1.png" class="objective-part-icon" alt="Reactor Plating" title="Reactor Plating" />Plating: Max Heat Up</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span>200% heat = MELTDOWN!</span></div>
            </div>
          </div>
          <div class="qs-section qs-accordion">
            <div class="qs-section-head qs-accordion-head" role="button" tabindex="0">[ HEAT MANAGEMENT ]</div>
            <div class="quick-start-list qs-accordion-body">
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/vents/vent_1.png" class="objective-part-icon" alt="Heat Vent" title="Heat Vent" />VENTS: Remove heat from components</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/exchangers/exchanger_1.png" class="objective-part-icon" alt="Heat Exchanger" title="Heat Exchanger" />EXCHANGERS: Balance heat between parts</span></div>
              <div class="quick-start-line"><span class="quick-start-line-prompt">></span><span><img src="img/parts/coolants/coolant_cell_1.png" class="objective-part-icon" alt="Coolant Cell" title="Coolant Cell" />COOLANT CELLS: Passive heat sinks</span></div>
            </div>
          </div>
        </div>
        <footer class="qs-footer">
          <button type="button" id="quick-start-back" class="qs-btn-ghost" @click=${() => onBack?.()}>BACK</button>
          <button type="button" id="quick-start-close-2" class="qs-btn-primary" @click=${() => onClose?.()}>INITIATE REACTOR</button>
        </footer>
      </div>
    </div>
  `;
}

export function affordabilityBannerTemplate({
  hidden,
  message,
}) {
  return html`
    <div class="affordability-banner ${hidden ? "hidden" : ""}">
      <article>${message}</article>
    </div>
  `;
}

export function soundWarningValueTemplate({
  value,
}) {
  return html`${value}%`;
}

export function engineStatusIndicatorTemplate({
  statusClass,
}) {
  return html`<span id="engine_status_indicator" class=${statusClass}></span>`;
}

export function navIndicatorTemplate({
  visible,
}) {
  return html`<span class="nav-indicator" style="display: ${visible ? "block" : "none"}"></span>`;
}

export function upgradeCostTextTemplate({
  value,
}) {
  return html`${value}`;
}

export function sectionCountTextTemplate({
  researched,
  total,
}) {
  return html` ${researched}/${total}`;
}

export function plainTextTemplate({
  text,
}) {
  return html`${text}`;
}

export function quickSelectSlotTemplate({
  slotClass,
  index,
  ariaLabel,
  hasIcon,
  iconStyle,
  hasPart,
  costText,
}) {
  return html`
    <button type="button" class=${slotClass} data-index=${index} aria-label=${ariaLabel}>
      ${hasIcon ? html`<div class="quick-select-icon" style=${iconStyle}></div>` : ""}
      ${hasPart ? html`<div class="quick-select-cost">${costText}</div>` : ""}
    </button>
  `;
}

export function decompressionSavedToastTemplate() {
  return html`
    <div class="decompression-saved-toast__panel" id="decompression_inner">
      <div class="decompression-saved-toast__tag">STATUS // VENT BLOWDOWN</div>
      <div class="decompression-saved-toast__body">Explosive decompression saved the reactor!</div>
    </div>
  `;
}

