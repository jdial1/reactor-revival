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

function buildDoctrineCard(tree) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "doctrine-card";
  card.dataset.treeId = tree.id;
  card.dataset.doctrine = tree.id;
  if (tree.color) card.style.setProperty("--doctrine-color", tree.color);
  card.setAttribute("role", "option");
  card.setAttribute("aria-selected", "false");
  const icon = document.createElement("img");
  icon.className = "doctrine-card-icon";
  icon.src = `img/ui/icons/${tree.id}.png`;
  icon.alt = "";
  const title = document.createElement("span");
  title.className = "doctrine-card-title";
  title.textContent = tree.title;
  const subtitle = document.createElement("span");
  subtitle.className = "doctrine-card-subtitle";
  subtitle.textContent = tree.subtitle;
  const textWrap = document.createElement("div");
  textWrap.className = "doctrine-card-text";
  textWrap.appendChild(title);
  textWrap.appendChild(subtitle);
  card.appendChild(icon);
  card.appendChild(textWrap);
  return card;
}

function appendDoctrineCards(doctrineContainer, treeList, onDoctrineSelect, updateStartButton) {
  treeList.forEach((tree) => {
    const card = buildDoctrineCard(tree);
    card.onclick = () => {
      doctrineContainer.querySelectorAll(".doctrine-card").forEach((c) => {
        c.classList.remove("selected");
        c.setAttribute("aria-selected", "false");
      });
      card.classList.add("selected");
      card.setAttribute("aria-selected", "true");
      onDoctrineSelect(tree.id);
      updateStartButton();
    };
    doctrineContainer.appendChild(card);
  });
}

function attachDifficultyCardHandlers(difficultyCards, onDifficultySelect, updateStartButton) {
  difficultyCards.forEach((card) => {
    card.onclick = () => {
      difficultyCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      onDifficultySelect(card.dataset.difficulty);
      updateStartButton();
    };
  });
}

function attachBackButtonHandler(backBtn, overlay) {
  if (!backBtn) return;
  backBtn.onclick = () => {
    overlay.classList.add("hidden");
    setTimeout(() => overlay.remove(), 300);
  };
}

function attachStartButtonHandler(startBtn, game, overlay, getSelection, startNewGameFlowFn, difficultyPresets) {
  if (!startBtn) return;
  startBtn.onclick = async () => {
    const { selectedDoctrine, selectedDifficulty } = getSelection();
    if (!selectedDoctrine || !selectedDifficulty) return;
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
      await startNewGameFlowFn(selectedDoctrine);
    } catch (error) {
      logger.log('error', 'game', 'Failed to start game:', error);
      logger.log('warn', 'game', 'Failed to start game. Please try again.');
    }
  };
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
  overlay.innerHTML = "";
  if (!window.templateLoader) return;
  const screen = window.templateLoader.cloneTemplateElement("game-setup-template");
  if (!screen) return;
  const doctrineContainer = screen.querySelector(".doctrine-cards");
  const difficultyCards = screen.querySelectorAll(".difficulty-card");
  const startBtn = screen.querySelector(".setup-start-btn");
  const backBtn = screen.querySelector(".setup-back-btn");
  let selectedDoctrine = null;
  let selectedDifficulty = null;
  const updateStartButton = () => {
    startBtn.disabled = !(selectedDoctrine !== null && selectedDifficulty !== null);
  };
  const getSelection = () => ({ selectedDoctrine, selectedDifficulty });
  const startNewGameFlowWithDoctrine = (doctrineId) => startNewGameFlow(game, pageRouter, ui, splashManager, doctrineId);
  let difficultyPresets;
  try {
    difficultyPresets = await dataService.loadDifficultyCurves();
  } catch (err) {
    logger.log('error', 'game', 'Failed to load difficulty curves:', err);
    overlay.appendChild(screen);
    return;
  }
  appendDoctrineCards(doctrineContainer, treeList, (id) => { selectedDoctrine = id; }, updateStartButton);
  attachDifficultyCardHandlers(difficultyCards, (d) => { selectedDifficulty = d; }, updateStartButton);
  attachBackButtonHandler(backBtn, overlay);
  attachStartButtonHandler(startBtn, game, overlay, getSelection, startNewGameFlowWithDoctrine, difficultyPresets);
  overlay.appendChild(screen);
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
