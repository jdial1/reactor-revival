import { html } from "lit-html";

export function gameShellTemplate() {
  return html`
<nav id="main_top_nav" class="nav-bar-row">
  <ul class="nav-group-left">
    <li>
      <button data-page="reactor_section" class="active">Reactor</button>
    </li>
    <li>
      <button data-page="upgrades_section">Upgrades</button>
    </li>
    <li>
      <button data-page="experimental_upgrades_section">Research</button>
    </li>
    <li>
      <button data-page="leaderboard_section" title="Leaderboard" aria-label="Leaderboard">🏆</button>
    </li>
  </ul>
  <ul id="reactor_stats" class="desktop-only"></ul>
  <ul id="engine_status" class="desktop-only">
    <li>
      <strong title="Tick Rate">
        <img src="img/ui/icons/icon_time.png" alt="TPS" class="icon-inline" />
        <span id="tps_display">0</span>
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
  <aside id="parts_section" class="collapsed">
    <div class="parts_sheet_handle" id="parts_sheet_handle"></div>
    <div id="parts_panel_reactive_root"></div>
    <nav id="controls_nav">
      <div id="controls_nav_root"></div>
    </nav>
    <button id="parts_close_btn" class="pixel-btn contrast parts-close-btn" type="button">Close</button>
  </aside>
  <div id="main_content_wrapper">
    <div id="objectives_toast_root"></div>
    <div id="page_content_area"></div>
    <div id="tooltip" class="hidden">
      <div id="tooltip_data"></div>
      <button id="tooltip_close_btn" title="Close" aria-label="Close tooltip">×</button>
    </div>
  </div>
</main>
<div id="reactor_copy_paste_modal" class="hidden">
  <div class="modal-content">
    <div class="modal-header">
      <h3 id="reactor_copy_paste_modal_title">Reactor Layout</h3>
      <button id="reactor_copy_paste_close_btn" title="Close" aria-label="Close Modal">×</button>
    </div>
    <textarea id="reactor_copy_paste_text" placeholder="Paste reactor layout data here..."></textarea>
    <div id="reactor_copy_paste_preview_wrap" class="hidden">
      <div id="reactor_copy_paste_preview_label">Preview</div>
      <canvas id="reactor_copy_paste_preview"></canvas>
    </div>
    <div id="reactor_copy_paste_cost"></div>
    <div class="modal-actions">
      <button id="reactor_copy_paste_confirm_btn" class="hidden">Action</button>
      <button id="reactor_copy_paste_partial_btn" class="hidden">Paste what I can afford</button>
    </div>
  </div>
</div>
<div id="build_above_deck_row" class="build-above-deck-row">
  <div class="quick-select-slots" id="quick_select_slots_container" aria-label="Recent parts">
    <div id="quick_select_slots_root"></div>
    <button id="control_deck_build_fab" class="control-deck-fab" type="button" aria-label="Build Parts" title="Build Parts">
      <span class="control-deck-fab-icon" aria-hidden="true">…</span>
    </button>
  </div>
</div>
<footer id="reactor_control_deck" class="reactor-control-deck">
  <div class="control-deck-inner">
    <div id="control_deck_root" class="control-deck-grid"></div>
  </div>
</footer>
<footer id="info_bar" class="info-bar-legacy">
  <div id="info_bar_root"></div>
</footer>
<footer id="bottom_nav">
  <nav>
    <ul>
      <li>
        <button data-page="reactor_section" class="secondary active">CORE</button>
      </li>
      <li>
        <button data-page="upgrades_section" class="secondary">MODS</button>
      </li>
      <li>
        <button data-page="experimental_upgrades_section" class="secondary">TECH</button>
      </li>
      <li>
        <button id="menu_tab_btn" class="secondary" aria-label="System Menu">SYS</button>
      </li>
    </ul>
  </nav>
</footer>
  `;
}
