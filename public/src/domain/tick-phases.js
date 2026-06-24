export const TICK_PHASE_ORDER = Object.freeze([
  "intents",
  "cells",
  "heat",
  "vents",
  "economy",
  "objectives",
]);

export const TICK_PHASE_DESCRIPTIONS = Object.freeze({
  intents: "Drain intent_queue and apply grid/economy commands",
  cells: "Cell power generation and depletion",
  heat: "Pressure-gradient heat transfer",
  vents: "Venting and hull heat",
  economy: "Sell power, auto-sell, money mutations",
  objectives: "Objective progress checks",
});
