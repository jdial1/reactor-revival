import { toNumber } from "../simUtils.js";

export function buildFacts(game, engine, data) {
  const reactor = game.reactor;
  const maxHeat = toNumber(reactor.max_heat ?? 0);
  const reactorHeat = toNumber(reactor.current_heat ?? 0);
  const heatRatio = maxHeat > 0 ? reactorHeat / maxHeat : 0;
  const tickCount = data ? engine.tick_count + (data.tickCount || 1) - 1 : engine.tick_count;
  const us = game.upgradeset;
  const hasUpgrade = (id) => (us?.getUpgrade(id)?.level ?? 0) > 0;
  const upgrades = {};
  if (us?.upgradesArray) {
    for (const u of us.upgradesArray) {
      if (u?.id && (u.level ?? 0) > 0) upgrades[u.id] = u.level;
    }
  }
  const statsNetHeat = Number(game.state?.stats_net_heat ?? reactor.stats_net_heat ?? NaN);
  const statsHeatGen = Number(game.state?.stats_heat_generation ?? reactor.stats_heat_generation ?? 0);
  const netHeatBalanced = Number.isFinite(statsNetHeat) && statsNetHeat <= 0 && statsHeatGen > 0;
  return {
    reactorHeat,
    maxHeat,
    heatRatio,
    netHeatBalanced,
    reactorPower: toNumber(reactor.current_power ?? 0),
    maxPower: toNumber(reactor.max_power ?? 0),
    tickCount,
    activeCells: engine.active_cells?.length ?? 0,
    activeVents: engine.active_vents?.length ?? 0,
    hasMeltedDown: reactor.has_melted_down ?? false,
    isPaused: game.paused ?? game.state?.pause ?? false,
    hasUpgrade,
    upgrades,
    _firstHighHeatSeen: game.state?._firstHighHeatSeen ?? false,
  };
}
