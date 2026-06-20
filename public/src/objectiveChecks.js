import { bundledGameData } from "./bundledStaticData.js";
import { toNumber } from "./utils.js";

const LIST = bundledGameData.objectives;

function chapterPriorRange(ix) {
  let start = 0;
  for (let i = ix - 1; i >= 0; i--) {
    if (LIST[i].isChapterCompletion) {
      start = i + 1;
      break;
    }
  }
  return [start, ix - 1];
}

function priorChapterObjectivesComplete(game, checkId) {
  const ix = LIST.findIndex((o) => o.checkId === checkId);
  if (ix < 0) return false;
  const [a, b] = chapterPriorRange(ix);
  const om = game.objectives_manager;
  for (let i = a; i <= b; i++) {
    if (!om.objectives_data[i]?.completed) return false;
  }
  return true;
}

function countParts(game, pred) {
  let n = 0;
  const ts = game.tileset?.tiles_list;
  if (!ts) return 0;
  for (const t of ts) {
    const p = t.part;
    if (p && pred(p)) n++;
  }
  return n;
}

function countCategories(game) {
  return Object.keys(game.reactor?.categoryTallies || {}).length;
}

function hasVentAdjacentToCell(game) {
  const ts = game.tileset;
  if (!ts?.tiles_list) return false;
  for (const t of ts.tiles_list) {
    if (!t.part || t.part.category !== "vent") continue;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const n = ts.getTile(t.row + dr, t.col + dc);
      if (n?.part?.category === "cell") return true;
    }
  }
  return false;
}

function anyUpgradePurchased(game) {
  for (const u of game.upgradeset.getAllUpgrades()) {
    if (u.level <= 0) continue;
    if (u.id === "expand_reactor_rows" || u.id === "expand_reactor_cols") continue;
    return true;
  }
  return false;
}

const checks = {
  firstCell: (game) => ({
    completed: (game.reactor?.categoryTallies?.["cell"] || 0) > 0,
  }),
  sellPower: (game) => ({
    completed: toNumber(game.session_power_sold) > 0 || toNumber(game.state?.session_power_sold) > 0,
  }),
  reduceHeat: (game) => ({
    completed: toNumber(game.reactor?.current_heat) <= 0,
  }),
  ventNextToCell: (game) => ({ completed: hasVentAdjacentToCell(game) }),
  purchaseUpgrade: (game) => ({ completed: anyUpgradePurchased(game) }),
  purchaseDualCell: (game) => ({
    completed: (game.reactor?.partTallies?.["uranium2"] || 0) > 0,
  }),
  tenActiveCells: (game) => ({
    completed: (game.reactor?.categoryTallies?.["cell"] || 0) >= 10,
  }),
  perpetualUranium: (game) => ({
    completed: (game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.level ?? 0) > 0,
  }),
  increaseMaxPower: (game) => ({
    completed: (game.reactor?.categoryTallies?.["capacitor"] || 0) > 0,
  }),
  completeChapter1: (game) => ({
    completed: priorChapterObjectivesComplete(game, "completeChapter1"),
  }),
  powerPerTick200: (game) => ({
    completed: toNumber(game.reactor?.stats_power) >= 200,
  }),
  improvedChronometers: (game) => ({
    completed: (game.upgradeset.getUpgrade("chronometer")?.level ?? 0) > 0,
  }),
  fiveComponentKinds: (game) => ({
    completed: countCategories(game) >= 5,
  }),
  tenCapacitors: (game) => ({
    completed: (game.reactor?.categoryTallies?.["capacitor"] || 0) >= 10,
  }),
  powerPerTick500: (game) => ({
    completed: toNumber(game.reactor?.stats_power) >= 500,
  }),
  potentUranium3: (game) => ({
    completed: (game.upgradeset.getUpgrade("uranium1_cell_power")?.level ?? 0) >= 3,
  }),
  autoSell500: (game) => ({
    completed:
      !!game.reactor?.auto_sell_enabled && toNumber(game.reactor?.stats_cash) >= 500,
  }),
  sustainedPower1k: (game) => {
    return { completed: !!((game.reactor?.sustainedPower1kCount || 0) >= 30) };
  },
  infrastructureUpgrade1: (game) => ({
    completed:
      (game.reactor?.partTallies?.["capacitor2"] || 0) >= 10 &&
      (game.reactor?.partTallies?.["vent2"] || 0) >= 10,
  }),
  completeChapter2: (game) => ({
    completed: priorChapterObjectivesComplete(game, "completeChapter2"),
  }),
  fiveQuadPlutonium: (game) => ({
    completed: (game.reactor?.partTallies?.["plutonium3"] || 0) >= 5,
  }),
  incomeMilestone50k: (game) => ({
    completed: toNumber(game.reactor?.stats_cash) >= 50000,
  }),
  powerPerTick10k: (game) => ({
    completed: toNumber(game.reactor?.stats_power) >= 10000 && !game.paused,
  }),
  unlockThorium: (game) => ({
    completed: (game.reactor?.partTallies?.["thorium3"] || 0) >= 5,
  }),
  firstBillion: (game) => ({
    completed: toNumber(game.current_money) >= 1e9,
  }),
  money10B: (game) => ({
    completed: toNumber(game.current_money) >= 1e10,
  }),
  unlockSeaborgium: (game) => ({
    completed: (game.reactor?.partTallies?.["seaborgium3"] || 0) >= 5,
  }),
  masterHighHeat: (game) => {
    return { completed: !!((game.reactor?.masterHighHeatCount || 0) >= 30) };
  },
  ep10: (game) => ({
    completed: toNumber(game.exotic_particles) >= 10,
  }),
  completeChapter3: (game) => ({
    completed: priorChapterObjectivesComplete(game, "completeChapter3"),
  }),
  ep51: (game) => ({
    completed: toNumber(game.exotic_particles) >= 51,
  }),
  ep250: (game) => ({
    completed: toNumber(game.exotic_particles) >= 250,
  }),
  investInResearch1: (game) => ({
    completed:
      (game.upgradeset.getUpgrade("infused_cells")?.level ?? 0) > 0 &&
      (game.upgradeset.getUpgrade("unleashed_cells")?.level ?? 0) > 0,
  }),
  reboot: (game) => ({
    completed:
      toNumber(game.total_exotic_particles) > 0 &&
      toNumber(game.exotic_particles) === 0 &&
      toNumber(game.current_money) === toNumber(game.base_money),
  }),
  experimentalUpgrade: (game) => ({
    completed: game.upgradeset.getAllUpgrades().some((u) => {
      if (u.level <= 0) return false;
      const ec = u.base_ecost != null ? toNumber(u.base_ecost) : 0;
      return ec > 0 && u.id !== "laboratory";
    }),
  }),
  fiveQuadDolorium: (game) => ({
    completed: countParts(game, (p) => p.id === "dolorium3") >= 5,
  }),
  ep1000: (game) => ({
    completed: toNumber(game.exotic_particles) >= 1000,
  }),
  fiveQuadNefastium: (game) => ({
    completed: countParts(game, (p) => p.id === "nefastium3") >= 5,
  }),
  placeExperimentalPart: (game) => ({
    completed: countParts(game, (p) => p.id === "protium1" || p.experimental) > 0,
  }),
  completeChapter4: (game) => ({
    completed: priorChapterObjectivesComplete(game, "completeChapter4"),
  }),
  allObjectives: (game) => {
    const om = game.objectives_manager;
    const last = LIST.length - 1;
    for (let i = 0; i < last; i++) {
      if (!om.objectives_data[i]?.completed) return { completed: false };
    }
    return { completed: true };
  },
};

export function getObjectiveCheckById(id) {
  const fn = checks[id];
  if (!fn) return () => ({ completed: false });
  return (game) => fn(game);
}
