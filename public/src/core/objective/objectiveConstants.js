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
  {
    id: "infinitePower",
    nextTarget: (last) => (last < INFINITE_POWER_INITIAL ? INFINITE_POWER_INITIAL : last + INFINITE_POWER_STEP),
    title: (t) => `Generate ${Number(t).toLocaleString()} Power`,
    getLastKey: () => "_lastInfinitePowerTarget",
  },
  {
    id: "infiniteHeatMaintain",
    nextTarget: (last) => {
      const base = last ? last.ticks + INFINITE_HEAT_MAINTAIN_ADD_TICKS : INFINITE_HEAT_MAINTAIN_BASE_TICKS;
      return { percent: INFINITE_HEAT_MAINTAIN_PERCENT, ticks: Math.min(base, INFINITE_HEAT_MAINTAIN_MAX_TICKS) };
    },
    title: (t) => `Maintain ${t.percent}% heat for ${t.ticks} ticks`,
    getLastKey: () => "_lastInfiniteHeatMaintain",
  },
  {
    id: "infiniteMoneyThorium",
    nextTarget: (last) => (last < INFINITE_MONEY_THORIUM_INITIAL ? INFINITE_MONEY_THORIUM_INITIAL : last * 2),
    title: (t) => `Generate $${Number(t).toLocaleString()} with only Thorium cells`,
    getLastKey: () => "_lastInfiniteMoneyThorium",
  },
  {
    id: "infiniteHeat",
    nextTarget: (last) => (last < INFINITE_HEAT_INITIAL ? INFINITE_HEAT_INITIAL : last * 2),
    title: (t) => `Reach ${Number(t).toLocaleString()} Heat`,
    getLastKey: () => "_lastInfiniteHeat",
  },
  {
    id: "infiniteEP",
    nextTarget: (last) => (last < INFINITE_EP_INITIAL ? INFINITE_EP_INITIAL : last * 2),
    title: (t) => `Generate ${Number(t).toLocaleString()} Exotic Particles`,
    getLastKey: () => "_lastInfiniteEP",
  },
];

export const INFINITE_CHALLENGE_IDS = new Set(INFINITE_CHALLENGES.map((c) => c.id));
