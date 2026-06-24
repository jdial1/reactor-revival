import { html } from "lit-html";
import { classMap, when } from "../dom/lit.js";
import { dispatchToggleIntent } from "../components/ui-intents.js";
import {
  privacyPolicyPageContainerTemplate,
  termsOfServicePageContainerTemplate,
} from "./legalPageTemplates.js";

function upgradeHubHeaderBlock({ sectionName, blurb, expanded = false }) {
  return html`
    <header class="upgrade-section-header-block">
      <div class="upgrade-section-header-row">
        <h2 class="upgrade-section-header" data-section-name=${sectionName} role="button" tabindex="0" aria-expanded=${expanded ? "true" : "false"}>${sectionName}</h2>
        <div class="section-hub-meta-host"></div>
      </div>
      <p class="section-hub-blurb">${blurb}</p>
    </header>
  `;
}

function researchSectionHeaderBlock({ title, blurb, expanded = false }) {
  return html`
    <header class="upgrade-section-header-block research-section-header-block">
      <h2 class="research-section-header" role="button" tabindex="0" aria-expanded=${expanded ? "true" : "false"}>${title}</h2>
      <p class="section-hub-blurb">${blurb}</p>
    </header>
  `;
}

export function reactorSectionTemplate() {
  return html`
<section id="reactor_section" class="page">
  <div id="reactor_background"></div>
  <div id="reactor_copy_paste_btns">
    <button id="reactor_copy_paste_toggle" class="reactor-toolbar-labeled-btn expand-toggle ui-bevel" title="Open reactor tools" tabindex="0" aria-label="Open reactor tools">
      <span class="reactor-toolbar-btn-icon" aria-hidden="true">
        <span class="expand-icon">&lt;</span>
        <span class="collapse-icon">&gt;</span>
      </span>
      <span class="reactor-toolbar-btn-label toolbar-label-expand">OPEN</span>
      <span class="reactor-toolbar-btn-label toolbar-label-collapse">HIDE</span>
    </button>
    <div class="reactor_copy_paste_buttons">
      <button id="reactor_deselect_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Clear selected part" tabindex="0" aria-label="Clear selected part">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <img src="img/ui/icons/icon_deselect.svg" alt="" />
        </span>
        <span class="reactor-toolbar-btn-label">CLEAR</span>
      </button>
      <button id="reactor_dropper_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Pick part from reactor" tabindex="0" aria-label="Pick part from reactor">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <img src="img/ui/icons/icon_dropper.svg" alt="" />
        </span>
        <span class="reactor-toolbar-btn-label">PICK</span>
      </button>
      <button id="reactor_copy_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Copy reactor layout" tabindex="0" aria-label="Copy reactor layout">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <img src="img/ui/icons/icon_copy.svg" alt="" />
        </span>
        <span class="reactor-toolbar-btn-label">COPY</span>
      </button>
      <button id="reactor_paste_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Paste reactor layout" tabindex="0" aria-label="Paste reactor layout">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <img src="img/ui/icons/icon_paste.svg" alt="" />
        </span>
        <span class="reactor-toolbar-btn-label">PASTE</span>
      </button>
      <button id="reactor_compare_layouts_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Compare two layouts" tabindex="0" aria-label="Compare two layouts">
        <span class="reactor-toolbar-btn-label">A/B</span>
      </button>
      <button id="reactor_my_layouts_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Saved layouts" tabindex="0" aria-label="Saved layouts">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <span class="emoji-icon">&#128193;</span>
        </span>
        <span class="reactor-toolbar-btn-label">SAVES</span>
      </button>
      <button id="reactor_blueprint_toggle" type="button" class="reactor-toolbar-labeled-btn pixel-btn reactor-toolbar-btn reactor-plan-toggle" title="Blueprint planner" tabindex="0" aria-label="Toggle blueprint planner" aria-pressed="false">
        <span class="reactor-toolbar-btn-icon reactor-plan-icon" aria-hidden="true">
          <svg class="reactor-toolbar-svg-icon" viewBox="0 0 16 16" width="16" height="16" focusable="false">
            <rect x="1" y="1" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <rect x="9" y="1" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <rect x="1" y="9" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5" />
            <rect x="9" y="9" width="6" height="6" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        </span>
        <span class="reactor-plan-state reactor-plan-state--live reactor-toolbar-btn-label">LIVE</span>
        <span class="reactor-plan-state reactor-plan-state--active reactor-toolbar-btn-label">PLAN</span>
      </button>
      <button id="reactor_sell_all_btn" class="reactor-toolbar-labeled-btn ui-bevel" title="Sell all parts" tabindex="0" aria-label="Sell all parts">
        <span class="reactor-toolbar-btn-icon" aria-hidden="true">
          <img src="img/ui/icons/icon_cash_outline.svg" alt="" />
        </span>
        <span class="reactor-toolbar-btn-label">SELL</span>
      </button>
    </div>
    <div id="blueprint_planner_hud" class="blueprint-planner-hud" aria-live="polite">
      <div class="blueprint-planner-hud-stats">
        <span id="blueprint_planner_power" class="blueprint-planner-stat"></span>
        <span id="blueprint_planner_net_heat" class="blueprint-planner-stat"></span>
        <span id="blueprint_planner_ep" class="blueprint-planner-stat"></span>
        <span id="blueprint_planner_stability" class="blueprint-planner-stat"></span>
      </div>
      <div class="blueprint-planner-hud-actions">
        <button type="button" id="blueprint_planner_apply" class="reactor-toolbar-labeled-btn ui-bevel" title="Apply blueprint plan" aria-label="Apply blueprint plan">
          <span class="reactor-toolbar-btn-icon blueprint-planner-apply-icon" aria-hidden="true">
            <svg class="reactor-toolbar-svg-icon" viewBox="0 0 16 16" width="16" height="16" focusable="false">
              <path d="M3 8 L7 12 L13 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" />
            </svg>
          </span>
          <span class="reactor-toolbar-btn-label">APPLY</span>
        </button>
        <button type="button" id="blueprint_planner_partial" class="reactor-toolbar-labeled-btn ui-bevel" title="Build what you can afford" aria-label="Build what you can afford">
          <span class="reactor-toolbar-btn-label">PARTIAL</span>
        </button>
        <button type="button" id="blueprint_planner_export" class="reactor-toolbar-labeled-btn ui-bevel" title="Export tick analytics" aria-label="Export tick analytics">
          <span class="reactor-toolbar-btn-label">EXPORT</span>
        </button>
        <button type="button" id="blueprint_planner_discard" class="reactor-toolbar-labeled-btn ui-bevel" title="Clear blueprint plan" aria-label="Clear blueprint plan">
          <span class="reactor-toolbar-btn-icon" aria-hidden="true">
            <img src="img/ui/icons/icon_deselect.svg" alt="" />
          </span>
          <span class="reactor-toolbar-btn-label">CLEAR</span>
        </button>
      </div>
    </div>
  </div>
  <div id="reactor_status_banners_root"></div>
  <div id="failure_warning_banner" class="container hidden" role="status" aria-live="polite">
    <article id="failure_warning_message"></article>
  </div>
  <div id="meltdown_vignette" aria-hidden="true"></div>
  <div id="meltdown_strobe" aria-hidden="true"></div>
  <div id="reactor_wrapper">
    <div id="reactor"></div>
    <div id="mobile_top_bar" aria-hidden="true">
      <ul id="reactor_stats_mobile" class="mobile-only ep-status-panel"></ul>
    </div>
  </div>
</section>
  `;
}

export function upgradesSectionTemplate() {
  return html`
<section id="upgrades_section" class="page">
  <div id="upgrades_no_affordable_banner" class="affordability-banner hidden">
    <article>No affordable upgrades available</article>
  </div>
  <div id="upgrades_content_wrapper" data-hub-accordion="true">
    <article class="upgrade-section-hub upgrade-hub-collapsible">
      ${upgradeHubHeaderBlock({ sectionName: "Cell Upgrades", blurb: "Boost cell output, lifespan, and perpetual modes.", expanded: true })}
      <div class="upgrade-section-body">
        <div id="cell_power_upgrades" class="upgrade-group"></div>
        <div id="cell_tick_upgrades" class="upgrade-group"></div>
        <div id="cell_perpetual_upgrades" class="upgrade-group"></div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible section-collapsed">
      ${upgradeHubHeaderBlock({ sectionName: "Cooling Upgrades", blurb: "Improve vents, exchangers, and heat routing." })}
      <div class="upgrade-section-body">
        <div id="vent_upgrades" class="upgrade-group"></div>
        <div id="exchanger_upgrades" class="upgrade-group"></div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible section-collapsed">
      ${upgradeHubHeaderBlock({ sectionName: "General Upgrades", blurb: "Reactor-wide efficiency and quality-of-life upgrades." })}
      <div class="upgrade-section-body">
        <div id="other_upgrades" class="upgrade-group"></div>
      </div>
    </article>
  </div>
</section>
  `;
}

export function researchSectionTemplate() {
  return html`
<section id="experimental_upgrades_section" class="page">
  <article id="doctrine_tree_viewer" class="doctrine-tree-viewer research-collapsible section-collapsed hidden">
    <h2 class="research-section-header" role="button" tabindex="0" aria-expanded="false">Doctrine &amp; Tech Tree</h2>
    <div class="research-section-body">
      <div id="doctrine_tree_viewer_content"></div>
    </div>
  </article>
  <div id="research_no_affordable_banner" class="affordability-banner hidden">
    <article>No affordable research available</article>
  </div>
  <div id="experimental_upgrades_content_wrapper" data-hub-accordion="true">
    <article id="exotic_particles_display" class="ep-status-panel"></article>
    <p class="research-ep-hint" id="research_ep_hint">Spend EP in the hubs below ↓</p>
    <article id="reboot_section" class="research-collapsible section-collapsed">
      ${researchSectionHeaderBlock({ title: "Prestige", blurb: "Refund wipes progress; Prestige keeps EP and research for a money multiplier." })}
      <div class="research-section-body">
        <div class="research-buttons-container">
          <div class="refund-safety-cover-wrap">
            <button type="button" class="refund-safety-cover" id="refund_safety_cover" aria-label="Lift safety cover to enable full refund"></button>
            <button id="reboot_btn" class="pixel-btn nav-btn refund-danger-btn" type="button" title="Full Refund: Reset everything including EP">Refund</button>
          </div>
          <button id="refund_btn" class="pixel-btn nav-btn" type="button" title="Prestige: Keep EP and Research">Prestige</button>
        </div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible">
      ${upgradeHubHeaderBlock({ sectionName: "Laboratory", blurb: "Foundational exotic research and lab systems.", expanded: true })}
      <div class="upgrade-section-body">
        <div id="experimental_laboratory" class="upgrade-group"></div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible section-collapsed">
      ${upgradeHubHeaderBlock({ sectionName: "Global Boosts", blurb: "Cross-tree multipliers and passive EP gains." })}
      <div class="upgrade-section-body">
        <div id="experimental_boost" class="upgrade-group"></div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible section-collapsed">
      ${upgradeHubHeaderBlock({ sectionName: "Experimental Parts & Cells", blurb: "Advanced components and experimental cell lines." })}
      <div class="upgrade-section-body">
        <div id="experimental_parts" class="upgrade-group"></div>
        <div id="experimental_cells" class="upgrade-group"></div>
        <div id="experimental_cells_boost" class="upgrade-group"></div>
      </div>
    </article>
    <article class="upgrade-section-hub upgrade-hub-collapsible section-collapsed">
      ${upgradeHubHeaderBlock({ sectionName: "Particle Accelerators", blurb: "High-tier EP generation and accelerator tuning." })}
      <div class="upgrade-section-body">
        <div id="experimental_particle_accelerators" class="upgrade-group"></div>
      </div>
    </article>
  </div>
</section>
  `;
}

export function soundboardSectionTemplate() {
  return html`
<section id="soundboard_section" class="page soundboard-page">
  <div class="pixel-panel is-inset">
    <header class="soundboard-header">
      <div>
        <h2>Audio Soundboard</h2>
        <p>Trigger any game sound for quick debugging.</p>
      </div>
      <div class="soundboard-actions">
        <label for="sound_warning_intensity">Warning Intensity <span id="sound_warning_value"></span></label>
        <input id="sound_warning_intensity" type="range" min="10" max="100" step="5" value="50" />
        <button class="pixel-btn sound-btn" data-sound="warning">Play Warning</button>
      </div>
    </header>
    <div class="soundboard-groups">
      <article class="soundboard-card">
        <h3>Placement</h3>
        <div class="soundboard-grid">
          <button class="pixel-btn sound-btn" data-sound="placement">Generic</button>
          <button class="pixel-btn sound-btn" data-sound="placement" data-subtype="cell">Cell</button>
          <button class="pixel-btn sound-btn" data-sound="placement" data-subtype="plating">Plating</button>
          <button class="pixel-btn sound-btn" data-sound="placement" data-subtype="vent">Vent</button>
        </div>
      </article>
      <article class="soundboard-card">
        <h3>Actions</h3>
        <div class="soundboard-grid">
          <button class="pixel-btn sound-btn" data-sound="sell">Sell</button>
          <button class="pixel-btn sound-btn" data-sound="upgrade">Upgrade</button>
          <button class="pixel-btn sound-btn" data-sound="click">Click</button>
        </div>
      </article>
      <article class="soundboard-card">
        <h3>Alerts</h3>
        <div class="soundboard-grid">
          <button class="pixel-btn sound-btn" data-sound="warning" data-category="alerts">Warning</button>
          <button class="pixel-btn sound-btn" data-sound="error" data-category="alerts">Error</button>
          <button class="pixel-btn sound-btn" data-sound="geiger" data-category="alerts">Geiger</button>
        </div>
      </article>
      <article class="soundboard-card">
        <h3>System</h3>
        <div class="soundboard-grid">
          <button class="pixel-btn sound-btn" data-sound="click" data-category="system">System Click</button>
          <button class="pixel-btn sound-btn" data-sound="upgrade" data-category="system">System Upgrade</button>
        </div>
      </article>
      <article class="soundboard-card">
        <h3>Events</h3>
        <div class="soundboard-grid">
          <button class="pixel-btn sound-btn" data-sound="explosion">Explosion</button>
        </div>
      </article>
    </div>
    <div class="soundboard-footer">
      <button class="secondary nav-btn" data-page="experimental_upgrades_section">Back to Research</button>
    </div>
  </div>
</section>
  `;
}

export function aboutSectionTemplate() {
  return html`
<section id="about_section" class="page">
  <div class="about-content">
    <h2>About Reactor Revival</h2>
    <div id="basic_overview_section" class="about-section"></div>
    <div id="help_prestige_section" class="about-section"></div>
    <div id="help_offline_section" class="about-section"></div>
    <div id="help_layouts_section" class="about-section"></div>
    <div id="help_parts_section" class="about-section"></div>
    <div id="help_controls_section" class="about-section"></div>
    <div class="about-section">
      <h3>Game</h3>
      <p>
        A reactor simulation game where you manage everything from basic uranium cells to advanced reactor cores. Build your reactor, manage heat, generate power, and unlock upgrades as you progress.
      </p>
    </div>
    <div class="about-section">
      <h3>Features</h3>
      <ul>
        <li>Progressive upgrade system</li>
        <li>Exotic particle collection</li>
        <li>Offline play support</li>
        <li>Fast, responsive interface</li>
        <li>Multiple reactor components</li>
        <li>Heat management mechanics</li>
      </ul>
    </div>
    <p class="about-scroll-hint" id="about_scroll_hint">Scroll for credits, contact &amp; legal ↓ <a href="#about_credits" class="about-credits-jump">Jump to credits</a></p>
    <nav class="about-subnav" aria-label="About sections">
      <a href="#about_credits">Credits</a>
      <a href="#about_contact">Contact</a>
      <a href="#about_legal">Legal</a>
    </nav>
    <div class="about-section">
      <h3>Version</h3>
      <p>Current Version: <button type="button" id="about_version_btn" class="about-version-btn" title="View recent changes"><span id="about_version"></span></button></p>
    </div>
    <div class="about-section" id="about_credits">
      <h3>Credits</h3>
      <p>Created by <a href="https://github.com/jdial1" target="_blank" rel="noopener noreferrer">Justin Dial</a></p>
      <p class="credits-list">Special thanks to:</p>
      <ul class="credits-list">
        <li><a href="https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/" target="_blank" rel="noopener noreferrer">Talonius</a> - IC2 Reactor Planner</li>
        <li><a href="https://github.com/MauveCloud/Ic2ExpReactorPlanner" target="_blank" rel="noopener noreferrer">MauveCloud</a> - IC2 Experimental Reactor Planner</li>
        <li><a href="https://www.kongregate.com/games/Cael/reactor-incremental" target="_blank" rel="noopener noreferrer">Cael & Mephyst</a> - Reactor Incremental</li>
        <li><a href="https://github.com/cwmonkey/reactor-knockoff" target="_blank" rel="noopener noreferrer">cwmonkey</a> - Reactor Knockoff</li>
      </ul>
    </div>
    <div class="about-section" id="about_contact">
      <h3>Contact</h3>
      <p>
        For feedback or issues, please visit the
        <a href="https://github.com/jdial1/reactor-revival" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </div>
    <div class="about-section" id="about_legal">
      <h3>Legal</h3>
      <p>
        Read our
        <a href="privacy-policy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>
        or open it in-game from Settings.
      </p>
    </div>
    <p>This game is a work-in-progress and is subject to change.</p>
    <button id="install_pwa_btn" class="pixel-btn hidden">Install App</button>
  </div>
</section>
  `;
}

export function reactorStatusBannersTemplate({ uiState, ui }) {
  const onResume = () => dispatchToggleIntent(ui?.game, "pause", false, "unpause_btn");
  const onReset = () => { void ui?.resetReactor?.(); };
  return html`
    ${when(uiState?.is_paused, () => html`
      <div id="pause_banner" class="container">
        <article>PAUSED</article>
        <button id="unpause_btn" class="resume-btn ui-bevel" type="button" title="Resume" aria-label="Resume game" @click=${onResume}>Resume</button>
      </div>
    `)}
    ${when(uiState?.is_melting_down, () => html`
      <div id="meltdown_banner" class="container">
        <article id="meltdown_banner_message">MELTDOWN</article>
        <button id="reset_reactor_btn" class="reset-btn" type="button" @click=${onReset}>Reset Reactor</button>
      </div>
    `)}
  `;
}

export function leaderboardControlsTemplate({ uiState, onSortChange }) {
  const sorts = [
    { key: "power", title: "Top Power", icon: "img/ui/icons/icon_power.png", alt: "Power" },
    { key: "heat", title: "Top Heat", icon: "img/ui/icons/icon_heat.png", alt: "Heat" },
    { key: "money", title: "Top Money", icon: "img/ui/icons/icon_cash.png", alt: "Money" },
  ];
  return html`
    <div class="leaderboard-controls">
      ${sorts.map(({ key, title, icon, alt }) => html`
        <button
          class=${classMap({ "pixel-btn": true, "leaderboard-sort": true, active: uiState.leaderboard_sort === key })}
          data-sort=${key}
          title=${title}
          @click=${() => onSortChange(key)}
        >
          <img src=${icon} alt=${alt} class="icon-inline" />
        </button>
      `)}
    </div>
  `;
}

export function leaderboardSectionTemplate() {
  return html`
<section id="leaderboard_section" class="page">
  <div class="pixel-panel is-inset">
    <header class="leaderboard-header">
      <h2>Reactor Records</h2>
      <p class="leaderboard-subtitle" id="leaderboard_subtitle">Sorted by power</p>
    </header>
    <div id="leaderboard_controls_root"></div>
    <div class="leaderboard-content">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th class="leaderboard-col-rank"><span class="leaderboard-col-long">Rank</span><span class="leaderboard-col-short">#</span></th>
            <th class="leaderboard-col-date"><span class="leaderboard-col-long">Date</span><span class="leaderboard-col-short">Dt</span></th>
            <th class="leaderboard-col-power">Power</th>
            <th class="leaderboard-col-heat">Heat</th>
            <th class="leaderboard-col-money">Money</th>
            <th class="leaderboard-col-time" style="display: none;">Time</th>
            <th class="leaderboard-col-layout" title="Layout">Layout</th>
          </tr>
        </thead>
        <tbody id="leaderboard_rows"></tbody>
      </table>
    </div>
  </div>
</section>
  `;
}

export function privacyPolicySectionTemplate() {
  return html`
<section id="privacy_policy_section" class="page">
  ${privacyPolicyPageContainerTemplate(true)}
</section>
  `;
}

export function termsOfServiceSectionTemplate() {
  return html`
<section id="terms_of_service_section" class="page">
  ${termsOfServicePageContainerTemplate(true)}
</section>
  `;
}

export const pageSectionTemplates = {
  reactor_section: reactorSectionTemplate,
  upgrades_section: upgradesSectionTemplate,
  experimental_upgrades_section: researchSectionTemplate,
  soundboard_section: soundboardSectionTemplate,
  about_section: aboutSectionTemplate,
  privacy_policy_section: privacyPolicySectionTemplate,
  terms_of_service_section: termsOfServiceSectionTemplate,
  leaderboard_section: leaderboardSectionTemplate,
};

export function pageLoadErrorTemplate() {
  return html`
<div class="explanitory">
  <h3>Error</h3>
  <p>Could not load page. Please check your connection and try again.</p>
</div>
  `;
}
