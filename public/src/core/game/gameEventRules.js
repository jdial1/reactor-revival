import { toNumber } from "../../utils/decimal.js";
import { CRITICAL_HEAT_RATIO } from "../constants.js";

export function buildFacts(game, engine, data) {
  const reactor = game.reactor;
  const maxHeat = toNumber(reactor.max_heat ?? 0);
  const reactorHeat = toNumber(reactor.current_heat ?? 0);
  const heatRatio = maxHeat > 0 ? reactorHeat / maxHeat : 0;
  const tickCount = data
    ? engine.tick_count + (data.tickCount || 1) - 1
    : engine.tick_count;
  const us = game.upgradeset;
  const hasUpgrade = (id) => (us?.getUpgrade(id)?.level ?? 0) > 0;
  const upgrades = {};
  if (us?.upgradesArray) {
    for (const u of us.upgradesArray) {
      if (u?.id && (u.level ?? 0) > 0) upgrades[u.id] = u.level;
    }
  }
  return {
    reactorHeat,
    maxHeat,
    heatRatio,
    reactorPower: toNumber(reactor.current_power ?? 0),
    maxPower: toNumber(reactor.max_power ?? 0),
    tickCount,
    activeCells: engine.active_cells?.length ?? 0,
    activeVents: engine.active_vents?.length ?? 0,
    hasMeltedDown: reactor.has_melted_down ?? false,
    isPaused: game.paused ?? game.state?.pause ?? false,
    isSandbox: game.isSandbox ?? false,
    hasUpgrade,
    upgrades,
    _firstHighHeatSeen: game.state?._firstHighHeatSeen ?? false,
  };
}

function heatWarningPredicate(facts) {
  return facts.heatRatio >= CRITICAL_HEAT_RATIO && !facts.hasMeltedDown && !facts.isPaused;
}

function pipeIntegrityWarningPredicate(facts) {
  return (
    facts.heatRatio >= CRITICAL_HEAT_RATIO &&
    !facts.hasUpgrade("fractal_piping") &&
    !facts.hasMeltedDown &&
    !facts.isPaused
  );
}

function firstHighHeatPredicate(facts) {
  return facts.heatRatio >= 0.5 && !facts.hasMeltedDown && !facts.isPaused && !facts._firstHighHeatSeen;
}

export const rules = [
  { event: "heatWarning", predicate: heatWarningPredicate, throttleTicks: 30 },
  { event: "pipeIntegrityWarning", predicate: pipeIntegrityWarningPredicate, throttleTicks: 30 },
  { event: "firstHighHeat", predicate: firstHighHeatPredicate, oneShot: true, oneShotKey: "_firstHighHeatSeen" },
];
