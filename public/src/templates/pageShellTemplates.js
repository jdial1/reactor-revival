import { html, nothing } from "lit-html";
import { statusNoticeToastTemplate } from "./uiComponentsTemplates.js";

export function statusNoticeSlotTemplate(activeNotice) {
  if (!activeNotice?.body) return nothing;
  return html`
    <div class="decompression-saved-toast status-notice-toast" role="status">
      ${statusNoticeToastTemplate({ tag: activeNotice.tag, body: activeNotice.body })}
    </div>
  `;
}

export function gameShellTemplate() {
  return html`
<nav id="main_top_nav" class="nav-bar-row">
  <ul class="nav-group-left">
    <li>
      <button data-page="reactor_section" class="active" aria-label="Reactor">Reactor</button>
    </li>
    <li>
      <button data-page="upgrades_section" aria-label="Upgrades">Upgrades</button>
    </li>
    <li>
      <button data-page="experimental_upgrades_section" aria-label="Research">Research</button>
    </li>
    <li>
      <button data-page="leaderboard_section" title="Leaderboard" aria-label="Leaderboard">RANK</button>
    </li>
  </ul>
  <ul id="reactor_stats" class="desktop-only ep-status-panel"></ul>
  <ul id="engine_status" class="desktop-only">
    <li>
      <strong title="Discrete simulation tick: period and tick index">
        <img src="img/ui/icons/icon_time.png" alt="Tick" class="icon-inline" />
        <span id="tps_display">—</span>
      </strong>
    </li>
    <li id="engine_status_indicator_root"></li>
  </ul>
  <ul class="nav-group-right">
    <li>
      <span id="user_account_btn_root"></span>
    </li>
    <li>
      <button id="fullscreen_toggle" title="Toggle Fullscreen" aria-label="Toggle Fullscreen">⛶</button>
    </li>
    <li>
      <button id="settings_btn" title="Settings" aria-label="Settings">⚙️</button>
    </li>
    <li>
      <button id="splash_close_btn" title="Exit to Title" aria-label="Exit to Title">✖</button>
    </li>
  </ul>
</nav>
<div id="mobile_passive_top_bar" class="mobile-passive-top-bar" aria-hidden="true">
  <div id="mobile_passive_root"></div>
</div>
<main id="main">
  <aside id="parts_section">
    <div class="parts_sheet_handle" id="parts_sheet_handle"></div>
    <div id="parts_panel_reactive_root"></div>
    <nav id="controls_nav">
      <div id="controls_nav_root"></div>
    </nav>
    <button id="parts_close_btn" class="pixel-btn contrast parts-close-btn modal-latch-close" type="button" aria-label="Close parts panel"><span class="modal-latch-arm" aria-hidden="true"></span><span class="modal-latch-body"></span></button>
  </aside>
  <div id="main_content_wrapper">
    <div id="status_notice_root"></div>
    <div id="objectives_toast_root"></div>
    <div id="achievement_toast_root"></div>
    <div id="page_content_area"></div>
    <div id="tooltip" class="hidden" aria-hidden="true">
      <div id="tooltip_data"></div>
      <button id="tooltip_close_btn" class="modal-latch-close modal-latch-close--small" type="button" title="Close" aria-label="Close tooltip"><span class="modal-latch-arm" aria-hidden="true"></span><span class="modal-latch-body"></span></button>
    </div>
  </div>
</main>
<div id="layout_compare_modal" class="hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h3>Layout A/B Compare</h3>
      <button id="layout_compare_close_btn" title="Close" aria-label="Close compare modal">×</button>
    </div>
    <label>Layout A</label>
    <textarea id="layout_compare_a" placeholder="Paste layout A (JSON or rr1: share code)"></textarea>
    <label>Layout B</label>
    <textarea id="layout_compare_b" placeholder="Paste layout B (JSON or rr1: share code)"></textarea>
    <div id="layout_compare_results"></div>
    <div class="modal-actions">
      <button id="layout_compare_run_btn" type="button">Compare steady-state</button>
    </div>
  </div>
</div>
<div id="build_above_deck_row" class="build-above-deck-row">
  <div class="macro-toolbar-anchor" id="macro_toolbar_anchor">
    <button id="macro_toolbar_fab" class="control-deck-fab macro-toolbar-fab" type="button" aria-label="Placement macros" title="Placement macros" aria-haspopup="menu" aria-expanded="false" aria-controls="macro_toolbar_popover">
      <span class="control-deck-fab-icon macro-toolbar-fab-icon" id="macro_toolbar_fab_label" aria-hidden="true">1×</span>
    </button>
    <div id="macro_toolbar_popover" class="macro-toolbar-popover hidden" role="menu" aria-label="Placement macros"></div>
  </div>
  <div class="quick-select-slots" id="quick_select_slots_container" aria-label="Recent parts">
    <div id="quick_select_slots_root"></div>
    <button id="control_deck_build_fab" class="control-deck-fab" type="button" aria-label="Build Parts" title="Build Parts">
      <span class="control-deck-fab-icon" aria-hidden="true">+</span>
    </button>
  </div>
</div>
<footer id="reactor_control_deck" class="reactor-control-deck">
  <div class="control-deck-inner">
    <div id="control_deck_root" class="control-deck-grid"></div>
  </div>
</footer>
<footer id="info_bar" class="info-bar-legacy">
  <div id="ui_views_heat_strip_host" class="ui-views-heat-strip-host"></div>
  <div id="ui_views_engine_chip_host" class="ui-views-engine-chip-host"></div>
  <div id="ui_views_mute_host" class="ui-views-mute-host"></div>
  <div id="info_bar_root"></div>
</footer>
<footer id="bottom_nav">
  <nav>
    <ul>
      <li>
        <button data-page="reactor_section" class="secondary active" aria-label="Reactor (Core)">CORE</button>
      </li>
      <li>
        <button data-page="upgrades_section" class="secondary" aria-label="Upgrades (Mods)">MODS</button>
      </li>
      <li>
        <button data-page="experimental_upgrades_section" class="secondary" aria-label="Research (Tech)">TECH</button>
      </li>
      <li>
        <button id="menu_tab_btn" class="secondary" aria-label="System Menu">SYS</button>
      </li>
    </ul>
  </nav>
</footer>
  `;
}
