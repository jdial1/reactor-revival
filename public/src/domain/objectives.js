import { subscribeKey } from "valtio/vanilla/utils";
import { BALANCE } from "./balance.js";
import { bundledGameData } from "../bundledStaticData.js";
import { toNumber, toDecimal } from "../simUtils.js";
import { numFormat as fmt } from "../format/numbers.js";
import { logger } from "../core/logger.js";
import { BALANCE_POWER_THRESHOLD_10K } from "../constants/balance.js";
import { areAdjacent as areAdjacentFromModule } from "../core/grid-helpers.js";
import { grantObjectiveReward } from "./rewards.js";
import {
  CHAPTER_NAMES,
  OBJECTIVE_INTERVAL_MS,
  OBJECTIVE_WAIT_MS,
  PERCENT_COMPLETE_MAX,
  DEFAULT_OBJECTIVE_INDEX,
  FIRST_BILLION,
  TOTAL_MONEY_10B,
  HEAT_10M,
  SUSTAINED_POWER_TICKS_REQUIRED,
  SUSTAINED_POWER_THRESHOLD,
  POWER_TARGET_200,
  POWER_TARGET_500,
  INCOME_TARGET_50K,
  CELLS_TARGET_10,
  CELLS_TARGET_5,
  EP_TARGET_10,
  EP_TARGET_51,
  EP_TARGET_250,
  EP_TARGET_1000,
  CHAPTER_SIZE_DEFAULT,
  CHAPTER_4_SIZE,
  CHAPTER_COMPLETION_OBJECTIVE_INDICES,
  CHAPTER_1_START_INDEX,
  CHAPTER_2_START_INDEX,
  CHAPTER_3_START_INDEX,
  CHAPTER_4_START_INDEX,
  CLAIM_FEEDBACK_DELAY_MS,
} from "../constants/objectives.js";

export { CHAPTER_NAMES, CHAPTER_COMPLETION_OBJECTIVE_INDICES } from "../constants/objectives.js";

function loadObjectiveList() {
  const objectives = bundledGameData.objectives;
  return objectives?.default || objectives;
}

const COMPARE_OPS = { gt: (val, n) => (val?.gt ? val.gt(n) : val > n), gte: (val, n) => (val?.gte ? val.gte(n) : val >= n), lt: (val, n) => (val?.lt ? val.lt(n) : val < n), eq: (val, n) => (val?.eq ? val.eq(n) : val === n) };
function compare(value, threshold, operator) { const fn = COMPARE_OPS[operator]; return fn ? fn(value, threshold) : false; }
function progressWithCap(current, target) { return Math.min(PERCENT_COMPLETE_MAX, (current / target) * PERCENT_COMPLETE_MAX); }
function createProgress(current, target, unit = "", textOverride = null) { const percent = target > 0 ? progressWithCap(current, target) : (current > 0 ? PERCENT_COMPLETE_MAX : 0); return { completed: current >= target, percent, text: textOverride || `${current.toLocaleString()} / ${target.toLocaleString()} ${unit}`.trim() }; }
function boolProgress(done, doneText, pendingText) { return { completed: done, percent: done ? PERCENT_COMPLETE_MAX : 0, text: done ? doneText : pendingText }; }
function countTilesByCategory(game, category) { return game.tileset.getAllTiles?.() ? game.tileset.getAllTiles().filter((t) => t.part?.category === category).length : game.tileset.tiles_list.filter((t) => t.part?.category === category).length; }
function countActiveCellsByCategory(game, category) { return game.tileset.tiles_list.filter((t) => t.part?.category === category && t.ticks > 0).length; }
function countTilesByType(game, type) { return game.tileset.getAllTiles?.() ? game.tileset.getAllTiles().filter((t) => t.part?.type === type).length : game.tileset.tiles_list.filter((t) => t.part?.type === type).length; }

function _checkVentNextToCell(game) {
  return game.tileset.active_tiles_list.some((tile) => {
    if (tile?.part?.category === "cell" && tile.ticks > 0) { for (const neighbor of game.tileset.getTilesInRange(tile, 1)) { if (neighbor?.part?.category === "vent") return true; } }
    return false;
  });
}

function getChapterRange(startIndex, size) { return { start: startIndex, end: startIndex + size - 1 }; }
function countCompletedInRange(objectives_data, startIndex, endIndex) { return objectives_data.slice(startIndex, endIndex).reduce((count, obj) => (obj && !obj.isChapterCompletion && obj.completed ? count + 1 : count), 0); }
function countTotalInRange(objectives_data, startIndex, endIndex) { return objectives_data.slice(startIndex, endIndex).reduce((count, obj) => (obj && !obj.isChapterCompletion ? count + 1 : count), 0); }
function isChapterComplete(game, start, end) { if (!game.objectives_manager?.objectives_data) return false; for (let i = start; i < end; i++) { const obj = game.objectives_manager.objectives_data[i]; if (obj && !obj.isChapterCompletion && !obj.completed) return false; } return true; }

function _checkChapterCompletion(objectives_data, startIndex, chapterSize) {
  if (!objectives_data || objectives_data.length === 0) return { completed: false, text: "Loading...", percent: 0 };
  const endIndex = Math.min(startIndex + chapterSize, objectives_data.length);
  const completedCount = countCompletedInRange(objectives_data, startIndex, endIndex);
  const totalObjectives = countTotalInRange(objectives_data, startIndex, endIndex);
  const percent = totalObjectives > 0 ? (completedCount / totalObjectives) * PERCENT_COMPLETE_MAX : 0;
  return { completed: completedCount >= totalObjectives, text: `${completedCount} / ${totalObjectives} Objectives Complete`, percent: Math.min(PERCENT_COMPLETE_MAX, percent) };
}

const POWER_THRESHOLD_10K = BALANCE_POWER_THRESHOLD_10K;

const cellChecks = {
  firstCell: (game) => { const hasCell = game.tileset.tiles_list.some((tile) => tile?.part && tile?.activated); return boolProgress(hasCell, "1 / 1 Cell Placed", "0 / 1 Cell Placed"); },
  sellPower: (game) => { const power = game.reactor.stats_power || 0; return boolProgress(game.sold_power, "Power sold!", power > 0 ? "Power available to sell" : "No power to sell"); },
  reduceHeat: (game) => { const heat = game.reactor.stats_heat || 0; return boolProgress(game.sold_heat, `${heat.toLocaleString()} / 0 Heat`, `${heat.toLocaleString()} / 0 Heat`); },
  ventNextToCell: (game) => { const done = _checkVentNextToCell(game); return boolProgress(done, "Vent placed next to Cell", "Place a Vent next to a Cell"); },
  purchaseUpgrade: (game) => { const done = game.upgradeset.getAllUpgrades().some((upgrade) => upgrade.level > 0); return boolProgress(done, "Upgrade purchased!", "Purchase an upgrade"); },
  purchaseDualCell: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.id === "uranium2" && tile.activated); return boolProgress(done, "Dual Cell placed!", "Place a Dual Cell"); },
  tenActiveCells: (game) => { const count = countActiveCellsByCategory(game, "cell"); return createProgress(count, CELLS_TARGET_10, "Cells"); },
  perpetualUranium: (game) => { const done = game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.level > 0; return boolProgress(done, "Perpetual Uranium unlocked!", "Unlock Perpetual Uranium"); },
  increaseMaxPower: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.category === "capacitor"); return boolProgress(done, "Capacitor placed!", "Place a Capacitor"); },
  fiveComponentKinds: (game) => { const categories = new Set(game.tileset.tiles_list.map((t) => t.part?.category).filter(Boolean)); return createProgress(categories.size, CELLS_TARGET_5, "Component types"); },
  tenCapacitors: (game) => { const count = countTilesByCategory(game, "capacitor"); return createProgress(count, CELLS_TARGET_10, "Capacitors"); },
  fiveQuadPlutonium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "plutonium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Plutonium Cells"); },
  unlockThorium: (game) => { const count = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "thorium3").length; return createProgress(count, CELLS_TARGET_5, "Quad Thorium Cells"); },
  unlockSeaborgium: (game) => { const count = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "seaborgium3").length; return createProgress(count, CELLS_TARGET_5, "Quad Seaborgium Cells"); },
  fiveQuadDolorium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "dolorium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Dolorium Cells"); },
  fiveQuadNefastium: (game) => { const count = game.tileset.tiles_list.filter((t) => t.part?.id === "nefastium3" && t.ticks > 0).length; return createProgress(count, CELLS_TARGET_5, "Quad Nefastium Cells"); },
  placeExperimentalPart: (game) => { const done = game.tileset.tiles_list.some((tile) => tile.part?.experimental === true); return boolProgress(done, "Experimental part placed!", "Place an experimental part"); },
};

const powerChecks = {
  powerPerTick200: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_TARGET_200 && !game.paused; return { completed: done, ...createProgress(power, POWER_TARGET_200, "Power") }; },
  improvedChronometers: (game) => { const done = game.upgradeset.getUpgrade("chronometer")?.level > 0; return boolProgress(done, "Chronometer unlocked!", "Unlock Chronometer"); },
  potentUranium3: (game) => { const level = game.upgradeset.getUpgrade("uranium1_cell_power")?.level ?? 0; return createProgress(level, 3, "levels"); },
  autoSell500: (game) => { const cash = game.reactor.stats_cash || 0; return createProgress(cash, POWER_TARGET_500, "$/tick"); },
  sustainedPower1k: (game) => { const om = game.objectives_manager; const tracking = om?.getSustainedTracking("sustainedPower1k"); const power = game.reactor.stats_power || 0; if (power >= SUSTAINED_POWER_THRESHOLD && !game.paused && game.engine && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("sustainedPower1k", game.engine.tick_count); const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("sustainedPower1k").startTick; const done = elapsedTicks >= SUSTAINED_POWER_TICKS_REQUIRED; return createProgress(elapsedTicks, SUSTAINED_POWER_TICKS_REQUIRED, "", `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`); } if (om) om.resetSustainedTracking("sustainedPower1k"); return { completed: false, percent: 0, text: `${power.toLocaleString()} / 1,000 Power (hold ${SUSTAINED_POWER_TICKS_REQUIRED} ticks)` }; },
  infrastructureUpgrade1: (game) => { const advancedCapacitors = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.part.id === "capacitor2").length; const advancedHeatVents = game.tileset.tiles_list.filter((tile) => tile?.part && tile?.activated && tile.part.id === "vent2").length; const done = advancedCapacitors >= CELLS_TARGET_10 && advancedHeatVents >= CELLS_TARGET_10; const total = Math.min(advancedCapacitors, CELLS_TARGET_10) + Math.min(advancedHeatVents, CELLS_TARGET_10); return createProgress(total, CELLS_TARGET_10 * 2, "", `${advancedCapacitors}/10 Capacitors, ${advancedHeatVents}/10 Vents`); },
  powerPerTick500: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_TARGET_500 && !game.paused; return { completed: done, ...createProgress(power, POWER_TARGET_500, "Power") }; },
  powerPerTick10k: (game) => { const power = game.reactor.stats_power || 0; const done = power >= POWER_THRESHOLD_10K && !game.paused; return { completed: done, percent: progressWithCap(power, POWER_THRESHOLD_10K), text: `${power.toLocaleString()} / ${POWER_THRESHOLD_10K.toLocaleString()} Power` }; },
};

const milestoneChecks = {
  incomeMilestone50k: (game) => { const income = game.reactor.stats_cash || 0; return createProgress(income, INCOME_TARGET_50K, "", `$${income.toLocaleString()} / $50,000 per tick`); },
  firstBillion: (game) => { const money = toNumber(game.state.current_money) || 0; const done = compare(game.state.current_money, FIRST_BILLION, "gte"); return { completed: done, percent: progressWithCap(money, FIRST_BILLION), text: `$${money.toLocaleString()} / $1,000,000,000` }; },
  money10B: (game) => { const money = toNumber(game.state.current_money) || 0; const done = compare(game.state.current_money, TOTAL_MONEY_10B, "gte"); return { completed: done, percent: progressWithCap(money, TOTAL_MONEY_10B), text: `$${money.toLocaleString()} / $10,000,000,000` }; },
  masterHighHeat: (game) => { const om = game.objectives_manager; const tracking = om?.getSustainedTracking("masterHighHeat"); const heat = game.reactor.stats_heat || 0; const heatOk = compare(game.reactor.current_heat, HEAT_10M, "gt"); if (heatOk && !game.paused && !game.reactor.has_melted_down && game.engine && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("masterHighHeat", game.engine.tick_count); const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("masterHighHeat").startTick; return createProgress(elapsedTicks, SUSTAINED_POWER_TICKS_REQUIRED, "", `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`); } if (om) om.resetSustainedTracking("masterHighHeat"); return { completed: false, percent: progressWithCap(heat, HEAT_10M), text: `${heat.toLocaleString()} / 10,000,000 Heat` }; },
  ep10: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_10, "gte"), percent: progressWithCap(ep, EP_TARGET_10), text: `${ep} / 10 EP Generated` }; },
  ep51: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_51, "gte"), percent: progressWithCap(ep, EP_TARGET_51), text: `${ep} / 51 EP Generated` }; },
  ep250: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_250, "gte"), percent: progressWithCap(ep, EP_TARGET_250), text: `${ep} / 250 EP Generated` }; },
  ep1000: (game) => { const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0; return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_1000, "gte"), percent: progressWithCap(ep, EP_TARGET_1000), text: `${ep} / 1,000 EP Generated` }; },
  investInResearch1: (game) => { const a = game.upgradeset.getUpgrade("infused_cells")?.level > 0; const b = game.upgradeset.getUpgrade("unleashed_cells")?.level > 0; const count = (a ? 1 : 0) + (b ? 1 : 0); return createProgress(count, 2, "upgrades"); },
  reboot: (game) => { const totalOk = compare(game.state.total_exotic_particles, 0, "gt"); const moneyOk = compare(game.state.current_money, game.base_money * 2, "lt"); const epZero = compare(game.exoticParticleManager.exotic_particles, 0, "eq"); const done = totalOk && moneyOk && epZero; return boolProgress(done, "Reboot complete!", "Perform a reboot"); },
  experimentalUpgrade: (game) => { const done = game.upgradeset.getAllUpgrades().filter((upg) => upg.upgrade.id !== "laboratory" && upg.upgrade.type !== "experimental_laboratory" && upg.upgrade.type.startsWith("experimental_") && upg.level > 0).length > 0; return boolProgress(done, "Experimental upgrade purchased!", "Purchase an experimental upgrade"); },
};

const chapterChecks = {
  completeChapter1: (game) => { const chapterRange = getChapterRange(CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 1 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_1_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter2: (game) => { const chapterRange = getChapterRange(CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 2 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_2_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter3: (game) => { const chapterRange = getChapterRange(CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 3 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_3_START_INDEX, CHAPTER_SIZE_DEFAULT); return { ...result, completed: done }; },
  completeChapter4: (game) => { const chapterRange = getChapterRange(CHAPTER_4_START_INDEX, CHAPTER_4_SIZE); const done = isChapterComplete(game, chapterRange.start, chapterRange.end); if (!game.objectives_manager?.objectives_data) return boolProgress(done, "Chapter 4 Complete!", "Loading..."); const result = _checkChapterCompletion(game.objectives_manager.objectives_data, CHAPTER_4_START_INDEX, CHAPTER_4_SIZE); return { ...result, completed: done }; },
};

const completionChecks = {
  allObjectives: () => ({ completed: true, text: "All objectives completed!", percent: PERCENT_COMPLETE_MAX }),
};

const checkFunctions = Object.assign({}, cellChecks, powerChecks, milestoneChecks, chapterChecks, completionChecks);

export function getObjectiveCheck(checkId) { const fn = checkFunctions[checkId]; if (!fn) return null; return (game) => { const result = fn(game); if (typeof result === "boolean") return { completed: result, percent: result ? PERCENT_COMPLETE_MAX : 0, text: result ? "Complete" : "Incomplete" }; return result; }; }

const OBJECTIVE_VALTIO_WATCH_KEYS = [
  "current_money",
  "current_exotic_particles",
  "total_exotic_particles",
  "stats_power",
  "stats_heat_generation",
  "stats_cash",
  "current_heat",
  "current_power",
];
const OBJECTIVE_WATCH_THROTTLE_MS = 200;

function buildLoadingDisplayInfo(objective) { return { chapterName: "Loading...", chapterProgressText: "0 / 10", chapterProgressPercent: 0, title: objective.title || "Loading...", description: objective.description || "", flavor_text: objective.flavor_text, progressText: "Loading...", progressPercent: 0, reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 }, isComplete: objective.completed || false, isChapterCompletion: objective.isChapterCompletion || false }; }
function getChapterSize(chapterIndex) { return chapterIndex === 3 ? CHAPTER_4_SIZE : CHAPTER_SIZE_DEFAULT; }
function computeCompletedInChapter(manager, chapterStart, index, objective) { let completed = 0; for (let i = chapterStart; i < index; i++) { if (manager.objectives_data[i] && manager.objectives_data[i].completed) completed++; } if (objective.completed) completed++; return completed; }
function buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress) { const safeProgress = progress || { text: "Loading...", percent: 0 }; return { chapterName: CHAPTER_NAMES[chapterIndex] || `Chapter ${chapterIndex + 1}`, chapterProgressText: `${completedInChapter} / ${chapterSize}`, chapterProgressPercent: (completedInChapter / chapterSize) * 100, title: objective.title, description: objective.description || "", flavor_text: objective.flavor_text, progressText: safeProgress.text, progressPercent: Math.min(100, safeProgress.percent), reward: { money: objective.reward || 0, ep: objective.ep_reward || 0 }, isComplete: objective.completed || false, isChapterCompletion: objective.isChapterCompletion || false }; }

function formatDisplayInfo(manager) {
  if (!manager.current_objective_def || manager.current_objective_index < 0) return null;
  const index = manager.current_objective_index;
  const objective = manager.current_objective_def;
  if (!manager.game || !manager.game.tileset || !manager.game.reactor) return buildLoadingDisplayInfo(objective);
  const chapterIndex = Math.floor(index / CHAPTER_SIZE_DEFAULT);
  const chapterStart = chapterIndex * CHAPTER_SIZE_DEFAULT;
  const chapterSize = getChapterSize(chapterIndex);
  const completedInChapter = computeCompletedInChapter(manager, chapterStart, index, objective);
  const progress = manager.getCurrentObjectiveProgress();
  return buildDisplayInfoFromProgress(objective, chapterIndex, chapterSize, completedInChapter, progress);
}

function formatObjectiveRewardLabel(reward) {
  const money = Number(reward?.money ?? 0);
  const ep = Number(reward?.ep ?? 0);
  if (money > 0) return `$${fmt(money)}`;
  if (ep > 0) return `${fmt(ep)} EP`;
  return "";
}

function getObjectiveClaimText(reward) {
  const rewardLabel = formatObjectiveRewardLabel(reward);
  return rewardLabel ? `Claim ${rewardLabel}` : "Claim";
}

export class ObjectiveManager {
  constructor(gameInstance) {
    this.game = gameInstance;
    this.objectives_data = [];
    this.current_objective_index = DEFAULT_OBJECTIVE_INDEX;
    this.objective_unloading = false;
    this.objective_interval = OBJECTIVE_INTERVAL_MS;
    this.objective_wait = OBJECTIVE_WAIT_MS;
    this.objective_timeout = null;
    this.current_objective_def = null;
    this.claiming = false;
    this.disableTimers = false;
    this._sustainedTracking = {
      sustainedPower1k: { startTick: 0 },
      masterHighHeat: { startTick: 0 },
    };
    this._objectiveWatchUnsubs = [];
    this._objectiveWatchLastFire = 0;
  }

  _clearObjectiveStateWatchers() {
    const u = this._objectiveWatchUnsubs;
    for (let i = 0; i < u.length; i++) {
      if (typeof u[i] === "function") u[i]();
    }
    this._objectiveWatchUnsubs = [];
  }

  _bindObjectiveStateWatchers() {
    this._clearObjectiveStateWatchers();
    const st = this.game?.state;
    if (!st || this.disableTimers) return;
    const fire = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - this._objectiveWatchLastFire < OBJECTIVE_WATCH_THROTTLE_MS) return;
      this._objectiveWatchLastFire = now;
      this.check_current_objective();
    };
    for (let i = 0; i < OBJECTIVE_VALTIO_WATCH_KEYS.length; i++) {
      const key = OBJECTIVE_VALTIO_WATCH_KEYS[i];
      try {
        this._objectiveWatchUnsubs.push(subscribeKey(st, key, fire));
      } catch (_) {}
    }
  }

  getSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (!t) return null;
    return t;
  }

  updateSustainedTracking(key, startTick) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = startTick;
  }

  resetSustainedTracking(key) {
    const t = this._sustainedTracking[key];
    if (t) t.startTick = 0;
  }

  _syncActiveObjectiveToState() {
    const state = this.game?.state;
    if (!state?.active_objective) return;
    const info = this.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const checkId = this.current_objective_def?.checkId ?? null;
    state.active_objective = {
      title: info.title ?? "",
      index: this.current_objective_index,
      isComplete: !!info.isComplete,
      isChapterCompletion: !!info.isChapterCompletion,
      reward: info.reward ?? null,
      progressPercent: info.progressPercent ?? 0,
      hasProgressBar: checkId === "sustainedPower1k" && !info.isComplete,
      checkId,
    };
  }

  _emitObjectiveLoaded(displayObjective) {
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveLoaded?.(displayObjective, this.current_objective_index);
  }

  _emitObjectiveCompleted() {
    const def = this.current_objective_def;
    const checkId = def?.checkId;
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveCompleted?.();
    const notifications = this.game?.state?.objective_notifications;
    if (notifications) {
      notifications.push({
        kind: "completed",
        checkId,
        flavorText: def?.flavor_text,
        isChapterCompletion: !!def?.isChapterCompletion,
      });
    }
  }

  _emitObjectiveUnloaded() {
    this._clearObjectiveStateWatchers();
    this.game?.ui?.stateManager?.handleObjectiveUnloaded?.();
  }

  async initialize() {
    const data = loadObjectiveList();

    if (!Array.isArray(data)) {
      logger.log('error', 'game', 'objective_list_data is not an array:', data);
      return;
    }

    const existingCompletionStatus = this.objectives_data
      ? this.objectives_data.map(obj => obj.completed)
      : [];
    this.objectives_data = data;
    if (existingCompletionStatus.length > 0) {
      logger.log('debug', 'game', `Preserving ${existingCompletionStatus.filter(c => c).length} completed objectives during initialize`);
      existingCompletionStatus.forEach((completed, index) => {
        if (this.objectives_data[index]) {
          this.objectives_data[index].completed = completed;
        }
      });
    }

    logger.log('debug', 'game', `ObjectiveManager initialized with ${this.objectives_data.length} objectives`);
    logger.log('debug', 'game', `First objective: ${this.objectives_data[0]?.title}`);
    logger.log('debug', 'game', `Last objective: ${this.objectives_data[this.objectives_data.length - 1]?.title}`);
  }

  start() {
    logger.log('debug', 'game', `ObjectiveManager.start() called with current_objective_index: ${this.current_objective_index}`);

    if (!this.objectives_data || this.objectives_data.length === 0) {
      logger.log('debug', 'game', 'Objectives data not loaded yet, waiting for initialization...');
      this.initialize().then(() => {
        logger.log('debug', 'game', 'Initialization completed, now calling start() again');
        this.start();
      });
      return;
    }

    // Only set objective if it's not already set or if current_objective_def is null
    if (!this.current_objective_def) {
      logger.log('debug', 'game', `Setting objective to index ${this.current_objective_index}`);
      this.set_objective(this.current_objective_index, true);
    } else {
      logger.log('debug', 'game', 'Objective already set, skipping set_objective call');
    }

    setTimeout(() => {
      logger.log('debug', 'game', 'ObjectiveManager.checkAndAutoComplete() called');
      this.checkAndAutoComplete();
    }, 0);
  }

  scheduleNextCheck() {
    clearTimeout(this.objective_timeout);
    if (this.disableTimers) return;
    this.objective_timeout = setTimeout(() => this.check_current_objective(), this.objective_interval);
  }

  checkAndAutoComplete() {
    if (typeof window !== "undefined" && window.location && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && typeof process === "undefined") {
      this.scheduleNextCheck();
      return;
    }
    if (this.current_objective_index === 0 && !this.game._saved_objective_index) {
      this.scheduleNextCheck();
      return;
    }
    while (this.current_objective_def && this.current_objective_def.checkId !== "allObjectives") {
      this._syncActiveObjectiveToState?.();
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      const autoResult = checkFn?.(this.game);
      if (autoResult?.completed) {
        const wasAlreadyCompleted = this.objectives_data?.[this.current_objective_index]?.completed;
        this.current_objective_def.completed = true;
        if (this.objectives_data?.[this.current_objective_index]) this.objectives_data[this.current_objective_index].completed = true;
        if (this.game?.saveManager) void this.game.saveManager.autoSave();
        if (!wasAlreadyCompleted) {
          this._emitObjectiveCompleted();
          grantObjectiveReward(this.game, this.current_objective_def);
        }
        this.current_objective_index++;
        const maxValidIndex = this.objectives_data.length - 1;
        if (this.current_objective_index > maxValidIndex) this.current_objective_index = maxValidIndex;
        this.set_objective(this.current_objective_index, true);
        if (this.game?.saveManager) void this.game.saveManager.autoSave();
      } else {
        this.scheduleNextCheck();
        break;
      }
    }
  }

  check_current_objective() {
    if (!this.game || this.game.paused || !this.current_objective_def) {
      this.scheduleNextCheck();
      return;
    }
    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    const result = checkFn?.(this.game);
    if (!result?.completed) {
      this.scheduleNextCheck();
      return;
    }
    this.current_objective_def.completed = true;
    if (this.objectives_data?.[this.current_objective_index]) this.objectives_data[this.current_objective_index].completed = true;
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
    this._emitObjectiveCompleted();
    const displayObjective = {
      ...this.current_objective_def,
      title: typeof this.current_objective_def.title === "function" ? this.current_objective_def.title() : this.current_objective_def.title,
      completed: true,
    };
    this._emitObjectiveLoaded(displayObjective);
    clearTimeout(this.objective_timeout);
  }

  _loadNormalObjective(nextObjective) {
    this.current_objective_def = nextObjective;
    if (this.current_objective_def.isChapterCompletion && !this.current_objective_def.completed) {
      this.current_objective_def.completed = true;
      if (this.objectives_data && this.objectives_data[this.current_objective_index]) {
        this.objectives_data[this.current_objective_index].completed = true;
      }
      logger.log('debug', 'game', `Auto-completing chapter completion objective: ${this.current_objective_def.title}`);
      const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
      if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });
    }
    const displayObjective = {
      ...this.current_objective_def,
      title:
        typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title,
    };
    logger.log('debug', 'game', `Loading objective: ${displayObjective.title}`);
    this._emitObjectiveLoaded(displayObjective);
    this.objective_unloading = false;
    this._bindObjectiveStateWatchers();
    this.scheduleNextCheck();
  }

  _loadAllCompletedObjective() {
    this._clearObjectiveStateWatchers();
    this.current_objective_def = {
      title: "All objectives completed!",
      reward: 0,
      checkId: "allObjectives",
    };
    logger.log('debug', 'game', 'Loading "All objectives completed!" objective');
    this._emitObjectiveLoaded({ ...this.current_objective_def });
    clearTimeout(this.objective_timeout);
  }

  set_objective(objective_index, skip_wait = false) {
    if (!this.objectives_data || this.objectives_data.length === 0) return;
    if (typeof objective_index !== "number" || Number.isNaN(objective_index)) {
      const parsed = parseInt(objective_index, 10);
      objective_index = Number.isNaN(parsed) ? 0 : Math.max(0, parsed);
    } else {
      objective_index = Math.floor(objective_index);
    }
    if (objective_index < 0) objective_index = 0;
    const maxValidIndex = this.objectives_data.length - 1;
    if (objective_index > maxValidIndex) objective_index = maxValidIndex;
    this.current_objective_index = objective_index;
    const nextObjective = this.objectives_data[this.current_objective_index];
    clearTimeout(this.objective_timeout);
    const updateLogic = () => {
      if (nextObjective && nextObjective.checkId === "allObjectives") {
        this._loadAllCompletedObjective();
        return;
      }
      if (nextObjective) this._loadNormalObjective(nextObjective);
      else this._loadAllCompletedObjective();
    };
    if (skip_wait) updateLogic();
    else {
      this.objective_unloading = true;
      this._emitObjectiveUnloaded();
      this.objective_timeout = setTimeout(updateLogic, this.objective_wait);
    }
  }

  claimObjective() {
    logger.log("info", "objectives", "[Claim] claimObjective called", {
      claiming: this.claiming,
      hasDef: !!this.current_objective_def,
      defId: this.current_objective_def?.checkId,
    });
    if (this.claiming || !this.current_objective_def) {
      logger.log("info", "objectives", "[Claim] early return: claiming or no def", {
        claiming: this.claiming,
        hasDef: !!this.current_objective_def,
      });
      return;
    }

    let isComplete = this.current_objective_def.isChapterCompletion ?
      this.getChapterCompletionStatus(this.current_objective_def, this.current_objective_index) :
      this.current_objective_def.completed;

    if (!isComplete && this.current_objective_def.checkId) {
      const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
      const result = checkFn?.(this.game);
      isComplete = !!result?.completed;
    }

    logger.log("info", "objectives", "[Claim] isComplete check", {
      isChapterCompletion: this.current_objective_def.isChapterCompletion,
      defCompleted: this.current_objective_def.completed,
      isComplete,
    });

    if (!isComplete) {
      logger.log("info", "objectives", "[Claim] early return: objective not complete");
      return;
    }

    logger.log("info", "objectives", "[Claim] claiming objective", { index: this.current_objective_index });
    this.claiming = true;
    this.game.emit?.("vibrationRequest", { type: "doublePulse" });
    const chapterIdx = CHAPTER_COMPLETION_OBJECTIVE_INDICES.indexOf(this.current_objective_index);
    if (chapterIdx >= 0) this.game.emit?.("chapterCelebration", { chapterIdx });

    grantObjectiveReward(this.game, this.current_objective_def);

    const claimedIndex = this.current_objective_index;
    this.game.coreBridge?.syncObjectiveClaim?.(claimedIndex);

    this.current_objective_index++;
    const maxValidIndex = this.objectives_data.length - 1;
    if (this.current_objective_index > maxValidIndex) {
      this.current_objective_index = maxValidIndex;
    }
    this.set_objective(this.current_objective_index, true);

    if (this.game?.saveManager) {
      void this.game.saveManager.autoSave();
    }

    if (this.game?.emit) this.game.emit("objectiveClaimed", {});
    setTimeout(() => {
      this.claiming = false;
    }, CLAIM_FEEDBACK_DELAY_MS);
  }

  getCurrentObjectiveDisplayInfo() {
    return formatDisplayInfo(this);
  }

  getCurrentObjectiveProgress() {
    if (!this.current_objective_def || this.current_objective_def.completed) {
      return { text: "", percent: 100 };
    }
    if (!this.game || !this.game.tileset || !this.game.reactor) {
      return { text: "Loading...", percent: 0 };
    }
    const checkFn = getObjectiveCheck(this.current_objective_def.checkId);
    if (!checkFn) return { text: "Awaiting completion...", percent: 0 };
    const result = checkFn(this.game);
    return { text: result.text, percent: result.percent };
  }

  checkVentNextToCell(game) {
    return _checkVentNextToCell(game);
  }

  checkChapterCompletion(startIndex, chapterSize) {
    return _checkChapterCompletion(this.objectives_data, startIndex, chapterSize);
  }

  getChapterCompletionStatus(objective, objectiveIndex) {
    return objective.completed || false;
  }

  areAdjacent(tile1, tile2) {
    return areAdjacentFromModule(tile1, tile2);
  }


  // Utility method to get current objective information for debugging
  getCurrentObjectiveInfo() {
    return {
      index: this.current_objective_index,
      title: this.current_objective_def
        ? typeof this.current_objective_def.title === "function"
          ? this.current_objective_def.title()
          : this.current_objective_def.title
        : "No objective loaded",
      checkId: this.current_objective_def?.checkId || null,
      total_objectives: this.objectives_data.length,
      completed: this.current_objective_def?.completed || false,
    };
  }
}

export { getObjectiveClaimText };
