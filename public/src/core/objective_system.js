import { html, render } from "lit-html";
import { toDecimal, logger, toNumber, numFormat as fmt, classMap, styleMap } from "../utils/utils_constants.js";
import { ReactiveLitComponent } from "../components/ReactiveLitComponent.js";
import { updateDecimal } from "./store.js";
import dataService from "../services/dataService.js";
import { areAdjacent as areAdjacentFromModule, BALANCE_POWER_THRESHOLD_10K } from "../utils/utils_constants.js";

export const CHAPTER_NAMES = [
  "Chapter 1: First Fission",
  "Chapter 2: Scaling Production",
  "Chapter 3: High-Energy Systems",
  "Chapter 4: The Experimental Frontier"
];

export const INFINITE_REWARD_BASE = 250;
export const INFINITE_REWARD_PER_COMPLETION = 50;
export const INFINITE_REWARD_CAP = 500;
export const OBJECTIVE_INTERVAL_MS = 2000;
export const OBJECTIVE_WAIT_MS = 3000;
export const PERCENT_COMPLETE_MAX = 100;
export const DEFAULT_OBJECTIVE_INDEX = 0;
export const FIRST_BILLION = 1e9;
export const TOTAL_MONEY_10B = 1e10;
export const HEAT_10M = 1e7;
export const SUSTAINED_POWER_TICKS_REQUIRED = 30;
export const SUSTAINED_POWER_THRESHOLD = 1000;
export const POWER_TARGET_200 = 200;
export const POWER_TARGET_500 = 500;
export const INCOME_TARGET_50K = 50000;
export const CELLS_TARGET_10 = 10;
export const CELLS_TARGET_5 = 5;
export const EP_TARGET_10 = 10;
export const EP_TARGET_51 = 51;
export const EP_TARGET_250 = 250;
export const EP_TARGET_1000 = 1000;
export const CHAPTER_SIZE_DEFAULT = 10;
export const CHAPTER_4_SIZE = 7;
export const CHAPTER_COMPLETION_OBJECTIVE_INDICES = [9, 19, 29, 36];
export const CHAPTER_1_START_INDEX = 0;
export const CHAPTER_2_START_INDEX = 10;
export const CHAPTER_3_START_INDEX = 20;
export const CHAPTER_4_START_INDEX = 30;
export const CLAIM_FEEDBACK_DELAY_MS = 500;

export const INFINITE_POWER_INITIAL = 5000;
export const INFINITE_POWER_STEP = 5000;
export const INFINITE_HEAT_MAINTAIN_BASE_TICKS = 200;
export const INFINITE_HEAT_MAINTAIN_ADD_TICKS = 100;
export const INFINITE_HEAT_MAINTAIN_PERCENT = 50;
export const INFINITE_HEAT_MAINTAIN_MAX_TICKS = 2000;
export const INFINITE_MONEY_THORIUM_INITIAL = 1e8;
export const INFINITE_HEAT_INITIAL = 5e6;
export const INFINITE_EP_INITIAL = 100;

export const INFINITE_CHALLENGES = [
  { id: "infinitePower", nextTarget: (last) => (last < INFINITE_POWER_INITIAL ? INFINITE_POWER_INITIAL : last + INFINITE_POWER_STEP), title: (t) => `Generate ${Number(t).toLocaleString()} Power`, getLastKey: () => "_lastInfinitePowerTarget" },
  { id: "infiniteHeatMaintain", nextTarget: (last) => { const base = last ? last.ticks + INFINITE_HEAT_MAINTAIN_ADD_TICKS : INFINITE_HEAT_MAINTAIN_BASE_TICKS; return { percent: INFINITE_HEAT_MAINTAIN_PERCENT, ticks: Math.min(base, INFINITE_HEAT_MAINTAIN_MAX_TICKS) }; }, title: (t) => `Maintain ${t.percent}% heat for ${t.ticks} ticks`, getLastKey: () => "_lastInfiniteHeatMaintain" },
  { id: "infiniteMoneyThorium", nextTarget: (last) => (last < INFINITE_MONEY_THORIUM_INITIAL ? INFINITE_MONEY_THORIUM_INITIAL : last * 2), title: (t) => `Generate $${Number(t).toLocaleString()} with only Thorium cells`, getLastKey: () => "_lastInfiniteMoneyThorium" },
  { id: "infiniteHeat", nextTarget: (last) => (last < INFINITE_HEAT_INITIAL ? INFINITE_HEAT_INITIAL : last * 2), title: (t) => `Reach ${Number(t).toLocaleString()} Heat`, getLastKey: () => "_lastInfiniteHeat" },
  { id: "infiniteEP", nextTarget: (last) => (last < INFINITE_EP_INITIAL ? INFINITE_EP_INITIAL : last * 2), title: (t) => `Generate ${Number(t).toLocaleString()} Exotic Particles`, getLastKey: () => "_lastInfiniteEP" },
];

export const INFINITE_CHALLENGE_IDS = new Set(INFINITE_CHALLENGES.map((c) => c.id));

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

const infiniteChecks = {
  allObjectives: () => ({ completed: true, text: "All objectives completed!", percent: PERCENT_COMPLETE_MAX }),
  infinitePower: (game) => { const obj = game.objectives_manager?.current_objective_def; const target = obj?.target; if (target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const power = game.reactor?.stats_power ?? 0; const done = power >= target && !game.paused; return { completed: done, percent: progressWithCap(power, target), text: `${power.toLocaleString()} / ${target.toLocaleString()} Power` }; },
  infiniteHeatMaintain: (game) => { const om = game.objectives_manager; const obj = om?.current_objective_def; if (obj?.target?.percent == null || !obj?.target?.ticks || !game.engine) return { completed: false, text: "Awaiting completion...", percent: 0 }; const { percent, ticks } = obj.target; const reactor = game.reactor; const maxH = toNumber(reactor.max_heat); const curH = toNumber(reactor.current_heat); const heatOk = maxH > 0 && curH / maxH >= percent / PERCENT_COMPLETE_MAX && !game.paused && !reactor.has_melted_down; const tracking = om?.getSustainedTracking("infiniteHeatMaintain"); if (heatOk && tracking) { if (tracking.startTick === 0) om.updateSustainedTracking("infiniteHeatMaintain", game.engine.tick_count); const elapsed = game.engine.tick_count - om.getSustainedTracking("infiniteHeatMaintain").startTick; const done = elapsed >= ticks; return { completed: done, percent: progressWithCap(elapsed, ticks), text: `${elapsed} / ${ticks} ticks at ${percent}%` }; } if (om) om.resetSustainedTracking("infiniteHeatMaintain"); return { completed: false, percent: 0, text: `Maintain ${percent}% heat (${((curH / maxH) * PERCENT_COMPLETE_MAX || 0).toFixed(0)}% now)` }; },
  infiniteMoneyThorium: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const cells = game.tileset?.tiles_list?.filter((t) => t?.part?.category === "cell") ?? []; const nonThorium = cells.some((t) => t.part?.id !== "thorium3" && t.part?.type !== "quad_thorium_cell"); if (cells.length === 0) return { completed: false, text: "Add Thorium cells to generate", percent: 0 }; if (nonThorium) return { completed: false, text: "Only Thorium cells allowed", percent: 0 }; const money = toNumber(game.state.current_money); const done = money >= obj.target; return { completed: done, percent: progressWithCap(money, obj.target), text: `$${money.toLocaleString()} / $${obj.target.toLocaleString()} (Thorium only)` }; },
  infiniteHeat: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const heat = game.reactor?.stats_heat ?? 0; const done = heat >= obj.target; return { completed: done, percent: progressWithCap(heat, obj.target), text: `${heat.toLocaleString()} / ${obj.target.toLocaleString()} Heat` }; },
  infiniteEP: (game) => { const obj = game.objectives_manager?.current_objective_def; if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 }; const ep = toNumber(game.exoticParticleManager.exotic_particles); const done = ep >= obj.target; return { completed: done, percent: progressWithCap(ep, obj.target), text: `${ep} / ${obj.target} EP` }; },
};

const checkFunctions = Object.assign({}, cellChecks, powerChecks, milestoneChecks, chapterChecks, infiniteChecks);

export function getObjectiveCheck(checkId) { const fn = checkFunctions[checkId]; if (!fn) return null; return (game) => { const result = fn(game); if (typeof result === "boolean") return { completed: result, percent: result ? PERCENT_COMPLETE_MAX : 0, text: result ? "Complete" : "Incomplete" }; return result; }; }

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

class ObjectiveTracker {
  constructor(manager) { this.manager = manager; }
  scheduleNextCheck() { const manager = this.manager; clearTimeout(manager.objective_timeout); if (manager.disableTimers) return; manager.objective_timeout = setTimeout(() => manager.check_current_objective(), manager.objective_interval); }
  setObjective(objective_index, skip_wait = false) {
    const manager = this.manager;
    if (!manager.objectives_data || manager.objectives_data.length === 0) return;
    if (typeof objective_index !== "number" || Number.isNaN(objective_index)) { const parsed = parseInt(objective_index, 10); objective_index = Number.isNaN(parsed) ? 0 : Math.max(0, parsed); } else { objective_index = Math.floor(objective_index); }
    if (objective_index < 0) objective_index = 0;
    const maxValidIndex = manager.objectives_data.length - 1;
    if (objective_index > maxValidIndex) objective_index = maxValidIndex;
    manager.current_objective_index = objective_index;
    const nextObjective = manager.objectives_data[manager.current_objective_index];
    clearTimeout(manager.objective_timeout);
    const updateLogic = () => { if (nextObjective && nextObjective.checkId === "allObjectives") { manager._loadInfiniteObjective(); return; } if (nextObjective) manager._loadNormalObjective(nextObjective); else manager._loadAllCompletedObjective(); };
    if (skip_wait) updateLogic(); else { manager.objective_unloading = true; manager._emitObjectiveUnloaded(); manager.objective_timeout = setTimeout(updateLogic, manager.objective_wait); }
  }
}

class ObjectiveEvaluator {
  constructor(manager) { this.manager = manager; }
  checkAndAutoComplete() {
    const manager = this.manager;
    if (typeof window !== "undefined" && window.location && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") && typeof process === "undefined") { manager.scheduleNextCheck(); return; }
    if (manager.current_objective_index === 0 && !manager.game._saved_objective_index) { manager.scheduleNextCheck(); return; }
    while (manager.current_objective_def && manager.current_objective_def.checkId !== "allObjectives") {
      manager._syncActiveObjectiveToState?.();
      const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
      const autoResult = checkFn?.(manager.game);
      if (autoResult?.completed) {
        const wasAlreadyCompleted = manager.objectives_data?.[manager.current_objective_index]?.completed;
        manager.current_objective_def.completed = true;
        if (manager.objectives_data?.[manager.current_objective_index]) manager.objectives_data[manager.current_objective_index].completed = true;
        if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
        if (!wasAlreadyCompleted) { manager._emitObjectiveCompleted(); if (manager.current_objective_def.reward) updateDecimal(manager.game.state, "current_money", (d) => d.add(toDecimal(manager.current_objective_def.reward))); else if (manager.current_objective_def.ep_reward) { manager.game.exoticParticleManager.exotic_particles = manager.game.exoticParticleManager.exotic_particles.add(manager.current_objective_def.ep_reward); updateDecimal(manager.game.state, "total_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward)); updateDecimal(manager.game.state, "current_exotic_particles", (d) => d.add(manager.current_objective_def.ep_reward)); } }
        manager.current_objective_index++; const maxValidIndex = manager.objectives_data.length - 1; if (manager.current_objective_index > maxValidIndex) manager.current_objective_index = maxValidIndex;
        manager.set_objective(manager.current_objective_index, true);
        if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
      } else { manager.scheduleNextCheck(); break; }
    }
  }
  checkCurrentObjective() {
    const manager = this.manager;
    if (manager.game?.isSandbox) return;
    if (!manager.game || manager.game.paused || !manager.current_objective_def) { manager.scheduleNextCheck(); return; }
    const checkFn = getObjectiveCheck(manager.current_objective_def.checkId);
    const result = checkFn?.(manager.game);
    if (!result?.completed) { manager.scheduleNextCheck(); return; }
    manager.current_objective_def.completed = true;
    if (manager.objectives_data?.[manager.current_objective_index]) manager.objectives_data[manager.current_objective_index].completed = true;
    if (manager.game?.saveManager) void manager.game.saveManager.autoSave();
    manager._emitObjectiveCompleted();
    const displayObjective = { ...manager.current_objective_def, title: typeof manager.current_objective_def.title === "function" ? manager.current_objective_def.title() : manager.current_objective_def.title, completed: true };
    manager._emitObjectiveLoaded(displayObjective);
    clearTimeout(manager.objective_timeout);
  }
}

const partMappings = { "Quad Plutonium Cells": "./img/parts/cells/cell_2_4.png", "Quad Thorium Cells": "./img/parts/cells/cell_3_4.png", "Quad Seaborgium Cells": "./img/parts/cells/cell_4_4.png", "Quad Dolorium Cells": "./img/parts/cells/cell_5_4.png", "Quad Nefastium Cells": "./img/parts/cells/cell_6_4.png", "Particle Accelerators": "./img/parts/accelerators/accelerator_1.png", "Plutonium Cells": "./img/parts/cells/cell_2_1.png", "Thorium Cells": "./img/parts/cells/cell_3_1.png", "Seaborgium Cells": "./img/parts/cells/cell_4_1.png", "Dolorium Cells": "./img/parts/cells/cell_5_1.png", "Nefastium Cells": "./img/parts/cells/cell_6_1.png", "Heat Vent": "./img/parts/vents/vent_1.png", "Capacitors": "./img/parts/capacitors/capacitor_1.png", "Dual Cell": "./img/parts/cells/cell_1_2.png", "Uranium Cell": "./img/parts/cells/cell_1_1.png", "Capacitor": "./img/parts/capacitors/capacitor_1.png", "Cells": "./img/parts/cells/cell_1_1.png", "Cell": "./img/parts/cells/cell_1_1.png", "experimental part": "./img/parts/cells/xcell_1_1.png", "Improved Chronometers upgrade": "./img/upgrades/upgrade_flux.png", "Improved Chronometers": "./img/upgrades/upgrade_flux.png", "Power": "./img/ui/icons/icon_power.png", "Heat": "./img/ui/icons/icon_heat.png", "Exotic Particles": "🧬" };

export function addPartIconsToTitle(game, title) {
  if (typeof title !== "string") return title;
  let processedTitle = title;
  const sortedMappings = Object.entries(partMappings).sort((a, b) => b[0].length - a[0].length);
  const placeholders = new Map();
  let placeholderCounter = 0;
  for (const [partName, iconPath] of sortedMappings) {
    const isEmoji = iconPath.length === 1 || iconPath.match(/^[^a-zA-Z0-9./]/);
    const escapedPartName = partName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escapedPartName.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (isEmoji) processedTitle = processedTitle.replace(regex, `${iconPath} ${partName}`);
    else { const iconHtml = `<img src=\"${iconPath}\" class=\"objective-part-icon\" alt=\"${partName}\" title=\"${partName}\">`; processedTitle = processedTitle.replace(regex, () => { const placeholder = `__PLACEHOLDER_${placeholderCounter}__`; placeholders.set(placeholder, `${iconHtml} ${partName}`); placeholderCounter++; return placeholder; }); }
  }
  for (const [placeholder, replacement] of placeholders) processedTitle = processedTitle.replace(placeholder, replacement);
  processedTitle = processedTitle.replace(/\$?\d{1,3}(?:,\d{3})+|\$?\d{4,}/g, (match) => { const hasDollar = match.startsWith("$"); const numStr = match.replace(/[^\d]/g, ""); const formatted = fmt(Number(numStr)); return hasDollar ? (`$${formatted}`) : formatted; });
  return processedTitle;
}

export function getObjectiveScrollDuration() { const baseWidth = 900; const baseDuration = 8; const screenWidth = (typeof window !== "undefined" && window.innerWidth) ? window.innerWidth : baseWidth; const duration = baseDuration * (screenWidth / baseWidth); return Math.max(5, Math.min(18, duration)); }

export function checkObjectiveTextScrolling(domElements) { const toastTitleEl = domElements.objectives_toast_title; if (!toastTitleEl) return; const duration = getObjectiveScrollDuration(); toastTitleEl.style.animation = `scroll-objective-title ${duration}s linear infinite`; }

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
    this.infiniteObjective = null;
    this._lastInfinitePowerTarget = 0;
    this._lastInfiniteHeatMaintain = null;
    this._lastInfiniteMoneyThorium = 0;
    this._lastInfiniteHeat = 0;
    this._lastInfiniteEP = 0;
    this._infiniteChallengeIndex = 0;
    this.tracker = new ObjectiveTracker(this);
    this.evaluator = new ObjectiveEvaluator(this);
    this._sustainedTracking = {
      sustainedPower1k: { startTick: 0 },
      masterHighHeat: { startTick: 0 },
      infiniteHeatMaintain: { startTick: 0 },
    };
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
    if (this.game?.isSandbox) {
      state.active_objective = {
        title: "Sandbox",
        index: 0,
        isComplete: false,
        isChapterCompletion: false,
        progressPercent: 0,
        hasProgressBar: false,
        checkId: null,
      };
      return;
    }
    const info = this.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const checkId = this.current_objective_def?.checkId ?? null;
    state.active_objective = {
      title: info.title ?? "",
      index: this.current_objective_index,
      isComplete: !!info.isComplete,
      isChapterCompletion: !!info.isChapterCompletion,
      progressPercent: info.progressPercent ?? 0,
      hasProgressBar: checkId === "sustainedPower1k" && !info.isComplete,
      checkId,
    };
  }

  _emitObjectiveLoaded(displayObjective) {
    this._syncActiveObjectiveToState();
    this.game?.ui?.stateManager?.handleObjectiveLoaded?.(displayObjective, this.current_objective_index);
    if (this.game?.emit) {
      this.game.emit("objectiveLoaded", {
        objective: displayObjective,
        objectiveIndex: this.current_objective_index
      });
    }
  }

  _emitObjectiveCompleted() {
    this._syncActiveObjectiveToState();
    if (this.game?.emit) this.game.emit("objectiveCompleted", {});
  }

  _emitObjectiveUnloaded() {
    this.game?.ui?.stateManager?.handleObjectiveUnloaded?.();
    if (this.game?.emit) this.game.emit("objectiveUnloaded", {});
  }

  generateInfiniteObjective() {
    const idx = this._infiniteChallengeIndex % INFINITE_CHALLENGES.length;
    const challenge = INFINITE_CHALLENGES[idx];
    this._infiniteChallengeIndex = (idx + 1) % INFINITE_CHALLENGES.length;
    const lastKey = challenge.getLastKey();
    const last = this[lastKey] ?? 0;
    const target = challenge.nextTarget(last);
    this[lastKey] = target;
    const completedCount = this._infiniteCompletedCount || 0;
    const reward = INFINITE_REWARD_BASE + Math.min(completedCount * INFINITE_REWARD_PER_COMPLETION, INFINITE_REWARD_CAP);
    if (challenge.id === "infiniteHeatMaintain") this.resetSustainedTracking("infiniteHeatMaintain");
    this.infiniteObjective = {
      title: challenge.title(target),
      checkId: challenge.id,
      target,
      reward,
      completed: false,
    };
    return this.infiniteObjective;
  }

  async initialize() {
    const { objectives } = await dataService.ensureAllGameDataLoaded();
    const data = objectives?.default || objectives;

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

  checkAndAutoComplete() {
    return this.evaluator.checkAndAutoComplete();
  }

  check_current_objective() {
    return this.evaluator.checkCurrentObjective();
  }

  scheduleNextCheck() {
    return this.tracker.scheduleNextCheck();
  }

  _loadInfiniteObjective() {
    const inf = this.infiniteObjective || this.generateInfiniteObjective();
    this.current_objective_def = inf;
    this._emitObjectiveLoaded({ ...inf, title: inf.title });
    this.objective_unloading = false;
    this.scheduleNextCheck();
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
    this.scheduleNextCheck();
  }

  _loadAllCompletedObjective() {
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
    return this.tracker.setObjective(objective_index, skip_wait);
  }

  claimObjective() {
    logger.log("info", "objectives", "[Claim] claimObjective called", {
      sandbox: this.game?.isSandbox,
      claiming: this.claiming,
      hasDef: !!this.current_objective_def,
      defId: this.current_objective_def?.checkId,
    });
    if (this.game?.isSandbox) {
      logger.log("info", "objectives", "[Claim] early return: sandbox");
      return;
    }
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

    // Give the reward
    if (this.current_objective_def.reward) {
      updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(this.current_objective_def.reward)));
    } else if (this.current_objective_def.ep_reward) {
      this.game.exoticParticleManager.exotic_particles = this.game.exoticParticleManager.exotic_particles.add(this.current_objective_def.ep_reward);
      updateDecimal(this.game.state, "total_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
      updateDecimal(this.game.state, "current_exotic_particles", (d) => d.add(this.current_objective_def.ep_reward));
    }

    if (INFINITE_CHALLENGE_IDS.has(this.current_objective_def.checkId)) {
      this._infiniteCompletedCount = (this._infiniteCompletedCount || 0) + 1;
      this.generateInfiniteObjective();
      this.set_objective(this.current_objective_index, true);
    } else {
      this.current_objective_index++;
      const maxValidIndex = this.objectives_data.length - 1;
      if (this.current_objective_index > maxValidIndex) {
        this.current_objective_index = maxValidIndex;
      }
      this.set_objective(this.current_objective_index, true);
    }

    // Always save after claiming
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

export class ObjectiveController {
  constructor(api) {
    this.api = api;
    this._onToastClick = (e) => this._handleToastClick(e);
    this._objectivesUnmount = null;
  }

  _handleClaimClick(event) {
    event.stopPropagation();
    this.api.getGame()?.objectives_manager?.claimObjective?.();
  }

  _handleToastClick(event) {
    if (event.target?.closest?.(".objectives-claim-pill")) return;
    const toastBtn = event.currentTarget;
    const uiState = this.api.getUI()?.uiState;
    if (uiState) {
      uiState.objectives_toast_expanded = !uiState.objectives_toast_expanded;
      if (uiState.objectives_toast_expanded && this.api.lightVibration) this.api.lightVibration();
    } else {
      const isExpanded = toastBtn.classList.toggle("is-expanded");
      toastBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      if (isExpanded && this.api.lightVibration) this.api.lightVibration();
      this._render(this._getRenderState());
    }
  }

  _getRenderState() {
    const game = this.api.getGame();
    const uiState = this.api.getUI()?.uiState;
    if (!game) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    if (game.isSandbox) {
      return { sandbox: true, title: "Sandbox", claimText: "", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: true };
    }
    const obj = game.state?.active_objective;
    const om = game.objectives_manager;
    if (obj?.title) {
      const isExpanded = uiState?.objectives_toast_expanded ?? false;
      const showProgressBar = obj.hasProgressBar && isExpanded;
      return {
        sandbox: false,
        title: obj.title ? `${(obj.index ?? 0) + 1}: ${obj.title}` : "",
        claimText: obj.isChapterCompletion ? "Complete" : "Claim",
        progressPercent: showProgressBar ? (obj.progressPercent ?? 0) : 0,
        isComplete: !!obj.isComplete,
        isActive: !obj.isComplete,
        hasProgressBar: !!showProgressBar,
        isExpanded,
        hidden: uiState?.active_page !== "reactor_section",
      };
    }
    const hidden = uiState?.active_page !== "reactor_section";
    if (!om) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const info = om.getCurrentObjectiveDisplayInfo();
    if (!info) return { sandbox: false, title: "", claimText: "Claim", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: uiState?.objectives_toast_expanded ?? false, hidden };
    const objectiveIndex = om.current_objective_index ?? 0;
    const displayTitle = info.title ? `${objectiveIndex + 1}: ${info.title}` : "";
    const checkId = om.current_objective_def?.checkId;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = checkId === "sustainedPower1k" && isExpanded && !info.isComplete;
    return {
      sandbox: false,
      title: displayTitle,
      claimText: info.isChapterCompletion ? "Complete" : "Claim",
      progressPercent: info.progressPercent ?? 0,
      isComplete: !!info.isComplete,
      isActive: !info.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
  }

  _getRenderStateForPage(pageId) {
    const state = this._getRenderState();
    if (!state) return null;
    state.hidden = pageId !== "reactor_section";
    return state;
  }

  _toTemplate(state) {
    if (!state) return null;
    const btnClass = classMap({
      "objectives-toast-btn": true,
      "is-complete": state.isComplete,
      "is-active": state.isActive,
      "has-progress-bar": state.hasProgressBar,
      "is-expanded": state.isExpanded,
      hidden: state.hidden,
    });
    const progressStyle = styleMap({ width: state.hasProgressBar ? `${state.progressPercent}%` : "0%" });
    return html`
      <div
        id="objectives_toast_btn"
        class=${btnClass}
        role="button"
        tabindex="0"
        aria-label="Show Objectives"
        aria-expanded=${state.isExpanded ? "true" : "false"}
        @click=${this._onToastClick}
        @keydown=${(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this._handleToastClick(e); } }}
      >
        <span class="objectives-toast-row">
          <span class="objectives-toast-icon">${state.isComplete ? "!" : "?"}</span>
          <span class="objectives-toast-title" id="objectives_toast_title">${state.title}</span>
          <button type="button" class="objectives-claim-pill" ?disabled=${!state.isComplete} @click=${(e) => this._handleClaimClick(e)}>${state.claimText}</button>
        </span>
        <span class="objectives-toast-progress" aria-hidden="true"><span class="objectives-toast-progress-fill" style=${progressStyle}></span></span>
      </div>
    `;
  }

  _render(state) {
    const root = document.getElementById("objectives_toast_root");
    if (!root?.isConnected || !state) return;
    const template = this._toTemplate(state);
    if (template) {
      try {
        render(template, root);
      } catch (err) {
        const msg = String(err?.message ?? "");
        if ((msg.includes("parentNode") || msg.includes("nextSibling")) && msg.includes("null")) return;
      }
    }
    if (state.title) this.api.getStateManager()?.checkObjectiveTextScrolling?.();
  }

  _renderReactive() {
    const state = this._getRenderState();
    const template = this._toTemplate(state);
    if (template && state?.isComplete && !this._lastObjectiveComplete) {
      this._lastObjectiveComplete = true;
      setTimeout(() => this.animateCompletion(), 0);
    } else if (state && !state.isComplete) {
      this._lastObjectiveComplete = false;
    }
    if (template && state?.title) setTimeout(() => this.api.getStateManager()?.checkObjectiveTextScrolling?.(), 0);
    return template;
  }

  updateDisplayFromState() {
    if (this._objectivesUnmount) return;
    const game = this.api.getGame();
    const state = game?.state;
    if (!state?.active_objective) return;
    const obj = state.active_objective;
    const uiState = this.api.getUI()?.uiState;
    const isExpanded = uiState?.objectives_toast_expanded ?? false;
    const showProgressBar = obj.hasProgressBar && isExpanded;
    const renderState = {
      sandbox: false,
      title: obj.title ? `${obj.index + 1}: ${obj.title}` : "",
      claimText: obj.isChapterCompletion ? "Complete" : "Claim",
      progressPercent: showProgressBar ? obj.progressPercent : 0,
      isComplete: !!obj.isComplete,
      isActive: !obj.isComplete,
      hasProgressBar: !!showProgressBar,
      isExpanded,
      hidden: uiState?.active_page !== "reactor_section",
    };
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(renderState);
    if (!wasComplete && obj.isComplete) this.animateCompletion();
  }

  updateDisplay() {
    const game = this.api.getGame();
    if (!game?.objectives_manager) return;
    if (game.isSandbox) {
      this._render({ sandbox: true, title: "Sandbox", claimText: "", progressPercent: 0, isComplete: false, isActive: false, hasProgressBar: false, isExpanded: false, hidden: false });
      return;
    }
    const info = game.objectives_manager.getCurrentObjectiveDisplayInfo();
    if (!info) return;
    const wasComplete = document.getElementById("objectives_toast_btn")?.classList.contains("is-complete");
    this._render(this._getRenderState());
    if (!wasComplete && info.isComplete) this.animateCompletion();
  }

  animateCompletion() {
    const toastBtn = document.getElementById("objectives_toast_btn");
    if (!toastBtn) return;
    toastBtn.classList.add("objective-completed");
    setTimeout(() => toastBtn.classList.remove("objective-completed"), 2000);
  }

  showForPage(pageId) {
    this.api.cacheDOMElements?.();
    if (pageId === "reactor_section") {
      const game = this.api.getGame();
      const om = game?.objectives_manager;
      if (om?.current_objective_def) {
        om._syncActiveObjectiveToState?.();
        this.api.getStateManager()?.handleObjectiveLoaded?.({
          ...om.current_objective_def,
          title: typeof om.current_objective_def.title === "function" ? om.current_objective_def.title() : om.current_objective_def.title,
        }, om.current_objective_index);
      }
    }
  }

  setupListeners() {
    const game = this.api.getGame();
    const ui = this.api.getUI();
    const root = document.getElementById("objectives_toast_root");
    if (root && game?.state && ui?.uiState) {
      const subscriptions = [
        { state: game.state, keys: ["active_objective"] },
        { state: ui.uiState, keys: ["objectives_toast_expanded", "active_page"] },
      ];
      const renderFn = () => this._renderReactive();
      this._objectivesUnmount = ReactiveLitComponent.mountMulti(subscriptions, renderFn, root);
    } else if (root) {
      this._render(this._getRenderState());
    }
  }

  unmount() {
    if (typeof this._objectivesUnmount === "function") {
      this._objectivesUnmount();
      this._objectivesUnmount = null;
    }
  }
}