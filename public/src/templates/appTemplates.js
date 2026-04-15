import { html } from "lit-html";
import { classMap, styleMap, repeat, when } from "../utils.js";

export function renderSplashTemplate(isMuted, onMuteClick, onHideMenuClick) {
  return html`
    <div id="splash-container">
      <main id="splash-screen">
        <div class="splash-loading">
          <div class="splash-spinner hidden splash-element-hidden"></div>
          <p id="splash-status" class="hidden splash-element-hidden">Ready!</p>
        </div>
        <div class="splash-vhold-mask" aria-hidden="true"></div>
        <div class="splash-menu-panel splash-control-deck">
          <div class="splash-screw splash-screw-tl" aria-hidden="true"></div>
          <div class="splash-screw splash-screw-tr" aria-hidden="true"></div>
          <div class="splash-screw splash-screw-bl" aria-hidden="true"></div>
          <div class="splash-screw splash-screw-br" aria-hidden="true"></div>
          <div class="splash-menu-inner">
          <header class="splash-panel-header">
            <h1 class="splash-title">REACTOR REVIVAL</h1>
            <div class="splash-panel-header-controls">
              <button
                type="button"
                class="splash-mute-btn"
                title=${isMuted ? "Unmute" : "Mute"}
                aria-label=${isMuted ? "Unmute" : "Mute"}
                @click=${onMuteClick}
              >
                <span class="splash-mute-icon" aria-hidden="true"></span>
                <span class="splash-mute-label">AUDIO RELAY</span>
              </button>
              <button
                type="button"
                class="splash-menu-hide-btn"
                title="Hide menu"
                aria-label="Hide menu"
                @click=${onHideMenuClick}
              >
                −
              </button>
            </div>
          </header>
          <div id="splash-start-options" class="splash-start-options"></div>
          <footer class="splash-panel-footer">
            <div class="splash-module splash-module-extcomm">
              <div class="splash-module-corner-label">EXT_COMM_LINK</div>
              <div id="splash-auth-in-footer" class="splash-auth-in-footer"></div>
              <div class="splash-module-stats">
                <span id="splash-version-text" class="splash-version-text"></span>
                <span id="splash-user-count" class="splash-user-count-inline">
                  <span id="user-count-text">-</span>
                </span>
              </div>
            </div>
          </footer>
          </div>
        </div>
      </main>
    </div>
  `;
}

export function doctrineCardTemplate(tree, selectedDoctrine, onSelect) {
  const isSelected = tree.id === selectedDoctrine;
  const classes = classMap({
    "doctrine-card": true,
    selected: isSelected,
  });
  const styles = styleMap({
    ...(tree.color ? { "--doctrine-color": tree.color } : {}),
  });
  return html`
    <button type="button" class=${classes} style=${styles} role="option" aria-selected=${isSelected ? "true" : "false"} data-tree-id=${tree.id} data-doctrine=${tree.id} @click=${() => onSelect(tree.id)}>
      <span class="doctrine-led" aria-hidden="true"></span>
      <img class="doctrine-card-icon" src="img/ui/icons/${tree.id}.png" alt="" />
      <div class="doctrine-card-text">
        <span class="doctrine-card-title">${tree.shortTitle ?? tree.title}</span>
        <span class="doctrine-card-subtitle">${tree.subtitle}</span>
      </div>
    </button>
  `;
}

export function difficultyCardTemplate(diffKey, diffLabel, diffDesc, selectedDifficulty, onSelect) {
  const isSelected = diffKey === selectedDifficulty;
  const classes = classMap({
    "difficulty-card": true,
    selected: isSelected,
  });
  return html`
    <button type="button" class=${classes} data-difficulty=${diffKey} @click=${() => onSelect(diffKey)}>
      <span class="difficulty-led" aria-hidden="true"></span>
      <img class="difficulty-indicator" src="img/ui/icons/${diffKey}.png" alt="" />
      <div class="difficulty-card-info">
        <span class="difficulty-name">${diffLabel}</span>
        <span class="difficulty-desc">${diffDesc}</span>
      </div>
    </button>
  `;
}

export function gameSetupTemplate(treeList, selectedDoctrine, selectedDifficulty, onDoctrineSelect, onDifficultySelect, onBack, onStart) {
  const doctrinePickRequired = false;
  const canStart = selectedDifficulty !== null;
  return html`
    <div class="bios-screen game-setup-selection">
      <h1 class="game-setup-header">NEW GAME</h1>
      <div class="bios-content">
        <section class="setup-section setup-difficulty">
          <div class="bios-title-vfd"><h2 class="bios-title">[ SELECT DIFFICULTY ]</h2></div>
          <div class="difficulty-cards" role="radiogroup" aria-label="Select difficulty">
            ${difficultyCardTemplate("easy", "EASY", "Forgiving heat margins", selectedDifficulty, onDifficultySelect)}
            ${difficultyCardTemplate("medium", "MEDIUM", "Balanced challenge", selectedDifficulty, onDifficultySelect)}
            ${difficultyCardTemplate("hard", "HARD", "Tight margins, fast ticks", selectedDifficulty, onDifficultySelect)}
          </div>
        </section>
      </div>
      <footer class="bios-footer">
        <button type="button" class="bios-btn setup-back-btn" @click=${onBack}>[ BACK ]</button>
        <button type="button" class="bios-btn setup-start-btn" ?disabled=${!canStart} @click=${onStart}>[ START ]</button>
      </footer>
    </div>
  `;
}

export function updateToastTemplate(onRefresh, onClose) {
  return html`
    <div class="update-toast">
      <div class="update-toast-content">
        <div class="update-toast-message">
          <span class="update-toast-text">New content available, click to reload.</span>
        </div>
        <button id="refresh-button" class="update-toast-button" @click=${onRefresh}>Reload</button>
        <button class="update-toast-close" @click=${onClose}>×</button>
      </div>
    </div>
  `;
}

export function fallbackStartTemplate(onStart) {
  return html`
    <div style="position: fixed;inset: 0;background: #1a1a1a;display: flex;align-items: center;justify-content: center;z-index: 99999;flex-direction: column;color: white;font-family: monospace;">
      <h1 style="color: #e74c3c;">Splash UI Failed to Load</h1>
      <p style="margin-bottom: 20px;color: #ccc;">You can still start the game in fallback mode.</p>
      <button class="pixel-btn btn-start" @click=${onStart} style="padding: 10px 20px;font-size: 16px;">START GAME</button>
    </div>
  `;
}

export function criticalErrorTemplate(errorMessage, errorStack, onReload) {
  return html`
    <style>
 .critical-error-overlay { position: fixed; z-index: 99999; inset: 0; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 95%); }
 .error-stack { max-height: 200px; overflow: auto; text-align: left; padding: 10px; background: #222; }
    </style>
    <div class="critical-error-content pixel-panel" style="max-width: 600px; text-align: center;">
      <h1 class="critical-error-title" style="color: #f44;">REACTOR FAILED TO START</h1>
      <div class="critical-error-message" style="margin: 20px 0;">
        <p class="error-text" style="color: #fcc;">${errorMessage}</p>
        ${when(
          !!errorStack,
          () => html`<details class="error-details"><summary style="cursor: pointer;color: #aaa;">Error Details</summary><pre class="error-stack">${errorStack}</pre></details>`
        )}
      </div>
      <button id="critical-error-reload" class="pixel-btn btn-start" @click=${onReload}>Reload Page</button>
    </div>
  `;
}
