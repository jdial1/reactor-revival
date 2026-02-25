import { numFormat as fmt } from "../../utils/util.js";

function setMaxOrLockedStatus(stats, obj, game) {
  if (obj.upgrade) {
    if (obj.level >= obj.max_level) stats.set("", "MAX");
    return;
  }
  if (
    obj.cost !== undefined &&
    obj.erequires &&
    !game.upgradeset.getUpgrade(obj.erequires)?.level
  ) {
    stats.set("", "LOCKED");
  }
}

function setBaseHeatStats(stats, obj, tile) {
  const maxHeat = obj.containment || "∞";
  const maxHeatDisplay = maxHeat === "∞" ? maxHeat : fmt(maxHeat, 0);
  stats.set("Heat", `${fmt(tile.heat_contained || 0, 0)} / ${maxHeatDisplay}`);
}

function setVentCoolingStats(stats, segment) {
  const totalVentRate = segment.vents.reduce(
    (sum, vent) => sum + vent.getEffectiveVentValue(),
    0
  );
  stats.set("Cooling", `${fmt(totalVentRate, 1)}/tick`);
}

function setOutletTransferStats(stats, segment, game) {
  const totalOutletRate = segment.outlets.reduce(
    (sum, o) => sum + o.getEffectiveTransferValue(),
    0
  );
  const reactorFullness = game.reactor.max_heat > 0
    ? game.reactor.current_heat / game.reactor.max_heat
    : 0;
  const effective = totalOutletRate * reactorFullness * (1 - segment.fullnessRatio);
  stats.set("Transfer", `${fmt(effective, 1)}/tick`);
}

function setInletTransferStats(stats, segment, game) {
  const totalInletRate = segment.inlets.reduce(
    (sum, i) => sum + i.getEffectiveTransferValue(),
    0
  );
  const reactorFullness = game.reactor.max_heat > 0
    ? game.reactor.current_heat / game.reactor.max_heat
    : 0;
  const effective = totalInletRate * segment.fullnessRatio * (1 - reactorFullness);
  stats.set("Transfer", `${fmt(effective, 1)}/tick`);
}

function setHeatAndSegmentStats(stats, obj, tile, game) {
  if (!tile?.activated || (!obj.containment && tile.heat_contained <= 0)) return;
  setBaseHeatStats(stats, obj, tile);

  if (!game.engine?.heatManager) return;
  const segment = game.engine.heatManager.getSegmentForTile(tile);
  if (!segment) return;
  
  stats.set("Segment", `${fmt(segment.fullnessRatio * 100, 1)}% full`);

  if (obj.category === "vent" && segment.vents.length > 0) {
    setVentCoolingStats(stats, segment);
  } else if (obj.category === "heat_outlet" && segment.outlets.length > 0) {
    setOutletTransferStats(stats, segment, game);
  } else if (obj.category === "heat_inlet" && segment.inlets.length > 0) {
    setInletTransferStats(stats, segment, game);
  }
}

function setTransferSellAndEpStats(stats, obj, tile) {
  if (!tile?.activated) return;
  if (
    (obj.category === "heat_outlet" || obj.category === "heat_inlet") &&
    !stats.has("Transfer")
  ) {
    stats.set(
      "Max Transfer",
      `${fmt(tile.getEffectiveTransferValue(), 1)}/tick`
    );
  }
  if (obj.category !== "cell") {
    const sell_value = calculateSellValue(obj, tile);
    stats.set(
      "Sells for",
      `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(Math.max(0, sell_value))}`
    );
  }
  if (obj.category === "particle_accelerator") {
    stats.set("EP Chance", `${fmt(tile.display_chance, 2)}%`);
    stats.set(
      "EP Heat %",
      `${fmt(tile.display_chance_percent_of_total, 2)}% of max`
    );
  }
}

export function getDetailedStats(obj, tile, game) {
  const stats = new Map();
  setMaxOrLockedStatus(stats, obj, game);
  setHeatAndSegmentStats(stats, obj, tile, game);
  setTransferSellAndEpStats(stats, obj, tile);
  return stats;
}

export function calculateSellValue(obj, tile) {
  let sell_value = obj.cost;
  if (obj.ticks > 0) {
    sell_value = Math.ceil((tile.ticks / obj.ticks) * obj.cost);
  } else if (obj.containment > 0) {
    sell_value =
      obj.cost -
      Math.ceil((tile.heat_contained / obj.containment) * obj.cost);
  }
  return sell_value;
}
