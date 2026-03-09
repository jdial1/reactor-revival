import { html, render } from "lit-html";
import { classMap, styleMap } from "../utils/litHelpers.js";
import { StorageUtils, StorageUtilsAsync } from "../utils/util.js";
import dataService from "./dataService.js";
import { logger } from "../utils/logger.js";

function ensureGameSetupOverlay() {
  let overlay = document.getElementById("game-setup-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "game-setup-overlay";
    overlay.className = "game-setup-overlay bios-overlay";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function doctrineCardTemplate(tree, selectedDoctrine, onSelect) {
  const isSelected = tree.id === selectedDoctrine;
  const classes = classMap({
    "doctrine-card": true,
    "selected": isSelected
  });
  const styles = styleMap({
    ...(tree.color ? { "--doctrine-color": tree.color } : {})
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

function difficultyCardTemplate(diffKey, diffLabel, diffDesc, selectedDifficulty, onSelect) {
  const isSelected = diffKey === selectedDifficulty;
  const classes = classMap({
    "difficulty-card": true,
    "selected": isSelected
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

function gameSetupTemplate(treeList, selectedDoctrine, selectedDifficulty, onDoctrineSelect, onDifficultySelect, onBack, onStart) {
  const canStart = selectedDoctrine !== null && selectedDifficulty !== null;
  return html`
    <div class="bios-screen game-setup-selection">
      <h1 class="game-setup-header">NEW GAME</h1>
      <div class="bios-content">
        <section class="setup-section setup-doctrine">
          <div class="bios-title-vfd"><h2 class="bios-title">[ SELECT DOCTRINE ]</h2></div>
          <div class="doctrine-cards" role="listbox" aria-label="Select doctrine">
            ${treeList.map(tree => doctrineCardTemplate(tree, selectedDoctrine, onDoctrineSelect))}
          </div>
        </section>
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

let _showTechTreeInProgress = false;

export async function showTechTreeSelection(game, pageRouter, ui, splashManager) {
  if (_showTechTreeInProgress) return;
  _showTechTreeInProgress = true;
  try {
    const overlay = ensureGameSetupOverlay();
    const techTreeData = await dataService.loadTechTree();
    const treeList = Array.isArray(techTreeData) ? techTreeData : (techTreeData?.default ?? []);

    if (!treeList.length) {
      await startNewGameFlow(game, pageRouter, ui, splashManager, null);
      return;
    }

    let selectedDoctrine = null;
    let selectedDifficulty = null;
    let difficultyPresets;

    try {
      difficultyPresets = await dataService.loadDifficultyCurves();
    } catch (err) {
      logger.log('error', 'game', 'Failed to load difficulty curves:', err);
      return;
    }

    const renderSetup = () => {
      render(gameSetupTemplate(
        treeList,
        selectedDoctrine,
        selectedDifficulty,
        (id) => { selectedDoctrine = id; renderSetup(); },
        (diff) => { selectedDifficulty = diff; renderSetup(); },
        () => {
          overlay.classList.add("hidden");
          setTimeout(() => overlay.remove(), 300);
        },
        async () => {
          const preset = difficultyPresets[selectedDifficulty];
          if (!preset) return;

          game.base_money = Number(preset.base_money);
          game.base_loop_wait = Number(preset.base_loop_wait);
          game.base_manual_heat_reduce = Number(preset.base_manual_heat_reduce);
          game.reactor.base_max_heat = Number(preset.base_max_heat);
          game.reactor.base_max_power = Number(preset.base_max_power);
          game.reactor.power_overflow_to_heat_ratio = Number(preset.power_overflow_to_heat_pct) / 100;

          overlay.classList.add("hidden");
          setTimeout(() => overlay.remove(), 300);

          try {
            await startNewGameFlow(game, pageRouter, ui, splashManager, selectedDoctrine);
          } catch (error) {
            logger.log('error', 'game', 'Failed to start game:', error);
          }
        }
      ), overlay);
    };

    renderSetup();
    overlay.classList.remove("hidden");
  } finally {
    _showTechTreeInProgress = false;
  }
}

const SPLASH_HIDE_DELAY_MS = 600;

function hideSplash(splashManager) {
  if (splashManager) splashManager.hide();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSplashHide() {
  await delay(SPLASH_HIDE_DELAY_MS);
}

async function clearStorageForNewGame(game) {
  if (typeof window.clearAllGameDataForNewGame === "function") {
    await window.clearAllGameDataForNewGame(game);
  } else {
    try {
      await StorageUtilsAsync.remove("reactorGameSave");
      for (let i = 1; i <= 3; i++) await StorageUtilsAsync.remove(`reactorGameSave_${i}`);
      await StorageUtilsAsync.remove("reactorGameSave_Previous");
      await StorageUtilsAsync.remove("reactorGameSave_Backup");
      await StorageUtilsAsync.remove("reactorCurrentSaveSlot");
      StorageUtils.remove("reactorGameQuickStartShown");
      StorageUtils.remove("google_drive_save_file_id");
      StorageUtils.set("reactorNewGamePending", 1);
    } catch (_) { }
    delete game._saved_objective_index;
  }
}

async function initializeGameState(game) {
  try {
    await game.initialize_new_game_state();
  } catch (error) {
    logger.log('warn', 'game', 'Error during game initialization (non-fatal):', error);
  }
}

async function resolveTechTreeId(techTreeId) {
  if (techTreeId) return techTreeId;
  const treeList = await dataService.loadTechTree();
  const treeData = Array.isArray(treeList) ? treeList : (treeList?.default ?? []);
  return treeData[0]?.id ?? null;
}

async function applyDoctrineToGame(game, effectiveTreeId) {
  if (!effectiveTreeId) return;
  game.tech_tree = effectiveTreeId;
  try {
    const loaded = await dataService.loadTechTree();
    const treeData = Array.isArray(loaded) ? loaded : (loaded?.default ?? []);
    const doctrine = treeData.find((t) => t.id === effectiveTreeId) ?? null;
    if (doctrine && typeof game.applyDoctrineBonuses === "function") {
      game.applyDoctrineBonuses(doctrine);
    }
  } catch (err) {
    logger.log('warn', 'game', 'Could not apply doctrine bonuses:', err);
  }
}

async function resolveDoctrine(techTreeId) {
  return resolveTechTreeId(techTreeId);
}

async function applyDoctrine(game, techTreeId) {
  await applyDoctrineToGame(game, techTreeId);
}

async function launchGame(pageRouter, ui, game) {
  if (typeof window.startGame === "function") {
    await window.startGame({ pageRouter, ui, game });
  } else {
    await pageRouter.loadGameLayout();
    ui.initMainLayout();
    await pageRouter.loadPage("reactor_section");
    game.startSession();
    game.engine.start();
  }
}

export async function startNewGameFlow(game, pageRouter, ui, splashManager, techTreeId) {
  try {
    hideSplash(splashManager);
    await waitForSplashHide();
    await clearStorageForNewGame(game);
    await initializeGameState(game);
    const effectiveTreeId = await resolveDoctrine(techTreeId);
    await applyDoctrine(game, effectiveTreeId);
    await launchGame(pageRouter, ui, game);
    StorageUtils.remove("reactorNewGamePending");
  } catch (error) {
    logger.log('error', 'game', 'Error in startNewGameFlow:', error);
    logger.log('error', 'game', 'Error stack:', error.stack);
    throw error;
  }
}
