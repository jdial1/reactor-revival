const VISUAL_EVENT_HEAT = 2;
const VENT6_ID = "vent6";

function countEmptyNeighbors(tileset, r, c) {
  let count = 0;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  offsets.forEach(([dr, dc]) => {
    const n = tileset.getTile(r + dr, c + dc);
    if (n && n.enabled && !n.part) count++;
  });
  return count;
}

function applyConvectiveBoost(ventRate, reactor, tileset, r, c) {
  if (reactor.convective_boost <= 0) return ventRate;
  const emptyNeighbors = countEmptyNeighbors(tileset, r, c);
  if (emptyNeighbors <= 0) return ventRate;
  return ventRate * (1 + emptyNeighbors * reactor.convective_boost);
}

function applyVent6PowerCost(reactor, ventReduce) {
  const powerAvail = reactor.current_power.toNumber();
  const capped = powerAvail < ventReduce ? powerAvail : ventReduce;
  reactor.current_power = reactor.current_power.sub(capped);
  return capped;
}

export function processVents(engine, multiplier) {
  const reactor = engine.game.reactor;
  const activeVents = engine.active_vents;
  let stirlingPowerAdd = 0;
  const tileset = engine.game.tileset;

  activeVents.forEach((tile) => {
    if (!tile.part) return;
    let ventRate = tile.getEffectiveVentValue() * multiplier;
    if (ventRate <= 0) return;
    ventRate = applyConvectiveBoost(ventRate, reactor, tileset, tile.row, tile.col);
    const heat = tile.heat_contained;
    let vent_reduce = Math.min(ventRate, heat);
    if (tile.part.id === VENT6_ID) vent_reduce = applyVent6PowerCost(reactor, vent_reduce);
    tile.heat_contained -= vent_reduce;
    if (reactor.stirling_multiplier > 0 && vent_reduce > 0)
      stirlingPowerAdd += vent_reduce * reactor.stirling_multiplier;
    if (vent_reduce > 0) engine.enqueueVisualEvent(VISUAL_EVENT_HEAT, tile.row, tile.col, 0);
  });
  return stirlingPowerAdd;
}
