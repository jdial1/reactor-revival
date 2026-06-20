import { html } from "lit-html";
import {
  privacyPolicyPageContainerTemplate,
  termsOfServicePageContainerTemplate,
} from "./legalPageTemplates.js";

export function reactorSectionTemplate() {
  return html`
<section id="reactor_section" class="page">
  <div id="reactor_background"></div>
  <div id="reactor_copy_paste_btns">
    <button id="reactor_copy_paste_toggle" class="expand-toggle" title="Expand/Collapse" tabindex="0" aria-label="Expand/Collapse Copy Paste Controls">
      <span class="expand-icon">&lt;</span>
      <span class="collapse-icon">&gt;</span>
    </button>
    <div class="reactor_copy_paste_buttons">
      <button id="reactor_deselect_btn" title="Deselect Selected Part" tabindex="0" aria-label="Deselect Selected Part">
        <img src="img/ui/icons/icon_deselect.svg" alt="Deselect" />
      </button>
      <button id="reactor_dropper_btn" title="Pick Part From Reactor" tabindex="0" aria-label="Pick Part From Reactor">
        <img src="img/ui/icons/icon_dropper.svg" alt="Pick" />
      </button>
      <button id="reactor_copy_btn" title="Copy Reactor Layout" tabindex="0" aria-label="Copy Reactor Layout">
        <img src="img/ui/icons/icon_copy.svg" alt="Copy" />
      </button>
      <button id="reactor_paste_btn" title="Paste Reactor Layout" tabindex="0" aria-label="Paste Reactor Layout">
        <img src="img/ui/icons/icon_paste.svg" alt="Paste" />
      </button>
      <button id="reactor_my_layouts_btn" title="My Layouts" tabindex="0" aria-label="My Layouts">
        <span class="emoji-icon">&#128193;</span>
      </button>
      <button id="reactor_blueprint_toggle" type="button" class="pixel-btn reactor-toolbar-btn" title="Blueprint planner" tabindex="0" aria-label="Toggle blueprint planner">Plan</button>
      <button id="reactor_sell_all_btn" title="Sell All Parts" tabindex="0" aria-label="Sell All Parts">
        <img src="img/ui/icons/icon_cash_outline.svg" alt="Sell" />
      </button>
    </div>
    <div id="blueprint_planner_hud" class="blueprint-planner-hud" aria-live="polite">
      <span id="blueprint_planner_power" class="blueprint-planner-stat"></span>
      <span id="blueprint_planner_net_heat" class="blueprint-planner-stat"></span>
      <button type="button" id="blueprint_planner_apply" class="pixel-btn">Apply</button>
      <button type="button" id="blueprint_planner_discard" class="pixel-btn">Clear</button>
    </div>
  </div>
  <div id="pause_banner" class="container">
    <article>PAUSED</article>
    <button id="unpause_btn" class="resume-btn" type="button" title="Resume" aria-label="Resume game">Resume</button>
  </div>
  <div id="meltdown_banner" class="container hidden">
    <article>MELTDOWN</article>
    <button id="reset_reactor_btn" class="reset-btn">Reset Reactor</button>
  </div>
  <div id="reactor_wrapper">
    <div id="reactor"></div>
    <div id="mobile_top_bar" aria-hidden="true"></div>
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
  <div id="upgrades_content_wrapper">
    <article>
      <h2 data-section-name="Cell Upgrades">Cell Upgrades</h2>
      <div id="cell_power_upgrades" class="upgrade-group"></div>
      <div id="cell_tick_upgrades" class="upgrade-group"></div>
      <div id="cell_perpetual_upgrades" class="upgrade-group"></div>
    </article>
    <article>
      <h2 data-section-name="Cooling Upgrades">Cooling Upgrades</h2>
      <div id="vent_upgrades" class="upgrade-group"></div>
      <div id="exchanger_upgrades" class="upgrade-group"></div>
    </article>
    <article>
      <h2 data-section-name="General Upgrades">General Upgrades</h2>
      <div id="other_upgrades" class="upgrade-group"></div>
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
  <div id="experimental_upgrades_content_wrapper">
    <article id="exotic_particles_display"></article>
    <article id="reboot_section" class="research-collapsible section-collapsed">
      <h2 class="research-section-header" role="button" tabindex="0" aria-expanded="false">Prestige</h2>
      <div class="research-section-body">
        <p class="explanitory">Refund resets everything including EP. Prestige keeps Total EP and Research and grants a money multiplier.</p>
        <div class="research-buttons-container">
          <div class="refund-safety-cover-wrap">
            <button type="button" class="refund-safety-cover" id="refund_safety_cover" aria-label="Lift safety cover to enable full refund"></button>
            <button id="reboot_btn" class="pixel-btn nav-btn refund-danger-btn" type="button" title="Full Refund: Reset everything including EP">Refund</button>
          </div>
          <button id="refund_btn" class="pixel-btn nav-btn" type="button" title="Prestige: Keep EP and Research">Prestige</button>
        </div>
      </div>
    </article>
    <article>
      <h2 data-section-name="Laboratory">Laboratory</h2>
      <div id="experimental_laboratory" class="upgrade-group"></div>
    </article>
    <article>
      <h2 data-section-name="Global Boosts">Global Boosts</h2>
      <div id="experimental_boost" class="upgrade-group"></div>
    </article>
    <article>
      <h2>Experimental Parts & Cells</h2>
      <div id="experimental_parts" class="upgrade-group"></div>
      <div id="experimental_cells" class="upgrade-group"></div>
      <div id="experimental_cells_boost" class="upgrade-group"></div>
    </article>
    <article>
      <h2 data-section-name="Particle Accelerators">Particle Accelerators</h2>
      <div id="experimental_particle_accelerators" class="upgrade-group"></div>
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
  <div class="about-content pixel-panel is-inset">
    <h2>About Reactor Revival</h2>
    <div id="basic_overview_section" class="about-section"></div>
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
    <div class="about-section">
      <h3>Version</h3>
      <p>Current Version: <span id="about_version"></span></p>
    </div>
    <div class="about-section">
      <h3>Credits</h3>
      <p>Created by <a href="https://github.com/jdial1" target="_blank" rel="noopener noreferrer">Justin Dial</a></p>
      <p class="credits-list">
        Special thanks to:
        <ul>
          <li><a href="https://forum.industrial-craft.net/thread/2147-new-reactor-planner-made-by-talonius/" target="_blank" rel="noopener noreferrer">Talonius</a> - IC2 Reactor Planner</li>
          <li><a href="https://github.com/MauveCloud/Ic2ExpReactorPlanner" target="_blank" rel="noopener noreferrer">MauveCloud</a> - IC2 Experimental Reactor Planner</li>
          <li><a href="https://www.kongregate.com/games/Cael/reactor-incremental" target="_blank" rel="noopener noreferrer">Cael & Mephyst</a> - Reactor Incremental</li>
          <li><a href="https://github.com/cwmonkey/reactor-knockoff" target="_blank" rel="noopener noreferrer">cwmonkey</a> - Reactor Knockoff</li>
        </ul>
      </p>
    </div>
    <div class="about-section">
      <h3>Contact</h3>
      <p>
        For feedback or issues, please visit the
        <a href="https://github.com/jdial1/reactor-revival" target="_blank" rel="noopener noreferrer">GitHub</a>.
      </p>
    </div>
    <div class="about-section">
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

export function leaderboardSectionTemplate() {
  return html`
<section id="leaderboard_section" class="page">
  <div class="pixel-panel is-inset">
    <header class="leaderboard-header">
      <h2>Reactor Records</h2>
    </header>
    <div class="leaderboard-controls">
      <button class="pixel-btn leaderboard-sort active" data-sort="power" title="Top Power">
        <img src="img/ui/icons/icon_power.png" alt="Power" class="icon-inline" />
      </button>
      <button class="pixel-btn leaderboard-sort" data-sort="heat" title="Top Heat">
        <img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon-inline" />
      </button>
      <button class="pixel-btn leaderboard-sort" data-sort="money" title="Top Money">
        <img src="img/ui/icons/icon_cash.png" alt="Money" class="icon-inline" />
      </button>
    </div>
    <div class="leaderboard-content">
      <table class="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Date</th>
            <th class="leaderboard-col-power">Power</th>
            <th class="leaderboard-col-heat">Heat</th>
            <th class="leaderboard-col-money">Money</th>
            <th class="leaderboard-col-time" style="display: none;">Time</th>
            <th>Layout</th>
          </tr>
        </thead>
        <tbody id="leaderboard_rows">
          <tr><td colspan="7" style="text-align: center;">Loading records...</td></tr>
        </tbody>
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
